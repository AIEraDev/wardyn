import React, { useEffect, useState } from 'react';
import {
  IconCheck,
  IconMail,
  IconRefresh,
  IconPlugConnected,
  IconShieldCheck,
  IconInbox,
  IconSparkles,
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

      {/* Auto-Handled Calendar Footer Line */}
      <div className="mt-6 flex items-center gap-2 text-xs text-[#7A8492] font-mono">
        <IconCheck size={15} className="text-[#34D399]" />
        <span>{calendarEvents.length} visa deadlines synced to calendar automatically</span>
      </div>
    </div>
  );
};
