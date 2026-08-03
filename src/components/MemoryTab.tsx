import React, { useEffect, useMemo, useState } from "react";
import {
  IconBrain,
  IconBookmark,
  IconPlus,
  IconLink,
  IconNote,
  IconChevronRight,
  IconCheck,
  IconLoader2,
  IconBook,
  IconPencil,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { useQueueStore } from "../store/useQueueStore";
import type { KnowledgeItem, Decision } from "../types/queue";
import { BriefRenderer } from "./BriefRenderer";

// ─── Tag pill parser (MEM-2: robust — handles JSON array OR comma-separated plain string) ─────
function parseTags(tagsJson: string): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === "string") return parsed.split(",").map((t) => t.trim()).filter(Boolean);
    return [];
  } catch {
    // Not JSON — treat as plain comma-separated string
    return tagsJson.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

const TAG_COLORS: Record<string, string> = {
  ai: "bg-[rgba(74,143,194,0.15)] text-[#4A8FC2] border-[rgba(74,143,194,0.3)]",
  rust: "bg-[rgba(232,130,61,0.15)] text-[#E8823D] border-[rgba(232,130,61,0.3)]",
  decision:
    "bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border-[rgba(232,162,61,0.3)]",
  research:
    "bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)]",
  startup:
    "bg-[rgba(52,211,153,0.15)] text-[#34D399] border-[rgba(52,211,153,0.3)]",
  link: "bg-[rgba(100,116,139,0.15)] text-[#94A3B8] border-[rgba(100,116,139,0.3)]",
};
const defaultTagColor =
  "bg-[rgba(120,130,150,0.15)] text-[#9AA4B2] border-[rgba(120,130,150,0.3)]";
const tagColor = (t: string) => TAG_COLORS[t.toLowerCase()] || defaultTagColor;

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Knowledge Card ──────────────────────────────────────────────────────────
const KnowledgeCard: React.FC<{ item: KnowledgeItem }> = ({ item }) => {
  const tags = parseTags(item.tags);
  const [deepReading, setDeepReading] = useState(false);
  const [deepReadText, setDeepReadText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleDeepRead = async () => {
    if (!item.url) return;
    if (deepReadText) {
      setExpanded(!expanded);
      return;
    }
    setDeepReading(true);
    setExpanded(true);
    const result = await useQueueStore.getState().deepReadUrl(item.url);
    setDeepReadText(result);
    setDeepReading(false);
  };

  return (
    <div className="p-3 rounded-xl bg-[#0E1318] border border-[#1D2535] hover:border-[rgba(74,143,194,0.3)] transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[#7A8492]">
          {item.url ? <IconLink size={12} /> : <IconNote size={12} />}
          <span className="font-mono text-[10px] uppercase">{item.source}</span>
        </div>
        <span className="font-mono text-[10px] text-[#4A5568]">
          {relativeDate(item.created_at)}
        </span>
      </div>

      {item.summary ? (
        <p className="mt-1.5 text-[12px] text-[#C8D6E5] leading-relaxed">
          {item.summary}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-[#9AA4B2] leading-relaxed line-clamp-2">
          {item.content}
        </p>
      )}

      {item.url && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              useQueueStore
                .getState()
                .recordFeedInteraction(
                  item.id,
                  item.source,
                  item.tags,
                  "opened",
                );
            }}
            className="text-[11px] text-[#4A8FC2] hover:underline truncate"
          >
            {item.url.replace(/^https?:\/\//, "").slice(0, 50)}
            {item.url.length > 53 ? "…" : ""}
          </a>

          <button
            type="button"
            onClick={handleDeepRead}
            disabled={deepReading}
            className="px-2 py-0.5 rounded font-mono text-[10px] bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border border-[rgba(74,143,194,0.25)] hover:bg-[rgba(74,143,194,0.2)] transition-colors shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            {deepReading ? (
              <IconLoader2 size={11} className="animate-spin" />
            ) : (
              <IconBook size={11} />
            )}
            <span>
              {deepReading ? "Scraping…" : expanded ? "Hide Read" : "Deep Read"}
            </span>
          </button>
        </div>
      )}

      {expanded && (
        <div className="mt-3 p-3 rounded-lg bg-[#080C10] border border-[rgba(74,143,194,0.25)]">
          {deepReading ? (
            <div className="space-y-1.5">
              <div className="h-2.5 bg-[#1A2233] rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-[#1A2233] rounded animate-pulse w-1/2" />
              <div className="h-2.5 bg-[#1A2233] rounded animate-pulse w-5/6" />
              <p className="text-[10px] text-[#7A8492] font-mono pt-1">
                Scraping web page & running Ollama AI analysis…
              </p>
            </div>
          ) : deepReadText ? (
            <BriefRenderer text={deepReadText} baseColor="#C8D6E5" />
          ) : null}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${tagColor(t)}`}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Decision Card ───────────────────────────────────────────────────────────
const DecisionCard: React.FC<{ item: Decision }> = ({ item }) => {
  const updateDecisionOutcome = useQueueStore((s) => s.updateDecisionOutcome);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [outcomeText, setOutcomeText] = useState(item.outcome || "");
  const [saving, setSaving] = useState(false);

  const handleSaveOutcome = async () => {
    if (!outcomeText.trim()) return;
    setSaving(true);
    await updateDecisionOutcome(item.id, outcomeText.trim());
    setSaving(false);
    setEditingOutcome(false);
  };

  return (
    <div className="p-3 rounded-xl bg-[#0E1318] border border-[rgba(232,162,61,0.2)] hover:border-[rgba(232,162,61,0.4)] transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-[#E8A23D] uppercase">
          Decision Log
        </span>
        <span className="font-mono text-[10px] text-[#4A5568]">
          {relativeDate(item.created_at)}
        </span>
      </div>
      <p className="text-[12px] font-semibold text-[#F0F4F8]">
        ✓ {item.decision}
      </p>
      <p className="text-[11.5px] text-[#9AA4B2] mt-0.5">
        Because: {item.rationale}
      </p>
      {item.alternatives && (
        <p className="text-[11px] text-[#4A5568] mt-0.5">
          Considered: {item.alternatives}
        </p>
      )}

      {/* Outcome tracking */}
      {item.outcome && !editingOutcome ? (
        <div className="mt-2 pt-2 border-t border-[rgba(52,211,153,0.15)] flex items-start justify-between gap-2">
          <p className="text-[11px] text-[#34D399] flex-1">
            <span className="font-semibold">Outcome: </span>
            {item.outcome}
          </p>
          <button
            onClick={() => {
              setOutcomeText(item.outcome || "");
              setEditingOutcome(true);
            }}
            className="shrink-0 text-[#4A5568] hover:text-[#9AA4B2] transition-colors cursor-pointer"
            title="Edit outcome"
          >
            <IconPencil size={11} />
          </button>
        </div>
      ) : editingOutcome ? (
        <div className="mt-2 pt-2 border-t border-[rgba(52,211,153,0.15)] space-y-1.5">
          <textarea
            value={outcomeText}
            onChange={(e) => setOutcomeText(e.target.value)}
            placeholder="How did this decision turn out?"
            rows={2}
            autoFocus
            className="w-full bg-[#151A21] border border-[rgba(52,211,153,0.3)] rounded-lg text-[11px] text-[#E2E8F0] px-2.5 py-1.5 resize-none outline-none font-[inherit]"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveOutcome}
              disabled={saving || !outcomeText.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[rgba(52,211,153,0.15)] text-[#34D399] text-[10px] font-semibold border border-[rgba(52,211,153,0.3)] cursor-pointer disabled:opacity-50 hover:bg-[rgba(52,211,153,0.25)] transition-colors"
            >
              {saving ? (
                <IconLoader2 size={10} className="animate-spin" />
              ) : (
                <IconCheck size={10} />
              )}
              Save
            </button>
            <button
              onClick={() => setEditingOutcome(false)}
              className="px-2.5 py-1 rounded-md bg-[#151A21] text-[#7A8492] text-[10px] border border-[#242B35] cursor-pointer hover:text-[#F0F4F8] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingOutcome(true)}
          className="mt-1.5 text-[10px] text-[#4A5568] hover:text-[#E8A23D] transition-colors cursor-pointer flex items-center gap-1"
        >
          <IconPlus size={10} /> Add outcome
        </button>
      )}
    </div>
  );
};

// ─── Main MemoryTab ──────────────────────────────────────────────────────────
export const MemoryTab: React.FC = () => {
  const {
    knowledgeItems,
    decisions,
    saveKnowledgeItem,
    fetchKnowledgeItems,
    saveDecision,
    fetchDecisions,
    askClarification,
    ollamaModels,
    ollamaChecked,
  } = useQueueStore();

  const aiOnline = ollamaChecked && ollamaModels.length > 0;

  // Capture state
  const [captureText, setCaptureText] = useState("");
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);
  // Clarification state for quick capture
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([]);
  const [clarifyPending, setClarifyPending] = useState(false);
  const [pendingCaptureText, setPendingCaptureText] = useState("");

  // Decision form state
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionText, setDecisionText] = useState("");
  const [rationaleText, setRationaleText] = useState("");
  const [alternativesText, setAlternativesText] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);

  // Memory search + filter state (MEM-3)
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<"all" | "knowledge" | "decision">("all");

  const captureBytes = new TextEncoder().encode(captureText).length;
  const captureOverLimit = captureBytes > 50 * 1024;
  const captureNearLimit = captureBytes > 40 * 1024;

  const decisionBytes = new TextEncoder().encode(
    decisionText + rationaleText + alternativesText,
  ).length;
  const decisionOverLimit = decisionBytes > 50 * 1024;

  useEffect(() => {
    fetchKnowledgeItems();
    fetchDecisions();
  }, [fetchKnowledgeItems, fetchDecisions]);

  const doSave = async (text: string) => {
    setCaptureSaving(true);
    const isUrl = text.trim().startsWith("http");
    await saveKnowledgeItem(
      isUrl ? "" : text.trim(),
      isUrl ? text.trim() : undefined,
    );
    setCaptureText("");
    setPendingCaptureText("");
    setClarifyQuestions([]);
    setClarifyAnswers([]);
    setCaptureSaving(false);
    setCaptureDone(true);
    setTimeout(() => setCaptureDone(false), 2500);
  };

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureText.trim() || captureOverLimit) return;

    const raw = captureText.trim();
    const isUrl = raw.startsWith("http");

    // URLs don't benefit from clarification — save immediately
    if (isUrl || !aiOnline) {
      await doSave(raw);
      return;
    }

    // Ask AI if it needs more context
    setClarifyPending(true);
    setPendingCaptureText(raw);
    try {
      const qs = await askClarification(raw);
      if (qs.length > 0) {
        setClarifyQuestions(qs);
        setClarifyAnswers(new Array(qs.length).fill(""));
        setClarifyPending(false);
        return; // show clarify UI inline
      }
    } catch {
      // fall through to save
    }
    setClarifyPending(false);
    await doSave(raw);
  };

  const handleClarifySubmit = async () => {
    const extras = clarifyQuestions
      .map((q, i) =>
        clarifyAnswers[i]?.trim() ? `${q} ${clarifyAnswers[i].trim()}` : "",
      )
      .filter(Boolean)
      .join(". ");
    const enriched = extras
      ? `${pendingCaptureText}. Additional context: ${extras}`
      : pendingCaptureText;
    await doSave(enriched);
  };

  const handleSaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionText.trim() || !rationaleText.trim() || decisionOverLimit)
      return;
    setDecisionSaving(true);
    await saveDecision(
      decisionText.trim(),
      rationaleText.trim(),
      alternativesText.trim() || undefined,
    );
    setDecisionText("");
    setRationaleText("");
    setAlternativesText("");
    setDecisionSaving(false);
    setShowDecisionForm(false);
  };

  // Merge & sort all items by date for unified timeline
  const timeline = useMemo(() => [
    ...knowledgeItems.map((k) => ({
      type: "knowledge" as const,
      data: k,
      date: k.created_at,
    })),
    ...decisions.map((d) => ({
      type: "decision" as const,
      data: d,
      date: d.created_at,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [knowledgeItems, decisions]);

  // Filtered timeline (MEM-3)
  const filteredTimeline = useMemo(() => {
    let result = timeline;
    if (memoryTypeFilter !== "all") {
      result = result.filter((e) => e.type === memoryTypeFilter);
    }
    if (memorySearch.trim()) {
      const q = memorySearch.toLowerCase();
      result = result.filter((e) => {
        if (e.type === "knowledge") {
          const k = e.data as KnowledgeItem;
          return (
            k.content?.toLowerCase().includes(q) ||
            k.summary?.toLowerCase().includes(q) ||
            k.url?.toLowerCase().includes(q) ||
            parseTags(k.tags || "").some((t) => t.toLowerCase().includes(q))
          );
        } else {
          const d = e.data as Decision;
          return (
            d.decision?.toLowerCase().includes(q) ||
            d.rationale?.toLowerCase().includes(q) ||
            d.alternatives?.toLowerCase().includes(q)
          );
        }
      });
    }
    return result;
  }, [timeline, memorySearch, memoryTypeFilter]);

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0 flex items-center gap-2">
            <IconBrain size={20} className="text-[#4A8FC2]" />
            Memory
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Personal knowledge & decision log — feeds tomorrow's brief
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!aiOnline && (
            <span className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)] uppercase tracking-wider">
              ⚡ AI offline
            </span>
          )}
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
            className={`flex-1 bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#4A5568] p-2.5 rounded-lg border focus:outline-none transition-colors font-mono ${
              captureOverLimit
                ? "border-[#EF4444] focus:border-[#EF4444]"
                : captureNearLimit
                  ? "border-[#E8A23D] focus:border-[#E8A23D]"
                  : "border-[#1D2535] focus:border-[#4A8FC2]"
            }`}
          />
          <button
            type="submit"
            disabled={captureSaving || !captureText.trim() || captureOverLimit}
            className="px-3 py-2 bg-[#4A8FC2] text-black text-xs font-semibold rounded-lg hover:bg-[#5b9bd1] transition-colors disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
          >
            {captureSaving ? (
              <IconLoader2 size={13} className="animate-spin" />
            ) : captureDone ? (
              <IconCheck size={13} />
            ) : (
              <IconPlus size={13} />
            )}
            {captureDone ? "Saved!" : "Capture"}
          </button>
        </form>
        {captureOverLimit ? (
          <p className="text-[10px] text-[#EF4444] font-mono mt-1.5">
            ❌ Content exceeds 50 KB soft cap (
            {(captureBytes / 1024).toFixed(1)} KB). Please trim text.
          </p>
        ) : captureNearLimit ? (
          <p className="text-[10px] text-[#E8A23D] font-mono mt-1.5">
            ⚠️ Approaching limit: {(captureBytes / 1024).toFixed(1)} KB / 50 KB
          </p>
        ) : (
          <p className="text-[10px] text-[#4A5568] font-mono mt-1.5">
            {aiOnline
              ? "Ollama will auto-tag and summarise in the background. Tags appear within ~10s."
              : "⚡ AI offline — note will be captured with keyword-based tags."}
          </p>
        )}

        {/* ── Inline clarification panel ── */}
        {clarifyPending && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[#64748B]">
            <IconLoader2 size={13} className="animate-spin text-[#4A8FC2]" />
            Checking if more context would help…
          </div>
        )}

        {clarifyQuestions.length > 0 && !clarifyPending && (
          <div className="mt-3 p-3.5 rounded-xl bg-[#080C12] border border-[rgba(74,143,194,0.2)] space-y-3">
            <p className="text-[11px] text-[#7A8492]">
              A couple of quick questions to make this more useful:
            </p>
            <div className="text-[11px] text-[#4A5568] italic truncate bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded">
              "
              {pendingCaptureText.length > 70
                ? pendingCaptureText.slice(0, 70) + "…"
                : pendingCaptureText}
              "
            </div>

            {clarifyQuestions.map((q, i) => (
              <div key={i} className="space-y-1">
                <label className="text-[11px] font-medium text-[#C8D6E5] flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-[rgba(74,143,194,0.2)] text-[#4A8FC2] flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {q}
                </label>
                <input
                  type="text"
                  value={clarifyAnswers[i] ?? ""}
                  onChange={(e) => {
                    const next = [...clarifyAnswers];
                    next[i] = e.target.value;
                    setClarifyAnswers(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && i === clarifyQuestions.length - 1)
                      handleClarifySubmit();
                  }}
                  autoFocus={i === 0}
                  placeholder="Your answer (or leave blank to skip)"
                  className="w-full bg-[#0B0F16] text-[12px] text-[#F0F4F8] placeholder-[#3A4255] p-2 rounded-lg border border-[#1D2535] focus:outline-none focus:border-[#4A8FC2] font-mono"
                />
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => doSave(pendingCaptureText)}
                className="font-mono text-[10px] px-3 py-1.5 rounded-lg bg-transparent border border-[#242B35] text-[#4A5568] hover:text-[#9AA4B2] transition-colors cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleClarifySubmit}
                disabled={captureSaving}
                className="flex-1 font-mono text-[11px] px-3 py-1.5 rounded-lg bg-[#4A8FC2] text-black font-semibold hover:bg-[#5b9bd1] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {captureSaving ? (
                  <IconLoader2 size={12} className="animate-spin" />
                ) : (
                  <IconCheck size={12} />
                )}
                Save with context
              </button>
            </div>
          </div>
        )}
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
          <form
            onSubmit={handleSaveDecision}
            className="p-4 rounded-xl bg-[#0E1318] border border-[rgba(232,162,61,0.25)] space-y-3"
          >
            <p className="text-[11px] font-semibold text-[#E8A23D] uppercase tracking-wider">
              Log a Decision
            </p>
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
                {decisionSaving ? (
                  <IconLoader2 size={12} className="animate-spin" />
                ) : (
                  <IconCheck size={12} />
                )}
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

      {/* ── Memory Search + Filter (MEM-3) ── */}
      {timeline.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4A5568] pointer-events-none" />
            <input
              value={memorySearch}
              onChange={(e) => setMemorySearch(e.target.value)}
              placeholder="Search memory…"
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-[#0E1318] border border-[#1D2535] rounded-lg text-[#F0F4F8] placeholder-[#4A5568] outline-none focus:border-[#4A8FC2] transition-colors"
            />
            {memorySearch && (
              <button
                type="button"
                onClick={() => setMemorySearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#F0F4F8] cursor-pointer"
              >
                <IconX size={12} />
              </button>
            )}
          </div>
          {(["all", "knowledge", "decision"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setMemoryTypeFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer capitalize ${
                memoryTypeFilter === f
                  ? "bg-[rgba(74,143,194,0.15)] border-[rgba(74,143,194,0.4)] text-[#4A8FC2]"
                  : "bg-transparent border-[#1D2535] text-[#7A8492] hover:text-[#F0F4F8]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* ── Unified Timeline ── */}
      <p className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <IconChevronRight size={12} />
        Memory Timeline
        {memorySearch && (
          <span className="font-normal normal-case text-[#4A5568] ml-1">
            — {filteredTimeline.length} result{filteredTimeline.length !== 1 ? "s" : ""}
          </span>
        )}
      </p>

      {filteredTimeline.length === 0 ? (
        <div className="p-8 text-center bg-[#0E1318] border border-[#1D2535] rounded-xl space-y-2">
          {memorySearch || memoryTypeFilter !== "all" ? (
            <p className="text-[#7A8492] text-sm">No results match your filter.</p>
          ) : (
            <>
              <p className="text-[#7A8492] text-sm">Your memory is empty.</p>
              <p className="text-[#4A5568] text-xs">
                Capture a URL, drop a thought, or log a decision above.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTimeline.map((entry) =>
            entry.type === "knowledge" ? (
              <KnowledgeCard
                key={entry.data.id}
                item={entry.data as KnowledgeItem}
              />
            ) : (
              <DecisionCard key={entry.data.id} item={entry.data as Decision} />
            ),
          )}
        </div>
      )}
    </div>
  );
};
