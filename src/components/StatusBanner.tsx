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

  const typeClasses = {
    error:   { wrapper: "bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.35)]",   icon: "text-[#FCA5A5]", IconC: IconAlertTriangle },
    success: { wrapper: "bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.35)]", icon: "text-[#34D399]",  IconC: IconCheck },
    info:    { wrapper: "bg-[rgba(74,143,194,0.12)] border-[rgba(74,143,194,0.35)]",  icon: "text-[#4A8FC2]",  IconC: IconCheck },
  };

  const { wrapper, icon: iconClass, IconC } = typeClasses[statusMessage.type] ?? typeClasses.info;

  return (
    <div
      className={`fixed top-7 left-1/2 -translate-x-1/2 z-[60] max-w-lg w-[calc(100%-2rem)] px-4 py-3 rounded-xl flex items-start gap-3 shadow-lg border ${wrapper}`}
      role="alert"
    >
      <IconC size={18} className={`shrink-0 mt-0.5 ${iconClass}`} />
      <p className="text-sm m-0 flex-1 leading-snug text-[#F0F4F8]">
        {statusMessage.text}
      </p>
      <button
        type="button"
        onClick={clearStatusMessage}
        className="p-1 rounded hover:bg-white/8 shrink-0 border-0 bg-transparent cursor-pointer text-[#9AA4B2]"
        aria-label="Dismiss"
      >
        <IconX size={14} />
      </button>
    </div>
  );
};
