import React, { useEffect, useState } from 'react';
import {
  IconCheck, IconMail, IconRefresh, IconPlugConnected, IconShieldCheck,
  IconInbox, IconSparkles, IconBrain, IconLoader2, IconChartBar,
  IconVolume, IconPlayerStop,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import { ReplyCard } from './ReplyCard';

/* ─────────────────────────────────────────────────────────── */

export const TodayBrief: React.FC = () => {
  const {
    items, calendarEvents, isLoading, gmailAccounts,
    checkGmailStatus, connectGmail, syncGmail, syncCalendarDeadlines,
    testOverrideRecipient, setTestOverrideRecipient,
    morningBrief, morningBriefLoading, refreshMorningBrief,
    weeklyReview, weeklyReviewLoading, refreshWeeklyReview,
    isPlayingAudio, speakText, stopSpeech, language,
  } = useQueueStore();

  const localeMap: Record<string, string> = {
    en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP',
  };
  const todayLabel = new Date().toLocaleDateString(localeMap[language] || 'en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const [showSafetyInput, setShowSafetyInput] = useState(false);
  const [scratchEmail, setScratchEmail]       = useState('');

  useEffect(() => {
    checkGmailStatus();
    syncCalendarDeadlines();
    useQueueStore.getState().fetchTasks();
  }, [checkGmailStatus, syncCalendarDeadlines]);

  const pendingItems = items.filter((i) => i.status === 'pending');
  const reviewCount  = pendingItems.length;

  const handleSetScratchEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setTestOverrideRecipient(scratchEmail.trim() || null);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 18 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.3px' }}>
              Today
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 3 }}>
              {todayLabel}
            </p>
          </div>

          {/* Right-side header actions — clean pill row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
            {/* Gmail status */}
            {gmailAccounts.length > 0 ? (
              <>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 500, padding: '4px 10px',
                  borderRadius: 6, background: 'rgba(74,143,194,0.12)',
                  border: '1px solid rgba(74,143,194,0.25)', color: 'var(--accent)',
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <IconPlugConnected size={12} />
                  {gmailAccounts.length === 1 ? gmailAccounts[0] : `${gmailAccounts.length} Inboxes`}
                </span>
                <button
                  onClick={syncGmail}
                  title="Sync Gmail"
                  style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-em)', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                >
                  <IconRefresh size={13} />
                </button>
              </>
            ) : (
              <button
                onClick={connectGmail}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'var(--accent)', border: 'none', color: '#000', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <IconMail size={12} /> Connect Gmail
              </button>
            )}

            {/* Review count badge */}
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: reviewCount > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${reviewCount > 0 ? 'rgba(245,158,11,0.28)' : 'var(--border-em)'}`,
              color: reviewCount > 0 ? 'var(--warning)' : 'var(--text-3)',
              whiteSpace: 'nowrap',
            }}>
              {reviewCount} to review
            </span>

            {/* Safety test toggle */}
            <button
              onClick={() => setShowSafetyInput(!showSafetyInput)}
              title="Safety Test Target"
              style={{
                padding: '5px 7px', borderRadius: 6, cursor: 'pointer',
                background: testOverrideRecipient ? 'rgba(74,143,194,0.12)' : 'var(--bg-elevated)',
                border: `1px solid ${testOverrideRecipient ? 'rgba(74,143,194,0.3)' : 'var(--border-em)'}`,
                color: testOverrideRecipient ? 'var(--accent)' : 'var(--text-3)',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              <IconShieldCheck size={13} />
            </button>
          </div>
        </div>

        {/* Safety test form */}
        {showSafetyInput && (
          <form
            onSubmit={handleSetScratchEmail}
            style={{
              marginTop: 10, padding: '10px 12px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-em)',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <input
              type="email"
              value={scratchEmail}
              onChange={(e) => setScratchEmail(e.target.value)}
              placeholder="Test recipient email…"
              style={{ flex: 1, fontSize: 12, padding: '5px 9px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-em)', color: 'var(--text-1)', outline: 'none' }}
            />
            <button
              type="submit"
              style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Set
            </button>
            {testOverrideRecipient && (
              <button
                type="button"
                onClick={() => { setTestOverrideRecipient(null); setScratchEmail(''); }}
                style={{ padding: '5px 9px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-em)', color: 'var(--warning)', fontSize: 11, cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </form>
        )}
      </div>

      {/* ── Morning Intelligence Brief ── */}
      <div style={{
        borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        border: '1px solid rgba(74,143,194,0.2)',
        background: 'linear-gradient(160deg, rgba(74,143,194,0.05) 0%, transparent 60%), var(--bg-surface)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid rgba(74,143,194,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(74,143,194,0.15)', border: '1px solid rgba(74,143,194,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              <IconBrain size={14} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Morning Intelligence Brief</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: 'var(--success)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI · Local
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {morningBrief && (
              <button
                onClick={() => isPlayingAudio ? stopSpeech() : speakText(morningBrief)}
                title={isPlayingAudio ? 'Stop' : 'Listen'}
                style={{
                  padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  background: isPlayingAudio ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${isPlayingAudio ? 'rgba(239,68,68,0.3)' : 'var(--border-em)'}`,
                  color: isPlayingAudio ? 'var(--danger)' : 'var(--text-2)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {isPlayingAudio ? <IconPlayerStop size={12} /> : <IconVolume size={12} />}
                {isPlayingAudio ? 'Stop' : 'Listen'}
              </button>
            )}
            <button
              onClick={refreshMorningBrief}
              disabled={morningBriefLoading}
              title="Refresh Brief"
              style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-em)', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              {morningBriefLoading ? <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <IconRefresh size={13} />}
            </button>
          </div>
        </div>
        <div style={{ padding: '12px 14px' }}>
          {morningBriefLoading && !morningBrief ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[82, 64, 91, 72, 58].map((w, i) => (
                <div key={i} style={{ height: 9, borderRadius: 4, background: 'var(--bg-elevated)', width: `${w}%`, animation: 'pulse 1.5s ease infinite', opacity: 0.6 }} />
              ))}
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 4 }}>
                Ingesting feeds & synthesising brief…
              </p>
            </div>
          ) : morningBrief ? (
            <pre style={{ fontSize: 12, color: '#C8D6E5', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {morningBrief}
            </pre>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              Brief will auto-generate on next launch. Click refresh to generate now.
            </p>
          )}
        </div>
      </div>

      {/* ── Weekly Executive Review ── */}
      <div style={{
        borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        border: '1px solid rgba(155,89,182,0.2)',
        background: 'linear-gradient(160deg, rgba(155,89,182,0.05) 0%, transparent 60%), var(--bg-surface)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid rgba(155,89,182,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(155,89,182,0.15)', border: '1px solid rgba(155,89,182,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B59B6', flexShrink: 0 }}>
              <IconChartBar size={14} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Weekly Executive Review</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'rgba(155,89,182,0.12)', border: '1px solid rgba(155,89,182,0.25)', color: '#9B59B6', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sunday Synthesis
            </span>
          </div>
          <button
            onClick={refreshWeeklyReview}
            disabled={weeklyReviewLoading}
            title="Refresh Review"
            style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-em)', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          >
            {weeklyReviewLoading ? <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <IconRefresh size={13} />}
          </button>
        </div>
        <div style={{ padding: '12px 14px' }}>
          {weeklyReviewLoading && !weeklyReview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[88, 66, 94, 77].map((w, i) => (
                <div key={i} style={{ height: 9, borderRadius: 4, background: 'var(--bg-elevated)', width: `${w}%`, animation: 'pulse 1.5s ease infinite', opacity: 0.6 }} />
              ))}
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 4 }}>
                Synthesising week's decisions & captures…
              </p>
            </div>
          ) : weeklyReview ? (
            <pre style={{ fontSize: 12, color: '#DCD6F7', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {weeklyReview}
            </pre>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              Weekly review generates automatically every Sunday, or click refresh to generate now.
            </p>
          )}
        </div>
      </div>

      {/* ── Onboarding (no Gmail) ── */}
      {gmailAccounts.length === 0 && (
        <div style={{
          borderRadius: 12, marginBottom: 12, padding: '14px 16px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-em)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSparkles size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Welcome to Wardyn</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            Wardyn is your local-first chief-of-staff. Connect Gmail to start triaging high-signal messages and drafting responses in your voice.
          </p>
          <button
            onClick={connectGmail}
            style={{
              alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 7, fontSize: 12,
              fontWeight: 600, background: 'var(--accent)', border: 'none', color: '#000',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <IconMail size={13} /> Connect Gmail Account
          </button>
        </div>
      )}

      {/* ── Reply Queue ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>
          Needs your reply
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {isLoading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading triaged items…</p>
        </div>
      ) : pendingItems.length === 0 ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center',
          background: 'var(--bg-surface)', border: '1px solid var(--border-em)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
            <IconInbox size={20} />
          </div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>All caught up!</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 280, lineHeight: 1.5, margin: 0 }}>
            No pending items awaiting approval.
          </p>
          {gmailAccounts.length > 0 && (
            <button
              onClick={syncGmail}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--bg-elevated)', border: '1px solid var(--border-em)', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <IconRefresh size={13} /> Check New Messages
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendingItems.map((item) => <ReplyCard key={item.id} item={item} />)}
        </div>
      )}

      {/* ── Low-urgency digest ── */}
      {items.some((i) => i.urgency === 'low') && (
        <div style={{
          marginTop: 12, padding: '12px 14px', borderRadius: 12,
          background: 'var(--bg-surface)', border: '1px solid var(--border-em)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              📬 Daily Digest <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(5 PM Batch)</span>
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning)', fontFamily: 'monospace' }}>
              {items.filter((i) => i.urgency === 'low').length} Batched
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
            Low-urgency items silenced to prevent executive interruption.
          </p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.filter((i) => i.urgency === 'low').slice(0, 3).map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sender}</span>
                <span style={{ flex: 1, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.preview}</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(74,143,194,0.1)', border: '1px solid rgba(74,143,194,0.2)', color: 'var(--accent)', fontFamily: 'monospace', flexShrink: 0 }}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
        <IconCheck size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span>{calendarEvents.length} visa deadlines synced to calendar</span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
};
