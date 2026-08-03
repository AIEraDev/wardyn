import React, { useState } from "react";
import {
  IconCalendar,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconRefresh,
  IconBell,
  IconBellOff,
  IconPlus,
  IconTrash,
  IconExternalLink,
  IconAlertTriangle,
  IconFilter,
  IconLoader2,
  IconMapPin,
  IconChevronDown,
  IconChevronUp,
  IconBrain,
  IconCalendarPlus,
  IconRepeat,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import { SyncedCalendarEvent, CalendarIntent } from "../types/queue";

// ─── Reminder timing options ──────────────────────────────────────────────────
const REMINDER_OPTIONS: { label: string; minutes: number }[] = [
  { label: "At event time", minutes: 0 },
  { label: "15 min before", minutes: 15 },
  { label: "30 min before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "3 hours before", minutes: 180 },
  { label: "1 day before", minutes: 1440 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatEventDate(iso: string, isAllDay: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isAllDay)
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEndTime(end: string | null, isAllDay: boolean): string | null {
  if (!end) return null;
  const d = new Date(end);
  if (isAllDay) return null;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(iso: string): number {
  const now = Date.now();
  const then = new Date(iso).getTime();
  return Math.ceil((then - now) / 86400000);
}

function urgencyColor(days: number): {
  text: string;
  bg: string;
  border: string;
} {
  if (days < 0)
    return {
      text: "#6B7280",
      bg: "rgba(107,114,128,0.08)",
      border: "rgba(107,114,128,0.2)",
    };
  if (days === 0)
    return {
      text: "#EF4444",
      bg: "rgba(239,68,68,0.1)",
      border: "rgba(239,68,68,0.3)",
    };
  if (days <= 2)
    return {
      text: "#F59E0B",
      bg: "rgba(245,158,11,0.1)",
      border: "rgba(245,158,11,0.3)",
    };
  if (days <= 7)
    return {
      text: "#4A8FC2",
      bg: "rgba(74,143,194,0.1)",
      border: "rgba(74,143,194,0.3)",
    };
  return {
    text: "#34D399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.2)",
  };
}

function urgencyLabel(days: number): string {
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `${days}d away`;
  return `${days}d`;
}

function isUrgentEvent(evt: SyncedCalendarEvent): boolean {
  const s = evt.summary.toLowerCase();
  return (
    s.includes("visa") ||
    s.includes("ukvi") ||
    s.includes("deadline") ||
    s.includes("urgent") ||
    s.includes("expire") ||
    s.includes("submit")
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────
const EventCard: React.FC<{
  evt: SyncedCalendarEvent;
  onDelete?: (id: string) => void;
  onSetReminder: (
    id: string,
    summary: string,
    date: string,
    mins: number,
  ) => void;
  reminderSet: boolean;
}> = ({ evt, onDelete, onSetReminder, reminderSet }) => {
  const [expanded, setExpanded] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [savingReminder, setSavingReminder] = useState(false);

  const days = daysUntil(evt.event_date);
  const colors = urgencyColor(days);
  const urgent = isUrgentEvent(evt);
  const endFmt = formatEndTime(evt.end_time, evt.is_all_day);
  const isPast = days < 0;

  const handleSaveReminder = async () => {
    setSavingReminder(true);
    await onSetReminder(evt.id, evt.summary, evt.event_date, reminderMinutes);
    setSavingReminder(false);
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        urgent
          ? "bg-[#181A14] border-[rgba(245,158,11,0.35)]"
          : isPast
            ? "bg-[#10131A] border-[#1A1F27] opacity-60"
            : "bg-[#151A21] border-[#242B35]"
      }`}
    >
      {/* Main row */}
      <div className="p-3.5 flex items-start gap-3">
        {/* Icon */}
        <div
          className="p-2 rounded-lg shrink-0 mt-0.5"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
          }}
        >
          {urgent ? (
            <IconAlertTriangle size={16} style={{ color: colors.text }} />
          ) : (
            <IconCalendarEvent size={16} style={{ color: colors.text }} />
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[#F0F4F8] m-0 truncate max-w-[280px]">
              {evt.summary}
            </p>
            {/* Source badge */}
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                color: colors.text,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
              }}
            >
              {evt.source === "custom"
                ? "custom"
                : evt.source === "email"
                  ? "from email"
                  : "gcal"}
            </span>
            {reminderSet && (
              <span className="font-mono text-[9px] text-[#34D399] flex items-center gap-0.5">
                <IconBell size={9} /> reminder set
              </span>
            )}
          </div>

          {/* Date/time line */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-[11px] text-[#9AA4B2] flex items-center gap-1">
              <IconClock size={11} />
              {formatEventDate(evt.event_date, evt.is_all_day)}
              {endFmt && <span className="text-[#4A5568]">→ {endFmt}</span>}
            </span>
            {evt.location && (
              <span className="font-mono text-[11px] text-[#7A8492] flex items-center gap-0.5 truncate max-w-[200px]">
                <IconMapPin size={10} /> {evt.location}
              </span>
            )}
          </div>
        </div>

        {/* Right side: urgency badge + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
            style={{
              color: colors.text,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
            }}
          >
            {urgencyLabel(days)}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-[#4A5568] hover:text-[#9AA4B2] transition-colors cursor-pointer bg-transparent border-0"
            aria-label="Expand event"
          >
            {expanded ? (
              <IconChevronUp size={14} />
            ) : (
              <IconChevronDown size={14} />
            )}
          </button>
          {evt.source === "custom" && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(evt.id)}
              className="p-1 rounded text-[#4A5568] hover:text-[#EF4444] transition-colors cursor-pointer bg-transparent border-0"
              aria-label="Delete event"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-[#1A1F27] mt-0 space-y-3">
          {/* Description */}
          {evt.description && (
            <p className="text-[11px] text-[#7A8492] leading-relaxed mt-3">
              {evt.description.length > 200
                ? evt.description.slice(0, 200) + "…"
                : evt.description}
            </p>
          )}

          {/* Reminder setter */}
          {!isPast && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-[#7A8492] flex items-center gap-1">
                <IconBell size={11} className="text-[#4A8FC2]" /> Set reminder:
              </span>
              <select
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="bg-[#0D1117] text-[11px] text-[#F0F4F8] font-mono px-2 py-0.5 rounded border border-[#242B35] cursor-pointer focus:outline-none focus:border-[#4A8FC2]"
              >
                {REMINDER_OPTIONS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveReminder}
                disabled={savingReminder}
                className="font-mono text-[11px] text-[#4A8FC2] bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.3)] px-2.5 py-0.5 rounded hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {savingReminder ? (
                  <>
                    <IconLoader2 size={11} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <IconBell size={11} /> Save Reminder
                  </>
                )}
              </button>
              {evt.source !== "custom" && (
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[#4A5568] hover:text-[#7A8492] flex items-center gap-1 ml-auto"
                >
                  Open in Google <IconExternalLink size={11} />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
type FilterKey = "all" | "gcal" | "custom" | "urgent" | "past";

export const DeadlinesTab: React.FC = () => {
  const {
    calendarEvents,
    syncCalendarDeadlines,
    addCustomCalendarEvent,
    deleteCustomCalendarEvent,
    setCalendarReminder,
    reminders,
    calendarIntelligence,
    fetchCalendarIntelligence,
    pushItemToCalendar,
  } = useQueueStore();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [syncing, setSyncing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);

  // Add form state
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAllDay, setNewAllDay] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track which event IDs have a reminder set (from the reminders store)
  const reminderEventIds = new Set(reminders.map((r) => r.item_id));

  const handleSync = async () => {
    setSyncing(true);
    await syncCalendarDeadlines();
    setSyncing(false);
    // Refresh intelligence after sync so decisions reflect newly triaged items
    fetchCalendarIntelligence().catch(console.error);
  };

  const handleLoadIntelligence = async () => {
    setLoadingIntelligence(true);
    await fetchCalendarIntelligence();
    setLoadingIntelligence(false);
    setShowIntelligence(true);
  };

  const handlePushToCalendar = async (itemId: string) => {
    setPushingId(itemId);
    await pushItemToCalendar(itemId);
    setPushingId(null);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    setSaving(true);
    await addCustomCalendarEvent(
      newTitle.trim(),
      new Date(newDate).toISOString(),
      newEndDate ? new Date(newEndDate).toISOString() : undefined,
      newDesc.trim() || undefined,
      newLocation.trim() || undefined,
      newAllDay,
    );
    setSaving(false);
    setNewTitle("");
    setNewDate("");
    setNewEndDate("");
    setNewLocation("");
    setNewDesc("");
    setNewAllDay(false);
    setShowAddForm(false);
  };

  const handleSetReminder = async (
    eventId: string,
    eventSummary: string,
    eventDate: string,
    minutesBefore: number,
  ) => {
    await setCalendarReminder(eventId, eventSummary, eventDate, minutesBefore);
  };

  // Filter events
  const now = Date.now();
  const filtered = calendarEvents.filter((evt) => {
    const ms = new Date(evt.event_date).getTime();
    if (filter === "gcal") return evt.source === "gcal";
    if (filter === "custom") return evt.source === "custom";
    if (filter === "urgent") return isUrgentEvent(evt) && ms >= now;
    if (filter === "past") return ms < now;
    return ms >= now || evt.source === "custom"; // "all" = upcoming + custom
  });

  // Counts for filter pills
  const counts: Record<FilterKey, number> = {
    all: calendarEvents.filter(
      (e) => new Date(e.event_date).getTime() >= now || e.source === "custom",
    ).length,
    gcal: calendarEvents.filter((e) => e.source === "gcal").length,
    custom: calendarEvents.filter((e) => e.source === "custom").length,
    urgent: calendarEvents.filter(
      (e) => isUrgentEvent(e) && new Date(e.event_date).getTime() >= now,
    ).length,
    past: calendarEvents.filter(
      (e) => new Date(e.event_date).getTime() < now && e.source !== "custom",
    ).length,
  };

  const FILTERS: { key: FilterKey; label: string; activeClass: string }[] = [
    {
      key: "all",
      label: `All (${counts.all})`,
      activeClass:
        "text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border-[rgba(74,143,194,0.35)]",
    },
    {
      key: "gcal",
      label: `Google Cal (${counts.gcal})`,
      activeClass:
        "text-[#34D399] bg-[rgba(52,211,153,0.1)]  border-[rgba(52,211,153,0.3)]",
    },
    {
      key: "custom",
      label: `Custom (${counts.custom})`,
      activeClass:
        "text-[#9AA4B2] bg-[rgba(154,164,178,0.1)] border-[rgba(154,164,178,0.3)]",
    },
    {
      key: "urgent",
      label: `⚠ Urgent (${counts.urgent})`,
      activeClass:
        "text-[#F59E0B] bg-[rgba(245,158,11,0.1)]  border-[rgba(245,158,11,0.3)]",
    },
    {
      key: "past",
      label: `Past (${counts.past})`,
      activeClass:
        "text-[#4A5568] bg-[rgba(74,85,104,0.1)]   border-[rgba(74,85,104,0.3)]",
    },
  ];

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#F0F4F8] m-0 tracking-tight">
            Calendar & Deadlines
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Google Calendar events, reminders &amp; custom commitments
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadIntelligence}
            disabled={loadingIntelligence}
            className="font-mono text-xs bg-[#151A21] text-[#9AA4B2] border border-[#242B35] px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-[#181E27] hover:text-[#F0F4F8] transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconBrain
              size={13}
              className={
                loadingIntelligence ? "animate-pulse text-[#4A8FC2]" : ""
              }
            />
            {loadingIntelligence ? "Analysing…" : "Smart Decisions"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="font-mono text-xs bg-[#151A21] text-[#34D399] border border-[rgba(52,211,153,0.3)] px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-[#181E27] transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconRefresh size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Calendar"}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="font-mono text-xs bg-[#4A8FC2] text-black px-3 py-1.5 rounded-md font-semibold hover:bg-[#5b9bd1] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <IconPlus size={14} /> Add Event
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(({ key, label, activeClass }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`font-mono text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
              filter === key
                ? activeClass
                : "bg-[#151A21] text-[#7A8492] border-[#242B35] hover:text-[#9AA4B2]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Smart Intelligence Panel ── */}
      {showIntelligence && (
        <div className="rounded-xl border border-[rgba(74,143,194,0.25)] bg-[#0D1117] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A1F27]">
            <span className="font-mono text-[11px] font-semibold text-[#4A8FC2] flex items-center gap-1.5 uppercase tracking-wider">
              <IconBrain size={13} /> Smart Calendar Decisions
            </span>
            <button
              type="button"
              onClick={() => setShowIntelligence(false)}
              className="font-mono text-[10px] text-[#4A5568] hover:text-[#9AA4B2] cursor-pointer bg-transparent border-0"
            >
              dismiss
            </button>
          </div>

          {calendarIntelligence.length === 0 ? (
            <p className="text-[11px] text-[#4A5568] font-mono px-4 py-3 m-0">
              No actionable emails found. Sync Gmail first to populate
              decisions.
            </p>
          ) : (
            <div className="divide-y divide-[#1A1F27]">
              {calendarIntelligence.map((intent) => {
                const isPushing = pushingId === intent.item_id;
                const recurrenceIcon =
                  intent.recurrence_rule === "daily"
                    ? "🔁 Daily"
                    : intent.recurrence_rule === "every_2_days"
                      ? "🔁 Every 2 days"
                      : intent.recurrence_rule === "weekly"
                        ? "🔁 Weekly"
                        : intent.recurrence_rule === "weekdays"
                          ? "🔁 Weekdays"
                          : null;

                return (
                  <div
                    key={intent.item_id}
                    className="px-4 py-3 flex items-start gap-3"
                  >
                    {/* Decision indicator */}
                    <div
                      className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        intent.should_add_to_calendar
                          ? "bg-[#34D399]"
                          : "bg-[#2E3647]"
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      {/* Sender + preview */}
                      <p className="text-[11px] text-[#9AA4B2] m-0 truncate">
                        <span className="text-[#F0F4F8] font-medium">
                          {intent.sender.split("<")[0].trim().slice(0, 30)}
                        </span>
                        {" · "}
                        {intent.preview}
                      </p>

                      {intent.should_add_to_calendar && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {/* Event title */}
                          <span className="font-mono text-[10px] text-[#4A8FC2] truncate max-w-[200px]">
                            {intent.event_title}
                          </span>

                          {/* Date */}
                          {intent.event_date && (
                            <span className="font-mono text-[10px] text-[#7A8492] flex items-center gap-0.5">
                              <IconClock size={9} />
                              {new Date(intent.event_date).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          )}

                          {/* Recurrence badge */}
                          {recurrenceIcon && (
                            <span className="font-mono text-[9px] text-[#E8A23D] bg-[rgba(232,162,61,0.1)] border border-[rgba(232,162,61,0.25)] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <IconRepeat size={8} /> {recurrenceIcon}
                            </span>
                          )}

                          {/* Lead time */}
                          <span className="font-mono text-[9px] text-[#4A5568]">
                            {intent.reminder_lead_minutes === 0
                              ? "remind at time"
                              : intent.reminder_lead_minutes < 60
                                ? `remind ${intent.reminder_lead_minutes}m before`
                                : intent.reminder_lead_minutes === 60
                                  ? "remind 1h before"
                                  : `remind ${(intent.reminder_lead_minutes / 60) | 0}h before`}
                          </span>
                        </div>
                      )}

                      {/* Reason */}
                      <p className="font-mono text-[10px] text-[#4A5568] m-0 mt-0.5 truncate">
                        {intent.reason}
                      </p>
                    </div>

                    {/* Action */}
                    {intent.should_add_to_calendar && (
                      <button
                        type="button"
                        onClick={() => handlePushToCalendar(intent.item_id)}
                        disabled={isPushing}
                        className="font-mono text-[10px] text-[#34D399] bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.2)] px-2 py-0.5 rounded hover:bg-[rgba(52,211,153,0.15)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        {isPushing ? (
                          <>
                            <IconLoader2 size={10} className="animate-spin" />{" "}
                            Adding…
                          </>
                        ) : (
                          <>
                            <IconCalendarPlus size={10} /> Add
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary footer */}
          {calendarIntelligence.length > 0 && (
            <div className="px-4 py-2 border-t border-[#1A1F27] flex items-center justify-between">
              <span className="font-mono text-[10px] text-[#4A5568]">
                {
                  calendarIntelligence.filter((i) => i.should_add_to_calendar)
                    .length
                }{" "}
                of {calendarIntelligence.length} emails warrant a calendar entry
              </span>
              <button
                type="button"
                onClick={async () => {
                  const toAdd = calendarIntelligence.filter(
                    (i) => i.should_add_to_calendar,
                  );
                  for (const intent of toAdd) {
                    await handlePushToCalendar(intent.item_id);
                  }
                }}
                disabled={pushingId !== null}
                className="font-mono text-[10px] text-[#4A8FC2] hover:underline cursor-pointer bg-transparent border-0 disabled:opacity-50"
              >
                Add all →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add event form */}
      {showAddForm && (
        <form
          onSubmit={handleAddEvent}
          className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3"
        >
          <h4 className="text-sm font-semibold text-[#F0F4F8] m-0 flex items-center gap-2">
            <IconCalendarEvent size={16} className="text-[#4A8FC2]" />
            Add Custom Event
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Event title…"
              required
              className="col-span-2 bg-[#0D1117] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] placeholder:text-[#4A5568]"
            />
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-[#7A8492]">
                Start
              </label>
              <input
                type={newAllDay ? "date" : "datetime-local"}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full bg-[#0D1117] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-[#7A8492]">
                End (optional)
              </label>
              <input
                type={newAllDay ? "date" : "datetime-local"}
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full bg-[#0D1117] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
              />
            </div>
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Location (optional)"
              className="bg-[#0D1117] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] placeholder:text-[#4A5568]"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="bg-[#0D1117] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] placeholder:text-[#4A5568]"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newAllDay}
              onChange={(e) => setNewAllDay(e.target.checked)}
              className="accent-[#4A8FC2]"
            />
            <span className="font-mono text-[11px] text-[#9AA4B2]">
              All-day event
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="font-mono text-xs bg-[#4A8FC2] text-black px-4 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <IconLoader2 size={12} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <IconCheck size={12} /> Save Event
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="font-mono text-xs text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer bg-transparent border-0"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Events list */}
      {syncing && filtered.length === 0 ? (
        <div className="p-8 bg-[#151A21] border border-[#242B35] rounded-xl flex items-center gap-3">
          <IconLoader2
            size={16}
            className="text-[#4A8FC2] animate-spin shrink-0"
          />
          <div>
            <p className="text-xs font-semibold text-[#F0F4F8] m-0">
              Syncing calendar…
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
              Fetching upcoming events from Google Calendar.
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconCalendar size={28} className="mx-auto text-[#4A8FC2]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">
            No events found
          </h4>
          <p className="text-xs text-[#7A8492] max-w-xs mx-auto leading-relaxed">
            {filter === "past"
              ? "No past events in range."
              : "Sync your Google Calendar or add a custom event. Deadline emails auto-create events here."}
          </p>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="font-mono text-xs text-[#4A8FC2] hover:underline cursor-pointer bg-transparent border-0 flex items-center gap-1 mx-auto"
          >
            <IconRefresh size={12} /> Sync Calendar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((evt) => (
            <EventCard
              key={evt.id}
              evt={evt}
              onDelete={
                evt.source === "custom" ? deleteCustomCalendarEvent : undefined
              }
              onSetReminder={handleSetReminder}
              reminderSet={reminderEventIds.has(evt.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
