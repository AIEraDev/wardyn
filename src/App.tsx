import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TodayBrief } from './components/TodayBrief';
import { MessagesTab } from './components/MessagesTab';
import { ContentTab } from './components/ContentTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { DeadlinesTab } from './components/DeadlinesTab';
import { ChannelsTab } from './components/ChannelsTab';
import { SettingsTab } from './components/SettingsTab';
import { MemoryTab } from './components/MemoryTab';
import { useQueueStore } from './store/useQueueStore';


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


  // 1. Startup Boot Auto-Sync & Notification Listener
  useEffect(() => {
    const initBootSentinel = async () => {
      await fetchItems();
      await checkGmailStatus();
      await syncCalendarDeadlines();
      await syncLinkedInTimeline();

      // Auto-generate morning brief on first launch of the day (cached if already done)
      fetchMorningBrief();
      // Load personal memory
      fetchKnowledgeItems();
      fetchDecisions();


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
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const notificationPlugin = await import('@tauri-apps/plugin-notification');
          if (typeof notificationPlugin.onAction === 'function') {
            await notificationPlugin.onAction(() => {
              setActiveTab('today');
              import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
                const win = getCurrentWindow();
                win.show();
                win.setFocus();
              }).catch(() => {});
            }).catch(() => {});
          }
        }
      } catch (_err) {
        // Silent catch for notification listener
      }
    };

    setupNotificationListener();
  }, [fetchItems, checkGmailStatus, syncCalendarDeadlines, syncLinkedInTimeline, syncGmail, setActiveTab]);

  // 2. Background Periodic Multi-Channel Ingestion & Continuous AI Learning Interval
  useEffect(() => {
    const intervalMs = syncIntervalMinutes * 60 * 1000;
    const timer = setInterval(async () => {
      if (gmailAccounts.length > 0) {
        await syncGmail();
      }
      // Continuous background fetching & local AI model learning from LinkedIn
      await syncLinkedInTimeline();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [gmailAccounts, syncIntervalMinutes, syncGmail, syncLinkedInTimeline]);


  const renderActiveTab = () => {
    switch (activeTab) {
      case 'today':
        return <TodayBrief />;
      case 'messages':
        return <MessagesTab />;
      case 'content':
        return <ContentTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'deadlines':
        return <DeadlinesTab />;
      case 'channels':
        return <ChannelsTab />;
      case 'memory':
        return <MemoryTab />;
      case 'settings':
        return <SettingsTab />;

      default:
        return <TodayBrief />;
    }
  };

  return (
    <>
      <h2 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, pointerEvents: 'none' }}>
        Wardyn desktop app: a sidebar with navigation and a main daily brief showing reply cards awaiting approval, a content brief card, and an auto-handled summary
      </h2>

      {/* macOS Seamless Window Titlebar Drag Area */}
      <div data-tauri-drag-region className="h-6 w-full fixed top-0 left-0 z-40" />
      
      <div className="flex gap-5 max-w-5xl mx-auto pt-4 relative z-0">
        <Sidebar />
        {renderActiveTab()}
      </div>
    </>
  );
}
