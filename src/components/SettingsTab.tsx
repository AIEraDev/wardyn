import React, { useEffect, useState } from 'react';
import { IconMail, IconCpu, IconVolume, IconBell, IconClock, IconPower, IconWorld, IconDownload, IconCheck, IconRefresh, IconTrash, IconFlame, IconFolder } from '@tabler/icons-react';


import { useQueueStore } from '../store/useQueueStore';
import { SupportedLanguage } from '../i18n/translations';

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  size: string;
  tier: 'standard' | 'power';
  description: string;
}

const FREE_MODEL_CATALOG: CatalogModel[] = [
  // --- Frontier High-Power Models (7B – 70B) ---
  {
    id: 'llama3:70b',
    name: 'Llama 3 70B (Frontier)',
    provider: 'Meta AI',
    size: '40.0 GB',
    tier: 'power',
    description: 'GPT-4 level frontier performance for complex executive reasoning & writing.',
  },
  {
    id: 'qwen2.5:32b',
    name: 'Qwen 2.5 32B',
    provider: 'Alibaba Cloud (Open Source)',
    size: '19.0 GB',
    tier: 'power',
    description: 'Top-tier enterprise multilingual model with high-precision structured outputs.',
  },
  {
    id: 'mixtral:8x7b',
    name: 'Mixtral 8x7B MoE',
    provider: 'Mistral AI',
    size: '26.0 GB',
    tier: 'power',
    description: 'Mixture-of-Experts architecture. Ultra-fast inference with 47B capacity.',
  },
  {
    id: 'gemma2:27b',
    name: 'Gemma 2 27B',
    provider: 'Google DeepMind',
    size: '16.0 GB',
    tier: 'power',
    description: "Google DeepMind's flagship open model with state-of-the-art accuracy.",
  },
  {
    id: 'deepseek-coder:33b',
    name: 'DeepSeek Coder 33B',
    provider: 'DeepSeek AI',
    size: '19.0 GB',
    tier: 'power',
    description: 'Specialized high-capacity code synthesis, system architecture & JSON formatting.',
  },

  // --- Compact & Balanced Models (2B – 8B) ---
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5 7B (Recommended)',
    provider: 'Alibaba Cloud (Open Source)',
    size: '4.7 GB',
    tier: 'standard',
    description: 'Recommended default. Exceptional balance of speed, tone matching & multi-language.',
  },
  {
    id: 'llama3',
    name: 'Llama 3 8B',
    provider: 'Meta AI',
    size: '4.7 GB',
    tier: 'standard',
    description: 'Balanced general intelligence for executive summaries & drafts.',
  },
  {
    id: 'mistral',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    size: '4.1 GB',
    tier: 'standard',
    description: 'Ultra-fast, concise natural language processing & high-speed triaging.',
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini',
    provider: 'Microsoft AI',
    size: '2.2 GB',
    tier: 'standard',
    description: 'Lightweight compact model optimized for devices with low RAM.',
  },
];

