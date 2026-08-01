import React, { useState, useEffect } from "react";
import {
  IconBolt, IconPlus, IconTrash, IconRefresh, IconFlame,
  IconBrandLinkedin, IconBrandX, IconVideo, IconPhoto,
  IconAlignLeft, IconCalendarEvent, IconTarget,
  IconChevronDown, IconChevronUp, IconLoader2, IconSparkles,
  IconBook, IconCircleCheck, IconBell,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import type { ActiveProject } from "../types/queue";

// ─── Color Palette ───────────────────────────────────────────────────────────
const PROJECT_COLORS = [
  "#4A8FC2", "#7C3AED", "#059669", "#DC2626", "#D97706",
  "#0891B2", "#BE185D", "#15803D", "#9333EA", "#EA580C",
];

const HABIT_ICONS = ["✅", "🕌", "📖", "💪", "🧘", "✍️", "🎯", "🌅", "💡", "🏃", "🥗", "😴", "🎵", "🧠", "💻"];
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
function ProgressRing({ pct, color, size = 48 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

// ─── Habit Heatmap (7 days) ───────────────────────────────────────────────────
function HabitHeatmap({ habitId, completions }: { habitId: string; completions: Array<{ habit_id: string; completed_date: string }> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {days.map((date) => {
        const done = completions.some((c) => c.habit_id === habitId && c.completed_date === date);
        return (
          <div
            key={date}
            title={date}
            style={{
              width: 12, height: 12, borderRadius: 3,
              background: done ? "#34D399" : "rgba(255,255,255,0.07)",
              transition: "background 0.2s",
            }}
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
    await addActiveProject(name.trim(), desc.trim() || undefined, target, color);
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: "#151A21", border: "1px solid #242B35", borderRadius: 16, padding: 28, width: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#F0F4F8", fontSize: 16, fontWeight: 700 }}>New Project</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9AA4B2", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Wardyn, Clypra)"
          required
          style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 8, color: "#F0F4F8", padding: "10px 12px", fontSize: 14, outline: "none" }}
        />
        <input
          value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Short description (optional)"
          style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 8, color: "#F0F4F8", padding: "10px 12px", fontSize: 14, outline: "none" }}
        />

        <div>
          <label style={{ color: "#9AA4B2", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 6 }}>DAILY TARGET (MINUTES)</label>
          <input
            type="number" min={15} max={480} value={target} onChange={(e) => setTarget(Number(e.target.value))}
            style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 8, color: "#F0F4F8", padding: "10px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ color: "#9AA4B2", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 8 }}>COLOR</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} style={{ background: "#4A8FC2", border: "none", borderRadius: 10, color: "#fff", padding: "12px", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: "#151A21", border: "1px solid #242B35", borderRadius: 16, padding: 28, width: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#F0F4F8", fontSize: 16, fontWeight: 700 }}>New Habit</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9AA4B2", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Habit name (e.g. Pray Fajr, Read 30 mins)"
          required
          style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 8, color: "#F0F4F8", padding: "10px 12px", fontSize: 14, outline: "none" }}
        />

        <div>
          <label style={{ color: "#9AA4B2", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 8 }}>ICON</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {HABIT_ICONS.map((ic) => (
              <button key={ic} type="button" onClick={() => setIcon(ic)} style={{ width: 34, height: 34, borderRadius: 8, fontSize: 18, border: icon === ic ? "2px solid #4A8FC2" : "1px solid #242B35", background: icon === ic ? "rgba(74,143,194,0.15)" : "#0E1318", cursor: "pointer" }}>
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ color: "#9AA4B2", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 8 }}>CATEGORY</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {HABIT_CATEGORIES.map((cat) => (
              <button key={cat.id} type="button" onClick={() => setCategory(cat.id)}
                style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: category === cat.id ? `2px solid ${cat.color}` : "1px solid #242B35", background: category === cat.id ? `${cat.color}22` : "#0E1318", color: category === cat.id ? cat.color : "#9AA4B2", cursor: "pointer" }}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} style={{ background: "#4A8FC2", border: "none", borderRadius: 10, color: "#fff", padding: "12px", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Add Habit"}
        </button>
      </form>
    </div>
  );
}

// ─── Log Session Modal ────────────────────────────────────────────────────────
function LogSessionModal({ project, onClose }: { project: ActiveProject; onClose: () => void }) {
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: "#151A21", border: "1px solid #242B35", borderRadius: 16, padding: 28, width: 340, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#F0F4F8", fontSize: 16, fontWeight: 700 }}>Log Session — {project.name}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9AA4B2", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <button key={m} type="button" onClick={() => setMinutes(m)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, border: minutes === m ? `2px solid ${project.color}` : "1px solid #242B35", background: minutes === m ? `${project.color}22` : "#0E1318", color: minutes === m ? project.color : "#9AA4B2", cursor: "pointer" }}>
              {m}m
            </button>
          ))}
        </div>

        <input
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 8, color: "#F0F4F8", padding: "10px 12px", fontSize: 14, outline: "none" }}
        />

        <button type="submit" disabled={saving} style={{ background: project.color, border: "none", borderRadius: 10, color: "#fff", padding: "12px", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Logging..." : `Log ${minutes}m`}
        </button>
      </form>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#4A8FC2" }}>{icon}</span>
        <h2 style={{ margin: 0, color: "#F0F4F8", fontSize: 14, fontWeight: 700, letterSpacing: "0.01em" }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ─── Main ActiveLifeTab ───────────────────────────────────────────────────────
export const ActiveLifeTab: React.FC = () => {
  const {
    activeProjects, dailyHabits, dailyIntel, dailyIntelLoading,
    dayPlan, dayPlanLoading, generatedPost, generatedPostLoading,
    habitReminders,
    fetchActiveProjects, fetchDailyHabits, fetchDailyIntel, fetchHabitReminders,
    toggleHabitComplete, deleteDailyHabit, deleteActiveProject,
    generateDayPlan, generateSocialPost,
    addHabitReminder, deleteHabitReminder, toggleHabitReminder,
  } = useQueueStore();

  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [logSession, setLogSession] = useState<ActiveProject | null>(null);
  const [showDayPlan, setShowDayPlan] = useState(false);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [reminderPickerHabitId, setReminderPickerHabitId] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState("08:00");

  // Fetch habit completions for heatmap (last 7 days via store)
  const [completions, setCompletions] = useState<Array<{ habit_id: string; completed_date: string }>>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const data = await invoke<Array<{ habit_id: string; completed_date: string }>>("get_habit_completions_command", { days: 7 });
        setCompletions(data);
      } catch { /* no-op */ }
    };
    load();
    fetchHabitReminders();
  }, [dailyHabits]);

  // Listen for tray menu "switch-tab" events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("switch-tab", () => {
          // Already on this tab, just scroll to habits
          document.getElementById("habits-section")?.scrollIntoView({ behavior: "smooth" });
        });
      } catch { /* non-Tauri env */ }
    };
    setup();
    return () => { unlisten?.(); };
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const habitsDoneCount = dailyHabits.filter((h) => h.completed_today).length;
  const habitsPct = dailyHabits.length > 0 ? Math.round((habitsDoneCount / dailyHabits.length) * 100) : 0;

  const handleGeneratePost = async () => {
    if (!dailyIntel?.social_post_idea) return;
    setGeneratingPost(true);
    await generateSocialPost(
      dailyIntel.social_platform ?? "linkedin",
      dailyIntel.social_post_idea,
      dailyIntel.social_format ?? "plain_text"
    );
    setGeneratingPost(false);
  };

  const formatBadge = (fmt: string | null) => {
    if (fmt === "video") return { icon: <IconVideo size={11} />, label: "Video", color: "#DC2626" };
    if (fmt === "image_text") return { icon: <IconPhoto size={11} />, label: "Image + Text", color: "#D97706" };
    return { icon: <IconAlignLeft size={11} />, label: "Plain Text", color: "#4A8FC2" };
  };

  const platformIcon = (p: string | null) =>
    p === "twitter" ? <IconBrandX size={13} /> : <IconBrandLinkedin size={13} />;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#F0F4F8", display: "flex", alignItems: "center", gap: 8 }}>
            <IconBolt size={20} style={{ color: "#4A8FC2" }} />
            Active Life
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, fontFamily: "monospace", color: "#7A8492" }}>{today}</p>
        </div>
        <button onClick={() => { fetchActiveProjects(); fetchDailyHabits(); fetchDailyIntel(true); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, background: "rgba(74,143,194,0.1)", border: "1px solid rgba(74,143,194,0.25)", color: "#4A8FC2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <IconRefresh size={13} /> Refresh
        </button>
      </div>

      {/* ─── Daily Spark ─────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(74,143,194,0.08))", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 14, padding: 18 }}>
        <SectionHeader icon={<IconSparkles size={15} />} title="Daily Spark" action={
          <button onClick={() => fetchDailyIntel(true)} disabled={dailyIntelLoading}
            style={{ background: "none", border: "none", color: "#7C3AED", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            {dailyIntelLoading ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
            {dailyIntelLoading ? "Generating..." : "Refresh"}
          </button>
        } />
        {dailyIntelLoading && !dailyIntel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9AA4B2", fontSize: 13 }}>
            <IconLoader2 size={16} /> Generating your daily spark with AI...
          </div>
        ) : dailyIntel ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Quote */}
            {dailyIntel.motivation_quote && (
              <div style={{ borderLeft: "3px solid #7C3AED", paddingLeft: 14 }}>
                <p style={{ margin: 0, fontSize: 15, fontStyle: "italic", color: "#E2E8F0", lineHeight: 1.6 }}>
                  "{dailyIntel.motivation_quote}"
                </p>
                {dailyIntel.quote_author && (
                  <p style={{ margin: "6px 0 0", fontSize: 11, fontWeight: 700, color: "#7C3AED", fontFamily: "monospace" }}>
                    — {dailyIntel.quote_author}
                  </p>
                )}
              </div>
            )}
            {/* Learning topic */}
            {dailyIntel.learning_topic && (
              <div style={{ background: "rgba(74,143,194,0.08)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <IconBook size={13} style={{ color: "#4A8FC2" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#4A8FC2", fontFamily: "monospace" }}>TODAY'S LEARNING</span>
                </div>
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#F0F4F8" }}>{dailyIntel.learning_topic}</p>
                {dailyIntel.learning_summary && (
                  <p style={{ margin: 0, fontSize: 12, color: "#9AA4B2", lineHeight: 1.6 }}>{dailyIntel.learning_summary}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: "#9AA4B2", fontSize: 13, margin: 0 }}>Install Ollama and click Refresh to generate your daily spark.</p>
        )}
      </div>

      {/* ─── What I'm Building ───────────────────────────── */}
      <div>
        <SectionHeader icon={<IconTarget size={15} />} title="What I'm Building" action={
          <button onClick={() => setShowAddProject(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: "rgba(74,143,194,0.1)", border: "1px solid rgba(74,143,194,0.25)", color: "#4A8FC2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            <IconPlus size={12} /> Add Project
          </button>
        } />
        {activeProjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#7A8492" }}>
            <IconTarget size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 13 }}>No active projects yet. Add what you're building.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeProjects.map((p) => {
              const pct = p.daily_target_minutes > 0 ? Math.round((p.today_minutes / p.daily_target_minutes) * 100) : 0;
              return (
                <div key={p.id} style={{ background: "#0E1318", border: `1px solid ${p.today_minutes > 0 ? p.color + "44" : "#1D2535"}`, borderRadius: 12, padding: "14px 16px", transition: "border-color 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <ProgressRing pct={pct} color={p.color} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#F0F4F8" }}>{p.name}</span>
                        {p.today_minutes > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: p.color, background: `${p.color}22`, padding: "2px 6px", borderRadius: 20, fontFamily: "monospace" }}>
                            {p.status === "paused" ? "PAUSED" : "ACTIVE"}
                          </span>
                        )}
                      </div>
                      {p.description && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7A8492" }}>{p.description}</p>}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999 }}>
                          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: p.color, borderRadius: 999, transition: "width 0.5s ease" }} />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9AA4B2", whiteSpace: "nowrap" }}>
                          {p.today_minutes}m / {p.daily_target_minutes}m
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button onClick={() => setLogSession(p)}
                        style={{ padding: "6px 10px", borderRadius: 8, background: `${p.color}22`, border: `1px solid ${p.color}44`, color: p.color, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        + Log
                      </button>
                      <button onClick={() => useQueueStore.getState().updateActiveProject(p.id, { status: p.status === "paused" ? "active" : "paused" })}
                        title={p.status === "paused" ? "Resume Project" : "Pause Project"}
                        style={{ padding: "4px 8px", borderRadius: 8, background: "none", border: "1px solid #242B35", color: p.status === "paused" ? "#F59E0B" : "#7A8492", fontSize: 10, cursor: "pointer" }}>
                        {p.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                      </button>
                      <button onClick={() => deleteActiveProject(p.id)}
                        style={{ padding: "4px 8px", borderRadius: 8, background: "none", border: "1px solid #242B35", color: "#7A8492", fontSize: 11, cursor: "pointer" }}>
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
        <div style={{ background: "#0E1318", border: "1px solid #1D2535", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconBrandLinkedin size={15} style={{ color: "#4A8FC2" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#4A8FC2", fontFamily: "monospace" }}>DAILY SOCIAL ANGLE</span>
            </div>
            {(() => { const fb = formatBadge(dailyIntel.social_format);
              return <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: fb.color, background: `${fb.color}22`, padding: "3px 8px", borderRadius: 20, fontFamily: "monospace" }}>{fb.icon} {fb.label}</span>;
            })()}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#9AA4B2", background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 20 }}>
              {platformIcon(dailyIntel.social_platform)} {dailyIntel.social_platform?.toUpperCase()}
            </span>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#E2E8F0", lineHeight: 1.6 }}>{dailyIntel.social_post_idea}</p>

          {generatedPost ? (
            <div style={{ background: "#141A22", border: "1px solid #242B35", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#4A8FC2" }}>{generatedPost.hook}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#9AA4B2", lineHeight: 1.7 }}>{generatedPost.body}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {generatedPost.hashtags.map((h) => (
                  <span key={h} style={{ fontSize: 10, color: "#4A8FC2", background: "rgba(74,143,194,0.12)", padding: "2px 8px", borderRadius: 20 }}>#{h}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => {
                    const platform = (dailyIntel.social_platform?.toLowerCase() === "x" ? "x" : "linkedin") as any;
                    useQueueStore.getState().createSocialPost(platform, generatedPost.hook);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "rgba(74,143,194,0.15)", border: "1px solid rgba(74,143,194,0.3)", color: "#4A8FC2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  <IconBrandLinkedin size={13} /> Push to Content Hub Queue
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleGeneratePost} disabled={generatingPost || generatedPostLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.3)", color: "#34D399", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {(generatingPost || generatedPostLoading) ? <IconLoader2 size={13} /> : <IconSparkles size={13} />}
              {(generatingPost || generatedPostLoading) ? "Drafting..." : "Generate Full Post"}
            </button>
          )}
        </div>
      )}

      {/* ─── Today's Game Plan ───────────────────────────── */}
      <div>
        <SectionHeader icon={<IconCalendarEvent size={15} />} title="Today's Game Plan" action={
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={generateDayPlan} disabled={dayPlanLoading}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: "rgba(74,143,194,0.1)", border: "1px solid rgba(74,143,194,0.25)", color: "#4A8FC2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {dayPlanLoading ? <IconLoader2 size={12} /> : <IconSparkles size={12} />}
              {dayPlanLoading ? "Planning..." : "Generate Plan"}
            </button>
            {(dayPlan || dailyIntel?.day_plan) && (
              <button onClick={() => setShowDayPlan((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: "#0E1318", border: "1px solid #242B35", color: "#9AA4B2", fontSize: 11, cursor: "pointer" }}>
                {showDayPlan ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
              </button>
            )}
          </div>
        } />
        {showDayPlan && (dayPlan || dailyIntel?.day_plan) && (
          <div style={{ background: "#0E1318", border: "1px solid #242B35", borderRadius: 12, padding: 16 }}>
            <pre style={{ margin: 0, fontSize: 12, color: "#C0CAD4", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {dayPlan || dailyIntel?.day_plan}
            </pre>
          </div>
        )}
        {!showDayPlan && !dayPlan && !dailyIntel?.day_plan && !dayPlanLoading && (
          <p style={{ fontSize: 12, color: "#7A8492", margin: 0 }}>Click "Generate Plan" to get an AI-crafted time-blocked schedule for today.</p>
        )}
        {dayPlanLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9AA4B2", fontSize: 13, padding: "12px 0" }}>
            <IconLoader2 size={16} /> AI is crafting your day plan...
          </div>
        )}
      </div>

      {/* ─── Daily Habits ────────────────────────────────── */}
      <div id="habits-section">
        <SectionHeader icon={<IconCircleCheck size={15} />} title="Daily Habits" action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dailyHabits.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: habitsPct === 100 ? "#34D399" : "#9AA4B2" }}>
                {habitsDoneCount}/{dailyHabits.length} done
              </span>
            )}
            <button onClick={() => setShowAddHabit(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              <IconPlus size={12} /> Add
            </button>
          </div>
        } />

        {dailyHabits.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#7A8492" }}>
            <IconCircleCheck size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Add your daily rituals — prayers, workouts, reading, anything.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {dailyHabits.map((h) => {
              const catColor = getCategoryColor(h.category);
              return (
                <div key={h.id}
                  style={{ background: h.completed_today ? "rgba(52,211,153,0.08)" : "#0E1318", border: `1px solid ${h.completed_today ? "rgba(52,211,153,0.3)" : "#1D2535"}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s", cursor: "pointer" }}
                  onClick={() => toggleHabitComplete(h.id)}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: h.completed_today ? "#34D399" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, transition: "background 0.2s" }}>
                    {h.completed_today ? "✓" : h.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: h.completed_today ? "#34D399" : "#F0F4F8", textDecoration: h.completed_today ? "line-through" : "none" }}>{h.name}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: catColor, background: `${catColor}22`, padding: "1px 6px", borderRadius: 10 }}>{h.category.toUpperCase()}</span>
                      {h.current_streak > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "#F59E0B" }}>
                          <IconFlame size={11} /> {h.current_streak}d
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 5 }}>
                      <HabitHeatmap habitId={h.id} completions={completions} />
                    </div>
                  </div>
                  {/* Reminder button */}
                  {(() => {
                    const existingReminder = habitReminders.find((r) => r.habit_id === h.id);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        {existingReminder ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteHabitReminder(existingReminder.id); }}
                              title="Remove reminder"
                              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: existingReminder.enabled ? "#34D399" : "#7A8492", background: existingReminder.enabled ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)", border: "1px solid " + (existingReminder.enabled ? "rgba(52,211,153,0.3)" : "#242B35"), borderRadius: 12, padding: "3px 7px", cursor: "pointer" }}>
                              <IconBell size={10} />
                              {existingReminder.remind_time}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleHabitReminder(existingReminder.id, !existingReminder.enabled); }}
                              style={{ fontSize: 9, color: "#7A8492", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              {existingReminder.enabled ? "disable" : "enable"}
                            </button>
                          </div>
                        ) : reminderPickerHabitId === h.id ? (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                            <input
                              type="time"
                              value={reminderTime}
                              onChange={(e) => setReminderTime(e.target.value)}
                              style={{ background: "#0E1318", border: "1px solid #4A8FC2", borderRadius: 6, color: "#F0F4F8", fontSize: 11, padding: "3px 6px", width: 80 }}
                            />
                            <div style={{ display: "flex", gap: 4 }}>
                              <button type="button" onClick={() => { addHabitReminder(h.id, reminderTime); setReminderPickerHabitId(null); }}
                                style={{ fontSize: 10, fontWeight: 700, color: "#34D399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Save</button>
                              <button type="button" onClick={() => setReminderPickerHabitId(null)}
                                style={{ fontSize: 10, color: "#7A8492", background: "none", border: "1px solid #242B35", borderRadius: 6, padding: "3px 6px", cursor: "pointer" }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setReminderPickerHabitId(h.id); setReminderTime("08:00"); }}
                            title="Set reminder"
                            style={{ background: "none", border: "1px solid #242B35", borderRadius: 12, color: "#7A8492", padding: "3px 6px", cursor: "pointer", opacity: 0, transition: "opacity 0.2s", fontSize: 10 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}>
                            <IconBell size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <button type="button" onClick={(e) => { e.stopPropagation(); deleteDailyHabit(h.id); }}
                    style={{ background: "none", border: "none", color: "#7A8492", cursor: "pointer", padding: 4, borderRadius: 6, opacity: 0, transition: "opacity 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}>
                    <IconTrash size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddProject && <AddProjectModal onClose={() => { setShowAddProject(false); fetchActiveProjects(); }} />}
      {showAddHabit && <AddHabitModal onClose={() => { setShowAddHabit(false); fetchDailyHabits(); }} />}
      {logSession && <LogSessionModal project={logSession} onClose={() => { setLogSession(null); fetchActiveProjects(); }} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
