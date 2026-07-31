import React, { useEffect, useState } from 'react';
import { IconMail, IconCpu, IconVolume, IconBell, IconClock, IconPower, IconWorld, IconDownload, IconCheck, IconRefresh } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import { SupportedLanguage } from '../i18n/translations';

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  size: string;
  description: string;
}

const FREE_MODEL_CATALOG: CatalogModel[] = [
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5',
    provider: 'Alibaba Cloud (Open Source)',
    size: '4.7 GB',
    description: 'Recommended. Exceptional multi-language reasoning & precise voice drafting.',
  },
  {
    id: 'llama3',
    name: 'Llama 3',
    provider: 'Meta AI',
    size: '4.7 GB',
    description: 'State-of-the-art general intelligence for executive summaries & drafts.',
  },
  {
    id: 'mistral',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    size: '4.1 GB',
    description: 'Ultra-fast, concise natural language processing & high-speed triaging.',
  },
  {
    id: 'gemma',
    name: 'Gemma 7B',
    provider: 'Google DeepMind',
    size: '5.0 GB',
    description: 'Lightweight & powerful open model built by Google DeepMind.',
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini',
    provider: 'Microsoft AI',
    size: '2.2 GB',
    description: 'Lightweight compact model optimized for devices with low RAM.',
  },
];

export const SettingsTab: React.FC = () => {
  const {
    gmailAccount,
    connectGmail,
    disconnectGmail,
    language,
    setLanguage,
    t,
    notificationsEnabled,
    toggleNotifications,
    autoStartEnabled,
    checkAutoStartStatus,
    toggleAutoStart,
    syncIntervalMinutes,
    setSyncInterval,
    sendDesktopNotification,
  } = useQueueStore();

  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [installingModelId, setInstallingModelId] = useState<string | null>(null);

  const fetchModels = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const models = await invoke<Array<{ name: string; size_gb: string }>>('get_installed_ollama_models_command');
        const names = models.map((m) => m.name.split(':')[0]);
        setInstalledModels(names);
      } catch (err) {
        console.warn('Failed to fetch installed Ollama models:', err);
      }
    }
  };

  useEffect(() => {
    checkAutoStartStatus();
    fetchModels();
  }, [checkAutoStartStatus]);

  const handleInstallModel = async (modelId: string, modelName: string) => {
    setInstallingModelId(modelId);
    await sendDesktopNotification(
      '📥 Downloading Free Local Model',
      `Pulling ${modelName} to local Ollama runtime...`
    );

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('install_ollama_model_command', { modelName: modelId });
        await fetchModels();
        await sendDesktopNotification(
          '✅ Free Local Model Ready',
          `Successfully installed ${modelName}! Wardyn is now powered by ${modelName}.`
        );
      } catch (err: any) {
        console.error('Model pull error:', err);
        await sendDesktopNotification(
          '❌ Model Download Error',
          `Could not pull ${modelName}. Ensure Ollama is running.`
        );
      }
    }
    setInstallingModelId(null);
  };

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
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">{t('settings')}</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Language, Free Local Models, Autostart & Connectors</p>
        </div>
      </div>

      {/* Language / i18n Selector Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]">
              <IconWorld size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">{t('language')}</p>
              <p className="text-xs text-[#9AA4B2]">Interface Multi-Language Translation (i18n)</p>
            </div>
          </div>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-1.5 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] cursor-pointer"
          >
            <option value="en">🇬🇧 English (en)</option>
            <option value="fr">🇫🇷 Français (fr)</option>
            <option value="es">🇪🇸 Español (es)</option>
            <option value="de">🇩🇪 Deutsch (de)</option>
            <option value="zh">🇨🇳 中文 (zh)</option>
            <option value="ja">🇯🇵 日本語 (ja)</option>
          </select>
        </div>
      </div>

      {/* Free Local AI Models Catalog & Installer Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]">
              <IconCpu size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Free Local AI Models Catalog</p>
              <p className="text-xs text-[#9AA4B2]">Browse & install open-source LLMs running 100% locally on device</p>
            </div>
          </div>

          <button
            onClick={fetchModels}
            className="font-mono text-xs bg-[#181E27] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[#242B35] hover:text-[#F0F4F8] flex items-center gap-1 cursor-pointer"
          >
            <IconRefresh size={13} /> Refresh List
          </button>
        </div>

        <div className="space-y-3">
          {FREE_MODEL_CATALOG.map((model) => {
            const isInstalled = installedModels.includes(model.id);
            const isDownloading = installingModelId === model.id;

            return (
              <div
                key={model.id}
                className="p-3.5 rounded-lg bg-[#181E27] border border-[#242B35] flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#F0F4F8]">{model.name}</span>
                    <span className="font-mono text-[10px] text-[#7A8492] px-2 py-0.5 rounded bg-[#151A21] border border-[#242B35]">
                      {model.provider}
                    </span>
                    <span className="font-mono text-[10px] text-[#4A8FC2]">{model.size}</span>
                  </div>
                  <p className="text-xs text-[#9AA4B2] m-0">{model.description}</p>
                </div>

                <div className="shrink-0">
                  {isInstalled ? (
                    <span className="font-mono text-xs text-[#34D399] bg-[rgba(52,211,153,0.15)] px-3 py-1 rounded-md border border-[rgba(52,211,153,0.3)] flex items-center gap-1">
                      <IconCheck size={14} /> Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleInstallModel(model.id, model.name)}
                      className="font-mono text-xs bg-[#4A8FC2] text-black px-3 py-1 rounded-md font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <IconDownload size={14} className={isDownloading ? 'animate-bounce' : ''} />
                      {isDownloading ? 'Downloading...' : 'Install Model'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
              {t('connect_gmail')}
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
              <p className="text-sm font-semibold text-[#F0F4F8]">{t('auto_start')}</p>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">{t('desktop_notifications')}</p>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">{t('sync_frequency')}</p>
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