export const SettingsTab: React.FC = () => {
  const {
    gmailAccounts,
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
    vaultPath,
    setVaultPath,
  } = useQueueStore();


  const [vaultInput, setVaultInput] = useState(vaultPath || '');
  const [vaultSaved, setVaultSaved] = useState(false);

  useEffect(() => {
    if (vaultPath !== null) setVaultInput(vaultPath);
  }, [vaultPath]);



  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [installingModelId, setInstallingModelId] = useState<string | null>(null);
  const [uninstallingModelId, setUninstallingModelId] = useState<string | null>(null);

  const fetchModels = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const models = await invoke<Array<{ name: string; size_gb: string }>>('get_installed_ollama_models_command');
        const names = models.map((m) => m.name);
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
      '📥 Downloading High-Performance Local Model',
      `Pulling ${modelName} (${modelId}) to local Ollama runtime...`
    );

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('install_ollama_model_command', { modelName: modelId });
        await fetchModels();
        await sendDesktopNotification(
          '✅ High-Performance Model Ready',
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

  const handleUninstallModel = async (modelId: string, modelName: string) => {
    setUninstallingModelId(modelId);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_ollama_model_command', { modelName: modelId });
        await fetchModels();
        await sendDesktopNotification(
          '🗑️ Model Uninstalled',
          `Removed ${modelName} from device storage.`
        );
      } catch (err) {
        console.error('Model uninstall error:', err);
      }
    }
    setUninstallingModelId(null);
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
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Language, Frontier AI Models, Autostart & Connectors</p>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">High-Performance Local AI Models Catalog</p>
              <p className="text-xs text-[#9AA4B2]">From 2B compact to 70B GPT-4 class frontier open models</p>
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
            const isInstalled = installedModels.some((m) => m === model.id || m.startsWith(`${model.id}:`));
            const isDownloading = installingModelId === model.id;
            const isDeleting = uninstallingModelId === model.id;
            const isPowerTier = model.tier === 'power';

            return (
              <div
                key={model.id}
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-4 transition-all ${
                  isPowerTier
                    ? 'bg-[#181E27] border-[rgba(232,162,61,0.3)] shadow-[0_0_10px_rgba(232,162,61,0.04)]'
                    : 'bg-[#181E27] border-[#242B35]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#F0F4F8]">{model.name}</span>
                    {isPowerTier && (
                      <span className="font-mono text-[10px] text-[#E8A23D] bg-[rgba(232,162,61,0.15)] px-2 py-0.5 rounded border border-[rgba(232,162,61,0.3)] flex items-center gap-1">
                        <IconFlame size={11} /> High-Power
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[#7A8492] px-2 py-0.5 rounded bg-[#151A21] border border-[#242B35]">
                      {model.provider}
                    </span>
                    <span className="font-mono text-[10px] text-[#4A8FC2]">{model.size}</span>
                  </div>
                  <p className="text-xs text-[#9AA4B2] m-0">{model.description}</p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isInstalled ? (
                    <>
                      <span className="font-mono text-xs text-[#34D399] bg-[rgba(52,211,153,0.15)] px-3 py-1 rounded-md border border-[rgba(52,211,153,0.3)] flex items-center gap-1">
                        <IconCheck size={14} /> Installed
                      </span>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleUninstallModel(model.id, model.name)}
                        title={`Uninstall ${model.name}`}
                        className="p-1.5 font-mono text-xs bg-[#151A21] text-[#E8A23D] hover:bg-[rgba(232,162,61,0.15)] border border-[#242B35] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <IconTrash size={14} />
                      </button>
                    </>
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

      {/* Gmail Integration Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]">
              <IconMail size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Gmail Multi-Account Integration</p>
              <p className="text-xs text-[#9AA4B2]">OAuth 2.0 Read & Send Connectors</p>
            </div>
          </div>

          <button
            type="button"
            onClick={connectGmail}
            className="text-xs font-medium text-black bg-[#4A8FC2] px-3.5 py-1.5 rounded-lg hover:bg-[#5b9bd1] transition-colors font-mono cursor-pointer"
          >
            {gmailAccounts.length > 0 ? '+ Connect Another Gmail Account' : t('connect_gmail')}
          </button>
        </div>

        {gmailAccounts.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#242B35]">
            <p className="font-mono text-[10px] text-[#7A8492] uppercase m-0">Active Connected Inboxes:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gmailAccounts.map((acc) => (
                <div key={acc} className="flex items-center justify-between bg-[#181E27] p-2.5 rounded-lg border border-[#242B35] text-xs">
                  <span className="font-mono text-[#34D399] text-xs truncate mr-2">✓ {acc}</span>
                  <button
                    type="button"
                    onClick={() => disconnectGmail(acc)}
                    className="text-xs text-[#E8A23D] hover:underline cursor-pointer shrink-0 font-mono"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Local Markdown Vault Sync (Obsidian / Logseq) */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconFolder size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">Local Markdown Vault Sync (Obsidian / Logseq)</p>
              <p className="text-xs text-[#9AA4B2]">Mirror all captures, notes, and decisions into a local directory as .md files</p>
            </div>
          </div>
          {vaultPath && (
            <span className="font-mono text-[10px] bg-[rgba(52,211,153,0.12)] text-[#34D399] px-2 py-1 rounded border border-[rgba(52,211,153,0.25)]">
              Active Sync
            </span>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setVaultPath(vaultInput.trim());
            setVaultSaved(true);
            setTimeout(() => setVaultSaved(false), 2500);
          }}
          className="flex gap-2 pt-1"
        >
          <input
            id="vault-path-input"
            type="text"
            value={vaultInput}
            onChange={(e) => setVaultInput(e.target.value)}
            placeholder="/Users/username/Documents/ObsidianVault"
            className="flex-1 bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-[#4A8FC2] text-black text-xs font-semibold rounded-lg hover:bg-[#5b9bd1] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            {vaultSaved ? <IconCheck size={13} /> : <IconFolder size={13} />}
            {vaultSaved ? 'Saved!' : 'Save Path'}
          </button>
        </form>
        <p className="text-[10px] text-[#4A5568] font-mono">
          Each capture and decision creates a `.md` file with clean YAML frontmatter for automatic Obsidian Graph linking.
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

