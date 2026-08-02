import React, { useEffect, useState } from "react";
import {
  IconMail,
  IconCpu,
  IconVolume,
  IconBell,
  IconClock,
  IconPower,
  IconWorld,
  IconDownload,
  IconCheck,
  IconRefresh,
  IconTrash,
  IconFlame,
  IconFolder,
  IconLoader2,
  IconKey,
  IconExternalLink,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import { OllamaSetupModal } from "./OllamaSetupModal";

import { useQueueStore } from "../store/useQueueStore";
import { SupportedLanguage, useTranslation } from "../i18n/translations";

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  size: string;
  tier: "standard" | "power";
  description: string;
}

const FREE_MODEL_CATALOG: CatalogModel[] = [
  // --- Frontier High-Power Models (7B – 70B) ---
  {
    id: "llama3:70b",
    name: "Llama 3 70B (Frontier)",
    provider: "Meta AI",
    size: "40.0 GB",
    tier: "power",
    description:
      "GPT-4 level frontier performance for complex executive reasoning & writing.",
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen 2.5 32B",
    provider: "Alibaba Cloud (Open Source)",
    size: "19.0 GB",
    tier: "power",
    description:
      "Top-tier enterprise multilingual model with high-precision structured outputs.",
  },
  {
    id: "mixtral:8x7b",
    name: "Mixtral 8x7B MoE",
    provider: "Mistral AI",
    size: "26.0 GB",
    tier: "power",
    description:
      "Mixture-of-Experts architecture. Ultra-fast inference with 47B capacity.",
  },
  {
    id: "gemma2:27b",
    name: "Gemma 2 27B",
    provider: "Google DeepMind",
    size: "16.0 GB",
    tier: "power",
    description:
      "Google DeepMind's flagship open model with state-of-the-art accuracy.",
  },
  {
    id: "deepseek-coder:33b",
    name: "DeepSeek Coder 33B",
    provider: "DeepSeek AI",
    size: "19.0 GB",
    tier: "power",
    description:
      "Specialized high-capacity code synthesis, system architecture & JSON formatting.",
  },

  // --- Compact & Balanced Models (2B – 8B) ---
  {
    id: "qwen2.5",
    name: "Qwen 2.5 7B (Recommended)",
    provider: "Alibaba Cloud (Open Source)",
    size: "4.7 GB",
    tier: "standard",
    description:
      "Recommended default. Exceptional balance of speed, tone matching & multi-language.",
  },
  {
    id: "llama3",
    name: "Llama 3 8B",
    provider: "Meta AI",
    size: "4.7 GB",
    tier: "standard",
    description:
      "Balanced general intelligence for executive summaries & drafts.",
  },
  {
    id: "mistral",
    name: "Mistral 7B",
    provider: "Mistral AI",
    size: "4.1 GB",
    tier: "standard",
    description:
      "Ultra-fast, concise natural language processing & high-speed triaging.",
  },
  {
    id: "phi3",
    name: "Phi-3 Mini",
    provider: "Microsoft AI",
    size: "2.2 GB",
    tier: "standard",
    description:
      "Lightweight compact model optimized for devices with low RAM.",
  },
];

