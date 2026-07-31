import React from 'react';
import {
  IconShieldCheck,
  IconLayoutDashboard,
  IconMail,
  IconPencil,
  IconCalendar,
  IconGridDots,
  IconSettings,
  IconChartBar,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import { TabType } from '../types/queue';
import { TranslationDictionary } from '../i18n/translations';

export const Sidebar: React.FC = () => {
  const activeTab = useQueueStore((state) => state.activeTab);
  const setActiveTab = useQueueStore((state) => state.setActiveTab);
  const t = useQueueStore((state) => state.t);

  const tabs: Array<{ id: TabType; labelKey: keyof TranslationDictionary; icon: React.ElementType }> = [
    { id: 'today', labelKey: 'today', icon: IconLayoutDashboard },
    { id: 'messages', labelKey: 'messages', icon: IconMail },
    { id: 'content', labelKey: 'content', icon: IconPencil },
    { id: 'analytics', labelKey: 'analytics', icon: IconChartBar },
    { id: 'deadlines', labelKey: 'deadlines', icon: IconCalendar },
    { id: 'channels', labelKey: 'channels', icon: IconGridDots },
    { id: 'settings', labelKey: 'settings', icon: IconSettings },
  ];

  return (
    <div className="w-36 shrink-0 bg-[#151A21] border border-[#242B35] rounded-xl p-3 h-fit relative z-50 pointer-events-auto">
      {/* Brand Header */}
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[#242B35]">
        <IconShieldCheck size={20} className="text-[#4A8FC2]" />
        <span className="text-sm font-semibold text-[#F0F4F8] tracking-tight">Wardyn</span>
      </div>

      {/* Navigation Links */}
      <nav className="flex flex-col gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium w-full text-left transition-colors cursor-pointer border-0 outline-none relative z-50 pointer-events-auto ${
                isActive
                  ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] font-semibold'
                  : 'bg-transparent text-[#9AA4B2] hover:bg-[#181E27] hover:text-[#F0F4F8]'
              }`}
            >
              <Icon size={16} className="pointer-events-none shrink-0" />
              <span className="pointer-events-none truncate">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
