import React, { useState, useRef, useEffect } from "react";
import {
  IconBrain,
  IconX,
  IconCheck,
  IconLoader2,
  IconCalendarEvent,
  IconBook,
  IconRocket,
  IconTarget,
  IconPlaneDeparture,
  IconClockHour4,
  IconSend,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import type { LifeEvent } from "../types/queue";
// ─── Intent meta ─────────────────────────────────────────────────────────────

const INTENT_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  event_prep: {
    icon: <IconCalendarEvent size={12} />,
    label: "Event Prep",
    color: "#4A8FC2",
  },
  study_plan: {
    icon: <IconBook size={12} />,
    label: "Study Plan",
    color: "#9B59B6",
  },
  project_kickoff: {
    icon: <IconRocket size={12} />,
    label: "Project",
    color: "#E8823D",
  },
  habit_goal: {
    icon: <IconTarget size={12} />,
    label: "Habit Goal",
    color: "#34D399",
  },
  deadline: {
    icon: <IconClockHour4 size={12} />,
    label: "Deadline",
    color: "#E8A23D",
  },
  travel: {
    icon: <IconPlaneDeparture size={12} />,
    label: "Travel",
    color: "#4ECDC4",
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function relDue(iso: string | null) {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

// ─── Plan Preview Card ────────────────────────────────────────────────────────

function PlanPreview({ event }: { event: LifeEvent }) {
  const meta = INTENT_META[event.intent] || INTENT_META.event_prep;
  const done = event.tasks.filter((t) => t.status === "completed").length;
  const pct = event.tasks.length ? (done / event.tasks.length) * 100 : 0;

  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/10 px-[18px] py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border"
          style={{
            background: `${meta.color}20`,
            color: meta.color,
            borderColor: `${meta.color}40`,
          }}
        >
          {meta.icon}
          {meta.label}
        </span>
        <span className="text-[11px] text-[#64748B]">
          {formatDate(event.event_date)}
        </span>
      </div>
      <div className="text-[15px] font-semibold text-[#E2E8F0] leading-snug">
        {event.title}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/[0.08] rounded-full h-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-[400ms] ease-in-out"
            style={{ width: `${pct}%`, background: meta.color }}
          />
        </div>
        <span className="text-[10px] text-[#64748B] whitespace-nowrap">
          {done}/{event.tasks.length} tasks
        </span>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-1.5">
        {event.tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-2 px-2 py-1.5 bg-white/[0.03] rounded-lg"
          >
            <div
              className="w-2 h-2 rounded-full mt-1 shrink-0"
              style={{
                background:
                  task.priority === "high"
                    ? "#E74C3C"
                    : task.priority === "medium"
                      ? "#F39C12"
                      : "#27AE60",
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#CBD5E1] leading-snug">
                {task.title}
              </div>
              {task.due_date && (
                <div className="text-[10px] text-[#64748B] mt-0.5">
                  {relDue(task.due_date)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────────────

export function LifeCaptureModal() {
  const { captureLifeEvent, askClarification } = useQueueStore();
  const ollamaModels = useQueueStore((s) => s.ollamaModels);
  const ollamaChecked = useQueueStore((s) => s.ollamaChecked);
  const ollamaOnline = ollamaChecked && ollamaModels.length > 0;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LifeEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<
    "input" | "clarifying" | "clarify" | "processing" | "preview"
  >("input");

  // Clarification state
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const textBytes = new TextEncoder().encode(text).length;
  const isOverLimit = textBytes > 50 * 1024;
  const isNearLimit = textBytes > 40 * 1024;

  useEffect(() => {
    if (open && step === "input") {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, step]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setText("");
        setResult(null);
        setError(null);
        setStep("input");
        setQuestions([]);
        setAnswers([]);
      }, 300);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!text.trim() || isOverLimit) return;
    setError(null);

    if (ollamaOnline) {
      // Ask Ollama if it needs clarification first
      setStep("clarifying");
      try {
        const qs = await askClarification(text.trim());
        if (qs.length > 0) {
          setQuestions(qs);
          setAnswers(new Array(qs.length).fill(""));
          setStep("clarify");
          return;
        }
      } catch {
        // silently skip clarification on error
      }
    }

    // No questions needed — go straight to plan generation
    await generatePlan(text.trim());
  };

  const handleClarifySubmit = async () => {
    // Append non-empty answers to the original text
    const extras = questions
      .map((q, i) => (answers[i]?.trim() ? `${q} ${answers[i].trim()}` : ""))
      .filter(Boolean)
      .join(". ");
    const enriched = extras
      ? `${text.trim()}. Additional context: ${extras}`
      : text.trim();
    await generatePlan(enriched);
  };

  const handleSkipClarify = async () => {
    await generatePlan(text.trim());
  };

  const generatePlan = async (finalText: string) => {
    setStep("processing");
    try {
      const evt = await captureLifeEvent(finalText);
      if (evt) {
        setResult(evt);
        setStep("preview");
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setStep("input");
    }
  };

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
          <div
            className="w-full max-w-[560px] bg-gradient-to-br from-[rgba(15,23,42,0.98)] to-[rgba(30,41,59,0.98)]
            rounded-[20px] border border-white/10
            shadow-[0_25px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(74,143,194,0.2)]
            p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] flex items-center justify-center shrink-0">
                  <IconBrain size={18} color="#fff" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-[#E2E8F0] flex items-center gap-2">
                    Tell Wardyn
                    {!ollamaOnline && (
                      <span className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)] uppercase tracking-wider">
                        ⚡ AI offline
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    {ollamaOnline
                      ? "Type anything about your life plans"
                      : "Using rule-based parser fallback"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="bg-transparent border-none cursor-pointer text-[#64748B] hover:text-[#94A3B8] p-1 rounded-md flex items-center justify-center transition-colors"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Step: Input */}
            {step === "input" && (
              <>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                        handleSubmit();
                    }}
                    placeholder="I have an event next week... / I need to start studying for my exam... / Planning a trip..."
                    rows={4}
                    className={`w-full bg-white/[0.05] border rounded-xl text-[#E2E8F0] text-[13px]
                      px-3.5 py-3 resize-none font-[inherit] outline-none leading-relaxed
                      transition-colors duration-200 box-border ${
                        isOverLimit
                          ? "border-[#EF4444] focus:border-[#EF4444]"
                          : isNearLimit
                            ? "border-[#E8A23D] focus:border-[#E8A23D]"
                            : "border-white/10 focus:border-white/20"
                      }`}
                  />
                  {text && (
                    <div className="absolute bottom-2.5 right-2.5 text-[9px] font-mono text-[#475569]">
                      ⌘↵ to submit
                    </div>
                  )}
                </div>

                {isOverLimit && (
                  <div className="flex items-center gap-2 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-xl px-3.5 py-2.5">
                    <IconAlertCircle
                      size={15}
                      color="#EF4444"
                      className="shrink-0"
                    />
                    <span className="text-xs text-[#EF4444] font-medium">
                      Content is too large ({(textBytes / 1024).toFixed(1)} KB).
                      Soft limit is 50 KB.
                    </span>
                  </div>
                )}

                {isNearLimit && !isOverLimit && (
                  <div className="text-[10px] text-[#E8A23D] font-mono">
                    ⚠️ Approaching limit: {(textBytes / 1024).toFixed(1)} KB /
                    50 KB
                  </div>
                )}

                {!text && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-[#475569] uppercase tracking-[0.08em] font-semibold">
                      Examples
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {examples.map((ex, i) => (
                        <button
                          key={i}
                          onClick={() => setText(ex)}
                          className="bg-white/[0.04] hover:bg-[rgba(74,143,194,0.1)] border border-white/[0.08]
                            rounded-md px-2 py-1 text-[10px] text-[#94A3B8] hover:text-[#4A8FC2]
                            cursor-pointer text-left transition-all duration-150"
                        >
                          {ex.length > 55 ? ex.slice(0, 55) + "\u2026" : ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-xl px-3.5 py-2.5">
                    <IconAlertCircle
                      size={15}
                      color="#EF4444"
                      className="shrink-0"
                    />
                    <span className="text-xs text-[#EF4444] font-medium">
                      {error}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!text.trim() || isOverLimit}
                  className={`w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-none
                    text-[13px] font-semibold transition-all duration-200
                    ${
                      text.trim() && !isOverLimit
                        ? "bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] text-white cursor-pointer hover:opacity-95"
                        : "bg-white/[0.06] text-[#475569] cursor-not-allowed"
                    }`}
                >
                  <IconSend size={14} />
                  Generate Plan&nbsp;
                  <span className="text-[10px] opacity-70">⌘↵</span>
                </button>
              </>
            )}

            {/* Step: Clarifying (checking with AI) */}
            {step === "clarifying" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-10 h-10 rounded-full bg-[rgba(74,143,194,0.15)] border border-[rgba(74,143,194,0.25)] flex items-center justify-center">
                  <IconLoader2
                    size={20}
                    color="#4A8FC2"
                    className="animate-spin"
                  />
                </div>
                <p className="text-xs text-[#64748B] text-center">
                  Checking if more context would help…
                </p>
              </div>
            )}

            {/* Step: Clarify — follow-up questions */}
            {step === "clarify" && (
              <>
                <div className="space-y-1.5">
                  <p className="text-[12px] text-[#94A3B8] leading-relaxed">
                    A couple of quick questions to make this more actionable:
                  </p>
                  <div className="bg-[rgba(15,23,42,0.6)] rounded-xl border border-white/[0.07] px-3 py-2 text-[11px] text-[#64748B] italic truncate">
                    "{text.length > 80 ? text.slice(0, 80) + "…" : text}"
                  </div>
                </div>

                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[#C8D6E5] flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-[rgba(74,143,194,0.2)] text-[#4A8FC2] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {q}
                      </label>
                      <input
                        type="text"
                        value={answers[i]}
                        onChange={(e) => {
                          const next = [...answers];
                          next[i] = e.target.value;
                          setAnswers(next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && i === questions.length - 1)
                            handleClarifySubmit();
                        }}
                        placeholder="Your answer (or leave blank to skip)"
                        autoFocus={i === 0}
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl text-[#E2E8F0]
                          text-[12px] px-3.5 py-2.5 outline-none font-[inherit] transition-colors
                          focus:border-white/20 placeholder-[#475569]"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSkipClarify}
                    className="flex-[0.4] px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]
                      text-[#64748B] text-[12px] cursor-pointer hover:bg-white/[0.07] hover:text-[#94A3B8] transition-all"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={handleClarifySubmit}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                      bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] border-none
                      text-white text-[13px] font-semibold cursor-pointer hover:opacity-95 transition-opacity"
                  >
                    <IconSend size={14} />
                    Generate Plan
                  </button>
                </div>
              </>
            )}

            {/* Step: Processing */}
            {step === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#4A8FC2] to-[#7C3AED] flex items-center justify-center">
                  <IconLoader2
                    size={24}
                    color="#fff"
                    className="animate-spin"
                  />
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-[#E2E8F0] mb-1">
                    Building your plan…
                  </div>
                  <div className="text-xs text-[#64748B]">
                    {ollamaOnline
                      ? "Ollama is parsing your input and creating tasks & reminders"
                      : "⚡ AI offline — using smart fallback to build your plan"}
                  </div>
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
                    onClick={() => {
                      setStep("input");
                      setText("");
                      setResult(null);
                    }}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10
                      text-[#94A3B8] cursor-pointer text-xs font-medium hover:bg-white/[0.08] transition-colors"
                  >
                    + Add Another
                  </button>
                  <button
                    onClick={() => setOpen(false)}
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
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>
    </>
  );
}
