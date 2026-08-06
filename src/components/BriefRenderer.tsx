import React from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const openExternalUrl = async (url: string) => {
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

// ─── Inline Markdown Parser ───────────────────────────────────────────────────
// Parses:
//   [text](url)       → Clickable external link button
//   `code`            → Sleek monospace code pill
//   **bold**          → Bold text
//   *italic*          → Italic text
//   [GITHUB], [HN]    → Styled source badge

function renderInline(text: string): React.ReactNode[] {
  const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([A-Z0-9_\-]{2,15})\])/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith("[") && match[2] && match[3]) {
      // Markdown link [label](url)
      const label = match[2];
      const url = match[3];
      elements.push(
        <button
          key={match.index}
          type="button"
          onClick={() => openExternalUrl(url)}
          title={url}
          className="text-[#4A8FC2] hover:text-[#5b9bd1] underline underline-offset-2 font-medium bg-transparent border-none p-0 inline cursor-pointer text-[inherit] transition-colors"
        >
          {label}
        </button>
      );
    } else if (fullMatch.startsWith("`") && match[4]) {
      // Inline code `code`
      elements.push(
        <code
          key={match.index}
          className="font-mono text-[11px] bg-[#181E27] text-[#A78BFA] px-1.5 py-0.5 rounded border border-[#242B35]"
        >
          {match[4]}
        </code>
      );
    } else if (fullMatch.startsWith("**") && match[5]) {
      // Bold **text**
      elements.push(
        <strong key={match.index} className="font-semibold text-[#F0F4F8]">
          {match[5]}
        </strong>
      );
    } else if (fullMatch.startsWith("*") && match[6]) {
      // Italic *text*
      elements.push(
        <em key={match.index} className="italic text-[#9AA4B2]">
          {match[6]}
        </em>
      );
    } else if (fullMatch.startsWith("[") && match[7]) {
      // Source Tag e.g. [GITHUB], [HACKERNEWS]
      const tag = match[7];
      let tagStyle = "bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] border-[rgba(74,143,194,0.25)]";
      if (tag === "GITHUB") {
        tagStyle = "bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)]";
      } else if (tag === "HACKERNEWS" || tag === "HN") {
        tagStyle = "bg-[rgba(255,102,0,0.15)] text-[#FF6600] border-[rgba(255,102,0,0.3)]";
      } else if (tag === "REDDIT") {
        tagStyle = "bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)]";
      } else if (tag === "ARXIV") {
        tagStyle = "bg-[rgba(234,179,8,0.15)] text-[#EAB308] border-[rgba(234,179,8,0.3)]";
      }

      elements.push(
        <span
          key={match.index}
          className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded border inline-block mr-1 align-baseline ${tagStyle}`}
        >
          {tag}
        </span>
      );
    } else {
      elements.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

// ─── Section Configuration ───────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  "⚡": "#F59E0B",
  "📅": "#4A8FC2",
  "🔥": "#FF6600",
  "📚": "#34D399",
  "💡": "#A78BFA",
  "🔔": "#E8A23D",
  "📬": "#4A8FC2",
  "⚠️": "#EF4444",
  "🎯": "#34D399",
  "📊": "#4A8FC2",
  "🔑": "#A78BFA",
};

function getSectionColor(line: string): string {
  for (const [emoji, color] of Object.entries(SECTION_COLORS)) {
    if (line.includes(emoji)) return color;
  }
  const upper = line.toUpperCase();
  if (upper.includes("PRIORITY") || upper.includes("ACTION")) return "#F59E0B";
  if (upper.includes("CALENDAR") || upper.includes("DEADLINE")) return "#4A8FC2";
  if (upper.includes("TRENDING") || upper.includes("VIRAL")) return "#FF6600";
  if (upper.includes("TECHNICAL") || upper.includes("PULSE")) return "#34D399";
  if (upper.includes("PATTERN") || upper.includes("INSIGHT")) return "#A78BFA";
  if (upper.includes("URGENT") || upper.includes("WARNING")) return "#EF4444";
  return "#4A8FC2";
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[⚡📅📚💡🔔📬⚠️🎯📊🔑]/.test(trimmed)) return true;
  if (/^#{1,3}\s+/.test(trimmed)) return true;
  if (/^\*\*[⚡📅📚💡🔔📬⚠️🎯📊🔑A-Z0-9\s&/:\-]{3,}\*\*/.test(trimmed)) return true;
  if (/^[A-Z0-9\s&/]{4,}(?::|$)/.test(trimmed) && !trimmed.startsWith("HTTP") && !trimmed.startsWith("-")) return true;
  return false;
}

function cleanSectionTitle(line: string): { emoji: string; title: string } {
  let text = line.trim().replace(/^#{1,3}\s+/, "").replace(/\*\*/g, "");
  let emoji = "";

  const emojiMatch = text.match(/^([⚡📅📚💡🔔📬⚠️🎯📊🔑])/);
  if (emojiMatch) {
    emoji = emojiMatch[1];
    text = text.slice(emojiMatch[0].length).trim();
  }

  return { emoji, title: text.trim() };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface BriefRendererProps {
  text: string;
  /** Base prose colour — defaults to #C8D6E5 */
  baseColor?: string;
}

export const BriefRenderer: React.FC<BriefRendererProps> = ({
  text,
  baseColor = "#C8D6E5",
}) => {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listBuffer: { type: "bullet" | "numbered"; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    if (listBuffer.type === "bullet") {
      nodes.push(
        <ul key={`ul-${key}`} className="space-y-1.5 pl-0.5 my-2 list-none">
          {listBuffer.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[12.5px]"
              style={{ color: baseColor }}
            >
              <span
                className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: baseColor, opacity: 0.5 }}
              />
              <span className="leading-relaxed flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
    } else {
      nodes.push(
        <ol key={`ol-${key}`} className="space-y-2 my-2 pl-0 list-none">
          {listBuffer.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[12.5px]"
              style={{ color: baseColor }}
            >
              <span
                className="font-mono text-[10px] font-bold shrink-0 mt-0.5 w-4 h-4 rounded
                           flex items-center justify-center border border-white/10"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#7A8492",
                }}
              >
                {i + 1}
              </span>
              <span className="leading-relaxed flex-1">
                {renderInline(item)}
              </span>
            </li>
          ))}
        </ol>,
      );
    }
    listBuffer = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();

    // ── Section header ──────────────────────────────────────────────────────
    if (isSectionHeader(line)) {
      flushList(String(idx));
      const color = getSectionColor(line);
      const { emoji, title } = cleanSectionTitle(line);
      nodes.push(
        <div
          key={idx}
          className="flex items-center gap-2 mt-5 mb-2.5 first:mt-0"
        >
          {emoji && <span className="text-sm leading-none">{emoji}</span>}
          <span
            className="text-[11px] font-bold uppercase tracking-wider font-mono"
            style={{ color }}
          >
            {title}
          </span>
          <div
            className="flex-1 h-px opacity-25"
            style={{ background: color }}
          />
        </div>,
      );
      return;
    }

    // ── Bullet line ─────────────────────────────────────────────────────────
    const bulletMatch = line.match(/^[-•*]\s+(.+)/);
    if (bulletMatch) {
      if (!listBuffer || listBuffer.type !== "bullet") {
        flushList(String(idx));
        listBuffer = { type: "bullet", items: [] };
      }
      listBuffer.items.push(bulletMatch[1]);
      return;
    }

    // ── Numbered line ───────────────────────────────────────────────────────
    const numberedMatch = line.match(/^\d+[./]\s+(.+)/);
    if (numberedMatch) {
      if (!listBuffer || listBuffer.type !== "numbered") {
        flushList(String(idx));
        listBuffer = { type: "numbered", items: [] };
      }
      listBuffer.items.push(numberedMatch[1]);
      return;
    }

    // ── Empty line ──────────────────────────────────────────────────────────
    if (line.trim() === "") {
      flushList(String(idx));
      nodes.push(<div key={idx} className="h-1.5" />);
      return;
    }

    // ── Regular paragraph ───────────────────────────────────────────────────
    flushList(String(idx));
    nodes.push(
      <p
        key={idx}
        className="text-[12.5px] leading-relaxed m-0 my-1"
        style={{ color: baseColor }}
      >
        {renderInline(line)}
      </p>,
    );
  });

  flushList("end");

  return <div className="space-y-0.5">{nodes}</div>;
};
