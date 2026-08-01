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
  const { items, gmailAccounts, syncGmail, isLoading } = useQueueStore();
  const gmailItems = items.filter((i) => i.source === 'gmail');
  const [activeFilter, setActiveFilter] = useState<CategoryKey>('all');

  const filteredItems = activeFilter === 'all'
    ? gmailItems
    : gmailItems.filter((i) => extractCategory(i.preview) === activeFilter);

  const countFor = (cat: CategoryKey) => cat === 'all'
    ? gmailItems.length
    : gmailItems.filter((i) => extractCategory(i.preview) === cat).length;

  return (
    <div className="tab-pane">
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">
            Triaged Gmail{gmailAccounts.length > 1 ? ` · ${gmailAccounts.length} Accounts` : ''} · All Categories
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {gmailAccounts.length > 0 && (
            <button onClick={syncGmail}>
              <IconRefresh size={13} /> Sync
            </button>
          )}
          <span className="badge badge-accent">{gmailItems.length} Total</span>
        </div>
      </div>

      {/* Category Filter Tabs */}
      {gmailAccounts.length > 0 && gmailItems.length > 0 && (
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
        <div className="empty-state"><p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading messages…</p></div>
      ) : gmailAccounts.length === 0 ? (
        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <IconMail size={24} style={{ color: 'var(--accent)' }} />
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Gmail Not Connected</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 300, lineHeight: 1.5 }}>
            Connect your Gmail account on the Today tab, Channels tab, or Settings tab.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <IconInbox size={24} style={{ color: 'var(--success)' }} />
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>No {CATEGORY_META[activeFilter].label} Messages</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Click Sync to pull the latest from Gmail.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredItems.map((item) => {
            const cat = extractCategory(item.preview);
            const cleanPreview = stripCategoryPrefix(item.preview);
            return (
              <div
                key={item.id}
                className="card"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-em)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                    <IconMail size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sender}</p>
                      <CategoryPill cat={cat} />
                      {item.flagged && <span className="badge badge-warning">Flagged</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanPreview}</p>
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {item.status === 'sent' || item.status === 'approved' || item.status === 'edited' ? (
                    <span className="badge badge-success"><IconCheck size={12} /> Sent</span>
                  ) : item.status === 'skipped' ? (
                    <span className="badge badge-muted"><IconX size={12} /> Skipped</span>
                  ) : (
                    <span className="badge badge-warning"><IconInbox size={12} /> Pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
