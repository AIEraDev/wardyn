import React, { useEffect, useRef, useState } from "react";
import {
  IconMail,
  IconInbox,
  IconRefresh,
  IconTag,
  IconSearch,
  IconSparkles,
  IconFilter,
  IconEyeOff,
  IconChevronDown,
  IconChevronUp,
  IconBookmark,
  IconCircleCheck,
  IconLoader2,
  IconAlertTriangle,
  IconClock,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import { ReplyCard } from "./ReplyCard";
import { QueueItem } from "../types/queue";

// ─── Category helpers ─────────────────────────────────────────────────────────

type CategoryKey =
  | "primary"
  | "updates"
  | "promotions"
  | "social"
  | "forums"
  | "all";

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; color: string; bg: string; border: string }
> = {
  all: {
    label: "All",
    color: "#9AA4B2",
    bg: "rgba(154,164,178,0.1)",
    border: "rgba(154,164,178,0.25)",
  },
  primary: {
    label: "Primary",
    color: "#4A8FC2",
    bg: "rgba(74,143,194,0.12)",
    border: "rgba(74,143,194,0.3)",
  },
  updates: {
    label: "Updates",
    color: "#34D399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.3)",
  },
  promotions: {
    label: "Promotions",
    color: "#E8A23D",
    bg: "rgba(232,162,61,0.12)",
    border: "rgba(232,162,61,0.3)",
  },
  social: {
    label: "Social",
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.3)",
  },
  forums: {
    label: "Forums",
    color: "#F87171",
    bg: "rgba(248,113,113,0.12)",
    border: "rgba(248,113,113,0.3)",
  },
};

function extractCategory(preview: string): CategoryKey {
  const match = preview.match(
    /^\[(PRIMARY|UPDATES|PROMOTIONS|SOCIAL|FORUMS)\]/i,
  );
  if (!match) return "primary";
  return match[1].toLowerCase() as CategoryKey;
}

function stripCategoryPrefix(preview: string): string {
  return preview.replace(
    /^\[(?:PRIMARY|UPDATES|PROMOTIONS|SOCIAL|FORUMS)\]\s*/i,
    "",
  );
}

function parseSenderName(raw: string): string {
  const nameMatch = raw.match(/^([^<]+)\s*</);
  if (nameMatch) return nameMatch[1].trim();
  const emailMatch = raw.match(/<([^>]+)>/);
  if (emailMatch) return emailMatch[1].trim();
  return raw.trim();
}

