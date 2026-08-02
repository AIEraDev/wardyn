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
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  source_used: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function domain(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function SourceBadge({ source }: { source: string }) {
  const isWiki = source === "Wikipedia";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
        isWiki
          ? "bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)]"
          : "bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border-[rgba(74,143,194,0.25)]"
      }`}
    >
      {isWiki ? <IconBrandWikipedia size={9} /> : <IconWorld size={9} />}
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

  return (
    <div className="p-3.5 rounded-xl bg-[#0E1318] border border-[#1D2535] hover:border-[rgba(74,143,194,0.25)] transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-2 mb-1">
            <SourceBadge source={result.source} />
            <span className="font-mono text-[10px] text-[#4A5568] truncate">
              {domain(result.url)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openUrl(result.url)}
            className="text-[13px] font-semibold text-[#E2E8F0] hover:text-[#4A8FC2] text-left leading-snug transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            {result.title}
          </button>
          {/* Snippet */}
          {result.snippet && (
            <p
              className={`mt-1 text-[11.5px] text-[#9AA4B2] leading-relaxed ${expanded ? "" : "line-clamp-2"}`}
            >
              {result.snippet}
            </p>
          )}
          {result.snippet && result.snippet.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[10px] text-[#4A5568] hover:text-[#9AA4B2] flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0"
            >
              {expanded ? (
                <>
                  <IconChevronUp size={11} /> Less
                </>
              ) : (
                <>
                  <IconChevronDown size={11} /> More
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
            title="Open in browser"
            className="p-1.5 rounded-lg bg-[#151A21] border border-[#242B35] text-[#7A8492] hover:text-[#4A8FC2] hover:border-[rgba(74,143,194,0.4)] transition-colors cursor-pointer"
          >
            <IconExternalLink size={13} />
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
  query: _query,
  results,
  summary,
  loading,
  onGenerate,
  onSave,
  saved,
}: {
  query: string;
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
            AI Research Summary
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
            {summary ? "Regenerate" : "Generate Summary"}
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
            Ollama is synthesising results…
          </p>
        </div>
      )}

      {summary && (
        <p className="text-[13px] text-[#C8D6E5] leading-relaxed">{summary}</p>
      )}

      {!summary && !loading && (
        <p className="text-[12px] text-[#4A5568] italic">
          Click "Generate Summary" to get an AI-synthesised overview of all
          results above.
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
  } = useQueueStore();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarySaved, setSummarySaved] = useState(false);

  const [savedResults, setSavedResults] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (q: string) => {
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
        });
        setResponse(result);
        addSearchHistory(trimmed); // persists across tab switches
      } catch (err: any) {
        setSearchError(
          err?.message || "Search failed. Check your internet connection.",
        );
      } finally {
        setSearching(false);
      }
    },
    [addSearchHistory],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
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
        `Summary unavailable: ${err?.message || "Ollama not running"}`,
      );
    } finally {
      setSummarizing(false);
    }
  };

  const handleSaveResult = async (result: SearchResult) => {
    const content = `${result.title}\n${result.snippet}`;
    await saveKnowledgeItem(content, result.url);
    setSavedResults((prev) => new Set([...prev, result.url]));
  };

  const handleSaveSummary = async () => {
    if (!summary || !response) return;
    await saveKnowledgeItem(
      `Research: ${response.query}\n\n${summary}`,
      undefined,
    );
    setSummarySaved(true);
  };

  const suggestions = [
    "AI tools for productivity 2025",
    "Best practices for remote work",
    "Tauri vs Electron performance",
    "Personal finance strategies",
    "Latest LLM benchmarks",
  ];

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="m-0 text-xl font-bold text-[#F0F4F8] flex items-center gap-2">
            <IconSearch size={20} className="text-[#4A8FC2]" />
            Research
          </h1>
          <p className="m-0 mt-0.5 text-[11px] font-mono text-[#7A8492]">
            Free web search via DuckDuckGo + Wikipedia — AI synthesis via local
            Ollama
          </p>
        </div>
        {response && (
          <span className="font-mono text-[10px] bg-[rgba(74,143,194,0.1)] text-[#4A8FC2] px-2 py-1 rounded border border-[rgba(74,143,194,0.25)]">
            {response.results.length} results · {response.source_used}
          </span>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A5568] pointer-events-none"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything — news, research, trends, how-to…"
            className="w-full bg-[#0E1318] border border-[#1D2535] rounded-xl text-[#E2E8F0] text-sm
              pl-9 pr-4 py-3 outline-none focus:border-[rgba(74,143,194,0.5)] transition-colors font-[inherit]"
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#9AA4B2] cursor-pointer bg-transparent border-none"
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

      {/* Search history */}
      {searchHistory.length > 0 && !response && !searching && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-[#4A5568] font-mono self-center">
            Recent:
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

      {/* Suggestions — shown on empty state */}
      {!response &&
        !searching &&
        !searchError &&
        searchHistory.length === 0 && (
          <div className="flex flex-col gap-3 py-4">
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
                  className="px-3 py-1.5 rounded-xl bg-[#0E1318] border border-[#1D2535]
                  text-[12px] text-[#9AA4B2] hover:text-[#E2E8F0] hover:border-[rgba(74,143,194,0.3)]
                  hover:bg-[rgba(74,143,194,0.06)] transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Source info */}
            <div className="mt-4 p-4 rounded-xl bg-[#0E1318] border border-[#1D2535] flex flex-col gap-2">
              <p className="text-[11px] font-bold text-[#9AA4B2] font-mono uppercase tracking-wider">
                How it works
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    icon: <IconWorld size={13} />,
                    color: "#4A8FC2",
                    title: "DuckDuckGo",
                    desc: "Primary search — aggregates Google, Bing, and more. No API key, no tracking.",
                  },
                  {
                    icon: <IconBrandWikipedia size={13} />,
                    color: "#9B59B6",
                    title: "Wikipedia",
                    desc: "Fallback for research queries. Structured factual data from open encyclopedia.",
                  },
                  {
                    icon: <IconSparkles size={13} />,
                    color: "#7C3AED",
                    title: "Ollama AI Summary",
                    desc: "Summarises results locally using your installed model. No data leaves your machine.",
                  },
                  {
                    icon: <IconBookmark size={13} />,
                    color: "#34D399",
                    title: "Save to Memory",
                    desc: "Any result or AI summary can be saved to your knowledge vault for future reference.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-2.5">
                    <span
                      style={{ color: item.color }}
                      className="mt-0.5 shrink-0"
                    >
                      {item.icon}
                    </span>
                    <div>
                      <span className="text-[11px] font-semibold text-[#C8D6E5]">
                        {item.title} —{" "}
                      </span>
                      <span className="text-[11px] text-[#7A8492]">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* Loading skeleton */}
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

      {/* Error */}
      {searchError && (
        <div className="p-4 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#EF4444] text-sm flex items-center gap-2">
          <IconX size={15} className="shrink-0" />
          {searchError}
        </div>
      )}

      {/* Results */}
      {response && !searching && (
        <div className="flex flex-col gap-3">
          {/* AI Summary at top */}
          <AISummaryPanel
            query={response.query}
            results={response.results}
            summary={summary}
            loading={summarizing}
            onGenerate={handleSummarize}
            onSave={handleSaveSummary}
            saved={summarySaved}
          />

          {/* Result cards */}
          {response.results.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0E1318] border border-[#1D2535] text-center text-[#7A8492] text-sm">
              No results found for "{response.query}". Try different keywords.
            </div>
          ) : (
            response.results.map((r, i) => (
              <ResultCard
                key={i}
                result={r}
                onSave={handleSaveResult}
                saved={savedResults.has(r.url)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
