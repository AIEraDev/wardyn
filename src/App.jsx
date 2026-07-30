import React, { useState } from 'react';

export default function App() {
  const [approvedCards, setApprovedCards] = useState({});

  const handleApprove = (cardId) => {
    setApprovedCards((prev) => ({ ...prev, [cardId]: true }));
  };

  const reviewCount = 3 - Object.keys(approvedCards).filter((k) => approvedCards[k]).length;

  return (
    <>
      <h2 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        Wardyn desktop app: a sidebar with navigation and a main daily brief showing reply cards awaiting approval, a content brief card, and an auto-handled summary
      </h2>
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Sidebar Navigation */}
        <div style={{ width: '140px', flexShrink: 0, background: 'var(--surface-1)', borderRadius: '12px', padding: '1rem 0.75rem', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '14px', marginBottom: '12px', borderBottom: '1px solid var(--border)' }}>
            <i className="ti ti-shield-check" style={{ fontSize: '20px', color: 'var(--text-accent)' }} aria-hidden="true"></i>
            <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' }}>Wardyn</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius)', background: 'var(--bg-accent)', color: 'var(--text-accent)', fontSize: '13px', fontWeight: 500 }}>
              <i className="ti ti-layout-dashboard" style={{ fontSize: '16px' }} aria-hidden="true"></i>Today
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              <i className="ti ti-mail" style={{ fontSize: '16px' }} aria-hidden="true"></i>Messages
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              <i className="ti ti-pencil" style={{ fontSize: '16px' }} aria-hidden="true"></i>Content
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              <i className="ti ti-calendar" style={{ fontSize: '16px' }} aria-hidden="true"></i>Deadlines
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              <i className="ti ti-settings" style={{ fontSize: '16px' }} aria-hidden="true"></i>Settings
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>Today</h1>
              <p className="font-mono" style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Thu, 30 Jul</p>
            </div>
            <span className="font-mono" style={{ fontSize: '12px', background: 'var(--bg-warning)', color: 'var(--text-warning)', padding: '4px 10px', borderRadius: 'var(--radius)', fontWeight: 500 }}>
              {reviewCount} to review
            </span>
          </div>

          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Needs your reply</p>
          
          {/* Card 1: Gmail Visa */}
          <div
            className="rcard"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              marginBottom: '12px',
              opacity: approvedCards.card1 ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span className="font-mono" style={{ fontSize: '12px', background: 'var(--surface-1)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <i className="ti ti-mail" style={{ fontSize: '13px', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true"></i>Gmail
              </span>
              {/* Alert Amber reserved specifically for urgent/attention tag */}
              <span className="font-mono" style={{ fontSize: '12px', background: 'var(--bg-warning)', color: 'var(--text-warning)', padding: '3px 8px', borderRadius: 'var(--radius)', fontWeight: 500 }}>Visa</span>
            </div>
            <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 2px' }}>UK Visas and Immigration</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>Additional documents required for your Global Talent application</p>
            <div style={{ borderLeft: '2px solid var(--border-strong)', borderRadius: 0, padding: '6px 0 6px 10px', marginBottom: '10px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Thanks for the update, I have attached the requested reference letters and will follow up by Friday.</p>
            </div>
            <div className="actions" style={{ display: 'flex', gap: '8px' }}>
              {approvedCards.card1 ? (
                <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-success)' }}>
                  <i className="ti ti-check" style={{ fontSize: '14px', verticalAlign: '-2px', marginRight: '4px' }}></i>Done
                </span>
              ) : (
                <>
                  <button className="btn-accent" onClick={() => handleApprove('card1')} style={{ fontSize: '13px', padding: '6px 12px' }}>Approve</button>
                  <button style={{ fontSize: '13px', padding: '6px 12px' }}>Edit</button>
                  <button style={{ fontSize: '13px', padding: '6px 12px' }}>Skip</button>
                </>
              )}
            </div>
          </div>

          {/* Card 2: WhatsApp */}
          <div
            className="rcard"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              marginBottom: '20px',
              opacity: approvedCards.card2 ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span className="font-mono" style={{ fontSize: '12px', background: 'var(--surface-1)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <i className="ti ti-message-circle" style={{ fontSize: '13px', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true"></i>WhatsApp
              </span>
            </div>
            <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 2px' }}>Stackkith organizers</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>Can you confirm the workshop time for next event?</p>
            <div style={{ borderLeft: '2px solid var(--border-strong)', borderRadius: 0, padding: '6px 0 6px 10px', marginBottom: '10px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Confirmed, workshop starts 3pm WAT, I will share the meet link Thursday morning.</p>
            </div>
            <div className="actions" style={{ display: 'flex', gap: '8px' }}>
              {approvedCards.card2 ? (
                <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-success)' }}>
                  <i className="ti ti-check" style={{ fontSize: '14px', verticalAlign: '-2px', marginRight: '4px' }}></i>Done
                </span>
              ) : (
                <>
                  <button className="btn-accent" onClick={() => handleApprove('card2')} style={{ fontSize: '13px', padding: '6px 12px' }}>Approve</button>
                  <button style={{ fontSize: '13px', padding: '6px 12px' }}>Edit</button>
                  <button style={{ fontSize: '13px', padding: '6px 12px' }}>Skip</button>
                </>
              )}
            </div>
          </div>

          {/* Card 3: Today's Content */}
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Today's content</p>
          <div
            className="rcard"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              marginBottom: '20px',
              opacity: approvedCards.card3 ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span className="font-mono" style={{ fontSize: '12px', background: 'var(--surface-1)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <i className="ti ti-brand-linkedin" style={{ fontSize: '13px', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true"></i>LinkedIn
              </span>
            </div>
            <p style={{ fontSize: '13px', margin: '0 0 8px' }}>Caption: shipped the text-effects engine rewrite in Clypra this week, cleaner api, 30+ effects ported.</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
              <i className="ti ti-player-play" style={{ fontSize: '14px', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true"></i>Record cue: 20s clip of the effect picker in action
            </p>
            <div className="actions" style={{ display: 'flex', gap: '8px' }}>
              {approvedCards.card3 ? (
                <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-success)' }}>
                  <i className="ti ti-check" style={{ fontSize: '14px', verticalAlign: '-2px', marginRight: '4px' }}></i>Done
                </span>
              ) : (
                <>
                  <button className="btn-accent" onClick={() => handleApprove('card3')} style={{ fontSize: '13px', padding: '6px 12px' }}>Use this</button>
                  <button style={{ fontSize: '13px', padding: '6px 12px' }}>Skip</button>
                </>
              )}
            </div>
          </div>

          <p className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            <i className="ti ti-check" style={{ fontSize: '14px', verticalAlign: '-2px', marginRight: '6px' }} aria-hidden="true"></i>2 visa deadlines synced to calendar automatically
          </p>
        </div>
      </div>
    </>
  );
}
