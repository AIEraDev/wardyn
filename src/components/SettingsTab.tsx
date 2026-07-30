import React, { useEffect } from 'react';
import { IconMail, IconCpu, IconVolume, IconBell, IconClock, IconPower } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

export const SettingsTab: React.FC = () => {
  const {
    gmailAccount,
    connectGmail,
    disconnectGmail,
    notificationsEnabled,
    toggleNotifications,
    autoStartEnabled,
    checkAutoStartStatus,
    toggleAutoStart,
    syncIntervalMinutes,
    setSyncInterval,
    sendDesktopNotification,
  } = useQueueStore();

  useEffect(() => {
    checkAutoStartStatus();
  }, [checkAutoStartStatus]);

  const handleTestNotification = async () => {
    await sendDesktopNotification(
      'Wardyn Notification Test',
      'Native desktop notifications are active and working!'
    );
  };

  return (
    <div className="flex-1 min-w-0 space-y-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Settings</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Connectors, Autostart, Local Model & Preferences</p>
        </div>
      </div>

      {/* Gmail Connection Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]">
              <IconMail size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Gmail Integration</p>
              <p className="text-xs text-[#9AA4B2]">OAuth 2.0 Read & Send Connector</p>
            </div>
          </div>

          {gmailAccount ? (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#34D399]">{gmailAccount}</span>
              <button
                type="button"
                onClick={disconnectGmail}
                className="text-xs text-[#E8A23D] hover:underline cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={connectGmail}
              className="text-xs font-medium text-black bg-[#4A8FC2] px-3.5 py-1.5 rounded-lg hover:bg-[#5b9bd1] transition-colors font-mono cursor-pointer"
            >
              Connect Account
            </button>
          )}
        </div>
      </div>

      {/* Auto-Start on System Boot / Login Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconPower size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Auto-Start on System Login</p>
              <p className="text-xs text-[#9AA4B2]">Launch Wardyn sentinel silently when you log in</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleAutoStart(!autoStartEnabled)}
            className={`font-mono text-xs px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              autoStartEnabled
                ? 'bg-[rgba(52,211,153,0.15)] text-[#34D399] border border-[rgba(52,211,153,0.3)]'
                : 'bg-[#181E27] text-[#7A8492] border border-[#242B35]'
            }`}
          >
            {autoStartEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Native Desktop Notifications Toggle */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconBell size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Desktop System Notifications</p>
              <p className="text-xs text-[#9AA4B2]">Notify on urgent visa requests or low confidence items</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestNotification}
              className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#F0F4F8] transition-colors cursor-pointer"
            >
              Test Notification
            </button>
            <button
              type="button"
              onClick={() => toggleNotifications(!notificationsEnabled)}
              className={`font-mono text-xs px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                notificationsEnabled
                  ? 'bg-[rgba(52,211,153,0.15)] text-[#34D399] border border-[rgba(52,211,153,0.3)]'
                  : 'bg-[#181E27] text-[#7A8492] border border-[#242B35]'
              }`}
            >
              {notificationsEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>

      {/* Background Inbox Periodic Sync Frequency */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconClock size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Background Sync Frequency</p>
              <p className="text-xs text-[#9AA4B2]">Automatically check Gmail inbox in the background</p>
            </div>
          </div>

          <select
            value={syncIntervalMinutes}
            onChange={(e) => setSyncInterval(Number(e.target.value))}
            className="bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-1.5 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] cursor-pointer"
          >
            <option value={2}>Every 2 minutes</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
          </select>
        </div>
      </div>

      {/* Ollama Local Model Status */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
            <IconCpu size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8]">Local Model (Ollama)</p>
            <p className="text-xs text-[#9AA4B2]">http://localhost:11434/api/generate</p>
          </div>
        </div>
        <p className="text-xs text-[#7A8492] font-mono leading-relaxed">
          Model: qwen2.5 / llama3 • Offline rule-based fallback active
        </p>
      </div>

      {/* Tone & Corpus Preferences */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
            <IconVolume size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8]">User Writing Voice</p>
            <p className="text-xs text-[#9AA4B2]">Seeded prompt guidelines</p>
          </div>
        </div>
        <p className="text-xs text-[#9AA4B2] font-mono bg-[#181E27] p-3 rounded-lg border border-[#242B35]">
          "Concise, professional, warm, direct, leaving space for updating later."
        </p>
      </div>
    </div>
  );
};
