import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  IconMicrophone, IconMicrophoneOff, IconBrain, IconX, IconCheck, IconLoader2,
  IconCalendarEvent, IconBook, IconRocket, IconTarget, IconPlaneDeparture,
  IconClockHour4, IconSend, IconAlertCircle
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import type { LifeEvent } from "../types/queue";

// ─── Intent meta ─────────────────────────────────────────────────────────────

const INTENT_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  event_prep:      { icon: <IconCalendarEvent size={12} />, label: "Event Prep",    color: "#4A8FC2" },
  study_plan:      { icon: <IconBook size={12} />,          label: "Study Plan",    color: "#9B59B6" },
  project_kickoff: { icon: <IconRocket size={12} />,        label: "Project",       color: "#E8823D" },
  habit_goal:      { icon: <IconTarget size={12} />,        label: "Habit Goal",    color: "#34D399" },
  deadline:        { icon: <IconClockHour4 size={12} />,    label: "Deadline",      color: "#E8A23D" },
  travel:          { icon: <IconPlaneDeparture size={12} />,label: "Travel",        color: "#4ECDC4" },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function relDue(iso: string | null) {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

// ─── Speech Recognition & Microphone Hook ────────────────────────────────────
// Uses MediaRecorder to capture audio in chunks, then sends each chunk to the
// Tauri backend which transcribes via Ollama Whisper — no webkitSpeechRecognition
// (which is blocked on http:// in WKWebView).

function useSpeechRecognition(onResult: (t: string) => void) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const shouldListenRef = useRef(false);
  const accumulatedRef = useRef("");
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    setListening(false);
    setVolume(0);
  }, []);

  const transcribeChunk = useCallback(async (blob: Blob) => {
    if (blob.size < 500) return; // skip near-empty chunks (silence)
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const { invoke } = await import("@tauri-apps/api/core");
      const text: string = await invoke("transcribe_audio_command", {
        audioBytes: Array.from(uint8),
        mimeType: blob.type || "audio/webm",
      });
      if (text && text.trim()) {
        accumulatedRef.current = (accumulatedRef.current + " " + text).trim();
        onResultRef.current(accumulatedRef.current);
      }
    } catch (err: any) {
      console.warn("Transcription error:", err);
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setVolume(0);
    accumulatedRef.current = "";

    // 1. Request mic permission via native macOS API first (like notifications do).
    //    This triggers the system permission dialog if not yet decided.
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const status: string = await invoke("request_microphone_permission_command");
        if (status === "denied") {
          setError("Microphone access denied. Go to System Settings → Privacy & Security → Microphone and enable Wardyn.");
          return;
        }
      }
    } catch {
      // Non-Tauri env or Swift unavailable — proceed and let getUserMedia handle it
    }

    // 2. Request mic stream from WebKit — permission should now be granted above
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Whisper works best at 16kHz
        }
      });
      mediaStreamRef.current = stream;
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone permission denied. Go to System Settings → Privacy → Microphone and enable Wardyn.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found. Connect a microphone and try again.");
      } else {
        setError(`Microphone unavailable: ${err.message}`);
      }
      return;
    }

    // 2. Watch for track ending unexpectedly (macOS permission revoked mid-session)
    //    Use a grace period so the handler doesn't fire during initial track setup.
    const trackStartTime = Date.now();
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        // Ignore if track ended within 2s of starting — that's a setup/permission
        // race in dev mode, not a real mid-session interruption
        const age = Date.now() - trackStartTime;
        if (age < 2000) return;
        if (shouldListenRef.current) {
          setError("Microphone access was interrupted. Check System Settings → Privacy → Microphone.");
          stop();
        }
      };
    });

    // 3. Volume visualizer
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!shouldListenRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setVolume(Math.min(100, Math.round((avg / 128) * 100)));
          requestAnimationFrame(tick);
        };
        tick();
      }
    } catch { /* visualizer optional */ }

    // 4. Pick best MIME type — wav is most compatible with Whisper
    const mimeType = [
      "audio/wav",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find(m => MediaRecorder.isTypeSupported(m)) || "";

    // 5. Start recording — 4s slices for responsive transcription feedback
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      // Fallback: let browser pick the format
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        transcribeChunk(e.data);
      }
    };

    recorder.onerror = (e: any) => {
      console.warn("MediaRecorder error:", e);
      setError("Recording error. Please try again.");
      stop();
    };

    shouldListenRef.current = true;
    setListening(true);
    recorder.start(4000); // 4s slices — faster feedback than 8s
  }, [transcribeChunk, stop]);

  return { listening, supported, error, volume, start, stop };
}

// ─── Plan Preview Card ────────────────────────────────────────────────────────

