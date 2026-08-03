import React, { useEffect, useState } from "react";
import {
  IconCheck,
  IconMail,
  IconRefresh,
  IconPlugConnected,
  IconShieldCheck,
  IconSparkles,
  IconBrain,
  IconLoader2,
  IconChartBar,
  IconVolume,
  IconPlayerStop,
} from "@tabler/icons-react";
import { BriefRenderer } from "./BriefRenderer";

import { useQueueStore } from "../store/useQueueStore";
import { ReplyCard } from "./ReplyCard";

export const TodayBrief: React.FC = () => {
  const {
    items,
    calendarEvents,
    isLoading,
    gmailAccounts,
    checkGmailStatus,
    connectGmail,
    syncGmail,
    syncCalendarDeadlines,
    testOverrideRecipient,
    setTestOverrideRecipient,
    morningBrief,
    morningBriefLoading,
    refreshMorningBrief,
    weeklyReview,
    weeklyReviewLoading,
    refreshWeeklyReview,
    isPlayingAudio,
    speakText,
    stopSpeech,
    language,
    ollamaModels,
    ollamaChecked,
  } = useQueueStore();

  const localeMap: Record<string, string> = {
    en: "en-US",
    fr: "fr-FR",
    es: "es-ES",
    de: "de-DE",
    zh: "zh-CN",
    ja: "ja-JP",
  };
  const todayLabel = new Date().toLocaleDateString(
    localeMap[language] || "en-US",
    {
      weekday: "long",
      month: "short",
      day: "numeric",
    },
  );

  const [showSafetyInput, setShowSafetyInput] = useState(false);
  const [scratchEmail, setScratchEmail] = useState("");

  useEffect(() => {
    // Initial check — small delay to ensure Tauri IPC is ready on .app launch
    const initialCheck = setTimeout(() => {
      checkGmailStatus();
      syncCalendarDeadlines();
      useQueueStore.getState().fetchTasks();
    }, 300);

    // Re-check whenever the window regains visibility (user opens from tray)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkGmailStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(initialCheck);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkGmailStatus, syncCalendarDeadlines]);

  // Only surface emails that genuinely need a reply — suppress automated noise
  const pendingItems = items.filter(
    (i) =>
      i.status === "pending" &&
      i.needs_reply !== false &&
      i.triage_status !== "suppressed" &&
      i.triage_status !== "informational",
  );
  // Informational emails — worth knowing about, no reply needed
  const infoItems = items.filter(
    (i) =>
      i.source === "gmail" &&
      i.status === "pending" &&
      (i.triage_status === "informational" ||
        (!i.needs_reply && i.triage_status === "active")),
  );
  // All gmail messages for context counts
  const gmailItems = items.filter((i) => i.source === "gmail");
  // Full pending count for the badge context
  const totalPending = items.filter((i) => i.status === "pending").length;
  const reviewCount = pendingItems.length;

  const handleSetScratchEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setTestOverrideRecipient(scratchEmail.trim() || null);
  };

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* ── Page Header ── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#F0F4F8] m-0 tracking-tight">
              Today
            </h1>
            <p className="font-mono text-xs text-[#7A8492] mt-0.5">
              {todayLabel}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {gmailAccounts.length > 0 ? (
              <>
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border border-[rgba(74,143,194,0.25)] flex items-center gap-1.5 whitespace-nowrap">
                  <IconPlugConnected size={13} />
                  {gmailAccounts.length === 1
                    ? gmailAccounts[0]
                    : `${gmailAccounts.length} Inboxes`}
                </span>
                <button
                  onClick={syncGmail}
                  title="Sync Gmail"
                  className="p-1.5 rounded-md bg-[#151A21] hover:bg-[#181E27] text-[#9AA4B2] border border-[#242B35] transition-colors cursor-pointer flex items-center"
                >
                  <IconRefresh size={13} />
                </button>
              </>
            ) : (
              <button
                onClick={connectGmail}
                className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#4A8FC2] text-black font-semibold hover:bg-[#5b9bd1] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <IconMail size={13} /> Connect Gmail
              </button>
            )}

            <span
              className={`font-mono text-xs px-2.5 py-1 rounded-md border whitespace-nowrap ${
                reviewCount > 0
                  ? "bg-[rgba(245,158,11,0.12)] text-[#F59E0B] border-[rgba(245,158,11,0.28)] font-semibold"
                  : "bg-[#151A21] text-[#7A8492] border-[#242B35]"
              }`}
            >
              {reviewCount > 0 ? `${reviewCount} need reply` : "✓ Inbox clear"}
              {totalPending > reviewCount && (
                <span className="ml-1.5 opacity-50 font-normal">
                  ({totalPending - reviewCount} filtered)
                </span>
              )}
            </span>

            <button
              onClick={() => setShowSafetyInput(!showSafetyInput)}
              title="Safety Test Target"
              className={`p-1.5 rounded-md border transition-colors cursor-pointer flex items-center ${
                testOverrideRecipient
                  ? "bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border-[rgba(74,143,194,0.3)]"
                  : "bg-[#151A21] text-[#7A8492] border-[#242B35]"
              }`}
            >
              <IconShieldCheck size={14} />
            </button>
          </div>
        </div>

        {showSafetyInput && (
          <form
            onSubmit={handleSetScratchEmail}
            className="p-3 rounded-lg bg-[#151A21] border border-[#242B35] flex items-center gap-2"
          >
            <input
              type="email"
              value={scratchEmail}
              onChange={(e) => setScratchEmail(e.target.value)}
              placeholder="Test recipient email…"
              className="flex-1 bg-[#181E27] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            />
            <button
              type="submit"
              className="text-xs bg-[#4A8FC2] text-black px-3 py-1.5 rounded-md font-semibold cursor-pointer whitespace-nowrap"
            >
              Set Target
            </button>
            {testOverrideRecipient && (
              <button
                type="button"
                onClick={() => {
                  setTestOverrideRecipient(null);
                  setScratchEmail("");
                }}
                className="text-xs text-[#F59E0B] hover:underline cursor-pointer bg-transparent border-0 px-1"
              >
                Clear
              </button>
            )}
          </form>
        )}
      </div>

      {/* ── Morning Intelligence Brief ── */}
      <div className="rounded-xl border border-[rgba(74,143,194,0.25)] bg-gradient-to-br from-[#0E1420] to-[#141B24] overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(74,143,194,0.15)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[rgba(74,143,194,0.15)] border border-[rgba(74,143,194,0.25)] flex items-center justify-center text-[#4A8FC2]">
              <IconBrain size={14} />
            </div>
            <span className="text-xs font-semibold text-[#F0F4F8]">
              Morning Intelligence Brief
            </span>
            {ollamaChecked && ollamaModels.length === 0 ? (
              <span className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)] uppercase tracking-wider">
                ⚡ AI offline
              </span>
            ) : (
              <span className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded bg-[rgba(52,211,153,0.12)] text-[#34D399] border border-[rgba(52,211,153,0.25)] uppercase tracking-wider">
                AI · Local
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {morningBrief && (
              <button
                onClick={() =>
                  isPlayingAudio ? stopSpeech() : speakText(morningBrief)
                }
                title={isPlayingAudio ? "Stop" : "Listen"}
                className={`font-mono text-xs px-2.5 py-1 rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
                  isPlayingAudio
                    ? "bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)] animate-pulse"
                    : "bg-[#151A21] text-[#9AA4B2] border-[#242B35] hover:text-[#4A8FC2]"
                }`}
              >
                {isPlayingAudio ? (
                  <IconPlayerStop size={12} />
                ) : (
                  <IconVolume size={12} />
                )}
                {isPlayingAudio ? "Stop" : "Listen"}
              </button>
            )}
            <button
              onClick={refreshMorningBrief}
              disabled={morningBriefLoading}
              title="Refresh Brief"
              className="p-1.5 rounded-md bg-[#151A21] text-[#7A8492] hover:text-[#F0F4F8] border border-[#242B35] transition-colors cursor-pointer disabled:opacity-40"
            >
              {morningBriefLoading ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconRefresh size={13} />
              )}
            </button>
          </div>
        </div>

        <div className="p-4">
          {morningBriefLoading && !morningBrief ? (
            <div className="space-y-2">
              {[82, 64, 91, 72, 58].map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 bg-[#181E27] rounded animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
              <p className="font-mono text-[10px] text-[#7A8492] pt-1">
                Ingesting feeds & synthesising brief…
              </p>
            </div>
          ) : morningBrief ? (
            <BriefRenderer text={morningBrief} baseColor="#C8D6E5" />
          ) : (
            <p className="text-xs text-[#7A8492]">
              Brief will auto-generate on next launch. Click refresh to generate
              now.
            </p>
          )}
        </div>
      </div>

      {/* ── Weekly Executive Review ── */}
      <div className="rounded-xl border border-[rgba(155,89,182,0.25)] bg-gradient-to-br from-[#121019] to-[#1C1628] overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(155,89,182,0.15)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[rgba(155,89,182,0.15)] border border-[rgba(155,89,182,0.25)] flex items-center justify-center text-[#9B59B6]">
              <IconChartBar size={14} />
            </div>
            <span className="text-xs font-semibold text-[#F0F4F8]">
              Weekly Executive Review
            </span>
            <span className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded bg-[rgba(155,89,182,0.12)] text-[#9B59B6] border border-[rgba(155,89,182,0.25)] uppercase tracking-wider">
              Sunday Synthesis
            </span>
          </div>
          <button
            onClick={refreshWeeklyReview}
            disabled={weeklyReviewLoading}
            title="Refresh Review"
            className="p-1.5 rounded-md bg-[#151A21] text-[#7A8492] hover:text-[#F0F4F8] border border-[#242B35] transition-colors cursor-pointer disabled:opacity-40"
          >
            {weeklyReviewLoading ? (
              <IconLoader2 size={13} className="animate-spin" />
            ) : (
              <IconRefresh size={13} />
            )}
          </button>
        </div>

        <div className="p-4">
          {weeklyReviewLoading && !weeklyReview ? (
            <div className="space-y-2">
              {[88, 66, 94, 77].map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 bg-[#181E27] rounded animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
              <p className="font-mono text-[10px] text-[#7A8492] pt-1">
                Synthesising week's decisions & captures…
              </p>
            </div>
          ) : weeklyReview ? (
            <BriefRenderer text={weeklyReview} baseColor="#DCD6F7" />
          ) : (
            <p className="text-xs text-[#7A8492]">
              Weekly review generates automatically every Sunday, or click
              refresh to generate now.
            </p>
          )}
        </div>
      </div>

      {/* ── Onboarding (no Gmail) ── */}
      {gmailAccounts.length === 0 && (
        <div className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
          <div className="flex items-center gap-2 text-[#4A8FC2]">
            <IconSparkles size={18} />
            <h3 className="text-sm font-bold text-[#F0F4F8] m-0">
              Welcome to Wardyn
            </h3>
          </div>
          <p className="text-xs text-[#9AA4B2] leading-relaxed m-0">
            Wardyn is your local-first chief-of-staff. Connect Gmail to start
            triaging high-signal messages and drafting responses in your voice.
          </p>
          <button
            onClick={connectGmail}
            className="font-mono text-xs px-3.5 py-1.5 rounded-md bg-[#4A8FC2] text-black font-semibold hover:bg-[#5b9bd1] transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <IconMail size={13} /> Connect Gmail Account
          </button>
        </div>
      )}

      {/* ── Reply Queue ── */}
      <div className="flex items-center gap-2 pt-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7A8492]">
          Needs your reply
        </span>
        <div className="flex-1 h-px bg-[#242B35]" />
      </div>

      {/* State 1: Gmail not connected — skip the queue entirely */}
      {gmailAccounts.length ===
      0 ? null /* State 2: Syncing in progress */ : isLoading ? (
        <div className="p-6 bg-[#151A21] border border-[#242B35] rounded-xl flex items-center gap-3">
          <IconLoader2
            size={16}
            className="text-[#4A8FC2] animate-spin shrink-0"
          />
          <div>
            <p className="text-xs font-semibold text-[#F0F4F8] m-0">
              Syncing your inbox…
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
              Triaging messages with AI — this takes a few seconds.
            </p>
          </div>
        </div>
      ) : /* State 3: Connected, synced, nothing needs reply */
      pendingItems.length === 0 ? (
        <div className="p-6 bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.2)] flex items-center justify-center text-[#34D399]">
            <IconCheck size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8] m-0">
              Inbox clear
            </p>
            <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
              {gmailItems.length > 0
                ? `${gmailItems.length} message${gmailItems.length > 1 ? "s" : ""} synced — none need your reply right now.`
                : "No messages synced yet."}
            </p>
          </div>
          <button
            onClick={syncGmail}
            className="mt-1 font-mono text-xs px-3 py-1.5 rounded-md bg-[#181E27] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] hover:bg-[rgba(74,143,194,0.1)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <IconRefresh size={12} /> Check for New Mail
          </button>
        </div>
      ) : (
        /* State 4: Connected, has pending items */
        <div className="space-y-3">
          {pendingItems.map((item) => (
            <ReplyCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* ── Informational digest strip ── */}
      {infoItems.length > 0 && (
        <div className="rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#0F1A12] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[rgba(52,211,153,0.1)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#34D399]/80 flex items-center gap-1.5">
              📬 Informational
            </span>
            <span className="font-mono text-[10px] text-[#34D399]/50">
              {infoItems.length} message{infoItems.length > 1 ? "s" : ""} · no
              reply needed
            </span>
          </div>
          <div className="divide-y divide-[rgba(52,211,153,0.06)]">
            {infoItems.slice(0, 5).map((item) => {
              const cleanPreview = item.preview.replace(
                /^\[(?:PRIMARY|UPDATES|PROMOTIONS|SOCIAL|FORUMS)\]\s*/i,
                "",
              );
              const senderMatch = item.sender.match(/^([^<]+)\s*</);
              const senderName = senderMatch
                ? senderMatch[1].trim()
                : item.sender.replace(/<[^>]+>/, "").trim() || item.sender;
              const subjectMatch = cleanPreview.match(/^([^:]+):/);
              const subject = subjectMatch
                ? subjectMatch[1].trim()
                : cleanPreview.slice(0, 50);
              return (
                <div
                  key={item.id}
                  className="px-4 py-2 flex items-center gap-3"
                >
                  <div className="w-1 h-1 rounded-full bg-[#34D399]/30 shrink-0" />
                  <span className="text-[11px] font-medium text-[#7A8492] shrink-0 max-w-[120px] truncate">
                    {senderName}
                  </span>
                  <span className="text-[11px] text-[#4A5568] flex-1 truncate">
                    {subject}
                  </span>
                </div>
              );
            })}
            {infoItems.length > 5 && (
              <div className="px-4 py-2">
                <span className="font-mono text-[10px] text-[#34D399]/40">
                  +{infoItems.length - 5} more in Messages → Informational
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Low-urgency digest ── */}
      {items.some(
        (i) => i.urgency === "low" && i.triage_status !== "suppressed",
      ) && (
        <div className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F0F4F8] flex items-center gap-1.5">
              📬 Daily Digest{" "}
              <span className="font-normal text-[#7A8492]">(5 PM Batch)</span>
            </span>
            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] text-[#F59E0B]">
              {
                items.filter(
                  (i) =>
                    i.urgency === "low" && i.triage_status !== "suppressed",
                ).length
              }{" "}
              Batched
            </span>
          </div>
          <p className="text-xs text-[#7A8492] m-0">
            Low-urgency items silenced to prevent executive interruption.
          </p>
          <div className="pt-2 border-t border-[#242B35] space-y-1.5">
            {items
              .filter(
                (i) => i.urgency === "low" && i.triage_status !== "suppressed",
              )
              .slice(0, 3)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-[#181E27] border border-[#242B35] text-xs"
                >
                  <span className="font-semibold text-[#F0F4F8] shrink-0 max-w-[120px] truncate">
                    {item.sender}
                  </span>
                  <span className="flex-1 text-[#7A8492] truncate">
                    {item.preview}
                  </span>
                  <span className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.2)] text-[#4A8FC2] uppercase shrink-0">
                    {item.status}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center gap-2 font-mono text-xs text-[#7A8492] pt-1">
        <IconCheck size={14} className="text-[#34D399] shrink-0" />
        <span>{calendarEvents.length} visa deadlines synced to calendar</span>
      </div>
    </div>
  );
};
