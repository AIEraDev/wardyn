import React, { useEffect } from "react";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";

export const StatusBanner: React.FC = () => {
  const statusMessage = useQueueStore((state) => state.statusMessage);
  const clearStatusMessage = useQueueStore((state) => state.clearStatusMessage);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => clearStatusMessage(), statusMessage.type === "error" ? 12000 : 6000);
    return () => clearTimeout(timer);
  }, [statusMessage, clearStatusMessage]);

  if (!statusMessage) return null;

  const styles =
    statusMessage.type === "error"
      ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", color: "#FCA5A5", Icon: IconAlertTriangle }
      : statusMessage.type === "success"
        ? { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.35)", color: "#34D399", Icon: IconCheck }
        : { bg: "rgba(74,143,194,0.12)", border: "rgba(74,143,194,0.35)", color: "#4A8FC2", Icon: IconCheck };

  const { bg, border, color, Icon } = styles;

  return (
    <div
      className="fixed top-7 left-1/2 -translate-x-1/2 z-[60] max-w-lg w-[calc(100%-2rem)] px-4 py-3 rounded-xl flex items-start gap-3 shadow-lg"
      style={{ background: bg, border: `1px solid ${border}` }}
      role="alert"
    >
      <Icon size={18} className="shrink-0 mt-0.5" style={{ color }} />
      <p className="text-sm m-0 flex-1 leading-snug" style={{ color: "#F0F4F8" }}>
        {statusMessage.text}
      </p>
      <button
        type="button"
        onClick={clearStatusMessage}
        className="p-1 rounded hover:bg-[rgba(255,255,255,0.08)] shrink-0 border-0 bg-transparent cursor-pointer"
        aria-label="Dismiss"
      >
        <IconX size={14} style={{ color: "#9AA4B2" }} />
      </button>
    </div>
  );
};
