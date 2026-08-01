import React from "react";
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
    <div
      style={{
        width: 152,
        flexShrink: 0,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-em)",
        borderRadius: "var(--radius-lg)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "fit-content",
        position: "relative",
        zIndex: 50,
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 6px 10px",
          marginBottom: 6,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 28, height: 28,
            borderRadius: 8,
            background: "linear-gradient(135deg, rgba(74,143,194,0.25), rgba(74,143,194,0.1))",
            border: "1px solid rgba(74,143,194,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconShieldCheck size={16} style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.2px", lineHeight: 1.1 }}>
            Wardyn
          </div>
          <div style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>
            v0.1.1
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                outline: "none",
                transition: "all 0.12s ease",
                background: isActive ? "rgba(74,143,194,0.14)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-2)",
                position: "relative",
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: "absolute", left: 0, top: "20%", bottom: "20%",
                    width: 2, borderRadius: 2,
                    background: "var(--accent)",
                  }}
                />
              )}
              <Icon size={15} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
