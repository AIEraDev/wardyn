import React, { useEffect, useState } from "react";
import { IconCheckbox, IconPlus, IconClock, IconTrash, IconCheck, IconX, IconPlayerPlay, IconPlayerPause, IconCalendar, IconFlag, IconLoader2, IconBell, IconMail, IconBrain, IconCalendarEvent, IconBook, IconRocket, IconTarget, IconPlaneDeparture, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import type { Task, LifeEvent } from "../types/queue";

// ─── Task Priority Colors ────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high: { color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", label: "High" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", label: "Medium" },
  low: { color: "#10B981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", label: "Low" },
};

// ─── Task Card ───────────────────────────────────────────────────────────────
const TaskCard: React.FC<{ task: Task; onStatusChange: (id: string, status: string) => void; onDelete: (id: string) => void }> = ({ task, onStatusChange, onDelete }) => {
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
  const isCompleted = task.status === "completed";

  return (
    <div className="p-3 rounded-xl bg-[#0E1318] border hover:border-[rgba(74,143,194,0.3)] transition-colors group" style={{ borderColor: isCompleted ? "rgba(52,211,153,0.3)" : "#1D2535" }}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => onStatusChange(task.id, isCompleted ? "pending" : "completed")} className="mt-0.5 shrink-0">
          {isCompleted ? (
            <div className="w-5 h-5 rounded border-2 border-[#34D399] bg-[#34D399] flex items-center justify-center">
              <IconCheck size={14} className="text-[#0B0F16]" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded border-2 border-[#4A5568] hover:border-[#4A8FC2] transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={`text-sm font-medium m-0 ${isCompleted ? "line-through text-[#7A8492]" : "text-[#F0F4F8]"}`}>{task.title}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase border" style={{ color: priority.color, background: priority.bg, borderColor: priority.border }}>
                {priority.label}
              </span>
              <button type="button" onClick={() => onDelete(task.id)} className="p-1 rounded hover:bg-[rgba(239,68,68,0.1)] text-[#7A8492] hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100">
                <IconTrash size={14} />
              </button>
            </div>
          </div>

          {task.description && <p className="text-xs text-[#9AA4B2] m-0 mb-2">{task.description}</p>}

          {task.source_item_id && task.source_item_id !== "manual" && (
            <span className="inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded mb-2 text-[#4A8FC2] bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.25)]">
              <IconMail size={10} /> From email
            </span>
          )}

          <div className="flex items-center gap-3 text-[10px] text-[#7A8492] font-mono">
            {task.due_date && (
              <span className="flex items-center gap-1">
                <IconCalendar size={11} />
                {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <IconClock size={11} />
              Created {new Date(task.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            {isCompleted && task.completed_at && (
              <span className="flex items-center gap-1 text-[#34D399]">
                <IconCheck size={11} />
                Done {new Date(task.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Pomodoro Timer ──────────────────────────────────────────────────────────
const PomodoroTimer: React.FC = () => {
  const { activePomodoroSession, startPomodoro, completePomodoro } = useQueueStore();
  const [timeLeft, setTimeLeft] = useState(0);
  const [customDuration, setCustomDuration] = useState(25);

  useEffect(() => {
    if (!activePomodoroSession) {
      setTimeLeft(0);
      return;
    }

    const endTime = new Date(activePomodoroSession.started_at).getTime() + activePomodoroSession.duration_minutes * 60 * 1000;
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activePomodoroSession]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = activePomodoroSession ? ((activePomodoroSession.duration_minutes * 60 - timeLeft) / (activePomodoroSession.duration_minutes * 60)) * 100 : 0;

  return (
    <div className="p-5 rounded-xl bg-gradient-to-br from-[#0E1318] to-[#141B24] border border-[rgba(232,162,61,0.25)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border border-[rgba(232,162,61,0.3)]">
            <IconClock size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F0F4F8] m-0">🍅 Pomodoro Timer</h3>
            <p className="font-mono text-[10px] text-[#7A8492] m-0">Deep focus work sessions</p>
          </div>
        </div>
      </div>

      {!activePomodoroSession ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="number" value={customDuration} onChange={(e) => setCustomDuration(Math.max(1, Math.min(60, parseInt(e.target.value) || 25)))} className="w-20 bg-[#0B0F16] text-sm text-[#F0F4F8] p-2 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#E8A23D] text-center font-mono" min={1} max={60} />
            <span className="text-xs text-[#9AA4B2]">minutes</span>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => startPomodoro(undefined, customDuration)} className="flex-1 px-4 py-2.5 bg-[#E8A23D] text-black text-sm font-semibold rounded-lg hover:bg-[#f0b254] transition-colors flex items-center justify-center gap-2">
              <IconPlayerPlay size={16} />
              Start Focus Session
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setCustomDuration(25);
                startPomodoro(undefined, 25);
              }}
              className="flex-1 px-3 py-1.5 bg-[#181E27] text-xs text-[#9AA4B2] rounded-md border border-[#242B35] hover:text-[#F0F4F8] hover:border-[#E8A23D] transition-colors"
            >
              25 min
            </button>
            <button
              onClick={() => {
                setCustomDuration(50);
                startPomodoro(undefined, 50);
              }}
              className="flex-1 px-3 py-1.5 bg-[#181E27] text-xs text-[#9AA4B2] rounded-md border border-[#242B35] hover:text-[#F0F4F8] hover:border-[#E8A23D] transition-colors"
            >
              50 min
            </button>
            <button
              onClick={() => {
                setCustomDuration(5);
                startPomodoro(undefined, 5);
              }}
              className="flex-1 px-3 py-1.5 bg-[#181E27] text-xs text-[#9AA4B2] rounded-md border border-[#242B35] hover:text-[#F0F4F8] hover:border-[#E8A23D] transition-colors"
            >
              5 min break
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold font-mono text-[#E8A23D] mb-1">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
            <p className="text-xs text-[#9AA4B2]">{activePomodoroSession.duration_minutes} minute session</p>
          </div>

          <div className="relative h-2 bg-[#1D2535] rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#E8A23D] transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>

          <button type="button" onClick={() => completePomodoro(activePomodoroSession.id)} className="w-full px-4 py-2 bg-[#181E27] text-sm text-[#E8A23D] rounded-lg border border-[rgba(232,162,61,0.3)] hover:bg-[rgba(232,162,61,0.1)] transition-colors flex items-center justify-center gap-2">
            <IconPlayerPause size={16} />
            End Session
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Life Plans Section ───────────────────────────────────────────────────────

const INTENT_META_P: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  event_prep:      { icon: <IconCalendarEvent size={12} />, label: "Event Prep",    color: "#4A8FC2" },
  study_plan:      { icon: <IconBook size={12} />,          label: "Study Plan",    color: "#9B59B6" },
  project_kickoff: { icon: <IconRocket size={12} />,        label: "Project",       color: "#E8823D" },
  habit_goal:      { icon: <IconTarget size={12} />,        label: "Habit Goal",    color: "#34D399" },
  deadline:        { icon: <IconClock size={12} />,         label: "Deadline",      color: "#E8A23D" },
  travel:          { icon: <IconPlaneDeparture size={12} />,label: "Travel",        color: "#4ECDC4" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}

function relDue2(iso: string | null) {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

interface LifePlansSectionProps {
  lifeEvents: LifeEvent[];
  onStatusChange: (id: string, status: string) => void;
  onTaskComplete: (taskId: string) => void;
}

function LifePlansSection({ lifeEvents, onStatusChange, onTaskComplete }: LifePlansSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!lifeEvents.length) return null;
  const toggle = (id: string) => setExpanded(s => ({ ...s, [id]: !s[id] }));

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <IconBrain size={15} className="text-[#4A8FC2]" />
        <span className="font-mono text-xs font-semibold text-[#7A8492] uppercase tracking-widest">Life Plans</span>
        <span className="font-mono text-[10px] bg-[rgba(74,143,194,0.1)] text-[#4A8FC2] px-2 py-0.5 rounded border border-[rgba(74,143,194,0.3)]">{lifeEvents.filter(e => e.status === "active").length} active</span>
      </div>
      <div className="flex flex-col gap-3">
        {lifeEvents.map(evt => {
          const meta = INTENT_META_P[evt.intent] || INTENT_META_P.event_prep;
          const done = evt.tasks.filter(t => t.status === "completed").length;
          const total = evt.tasks.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const isOpen = expanded[evt.id] ?? true;
          return (
            <div key={evt.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, border: `1px solid ${pct === 100 ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.08)"}`, overflow: "hidden" }}>
              {/* Event Header */}
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => toggle(evt.id)}>
                <span style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40`, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  {meta.icon}{meta.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: pct === 100 ? "#34D399" : "#E2E8F0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evt.title}</span>
                {evt.event_date && <span style={{ fontSize: 10, color: "#64748B", flexShrink: 0 }}>{fmtDate(evt.event_date)}</span>}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: pct === 100 ? "#34D399" : "#94A3B8" }}>{done}/{total}</span>
                  <div style={{ width: 48, background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 3 }}>
                    <div style={{ width: `${pct}%`, background: pct === 100 ? "#34D399" : meta.color, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                  </div>
                  {isOpen ? <IconChevronUp size={13} color="#475569" /> : <IconChevronDown size={13} color="#475569" />}
                </div>
              </div>
              {/* Task List */}
              {isOpen && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 14px 12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {evt.tasks.map(task => (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 8, background: task.status === "completed" ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.02)" }}>
                        <button onClick={() => task.status !== "completed" && onTaskComplete(task.id)} style={{
                          width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${task.status === "completed" ? "#34D399" : "rgba(255,255,255,0.2)"}`,
                          background: task.status === "completed" ? "rgba(52,211,153,0.2)" : "transparent", cursor: task.status === "completed" ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {task.status === "completed" && <IconCheck size={10} color="#34D399" />}
                        </button>
                        <span style={{ flex: 1, fontSize: 12, color: task.status === "completed" ? "#475569" : "#CBD5E1", textDecoration: task.status === "completed" ? "line-through" : "none" }}>{task.title}</span>
                        {task.due_date && <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>{relDue2(task.due_date)}</span>}
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: task.priority === "high" ? "#E74C3C" : task.priority === "medium" ? "#F39C12" : "#27AE60", flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                  {pct === 100 && (
                    <button onClick={() => onStatusChange(evt.id, "completed")} style={{ marginTop: 10, width: "100%", padding: "6px", borderRadius: 8, border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.1)", color: "#34D399", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                      ✅ Mark Event Complete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Productivity Tab ──────────────────────────────────────────────────
export const ProductivityTab: React.FC = () => {
  const { tasks, reminders, fetchTasks, fetchReminders, createTask, createReminder, updateTaskStatus, deleteTask, deleteReminder, snoozeReminder, pomodoroSessions, fetchPomodoroSessions, lifeEvents, fetchLifeEvents, updateLifeEventStatus } = useQueueStore();

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "completed" | "from_email">("all");
  const [creating, setCreating] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [creatingReminder, setCreatingReminder] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchReminders();
    fetchPomodoroSessions(30);
    fetchLifeEvents();
  }, [fetchTasks, fetchReminders, fetchPomodoroSessions, fetchLifeEvents]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setCreating(true);
    await createTask(taskTitle.trim(), taskDescription.trim() || undefined, undefined, taskDueDate || undefined, taskPriority);
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskPriority("medium");
    setShowTaskForm(false);
    setCreating(false);
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderMessage.trim() || !reminderDate) return;

    const scheduledAt = new Date(reminderDate);
    if (scheduledAt.getTime() <= Date.now()) {
      useQueueStore.getState().showStatusMessage("error", "Reminder must be scheduled in the future.");
      return;
    }

    setCreatingReminder(true);
    const isoDate = scheduledAt.toISOString();
    await createReminder("manual", isoDate, reminderMessage.trim());
    setReminderMessage("");
    setReminderDate("");
    setShowReminderForm(false);
    setCreatingReminder(false);
  };

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "pending") return t.status === "pending";
    if (taskFilter === "completed") return t.status === "completed";
    if (taskFilter === "from_email") return Boolean(t.source_item_id && t.source_item_id !== "manual");
    return true;
  });

  const fromEmailCount = tasks.filter((t) => t.source_item_id && t.source_item_id !== "manual").length;

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const completedToday = tasks.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()).length;

  const pomodorosToday = pomodoroSessions.filter((s) => s.completed && new Date(s.started_at).toDateString() === new Date().toDateString()).length;

  const handleSnoozeReminder = async (reminderId: string, reminderDate: string, hours: number) => {
    const next = new Date(reminderDate);
    next.setHours(next.getHours() + hours);
    if (next.getTime() <= Date.now()) {
      next.setTime(Date.now() + hours * 60 * 60 * 1000);
    }
    await snoozeReminder(reminderId, next.toISOString());
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0 flex items-center gap-2">
            <IconCheckbox size={20} className="text-[#4A8FC2]" />
            Productivity Hub
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Task management · Pomodoro · Follow-up reminders</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-[rgba(245,158,11,0.1)] text-[#F59E0B] px-2 py-1 rounded border border-[rgba(245,158,11,0.3)]">{pendingCount} pending</span>
          <span className="font-mono text-[10px] bg-[rgba(52,211,153,0.1)] text-[#34D399] px-2 py-1 rounded border border-[rgba(52,211,153,0.3)]">{completedToday} done today</span>
        </div>
      </div>

      {/* ─ Life Plans ─────────────────────────────────────────────────────────────── */}
      <LifePlansSection
        lifeEvents={lifeEvents}
        onStatusChange={updateLifeEventStatus}
        onTaskComplete={async (taskId) => { await updateTaskStatus(taskId, "completed"); await fetchLifeEvents(); }}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-[#151A21] border border-[#242B35]">
          <div className="flex items-center gap-2 mb-1">
            <IconCheckbox size={14} className="text-[#4A8FC2]" />
            <span className="font-mono text-[10px] text-[#7A8492] uppercase">Total Tasks</span>
          </div>
          <p className="text-2xl font-bold text-[#F0F4F8] m-0">{tasks.length}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#151A21] border border-[#242B35]">
          <div className="flex items-center gap-2 mb-1">
            <IconFlag size={14} className="text-[#F59E0B]" />
            <span className="font-mono text-[10px] text-[#7A8492] uppercase">Pending</span>
          </div>
          <p className="text-2xl font-bold text-[#F59E0B] m-0">{pendingCount}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#151A21] border border-[#242B35]">
          <div className="flex items-center gap-2 mb-1">
            <IconCheck size={14} className="text-[#34D399]" />
            <span className="font-mono text-[10px] text-[#7A8492] uppercase">Completed</span>
          </div>
          <p className="text-2xl font-bold text-[#34D399] m-0">{completedCount}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#151A21] border border-[#242B35]">
          <div className="flex items-center gap-2 mb-1">
            <IconClock size={14} className="text-[#E8A23D]" />
            <span className="font-mono text-[10px] text-[#7A8492] uppercase">Pomodoros</span>
          </div>
          <p className="text-2xl font-bold text-[#E8A23D] m-0">{pomodorosToday}</p>
        </div>
      </div>

      {/* Pomodoro Timer */}
      <div className="mb-5">
        <PomodoroTimer />
      </div>

      {/* Follow-up Reminders */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconBell size={16} className="text-[#A78BFA]" />
            <h3 className="text-sm font-semibold text-[#F0F4F8] m-0">Follow-up Reminders</h3>
          </div>
          {!showReminderForm && (
            <button type="button" onClick={() => setShowReminderForm(true)} className="text-xs text-[#A78BFA] hover:text-[#c4b5fd] transition-colors flex items-center gap-1">
              <IconPlus size={14} /> Add Reminder
            </button>
          )}
        </div>

        {showReminderForm && (
          <form onSubmit={handleCreateReminder} className="p-4 rounded-xl bg-[#0E1318] border border-[rgba(167,139,250,0.25)] space-y-3 mb-3">
            <input type="text" value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} placeholder="Reminder message (e.g., Follow up with client)" className="w-full bg-[#0B0F16] text-sm text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#A78BFA] font-mono" required autoFocus />
            <input type="datetime-local" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className="w-full bg-[#0B0F16] text-sm text-[#F0F4F8] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#A78BFA] font-mono" required />
            <div className="flex gap-2">
              <button type="submit" disabled={creatingReminder || !reminderMessage.trim() || !reminderDate} className="flex-1 px-4 py-2 bg-[#A78BFA] text-black text-sm font-semibold rounded-lg hover:bg-[#b89afc] disabled:opacity-40 flex items-center justify-center gap-2">
                {creatingReminder ? <IconLoader2 size={14} className="animate-spin" /> : <IconBell size={14} />}
                {creatingReminder ? "Saving..." : "Set Reminder"}
              </button>
              <button type="button" onClick={() => setShowReminderForm(false)} className="px-4 py-2 text-sm text-[#7A8492] hover:text-[#9AA4B2]">Cancel</button>
            </div>
          </form>
        )}

        {reminders.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#0E1318] border border-[#1D2535] text-center">
            <p className="text-xs text-[#7A8492] m-0">No upcoming reminders. Set one to get notified at the right time.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((reminder) => (
              <div key={reminder.id} className="p-3 rounded-xl bg-[#0E1318] border border-[#1D2535] flex items-center justify-between gap-3 group">
                <div className="flex items-start gap-2 min-w-0">
                  <IconBell size={14} className="text-[#A78BFA] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-[#F0F4F8] m-0 truncate">{reminder.message}</p>
                    <p className="font-mono text-[10px] text-[#7A8492] m-0 mt-0.5">
                      {new Date(reminder.reminder_date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                    {reminder.item_id !== "manual" && (
                      <span className="font-mono text-[9px] text-[#4A8FC2] mt-1 inline-block">Linked to email thread</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button type="button" title="Snooze 1 day" onClick={() => handleSnoozeReminder(reminder.id, reminder.reminder_date, 24)} className="p-1.5 rounded hover:bg-[rgba(167,139,250,0.15)] text-[#7A8492] hover:text-[#A78BFA]">
                    <IconClock size={14} />
                  </button>
                  <button type="button" title="Delete reminder" onClick={() => deleteReminder(reminder.id)} className="p-1.5 rounded hover:bg-[rgba(239,68,68,0.1)] text-[#7A8492] hover:text-[#EF4444]">
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Task Button / Form */}
      <div className="mb-5">
        {!showTaskForm ? (
          <button onClick={() => setShowTaskForm(true)} className="w-full p-3 rounded-xl border border-dashed border-[rgba(74,143,194,0.3)] text-[#4A8FC2] text-sm hover:bg-[rgba(74,143,194,0.05)] transition-colors flex items-center justify-center gap-2">
            <IconPlus size={16} />
            Create New Task
          </button>
        ) : (
          <form onSubmit={handleCreateTask} className="p-4 rounded-xl bg-[#0E1318] border border-[rgba(74,143,194,0.25)] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#4A8FC2] m-0">New Task</p>
              <button type="button" onClick={() => setShowTaskForm(false)} className="p-1 rounded hover:bg-[#1D2535] text-[#7A8492] hover:text-[#F0F4F8] transition-colors">
                <IconX size={16} />
              </button>
            </div>

            <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title (e.g., Review proposal draft)" className="w-full bg-[#0B0F16] text-sm text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] font-mono" required autoFocus />

            <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full bg-[#0B0F16] text-sm text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] font-mono resize-none" />

            <div className="flex gap-2">
              <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="flex-1 bg-[#0B0F16] text-sm text-[#F0F4F8] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] font-mono" />

              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as any)} className="bg-[#0B0F16] text-sm text-[#F0F4F8] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] font-mono">
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={creating || !taskTitle.trim()} className="flex-1 px-4 py-2 bg-[#4A8FC2] text-black text-sm font-semibold rounded-lg hover:bg-[#5b9bd1] disabled:opacity-40 flex items-center justify-center gap-2">
                {creating ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlus size={14} />}
                {creating ? "Creating..." : "Create Task"}
              </button>
              <button type="button" onClick={() => setShowTaskForm(false)} className="px-4 py-2 text-sm text-[#7A8492] hover:text-[#9AA4B2]">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Task Filter */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setTaskFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${taskFilter === "all" ? "bg-[#4A8FC2] text-black" : "bg-[#181E27] text-[#9AA4B2] hover:text-[#F0F4F8] border border-[#242B35]"}`}>
          All ({tasks.length})
        </button>
        <button onClick={() => setTaskFilter("pending")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${taskFilter === "pending" ? "bg-[#F59E0B] text-black" : "bg-[#181E27] text-[#9AA4B2] hover:text-[#F0F4F8] border border-[#242B35]"}`}>
          Pending ({pendingCount})
        </button>
        <button onClick={() => setTaskFilter("completed")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${taskFilter === "completed" ? "bg-[#34D399] text-black" : "bg-[#181E27] text-[#9AA4B2] hover:text-[#F0F4F8] border border-[#242B35]"}`}>
          Completed ({completedCount})
        </button>
        <button onClick={() => setTaskFilter("from_email")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${taskFilter === "from_email" ? "bg-[#4A8FC2] text-black" : "bg-[#181E27] text-[#9AA4B2] hover:text-[#F0F4F8] border border-[#242B35]"}`}>
          From Email ({fromEmailCount})
        </button>
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="p-8 text-center bg-[#0E1318] border border-[#1D2535] rounded-xl space-y-2">
          <p className="text-[#7A8492] text-sm">{taskFilter === "all" ? "No tasks yet." : taskFilter === "pending" ? "No pending tasks." : taskFilter === "from_email" ? "No email-linked tasks yet. Sync Gmail or add a task from Today." : "No completed tasks."}</p>
          <p className="text-[#4A5568] text-xs">{taskFilter === "all" ? 'Click "Create New Task" above to get started.' : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} onDelete={deleteTask} />
          ))}
        </div>
      )}
    </div>
  );
};
