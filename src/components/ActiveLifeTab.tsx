import React, { useState, useEffect } from "react";
import {
  IconBolt,
  IconPlus,
  IconTrash,
  IconRefresh,
  IconFlame,
  IconBrandLinkedin,
  IconVideo,
  IconPhoto,
  IconAlignLeft,
  IconCalendarEvent,
  IconTarget,
  IconChevronDown,
  IconChevronUp,
  IconLoader2,
  IconSparkles,
  IconBook,
  IconCircleCheck,
  IconBell,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import { BriefRenderer } from "./BriefRenderer";
import type { ActiveProject } from "../types/queue";

// ─── Color Palette ───────────────────────────────────────────────────────────
const PROJECT_COLORS = [
  "#4A8FC2",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#D97706",
  "#0891B2",
  "#BE185D",
  "#15803D",
  "#9333EA",
  "#EA580C",
];

const HABIT_ICONS = [
  "✅",
  "🕌",
  "📖",
  "💪",
  "🧘",
  "✍️",
  "🎯",
  "🌅",
  "💡",
  "🏃",
  "🥗",
  "😴",
  "🎵",
  "🧠",
  "💻",
];
const HABIT_CATEGORIES = [
  { id: "spiritual", label: "Spiritual", color: "#7C3AED" },
  { id: "health", label: "Health", color: "#059669" },
  { id: "learning", label: "Learning", color: "#0891B2" },
  { id: "work", label: "Work", color: "#4A8FC2" },
  { id: "social", label: "Social", color: "#D97706" },
  { id: "general", label: "General", color: "#6B7280" },
];

function getCategoryColor(cat: string): string {
  return HABIT_CATEGORIES.find((c) => c.id === cat)?.color ?? "#6B7280";
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({
  pct,
  color,
  size = 48,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

// ─── Habit Heatmap (7 days) ───────────────────────────────────────────────────
function HabitHeatmap({
  habitId,
  completions,
}: {
  habitId: string;
  completions: Array<{ habit_id: string; completed_date: string }>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="flex gap-1">
      {days.map((date) => {
        const done = completions.some(
          (c) => c.habit_id === habitId && c.completed_date === date,
        );
        return (
          <div
            key={date}
            title={date}
            className="w-3 h-3 rounded-sm transition-colors duration-200"
            style={{ background: done ? "#34D399" : "rgba(255,255,255,0.07)" }}
          />
        );
      })}
    </div>
  );
}

// ─── Add Project Modal ────────────────────────────────────────────────────────
function AddProjectModal({ onClose }: { onClose: () => void }) {
  const addActiveProject = useQueueStore((s) => s.addActiveProject);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState(60);
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await addActiveProject(
      name.trim(),
      desc.trim() || undefined,
      target,
      color,
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-[#151A21] border border-[#242B35] rounded-2xl p-7 w-[380px] flex flex-col gap-4"
      >
        <div className="flex justify-between items-center">
          <h3 className="m-0 text-[#F0F4F8] text-base font-bold">
            New Project
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-[#9AA4B2] cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Wardyn, Clypra)"
          required
          className="bg-[#0E1318] border border-[#242B35] rounded-lg text-[#F0F4F8] px-3 py-2.5 text-sm outline-none w-full"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Short description (optional)"
          className="bg-[#0E1318] border border-[#242B35] rounded-lg text-[#F0F4F8] px-3 py-2.5 text-sm outline-none w-full"
        />

        <div>
          <label className="text-[#9AA4B2] text-[11px] font-semibold block mb-1.5">
            DAILY TARGET (MINUTES)
          </label>
          <input
            type="number"
            min={15}
            max={480}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="bg-[#0E1318] border border-[#242B35] rounded-lg text-[#F0F4F8] px-3 py-2.5 text-sm outline-none w-full box-border"
          />
        </div>

        <div>
          <label className="text-[#9AA4B2] text-[11px] font-semibold block mb-2">
            COLOR
          </label>
          <div className="flex gap-2 flex-wrap">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full cursor-pointer p-0"
                style={{
                  background: c,
                  border:
                    color === c ? "2px solid #fff" : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-[#4A8FC2] border-none rounded-xl text-white py-3 font-bold text-sm cursor-pointer hover:bg-[#5b9bd1] disabled:opacity-70 transition-colors"
        >
          {saving ? "Creating..." : "Create Project"}
        </button>
      </form>
    </div>
  );
}

// ─── Add Habit Modal ──────────────────────────────────────────────────────────
function AddHabitModal({ onClose }: { onClose: () => void }) {
  const addDailyHabit = useQueueStore((s) => s.addDailyHabit);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✅");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await addDailyHabit(name.trim(), icon, category);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-[#151A21] border border-[#242B35] rounded-2xl p-7 w-[380px] flex flex-col gap-4"
      >
        <div className="flex justify-between items-center">
          <h3 className="m-0 text-[#F0F4F8] text-base font-bold">New Habit</h3>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-[#9AA4B2] cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Habit name (e.g. Pray Fajr, Read 30 mins)"
          required
          className="bg-[#0E1318] border border-[#242B35] rounded-lg text-[#F0F4F8] px-3 py-2.5 text-sm outline-none w-full"
        />

        <div>
          <label className="text-[#9AA4B2] text-[11px] font-semibold block mb-2">
            ICON
          </label>
          <div className="flex gap-2 flex-wrap">
            {HABIT_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className="w-[34px] h-[34px] rounded-lg text-lg cursor-pointer transition-colors"
                style={{
                  border:
                    icon === ic ? "2px solid #4A8FC2" : "1px solid #242B35",
                  background: icon === ic ? "rgba(74,143,194,0.15)" : "#0E1318",
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[#9AA4B2] text-[11px] font-semibold block mb-2">
            CATEGORY
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {HABIT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors"
                style={{
                  border:
                    category === cat.id
                      ? `2px solid ${cat.color}`
                      : "1px solid #242B35",
                  background:
                    category === cat.id ? `${cat.color}22` : "#0E1318",
                  color: category === cat.id ? cat.color : "#9AA4B2",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-[#4A8FC2] border-none rounded-xl text-white py-3 font-bold text-sm cursor-pointer hover:bg-[#5b9bd1] disabled:opacity-70 transition-colors"
        >
          {saving ? "Saving..." : "Add Habit"}
        </button>
      </form>
    </div>
  );
}

// ─── Log Session Modal ────────────────────────────────────────────────────────
function LogSessionModal({
  project,
  onClose,
}: {
  project: ActiveProject;
  onClose: () => void;
}) {
  const logProjectSession = useQueueStore((s) => s.logProjectSession);
  const [minutes, setMinutes] = useState(30);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await logProjectSession(project.id, minutes, notes.trim() || undefined);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-[#151A21] border border-[#242B35] rounded-2xl p-7 w-[340px] flex flex-col gap-4"
      >
        <div className="flex justify-between items-center">
          <h3 className="m-0 text-[#F0F4F8] text-base font-bold">
            Log Session — {project.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-[#9AA4B2] cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2">
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              style={{
                border:
                  minutes === m
                    ? `2px solid ${project.color}`
                    : "1px solid #242B35",
                background: minutes === m ? `${project.color}22` : "#0E1318",
                color: minutes === m ? project.color : "#9AA4B2",
              }}
            >
              {m}m
            </button>
          ))}
        </div>

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="bg-[#0E1318] border border-[#242B35] rounded-lg text-[#F0F4F8] px-3 py-2.5 text-sm outline-none w-full"
        />

        <button
          type="submit"
          disabled={saving}
          className="border-none rounded-xl text-white py-3 font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-70"
          style={{ background: project.color }}
        >
          {saving ? "Logging..." : `Log ${minutes}m`}
        </button>
      </form>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[#4A8FC2]">{icon}</span>
        <h2 className="m-0 text-[#F0F4F8] text-sm font-bold tracking-wide">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

// ─── Main ActiveLifeTab ───────────────────────────────────────────────────────
export const ActiveLifeTab: React.FC = () => {
  const {
    activeProjects,
    dailyHabits,
    dailyIntel,
    dailyIntelLoading,
    dayPlan,
    dayPlanLoading,
    generatedPost,
    generatedPostLoading,
    habitReminders,
    fetchActiveProjects,
    fetchDailyHabits,
    fetchDailyIntel,
    fetchHabitReminders,
    toggleHabitComplete,
    deleteDailyHabit,
    deleteActiveProject,
    generateDayPlan,
    generateSocialPost,
    addHabitReminder,
    deleteHabitReminder,
    toggleHabitReminder,
  } = useQueueStore();

  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [logSession, setLogSession] = useState<ActiveProject | null>(null);
  const [showDayPlan, setShowDayPlan] = useState(false);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [reminderPickerHabitId, setReminderPickerHabitId] = useState<
    string | null
  >(null);
  const [reminderTime, setReminderTime] = useState("08:00");

  const [completions, setCompletions] = useState<
    Array<{ habit_id: string; completed_date: string }>
  >([]);
  useEffect(() => {
    const load = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const data = await invoke<
          Array<{ habit_id: string; completed_date: string }>
        >("get_habit_completions_command", { days: 7 });
        setCompletions(data);
      } catch {
        /* no-op */
      }
    };
    load();
    fetchHabitReminders();
  }, [dailyHabits]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("switch-tab", () => {
          document
            .getElementById("habits-section")
            ?.scrollIntoView({ behavior: "smooth" });
        });
      } catch {
        /* non-Tauri env */
      }
    };
    setup();
    return () => {
      unlisten?.();
    };
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const habitsDoneCount = dailyHabits.filter((h) => h.completed_today).length;
  const habitsPct =
    dailyHabits.length > 0
      ? Math.round((habitsDoneCount / dailyHabits.length) * 100)
      : 0;

  const handleGeneratePost = async () => {
    if (!dailyIntel?.social_post_idea) return;
    setGeneratingPost(true);
    await generateSocialPost(
      dailyIntel.social_platform ?? "linkedin",
      dailyIntel.social_post_idea,
      dailyIntel.social_format ?? "plain_text",
    );
    setGeneratingPost(false);
  };

  const formatBadge = (fmt: string | null) => {
    if (fmt === "video")
      return {
        icon: <IconVideo size={11} />,
        label: "Video",
        color: "#DC2626",
      };
    if (fmt === "image_text")
      return {
        icon: <IconPhoto size={11} />,
        label: "Image + Text",
        color: "#D97706",
      };
    return {
      icon: <IconAlignLeft size={11} />,
      label: "Plain Text",
      color: "#4A8FC2",
    };
  };

  const platformIcon = (_p: string | null) => <IconBrandLinkedin size={13} />;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5 pb-10">
      {/* Page Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="m-0 text-xl font-bold text-[#F0F4F8] flex items-center gap-2">
            <IconBolt size={20} className="text-[#4A8FC2]" />
            Active Life
          </h1>
          <p className="m-0 mt-0.5 text-[11px] font-mono text-[#7A8492]">
            {today}
          </p>
        </div>
        <button
          onClick={() => {
            fetchActiveProjects();
            fetchDailyHabits();
            fetchDailyIntel(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.25)] text-[#4A8FC2] text-[11px] font-semibold cursor-pointer hover:bg-[rgba(74,143,194,0.18)] transition-colors"
        >
          <IconRefresh size={13} /> Refresh
        </button>
      </div>

      {/* ─── Daily Spark ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[rgba(124,58,237,0.12)] to-[rgba(74,143,194,0.08)] border border-[rgba(124,58,237,0.25)] rounded-2xl p-[18px]">
        <SectionHeader
          icon={<IconSparkles size={15} />}
          title="Daily Spark"
          action={
            <button
              onClick={() => fetchDailyIntel(true)}
              disabled={dailyIntelLoading}
              className="bg-transparent border-none text-[#7C3AED] cursor-pointer flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity"
            >
              {dailyIntelLoading ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconRefresh size={13} />
              )}
              {dailyIntelLoading ? "Generating..." : "Refresh"}
            </button>
          }
        />
        {dailyIntelLoading && !dailyIntel ? (
          <div className="flex items-center gap-2 text-[#9AA4B2] text-[13px]">
            <IconLoader2 size={16} /> Generating your daily spark with AI...
          </div>
        ) : dailyIntel ? (
          <div className="flex flex-col gap-3.5">
            {/* Quote */}
            {dailyIntel.motivation_quote && (
              <div className="border-l-[3px] border-[#7C3AED] pl-3.5">
                <p className="m-0 text-[15px] italic text-[#E2E8F0] leading-relaxed">
                  &ldquo;{dailyIntel.motivation_quote}&rdquo;
                </p>
                {dailyIntel.quote_author && (
                  <p className="m-0 mt-1.5 text-[11px] font-bold text-[#7C3AED] font-mono">
                    — {dailyIntel.quote_author}
                  </p>
                )}
              </div>
            )}
            {/* Learning topic */}
            {dailyIntel.learning_topic && (
              <div className="bg-[rgba(74,143,194,0.08)] rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <IconBook size={13} className="text-[#4A8FC2]" />
                  <span className="text-[11px] font-bold text-[#4A8FC2] font-mono">
                    TODAY'S LEARNING
                  </span>
                </div>
                <p className="m-0 mb-1 text-[13px] font-bold text-[#F0F4F8]">
                  {dailyIntel.learning_topic}
                </p>
                {dailyIntel.learning_summary && (
                  <p className="m-0 text-xs text-[#9AA4B2] leading-relaxed">
                    {dailyIntel.learning_summary}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[#9AA4B2] text-[13px] m-0">
            Install Ollama and click Refresh to generate your daily spark.
          </p>
        )}
      </div>

      {/* ─── What I'm Building ───────────────────────────── */}
      <div>
        <SectionHeader
          icon={<IconTarget size={15} />}
          title="What I'm Building"
          action={
            <button
              onClick={() => setShowAddProject(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.25)] text-[#4A8FC2] text-[11px] font-semibold cursor-pointer hover:bg-[rgba(74,143,194,0.18)] transition-colors"
            >
              <IconPlus size={12} /> Add Project
            </button>
          }
        />
        {activeProjects.length === 0 ? (
          <div className="text-center py-6 text-[#7A8492]">
            <IconTarget size={28} className="opacity-40 mb-2 mx-auto" />
            <p className="m-0 text-[13px]">
              No active projects yet. Add what you're building.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeProjects.map((p) => {
              const pct =
                p.daily_target_minutes > 0
                  ? Math.round((p.today_minutes / p.daily_target_minutes) * 100)
                  : 0;
              return (
                <div
                  key={p.id}
                  className="bg-[#0E1318] rounded-xl px-4 py-3.5 transition-[border-color] duration-200"
                  style={{
                    border: `1px solid ${p.today_minutes > 0 ? p.color + "44" : "#1D2535"}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <ProgressRing pct={pct} color={p.color} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        <span className="text-sm font-bold text-[#F0F4F8]">
                          {p.name}
                        </span>
                        {p.today_minutes > 0 && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-mono"
                            style={{
                              color: p.color,
                              background: `${p.color}22`,
                            }}
                          >
                            {p.status === "paused" ? "PAUSED" : "ACTIVE"}
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="m-0 mt-0.5 text-[11px] text-[#7A8492]">
                          {p.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 h-1 bg-white/[0.06] rounded-full">
                          <div
                            className="h-full rounded-full transition-[width] duration-500 ease-in-out"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: p.color,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-[#9AA4B2] whitespace-nowrap">
                          {p.today_minutes}m / {p.daily_target_minutes}m
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setLogSession(p)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                        style={{
                          background: `${p.color}22`,
                          border: `1px solid ${p.color}44`,
                          color: p.color,
                        }}
                      >
                        + Log
                      </button>
                      <button
                        onClick={() =>
                          useQueueStore.getState().updateActiveProject(p.id, {
                            status: p.status === "paused" ? "active" : "paused",
                          })
                        }
                        title={
                          p.status === "paused"
                            ? "Resume Project"
                            : "Pause Project"
                        }
                        className="px-2 py-1 rounded-lg bg-transparent border border-[#242B35] text-[10px] cursor-pointer hover:border-[#4A8FC2] transition-colors"
                        style={{
                          color: p.status === "paused" ? "#F59E0B" : "#7A8492",
                        }}
                      >
                        {p.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                      </button>
                      <button
                        onClick={() => deleteActiveProject(p.id)}
                        className="px-2 py-1 rounded-lg bg-transparent border border-[#242B35] text-[#7A8492] text-[11px] cursor-pointer hover:text-[#EF4444] hover:border-[rgba(239,68,68,0.4)] transition-colors"
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Social Content Brief ─────────────────────────── */}
      {dailyIntel?.social_post_idea && (
        <div className="bg-[#0E1318] border border-[#1D2535] rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <IconBrandLinkedin size={15} className="text-[#4A8FC2]" />
              <span className="text-[11px] font-bold text-[#4A8FC2] font-mono">
                DAILY SOCIAL ANGLE
              </span>
            </div>
            {(() => {
              const fb = formatBadge(dailyIntel.social_format);
              return (
                <span
                  className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono"
                  style={{ color: fb.color, background: `${fb.color}22` }}
                >
                  {fb.icon} {fb.label}
                </span>
              );
            })()}
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#9AA4B2] bg-white/[0.06] px-2 py-0.5 rounded-full">
              {platformIcon(dailyIntel.social_platform)}{" "}
              {dailyIntel.social_platform?.toUpperCase()}
            </span>
          </div>
          <p className="m-0 mb-3.5 text-[13px] text-[#E2E8F0] leading-relaxed">
            {dailyIntel.social_post_idea}
          </p>

          {generatedPost ? (
            <div className="bg-[#141A22] border border-[#242B35] rounded-xl p-3.5 flex flex-col gap-2.5">
              <p className="m-0 text-[13px] font-bold text-[#4A8FC2]">
                {generatedPost.hook}
              </p>
              <p className="m-0 text-xs text-[#9AA4B2] leading-[1.7]">
                {generatedPost.body}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {generatedPost.hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-[10px] text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] px-2 py-0.5 rounded-full"
                  >
                    #{h}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => {
                    const platform = (
                      dailyIntel.social_platform?.toLowerCase() === "x"
                        ? "x"
                        : "linkedin"
                    ) as any;
                    useQueueStore
                      .getState()
                      .createSocialPost(platform, generatedPost.hook);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[rgba(74,143,194,0.15)] border border-[rgba(74,143,194,0.3)] text-[#4A8FC2] text-[11px] font-semibold cursor-pointer hover:bg-[rgba(74,143,194,0.25)] transition-colors"
                >
                  <IconBrandLinkedin size={13} /> Push to Content Hub Queue
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGeneratePost}
              disabled={generatingPost || generatedPostLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[rgba(5,150,105,0.15)] border border-[rgba(5,150,105,0.3)] text-[#34D399] text-xs font-semibold cursor-pointer hover:bg-[rgba(5,150,105,0.25)] transition-colors disabled:opacity-50"
            >
              {generatingPost || generatedPostLoading ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconSparkles size={13} />
              )}
              {generatingPost || generatedPostLoading
                ? "Drafting..."
                : "Generate Full Post"}
            </button>
          )}
        </div>
      )}

      {/* ─── Today's Game Plan ───────────────────────────── */}
      <div>
        <SectionHeader
          icon={<IconCalendarEvent size={15} />}
          title="Today's Game Plan"
          action={
            <div className="flex gap-1.5">
              <button
                onClick={generateDayPlan}
                disabled={dayPlanLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.25)] text-[#4A8FC2] text-[11px] font-semibold cursor-pointer hover:bg-[rgba(74,143,194,0.18)] transition-colors disabled:opacity-50"
              >
                {dayPlanLoading ? (
                  <IconLoader2 size={12} className="animate-spin" />
                ) : (
                  <IconSparkles size={12} />
                )}
                {dayPlanLoading ? "Planning..." : "Generate Plan"}
              </button>
              {(dayPlan || dailyIntel?.day_plan) && (
                <button
                  onClick={() => setShowDayPlan((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0E1318] border border-[#242B35] text-[#9AA4B2] text-[11px] cursor-pointer hover:text-[#F0F4F8] transition-colors"
                >
                  {showDayPlan ? (
                    <IconChevronUp size={12} />
                  ) : (
                    <IconChevronDown size={12} />
                  )}
                </button>
              )}
            </div>
          }
        />
        {showDayPlan && (dayPlan || dailyIntel?.day_plan) && (
          <div className="bg-[#0E1318] border border-[#242B35] rounded-xl p-4">
            <BriefRenderer
              text={dayPlan || dailyIntel?.day_plan || ""}
              baseColor="#C0CAD4"
            />
          </div>
        )}
        {!showDayPlan &&
          !dayPlan &&
          !dailyIntel?.day_plan &&
          !dayPlanLoading && (
            <p className="text-xs text-[#7A8492] m-0">
              Click "Generate Plan" to get an AI-crafted time-blocked schedule
              for today.
            </p>
          )}
        {dayPlanLoading && (
          <div className="flex items-center gap-2 text-[#9AA4B2] text-[13px] py-3">
            <IconLoader2 size={16} className="animate-spin" /> AI is crafting
            your day plan...
          </div>
        )}
      </div>

      {/* ─── Daily Habits ────────────────────────────────── */}
      <div id="habits-section">
        <SectionHeader
          icon={<IconCircleCheck size={15} />}
          title="Daily Habits"
          action={
            <div className="flex items-center gap-2">
              {dailyHabits.length > 0 && (
                <span
                  className={`text-[11px] font-bold font-mono ${habitsPct === 100 ? "text-[#34D399]" : "text-[#9AA4B2]"}`}
                >
                  {habitsDoneCount}/{dailyHabits.length} done
                </span>
              )}
              <button
                onClick={() => setShowAddHabit(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)] text-[#34D399] text-[11px] font-semibold cursor-pointer hover:bg-[rgba(52,211,153,0.18)] transition-colors"
              >
                <IconPlus size={12} /> Add
              </button>
            </div>
          }
        />

        {dailyHabits.length === 0 ? (
          <div className="text-center py-5 text-[#7A8492]">
            <IconCircleCheck size={28} className="opacity-40 mb-2 mx-auto" />
            <p className="m-0 text-[13px]">
              Add your daily rituals — prayers, workouts, reading, anything.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {dailyHabits.map((h) => {
              const catColor = getCategoryColor(h.category);
              return (
                <div
                  key={h.id}
                  className="rounded-xl px-3.5 py-3 flex items-center gap-2.5 transition-all duration-200 cursor-pointer"
                  style={{
                    background: h.completed_today
                      ? "rgba(52,211,153,0.08)"
                      : "#0E1318",
                    border: `1px solid ${h.completed_today ? "rgba(52,211,153,0.3)" : "#1D2535"}`,
                  }}
                  onClick={() => toggleHabitComplete(h.id)}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 transition-colors duration-200"
                    style={{
                      background: h.completed_today
                        ? "#34D399"
                        : "rgba(255,255,255,0.05)",
                    }}
                  >
                    {h.completed_today ? "✓" : h.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="m-0 text-[13px] font-semibold"
                      style={{
                        color: h.completed_today ? "#34D399" : "#F0F4F8",
                        textDecoration: h.completed_today
                          ? "line-through"
                          : "none",
                      }}
                    >
                      {h.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-[10px]"
                        style={{ color: catColor, background: `${catColor}22` }}
                      >
                        {h.category.toUpperCase()}
                      </span>
                      {h.current_streak > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-[#F59E0B]">
                          <IconFlame size={11} /> {h.current_streak}d
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <HabitHeatmap habitId={h.id} completions={completions} />
                    </div>
                  </div>
                  {/* Reminder button */}
                  {(() => {
                    const existingReminder = habitReminders.find(
                      (r) => r.habit_id === h.id,
                    );
                    return (
                      <div className="flex flex-col items-end gap-1">
                        {existingReminder ? (
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHabitReminder(existingReminder.id);
                              }}
                              title="Remove reminder"
                              className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-pointer border transition-colors"
                              style={{
                                color: existingReminder.enabled
                                  ? "#34D399"
                                  : "#7A8492",
                                background: existingReminder.enabled
                                  ? "rgba(52,211,153,0.12)"
                                  : "rgba(255,255,255,0.05)",
                                borderColor: existingReminder.enabled
                                  ? "rgba(52,211,153,0.3)"
                                  : "#242B35",
                              }}
                            >
                              <IconBell size={10} />
                              {existingReminder.remind_time}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHabitReminder(
                                  existingReminder.id,
                                  !existingReminder.enabled,
                                );
                              }}
                              className="text-[9px] text-[#7A8492] bg-transparent border-none cursor-pointer p-0 hover:text-[#F0F4F8] transition-colors"
                            >
                              {existingReminder.enabled ? "disable" : "enable"}
                            </button>
                          </div>
                        ) : reminderPickerHabitId === h.id ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-col gap-1 items-end"
                          >
                            <input
                              type="time"
                              value={reminderTime}
                              onChange={(e) => setReminderTime(e.target.value)}
                              className="bg-[#0E1318] border border-[#4A8FC2] rounded-md text-[#F0F4F8] text-[11px] px-1.5 py-0.5 w-20 outline-none"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  addHabitReminder(h.id, reminderTime);
                                  setReminderPickerHabitId(null);
                                }}
                                className="text-[10px] font-bold text-[#34D399] bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] rounded-md px-2 py-0.5 cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setReminderPickerHabitId(null)}
                                className="text-[10px] text-[#7A8492] bg-transparent border border-[#242B35] rounded-md px-1.5 py-0.5 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReminderPickerHabitId(h.id);
                              setReminderTime("08:00");
                            }}
                            title="Set reminder"
                            className="bg-transparent border border-[#242B35] rounded-full text-[#7A8492] px-1.5 py-0.5 cursor-pointer opacity-0 hover:opacity-100 transition-opacity text-[10px] flex items-center"
                          >
                            <IconBell size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDailyHabit(h.id);
                    }}
                    className="bg-transparent border-none text-[#7A8492] cursor-pointer p-1 rounded-md opacity-0 hover:opacity-100 hover:text-[#EF4444] transition-all"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddProject && (
        <AddProjectModal
          onClose={() => {
            setShowAddProject(false);
            fetchActiveProjects();
          }}
        />
      )}
      {showAddHabit && (
        <AddHabitModal
          onClose={() => {
            setShowAddHabit(false);
            fetchDailyHabits();
          }}
        />
      )}
      {logSession && (
        <LogSessionModal
          project={logSession}
          onClose={() => {
            setLogSession(null);
            fetchActiveProjects();
          }}
        />
      )}
    </div>
  );
};