export const SettingsTab: React.FC = () => {
  const {
    gmailAccounts,
    connectGmail,
    disconnectGmail,
    language,
    setLanguage,
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
    customFeeds,
    addCustomFeed,
    deleteCustomFeed,
    pullProgress,
    pendingDownloads,
    installOllamaModel,
    cancelOllamaModelInstall,
  } = useQueueStore();

  const t = useTranslation();

  const [vaultInput, setVaultInput] = useState(vaultPath || "");
  const [vaultSaved, setVaultSaved] = useState(false);

  // ── OAuth Credentials (user-provided, stored locally) ──
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [linkedinClientId, setLinkedinClientId] = useState("");
  const [linkedinClientSecret, setLinkedinClientSecret] = useState("");
  const [oauthSaved, setOauthSaved] = useState(false);
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showLinkedinSecret, setShowLinkedinSecret] = useState(false);

  useEffect(() => {
    const loadOAuthCreds = async () => {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const creds = await invoke<{
            google_client_id: string | null;
            google_client_secret: string | null;
            linkedin_client_id: string | null;
            linkedin_client_secret: string | null;
          }>("get_oauth_credentials_command");
          if (creds.google_client_id) setGoogleClientId(creds.google_client_id);
          if (creds.google_client_secret)
            setGoogleClientSecret(creds.google_client_secret);
          if (creds.linkedin_client_id)
            setLinkedinClientId(creds.linkedin_client_id);
          if (creds.linkedin_client_secret)
            setLinkedinClientSecret(creds.linkedin_client_secret);
        } catch (e) {
          console.warn("Failed to load OAuth credentials:", e);
        }
      }
    };
    loadOAuthCreds();
  }, []);

  const handleSaveOAuthCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        // Pass the trimmed value directly — empty string signals "delete this credential",
        // null would mean "leave unchanged" which is not what a Save button should do.
        await invoke("save_oauth_credentials_command", {
          googleClientId: googleClientId.trim(),
          googleClientSecret: googleClientSecret.trim(),
          linkedinClientId: linkedinClientId.trim(),
          linkedinClientSecret: linkedinClientSecret.trim(),
        });
        setOauthSaved(true);
        setTimeout(() => setOauthSaved(false), 2500);
      } catch (e) {
        console.error("Failed to save OAuth credentials:", e);
      }
    }
  };

  const [newFeedTitle, setNewFeedTitle] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);

  useEffect(() => {
    if (vaultPath !== null) setVaultInput(vaultPath);
  }, [vaultPath]);

  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [uninstallingModelId, setUninstallingModelId] = useState<string | null>(
    null,
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [setupTarget, setSetupTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Auto-refresh installed models list when any download finishes
  useEffect(() => {
    const anyJustFinished = Object.values(pullProgress).some(
      (p) => p.done && !p.error,
    );
    if (anyJustFinished) {
      fetchModels();
    }
  }, [pullProgress]);

  const [refreshingModels, setRefreshingModels] = useState(false);

  const fetchModels = async () => {
    setRefreshingModels(true);
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const models = await invoke<Array<{ name: string; size_gb: string }>>(
          "get_installed_ollama_models_command",
        );
        const names = models.map((m) => m.name.toLowerCase());
        setInstalledModels(names);
      } catch (err) {
        console.warn("Failed to fetch installed Ollama models:", err);
      }
    }
    setRefreshingModels(false);
  };
  const handleCheckUpdate = async () => {
    // Only runs inside the Tauri runtime
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      setUpdateStatus("Updates only available in the desktop app.");
      return;
    }

    setCheckingUpdate(true);
    setUpdateStatus("Checking GitHub Releases...");
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const currentVersion = await getVersion();

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        setUpdateStatus(`Wardyn v${currentVersion} is up to date.`);
        return;
      }

      if (update.available) {
        setUpdateStatus(
          `✨ New version v${update.version} available! Downloading...`,
        );
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            setUpdateStatus(`⬇️ Downloading v${update.version}...`);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            if (total > 0) {
              const pct = Math.round((downloaded / total) * 100);
              setUpdateStatus(`⬇️ Downloading v${update.version}... ${pct}%`);
            }
          } else if (event.event === "Finished") {
            setUpdateStatus(`✅ Update installed! Restarting Wardyn...`);
          }
        });

        // Relaunch the app after install completes
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } else {
        setUpdateStatus(`Wardyn v${currentVersion} is up to date.`);
      }
    } catch (err: any) {
      console.warn("Update check error:", err);
      const msg = err?.message || String(err);
      if (
        msg.includes("release JSON") ||
        msg.includes("valid release") ||
        msg.includes("404") ||
        msg.includes("Not Found")
      ) {
        setUpdateStatus(
          "No update manifest yet — the release may still be building. Try again in a few minutes.",
        );
      } else if (msg.includes("signature") || msg.includes("verify")) {
        setUpdateStatus(
          "Update signature verification failed. Contact support.",
        );
      } else if (
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("connect")
      ) {
        setUpdateStatus("Network error — check your connection and try again.");
      } else {
        setUpdateStatus(`Update check failed: ${msg}`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    checkAutoStartStatus();
    fetchModels();
  }, [checkAutoStartStatus]);

  const handleInstallModel = async (modelId: string, modelName: string) => {
    // Check Ollama status before attempting pull
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const status = await invoke<{ installed: boolean; running: boolean }>(
          "check_ollama_status_command",
        );

        if (!status || !status.installed || !status.running) {
          // Open guided setup wizard
          setSetupTarget({ id: modelId, name: modelName });
          return;
        }
      } catch {
        setSetupTarget({ id: modelId, name: modelName });
        return;
      }
    }

    // Direct install if Ollama is confirmed running
    await startModelDownload(modelId, modelName);
  };

  const startModelDownload = async (modelId: string, modelName: string) => {
    await sendDesktopNotification(
      "📥 Downloading High-Performance Local Model",
      `Pulling ${modelName} (${modelId}) in background...`,
    );
    await installOllamaModel(modelId);
  };

  const handleCancelInstall = async (modelId: string, modelName: string) => {
    await cancelOllamaModelInstall(modelId);
    await sendDesktopNotification(
      "⏹️ Download Cancelled",
      `Cancelled download for ${modelName}.`,
    );
  };

  const handleUninstallModel = async (modelId: string, modelName: string) => {
    setUninstallingModelId(modelId);
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_ollama_model_command", { modelName: modelId });
        await fetchModels();
        await sendDesktopNotification(
          "🗑️ Model Uninstalled",
          `Removed ${modelName} from device storage.`,
        );
      } catch (err) {
        console.error("Model uninstall error:", err);
      }
    }
    setUninstallingModelId(null);
  };

  const handleTestNotification = async () => {
    await sendDesktopNotification(
      "Wardyn Notification Test",
      "Native desktop notifications are active and working!",
    );
  };

  return (
    <div className="flex-1 min-w-0 space-y-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">
            {t.settings}
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Language, Frontier AI Models, Autostart & Connectors
          </p>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                {t.language}
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Interface Multi-Language Translation (i18n)
              </p>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                High-Performance Local AI Models Catalog
              </p>
              <p className="text-xs text-[#9AA4B2]">
                From 2B compact to 70B GPT-4 class frontier open models
              </p>
            </div>
          </div>

          <button
            onClick={fetchModels}
            disabled={refreshingModels}
            className="font-mono text-xs bg-[#181E27] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[#242B35] hover:text-[#F0F4F8] flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <IconRefresh
              size={13}
              className={refreshingModels ? "animate-spin" : ""}
            />{" "}
            {refreshingModels ? "Refreshing..." : "Refresh List"}
          </button>
        </div>

        <div className="space-y-3">
          {FREE_MODEL_CATALOG.map((model) => {
            // Normalise: strip :latest tag and any registry prefix for comparison
            const normalise = (n: string) =>
              n
                .replace(/:latest$/, "")
                .split("/")
                .pop() ?? n;
            const isInstalled = installedModels.some((m) => {
              const norm = normalise(m);
              return (
                norm === model.id ||
                norm.startsWith(`${model.id}:`) ||
                m === model.id ||
                m.startsWith(`${model.id}:`)
              );
            });
            const progress = pullProgress[model.id];
            // Derive download state entirely from the global store — NOT local component state
            // so it survives tab switches without resetting.
            const isErrored = Boolean(progress?.done && progress?.error);
            const isDownloading =
              !isErrored &&
              (model.id in pendingDownloads ||
                Boolean(progress && !progress.done));
            const isDeleting = uninstallingModelId === model.id;
            const isPowerTier = model.tier === "power";

            const formatBytes = (bytes: number) => {
              if (!bytes) return "0 B";
              const gb = bytes / (1024 * 1024 * 1024);
              if (gb >= 0.1) return `${gb.toFixed(2)} GB`;
              const mb = bytes / (1024 * 1024);
              return `${mb.toFixed(1)} MB`;
            };

            return (
              <div
                key={model.id}
                className={`p-3.5 rounded-lg border flex flex-col gap-2 transition-all ${
                  isErrored && progress?.error?.includes("Corrupted partial")
                    ? "bg-[rgba(232,162,61,0.04)] border-[rgba(232,162,61,0.3)]"
                    : isErrored
                      ? "bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.3)]"
                      : isPowerTier
                        ? "bg-[#181E27] border-[rgba(232,162,61,0.3)] shadow-[0_0_10px_rgba(232,162,61,0.04)]"
                        : "bg-[#181E27] border-[#242B35]"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {model.name}
                      </span>
                      {isPowerTier && (
                        <span className="font-mono text-[10px] text-[#E8A23D] bg-[rgba(232,162,61,0.15)] px-2 py-0.5 rounded border border-[rgba(232,162,61,0.3)] flex items-center gap-1">
                          <IconFlame size={11} /> High-Power
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-[#7A8492] px-2 py-0.5 rounded bg-[#151A21] border border-[#242B35]">
                        {model.provider}
                      </span>
                      <span className="font-mono text-[10px] text-[#4A8FC2]">
                        {model.size}
                      </span>
                    </div>
                    <p className="text-xs text-[#9AA4B2] m-0">
                      {model.description}
                    </p>
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
                          onClick={() =>
                            handleUninstallModel(model.id, model.name)
                          }
                          title={`Uninstall ${model.name}`}
                          className="p-1.5 font-mono text-xs bg-[#151A21] text-[#E8A23D] hover:bg-[rgba(232,162,61,0.15)] border border-[#242B35] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <IconTrash size={14} />
                        </button>
                      </>
                    ) : isDownloading ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleCancelInstall(model.id, model.name)
                        }
                        className="font-mono text-xs bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)] px-3 py-1 rounded-md font-medium hover:bg-[rgba(239,68,68,0.25)] transition-colors cursor-pointer"
                      >
                        ⏹ Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInstallModel(model.id, model.name)}
                        className="font-mono text-xs bg-[#4A8FC2] text-black px-3 py-1 rounded-md font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <IconDownload size={14} />
                        Install Model
                      </button>
                    )}
                  </div>
                </div>

                {/* Error state */}
                {isErrored &&
                  progress?.error &&
                  (() => {
                    const isStaleBlob =
                      progress.error.includes("Corrupted partial") ||
                      progress.error.includes("Cleaning up");
                    return (
                      <div
                        className={`mt-1 pt-2 border-t flex items-start gap-2 ${
                          isStaleBlob
                            ? "border-[rgba(232,162,61,0.25)]"
                            : "border-[rgba(239,68,68,0.2)]"
                        }`}
                      >
                        <span
                          className={`text-[10px] shrink-0 mt-0.5 ${isStaleBlob ? "text-[#E8A23D]" : "text-[#EF4444]"}`}
                        >
                          {isStaleBlob ? "🔄" : "⚠"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[11px] m-0 leading-snug ${isStaleBlob ? "text-[#E8A23D]" : "text-[#EF4444]"}`}
                          >
                            {isStaleBlob
                              ? "Stale partial download cleared. Ready to retry."
                              : progress.error}
                          </p>
                          {isStaleBlob && (
                            <button
                              type="button"
                              onClick={() =>
                                handleInstallModel(model.id, model.name)
                              }
                              className="mt-1.5 font-mono text-[11px] px-2.5 py-1 rounded-md bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border border-[rgba(232,162,61,0.3)] hover:bg-[rgba(232,162,61,0.25)] transition-colors cursor-pointer"
                            >
                              ↩ Retry Install
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* Download Progress Bar — shown for both pending (before first event) and active downloads */}
                {isDownloading && (
                  <div className="mt-2 space-y-1.5 pt-2 border-t border-[#242B35]">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#9AA4B2] truncate max-w-[60%] flex items-center gap-1.5">
                        <IconLoader2
                          size={11}
                          className="animate-spin shrink-0"
                        />
                        {progress
                          ? progress.status || "Downloading..."
                          : "Connecting to Ollama…"}
                      </span>
                      {progress && (
                        <span className="text-[#4A8FC2] font-semibold">
                          {progress.percent > 0
                            ? `${progress.percent.toFixed(1)}%`
                            : ""}{" "}
                          {progress.total > 0
                            ? `(${formatBytes(progress.completed)} / ${formatBytes(progress.total)})`
                            : ""}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-[#151A21] rounded-full overflow-hidden border border-[#242B35]">
                      {progress ? (
                        <div
                          className="h-full bg-gradient-to-r from-[#4A8FC2] to-[#34D399] transition-all duration-300 rounded-full"
                          style={{ width: `${Math.max(progress.percent, 5)}%` }}
                        />
                      ) : (
                        /* Indeterminate animated bar while pending */
                        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#4A8FC2] to-transparent animate-[shimmer_1.5s_ease-in-out_infinite]" />
                      )}
                    </div>
                  </div>
                )}
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                Gmail Multi-Account Integration
              </p>
              <p className="text-xs text-[#9AA4B2]">
                OAuth 2.0 Read & Send Connectors
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={connectGmail}
            className="text-xs font-medium text-black bg-[#4A8FC2] px-3.5 py-1.5 rounded-lg hover:bg-[#5b9bd1] transition-colors font-mono cursor-pointer"
          >
            {gmailAccounts.length > 0
              ? "+ Connect Another Gmail Account"
              : t.connect_gmail}
          </button>
        </div>

        {gmailAccounts.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#242B35]">
            <p className="font-mono text-[10px] text-[#7A8492] uppercase m-0">
              Active Connected Inboxes:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gmailAccounts.map((acc) => (
                <div
                  key={acc}
                  className="flex items-center justify-between bg-[#181E27] p-2.5 rounded-lg border border-[#242B35] text-xs"
                >
                  <span className="font-mono text-[#34D399] text-xs truncate mr-2">
                    ✓ {acc}
                  </span>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                {t.auto_start}
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Launch Wardyn sentinel silently when you log in
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleAutoStart(!autoStartEnabled)}
            className={`font-mono text-xs px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              autoStartEnabled
                ? "bg-[rgba(52,211,153,0.15)] text-[#34D399] border border-[rgba(52,211,153,0.3)]"
                : "bg-[#181E27] text-[#7A8492] border border-[#242B35]"
            }`}
          >
            {autoStartEnabled ? "Enabled" : "Disabled"}
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                {t.desktop_notifications}
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Notify on urgent visa requests or low confidence items
              </p>
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
                  ? "bg-[rgba(52,211,153,0.15)] text-[#34D399] border border-[rgba(52,211,153,0.3)]"
                  : "bg-[#181E27] text-[#7A8492] border border-[#242B35]"
              }`}
            >
              {notificationsEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>
      </div>

      {/* GitHub Auto-Update Channel Card */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconRefresh size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">
                Software Auto-Updates
              </p>
              <p className="text-xs text-[#9AA4B2]">
                {updateStatus ||
                  "Connected to GitHub Releases channel (AIEraDev/wardyn)"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="font-mono text-xs px-3 py-1.5 rounded-md bg-[#181E27] text-[#4A8FC2] border border-[#242B35] hover:border-[#4A8FC2] transition-colors cursor-pointer flex items-center gap-2"
          >
            {checkingUpdate ? (
              <IconRefresh size={13} className="animate-spin" />
            ) : (
              <IconDownload size={13} />
            )}
            {checkingUpdate ? "Checking..." : "Check for Updates"}
          </button>
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
              <p className="text-sm font-semibold text-[#F0F4F8]">
                {t.sync_frequency}
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Automatically check Gmail inbox in the background
              </p>
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

      {/* OAuth Credentials — user brings their own */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
            <IconKey size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#F0F4F8]">
              OAuth Credentials
            </p>
            <p className="text-xs text-[#9AA4B2]">
              Your credentials — stored locally, never shared
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-[#181E27] border border-[rgba(74,143,194,0.2)] rounded-lg p-3 space-y-1.5">
          <p className="text-xs text-[#9AA4B2] leading-relaxed">
            Wardyn is{" "}
            <span className="text-[#F0F4F8] font-medium">100% local-first</span>
            . To connect Gmail or LinkedIn, paste your own OAuth app credentials
            below. They're stored only in your local database — never sent to
            any server.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="#"
              onClick={async (e) => {
                e.preventDefault();
                const { invoke } = await import("@tauri-apps/api/core");
                invoke("open_external_url", {
                  url: "https://console.cloud.google.com/apis/credentials",
                });
              }}
              className="font-mono text-[11px] text-[#4A8FC2] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <IconExternalLink size={11} /> Google Cloud Console
            </a>
            <a
              href="#"
              onClick={async (e) => {
                e.preventDefault();
                const { invoke } = await import("@tauri-apps/api/core");
                invoke("open_external_url", {
                  url: "https://www.linkedin.com/developers/apps",
                });
              }}
              className="font-mono text-[11px] text-[#4A8FC2] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <IconExternalLink size={11} /> LinkedIn Developer Portal
            </a>
          </div>
        </div>

        <form onSubmit={handleSaveOAuthCreds} className="space-y-3">
          {/* Google */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#7A8492] uppercase">
              Google OAuth App
            </p>
            <div className="text-[10px] text-[#5D6A7A] font-mono mb-1">
              Create a project → OAuth 2.0 Client ID → Desktop app type → add{" "}
              <span className="text-[#4A8FC2]">http://127.0.0.1:14220</span> as
              redirect URI
            </div>
            <input
              type="text"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="your-client-id.apps.googleusercontent.com"
              className="w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            />
            <div className="relative">
              <input
                type={showGoogleSecret ? "text" : "password"}
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder="Google Client Secret"
                className="w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 pr-9 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
              />
              <button
                type="button"
                onClick={() => setShowGoogleSecret((v) => !v)}
                className="absolute right-2.5 top-2 text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer"
              >
                {showGoogleSecret ? (
                  <IconEyeOff size={14} />
                ) : (
                  <IconEye size={14} />
                )}
              </button>
            </div>
          </div>

          {/* LinkedIn */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#7A8492] uppercase">
              LinkedIn OAuth App
            </p>
            <div className="text-[10px] text-[#5D6A7A] font-mono mb-1">
              Create app → Products: Sign In with LinkedIn → add{" "}
              <span className="text-[#4A8FC2]">
                http://localhost:14220/callback
              </span>{" "}
              as redirect URI (same port as Google)
            </div>
            <input
              type="text"
              value={linkedinClientId}
              onChange={(e) => setLinkedinClientId(e.target.value)}
              placeholder="LinkedIn Client ID"
              className="w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            />
            <div className="relative">
              <input
                type={showLinkedinSecret ? "text" : "password"}
                value={linkedinClientSecret}
                onChange={(e) => setLinkedinClientSecret(e.target.value)}
                placeholder="LinkedIn Client Secret"
                className="w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 pr-9 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
              />
              <button
                type="button"
                onClick={() => setShowLinkedinSecret((v) => !v)}
                className="absolute right-2.5 top-2 text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer"
              >
                {showLinkedinSecret ? (
                  <IconEyeOff size={14} />
                ) : (
                  <IconEye size={14} />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[#4A8FC2] text-black text-xs font-semibold rounded-lg hover:bg-[#5b9bd1] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            {oauthSaved ? <IconCheck size={13} /> : <IconKey size={13} />}
            {oauthSaved ? "Saved!" : "Save Credentials"}
          </button>
        </form>
      </div>

      {/* Local Markdown Vault Sync (Obsidian / Logseq) */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconFolder size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">
                Local Markdown Vault Sync (Obsidian / Logseq)
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Mirror all captures, notes, and decisions into a local directory
                as .md files
              </p>
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
            {vaultSaved ? "Saved!" : "Save Path"}
          </button>
        </form>
        <p className="text-[10px] text-[#4A5568] font-mono">
          Each capture and decision creates a `.md` file with clean YAML
          frontmatter for automatic Obsidian Graph linking.
        </p>
      </div>

      {/* Custom RSS & Atom Feed Subscriptions */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
              <IconWorld size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">
                Custom RSS & Atom Feed Subscriptions
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Ingest your favorite blogs, newsletters, and podcasts into your
                Morning Brief
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] bg-[rgba(74,143,194,0.12)] text-[#4A8FC2] px-2 py-1 rounded border border-[rgba(74,143,194,0.25)]">
            {customFeeds.length} Active Feeds
          </span>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newFeedTitle.trim() || !newFeedUrl.trim()) return;
            setAddingFeed(true);
            await addCustomFeed(newFeedTitle.trim(), newFeedUrl.trim());
            setNewFeedTitle("");
            setNewFeedUrl("");
            setAddingFeed(false);
          }}
          className="flex gap-2"
        >
          <input
            id="custom-feed-title-input"
            type="text"
            value={newFeedTitle}
            onChange={(e) => setNewFeedTitle(e.target.value)}
            placeholder="Feed Title (e.g. Paul Graham)"
            className="w-1/3 bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            required
          />
          <input
            id="custom-feed-url-input"
            type="url"
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            placeholder="Feed URL (https://paulgraham.com/rss.html)"
            className="flex-1 bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
            required
          />
          <button
            type="submit"
            disabled={addingFeed}
            className="px-3 py-2 bg-[#4A8FC2] text-black text-xs font-semibold rounded-lg hover:bg-[#5b9bd1] transition-colors cursor-pointer disabled:opacity-40"
          >
            Add Feed
          </button>
        </form>

        {customFeeds.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {customFeeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#181E27] border border-[#242B35]"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-medium text-[#F0F4F8] truncate">
                    {feed.title}
                  </p>
                  <p className="text-[10px] text-[#7A8492] font-mono truncate">
                    {feed.url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCustomFeed(feed.id)}
                  title="Remove Feed"
                  className="p-1 text-[#7A8492] hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] rounded transition-colors cursor-pointer shrink-0"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tone & Corpus Preferences */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#181E27] text-[#4A8FC2] border border-[#242B35]">
            <IconVolume size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8]">
              User Writing Voice
            </p>
            <p className="text-xs text-[#9AA4B2]">Seeded prompt guidelines</p>
          </div>
        </div>
        <p className="text-xs text-[#9AA4B2] font-mono bg-[#181E27] p-3 rounded-lg border border-[#242B35]">
          "Concise, professional, warm, direct, leaving space for updating
          later."
        </p>
      </div>
      {/* Ollama Setup Modal */}
      {setupTarget && (
        <OllamaSetupModal
          modelId={setupTarget.id}
          modelName={setupTarget.name}
          onProceed={(id) => {
            const m = FREE_MODEL_CATALOG.find((x) => x.id === id);
            startModelDownload(id, m?.name || id);
          }}
          onClose={() => setSetupTarget(null)}
        />
      )}
    </div>
  );
};
