import React from 'react';
import { IconCalendar, IconCheck, IconClock, IconRefresh } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

export const DeadlinesTab: React.FC = () => {
  const { calendarEvents, syncCalendarDeadlines, isLoading } = useQueueStore();

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Deadlines</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Google Calendar Synced Deadlines</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncCalendarDeadlines}
            className="font-mono text-xs bg-[#151A21] text-[#34D399] border border-[rgba(52,211,153,0.3)] px-2.5 py-1 rounded-md flex items-center gap-1.5 hover:bg-[#181E27] transition-colors cursor-pointer"
          >
            <IconRefresh size={13} /> Sync Calendar
          </button>
          <span className="font-mono text-xs bg-[#151A21] text-[#34D399] px-2.5 py-1 rounded-md border border-[rgba(52,211,153,0.3)]">
            {calendarEvents.length} Auto-Synced
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          Loading deadlines...
        </div>
      ) : calendarEvents.length === 0 ? (
        /* Data Empty / New User State */
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconCalendar size={24} className="mx-auto text-[#4A8FC2]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">No Calendar Deadlines</h4>
          <p className="text-xs text-[#7A8492]">
            Deadline emails (such as visa or appointment deadlines) will auto-create Google Calendar events and surface here.
          </p>
        </div>
      ) : (
        /* Data Availability & Integrity State (Deduplicated Events List) */
        <div className="space-y-3">
          {calendarEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-4 rounded-xl bg-[#151A21] border border-[#242B35] flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]">
                  <IconCalendar size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#F0F4F8]">{evt.summary}</p>
                  <div className="flex items-center gap-2 mt-0.5 font-mono text-xs text-[#9AA4B2]">
                    <IconClock size={13} />
                    <span>{new Date(evt.event_date).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <span className="font-mono text-xs text-[#34D399] bg-[rgba(52,211,153,0.15)] px-2.5 py-1 rounded-md border border-[rgba(52,211,153,0.3)] flex items-center gap-1">
                <IconCheck size={14} />
                Synced
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
