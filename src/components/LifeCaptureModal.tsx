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

// ─── Speech Recognition hook ─────────────────────────────────────────────────

function useSpeechRecognition(onResult: (t: string) => void) {
  const recogRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      setSupported(true);
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      r.onresult = (e: any) => {
        const transcript = Array.from(e.results as any[])
          .map((res: any) => res[0].transcript)
          .join("");
        onResult(transcript);
      };
      r.onend = () => setListening(false);
      recogRef.current = r;
    }
  }, [onResult]);

  const start = useCallback(() => {
    if (recogRef.current) { recogRef.current.start(); setListening(true); }
  }, []);

  const stop = useCallback(() => {
    if (recogRef.current) { recogRef.current.stop(); setListening(false); }
  }, []);

  return { listening, supported, start, stop };
}

// ─── Plan Preview Card ────────────────────────────────────────────────────────

function PlanPreview({ event }: { event: LifeEvent }) {
  const meta = INTENT_META[event.intent] || INTENT_META.event_prep;
  const done = event.tasks.filter(t => t.status === "completed").length;
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          {meta.icon}{meta.label}
        </span>
        <span style={{ fontSize: 11, color: "#64748B" }}>{formatDate(event.event_date)}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0", lineHeight: 1.3 }}>{event.title}</div>

      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 4, overflow: "hidden" }}>
          <div style={{ width: `${event.tasks.length ? (done / event.tasks.length) * 100 : 0}%`, background: meta.color, height: "100%", borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 10, color: "#64748B", whiteSpace: "nowrap" }}>{done}/{event.tasks.length} tasks</span>
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {event.tasks.map(task => (
          <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: task.priority === "high" ? "#E74C3C" : task.priority === "medium" ? "#F39C12" : "#27AE60", marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.4 }}>{task.title}</div>
              {task.due_date && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{relDue(task.due_date)}</div>}
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

  const handleVoiceResult = useCallback((t: string) => setText(t), []);
  const { listening, supported, start, stop } = useSpeechRecognition(handleVoiceResult);

  // Focus textarea on open
  useEffect(() => {
    if (open && step === "input") {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, step]);

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
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #4A8FC2, #7C3AED)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(74,143,194,0.4), 0 0 0 0 rgba(74,143,194,0.3)",
          animation: "pulse-ring 2.5s ease infinite",
          transition: "transform 0.2s ease",
        }}
        title="Tell Wardyn about your life"
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        <IconBrain size={22} color="#fff" />
      </button>

      {/* Modal Overlay */}
      {open && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
          animation: "fadeIn 0.2s ease",
        }}>
          <div style={{
            width: "100%", maxWidth: 560,
            background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))",
            borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,143,194,0.2)",
            padding: 24, display: "flex", flexDirection: "column", gap: 16,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #4A8FC2, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconBrain size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0" }}>Tell Wardyn</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>Voice or type anything about your life</div>
                </div>
              </div>
              <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: 4, borderRadius: 6, display: "flex" }}>
                <IconX size={18} />
              </button>
            </div>

            {/* Step: Input */}
            {step === "input" && (
              <>
                {/* Textarea */}
                <div style={{ position: "relative" }}>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                    placeholder="I have an event next week... / I need to start studying for my exam... / Planning a trip..."
                    rows={4}
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${listening ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 12, color: "#E2E8F0", fontSize: 13,
                      padding: "12px 14px", resize: "none", fontFamily: "inherit",
                      outline: "none", lineHeight: 1.6,
                      transition: "border-color 0.2s",
                      boxSizing: "border-box",
                    }}
                  />
                  {listening && (
                    <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", animation: "blink 1s ease infinite" }} />
                      <span style={{ fontSize: 10, color: "#EF4444" }}>Recording</span>
                    </div>
                  )}
                </div>

                {/* Examples */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Examples</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {examples.map((ex, i) => (
                      <button key={i} onClick={() => setText(ex)} style={{
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6, padding: "4px 9px", fontSize: 10, color: "#94A3B8",
                        cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(74,143,194,0.1)"; e.currentTarget.style.color = "#4A8FC2"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#94A3B8"; }}>
                        {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                    <IconAlertCircle size={14} color="#EF4444" />
                    <span style={{ fontSize: 12, color: "#EF4444" }}>{error}</span>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Voice Button */}
                  {supported && (
                    <button onClick={listening ? stop : start} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                      borderRadius: 10, border: `1px solid ${listening ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
                      background: listening ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)",
                      color: listening ? "#EF4444" : "#94A3B8", cursor: "pointer", fontSize: 12, fontWeight: 500,
                      transition: "all 0.2s",
                    }}>
                      {listening ? <IconMicrophoneOff size={14} /> : <IconMicrophone size={14} />}
                      {listening ? "Stop" : "Voice"}
                    </button>
                  )}
                  <button onClick={handleSubmit} disabled={!text.trim()} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "9px 16px", borderRadius: 10, border: "none",
                    background: text.trim() ? "linear-gradient(135deg, #4A8FC2, #7C3AED)" : "rgba(255,255,255,0.06)",
                    color: text.trim() ? "#fff" : "#475569", cursor: text.trim() ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 600, transition: "all 0.2s",
                  }}>
                    <IconSend size={14} />
                    Generate Plan  <span style={{ fontSize: 10, opacity: 0.7 }}>⌘↵</span>
                  </button>
                </div>
              </>
            )}

            {/* Step: Processing */}
            {step === "processing" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg, #4A8FC2, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconLoader2 size={24} color="#fff" className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 }}>Building your plan…</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>Ollama is parsing your input and creating tasks & reminders</div>
                </div>
              </div>
            )}

            {/* Step: Preview */}
            {step === "preview" && result && (
              <>
                <div style={{ fontSize: 12, color: "#34D399", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconCheck size={14} />
                  Plan created! Tasks and reminders have been scheduled.
                </div>
                <PlanPreview event={result} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setStep("input"); setText(""); setResult(null); }} style={{
                    flex: 1, padding: "9px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", cursor: "pointer", fontSize: 12, fontWeight: 500,
                  }}>
                    + Add Another
                  </button>
                  <button onClick={handleDone} style={{
                    flex: 1, padding: "9px 14px", borderRadius: 10,
                    background: "linear-gradient(135deg, #4A8FC2, #7C3AED)", border: "none",
                    color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}>
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
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>
    </>
  );
}
