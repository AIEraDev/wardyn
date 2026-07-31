import React, { useState } from 'react';
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconRefresh,
  IconBell,
  IconPlus,
  IconTrash,
  IconExternalLink,
  IconAlertTriangle,
  IconFilter,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

export const DeadlinesTab: React.FC = () => {
  const { calendarEvents, syncCalendarDeadlines, isLoading, sendDesktopNotification, t } = useQueueStore();
  const [filter, setFilter] = useState<'all' | 'gcal' | 'visa'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [reminderSetting, setReminderSetting] = useState<Record<string, string>>({});

  const filteredEvents = calendarEvents.filter((evt) => {
    if (filter === 'gcal') return evt.id.startsWith('gcal_');
    if (filter === 'visa') return evt.summary.toLowerCase().includes('visa') || evt.summary.toLowerCase().includes('ukvi') || evt.summary.toLowerCase().includes('deadline');
    return true;
  });

  const handleSetReminder = async (eventId: string, summary: string, timing: string) => {
    setReminderSetting((prev) => ({ ...prev, [eventId]: timing }));
    await sendDesktopNotification(
      '🔔 Calendar Reminder Configured',
      `Reminder set for "${summary}" (${timing})`
    );
  };

  const handleTestReminderTrigger = async (summary: string, dateStr: string) => {
    await sendDesktopNotification(
      `🔔 Upcoming Deadline Reminder: ${summary}`,
      `Scheduled commitment on ${new Date(dateStr).toLocaleString()}`
    );
  };

  const handleAddManualEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim() && newDate) {
      const customId = `custom_${Date.now()}`;
      const customEvent = {
        id: customId,
        queue_item_id: `custom_item_${Date.now()}`,
        event_id: customId,
        summary: newTitle.trim(),
        event_date: new Date(newDate).toISOString(),
        created_at: new Date().toISOString(),
      };
      useQueueStore.setState((state) => ({
        calendarEvents: [customEvent, ...state.calendarEvents],
      }));
      sendDesktopNotification('📅 Event Added', `Added custom commitment: "${newTitle}"`);
      setNewTitle('');
      setNewDate('');
      setShowAddModal(false);
    }
  };

  const handleDismissEvent = (eventId: string) => {
    useQueueStore.setState((state) => ({
      calendarEvents: state.calendarEvents.filter((e) => e.id !== eventId),
    }));
    sendDesktopNotification('🗑️ Commitment Dismissed', 'Removed commitment from Wardyn schedule.');
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header Bar */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">{t('deadlines')}</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Google Calendar Events, Notification Reminders & Deadlines</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncCalendarDeadlines}
            className="font-mono text-xs bg-[#151A21] text-[#34D399] border border-[rgba(52,211,153,0.3)] px-2.5 py-1 rounded-md flex items-center gap-1.5 hover:bg-[#181E27] transition-colors cursor-pointer"
          >
            <IconRefresh size={13} /> {t('sync')} Calendar
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="font-mono text-xs bg-[#4A8FC2] text-black px-2.5 py-1 rounded-md font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1 cursor-pointer"
          >
            <IconPlus size={14} /> Add Event
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            filter === 'all'
              ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          <IconFilter size={13} /> All Commitments ({calendarEvents.length})
        </button>
        <button
          onClick={() => setFilter('gcal')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            filter === 'gcal'
              ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          Google Calendar Events
        </button>
        <button
          onClick={() => setFilter('visa')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            filter === 'visa'
              ? 'bg-[rgba(232,162,61,0.16)] text-[#E8A23D] border border-[rgba(232,162,61,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          <IconAlertTriangle size={13} /> Visa & Urgent Deadlines
        </button>
      </div>

      {/* Manual Add Event Form */}
      {showAddModal && (
        <form onSubmit={handleAddManualEvent} className="mb-4 p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
          <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">Add Custom Deadline / Event</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Event title (e.g. Submit UKVI Reference Letter)..."
              className="bg-[#181E27] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            />
            <input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="bg-[#181E27] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="text-xs bg-[#4A8FC2] text-black px-3.5 py-1 rounded-lg font-medium cursor-pointer">
              Save Event
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="text-xs text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Events List */}
      {isLoading ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          Loading deadlines...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl space-y-2">
          <IconCalendar size={24} className="mx-auto text-[#4A8FC2]" />
          <h4 className="text-sm font-medium text-[#F0F4F8] m-0">No Calendar Commitments Found</h4>
          <p className="text-xs text-[#7A8492]">
            Deadline emails (such as visa or appointment deadlines) will auto-create Google Calendar events and surface here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((evt) => {
            const isVisa = evt.summary.toLowerCase().includes('visa') || evt.summary.toLowerCase().includes('ukvi') || evt.summary.toLowerCase().includes('deadline');
            const timing = reminderSetting[evt.id] || '15 Minutes Before';

            return (
              <div
                key={evt.id}
                className={`p-4 rounded-xl border transition-all ${
                  isVisa
                    ? 'bg-[#181E27] border-[rgba(232,162,61,0.35)] shadow-[0_0_12px_rgba(232,162,61,0.05)]'
                    : 'bg-[#151A21] border-[#242B35]'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg border ${isVisa ? 'bg-[rgba(232,162,61,0.16)] text-[#E8A23D] border-[rgba(232,162,61,0.35)]' : 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border-[rgba(74,143,194,0.35)]'}`}>
                      {isVisa ? <IconAlertTriangle size={18} /> : <IconCalendar size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F0F4F8]">{evt.summary}</p>
                      <div className="flex items-center gap-2 mt-0.5 font-mono text-xs text-[#9AA4B2]">
                        <IconClock size={13} />
                        <span>{new Date(evt.event_date).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#34D399] bg-[rgba(52,211,153,0.15)] px-2.5 py-1 rounded-md border border-[rgba(52,211,153,0.3)] flex items-center gap-1">
                      <IconCheck size={14} />
                      Synced
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDismissEvent(evt.id)}
                      title="Dismiss Event"
                      className="p-1.5 text-[#7A8492] hover:text-[#E8A23D] transition-colors cursor-pointer rounded bg-[#181E27] border border-[#242B35]"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                {/* Reminder Controls & Actions Bar */}
                <div className="pt-2 border-t border-[#242B35] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[#7A8492] flex items-center gap-1">
                      <IconBell size={12} className="text-[#4A8FC2]" /> Reminder:
                    </span>
                    <select
                      value={timing}
                      onChange={(e) => handleSetReminder(evt.id, evt.summary, e.target.value)}
                      className="bg-[#181E27] text-[11px] text-[#F0F4F8] font-mono px-2 py-0.5 rounded border border-[#242B35] cursor-pointer"
                    >
                      <option value="15 Minutes Before">15 Minutes Before</option>
                      <option value="1 Hour Before">1 Hour Before</option>
                      <option value="1 Day Before">1 Day Before</option>
                      <option value="At Time of Event">At Time of Event</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestReminderTrigger(evt.summary, evt.event_date)}
                      className="font-mono text-[11px] text-[#4A8FC2] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <IconBell size={12} /> Test Notification
                    </button>
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-[#7A8492] hover:text-[#F0F4F8] flex items-center gap-1"
                    >
                      Google Calendar <IconExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
