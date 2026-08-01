import React, { useEffect, useState } from "react";
import {
  IconShieldCheck, IconLayoutDashboard, IconMail, IconPencil,
  IconCalendar, IconGridDots, IconSettings, IconChartBar,
  IconBrain, IconCheckbox, IconBolt,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";
import { TabType } from "../types/queue";
import { TranslationDictionary } from "../i18n/translations";

export const Sidebar: React.FC = () => {
  const activeTab = useQueueStore((state) => state.activeTab);
  const setActiveTab = useQueueStore((state) => state.setActiveTab);
  const t = useQueueStore((state) => state.t);
  const [appVersion, setAppVersion] = useState<string>("");

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

  const tabs: Array<{ id: TabType; labelKey: keyof TranslationDictionary; icon: React.ElementType }> = [
    { id: "today",        labelKey: "today",       icon: IconLayoutDashboard },
    { id: "active-life",  labelKey: "active_life", icon: IconBolt           },
    { id: "messages",     labelKey: "messages",    icon: IconMail           },
    { id: "content",      labelKey: "content",     icon: IconPencil         },
    { id: "analytics",    labelKey: "analytics",   icon: IconChartBar       },
    { id: "productivity", labelKey: "productivity",icon: IconCheckbox       },
    { id: "deadlines",    labelKey: "deadlines",   icon: IconCalendar       },
    { id: "memory",       labelKey: "memory",      icon: IconBrain          },
    { id: "channels",     labelKey: "channels",    icon: IconGridDots       },
    { id: "settings",     labelKey: "settings",    icon: IconSettings       },
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
                  ? 'bg-[rgba(74,143,194,0.14)] text-[#4A8FC2] font-semibold'
                  : 'bg-transparent text-[#9AA4B2] font-normal hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F0F4F8]'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded-full bg-[#4A8FC2]" />
              )}
              <Icon size={15} className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
              <span className="truncate">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
