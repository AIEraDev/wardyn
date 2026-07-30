import React from 'react';
import { IconMail, IconCheck, IconX, IconInbox, IconRefresh } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

export const MessagesTab: React.FC = () => {
  const { items, gmailAccount, syncGmail, isLoading } = useQueueStore();
  const gmailItems = items.filter((i) => i.source === 'gmail');

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Messages</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Triaged Gmail Messages & History</p>
        </div>
        <div className="flex items-center gap-2">
          {gmailAccount && (
            <button
              onClick={syncGmail}
              className="font-mono text-xs bg-[#151A21] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] px-2.5 py-1 rounded-md flex items-center gap-1.5 hover:bg-[#181E27] transition-colors cursor-pointer"
            >
              <IconRefresh size={13} /> Sync
            </button>
          )}
          <span className="font-mono text-xs bg-[#151A21] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[rgba(74,143,194,0.3)]">
            {gmailItems.length} Total Messages
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          Loading messages...
        </div>
      ) : !gmailAccount ? (
        /* New User State */
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconMail size={24} className="mx-auto text-[#4A8FC2]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">Gmail Not Connected</h4>
          <p className="text-xs text-[#7A8492] max-w-sm mx-auto">
            Connect your Gmail account on the Today tab or Settings tab to begin triaging messages.
          </p>
        </div>
      ) : gmailItems.length === 0 ? (
        /* Data Empty State */
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconInbox size={24} className="mx-auto text-[#34D399]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">No Messages Found</h4>
          <p className="text-xs text-[#7A8492]">Your Gmail inbox has no triaged items yet.</p>
        </div>
      ) : (
        /* Data Availability & Integrity State (Message List) */
        <div className="space-y-3">
          {gmailItems.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] flex items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-[#181E27] text-[#4A8FC2] shrink-0 border border-[#242B35]">
                  <IconMail size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#F0F4F8] truncate">{item.sender}</p>
                    {item.flagged && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border border-[rgba(232,162,61,0.3)]">
                        Visa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#9AA4B2] truncate mt-0.5">{item.preview}</p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="font-mono text-xs text-[#7A8492] uppercase">
                  {item.status === 'sent' || item.status === 'approved' || item.status === 'edited' ? (
                    <span className="text-[#34D399] flex items-center gap-1">
                      <IconCheck size={14} /> Sent
                    </span>
                  ) : item.status === 'skipped' ? (
                    <span className="text-[#7A8492] flex items-center gap-1">
                      <IconX size={14} /> Skipped
                    </span>
                  ) : (
                    <span className="text-[#E8A23D] flex items-center gap-1">
                      <IconInbox size={14} /> Pending
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
