import React, { useEffect, useState } from 'react';
import {
  IconCheck,
  IconMail,
  IconRefresh,
  IconPlugConnected,
  IconShieldCheck,
  IconInbox,
  IconSparkles,
  IconBrain,
  IconLoader2,
  IconChartBar,
  IconVolume,
  IconPlayerStop,
} from '@tabler/icons-react';


import { useQueueStore } from '../store/useQueueStore';
import { ReplyCard } from './ReplyCard';


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
  } = useQueueStore();





  const [showSafetyInput, setShowSafetyInput] = useState(false);
  const [scratchEmail, setScratchEmail] = useState('');

  useEffect(() => {
    checkGmailStatus();
    syncCalendarDeadlines();
  }, [checkGmailStatus, syncCalendarDeadlines]);

  const pendingItems = items.filter((i) => i.status === 'pending');
  const reviewCount = pendingItems.length;

  const handleSetScratchEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (scratchEmail.trim()) {
      setTestOverrideRecipient(scratchEmail.trim());
    } else {
      setTestOverrideRecipient(null);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Today Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Today</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Thu, 30 Jul</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Scratch Email Safety Toggle */}
          <button
            onClick={() => setShowSafetyInput(!showSafetyInput)}
            className={`font-mono text-[11px] px-2.5 py-1 rounded-md border flex items-center gap-1 transition-colors ${
              testOverrideRecipient
                ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border-[rgba(74,143,194,0.35)]'
                : 'bg-[#151A21] text-[#9AA4B2] border-[#242B35]'
            }`}
          >
            <IconShieldCheck size={13} />
            {testOverrideRecipient ? `Scratch Test: ${testOverrideRecipient}` : 'Safety Test Target'}
          </button>

          {/* Gmail Auth / Status Badge */}
          {gmailAccounts.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] bg-[#151A21] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[rgba(74,143,194,0.3)] flex items-center gap-1.5">
                <IconPlugConnected size={13} />
                {gmailAccounts.length === 1 ? gmailAccounts[0] : `${gmailAccounts.length} Connected Inboxes`}
              </span>
              <button
                onClick={syncGmail}
                title="Sync Gmail Inbox"
                className="p-1.5 text-xs text-[#9AA4B2] bg-[#151A21] hover:bg-[#181E27] border border-[#242B35] rounded-md transition-colors cursor-pointer"
              >
                <IconRefresh size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={connectGmail}
              className="font-mono text-[11px] bg-[#4A8FC2] text-black px-3 py-1 rounded-md font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1 cursor-pointer"
            >
              <IconMail size={13} />
              Connect Gmail
            </button>
          )}

          <span className="font-mono text-xs bg-[rgba(232,162,61,0.15)] text-[#E8A23D] px-2.5 py-1 rounded-md font-medium border border-[rgba(232,162,61,0.3)]">
            {reviewCount} to review
          </span>

        </div>
      </div>

      {/* Safety Override Form */}
      {showSafetyInput && (
        <form onSubmit={handleSetScratchEmail} className="mb-4 p-3 rounded-xl bg-[#151A21] border border-[#242B35] flex items-center gap-2">
          <input
            type="email"
            value={scratchEmail}
            onChange={(e) => setScratchEmail(e.target.value)}
            placeholder="Enter test recipient email (e.g. scratch@yourdomain.com)..."
            className="flex-1 bg-[#181E27] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
          />
          <button type="submit" className="text-xs bg-[#4A8FC2] text-black px-3 py-2 rounded-lg font-medium cursor-pointer">
            Set Target
          </button>
          {testOverrideRecipient && (
            <button
              type="button"
              onClick={() => {
                setTestOverrideRecipient(null);
                setScratchEmail('');
              }}
              className="text-xs text-[#E8A23D] hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>
      )}

      {/* ── Morning Intelligence Brief ── */}
      <div className="mb-6 rounded-xl bg-gradient-to-br from-[#0E1318] to-[#141B24] border border-[rgba(74,143,194,0.25)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(74,143,194,0.15)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[rgba(74,143,194,0.18)] flex items-center justify-center">
              <IconBrain size={14} className="text-[#4A8FC2]" />
            </div>
            <span className="text-xs font-semibold text-[#F0F4F8]">Morning Intelligence Brief</span>
            <span className="font-mono text-[10px] bg-[rgba(52,211,153,0.12)] text-[#34D399] px-1.5 py-0.5 rounded border border-[rgba(52,211,153,0.25)]">AI · Local</span>
          </div>
          <div className="flex items-center gap-1">
            {morningBrief && (
              <button
                onClick={() => {
                  if (isPlayingAudio) {
                    stopSpeech();
                  } else {
                    speakText(morningBrief);
                  }
                }}
                title={isPlayingAudio ? 'Stop Audio' : 'Listen Aloud (macOS Say)'}
                className={`px-2 py-1 text-xs font-mono rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                  isPlayingAudio
                    ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444] border border-[rgba(239,68,68,0.3)] animate-pulse'
                    : 'text-[#7A8492] hover:text-[#4A8FC2] hover:bg-[rgba(74,143,194,0.1)]'
                }`}
              >
                {isPlayingAudio ? <IconPlayerStop size={13} /> : <IconVolume size={13} />}
                <span>{isPlayingAudio ? 'Stop' : 'Listen'}</span>
              </button>
            )}
            <button
              onClick={refreshMorningBrief}
              disabled={morningBriefLoading}
              title="Regenerate Brief"
              className="p-1.5 text-[#7A8492] hover:text-[#4A8FC2] hover:bg-[rgba(74,143,194,0.1)] rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              {morningBriefLoading
                ? <IconLoader2 size={13} className="animate-spin" />
                : <IconRefresh size={13} />}
            </button>
          </div>
        </div>


        {/* Body */}
        <div className="px-4 py-3">
          {morningBriefLoading && !morningBrief ? (
            <div className="space-y-2">
              {[80, 60, 90, 70, 55].map((w, i) => (
                <div key={i} className="h-3 bg-[#1A2233] rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
              <p className="text-[11px] text-[#7A8492] font-mono pt-1">Ingesting feeds & synthesising brief…</p>
            </div>
          ) : morningBrief ? (
            <pre className="text-[11.5px] text-[#C8D6E5] leading-relaxed whitespace-pre-wrap font-sans">
              {morningBrief}
            </pre>
          ) : (
            <p className="text-[11px] text-[#7A8492]">
              Brief will auto-generate on next launch. Click refresh to generate now.
            </p>
          )}
        </div>
      </div>


      {/* ── Weekly Executive Review Card ── */}
      <div className="mb-6 rounded-xl bg-gradient-to-br from-[#121019] to-[#1C1628] border border-[rgba(155,89,182,0.25)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(155,89,182,0.15)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[rgba(155,89,182,0.18)] flex items-center justify-center">
              <IconChartBar size={14} className="text-[#9B59B6]" />
            </div>
            <span className="text-xs font-semibold text-[#F0F4F8]">Weekly Executive Review</span>
            <span className="font-mono text-[10px] bg-[rgba(155,89,182,0.12)] text-[#9B59B6] px-1.5 py-0.5 rounded border border-[rgba(155,89,182,0.25)]">Sunday Synthesis</span>
          </div>
          <button
            onClick={refreshWeeklyReview}
            disabled={weeklyReviewLoading}
            title="Regenerate Weekly Review"
            className="p-1.5 text-[#7A8492] hover:text-[#9B59B6] hover:bg-[rgba(155,89,182,0.1)] rounded-md transition-colors cursor-pointer disabled:opacity-40"
          >
            {weeklyReviewLoading
              ? <IconLoader2 size={13} className="animate-spin" />
              : <IconRefresh size={13} />}
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {weeklyReviewLoading && !weeklyReview ? (
            <div className="space-y-2">
              {[85, 65, 95, 75].map((w, i) => (
                <div key={i} className="h-3 bg-[#241B33] rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
              <p className="text-[11px] text-[#7A8492] font-mono pt-1">Synthesising week's decisions, inbox velocity & knowledge captures…</p>
            </div>
          ) : weeklyReview ? (
            <pre className="text-[11.5px] text-[#DCD6F7] leading-relaxed whitespace-pre-wrap font-sans">
              {weeklyReview}
            </pre>
          ) : (
            <p className="text-[11px] text-[#7A8492]">
              Weekly review generates automatically every Sunday or click refresh to generate now.
            </p>
          )}
        </div>
      </div>


      {/* STATE 1: New User / Unauthenticated Onboarding State */}
      {gmailAccounts.length === 0 && (
        <div className="mb-5 p-5 rounded-xl bg-gradient-to-r from-[#151A21] to-[#181E27] border border-[#242B35] space-y-3">
          <div className="flex items-center gap-2 text-[#4A8FC2]">
            <IconSparkles size={18} />
            <h3 className="text-sm font-semibold text-[#F0F4F8] m-0">Welcome to Wardyn</h3>
          </div>
          <p className="text-xs text-[#9AA4B2] leading-relaxed">
            Wardyn is your local-first chief-of-staff. Connect your Gmail accounts to start triaging high-signal messages and drafting responses in your voice.
          </p>
          <button
            onClick={connectGmail}
            className="font-mono text-xs bg-[#4A8FC2] text-black px-3.5 py-1.5 rounded-lg font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <IconMail size={14} />
            Connect Gmail Account
          </button>
        </div>
      )}

      {/* Section Title */}
      <p className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider mb-2.5">
        Needs your reply
      </p>

      {/* STATE 2: Loading State */}
      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          Loading triaged items...
        </div>
      ) : pendingItems.length === 0 ? (
        /* STATE 3: Empty State (All Caught Up) */
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-[rgba(52,211,153,0.15)] text-[#34D399] flex items-center justify-center">
            <IconInbox size={20} />
          </div>
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">All caught up!</h4>
          <p className="text-xs text-[#7A8492] max-w-sm mx-auto">
            You have no pending items awaiting approval. Click below to check for new messages.
          </p>
          {gmailAccounts.length > 0 && (
            <button
              onClick={syncGmail}
              className="mt-2 font-mono text-xs bg-[#181E27] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] px-3 py-1.5 rounded-lg hover:bg-[rgba(74,143,194,0.16)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <IconRefresh size={14} />
              Check New Messages
            </button>
          )}
        </div>
      ) : (
        /* STATE 4: Data Available State (Pending Triaged Cards) */
        pendingItems.map((item) => <ReplyCard key={item.id} item={item} />)
      )}

      {/* Auto-Handled Calendar Footer Line & Low-Urgency Daily Digest */}
      {items.some((i) => i.urgency === 'low') && (
        <div className="mt-6 p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#E8A23D]">
              <span className="text-sm">📬</span>
              <h4 className="text-xs font-semibold text-[#F0F4F8] m-0">Executive Daily Digest (5:00 PM Batch)</h4>
            </div>
            <span className="font-mono text-[10px] bg-[rgba(232,162,61,0.15)] text-[#E8A23D] px-2 py-0.5 rounded border border-[rgba(232,162,61,0.3)]">
              {items.filter((i) => i.urgency === 'low').length} Low-Urgency Items Batched
            </span>
          </div>
          <p className="text-[11px] text-[#7A8492] m-0">
            Desktop alerts for these low-urgency newsletters and updates were silenced to prevent executive interruption.
          </p>
          <div className="pt-2 space-y-1.5 border-t border-[#242B35]">
            {items
              .filter((i) => i.urgency === 'low')
              .slice(0, 3)
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs text-[#9AA4B2] bg-[#181E27] p-2 rounded border border-[#242B35]">
                  <span className="font-medium text-[#F0F4F8] truncate max-w-[150px]">{item.sender}</span>
                  <span className="truncate flex-1 mx-3 text-[#7A8492]">{item.preview}</span>
                  <span className="font-mono text-[10px] text-[#4A8FC2] uppercase">{item.status}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-[#7A8492] font-mono">
        <IconCheck size={15} className="text-[#34D399]" />
        <span>{calendarEvents.length} visa deadlines synced to calendar automatically</span>
      </div>
    </div>
  );
};

