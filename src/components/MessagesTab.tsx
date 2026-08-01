import React, { useState } from 'react';
import {
  IconMail, IconCheck, IconX, IconInbox, IconRefresh,
  IconTag, IconSearch, IconChevronDown, IconChevronUp,
  IconSparkles,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

type CategoryKey = 'primary' | 'updates' | 'promotions' | 'social' | 'forums' | 'all';

const CATEGORY_META: Record<CategoryKey, { label: string; color: string; bg: string; border: string }> = {
  all:        { label: 'All Messages', color: '#9AA4B2', bg: 'rgba(154,164,178,0.1)', border: 'rgba(154,164,178,0.25)' },
  primary:    { label: 'Primary',      color: '#4A8FC2', bg: 'rgba(74,143,194,0.12)', border: 'rgba(74,143,194,0.3)'  },
  updates:    { label: 'Updates',      color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)'  },
  promotions: { label: 'Promotions',   color: '#E8A23D', bg: 'rgba(232,162,61,0.12)', border: 'rgba(232,162,61,0.3)'  },
  social:     { label: 'Social',       color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
  forums:     { label: 'Forums',       color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
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
      className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      {meta.label}
    </span>
  );
};

export const MessagesTab: React.FC = () => {
  const { items, gmailAccounts, syncGmail, approveItem, skipItem, isLoading } = useQueueStore();
  const gmailItems = items.filter((i) => i.source === 'gmail');

  const [activeFilter, setActiveFilter] = useState<CategoryKey>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'handled'>('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const filteredItems = gmailItems.filter((item) => {
    const cat = extractCategory(item.preview);
    if (activeFilter !== 'all' && cat !== activeFilter) return false;

    const isDone = item.status === 'sent' || item.status === 'approved' || item.status === 'edited' || item.status === 'skipped';
    if (statusFilter === 'pending' && isDone) return false;
    if (statusFilter === 'handled' && !isDone) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSender = item.sender.toLowerCase().includes(q);
      const matchPreview = item.preview.toLowerCase().includes(q);
      const matchDraft = item.draft_text ? item.draft_text.toLowerCase().includes(q) : false;
      if (!matchSender && !matchPreview && !matchDraft) return false;
    }

    return true;
  });

  const countForCat = (cat: CategoryKey) => cat === 'all'
    ? gmailItems.length
    : gmailItems.filter((i) => extractCategory(i.preview) === cat).length;

  const pendingCount = gmailItems.filter((i) => i.status === 'pending').length;

  return (
    <div className="flex-1 min-w-0 space-y-4">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#F0F4F8] m-0 tracking-tight">Messages</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Triaged Gmail{gmailAccounts.length > 1 ? ` · ${gmailAccounts.length} Accounts` : ''} · Automated Priority Ingestion
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {gmailAccounts.length > 0 && (
            <button
              onClick={syncGmail}
              disabled={isLoading}
              className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#151A21] hover:bg-[#181E27] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <IconRefresh size={13} className={isLoading ? 'animate-spin' : ''} />
              Sync Inbox
            </button>
          )}
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border border-[rgba(74,143,194,0.25)] whitespace-nowrap">
            {gmailItems.length} Total
          </span>
        </div>
      </div>

      {/* ── Category & Filter Bar ── */}
      {gmailAccounts.length > 0 && (
        <div className="space-y-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(CATEGORY_META) as CategoryKey[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = countForCat(cat);
              const isActive = activeFilter === cat;

              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`font-mono text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'font-semibold'
                      : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35] hover:text-[#F0F4F8]'
                  }`}
                  style={isActive ? { color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` } : {}}
                >
                  {cat !== 'all' && <IconTag size={11} className={isActive ? 'opacity-100' : 'opacity-60'} />}
                  <span>{meta.label}</span>
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full font-mono"
                    style={{
                      background: isActive ? meta.border : 'rgba(255,255,255,0.06)',
                      color: isActive ? meta.color : '#7A8492',
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Status sub-filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A8492]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter messages by sender or topic…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151A21] text-[#F0F4F8] rounded-md border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
              />
            </div>

            <div className="flex items-center gap-1 bg-[#151A21] p-1 rounded-lg border border-[#242B35]">
              {(['all', 'pending', 'handled'] as const).map((st) => {
                const isActive = statusFilter === st;
                const label = st === 'all' ? 'All' : st === 'pending' ? `Pending (${pendingCount})` : 'Handled';
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`font-mono text-[10px] px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#181E27] text-[#F0F4F8] font-semibold border border-[#242B35]'
                        : 'bg-transparent text-[#7A8492] hover:text-[#9AA4B2] border-0'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Message List ── */}
      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl">
          <p className="text-xs text-[#7A8492] m-0">Loading messages…</p>
        </div>
      ) : gmailAccounts.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.25)] flex items-center justify-center text-[#4A8FC2]">
            <IconMail size={20} />
          </div>
          <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">Gmail Not Connected</h4>
          <p className="text-xs text-[#7A8492] max-w-xs m-0 leading-relaxed">
            Connect your Gmail account on the Today tab or Settings tab to begin triaging messages automatically.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.25)] flex items-center justify-center text-[#34D399]">
            <IconInbox size={20} />
          </div>
          <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">No Messages Found</h4>
          <p className="text-xs text-[#7A8492] m-0">
            {searchQuery ? `No matches for "${searchQuery}".` : 'Try clearing filters or click Sync to fetch updates.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const cat = extractCategory(item.preview);
            const cleanPreview = stripCategoryPrefix(item.preview);
            const isExpanded = expandedId === item.id;
            const isDone = item.status === 'sent' || item.status === 'approved' || item.status === 'edited';
            const isSkipped = item.status === 'skipped';

            return (
              <div
                key={item.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isExpanded ? 'border-[rgba(74,143,194,0.4)]' : 'border-[#242B35]'
                } ${isDone ? 'bg-[#151A21]/60' : 'bg-[#151A21]'} ${isSkipped ? 'opacity-50' : 'opacity-100'}`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#181E27]/50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-[#181E27] border border-[#242B35] flex items-center justify-center text-[#4A8FC2] shrink-0">
                      <IconMail size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold text-[#F0F4F8] truncate">{item.sender}</span>
                        <CategoryPill cat={cat} />
                        {item.flagged && (
                          <span className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] text-[#F59E0B] uppercase">
                            Flagged
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#9AA4B2] truncate m-0">{cleanPreview}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDone ? (
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.25)] text-[#34D399] flex items-center gap-1">
                        <IconCheck size={11} /> Sent
                      </span>
                    ) : isSkipped ? (
                      <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded bg-[#181E27] border border-[#242B35] text-[#7A8492] flex items-center gap-1">
                        <IconX size={11} /> Skipped
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] text-[#F59E0B] flex items-center gap-1">
                        <IconInbox size={11} /> Pending
                      </span>
                    )}

                    <div className="text-[#7A8492]">
                      {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-3.5 border-t border-[#242B35] bg-[#181E27]/50 space-y-3">
                    <div>
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7A8492] block mb-1">
                        Message Preview
                      </span>
                      <div className="text-xs text-[#F0F4F8] leading-relaxed bg-[#181E27] p-2.5 rounded-lg border border-[#242B35]">
                        {cleanPreview}
                      </div>
                    </div>

                    {item.draft_text && (
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <IconSparkles size={11} className="text-[#4A8FC2]" />
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#4A8FC2]">
                            AI Suggested Draft
                          </span>
                        </div>
                        <div className="text-xs text-[#C8D6E5] leading-relaxed bg-[rgba(74,143,194,0.06)] p-2.5 rounded-lg border border-[rgba(74,143,194,0.2)]">
                          {item.draft_text}
                        </div>
                      </div>
                    )}

                    {!isDone && !isSkipped && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); skipItem(item.id); }}
                          className="font-mono text-xs px-3 py-1 rounded-md bg-transparent border border-[#242B35] text-[#7A8492] hover:text-[#F0F4F8] transition-colors cursor-pointer"
                        >
                          Skip
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); approveItem(item.id); }}
                          className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#4A8FC2] text-black font-semibold hover:bg-[#5b9bd1] transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <IconCheck size={12} /> Approve & Send
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
