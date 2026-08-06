import React, { useState, useRef, useCallback } from "react";
import {
  IconSearch,
  IconLoader2,
  IconBookmark,
  IconExternalLink,
  IconSparkles,
  IconX,
  IconBrandWikipedia,
  IconWorld,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
  IconBrandYcombinator,
  IconBook,
  IconCopy,
  IconCalendar,
  IconSortDescending,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  source_used: string;
}

type SearchCategory = "all" | "web" | "tech" | "wiki" | "academic";
type SortBy = "relevance" | "date";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function domain(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function SourceBadge({ source }: { source: string }) {
  let badgeStyle = "bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border-[rgba(74,143,194,0.25)]";
  let icon = <IconWorld size={9} />;

  if (source === "Wikipedia") {
    badgeStyle = "bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)]";
    icon = <IconBrandWikipedia size={9} />;
  } else if (source === "HackerNews") {
    badgeStyle = "bg-[rgba(255,102,0,0.15)] text-[#FF6600] border-[rgba(255,102,0,0.3)]";
    icon = <IconBrandYcombinator size={9} />;
  } else if (source === "ArXiv") {
    badgeStyle = "bg-[rgba(234,179,8,0.15)] text-[#EAB308] border-[rgba(234,179,8,0.3)]";
    icon = <IconBook size={9} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${badgeStyle}`}
    >
      {icon}
      {source}
    </span>
  );
}

// ─── Single Result Card ───────────────────────────────────────────────────────

function ResultCard({
  result,
  onSave,
  saved,
}: {
  result: SearchResult;
  onSave: (r: SearchResult) => void;
  saved: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const formattedDate = formatDate(result.date);
  const isLongSnippet = result.snippet && result.snippet.length > 160;

  const openUrl = async (url: string) => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_external_url", { url });
      } else {
        window.open(url, "_blank");
      }
    } catch {
      window.open(url, "_blank");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3.5 rounded-xl bg-[#0E1318] border border-[#1D2535] hover:border-[rgba(74,143,194,0.3)] transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title & Metadata row */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <SourceBadge source={result.source} />
            <span className="font-mono text-[10px] text-[#4A5568] truncate">
              {domain(result.url)}
            </span>
            {formattedDate && (
              <span className="font-mono text-[10px] text-[#7A8492] flex items-center gap-1 bg-[#151A21] px-1.5 py-0.5 rounded border border-[#242B35]">
                <IconCalendar size={10} className="text-[#4A8FC2]" />
                {formattedDate}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => openUrl(result.url)}
            className="text-[13.5px] font-semibold text-[#E2E8F0] hover:text-[#4A8FC2] text-left leading-snug transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            {result.title}
          </button>
          {/* Snippet */}
          {result.snippet && (
            <p
              className={`mt-1.5 text-[11.5px] text-[#9AA4B2] leading-relaxed transition-all ${
                expanded ? "" : "line-clamp-2"
              }`}
            >
              {result.snippet}
            </p>
          )}
          {/* Show More / Show Less Toggle — only visible when snippet is genuinely long */}
          {isLongSnippet && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-[10.5px] text-[#4A8FC2] hover:text-[#5b9bd1] flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0 font-mono font-medium"
            >
              {expanded ? (
                <>
                  <IconChevronUp size={12} /> Show less
                </>
              ) : (
                <>
                  <IconChevronDown size={12} /> Show full snippet
                </>
              )}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => openUrl(result.url)}
            title="Open link"
            className="p-1.5 rounded-lg bg-[#151A21] border border-[#242B35] text-[#7A8492] hover:text-[#4A8FC2] hover:border-[rgba(74,143,194,0.4)] transition-colors cursor-pointer"
          >
            <IconExternalLink size={13} />
          </button>
          <button
            type="button"
            onClick={() => copyUrl(result.url)}
            title="Copy URL"
            className="p-1.5 rounded-lg bg-[#151A21] border border-[#242B35] text-[#7A8492] hover:text-[#E2E8F0] transition-colors cursor-pointer"
          >
            {copied ? <IconCheck size={13} className="text-[#34D399]" /> : <IconCopy size={13} />}
          </button>
          <button
            type="button"
            onClick={() => onSave(result)}
            title="Save to Memory"
            disabled={saved}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:cursor-default ${
              saved
                ? "bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.3)] text-[#34D399]"
                : "bg-[#151A21] border-[#242B35] text-[#7A8492] hover:text-[#34D399] hover:border-[rgba(52,211,153,0.3)]"
            }`}
          >
            {saved ? <IconCheck size={13} /> : <IconBookmark size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Summary Panel ─────────────────────────────────────────────────────────

function AISummaryPanel({
  results,
  summary,
  loading,
  onGenerate,
  onSave,
  saved,
}: {
  results: SearchResult[];
  summary: string | null;
  loading: boolean;
  onGenerate: () => void;
  onSave: () => void;
  saved: boolean;
}) {
  if (results.length === 0) return null;

  return (
    <div className="rounded-xl border border-[rgba(124,58,237,0.3)] bg-gradient-to-br from-[rgba(124,58,237,0.08)] to-[rgba(74,143,194,0.05)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconSparkles size={14} className="text-[#7C3AED]" />
          <span className="text-[11px] font-bold text-[#7C3AED] font-mono uppercase tracking-wider">
            AI Research Synthesis
          </span>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <button
              type="button"
              onClick={onSave}
              disabled={saved}
              className={`flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                saved
                  ? "bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.3)] text-[#34D399]"
                  : "bg-[#151A21] border-[#242B35] text-[#9AA4B2] hover:text-[#34D399] hover:border-[rgba(52,211,153,0.3)]"
              }`}
            >
              {saved ? <IconCheck size={11} /> : <IconBookmark size={11} />}
              {saved ? "Saved" : "Save to Memory"}
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-lg bg-[rgba(124,58,237,0.15)] border border-[rgba(124,58,237,0.3)] text-[#7C3AED] hover:bg-[rgba(124,58,237,0.25)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 size={11} className="animate-spin" />
            ) : (
              <IconRefresh size={11} />
            )}
            {summary ? "Regenerate" : "Generate AI Summary"}
          </button>
        </div>
      </div>

      {loading && !summary && (
        <div className="space-y-2">
          {[3 / 4, 1 / 2, 5 / 6, 2 / 3].map((w, i) => (
            <div
              key={i}
              className="h-2.5 bg-white/[0.06] rounded animate-pulse"
              style={{ width: `${w * 100}%` }}
            />
          ))}
          <p className="text-[10px] text-[#64748B] font-mono pt-1">
            Local Ollama model is synthesising results…
          </p>
        </div>
      )}

      {summary && (
        <p className="text-[13px] text-[#C8D6E5] leading-relaxed">{summary}</p>
      )}

      {!summary && !loading && (
        <p className="text-[12px] text-[#4A5568] italic">
          Click "Generate AI Summary" to synthesize key insights and citations across all sources.
        </p>
      )}
    </div>
  );
}

// ─── Main ResearchTab ─────────────────────────────────────────────────────────

export const ResearchTab: React.FC = () => {
  const {
    saveKnowledgeItem,
    searchHistory,
    addSearchHistory,
    clearSearchHistory,
    savedResultUrls,
    toggleSavedResult,
  } = useQueueStore();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarySaved, setSummarySaved] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (q: string, cat: SearchCategory = category, sort: SortBy = sortBy) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setSearching(true);
      setSearchError(null);
      setResponse(null);
      setSummary(null);
      setSummarySaved(false);

      try {
        if (
          typeof window === "undefined" ||
          !("__TAURI_INTERNALS__" in window)
        ) {
          throw new Error("Search requires the Tauri desktop app.");
        }
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<SearchResponse>("web_search_command", {
          query: trimmed,
          category: cat === "all" ? null : cat,
          sortBy: sort,
        });
        setResponse(result);
        addSearchHistory(trimmed);
      } catch (err: any) {
        setSearchError(
          err?.message || "Search failed. Check your network connection.",
        );
      } finally {
        setSearching(false);
      }
    },
    [category, sortBy, addSearchHistory],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const handleCategoryChange = (cat: SearchCategory) => {
    setCategory(cat);
    if (query.trim()) {
      doSearch(query, cat, sortBy);
    }
  };

  const handleSortChange = (sort: SortBy) => {
    setSortBy(sort);
    if (query.trim()) {
      doSearch(query, category, sort);
    }
  };

  const handleSummarize = async () => {
    if (!response) return;
    setSummarizing(true);
    setSummarySaved(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const text = await invoke<string>("summarize_search_command", {
        query: response.query,
        results: response.results,
      });
      setSummary(text);
    } catch (err: any) {
      setSummary(
        `Summary unavailable: ${err?.message || "Ollama model not running"}`,
      );
    } finally {
      setSummarizing(false);
    }
  };

  const handleSaveResult = async (result: SearchResult) => {
    const dateLine = result.date ? `Date: ${result.date}\n` : "";
    const content = `${result.title}\nSource: ${result.source}\n${dateLine}${result.snippet}`;
    await saveKnowledgeItem(content, result.url);
    toggleSavedResult(result.url);
  };

  const handleSaveSummary = async () => {
    if (!summary || !response) return;
    await saveKnowledgeItem(
      `Research Synthesis: ${response.query}\n\n${summary}`,
      undefined,
    );
    setSummarySaved(true);
  };

  const suggestions = [
    "Rust vs Go concurrency model",
    "Tauri v2 architecture & security",
    "AI agents multi-modal workflows 2025",
    "Local LLMs performance benchmarks",
    "Dark radiation bound reheating paper",
  ];

  const categories: { id: SearchCategory; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "All Sources", icon: <IconSparkles size={12} /> },
    { id: "web", label: "Web (DDG)", icon: <IconWorld size={12} /> },
    { id: "tech", label: "Tech (HackerNews)", icon: <IconBrandYcombinator size={12} /> },
    { id: "wiki", label: "Wikipedia", icon: <IconBrandWikipedia size={12} /> },
    { id: "academic", label: "Academic (ArXiv)", icon: <IconBook size={12} /> },
  ];

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="m-0 text-xl font-bold text-[#F0F4F8] flex items-center gap-2">
            <IconSearch size={20} className="text-[#4A8FC2]" />
            Research Engine
          </h1>
          <p className="m-0 mt-0.5 text-[11px] font-mono text-[#7A8492]">
            Multi-source search with publication dates & custom ranking (DuckDuckGo + Wikipedia + HackerNews + ArXiv)
          </p>
        </div>
        {response && (
          <span className="font-mono text-[10px] bg-[rgba(74,143,194,0.1)] text-[#4A8FC2] px-2.5 py-1 rounded-lg border border-[rgba(74,143,194,0.25)]">
            {response.results.length} relevant results · {response.source_used}
          </span>
        )}
      </div>

      {/* Search bar & Category/Sort controls */}
      <div className="flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4A5568] pointer-events-none"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anything — papers, news, technical docs, discussions..."
              className="w-full bg-[#0E1318] border border-[#1D2535] rounded-xl text-[#E2E8F0] text-sm
                pl-10 pr-4 py-3 outline-none focus:border-[rgba(74,143,194,0.5)] transition-colors font-[inherit]"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResponse(null);
                  setSummary(null);
                  setSearchError(null);
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#9AA4B2] cursor-pointer bg-transparent border-none"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-5 py-3 rounded-xl bg-[#4A8FC2] text-black font-semibold text-sm
              hover:bg-[#5b9bd1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2 cursor-pointer shrink-0"
          >
            {searching ? (
              <>
                <IconLoader2 size={15} className="animate-spin" /> Searching…
              </>
            ) : (
              <>
                <IconSearch size={15} /> Search
              </>
            )}
          </button>
        </form>

        {/* Category & Ranking Sort Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                  category === cat.id
                    ? "bg-[rgba(74,143,194,0.15)] border-[rgba(74,143,194,0.4)] text-[#4A8FC2] font-bold"
                    : "bg-[#0E1318] border-[#1D2535] text-[#7A8492] hover:text-[#C8D6E5] hover:border-[#242B35]"
                }`}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>

          {/* Sort By controls */}
          <div className="flex items-center gap-1 bg-[#0E1318] p-1 rounded-lg border border-[#1D2535]">
            <span className="text-[10px] text-[#4A5568] font-mono px-1.5 flex items-center gap-1">
              <IconSortDescending size={12} /> Rank:
            </span>
            <button
              type="button"
              onClick={() => handleSortChange("relevance")}
              className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                sortBy === "relevance"
                  ? "bg-[#181E27] text-[#4A8FC2] font-bold border border-[rgba(74,143,194,0.3)]"
                  : "text-[#7A8492] hover:text-[#C8D6E5]"
              }`}
            >
              Relevance
            </button>
            <button
              type="button"
              onClick={() => handleSortChange("date")}
              className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                sortBy === "date"
                  ? "bg-[#181E27] text-[#34D399] font-bold border border-[rgba(52,211,153,0.3)]"
                  : "text-[#7A8492] hover:text-[#C8D6E5]"
              }`}
            >
              Newest Date
            </button>
          </div>
        </div>
      </div>

      {/* Recent searches */}
      {searchHistory.length > 0 && !response && !searching && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-[#4A5568] font-mono self-center">
            Recent searches:
          </span>
          {searchHistory.slice(0, 8).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setQuery(h);
                doSearch(h);
              }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-[#0E1318] border border-[#1D2535]
                text-[#9AA4B2] hover:text-[#4A8FC2] hover:border-[rgba(74,143,194,0.3)]
                transition-colors cursor-pointer font-mono"
            >
              {h}
            </button>
          ))}
          <button
            type="button"
            onClick={clearSearchHistory}
            className="text-[9px] px-2 py-1 rounded-lg bg-transparent border border-[#1D2535]
              text-[#4A5568] hover:text-[#EF4444] transition-colors cursor-pointer font-mono"
          >
            clear
          </button>
        </div>
      )}

      {/* Default Empty Suggestions State */}
      {!response && !searching && !searchError && searchHistory.length === 0 && (
        <div className="flex flex-col gap-4 py-2">
          <p className="text-[11px] text-[#4A5568] font-mono uppercase tracking-wider">
            Try searching
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s);
                  doSearch(s);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#0E1318] border border-[#1D2535]
                text-[12px] text-[#9AA4B2] hover:text-[#E2E8F0] hover:border-[rgba(74,143,194,0.3)]
                hover:bg-[rgba(74,143,194,0.06)] transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Multi-source feature cards */}
          <div className="mt-2 p-4 rounded-xl bg-[#0E1318] border border-[#1D2535] flex flex-col gap-3">
            <p className="text-[11px] font-bold text-[#9AA4B2] font-mono uppercase tracking-wider">
              Research Pipeline Features
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  icon: <IconCalendar size={14} />,
                  color: "#34D399",
                  title: "Publication & Creation Dates",
                  desc: "Every item displays its published date from ArXiv, HackerNews, and Wikipedia.",
                },
                {
                  icon: <IconSortDescending size={14} />,
                  color: "#4A8FC2",
                  title: "Date & Relevance Ranking",
                  desc: "Toggle between relevance scoring and newest-first chronological sorting.",
                },
                {
                  icon: <IconChevronDown size={14} />,
                  color: "#A78BFA",
                  title: "Full Snippet Expansion",
                  desc: "Click 'Show full snippet' to read full scientific abstracts without artificial cutoff.",
                },
                {
                  icon: <IconSparkles size={14} />,
                  color: "#7C3AED",
                  title: "Ollama Synthesis",
                  desc: "Synthesizes multi-source findings into a 3-sentence executive summary.",
                },
              ].map((item) => (
                <div key={item.title} className="p-3 rounded-lg bg-[#151A21] border border-[#1F2633] flex items-start gap-2.5">
                  <span style={{ color: item.color }} className="mt-0.5 shrink-0">
                    {item.icon}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#E2E8F0]">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#7A8492] mt-0.5 leading-snug">
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {searching && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-[#0E1318] border border-[#1D2535] space-y-2"
            >
              <div className="h-3 bg-white/[0.06] rounded animate-pulse w-1/4" />
              <div className="h-4 bg-white/[0.06] rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-white/[0.06] rounded animate-pulse w-full" />
              <div className="h-2.5 bg-white/[0.06] rounded animate-pulse w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {searchError && (
        <div className="p-4 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#EF4444] text-sm flex items-center gap-2">
          <IconX size={15} className="shrink-0" />
          {searchError}
        </div>
      )}

      {/* Search Results Display */}
      {response && !searching && (
        <div className="flex flex-col gap-3">
          {/* AI Research Synthesis at the top */}
          <AISummaryPanel
            results={response.results}
            summary={summary}
            loading={summarizing}
            onGenerate={handleSummarize}
            onSave={handleSaveSummary}
            saved={summarySaved}
          />

          {/* Results List */}
          {response.results.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#0E1318] border border-[#1D2535] text-center text-[#7A8492] text-sm">
              No relevant results found for "{response.query}".
            </div>
          ) : (
            response.results.map((r, i) => (
              <ResultCard
                key={i}
                result={r}
                onSave={handleSaveResult}
                saved={savedResultUrls.includes(r.url)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
