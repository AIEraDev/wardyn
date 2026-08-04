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
  IconDatabase,
  IconAlertTriangle,
  IconShield,
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

// ─── Data Management Section ──────────────────────────────────────────────────

interface DataStats {
  gmail_messages: number;
  gmail_handled: number;
  gmail_suppressed: number;
  gmail_informational: number;
  voice_edits: number;
  response_analytics: number;
  morning_briefs: number;
  weekly_reviews: number;
  feed_items: number;
  feed_interactions: number;
  knowledge_items: number;
  decisions: number;
  life_events: number;
  tasks: number;
  social_posts: number;
  reminders: number;
  pomodoro_sessions: number;
}

const DataManagementSection: React.FC = () => {
  const { clearGmailCache, clearAiCache, resetAllData } = useQueueStore();
  const [stats, setStats] = React.useState<DataStats | null>(null);
  const [loadingStats, setLoadingStats] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<
    null | "handled" | "all_gmail" | "ai_cache" | "full_reset"
  >(null);

  const invokeRaw = async (cmd: string, args?: Record<string, unknown>) => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
      return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const s = await invokeRaw("get_data_stats_command");
      setStats(s as DataStats);
    } catch (e) {
      console.error("get_data_stats_command failed", e);
    }
    setLoadingStats(false);
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  const run = async (target: typeof confirmTarget) => {
    setConfirmTarget(null);
    setWorking(target!);
    setResult(null);
    try {
      if (target === "handled") {
        const n = await clearGmailCache(true);
        setResult({
          type: "success",
          msg: `Cleared ${n} handled Gmail messages.`,
        });
      } else if (target === "all_gmail") {
        const n = await clearGmailCache(false);
        setResult({
          type: "success",
          msg: `Cleared ${n} Gmail messages from local cache.`,
        });
      } else if (target === "ai_cache") {
        await clearAiCache();
        setResult({
          type: "success",
          msg: "AI caches cleared. Briefs will regenerate on next launch.",
        });
      } else if (target === "full_reset") {
        await resetAllData();
        setResult({
          type: "success",
          msg: "System reset complete. OAuth credentials and Ollama models were preserved.",
        });
      }
      await loadStats();
    } catch (e: any) {
      setResult({ type: "error", msg: e?.message || String(e) });
    }
    setWorking(null);
  };

  const ACTIONS: {
    id: typeof confirmTarget;
    label: string;
    description: string;
    detail: string;
    buttonLabel: string;
    buttonClass: string;
    confirmMsg: string;
  }[] = [
    {
      id: "handled",
      label: "Clear Handled Emails",
      description:
        "Remove sent, skipped, and approved Gmail messages from local cache.",
      detail: stats ? `${stats.gmail_handled} handled messages` : "—",
      buttonLabel: "Clear Handled",
      buttonClass:
        "bg-[rgba(74,143,194,0.15)] text-[#4A8FC2] border-[rgba(74,143,194,0.3)] hover:bg-[rgba(74,143,194,0.25)]",
      confirmMsg: `This will delete ${stats?.gmail_handled ?? "all"} handled Gmail messages from local storage. Pending emails and all personal data are untouched. Continue?`,
    },
    {
      id: "all_gmail",
      label: "Clear All Cached Gmail",
      description:
        "Remove all locally cached Gmail messages. Re-syncing will fetch fresh data.",
      detail: stats
        ? `${stats.gmail_messages} total (${stats.gmail_suppressed} filtered + ${stats.gmail_informational} informational)`
        : "—",
      buttonLabel: "Clear Gmail Cache",
      buttonClass:
        "bg-[rgba(232,162,61,0.15)] text-[#E8A23D] border-[rgba(232,162,61,0.3)] hover:bg-[rgba(232,162,61,0.25)]",
      confirmMsg: `This will delete all ${stats?.gmail_messages ?? ""} locally cached Gmail messages. Your Gmail inbox is not affected — they'll re-sync on next refresh. Continue?`,
    },
    {
      id: "ai_cache",
      label: "Clear AI Caches",
      description:
        "Reset morning briefs, weekly reviews, feed data, and voice edits. Does not touch your memory or emails.",
      detail: stats
        ? `${stats.morning_briefs} briefs · ${stats.feed_items} feed items · ${stats.voice_edits} voice edits`
        : "—",
      buttonLabel: "Clear AI Caches",
      buttonClass:
        "bg-[rgba(155,89,182,0.15)] text-[#9B59B6] border-[rgba(155,89,182,0.3)] hover:bg-[rgba(155,89,182,0.25)]",
      confirmMsg:
        "This clears all AI-generated caches (briefs, feed items, voice corpus). Your knowledge captures, decisions, and life events are untouched. Continue?",
    },
    {
      id: "full_reset",
      label: "Full System Reset",
      description:
        "Wipe all app data. OAuth credentials and Ollama models are preserved.",
      detail: stats
        ? `${stats.knowledge_items} knowledge · ${stats.decisions} decisions · ${stats.life_events} life events · ${stats.tasks} tasks`
        : "—",
      buttonLabel: "Reset Everything",
      buttonClass:
        "bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.25)]",
      confirmMsg:
        "⚠️ This will permanently delete ALL app data including your knowledge captures, decisions, life events, tasks, and email cache.\n\nPreserved: Gmail/LinkedIn OAuth tokens, OAuth client credentials, vault path setting, and all Ollama models.\n\nThis cannot be undone. Continue?",
    },
  ];

  return (
    <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[rgba(239,68,68,0.1)] text-[#EF4444] border border-[rgba(239,68,68,0.2)]">
            <IconDatabase size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8]">
              Data Management
            </p>
            <p className="text-xs text-[#9AA4B2]">
              Cleanup cached messages and reset system data
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadStats}
          disabled={loadingStats}
          className="font-mono text-[10px] px-2.5 py-1 rounded-md bg-[#181E27] text-[#7A8492] border border-[#242B35] hover:text-[#F0F4F8] flex items-center gap-1 cursor-pointer disabled:opacity-40"
        >
          <IconRefresh
            size={11}
            className={loadingStats ? "animate-spin" : ""}
          />
          {loadingStats ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Action rows */}
      <div className="space-y-2.5">
        {ACTIONS.map((action) => (
          <div
            key={action.id}
            className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-[#181E27] border border-[#242B35]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F0F4F8] flex items-center gap-1.5">
                {action.id === "full_reset" && (
                  <IconAlertTriangle size={12} className="text-[#EF4444]" />
                )}
                {action.label}
              </p>
              <p className="text-[11px] text-[#7A8492] mt-0.5 leading-relaxed">
                {action.description}
              </p>
              <p className="font-mono text-[10px] text-[#4A5568] mt-1">
                {action.detail}
              </p>
            </div>
            <button
              type="button"
              disabled={working !== null}
              onClick={() => setConfirmTarget(action.id)}
              className={`font-mono text-[11px] px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer disabled:opacity-40 shrink-0 flex items-center gap-1.5 ${action.buttonClass}`}
            >
              {working === action.id ? (
                <>
                  <IconLoader2 size={11} className="animate-spin" /> Working…
                </>
              ) : (
                <>
                  <IconTrash size={11} /> {action.buttonLabel}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Result banner */}
      {result && (
        <div
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-mono ${
            result.type === "success"
              ? "bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)] text-[#34D399]"
              : "bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-[#EF4444]"
          }`}
        >
          {result.type === "success" ? (
            <IconCheck size={13} />
          ) : (
            <IconAlertTriangle size={13} />
          )}
          {result.msg}
        </div>
      )}

      {/* Preserved note */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[rgba(74,143,194,0.05)] border border-[rgba(74,143,194,0.12)]">
        <IconShield size={12} className="text-[#4A8FC2] mt-0.5 shrink-0" />
        <p className="text-[10px] text-[#4A5568] leading-relaxed">
          Gmail and LinkedIn OAuth tokens, your OAuth client credentials, vault
          path, and all Ollama model files are never touched by any cleanup
          action.
        </p>
      </div>

      {/* Confirm modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#0F1520] rounded-2xl border border-[#242B35] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center">
                <IconAlertTriangle size={18} className="text-[#EF4444]" />
              </div>
              <p className="text-sm font-semibold text-[#F0F4F8]">
                {ACTIONS.find((a) => a.id === confirmTarget)?.label}
              </p>
            </div>
            <p className="text-xs text-[#9AA4B2] leading-relaxed whitespace-pre-line">
              {ACTIONS.find((a) => a.id === confirmTarget)?.confirmMsg}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 px-4 py-2 rounded-xl bg-[#181E27] border border-[#242B35] text-[#9AA4B2] text-xs font-medium cursor-pointer hover:bg-[#1E2530] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => run(confirmTarget)}
                className="flex-1 px-4 py-2 rounded-xl bg-[rgba(239,68,68,0.2)] border border-[rgba(239,68,68,0.4)] text-[#EF4444] text-xs font-semibold cursor-pointer hover:bg-[rgba(239,68,68,0.3)] transition-colors"
              >
                Yes, proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Settings Component ──────────────────────────────────────────────────
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
    checkGmailStatus,
    showStatusMessage,
    getMorningHelperStatus,
    enableMorningHelper,
    disableMorningHelper,
  } = useQueueStore();

  const t = useTranslation();

  // Morning helper toggle state
  const [morningEnabled, setMorningEnabled] = useState<boolean | null>(null);
  const [morningWorking, setMorningWorking] = useState(false);

  useEffect(() => {
    getMorningHelperStatus().then(setMorningEnabled);
  }, []);

  const [vaultInput, setVaultInput] = useState(vaultPath || "");
  const [vaultSaved, setVaultSaved] = useState(false);

  // ── OAuth Credentials ── write-only: we never read back raw values from backend
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [linkedinClientId, setLinkedinClientId] = useState("");
  const [linkedinClientSecret, setLinkedinClientSecret] = useState("");
  const [oauthSaved, setOauthSaved] = useState(false);
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showLinkedinSecret, setShowLinkedinSecret] = useState(false);

  // Presence flags — returned by backend instead of raw values (SET-1 / CH-4)
  const [credStatus, setCredStatus] = useState({
    hasGoogleClientId: false,
    hasGoogleClientSecret: false,
    hasLinkedinClientId: false,
    hasLinkedinClientSecret: false,
    hasLinkedinToken: false,
  });

  const [disconnectingLinkedIn, setDisconnectingLinkedIn] = useState(false);

  useEffect(() => {
    const loadOAuthCreds = async () => {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const status = await invoke<{
            has_google_client_id: boolean;
            has_google_client_secret: boolean;
            has_linkedin_client_id: boolean;
            has_linkedin_client_secret: boolean;
            has_linkedin_token: boolean;
          }>("get_oauth_credentials_command");
          setCredStatus({
            hasGoogleClientId: status.has_google_client_id,
            hasGoogleClientSecret: status.has_google_client_secret,
            hasLinkedinClientId: status.has_linkedin_client_id,
            hasLinkedinClientSecret: status.has_linkedin_client_secret,
            hasLinkedinToken: status.has_linkedin_token,
          });
        } catch (e) {
          console.warn("Failed to load OAuth credential status:", e);
        }
      }
    };
    loadOAuthCreds();
  }, []);

  const handleDisconnectLinkedIn = async () => {
    if (!confirm("Disconnect LinkedIn? This will revoke your access token."))
      return;
    setDisconnectingLinkedIn(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("disconnect_linkedin_command");
      setCredStatus((s) => ({ ...s, hasLinkedinToken: false }));
      showStatusMessage("success", "LinkedIn disconnected and token revoked.");
    } catch (e) {
      showStatusMessage("error", "Failed to disconnect LinkedIn.");
    } finally {
      setDisconnectingLinkedIn(false);
    }
  };

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
  const [feedUrlError, setFeedUrlError] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);

  const validateFeedUrl = (url: string): string => {
    if (!url.trim()) return "";
    try {
      const parsed = new URL(url.trim());
      if (!parsed.protocol.startsWith("http"))
        return "URL must start with https:// or http://";
      if (!parsed.hostname.includes("."))
        return "URL must have a valid domain (e.g. example.com)";
      return "";
    } catch {
      return "Invalid URL — use format: https://example.com/feed.xml";
    }
  };

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
    checkGmailStatus();
    fetchModels();
  }, [checkAutoStartStatus, checkGmailStatus]);

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

      {/* Morning Notifications (LaunchAgent) */}
      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#181E27] text-[#E8A23D] border border-[#242B35]">
              <IconBell size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4F8]">
                Morning Notifications
              </p>
              <p className="text-xs text-[#9AA4B2]">
                Daily 8 AM brief — quote, learning topic &amp; pending
                reminders. Fires even when Wardyn is closed.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={morningWorking || morningEnabled === null}
            onClick={async () => {
              setMorningWorking(true);
              if (morningEnabled) {
                await disableMorningHelper();
                setMorningEnabled(false);
              } else {
                await enableMorningHelper();
                setMorningEnabled(true);
              }
              setMorningWorking(false);
            }}
            className={`font-mono text-xs px-3 py-1 rounded-md font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
              morningEnabled
                ? "bg-[rgba(52,211,153,0.15)] text-[#34D399] border border-[rgba(52,211,153,0.3)]"
                : "bg-[#181E27] text-[#7A8492] border border-[#242B35]"
            }`}
          >
            {morningWorking ? (
              <>
                <IconLoader2 size={12} className="animate-spin" /> Working…
              </>
            ) : morningEnabled === null ? (
              "Checking…"
            ) : morningEnabled ? (
              "Enabled"
            ) : (
              "Disabled"
            )}
          </button>
        </div>
        {morningEnabled && (
          <p className="font-mono text-[10px] text-[#4A5568]">
            ✓ LaunchAgent installed — fires at 08:00 daily via macOS launchd.
            Log: ~/Library/Logs/Wardyn/wardyn_morning.log
          </p>
        )}
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
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-[#7A8492] uppercase">
                Google OAuth App
              </p>
              {credStatus.hasGoogleClientId &&
                credStatus.hasGoogleClientSecret && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(52,211,153,0.1)] text-[#34D399] border border-[rgba(52,211,153,0.25)]">
                    ✓ Configured
                  </span>
                )}
            </div>
            <div className="text-[10px] text-[#5D6A7A] font-mono mb-1">
              Create a project → OAuth 2.0 Client ID → Desktop app type → add{" "}
              <span className="text-[#4A8FC2]">http://127.0.0.1:14220</span> as
              redirect URI
            </div>
            <input
              type="text"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder={
                credStatus.hasGoogleClientId
                  ? "✓ Stored — enter new value to replace"
                  : "your-client-id.apps.googleusercontent.com"
              }
              className={`w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border focus:outline-none focus:border-[#4A8FC2] ${credStatus.hasGoogleClientId && !googleClientId ? "border-[rgba(52,211,153,0.3)] placeholder-[#34D399]" : "border-[#242B35]"}`}
            />
            <div className="relative">
              <input
                type={showGoogleSecret ? "text" : "password"}
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder={
                  credStatus.hasGoogleClientSecret
                    ? "✓ Stored — enter new value to replace"
                    : "Google Client Secret"
                }
                className={`w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 pr-9 rounded-lg border focus:outline-none focus:border-[#4A8FC2] ${credStatus.hasGoogleClientSecret && !googleClientSecret ? "border-[rgba(52,211,153,0.3)] placeholder-[#34D399]" : "border-[#242B35]"}`}
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
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-[#7A8492] uppercase">
                LinkedIn OAuth App
              </p>
              <div className="flex items-center gap-2">
                {credStatus.hasLinkedinToken && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(52,211,153,0.1)] text-[#34D399] border border-[rgba(52,211,153,0.25)]">
                    ✓ Connected
                  </span>
                )}
                {credStatus.hasLinkedinToken && (
                  <button
                    type="button"
                    onClick={handleDisconnectLinkedIn}
                    disabled={disconnectingLinkedIn}
                    className="font-mono text-[9px] px-2 py-0.5 rounded bg-[rgba(239,68,68,0.1)] text-[#EF4444] border border-[rgba(239,68,68,0.25)] hover:bg-[rgba(239,68,68,0.2)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {disconnectingLinkedIn ? "Revoking…" : "Disconnect"}
                  </button>
                )}
              </div>
            </div>
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
              placeholder={
                credStatus.hasLinkedinClientId
                  ? "✓ Stored — enter new value to replace"
                  : "LinkedIn Client ID"
              }
              className={`w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border focus:outline-none focus:border-[#4A8FC2] ${credStatus.hasLinkedinClientId && !linkedinClientId ? "border-[rgba(52,211,153,0.3)] placeholder-[#34D399]" : "border-[#242B35]"}`}
            />
            <div className="relative">
              <input
                type={showLinkedinSecret ? "text" : "password"}
                value={linkedinClientSecret}
                onChange={(e) => setLinkedinClientSecret(e.target.value)}
                placeholder={
                  credStatus.hasLinkedinClientSecret
                    ? "✓ Stored — enter new value to replace"
                    : "LinkedIn Client Secret"
                }
                className={`w-full bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 pr-9 rounded-lg border focus:outline-none focus:border-[#4A8FC2] ${credStatus.hasLinkedinClientSecret && !linkedinClientSecret ? "border-[rgba(52,211,153,0.3)] placeholder-[#34D399]" : "border-[#242B35]"}`}
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
            const urlErr = validateFeedUrl(newFeedUrl);
            if (urlErr) {
              setFeedUrlError(urlErr);
              return;
            }
            if (!newFeedTitle.trim() || !newFeedUrl.trim()) return;
            setFeedUrlError("");
            setAddingFeed(true);
            await addCustomFeed(newFeedTitle.trim(), newFeedUrl.trim());
            setNewFeedTitle("");
            setNewFeedUrl("");
            setAddingFeed(false);
          }}
          className="relative flex gap-2 items-start pb-5"
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
            onChange={(e) => {
              setNewFeedUrl(e.target.value);
              if (feedUrlError)
                setFeedUrlError(validateFeedUrl(e.target.value));
            }}
            onBlur={(e) => setFeedUrlError(validateFeedUrl(e.target.value))}
            placeholder="Feed URL (https://paulgraham.com/rss.html)"
            className={`flex-1 bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-3 py-2 rounded-lg border focus:outline-none transition-colors ${
              feedUrlError
                ? "border-red-500/60 focus:border-red-500"
                : "border-[#242B35] focus:border-[#4A8FC2]"
            }`}
            required
          />
          {feedUrlError && (
            <p className="absolute top-full left-0 mt-1 text-[10px] text-red-400 font-mono">
              {feedUrlError}
            </p>
          )}
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

      {/* ── Data Management ── */}
      <DataManagementSection />

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
