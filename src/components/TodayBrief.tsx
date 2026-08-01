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
    language,
  } = useQueueStore();

  const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP' };
  const todayLabel = new Date().toLocaleDateString(localeMap[language] || 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });





  const [showSafetyInput, setShowSafetyInput] = useState(false);
  const [scratchEmail, setScratchEmail] = useState('');

  useEffect(() => {
    checkGmailStatus();
    syncCalendarDeadlines();
    useQueueStore.getState().fetchTasks();
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
    <div className="tab-pane">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">{todayLabel}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Scratch Email Safety Toggle */}
          <button
            onClick={() => setShowSafetyInput(!showSafetyInput)}
            style={{
              background: testOverrideRecipient ? 'rgba(74,143,194,0.14)' : 'var(--bg-surface)',
              color: testOverrideRecipient ? 'var(--accent)' : 'var(--text-2)',
              borderColor: testOverrideRecipient ? 'rgba(74,143,194,0.35)' : 'var(--border-em)',
            }}
          >
            <IconShieldCheck size={13} />
            {testOverrideRecipient ? `Scratch: ${testOverrideRecipient}` : 'Safety Target'}
          </button>

          {/* Gmail Auth / Status Badge */}
          {gmailAccounts.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="badge badge-accent">
                <IconPlugConnected size={12} />
                {gmailAccounts.length === 1 ? gmailAccounts[0] : `${gmailAccounts.length} Inboxes`}
              </span>
              <button onClick={syncGmail} title="Sync Gmail" style={{ padding: "5px 6px" }}>
                <IconRefresh size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={connectGmail}
              style={{ background: 'var(--accent)', color: '#000', fontWeight: 600, borderColor: 'transparent' }}
            >
              <IconMail size={13} /> Connect Gmail
            </button>
          )}

          <span className="badge badge-warning">{reviewCount} to review</span>
        </div>
      </div>

      {/* Safety Override Form */}
      {showSafetyInput && (
        <form onSubmit={handleSetScratchEmail} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input
            type="email"
            value={scratchEmail}
            onChange={(e) => setScratchEmail(e.target.value)}
            placeholder="Test recipient email..."
            style={{ flex: 1 }}
          />
          <button type="submit" style={{ background: 'var(--accent)', color: '#000', fontWeight: 600, borderColor: 'transparent' }}>
            Set Target
          </button>
          {testOverrideRecipient && (
            <button type="button" onClick={() => { setTestOverrideRecipient(null); setScratchEmail(''); }}
              style={{ color: 'var(--warning)', background: 'transparent', border: 'none' }}>
              Clear
            </button>
          )}
        </form>
      )}

      {/* Morning Intelligence Brief */}
      <div className="card" style={{ marginBottom: 12, background: 'linear-gradient(135deg, #0E1420, #141B24)', borderColor: 'rgba(74,143,194,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(74,143,194,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(74,143,194,0.15)', border: '1px solid rgba(74,143,194,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconBrain size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Morning Intelligence Brief</span>
            <span className="badge badge-success">AI · Local</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {morningBrief && (
              <button
                onClick={() => isPlayingAudio ? stopSpeech() : speakText(morningBrief)}
                title={isPlayingAudio ? 'Stop' : 'Listen Aloud'}
                style={isPlayingAudio ? { color: 'var(--danger)', background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.28)' } : {}}
              >
                {isPlayingAudio ? <IconPlayerStop size={13} /> : <IconVolume size={13} />}
                {isPlayingAudio ? 'Stop' : 'Listen'}
              </button>
            )}
            <button onClick={refreshMorningBrief} disabled={morningBriefLoading} title="Regenerate" style={{ padding: '5px 6px' }}>
              {morningBriefLoading ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
            </button>
          </div>
        </div>
        <div>
          {morningBriefLoading && !morningBrief ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[80, 60, 90, 70, 55].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 10, width: `${w}%` }} />
              ))}
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 4 }}>Ingesting feeds & synthesising brief…</p>
            </div>
          ) : morningBrief ? (
            <pre style={{ fontSize: 11.5, color: '#C8D6E5', lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{morningBrief}</pre>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Brief will auto-generate on next launch. Click refresh to generate now.</p>
          )}
        </div>
      </div>


      {/* Weekly Executive Review */}
      <div className="card" style={{ marginBottom: 12, background: 'linear-gradient(135deg, #121019, #1C1628)', borderColor: 'rgba(155,89,182,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(155,89,182,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(155,89,182,0.15)', border: '1px solid rgba(155,89,182,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconChartBar size={14} style={{ color: 'var(--purple)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Weekly Executive Review</span>
            <span className="badge" style={{ color: 'var(--purple)', background: 'rgba(155,89,182,0.12)', borderColor: 'rgba(155,89,182,0.28)' }}>Sunday Synthesis</span>
          </div>
          <button onClick={refreshWeeklyReview} disabled={weeklyReviewLoading} title="Regenerate" style={{ padding: '5px 6px' }}>
            {weeklyReviewLoading ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
          </button>
        </div>
        <div>
          {weeklyReviewLoading && !weeklyReview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[85, 65, 95, 75].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 10, width: `${w}%` }} />
              ))}
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 4 }}>Synthesising week's decisions, inbox velocity & captures…</p>
            </div>
          ) : weeklyReview ? (
            <pre style={{ fontSize: 11.5, color: '#DCD6F7', lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{weeklyReview}</pre>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Weekly review generates automatically every Sunday or click refresh.</p>
          )}
        </div>
      </div>


      {/* Onboarding — no Gmail */}
      {gmailAccounts.length === 0 && (
        <div className="card" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)' }}>
            <IconSparkles size={18} />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Welcome to Wardyn</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Wardyn is your local-first chief-of-staff. Connect Gmail to start triaging high-signal messages and drafting responses in your voice.
          </p>
          <button onClick={connectGmail} style={{ background: 'var(--accent)', color: '#000', fontWeight: 600, borderColor: 'transparent', alignSelf: 'flex-start' }}>
            <IconMail size={13} /> Connect Gmail Account
          </button>
        </div>
      )}

      <p className="section-label">Needs your reply</p>

      {isLoading ? (
        <div className="empty-state"><p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading triaged items…</p></div>
      ) : pendingItems.length === 0 ? (
        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
            <IconInbox size={20} />
          </div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>All caught up!</h4>
          <p style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 300, lineHeight: 1.5 }}>No pending items. Click below to check for new messages.</p>
          {gmailAccounts.length > 0 && (
            <button onClick={syncGmail}>
              <IconRefresh size={13} /> Check New Messages
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendingItems.map((item) => <ReplyCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Low-urgency digest */}
      {items.some((i) => i.urgency === 'low') && (
        <div className="card" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📬</span>
              <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Daily Digest (5 PM Batch)</h4>
            </div>
            <span className="badge badge-warning">{items.filter((i) => i.urgency === 'low').length} Low-Urgency</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Low-urgency alerts silenced to prevent executive interruption.</p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.filter((i) => i.urgency === 'low').slice(0, 3).map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, background: 'var(--bg-elevated)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{item.sender}</span>
                <span style={{ flex: 1, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.preview}</span>
                <span className="badge badge-accent">{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
        <IconCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span>{calendarEvents.length} visa deadlines synced to calendar</span>
      </div>
    </div>
  );
};

