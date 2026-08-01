import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TodayBrief } from "./components/TodayBrief";
import { MessagesTab } from "./components/MessagesTab";
import { ContentTab } from "./components/ContentTab";
import { AnalyticsTab } from "./components/AnalyticsTab";
import { DeadlinesTab } from "./components/DeadlinesTab";
import { ChannelsTab } from "./components/ChannelsTab";
import { SettingsTab } from "./components/SettingsTab";
import { MemoryTab } from "./components/MemoryTab";
import { ProductivityTab } from "./components/ProductivityTab";
import { StatusBanner } from "./components/StatusBanner";
import { LifeCaptureModal } from "./components/LifeCaptureModal";
import { ActiveLifeTab } from "./components/ActiveLifeTab";
import { useQueueStore } from "./store/useQueueStore";

// ─── No-Model Alert Banner ───────────────────────────────────────────────────

function NoModelAlert({ onGoToSettings, onDismiss }: { onGoToSettings: () => void; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed", top: 28, left: "50%", transform: "translateX(-50%)",
        zIndex: 70, width: "calc(100% - 2rem)", maxWidth: 560,
        background: "linear-gradient(135deg, rgba(234,88,12,0.15), rgba(239,68,68,0.12))",
        border: "1px solid rgba(234,88,12,0.45)",
        borderRadius: 14, padding: "11px 16px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 8px 32px rgba(234,88,12,0.2)",
        backdropFilter: "blur(12px)",
        animation: "slideDown 0.3s ease",
      }}
    >
      {/* Pulsing dot */}
      <div style={{ position: "relative", flexShrink: 0, width: 20, height: 20 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(234,88,12,0.4)",
          animation: "ping 1.4s ease infinite",
        }} />
        <div style={{
          position: "absolute", inset: 3, borderRadius: "50%",
          background: "#EA580C",
        }} />
      </div>

      {/* Message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#FED7AA", marginBottom: 2 }}>
          No AI model installed
        </div>
        <div style={{ fontSize: 11, color: "#FDBA74", lineHeight: 1.4 }}>
          Wardyn needs at least one local Ollama model to generate briefs, tag notes, and process plans.
          {" "}
          <span style={{ color: "#FB923C", fontWeight: 600 }}>llama3.2</span> is recommended (2 GB).
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onGoToSettings}
        style={{
          flexShrink: 0, padding: "6px 13px", borderRadius: 9,
          background: "rgba(234,88,12,0.25)", border: "1px solid rgba(234,88,12,0.5)",
          color: "#FED7AA", cursor: "pointer", fontSize: 11, fontWeight: 700,
          whiteSpace: "nowrap", transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(234,88,12,0.4)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(234,88,12,0.25)"; }}
      >
        Install Model →
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#9AA4B2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, lineHeight: 1,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      >
        ×
      </button>

      <style>{`
        @keyframes ping {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const activeTab = useQueueStore((state) => state.activeTab);
  const setActiveTab = useQueueStore((state) => state.setActiveTab);
  const fetchItems = useQueueStore((state) => state.fetchItems);
  const checkGmailStatus = useQueueStore((state) => state.checkGmailStatus);
  const syncGmail = useQueueStore((state) => state.syncGmail);
  const syncCalendarDeadlines = useQueueStore((state) => state.syncCalendarDeadlines);
  const syncLinkedInTimeline = useQueueStore((state) => state.syncLinkedInTimeline);
  const syncIntervalMinutes = useQueueStore((state) => state.syncIntervalMinutes);
  const gmailAccounts = useQueueStore((state) => state.gmailAccounts);

  const fetchMorningBrief = useQueueStore((state) => state.fetchMorningBrief);
  const fetchKnowledgeItems = useQueueStore((state) => state.fetchKnowledgeItems);
  const fetchDecisions = useQueueStore((state) => state.fetchDecisions);
  const fetchWeeklyReview = useQueueStore((state) => state.fetchWeeklyReview);
  const fetchVaultPath = useQueueStore((state) => state.fetchVaultPath);
  const fetchCustomFeeds = useQueueStore((state) => state.fetchCustomFeeds);
  const fetchTasks = useQueueStore((state) => state.fetchTasks);
  const checkPendingReminders = useQueueStore((state) => state.checkPendingReminders);
  const fetchLifeEvents = useQueueStore((state) => state.fetchLifeEvents);
  const checkOllamaModels = useQueueStore((state) => state.checkOllamaModels);
  const ollamaModels = useQueueStore((state) => state.ollamaModels);
  const ollamaChecked = useQueueStore((state) => state.ollamaChecked);
  const fetchActiveProjects = useQueueStore((state) => state.fetchActiveProjects);
  const fetchDailyHabits = useQueueStore((state) => state.fetchDailyHabits);
  const fetchDailyIntel = useQueueStore((state) => state.fetchDailyIntel);

  const [modelAlertDismissed, setModelAlertDismissed] = useState(false);

  // 1. Startup Boot Auto-Sync & Notification Listener
  useEffect(() => {
    const initBootSentinel = async () => {
      await fetchItems();
      await checkGmailStatus();
      await syncCalendarDeadlines();
      await syncLinkedInTimeline();

      // AI model presence check (must run early)
      checkOllamaModels();

      // Auto-generate morning brief on first launch of the day (cached if already done)
      fetchMorningBrief();
      // Load personal memory & vault settings
      fetchKnowledgeItems();
      fetchDecisions();
      fetchWeeklyReview();
      fetchVaultPath();
      fetchCustomFeeds();
      // Load productivity features
      fetchTasks();
      checkPendingReminders();
      fetchLifeEvents();
      // Load Active Life features
      fetchActiveProjects();
      fetchDailyHabits();
      fetchDailyIntel();

      // If Gmail is connected, run immediate boot inbox sync & triaging
      const currentAccounts = useQueueStore.getState().gmailAccounts;
      if (currentAccounts.length > 0) {
        await syncGmail();
      }
    };

    initBootSentinel();

    // Listen for notification click events safely
    const setupNotificationListener = async () => {
      try {
        if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
          const notificationPlugin = await import("@tauri-apps/plugin-notification");
          if (typeof notificationPlugin.onAction === "function") {
            await notificationPlugin
              .onAction(() => {
                setActiveTab("today");
                import("@tauri-apps/api/window")
                  .then(({ getCurrentWindow }) => {
                    const win = getCurrentWindow();
                    win.show();
                    win.setFocus();
                  })
                  .catch(() => {});
              })
              .catch(() => {});
          }
        }
      } catch (_err) {
        // Silent catch for notification listener
      }
    };

    setupNotificationListener();

    // Listen for tray context menu navigation events
    const setupTrayListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<string>("switch-tab", (event) => {
          if (event.payload) {
            setActiveTab(event.payload as any);
          }
        });
        return unlisten;
      } catch {
        // Non-Tauri env
      }
    };
    let trayUnlisten: (() => void) | undefined;
    setupTrayListener().then((fn) => { trayUnlisten = fn; });

    return () => { trayUnlisten?.(); };
  }, [fetchItems, checkGmailStatus, syncCalendarDeadlines, syncLinkedInTimeline, syncGmail, setActiveTab]);

  // 2. Background Periodic Multi-Channel Ingestion & Continuous AI Learning Interval
  useEffect(() => {
    const intervalMs = syncIntervalMinutes * 60 * 1000;
    const reminderIntervalMs = 60 * 1000;

    const timer = setInterval(async () => {
      if (gmailAccounts.length > 0) {
        await syncGmail();
      }
      await syncLinkedInTimeline();
    }, intervalMs);

    const reminderTimer = setInterval(() => {
      checkPendingReminders();
    }, reminderIntervalMs);

    // Re-check Ollama models every 5 minutes in case user installs mid-session
    const modelTimer = setInterval(() => {
      checkOllamaModels();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(reminderTimer);
      clearInterval(modelTimer);
    };
  }, [gmailAccounts, syncIntervalMinutes, syncGmail, syncLinkedInTimeline, checkPendingReminders, checkOllamaModels]);

  const showModelAlert = ollamaChecked && ollamaModels.length === 0 && !modelAlertDismissed;

  const renderActiveTab = () => {
    switch (activeTab) {
      case "today":
        return <TodayBrief />;
      case "messages":
        return <MessagesTab />;
      case "content":
        return <ContentTab />;
      case "analytics":
        return <AnalyticsTab />;
      case "deadlines":
        return <DeadlinesTab />;
      case "channels":
        return <ChannelsTab />;
      case "memory":
        return <MemoryTab />;
      case "productivity":
        return <ProductivityTab />;
      case "active-life":
        return <ActiveLifeTab />;
      case "settings":
        return <SettingsTab />;

      default:
        return <TodayBrief />;
    }
  };

  return (
    <>
      <h2 style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0, pointerEvents: "none" }}>Wardyn desktop app: a sidebar with navigation and a main daily brief showing reply cards awaiting approval, a content brief card, and an auto-handled summary</h2>

      {/* macOS Seamless Window Titlebar Drag Area */}
      <div data-tauri-drag-region className="h-6 w-full fixed top-0 left-0 z-40" />

      <StatusBanner />

      {/* Ollama No-Model Alert */}
      {showModelAlert && (
        <NoModelAlert
          onGoToSettings={() => { setActiveTab("settings"); setModelAlertDismissed(true); }}
          onDismiss={() => setModelAlertDismissed(true)}
        />
      )}

      <div className="flex gap-5 max-w-5xl mx-auto pt-4 relative z-0">
        <Sidebar />
        {renderActiveTab()}
      </div>
      <LifeCaptureModal />
    </>
  );
}
