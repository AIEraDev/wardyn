import React, { useState } from 'react';
import { IconMail, IconCheck, IconX, IconInbox, IconRefresh, IconTag } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

type CategoryKey = 'primary' | 'updates' | 'promotions' | 'social' | 'forums' | 'all';

const CATEGORY_META: Record<CategoryKey, { label: string; color: string; bg: string; border: string }> = {
  all:        { label: 'All',        color: '#9AA4B2', bg: 'rgba(154,164,178,0.1)', border: 'rgba(154,164,178,0.25)' },
  primary:    { label: 'Primary',    color: '#4A8FC2', bg: 'rgba(74,143,194,0.1)',  border: 'rgba(74,143,194,0.3)'  },
  updates:    { label: 'Updates',    color: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
  promotions: { label: 'Promotions', color: '#E8A23D', bg: 'rgba(232,162,61,0.1)', border: 'rgba(232,162,61,0.3)'  },
  social:     { label: 'Social',     color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  forums:     { label: 'Forums',     color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
};

function extractCategory(preview: string): CategoryKey {
  const match = preview.match(/^\[(PRIMARY|UPDATES|PROMOTIONS|SOCIAL|FORUMS)\]/i);
  if (!match) return 'primary';
  return match[1].toLowerCase() as CategoryKey;
}

function stripCategoryPrefix(preview: string): string {
  return preview.replace(/^\[(?:PRIMARY|UPDATES|PROMOTIONS|SOCIAL|FORUMS)\]\s*/i, '');
}

const CategoryPill: React.FC<{ cat: CategoryKey }> = ({ cat }) => {
  const meta = CATEGORY_META[cat];
  return (
    <span
      className="font-mono text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      {meta.label}
    </span>
  );
};

export const MessagesTab: React.FC = () => {
  const { items, gmailAccount, syncGmail, isLoading } = useQueueStore();
  const gmailItems = items.filter((i) => i.source === 'gmail');
  const [activeFilter, setActiveFilter] = useState<CategoryKey>('all');

  const filteredItems = activeFilter === 'all'
    ? gmailItems
    : gmailItems.filter((i) => extractCategory(i.preview) === activeFilter);

  const countFor = (cat: CategoryKey) => cat === 'all'
    ? gmailItems.length
    : gmailItems.filter((i) => extractCategory(i.preview) === cat).length;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Messages</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Triaged Gmail · All Categories</p>
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
            {gmailItems.length} Total
          </span>
        </div>
      </div>

      {/* Category Filter Tabs */}
      {gmailAccount && gmailItems.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {(Object.keys(CATEGORY_META) as CategoryKey[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = countFor(cat);
            const isActive = activeFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className="font-mono text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-all cursor-pointer"
                style={{
                  color: isActive ? meta.color : '#7A8492',
                  background: isActive ? meta.bg : 'rgba(21,26,33,0.6)',
                  border: `1px solid ${isActive ? meta.border : '#242B35'}`,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <IconTag size={10} />
                {meta.label}
                <span
                  className="px-1 rounded text-[9px]"
                  style={{ background: isActive ? meta.border : '#242B35', color: isActive ? meta.color : '#7A8492' }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          Loading messages...
        </div>
      ) : !gmailAccount ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconMail size={24} className="mx-auto text-[#4A8FC2]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">Gmail Not Connected</h4>
          <p className="text-xs text-[#7A8492] max-w-sm mx-auto">
            Connect your Gmail account on the Today tab or Settings tab to begin triaging messages.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconInbox size={24} className="mx-auto text-[#34D399]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">No {CATEGORY_META[activeFilter].label} Messages</h4>
          <p className="text-xs text-[#7A8492]">Click Sync to pull the latest from Gmail.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const cat = extractCategory(item.preview);
            const cleanPreview = stripCategoryPrefix(item.preview);
            return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] flex items-center justify-between gap-4 hover:border-[#2E3A4A] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[#181E27] text-[#4A8FC2] shrink-0 border border-[#242B35]">
                    <IconMail size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#F0F4F8] truncate">{item.sender}</p>
                      <CategoryPill cat={cat} />
                      {item.flagged && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border border-[rgba(232,162,61,0.3)] uppercase">
                          Flagged
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9AA4B2] truncate mt-0.5">{cleanPreview}</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
};
