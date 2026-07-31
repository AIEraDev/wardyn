import React, { useEffect, useState } from 'react';
import {
  IconBrain,
  IconBookmark,
  IconPlus,
  IconLink,
  IconNote,
  IconChevronRight,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import type { KnowledgeItem, Decision } from '../types/queue';

// ─── Tag pill parser ─────────────────────────────────────────────────────────
function parseTags(tagsJson: string): string[] {
  try { return JSON.parse(tagsJson) || []; }
  catch { return []; }
}

const TAG_COLORS: Record<string, string> = {
  ai: 'bg-[rgba(74,143,194,0.15)] text-[#4A8FC2] border-[rgba(74,143,194,0.3)]',
  rust: 'bg-[rgba(232,130,61,0.15)] text-[#E8823D] border-[rgba(232,130,61,0.3)]',
  decision: 'bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border-[rgba(232,162,61,0.3)]',
  research: 'bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)]',
  startup: 'bg-[rgba(52,211,153,0.15)] text-[#34D399] border-[rgba(52,211,153,0.3)]',
  link: 'bg-[rgba(100,116,139,0.15)] text-[#94A3B8] border-[rgba(100,116,139,0.3)]',
};
const defaultTagColor = 'bg-[rgba(120,130,150,0.15)] text-[#9AA4B2] border-[rgba(120,130,150,0.3)]';
const tagColor = (t: string) => TAG_COLORS[t.toLowerCase()] || defaultTagColor;

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Knowledge Card ──────────────────────────────────────────────────────────
const KnowledgeCard: React.FC<{ item: KnowledgeItem }> = ({ item }) => {
  const tags = parseTags(item.tags);
  return (
    <div className="p-3 rounded-xl bg-[#0E1318] border border-[#1D2535] hover:border-[rgba(74,143,194,0.3)] transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[#7A8492]">
          {item.url ? <IconLink size={12} /> : <IconNote size={12} />}
          <span className="font-mono text-[10px] uppercase">{item.source}</span>
        </div>
        <span className="font-mono text-[10px] text-[#4A5568]">{relativeDate(item.created_at)}</span>
      </div>

      {item.summary ? (
        <p className="mt-1.5 text-[12px] text-[#C8D6E5] leading-relaxed">{item.summary}</p>
      ) : (
        <p className="mt-1.5 text-[12px] text-[#9AA4B2] leading-relaxed line-clamp-2">{item.content}</p>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            useQueueStore.getState().recordFeedInteraction(item.id, item.source, item.tags, 'opened');
          }}
          className="mt-1 text-[11px] text-[#4A8FC2] hover:underline truncate block"
        >
          {item.url.replace(/^https?:\/\//, '').slice(0, 60)}{item.url.length > 63 ? '…' : ''}
        </a>
      )}


      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${tagColor(t)}`}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Decision Card ───────────────────────────────────────────────────────────
const DecisionCard: React.FC<{ item: Decision }> = ({ item }) => (
  <div className="p-3 rounded-xl bg-[#0E1318] border border-[rgba(232,162,61,0.2)] hover:border-[rgba(232,162,61,0.4)] transition-colors">
    <div className="flex items-center justify-between mb-1">
      <span className="font-mono text-[10px] text-[#E8A23D] uppercase">Decision Log</span>
      <span className="font-mono text-[10px] text-[#4A5568]">{relativeDate(item.created_at)}</span>
    </div>
    <p className="text-[12px] font-semibold text-[#F0F4F8]">✓ {item.decision}</p>
    <p className="text-[11.5px] text-[#9AA4B2] mt-0.5">Because: {item.rationale}</p>
    {item.alternatives && (
      <p className="text-[11px] text-[#4A5568] mt-0.5">Considered: {item.alternatives}</p>
    )}
  </div>
);

// ─── Main MemoryTab ──────────────────────────────────────────────────────────
export const MemoryTab: React.FC = () => {
  const {
    knowledgeItems,
    decisions,
    saveKnowledgeItem,
    fetchKnowledgeItems,
    saveDecision,
    fetchDecisions,
  } = useQueueStore();

  // Capture state
  const [captureText, setCaptureText] = useState('');
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);

  // Decision form state
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionText, setDecisionText] = useState('');
  const [rationaleText, setRationaleText] = useState('');
  const [alternativesText, setAlternativesText] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);

  useEffect(() => {
    fetchKnowledgeItems();
    fetchDecisions();
  }, [fetchKnowledgeItems, fetchDecisions]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureText.trim()) return;
    setCaptureSaving(true);
    const isUrl = captureText.trim().startsWith('http');
    await saveKnowledgeItem(
      isUrl ? '' : captureText.trim(),
      isUrl ? captureText.trim() : undefined
    );
    setCaptureText('');
    setCaptureSaving(false);
    setCaptureDone(true);
    setTimeout(() => setCaptureDone(false), 2000);
  };

  const handleSaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionText.trim() || !rationaleText.trim()) return;
    setDecisionSaving(true);
    await saveDecision(decisionText.trim(), rationaleText.trim(), alternativesText.trim() || undefined);
    setDecisionText('');
    setRationaleText('');
    setAlternativesText('');
    setDecisionSaving(false);
    setShowDecisionForm(false);
  };

  // Merge & sort all items by date for unified timeline
  const timeline = [
    ...knowledgeItems.map((k) => ({ type: 'knowledge' as const, data: k, date: k.created_at })),
    ...decisions.map((d) => ({ type: 'decision' as const, data: d, date: d.created_at })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0 flex items-center gap-2">
            <IconBrain size={20} className="text-[#4A8FC2]" />
            Memory
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Personal knowledge & decision log — feeds tomorrow's brief</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-[rgba(74,143,194,0.1)] text-[#4A8FC2] px-2 py-1 rounded border border-[rgba(74,143,194,0.25)]">
            {knowledgeItems.length} captures
          </span>
          <span className="font-mono text-[10px] bg-[rgba(232,162,61,0.1)] text-[#E8A23D] px-2 py-1 rounded border border-[rgba(232,162,61,0.25)]">
            {decisions.length} decisions
          </span>
        </div>
      </div>

      {/* ── Quick Capture Bar ── */}
      <div className="mb-5 p-4 rounded-xl bg-gradient-to-br from-[#0E1318] to-[#141B24] border border-[rgba(74,143,194,0.2)]">
        <p className="text-[11px] font-semibold text-[#7A8492] uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <IconBookmark size={12} />
          Quick Capture — paste a URL, type a note, or drop any insight
        </p>
        <form onSubmit={handleCapture} className="flex gap-2">
          <input
            id="memory-capture-input"
            type="text"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            placeholder="https://... or type a thought, insight, or note..."
            className="flex-1 bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] transition-colors font-mono"
          />
          <button
            type="submit"
            disabled={captureSaving || !captureText.trim()}
            className="px-3 py-2 bg-[#4A8FC2] text-black text-xs font-semibold rounded-lg hover:bg-[#5b9bd1] transition-colors disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
          >
            {captureSaving ? <IconLoader2 size={13} className="animate-spin" />
              : captureDone ? <IconCheck size={13} />
              : <IconPlus size={13} />}
            {captureDone ? 'Saved!' : 'Capture'}
          </button>
        </form>
        <p className="text-[10px] text-[#4A5568] font-mono mt-1.5">
          Ollama will auto-tag and summarise in the background. Tags appear within ~10s.
        </p>
      </div>

      {/* ── Log Decision Button / Form ── */}
      <div className="mb-5">
        {!showDecisionForm ? (
          <button
            onClick={() => setShowDecisionForm(true)}
            className="w-full p-3 rounded-xl border border-dashed border-[rgba(232,162,61,0.3)] text-[#E8A23D] text-[11.5px] hover:bg-[rgba(232,162,61,0.05)] transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <IconPlus size={14} />
            Log a Decision
          </button>
        ) : (
          <form onSubmit={handleSaveDecision} className="p-4 rounded-xl bg-[#0E1318] border border-[rgba(232,162,61,0.25)] space-y-3">
            <p className="text-[11px] font-semibold text-[#E8A23D] uppercase tracking-wider">Log a Decision</p>
            <input
              id="decision-choice-input"
              type="text"
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              placeholder="What did you choose? (e.g. Use SQLite over Postgres)"
              className="w-full bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#E8A23D] font-mono"
              required
            />
            <input
              id="decision-rationale-input"
              type="text"
              value={rationaleText}
              onChange={(e) => setRationaleText(e.target.value)}
              placeholder="Why? (e.g. Local-first, no infra overhead)"
              className="w-full bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#E8A23D] font-mono"
              required
            />
            <input
              id="decision-alternatives-input"
              type="text"
              value={alternativesText}
              onChange={(e) => setAlternativesText(e.target.value)}
              placeholder="What else did you consider? (optional)"
              className="w-full bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#E8A23D] font-mono"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={decisionSaving}
                className="px-4 py-2 bg-[#E8A23D] text-black text-xs font-semibold rounded-lg hover:bg-[#f0b254] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                {decisionSaving ? <IconLoader2 size={12} className="animate-spin" /> : <IconCheck size={12} />}
                Save Decision
              </button>
              <button
                type="button"
                onClick={() => setShowDecisionForm(false)}
                className="px-4 py-2 text-xs text-[#7A8492] hover:text-[#9AA4B2] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Unified Timeline ── */}
      <p className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <IconChevronRight size={12} />
        Memory Timeline
      </p>

      {timeline.length === 0 ? (
        <div className="p-8 text-center bg-[#0E1318] border border-[#1D2535] rounded-xl space-y-2">
          <p className="text-[#7A8492] text-sm">Your memory is empty.</p>
          <p className="text-[#4A5568] text-xs">Capture a URL, drop a thought, or log a decision above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.map((entry) =>
            entry.type === 'knowledge'
              ? <KnowledgeCard key={entry.data.id} item={entry.data as KnowledgeItem} />
              : <DecisionCard key={entry.data.id} item={entry.data as Decision} />
          )}
        </div>
      )}
    </div>
  );
};
