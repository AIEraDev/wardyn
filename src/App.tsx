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
import { ResearchTab } from "./components/ResearchTab";
import { useQueueStore } from "./store/useQueueStore";

// ─── No-Model Alert Banner ───────────────────────────────────────────────────

function NoModelAlert({
  onGoToSettings,
  onDismiss,
}: {
  onGoToSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed top-7 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-[560px]
        bg-gradient-to-br from-[rgba(234,88,12,0.15)] to-[rgba(239,68,68,0.12)]
        border border-[rgba(234,88,12,0.45)] rounded-2xl px-4 py-3
        flex items-center gap-3 shadow-[0_8px_32px_rgba(234,88,12,0.2)]
        backdrop-blur-md animate-[slideDown_0.3s_ease]"
    >
      {/* Pulsing dot */}
      <div className="relative shrink-0 w-5 h-5">
        <div className="absolute inset-0 rounded-full bg-[rgba(234,88,12,0.4)] animate-ping" />
        <div className="absolute inset-[3px] rounded-full bg-[#EA580C]" />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-[#FED7AA] mb-0.5">
          No AI model installed
        </div>
        <div className="text-[11px] text-[#FDBA74] leading-snug">
          Wardyn needs at least one local Ollama model to generate briefs, tag
          notes, and process plans.{" "}
          <span className="text-[#FB923C] font-semibold">llama3.2</span> is
          recommended (2 GB).
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onGoToSettings}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-[rgba(234,88,12,0.25)] hover:bg-[rgba(234,88,12,0.4)]
          border border-[rgba(234,88,12,0.5)] text-[#FED7AA] cursor-pointer text-[11px] font-bold
          whitespace-nowrap transition-colors"
      >
        Install Model →
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-white/10
          text-[#9AA4B2] cursor-pointer flex items-center justify-center text-sm font-bold transition-colors"
      >
        ×
      </button>

      <style>{`
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
  const syncCalendarDeadlines = useQueueStore(
    (state) => state.syncCalendarDeadlines,
  );
  const syncLinkedInTimeline = useQueueStore(
    (state) => state.syncLinkedInTimeline,
  );
  const syncIntervalMinutes = useQueueStore(
    (state) => state.syncIntervalMinutes,
  );
  const gmailAccounts = useQueueStore((state) => state.gmailAccounts);

  const fetchMorningBrief = useQueueStore((state) => state.fetchMorningBrief);
  const fetchKnowledgeItems = useQueueStore(
    (state) => state.fetchKnowledgeItems,
  );
  const fetchDecisions = useQueueStore((state) => state.fetchDecisions);
  const fetchWeeklyReview = useQueueStore((state) => state.fetchWeeklyReview);
  const fetchVaultPath = useQueueStore((state) => state.fetchVaultPath);
  const fetchCustomFeeds = useQueueStore((state) => state.fetchCustomFeeds);
  const fetchTasks = useQueueStore((state) => state.fetchTasks);
  const checkPendingReminders = useQueueStore(
    (state) => state.checkPendingReminders,
  );
  const fetchLifeEvents = useQueueStore((state) => state.fetchLifeEvents);
  const checkOllamaModels = useQueueStore((state) => state.checkOllamaModels);
  const ollamaModels = useQueueStore((state) => state.ollamaModels);
  const ollamaChecked = useQueueStore((state) => state.ollamaChecked);
  const fetchActiveProjects = useQueueStore(
    (state) => state.fetchActiveProjects,
  );
  const fetchDailyHabits = useQueueStore((state) => state.fetchDailyHabits);
  const fetchDailyIntel = useQueueStore((state) => state.fetchDailyIntel);
  const fetchPomodoroSessions = useQueueStore(
    (state) => state.fetchPomodoroSessions,
  );
  const fetchSocialPosts = useQueueStore((state) => state.fetchSocialPosts);

  const [modelAlertDismissed, setModelAlertDismissed] = useState(false);

  // Silent background update check on startup (non-blocking, notifies user if available)
  useEffect(() => {
    const silentUpdateCheck = async () => {
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
        return;
      try {
        // Delay 10s so it doesn't compete with boot syncs
        await new Promise((r) => setTimeout(r, 10_000));
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update?.available) {
          const sendNotification =
            useQueueStore.getState().sendDesktopNotification;
          await sendNotification(
            "🆕 Wardyn Update Available",
            `v${update.version} is ready. Open Settings → Check for Updates to install.`,
          );
        }
      } catch {
        // Silent — don't surface startup update errors to the user
      }
    };
    silentUpdateCheck();
  }, []);

  // 1. Startup Boot Auto-Sync & Notification Listener
  useEffect(() => {
    const initBootSentinel = async () => {
      await fetchItems();
      await checkGmailStatus();
      await syncCalendarDeadlines();
      await syncLinkedInTimeline();

      // AI model presence check & background download listener (must run early)
      checkOllamaModels();
      useQueueStore.getState().initOllamaProgressListener();
      // Retry model check after 6s — Ollama may still be starting up on boot
      setTimeout(() => checkOllamaModels(), 6000);
      // Final retry after 15s in case Ollama was cold-started by the backend
      setTimeout(() => checkOllamaModels(), 15000);

      // Re-check Gmail status after 2s — on packaged .app the IPC bridge
      // may not be fully ready on the very first call at cold boot
      setTimeout(() => checkGmailStatus(), 2000);

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
      fetchPomodoroSessions(1); // restores any active session from DB
      fetchSocialPosts(); // restores persisted social posts across restarts
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
          const notificationPlugin =
            await import("@tauri-apps/plugin-notification");
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
    setupTrayListener().then((fn) => {
      trayUnlisten = fn;
    });

    return () => {
      trayUnlisten?.();
    };
  }, [
    fetchItems,
    checkGmailStatus,
    syncCalendarDeadlines,
    syncLinkedInTimeline,
    syncGmail,
    setActiveTab,
  ]);

  // 2. Background Periodic Multi-Channel Ingestion & Continuous AI Learning Interval
  useEffect(() => {
    const intervalMs = syncIntervalMinutes * 60 * 1000;
    const reminderIntervalMs = 60 * 1000;

    const timer = setInterval(async () => {
      // Always re-check status first — ensures we don't miss a mid-session connect
      await checkGmailStatus();
      const accounts = useQueueStore.getState().gmailAccounts;
      if (accounts.length > 0) {
        await syncGmail();
      }
      await syncLinkedInTimeline();
    }, intervalMs);

    const reminderTimer = setInterval(() => {
      checkPendingReminders();
    }, reminderIntervalMs);

    // Re-check Ollama models every 5 minutes in case user installs mid-session
    const modelTimer = setInterval(
      () => {
        checkOllamaModels();
      },
      5 * 60 * 1000,
    );

    return () => {
      clearInterval(timer);
      clearInterval(reminderTimer);
      clearInterval(modelTimer);
    };
  }, [
    gmailAccounts,
    syncIntervalMinutes,
    syncGmail,
    syncLinkedInTimeline,
    checkPendingReminders,
    checkOllamaModels,
  ]);

  const showModelAlert =
    ollamaChecked && ollamaModels.length === 0 && !modelAlertDismissed;
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
      case "research":
        return <ResearchTab />;
      case "settings":
        return <SettingsTab />;

      default:
        return <TodayBrief />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0B0E13] relative">
      <h2 className="sr-only">
        Wardyn desktop app: a sidebar with navigation and a main daily brief
        showing reply cards awaiting approval, a content brief card, and an
        auto-handled summary
      </h2>

      {/* macOS Seamless Window Titlebar Drag Area */}
      <div data-tauri-drag-region className="h-6 w-full shrink-0 z-40" />

      <StatusBanner />

      {/* Ollama No-Model Alert */}
      {showModelAlert && (
        <NoModelAlert
          onGoToSettings={() => {
            setActiveTab("settings");
            setModelAlertDismissed(true);
          }}
          onDismiss={() => setModelAlertDismissed(true)}
        />
      )}

      {/* App shell - sidebar + scrollable content container */}
      <div className="flex-1 flex gap-3 max-w-[960px] w-full mx-auto px-4 pb-4 pt-1 min-h-0 items-start overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 h-full overflow-y-auto pr-1">
          {renderActiveTab()}
        </main>
      </div>
      <LifeCaptureModal />
    </div>
  );
}
