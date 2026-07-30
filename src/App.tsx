import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TodayBrief } from './components/TodayBrief';
import { MessagesTab } from './components/MessagesTab';
import { ContentTab } from './components/ContentTab';
import { DeadlinesTab } from './components/DeadlinesTab';
import { SettingsTab } from './components/SettingsTab';
import { useQueueStore } from './store/useQueueStore';

export default function App() {
  const activeTab = useQueueStore((state) => state.activeTab);
  const fetchItems = useQueueStore((state) => state.fetchItems);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'today':
        return <TodayBrief />;
      case 'messages':
        return <MessagesTab />;
      case 'content':
        return <ContentTab />;
      case 'deadlines':
        return <DeadlinesTab />;
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
      
      <div className="flex gap-5 max-w-5xl mx-auto relative z-0">
        <Sidebar />
        {renderActiveTab()}
      </div>
    </>
  );
}
