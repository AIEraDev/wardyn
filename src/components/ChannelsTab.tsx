import React, { useEffect, useState } from "react";
import {
  IconMail,
  IconCalendar,
  IconBrandLinkedin,
  IconPlugConnected,
  IconPlus,
  IconCheck,
  IconSearch,
  IconAlertTriangle,
  IconSettings,
  IconLoader2,
  IconRefresh,
  IconClock,
  IconBug,
} from "@tabler/icons-react";
import { useQueueStore } from "../store/useQueueStore";

const ICON_MAP: Record<string, React.ElementType> = {
  IconMail,
  IconCalendar,
  IconBrandLinkedin,
};

export const ChannelsTab: React.FC = () => {
  const {
    channels,
    disconnectChannel,
    connectGmail,
    disconnectGmail,
    gmailAccounts,
    connectLinkedIn,
    setActiveTab,
    checkGmailStatus,
    gmailSyncStatus,
    gmailSyncError,
    lastGmailSync,
    syncGmail,
    diagnoseGmailCredentials,
  } = useQueueStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Credential presence state — checked on mount
  const [hasGoogleCred, setHasGoogleCred] = useState<boolean | null>(null);
  const [hasLinkedInCreds, setHasLinkedInCreds] = useState<boolean | null>(
    null,
  );

  // Credential diagnostic state
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<string[] | null>(null);

  useEffect(() => {
    const checkCreds = async () => {
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
        return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const creds = await invoke<{
          google_client_id: string | null;
          google_client_secret: string | null;
          linkedin_client_id: string | null;
          linkedin_client_secret: string | null;
        }>("get_oauth_credentials_command");
        setHasGoogleCred(
          !!creds.google_client_id?.trim() &&
            !!creds.google_client_secret?.trim(),
        );
        setHasLinkedInCreds(
          !!creds.linkedin_client_id?.trim() &&
            !!creds.linkedin_client_secret?.trim(),
        );
      } catch {
        setHasGoogleCred(false);
        setHasLinkedInCreds(false);
      }
    };
    checkCreds();
    // Always refresh Gmail connection state on mount
    checkGmailStatus();
  }, [checkGmailStatus]);

  const handleConnect = async (channelId: string) => {
    setErrors((e) => ({ ...e, [channelId]: "" }));

    // Pre-flight validation with clear messaging
    if (channelId === "gmail" && hasGoogleCred === false) {
      setErrors((e) => ({
        ...e,
        gmail:
          "Google Client ID & Secret not configured. Add them in Settings → OAuth Credentials.",
      }));
      return;
    }
    if (channelId === "linkedin" && hasLinkedInCreds === false) {
      setErrors((e) => ({
        ...e,
        linkedin:
          "LinkedIn Client ID & Secret not configured. Add them in Settings → OAuth Credentials.",
      }));
      return;
    }

    setConnecting(channelId);
    // Safety timeout — never leave button stuck longer than 3 minutes
    const timeout = setTimeout(() => setConnecting(null), 180_000);
    try {
      if (channelId === "gmail") await connectGmail();
      if (channelId === "linkedin") await connectLinkedIn();

      // Re-check credential presence so the UI refreshes correctly after auth
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const creds = await invoke<{
          google_client_id: string | null;
          google_client_secret: string | null;
          linkedin_client_id: string | null;
          linkedin_client_secret: string | null;
        }>("get_oauth_credentials_command");
        setHasGoogleCred(
          !!creds.google_client_id?.trim() &&
            !!creds.google_client_secret?.trim(),
        );
        setHasLinkedInCreds(
          !!creds.linkedin_client_id?.trim() &&
            !!creds.linkedin_client_secret?.trim(),
        );
      }
    } catch (err: any) {
      setErrors((e) => ({
        ...e,
        [channelId]: err?.toString() ?? "Connection failed",
      }));
    } finally {
      clearTimeout(timeout);
      setConnecting(null);
    }
  };

  // Format last sync time for display
  const formatLastSync = (iso: string | null): string => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  const handleDiagnose = async () => {
    setDiagRunning(true);
    setDiagResults(null);
    try {
      const results = await diagnoseGmailCredentials();
      setDiagResults(results);
    } catch (err: any) {
      setDiagResults([
        `Diagnostic failed: ${err?.toString() ?? "unknown error"}`,
      ]);
    } finally {
      setDiagRunning(false);
    }
  };

  const filteredChannels = channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">
            Channel Directory
          </h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">
            Connected integrations & OAuth bridges
          </p>
        </div>
        <span className="font-mono text-xs bg-[#151A21] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[rgba(74,143,194,0.3)]">
          {channels.filter((c) => c.status === "connected").length} Connected
        </span>
      </div>

      {/* Search */}
      <div className="relative w-56 mb-5">
        <IconSearch
          size={14}
          className="absolute left-2.5 top-2.5 text-[#7A8492]"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search channels..."
          className="w-full bg-[#151A21] text-xs text-[#F0F4F8] pl-8 pr-3 py-1.5 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredChannels.map((channel) => {
          const Icon = ICON_MAP[channel.iconName] || IconPlugConnected;
          const isConnected = channel.status === "connected";
          const isGmail = channel.id === "gmail";
          const isCalendar = channel.id === "calendar";
          const isLinkedIn = channel.id === "linkedin";
          const isConnecting = connecting === channel.id;
          const error = errors[channel.id];

          // Credential warning
          const missingCreds =
            (isGmail && hasGoogleCred === false) ||
            (isLinkedIn && hasLinkedInCreds === false);

          return (
            <div
              key={channel.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isConnected
                  ? "bg-[#151A21] border-[rgba(74,143,194,0.4)] shadow-[0_0_12px_rgba(74,143,194,0.08)]"
                  : missingCreds
                    ? "bg-[#181E27] border-[rgba(232,162,61,0.3)]"
                    : "bg-[#181E27] border-[#242B35] hover:border-[#384352]"
              }`}
            >
              <div>
                {/* Icon + title + badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg ${
                        isConnected
                          ? "bg-[rgba(74,143,194,0.16)] text-[#4A8FC2]"
                          : missingCreds
                            ? "bg-[rgba(232,162,61,0.1)] text-[#E8A23D]"
                            : "bg-[#151A21] text-[#7A8492]"
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F0F4F8] m-0">
                        {channel.name}
                      </h3>
                      <span className="font-mono text-[10px] text-[#7A8492] uppercase">
                        {channel.category}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                      isConnected
                        ? "bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)]"
                        : missingCreds
                          ? "bg-[rgba(232,162,61,0.1)] text-[#E8A23D] border border-[rgba(232,162,61,0.3)]"
                          : "bg-[#151A21] text-[#7A8492] border border-[#242B35]"
                    }`}
                  >
                    {isGmail && isConnected
                      ? `${gmailAccounts.length} Account${gmailAccounts.length !== 1 ? "s" : ""}`
                      : isCalendar
                        ? "Auto-Synced"
                        : isConnected
                          ? "Active"
                          : missingCreds
                            ? "Setup Required"
                            : "Available"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-[#9AA4B2] leading-relaxed mb-3">
                  {channel.description}
                </p>

                {/* Gmail connected inboxes */}
                {isGmail && gmailAccounts.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    <p className="font-mono text-[10px] text-[#7A8492] uppercase m-0">
                      Connected Inboxes:
                    </p>
                    {gmailAccounts.map((acc) => (
                      <div
                        key={acc}
                        className="flex items-center justify-between bg-[#181E27] p-2 rounded border border-[#242B35]"
                      >
                        <span className="font-mono text-[11px] text-[#4A8FC2] truncate mr-2">
                          {acc}
                        </span>
                        <button
                          type="button"
                          onClick={() => disconnectGmail(acc)}
                          className="font-mono text-[10px] text-[#E8A23D] hover:underline shrink-0 cursor-pointer"
                        >
                          Disconnect
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Gmail sync status bar */}
                {isGmail && (
                  <>
                    {gmailSyncStatus === "connecting" && (
                      <div className="flex items-center gap-2 bg-[rgba(74,143,194,0.08)] border border-[rgba(74,143,194,0.2)] rounded-lg px-3 py-2 mb-3">
                        <IconLoader2
                          size={12}
                          className="text-[#4A8FC2] animate-spin shrink-0"
                        />
                        <p className="text-[11px] text-[#4A8FC2] m-0">
                          Waiting for browser authentication…
                        </p>
                      </div>
                    )}
                    {gmailSyncStatus === "syncing" && (
                      <div className="flex items-center gap-2 bg-[rgba(74,143,194,0.08)] border border-[rgba(74,143,194,0.2)] rounded-lg px-3 py-2 mb-3">
                        <IconLoader2
                          size={12}
                          className="text-[#4A8FC2] animate-spin shrink-0"
                        />
                        <p className="text-[11px] text-[#4A8FC2] m-0">
                          Syncing inbox &amp; triaging with AI…
                        </p>
                      </div>
                    )}
                    {gmailSyncStatus === "error" && gmailSyncError && (
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2">
                          <IconAlertTriangle
                            size={12}
                            className="text-[#EF4444] mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-[#EF4444] m-0 leading-snug break-words">
                              {gmailSyncError}
                            </p>
                            {/* Reconnect shortcut for session-lost errors */}
                            {(gmailSyncError.includes("session lost") ||
                              gmailSyncError.includes("reconnect") ||
                              gmailSyncError.includes("expired")) &&
                              gmailAccounts.length === 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleConnect("gmail")}
                                  disabled={connecting === "gmail"}
                                  className="mt-1.5 font-mono text-[10px] text-[#4A8FC2] hover:underline cursor-pointer bg-transparent border-0 p-0 disabled:opacity-50"
                                >
                                  → Re-authenticate Gmail
                                </button>
                              )}
                          </div>
                        </div>
                        {/* Diagnose button — shown on any error */}
                        <button
                          type="button"
                          onClick={handleDiagnose}
                          disabled={diagRunning}
                          className="w-full py-1 text-[10px] font-mono text-[#4A5568] hover:text-[#7A8492] flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-0 disabled:opacity-50"
                        >
                          {diagRunning ? (
                            <IconLoader2 size={10} className="animate-spin" />
                          ) : (
                            <IconBug size={10} />
                          )}
                          {diagRunning
                            ? "Running diagnostic…"
                            : "Run credential diagnostic"}
                        </button>
                      </div>
                    )}
                    {/* Diagnostic results panel */}
                    {diagResults && (
                      <div className="mb-3 bg-[#0D1117] border border-[#242B35] rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[9px] text-[#4A5568] uppercase tracking-wider">
                            Credential Diagnostic
                          </span>
                          <button
                            type="button"
                            onClick={() => setDiagResults(null)}
                            className="font-mono text-[9px] text-[#4A5568] hover:text-[#7A8492] cursor-pointer bg-transparent border-0 p-0"
                          >
                            dismiss
                          </button>
                        </div>
                        {diagResults.map((line, i) => {
                          const isMissing = line.includes("MISSING");
                          const isOk = line.includes("✓ present") && !isMissing;
                          return (
                            <p
                              key={i}
                              className={`font-mono text-[10px] m-0 leading-relaxed break-all ${
                                isMissing
                                  ? "text-[#EF4444]"
                                  : isOk
                                    ? "text-[#34D399]"
                                    : "text-[#7A8492]"
                              }`}
                            >
                              {line}
                            </p>
                          );
                        })}
                        {diagResults.some((l) => l.includes("MISSING")) && (
                          <p className="font-mono text-[10px] text-[#E8A23D] mt-1.5 m-0 border-t border-[#1A1F27] pt-1.5">
                            → Tokens missing from storage. Click "Connect Gmail
                            OAuth" to re-authenticate.
                          </p>
                        )}
                      </div>
                    )}
                    {gmailSyncStatus === "idle" && gmailAccounts.length > 0 && (
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4A5568]">
                          <IconClock size={11} />
                          Last sync: {formatLastSync(lastGmailSync)}
                        </div>
                        <button
                          type="button"
                          onClick={() => syncGmail()}
                          disabled={gmailSyncStatus !== "idle"}
                          className="font-mono text-[10px] text-[#4A8FC2] hover:text-[#5b9bd1] flex items-center gap-1 disabled:opacity-50 cursor-pointer bg-transparent border-0 p-0"
                        >
                          <IconRefresh size={11} /> Sync now
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* LinkedIn account label */}
                {isLinkedIn && channel.accountLabel && (
                  <p className="font-mono text-[11px] text-[#4A8FC2] mb-3 truncate">
                    • {channel.accountLabel}
                  </p>
                )}

                {/* Inline missing-creds warning */}
                {missingCreds && !isConnected && (
                  <div className="flex items-start gap-2 bg-[rgba(232,162,61,0.07)] border border-[rgba(232,162,61,0.2)] rounded-lg px-3 py-2 mb-3">
                    <IconAlertTriangle
                      size={13}
                      className="text-[#E8A23D] mt-0.5 shrink-0"
                    />
                    <p className="text-[11px] text-[#E8A23D] leading-snug">
                      {isGmail
                        ? "Add your Google Client ID in Settings → OAuth Credentials before connecting."
                        : "Add your LinkedIn Client ID & Secret in Settings → OAuth Credentials before connecting."}
                    </p>
                  </div>
                )}

                {/* Inline error from failed connect attempt */}
                {error && (
                  <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2 mb-3">
                    <IconAlertTriangle
                      size={13}
                      className="text-[#EF4444] mt-0.5 shrink-0"
                    />
                    <p className="text-[11px] text-[#EF4444] leading-snug break-words">
                      {error}
                    </p>
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="pt-2 border-t border-[#242B35]">
                {isCalendar ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#4A8FC2]">
                    <IconCheck size={13} /> Synced automatically via Gmail OAuth
                  </div>
                ) : missingCreds && !isConnected ? (
                  /* Missing creds — show "Go to Settings" shortcut */
                  <button
                    type="button"
                    onClick={() => (setActiveTab as any)("settings")}
                    className="w-full py-1.5 text-xs font-medium text-[#E8A23D] bg-[rgba(232,162,61,0.08)] border border-[rgba(232,162,61,0.3)] rounded-lg hover:bg-[rgba(232,162,61,0.15)] transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono"
                  >
                    <IconSettings size={14} /> Go to OAuth Credentials Setup
                  </button>
                ) : isGmail ? (
                  <button
                    type="button"
                    onClick={() => handleConnect("gmail")}
                    disabled={
                      isConnecting ||
                      gmailSyncStatus === "connecting" ||
                      gmailSyncStatus === "syncing"
                    }
                    className="w-full py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.3)] rounded-lg hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono disabled:opacity-50"
                  >
                    {gmailSyncStatus === "connecting" ? (
                      <>
                        <IconLoader2 size={14} className="animate-spin" />{" "}
                        Authenticating in browser…
                      </>
                    ) : gmailSyncStatus === "syncing" &&
                      gmailAccounts.length > 0 ? (
                      <>
                        <IconLoader2 size={14} className="animate-spin" />{" "}
                        Syncing inbox…
                      </>
                    ) : isConnecting ? (
                      <span className="animate-pulse">Opening browser...</span>
                    ) : (
                      <>
                        <IconPlus size={14} />
                        {gmailAccounts.length > 0
                          ? "Connect Another Gmail Account"
                          : "Connect Gmail OAuth"}
                      </>
                    )}
                  </button>
                ) : isLinkedIn ? (
                  isConnected ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#4A8FC2] font-mono flex items-center gap-1">
                        <IconCheck size={13} /> Connected
                      </span>
                      <button
                        type="button"
                        onClick={() => disconnectChannel("linkedin")}
                        className="font-mono text-[11px] text-[#E8A23D] hover:underline cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect("linkedin")}
                      disabled={isConnecting}
                      className="w-full py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.3)] rounded-lg hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <span className="animate-pulse">
                          Opening browser...
                        </span>
                      ) : (
                        <>
                          <IconPlus size={14} /> Connect LinkedIn OAuth
                        </>
                      )}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
