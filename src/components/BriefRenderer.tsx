import React from "react";

// ─── Lightweight markdown renderer ───────────────────────────────────────────
// Handles the exact patterns the AI brief produces:
//   ⚡ **SECTION HEADER**   → bold coloured heading with divider
//   **bold text**           → bold inline
//   - bullet item           → bullet list
//   1. numbered item        → numbered list
//   blank lines             → paragraph spacing

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[#F0F4F8]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const SECTION_COLORS: Record<string, string> = {
  "⚡": "#F59E0B",
  "📅": "#4A8FC2",
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
    if (line.startsWith(emoji)) return color;
  }
  return "#9AA4B2";
}

function isSection(line: string): boolean {
  return /^[⚡📅📚💡🔔📬⚠️🎯📊🔑]/.test(line) && line.includes("**");
}

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
  let listBuffer: { type: "bullet" | "numbered"; items: string[] } | null =
    null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    if (listBuffer.type === "bullet") {
      nodes.push(
        <ul key={`ul-${key}`} className="space-y-1 pl-0.5 my-1.5 list-none">
          {listBuffer.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[12px]"
              style={{ color: baseColor }}
            >
              <span
                className="mt-[6px] w-1 h-1 rounded-full shrink-0"
                style={{ background: baseColor, opacity: 0.45 }}
              />
              <span className="leading-relaxed">{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
    } else {
      nodes.push(
        <ol key={`ol-${key}`} className="space-y-1.5 my-1.5 pl-0 list-none">
          {listBuffer.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[12px]"
              style={{ color: baseColor }}
            >
              <span
                className="font-mono text-[10px] font-bold shrink-0 mt-0.5 w-4 h-4 rounded
                           flex items-center justify-center"
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
    if (isSection(line)) {
      flushList(String(idx));
      const color = getSectionColor(line);
      const stripped = line.replace(/\*\*/g, "");
      nodes.push(
        <div
          key={idx}
          className="flex items-center gap-2 mt-4 mb-1.5 first:mt-0"
        >
          <span className="text-sm leading-none">{stripped.charAt(0)}</span>
          <span
            className="text-[11px] font-bold uppercase tracking-wider font-mono"
            style={{ color }}
          >
            {stripped.slice(1).trim()}
          </span>
          <div
            className="flex-1 h-px opacity-20"
            style={{ background: color }}
          />
        </div>,
      );
      return;
    }

    // ── Bullet line ─────────────────────────────────────────────────────────
    const bulletMatch = line.match(/^[-•]\s+(.+)/);
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
      nodes.push(<div key={idx} className="h-1" />);
      return;
    }

    // ── Regular paragraph ───────────────────────────────────────────────────
    flushList(String(idx));
    nodes.push(
      <p
        key={idx}
        className="text-[12px] leading-relaxed m-0"
        style={{ color: baseColor }}
      >
        {renderInline(line)}
      </p>,
    );
  });

  flushList("end");

  return <div className="space-y-0.5">{nodes}</div>;
};
