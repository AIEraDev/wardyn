import React, { useEffect, useState } from "react";
import {
  IconShieldCheck,
  IconLayoutDashboard,
  IconMail,
  IconPencil,
  IconCalendar,
  IconGridDots,
  IconSettings,
  IconChartBar,
  IconBrain,
  IconCheckbox,
  IconBolt,
  IconSearch,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import { TabType } from "../types/queue";
import { TranslationDictionary, useTranslation } from "../i18n/translations";

export const Sidebar: React.FC = () => {
  const activeTab = useQueueStore((state) => state.activeTab);
  const setActiveTab = useQueueStore((state) => state.setActiveTab);
  const ollamaModels = useQueueStore((state) => state.ollamaModels);
  const ollamaChecked = useQueueStore((state) => state.ollamaChecked);
  const items = useQueueStore((state) => state.items);
  const tasks = useQueueStore((state) => state.tasks);
  const calendarEvents = useQueueStore((state) => state.calendarEvents);
  const t = useTranslation();
  const [appVersion, setAppVersion] = useState<string>("");

  // Derive badge counts from live store state
  const badges: Partial<Record<TabType, number>> = {
    messages: items.filter(
      (i) =>
        i.needs_reply &&
        i.status === "pending" &&
        i.triage_status !== "suppressed",
    ).length,
    productivity: tasks.filter(
      (t) =>
        t.status === "pending" &&
        t.due_date != null &&
        new Date(t.due_date).getTime() < Date.now(),
    ).length,
    deadlines: calendarEvents.filter((e) => {
      const days = Math.floor(
        (new Date(e.event_date).getTime() - Date.now()) / 86400000,
      );
      return days >= 0 && days <= 1;
    }).length,
  };

  useEffect(() => {
    const loadVersion = async () => {
      try {
        if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
          const { getVersion } = await import("@tauri-apps/api/app");
          const v = await getVersion();
          setAppVersion(v);
        }
      } catch {
        // non-Tauri env, leave version empty
      }
    };
    loadVersion();
  }, []);

  const tabs: Array<{
    id: TabType;
    labelKey: keyof TranslationDictionary;
    icon: React.ElementType;
  }> = [
    { id: "today", labelKey: "today", icon: IconLayoutDashboard },
    { id: "active-life", labelKey: "active_life", icon: IconBolt },
    { id: "messages", labelKey: "messages", icon: IconMail },
    { id: "content", labelKey: "content", icon: IconPencil },
    { id: "research", labelKey: "research", icon: IconSearch },
    { id: "analytics", labelKey: "analytics", icon: IconChartBar },
    { id: "productivity", labelKey: "productivity", icon: IconCheckbox },
    { id: "deadlines", labelKey: "deadlines", icon: IconCalendar },
    { id: "memory", labelKey: "memory", icon: IconBrain },
    { id: "channels", labelKey: "channels", icon: IconGridDots },
    { id: "settings", labelKey: "settings", icon: IconSettings },
  ];

  return (
    <div className="w-[152px] shrink-0 bg-[#151A21] border border-[rgba(255,255,255,0.12)] rounded-xl p-2.5 flex flex-col gap-0 h-fit relative z-50">
      {/* Brand */}
      <div className="flex items-center gap-2 px-1.5 pb-2.5 mb-1.5 border-b border-[rgba(255,255,255,0.07)]">
        <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[#4A8FC2] bg-gradient-to-br from-[rgba(74,143,194,0.25)] to-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.3)]">
          <IconShieldCheck size={16} />
        </div>
        <div>
          <div className="text-[13px] font-bold text-[#F0F4F8] tracking-tight leading-tight">
            Wardyn
          </div>
          {appVersion && (
            <div className="font-mono text-[9px] text-[#5D6A7A] mt-0.5">
              v{appVersion}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs w-full text-left cursor-pointer border-none outline-none transition-all duration-100 ${
                isActive
                  ? "bg-[rgba(74,143,194,0.14)] text-[#4A8FC2] font-semibold"
                  : "bg-transparent text-[#9AA4B2] font-normal hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F0F4F8]"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded-full bg-[#4A8FC2]" />
              )}
              <Icon
                size={15}
                className={`shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`}
              />
              <span className="truncate flex-1">{t[tab.labelKey]}</span>
              {(badges[tab.id] ?? 0) > 0 && (
                <span className="ml-auto font-mono text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center bg-[rgba(245,158,11,0.2)] text-[#F59E0B] border border-[rgba(245,158,11,0.3)] shrink-0">
                  {(badges[tab.id] ?? 0) > 99 ? "99+" : badges[tab.id]}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* AI Status Indicator */}
      {ollamaChecked && (
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.07)]">
          {ollamaModels.length > 0 ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-[#34D399] shrink-0" />
              <span className="font-mono text-[9px] text-[#4A5568] truncate">
                AI · {ollamaModels[0].name.split(":")[0]}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              title="AI offline — click to install a model"
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-md w-full text-left cursor-pointer border-none bg-transparent hover:bg-[rgba(239,68,68,0.08)] transition-colors group"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
              <span className="font-mono text-[9px] text-[#EF4444] truncate group-hover:text-[#FCA5A5]">
                AI offline
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
