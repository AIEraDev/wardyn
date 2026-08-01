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
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 5,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
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

  // Filtering
  const filteredItems = gmailItems.filter((item) => {
    // 1. Category match
    const cat = extractCategory(item.preview);
    if (activeFilter !== 'all' && cat !== activeFilter) return false;

    // 2. Status match
    const isDone = item.status === 'sent' || item.status === 'approved' || item.status === 'edited' || item.status === 'skipped';
    if (statusFilter === 'pending' && isDone) return false;
    if (statusFilter === 'handled' && !isDone) return false;

    // 3. Search query
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
    <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.3px' }}>
              Messages
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 3 }}>
              Triaged Gmail{gmailAccounts.length > 1 ? ` · ${gmailAccounts.length} Accounts` : ''} · Automated Priority Ingestion
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
            {gmailAccounts.length > 0 && (
              <button
                onClick={syncGmail}
                disabled={isLoading}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-em)',
                  color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <IconRefresh size={13} style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                Sync Inbox
              </button>
            )}
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: 'rgba(74,143,194,0.12)', border: '1px solid rgba(74,143,194,0.25)',
              color: 'var(--accent)', fontFamily: 'monospace',
            }}>
              {gmailItems.length} Total
            </span>
          </div>
        </div>
      </div>

      {/* ── Category & Filter Bar ── */}
      {gmailAccounts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(CATEGORY_META) as CategoryKey[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = countForCat(cat);
              const isActive = activeFilter === cat;

              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: isActive ? 600 : 400,
                    color: isActive ? meta.color : 'var(--text-2)',
                    background: isActive ? meta.bg : 'var(--bg-surface)',
                    border: `1px solid ${isActive ? meta.border : 'var(--border)'}`,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.12s ease',
                  }}
                >
                  {cat !== 'all' && <IconTag size={11} style={{ opacity: isActive ? 1 : 0.6 }} />}
                  <span>{meta.label}</span>
                  <span
                    style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 10,
                      background: isActive ? meta.border : 'rgba(255,255,255,0.06)',
                      color: isActive ? meta.color : 'var(--text-3)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Status sub-filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <IconSearch size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter messages by sender or topic…"
                style={{
                  width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
                  fontSize: 11, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-em)',
                  color: 'var(--text-1)', outline: 'none',
                }}
              />
            </div>

            {/* Status pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 7, border: '1px solid var(--border-em)' }}>
              {(['all', 'pending', 'handled'] as const).map((st) => {
                const isActive = statusFilter === st;
                const label = st === 'all' ? 'All' : st === 'pending' ? `Pending (${pendingCount})` : 'Handled';
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                      border: isActive ? '1px solid var(--border-em)' : 'none',
                      color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}
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
        <div style={{ padding: '40px 0', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-em)', borderRadius: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Loading messages…</p>
        </div>
      ) : gmailAccounts.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', background: 'var(--bg-surface)',
          border: '1px solid var(--border-em)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(74,143,194,0.12)', border: '1px solid rgba(74,143,194,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <IconMail size={22} />
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Gmail Not Connected</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
            Connect your Gmail account on the Today tab or Settings tab to begin triaging messages automatically.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', background: 'var(--bg-surface)',
          border: '1px solid var(--border-em)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
            <IconInbox size={22} />
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>No Messages Found</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            {searchQuery ? `No matches for "${searchQuery}".` : 'Try clearing filters or click Sync to fetch updates.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredItems.map((item) => {
            const cat = extractCategory(item.preview);
            const cleanPreview = stripCategoryPrefix(item.preview);
            const isExpanded = expandedId === item.id;
            const isDone = item.status === 'sent' || item.status === 'approved' || item.status === 'edited';
            const isSkipped = item.status === 'skipped';

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: 10,
                  background: isDone ? 'rgba(21,26,33,0.6)' : 'var(--bg-surface)',
                  border: `1px solid ${isExpanded ? 'var(--border-accent)' : 'var(--border-em)'}`,
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                  opacity: isSkipped ? 0.5 : 1,
                }}
              >
                {/* Message Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    padding: '11px 14px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 12, cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-em)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent)',
                    }}>
                      <IconMail size={16} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.sender}
                        </span>
                        <CategoryPill cat={cat} />
                        {item.flagged && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning)', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                            Flagged
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                        {cleanPreview}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge + Expand Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isDone ? (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: 'var(--success)', fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IconCheck size={11} /> Sent
                      </span>
                    ) : isSkipped ? (
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-em)', color: 'var(--text-3)', fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IconX size={11} /> Skipped
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning)', fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IconInbox size={11} /> Pending
                      </span>
                    )}

                    <div style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                      {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Card Details */}
                {isExpanded && (
                  <div style={{
                    padding: '12px 14px', borderTop: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Full Preview */}
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                        Message Preview
                      </span>
                      <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.6, background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        {cleanPreview}
                      </div>
                    </div>

                    {/* Proposed AI Draft */}
                    {item.draft_text && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <IconSparkles size={11} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
                            AI Suggested Draft
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#C8D6E5', lineHeight: 1.6, background: 'rgba(74,143,194,0.06)', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(74,143,194,0.2)' }}>
                          {item.draft_text}
                        </div>
                      </div>
                    )}

                    {/* Quick Action Footer if pending */}
                    {!isDone && !isSkipped && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 4 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); skipItem(item.id); }}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                            background: 'transparent', border: '1px solid var(--border-em)',
                            color: 'var(--text-3)', cursor: 'pointer',
                          }}
                        >
                          Skip
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); approveItem(item.id); }}
                          style={{
                            padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'var(--accent)', border: 'none', color: '#000', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