function parseSenderEmail(raw: string): string {
  const emailMatch = raw.match(/<([^>]+)>/);
  if (emailMatch) return emailMatch[1].trim();
  if (raw.includes("@")) return raw.trim();
  return "";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Informational row ────────────────────────────────────────────────────────
// Compact, read-only. No draft, no approve button. Just sender + subject + time.

const InfoRow: React.FC<{ item: QueueItem }> = ({ item }) => {
  const [open, setOpen] = useState(false);
  const cat = extractCategory(item.preview);
  const cleanPreview = stripCategoryPrefix(item.preview);
  const senderName = parseSenderName(item.sender);

  // Extract subject (text before the first ": " after category strip)
  const subjectMatch = cleanPreview.match(/^([^:]+):/);
  const subject = subjectMatch ? subjectMatch[1].trim() : senderName;
  const body = subjectMatch
    ? cleanPreview.slice(subjectMatch[0].length).trim()
    : cleanPreview;

  return (
    <div
      className={`rounded-xl border transition-all overflow-hidden ${
        open
          ? "border-[rgba(52,211,153,0.25)] bg-[#121A15]"
          : "border-[#1E2A20] bg-[#111814]"
      }`}
    >
      <div
        className="px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-[rgba(52,211,153,0.04)] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Dot indicator */}
        <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]/40 shrink-0" />

        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-xs font-medium text-[#9AA4B2] shrink-0 max-w-[140px] truncate">
            {senderName}
          </span>
          <span className="text-xs text-[#7A8492] truncate flex-1">
            {subject}
          </span>
          <CategoryPill cat={cat} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-[#4A5568]">
            {relativeTime(item.created_at)}
          </span>
          {open ? (
            <IconChevronUp size={12} className="text-[#4A5568]" />
          ) : (
            <IconChevronDown size={12} className="text-[#4A5568]" />
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-[#1E2A20]">
          <p className="text-[11px] text-[#7A8492] leading-relaxed">
            {body || cleanPreview}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Suppressed row ───────────────────────────────────────────────────────────

const CategoryPill: React.FC<{ cat: CategoryKey }> = ({ cat }) => {
  const meta = CATEGORY_META[cat];
  return (
    <span
      className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
      style={{
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label}
    </span>
  );
};

const SuppressedRow: React.FC<{ item: QueueItem }> = ({ item }) => {
  const [open, setOpen] = useState(false);
  const cat = extractCategory(item.preview);
  const cleanPreview = stripCategoryPrefix(item.preview);
  const senderName = parseSenderName(item.sender);

  return (
    <div className="rounded-xl border border-[#1A1F27] bg-[#0F1217] opacity-40 overflow-hidden">
      <div
        className="px-3 py-2 flex items-center gap-3 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <IconEyeOff size={11} className="text-[#3A4255] shrink-0" />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-[11px] text-[#3A4255] truncate">
            {senderName}
          </span>
          <CategoryPill cat={cat} />
        </div>
        <span className="font-mono text-[9px] text-[#2E3647]">
          {relativeTime(item.created_at)}
        </span>
        {open ? (
          <IconChevronUp size={11} className="text-[#3A4255]" />
        ) : (
          <IconChevronDown size={11} className="text-[#3A4255]" />
        )}
      </div>
      {open && (
        <div className="px-3 pb-2.5 pt-1 border-t border-[#1A1F27] space-y-1">
          <p className="text-[10px] text-[#3A4255] leading-relaxed">
            {cleanPreview}
          </p>
          <p className="font-mono text-[9px] text-[#2A3040]">
            Filtered: automated sender / marketing noise
          </p>
        </div>
      )}
    </div>
  );
};

// ─── View mode type ───────────────────────────────────────────────────────────

type ViewMode = "reply" | "digest" | "all";

// ─── Main component ───────────────────────────────────────────────────────────

export const MessagesTab: React.FC = () => {
  const {
    items,
    gmailAccounts,
    syncGmail,
    isLoading,
    checkGmailStatus,
    connectGmail,
    gmailSyncStatus,
    gmailSyncError,
    lastGmailSync,
  } = useQueueStore();
  const gmailItems = items.filter((i) => i.source === "gmail");

  // Re-check Gmail status on mount and on visibility change so the
  // connected/disconnected state is always current when switching tabs
  React.useEffect(() => {
    checkGmailStatus();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkGmailStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkGmailStatus]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem("wardyn.messagesViewMode") as ViewMode | null;
      return (saved && ["reply", "digest", "all"].includes(saved)) ? saved : "reply";
    } catch { return "reply"; }
  });
  const setViewModeAndPersist = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem("wardyn.messagesViewMode", mode); } catch {}
  };
  const [activeFilter, setActiveFilter] = useState<CategoryKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 250);
  };
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Pools ─────────────────────────────────────────────────────────────────
  const replyItems = gmailItems.filter(
    (i) =>
      i.needs_reply &&
      i.triage_status !== "suppressed" &&
      i.triage_status !== "informational" &&
      // UX-12: exclude sent/skipped from the reply queue so the list only shows actionable items
      i.status !== "sent" &&
      i.status !== "skipped" &&
      i.status !== "approved" &&
      i.status !== "edited",
  );
  const infoItems = gmailItems.filter(
    (i) =>
      i.triage_status === "informational" ||
      (!i.needs_reply && i.triage_status === "active"),
  );
  const suppressedItems = gmailItems.filter(
    (i) => i.triage_status === "suppressed",
  );

  const replyPending = replyItems.filter((i) => i.status === "pending").length;

  // ── Current pool based on view ────────────────────────────────────────────
  const currentPool =
    viewMode === "reply"
      ? replyItems
      : viewMode === "digest"
        ? infoItems
        : gmailItems.filter((i) => i.triage_status !== "suppressed");

  const filteredItems = currentPool.filter((item) => {
    const cat = extractCategory(item.preview);
    if (activeFilter !== "all" && cat !== activeFilter) return false;

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      const senderName = parseSenderName(item.sender).toLowerCase();
      const senderEmail = parseSenderEmail(item.sender).toLowerCase();
      if (
        !senderName.includes(q) &&
        !senderEmail.includes(q) &&
        !item.preview.toLowerCase().includes(q) &&
        !(item.draft_text?.toLowerCase().includes(q) ?? false)
      )
        return false;
    }
    return true;
  });

  // Reply view: flagged → high urgency → confidence → date; digest/all: newest first
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (viewMode === "reply") {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      const aHigh = a.urgency === "high" || a.urgency == null;
      const bHigh = b.urgency === "high" || b.urgency == null;
      if (aHigh !== bHigh) return aHigh ? -1 : 1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const countForCat = (cat: CategoryKey) => {
    return cat === "all"
      ? currentPool.length
      : currentPool.filter((i) => extractCategory(i.preview) === cat).length;
  };

  // ── View mode tab config ──────────────────────────────────────────────────
  const VIEW_TABS: {
    id: ViewMode;
    label: string;
    count: number;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      id: "reply",
      label: "Needs Reply",
      count: replyPending,
      icon: <IconSparkles size={11} />,
      activeClass: "bg-[#4A8FC2] text-black",
    },
    {
      id: "digest",
      label: "Informational",
      count: infoItems.length,
      icon: <IconBookmark size={11} />,
      activeClass:
        "bg-[rgba(52,211,153,0.2)] text-[#34D399] border border-[rgba(52,211,153,0.3)]",
    },
    {
      id: "all",
      label: "All",
      count: gmailItems.filter((i) => i.triage_status !== "suppressed").length,
      icon: <IconInbox size={11} />,
      activeClass: "bg-[#181E27] text-[#F0F4F8] border border-[#242B35]",
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#F0F4F8] m-0 tracking-tight">
            Messages
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Smart Gmail Triage
            {gmailAccounts.length > 1
              ? ` · ${gmailAccounts.length} Accounts`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {gmailAccounts.length > 0 && (
            <button
              onClick={syncGmail}
              disabled={
                isLoading ||
                gmailSyncStatus === "syncing" ||
                gmailSyncStatus === "connecting"
              }
              className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#151A21] hover:bg-[#181E27] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <IconRefresh
                size={13}
                className={
                  isLoading || gmailSyncStatus === "syncing"
                    ? "animate-spin"
                    : ""
                }
              />
              {gmailSyncStatus === "syncing" ? "Syncing…" : "Sync"}
            </button>
          )}
          {/* Last sync timestamp */}
          {gmailAccounts.length > 0 &&
            gmailSyncStatus === "idle" &&
            lastGmailSync && (
              <span className="font-mono text-[10px] text-[#4A5568] flex items-center gap-1 whitespace-nowrap">
                <IconClock size={10} />
                {(() => {
                  const diff = Date.now() - new Date(lastGmailSync).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return "Just synced";
                  if (mins < 60) return `Synced ${mins}m ago`;
                  return `Synced ${Math.floor(mins / 60)}h ago`;
                })()}
              </span>
            )}
          <span
            className={`font-mono text-xs font-semibold px-2.5 py-1 rounded-md border whitespace-nowrap ${
              replyPending > 0
                ? "bg-[rgba(245,158,11,0.12)] text-[#F59E0B] border-[rgba(245,158,11,0.28)]"
                : "bg-[rgba(52,211,153,0.12)] text-[#34D399] border-[rgba(52,211,153,0.25)]"
            }`}
          >
            {replyPending > 0
              ? `${replyPending} need reply`
              : "✓ All caught up"}
          </span>
          <span className="font-mono text-xs px-2 py-1 rounded-md bg-[#151A21] text-[#7A8492] border border-[#242B35] whitespace-nowrap">
            {gmailItems.length} synced
          </span>
        </div>
      </div>

      {gmailAccounts.length > 0 && (
        <div className="space-y-3">
          {/* ── Sync error inline banner ── */}
          {gmailSyncStatus === "error" && gmailSyncError && (
            <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2">
              <IconAlertTriangle
                size={13}
                className="text-[#EF4444] mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#EF4444] m-0 leading-snug break-words">
                  {gmailSyncError}
                </p>
                <button
                  onClick={syncGmail}
                  className="mt-1 font-mono text-[10px] text-[#4A8FC2] hover:underline cursor-pointer bg-transparent border-0 p-0"
                >
                  Retry sync →
                </button>
              </div>
            </div>
          )}

          {/* ── Three-tier view toggle ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-[#151A21] p-1 rounded-lg border border-[#242B35] gap-0.5">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setViewModeAndPersist(tab.id)}
                  className={`font-mono text-[11px] px-3 py-1 rounded-md flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    viewMode === tab.id
                      ? tab.activeClass + " font-semibold"
                      : "text-[#7A8492] hover:text-[#9AA4B2]"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        viewMode === tab.id
                          ? tab.id === "reply"
                            ? "bg-black/20 text-black"
                            : "bg-white/10 text-inherit"
                          : "bg-[rgba(255,255,255,0.06)] text-[#7A8492]"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {suppressedItems.length > 0 && (
              <span className="font-mono text-[10px] text-[#3A4255] flex items-center gap-1">
                <IconFilter size={10} />
                {suppressedItems.length} noise filtered
              </span>
            )}
          </div>

          {/* ── Category filter pills ── */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(CATEGORY_META) as CategoryKey[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = countForCat(cat);
              const isActive = activeFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`font-mono text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "font-semibold"
                      : "bg-[#151A21] text-[#9AA4B2] border border-[#242B35] hover:text-[#F0F4F8]"
                  }`}
                  style={
                    isActive
                      ? {
                          color: meta.color,
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                        }
                      : {}
                  }
                >
                  {cat !== "all" && (
                    <IconTag
                      size={11}
                      className={isActive ? "opacity-100" : "opacity-50"}
                    />
                  )}
                  <span>{meta.label}</span>
                  <span
                    className="text-[9px] font-semibold px-1.5 rounded-full font-mono"
                    style={{
                      background: isActive
                        ? meta.border
                        : "rgba(255,255,255,0.06)",
                      color: isActive ? meta.color : "#7A8492",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Search ── */}
          <div className="relative">
            <IconSearch
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A8492]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by sender, subject, or content…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151A21] text-[#F0F4F8] rounded-md border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] font-mono"
            />
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      {gmailSyncStatus === "connecting" ? (
        <div className="p-6 bg-[#151A21] border border-[rgba(74,143,194,0.25)] rounded-xl flex items-center gap-3">
          <IconLoader2
            size={16}
            className="text-[#4A8FC2] animate-spin shrink-0"
          />
          <div>
            <p className="text-xs font-semibold text-[#F0F4F8] m-0">
              Waiting for Gmail authentication…
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
              Complete the sign-in in the browser window that opened.
            </p>
          </div>
        </div>
      ) : isLoading || gmailSyncStatus === "syncing" ? (
        <div className="p-6 bg-[#151A21] border border-[#242B35] rounded-xl flex items-center gap-3">
          <IconLoader2
            size={16}
            className="text-[#4A8FC2] animate-spin shrink-0"
          />
          <div>
            <p className="text-xs font-semibold text-[#F0F4F8] m-0">
              Syncing inbox…
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
              Fetching emails and triaging with AI — this takes a few seconds.
            </p>
          </div>
        </div>
      ) : gmailSyncStatus === "error" && gmailAccounts.length === 0 ? (
        <div className="p-6 bg-[#151A21] border border-[rgba(239,68,68,0.25)] rounded-xl flex items-start gap-3">
          <IconAlertTriangle
            size={16}
            className="text-[#EF4444] shrink-0 mt-0.5"
          />
          <div>
            <p className="text-xs font-semibold text-[#F0F4F8] m-0">
              Gmail sync failed
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0 break-words">
              {gmailSyncError ?? "An error occurred during sync."}
            </p>
            <button
              onClick={syncGmail}
              className="mt-2 font-mono text-[11px] text-[#4A8FC2] hover:underline cursor-pointer bg-transparent border-0 p-0"
            >
              Retry sync →
            </button>
          </div>
        </div>
      ) : gmailAccounts.length === 0 ? (
        <div className="p-8 bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.25)] flex items-center justify-center text-[#4A8FC2]">
            <IconMail size={20} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">
              Gmail Not Connected
            </h4>
            <p className="text-xs text-[#7A8492] max-w-xs m-0 mt-1 leading-relaxed">
              Connect your Gmail account to start smart triage — AI will sort
              what needs your reply from everything else.
            </p>
          </div>
          <button
            onClick={connectGmail}
            className="font-mono text-xs px-3.5 py-1.5 rounded-md bg-[#4A8FC2] text-black font-semibold hover:bg-[#5b9bd1] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <IconMail size={13} /> Connect Gmail
          </button>
        </div>
      ) : sortedItems.length === 0 && !searchQuery ? (
        /* ── Empty states per view mode ── */
        viewMode === "reply" ? (
          <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.25)] flex items-center justify-center text-[#34D399]">
              <IconCircleCheck size={20} />
            </div>
            <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">
              Reply queue clear
            </h4>
            <p className="text-xs text-[#7A8492] max-w-xs m-0 leading-relaxed">
              No emails need a reply right now.
              {infoItems.length > 0 && (
                <span className="block mt-1 text-[#4A5568]">
                  {infoItems.length} informational message
                  {infoItems.length > 1 ? "s" : ""} in your digest →{" "}
                  <button
                    onClick={() => setViewModeAndPersist("digest")}
                    className="text-[#34D399] hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    View Digest
                  </button>
                </span>
              )}
            </p>
            {gmailItems.length > 0 && (
              <button
                onClick={syncGmail}
                className="mt-1 font-mono text-xs px-3 py-1.5 rounded-md bg-[#181E27] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] hover:bg-[rgba(74,143,194,0.1)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <IconRefresh size={12} /> Check for New Mail
              </button>
            )}
          </div>
        ) : viewMode === "digest" ? (
          <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.15)] flex items-center justify-center text-[#34D399]/60">
              <IconBookmark size={20} />
            </div>
            <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">
              Digest is empty
            </h4>
            <p className="text-xs text-[#7A8492] m-0">
              No informational emails yet. Sync to check for new mail.
            </p>
          </div>
        ) : (
          <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl">
            <p className="text-xs text-[#7A8492] m-0">
              No messages. Sync to fetch new mail.
            </p>
          </div>
        )
      ) : filteredItems.length === 0 ? (
        <div className="p-6 text-center bg-[#151A21] border border-[#242B35] rounded-xl">
          <p className="text-xs text-[#7A8492] m-0">
            {searchQuery
              ? `No matches for "${searchQuery}".`
              : "No messages match the current filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Reply view: full ReplyCards ── */}
          {viewMode === "reply" &&
            sortedItems.map((item) => <ReplyCard key={item.id} item={item} />)}

          {/* ── Digest view: compact InfoRows, newest first ── */}
          {viewMode === "digest" && (
            <>
              <div className="flex items-center gap-2 pb-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#34D399]/60 flex items-center gap-1">
                  <IconBookmark size={10} />
                  Informational · {filteredItems.length} messages
                </span>
                <div className="flex-1 h-px bg-[rgba(52,211,153,0.1)]" />
              </div>
              {sortedItems.map((item) => (
                <InfoRow key={item.id} item={item} />
              ))}
            </>
          )}

          {/* ── All view: reply cards first, then info rows, then suppressed ── */}
          {viewMode === "all" &&
            (() => {
              const allReply = sortedItems.filter(
                (i) => i.needs_reply && i.triage_status !== "informational",
              );
              const allInfo = sortedItems.filter(
                (i) => !i.needs_reply || i.triage_status === "informational",
              );
              return (
                <>
                  {allReply.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pb-0.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]/70 flex items-center gap-1">
                          <IconSparkles size={10} />
                          Needs Reply ({allReply.length})
                        </span>
                        <div className="flex-1 h-px bg-[rgba(245,158,11,0.12)]" />
                      </div>
                      {allReply.map((item) => (
                        <ReplyCard key={item.id} item={item} />
                      ))}
                    </>
                  )}
                  {allInfo.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-2 pb-0.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#34D399]/60 flex items-center gap-1">
                          <IconBookmark size={10} />
                          Informational ({allInfo.length})
                        </span>
                        <div className="flex-1 h-px bg-[rgba(52,211,153,0.08)]" />
                      </div>
                      {allInfo.map((item) => (
                        <InfoRow key={item.id} item={item} />
                      ))}
                    </>
                  )}
                  {suppressedItems.length > 0 &&
                    !searchQuery &&
                    activeFilter === "all" && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#2E3647] flex items-center gap-1">
                            <IconFilter size={10} />
                            Noise Filtered ({suppressedItems.length})
                          </span>
                          <div className="flex-1 h-px bg-[#1A1F27]" />
                        </div>
                        {suppressedItems.map((item) => (
                          <SuppressedRow key={item.id} item={item} />
                        ))}
                      </div>
                    )}
                </>
              );
            })()}
        </div>
      )}
    </div>
  );
};