function PlanPreview({ event }: { event: LifeEvent }) {
  const meta = INTENT_META[event.intent] || INTENT_META.event_prep;
  const done = event.tasks.filter(t => t.status === "completed").length;
  const pct = event.tasks.length ? (done / event.tasks.length) * 100 : 0;

  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/10 px-[18px] py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border"
          style={{ background: `${meta.color}20`, color: meta.color, borderColor: `${meta.color}40` }}
        >
          {meta.icon}{meta.label}
        </span>
        <span className="text-[11px] text-[#64748B]">{formatDate(event.event_date)}</span>
      </div>
      <div className="text-[15px] font-semibold text-[#E2E8F0] leading-snug">{event.title}</div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/[0.08] rounded-full h-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-[400ms] ease-in-out"
            style={{ width: `${pct}%`, background: meta.color }}
          />
        </div>
        <span className="text-[10px] text-[#64748B] whitespace-nowrap">{done}/{event.tasks.length} tasks</span>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-1.5">
        {event.tasks.map(task => (
          <div key={task.id} className="flex items-start gap-2 px-2 py-1.5 bg-white/[0.03] rounded-lg">
            <div
              className="w-2 h-2 rounded-full mt-1 shrink-0"
              style={{ background: task.priority === "high" ? "#E74C3C" : task.priority === "medium" ? "#F39C12" : "#27AE60" }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#CBD5E1] leading-snug">{task.title}</div>
              {task.due_date && <div className="text-[10px] text-[#64748B] mt-0.5">{relDue(task.due_date)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────────────

export function LifeCaptureModal() {
  const { captureLifeEvent } = useQueueStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LifeEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "processing" | "preview">("input");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Whisper readiness check ───────────────────────────────────────────────
  const [whisperReady, setWhisperReady] = useState<boolean | null>(null); // null = unchecked

  useEffect(() => {
    if (!open || whisperReady !== null) return;
    const check = async () => {
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        setWhisperReady(false);
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ installed: boolean; ollama_running: boolean }>("check_whisper_status_command");
        setWhisperReady(result.installed && result.ollama_running);
      } catch {
        setWhisperReady(false);
      }
    };
    check();
  }, [open, whisperReady]);

  const handleVoiceResult = useCallback((t: string) => setText(t), []);
  const { listening, supported, error: micError, volume, start, stop } = useSpeechRecognition(handleVoiceResult);

  // When recording stops, if we have text, keep it ready for review — don't auto-submit
  // so user can verify before generating plan
  const handleStopRecording = useCallback(() => {
    stop();
  }, [stop]);

  // Errors shown inline per mode (recording vs text)

  // Focus textarea on open (only when not recording)
  useEffect(() => {
    if (open && step === "input" && !listening) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, step, listening]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => { setText(""); setResult(null); setError(null); setStep("input"); }, 300);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setStep("processing");
    setError(null);
    try {
      const evt = await captureLifeEvent(text.trim());
      if (evt) { setResult(evt); setStep("preview"); }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setStep("input");
    }
  };

  const handleClose = () => { if (listening) stop(); setOpen(false); };
  const handleDone = () => handleClose();

  const examples = [
    "I have a product demo next Friday and need to prepare slides and a dry run",
    "I need to start studying for my algorithms exam starting next month",
    "Planning a trip to London next week — flights, accommodation, agenda",
    "I want to exercise 3x a week starting this Monday",
  ];

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[200] w-[52px] h-[52px] rounded-full
          bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] border-none cursor-pointer
          flex items-center justify-center
          shadow-[0_4px_20px_rgba(74,143,194,0.4)] hover:scale-110
          transition-transform duration-200 animate-[pulse-ring_2.5s_ease_infinite]"
        title="Tell Wardyn about your life"
      >
        <IconBrain size={22} color="#fff" />
      </button>

      {/* Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-xl flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease]">
          <div className="w-full max-w-[560px] bg-gradient-to-br from-[rgba(15,23,42,0.98)] to-[rgba(30,41,59,0.98)]
            rounded-[20px] border border-white/10
            shadow-[0_25px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(74,143,194,0.2)]
            p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] flex items-center justify-center shrink-0">
                  <IconBrain size={18} color="#fff" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-[#E2E8F0]">Tell Wardyn</div>
                  <div className="text-[11px] text-[#64748B]">Voice or type anything about your life</div>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="bg-transparent border-none cursor-pointer text-[#64748B] hover:text-[#94A3B8] p-1 rounded-md flex items-center justify-center transition-colors"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Step: Input */}
            {step === "input" && (
              <>
                {/* ── Voice recording mode — full-screen live transcription display ── */}
                {listening ? (
                  <div className="flex flex-col gap-4">
                    {/* Live transcription area — read only, shows text as it arrives */}
                    <div className="relative min-h-[120px] rounded-xl border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.04)] px-4 py-3.5">
                      {/* Pulsing mic icon top-left */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-[#EF4444] animate-ping" />
                        <span className="text-[10px] font-mono font-semibold text-[#EF4444] tracking-widest uppercase">Listening…</span>
                        {/* Waveform bars */}
                        <div className="flex items-end gap-[3px] h-4 ml-1">
                          {[0.12, 0.20, 0.14, 0.22, 0.10, 0.18, 0.08].map((scale, i) => (
                            <div
                              key={i}
                              className="w-[3px] rounded-full bg-[#EF4444] transition-all duration-75"
                              style={{ height: `${Math.max(4, volume * scale)}px` }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Live transcript text */}
                      {text ? (
                        <p className="text-[14px] text-[#E2E8F0] leading-relaxed m-0 whitespace-pre-wrap">
                          {text}
                          {/* Blinking cursor at end */}
                          <span className="inline-block w-[2px] h-[1em] bg-[#EF4444] ml-0.5 align-middle animate-[blink_1s_ease_infinite]" />
                        </p>
                      ) : (
                        <p className="text-[13px] text-[#475569] italic m-0">
                          Start speaking — your words will appear here in real time…
                        </p>
                      )}
                    </div>

                    {/* Stop button — centered, prominent */}
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                        border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.15)] text-[#EF4444]
                        text-sm font-semibold cursor-pointer hover:bg-[rgba(239,68,68,0.25)]
                        transition-all duration-200 shadow-[0_0_16px_rgba(239,68,68,0.2)]"
                    >
                      <IconMicrophoneOff size={16} className="animate-pulse" />
                      Stop Recording
                    </button>

                    {/* Error while recording */}
                    {micError && (
                      <div className="flex items-center gap-2 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-xl px-3.5 py-2.5">
                        <IconAlertCircle size={15} color="#EF4444" className="shrink-0" />
                        <span className="text-xs text-[#EF4444] font-medium">{micError}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* ── Text input mode ── */}
                    <div className="relative">
                      <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                        placeholder="I have an event next week... / I need to start studying for my exam... / Planning a trip..."
                        rows={4}
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl text-[#E2E8F0] text-[13px]
                          px-3.5 py-3 resize-none font-[inherit] outline-none leading-relaxed
                          transition-colors duration-200 box-border focus:border-white/20"
                      />
                      {/* Show transcribed badge if text came from voice */}
                      {text && (
                        <div className="absolute bottom-2.5 right-2.5 text-[9px] font-mono text-[#475569]">
                          ⌘↵ to submit
                        </div>
                      )}
                    </div>

                    {/* Examples — only shown when not recording and no text yet */}
                    {!text && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] text-[#475569] uppercase tracking-[0.08em] font-semibold">Examples</div>
                        <div className="flex flex-wrap gap-1.5">
                          {examples.map((ex, i) => (
                            <button
                              key={i}
                              onClick={() => setText(ex)}
                              className="bg-white/[0.04] hover:bg-[rgba(74,143,194,0.1)] border border-white/[0.08]
                                rounded-md px-2 py-1 text-[10px] text-[#94A3B8] hover:text-[#4A8FC2]
                                cursor-pointer text-left transition-all duration-150"
                            >
                              {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error Banner */}
                    {(error || micError) && (
                      <div className="flex items-center gap-2 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-xl px-3.5 py-2.5">
                        <IconAlertCircle size={15} color="#EF4444" className="shrink-0" />
                        <span className="text-xs text-[#EF4444] font-medium">{error || micError}</span>
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center gap-2">
                      {/* Voice Button — gated on Whisper */}
                      {supported && (
                        whisperReady === false ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[#EF4444] text-xs shrink-0">
                            <IconMicrophoneOff size={14} />
                            <span className="whitespace-nowrap">Install Whisper in Settings</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={start}
                            disabled={whisperReady === null}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/10
                              bg-white/[0.05] text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-white/[0.08]
                              text-xs font-medium cursor-pointer transition-all duration-200
                              disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          >
                            {whisperReady === null ? (
                              <IconLoader2 size={14} className="animate-spin" />
                            ) : (
                              <IconMicrophone size={14} />
                            )}
                            {whisperReady === null ? "Checking…" : "Voice"}
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!text.trim()}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border-none
                          text-[13px] font-semibold transition-all duration-200
                          ${text.trim()
                            ? "bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] text-white cursor-pointer hover:opacity-95"
                            : "bg-white/[0.06] text-[#475569] cursor-not-allowed"}`}
                      >
                        <IconSend size={14} />
                        Generate Plan&nbsp;<span className="text-[10px] opacity-70">⌘↵</span>
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Step: Processing */}
            {step === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] flex items-center justify-center">
                  <IconLoader2 size={24} color="#fff" className="animate-spin" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-[#E2E8F0] mb-1">Building your plan…</div>
                  <div className="text-xs text-[#64748B]">Ollama is parsing your input and creating tasks &amp; reminders</div>
                </div>
              </div>
            )}

            {/* Step: Preview */}
            {step === "preview" && result && (
              <>
                <div className="text-xs text-[#34D399] flex items-center gap-1.5">
                  <IconCheck size={14} />
                  Plan created! Tasks and reminders have been scheduled.
                </div>
                <PlanPreview event={result} />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep("input"); setText(""); setResult(null); }}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10
                      text-[#94A3B8] cursor-pointer text-xs font-medium hover:bg-white/[0.08] transition-colors"
                  >
                    + Add Another
                  </button>
                  <button
                    onClick={handleDone}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED]
                      border-none text-white cursor-pointer text-[13px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    Done — View in Productivity
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 4px 20px rgba(74,143,194,0.4); }
          50% { box-shadow: 0 4px 20px rgba(74,143,194,0.6), 0 0 0 8px rgba(74,143,194,0.1); }
        }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>
    </>
  );
}
