import React, { useState, useEffect, useCallback } from "react";
import {
  IconX,
  IconBrain,
  IconCheck,
  IconLoader2,
  IconExternalLink,
  IconTerminal2,
  IconAlertTriangle,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
}

type Step =
  | "checking"
  | "not-installed"
  | "not-running"
  | "starting"
  | "ready"
  | "error";

interface OllamaSetupModalProps {
  modelId: string;
  modelName: string;
  onProceed: (modelId: string) => void; // called when Ollama is confirmed running
  onClose: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function invokeCheckOllamaStatus(): Promise<OllamaStatus | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<OllamaStatus>("check_ollama_status_command");
  } catch {
    return null;
  }
}

async function invokeStartOllama(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("start_ollama_command");
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function openUrl(url: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external_url", { url });
  } catch {
    window.open(url, "_blank");
  }
}

// ─── Step Visuals ──────────────────────────────────────────────────────────────

const steps = [
  { id: 1, label: "Install Ollama" },
  { id: 2, label: "Start Service" },
  { id: 3, label: "Download Model" },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export const OllamaSetupModal: React.FC<OllamaSetupModalProps> = ({
  modelId,
  modelName,
  onProceed,
  onClose,
}) => {
  const [step, setStep] = useState<Step>("checking");
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // ── Check status ─────────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    setStep("checking");
    const status = await invokeCheckOllamaStatus();
    if (!status) {
      setStep("error");
      return;
    }
    if (status.installed && status.running) {
      setOllamaVersion(status.version ?? null);
      setStep("ready");
    } else if (!status.installed) {
      setStep("not-installed");
    } else {
      // installed but not running
      setOllamaVersion(status.version ?? null);
      setStep("not-running");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ── Auto-proceed when ready ──────────────────────────────────────────────────
  useEffect(() => {
    if (step === "ready") {
      const t = setTimeout(() => {
        onProceed(modelId);
        onClose();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [step, modelId, onProceed, onClose]);

  // ── Poll after starting Ollama ───────────────────────────────────────────────
  useEffect(() => {
    if (step !== "starting") return;
    const interval = setInterval(async () => {
      const status = await invokeCheckOllamaStatus();
      if (status?.running) {
        clearInterval(interval);
        setOllamaVersion(status.version ?? null);
        setStep("ready");
      }
      setPollCount((c) => {
        const next = c + 1;
        // Timeout after 30s (15 polls × 2s) — stop spinning, show actionable error
        if (next >= 15) {
          clearInterval(interval);
          setStartError(
            "Ollama did not respond after 30s. Try running 'ollama serve' in a terminal.",
          );
          setStep("not-running");
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [step]);

  // ── Handle start Ollama ──────────────────────────────────────────────────────
  const handleStartOllama = async () => {
    setStartError(null);
    const result = await invokeStartOllama();
    if (result.ok) {
      setStep("starting");
      setPollCount(0);
    } else {
      const reason = result.error
        ? result.error.includes("not found") ||
          result.error.includes("No such file")
          ? "Ollama binary not found. Download it from ollama.com/download first."
          : `Could not launch Ollama: ${result.error}`
        : "Could not launch Ollama. Please start it manually: ollama serve";
      setStartError(reason);
    }
  };

  // ── Active wizard step number ────────────────────────────────────────────────
  const activeStepNum =
    step === "not-installed"
      ? 1
      : step === "not-running" || step === "starting"
        ? 2
        : 3;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-[480px] bg-[#151A21] border border-[#242B35] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden animate-[modalIn_0.25s_ease]">
        {/* Top gradient bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-[#4A8FC2] via-[#34D399] to-[#4A8FC2]" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[rgba(74,143,194,0.25)] to-[rgba(74,143,194,0.08)] border border-[rgba(74,143,194,0.3)] flex items-center justify-center text-[#4A8FC2]">
              <IconBrain size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F0F4F8] m-0 leading-tight">
                Set Up Local AI
              </h2>
              <p className="text-[11px] text-[#7A8492] mt-0.5 m-0">
                Installing{" "}
                <span className="text-[#4A8FC2] font-medium">{modelName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#9AA4B2] hover:text-[#F0F4F8] flex items-center justify-center cursor-pointer transition-colors"
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Step Tracker */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-0">
            {steps.map((s, i) => {
              const done = s.id < activeStepNum || step === "ready";
              const active = s.id === activeStepNum && step !== "ready";
              return (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                        done
                          ? "bg-[#34D399] border-[#34D399] text-black"
                          : active
                            ? "bg-[rgba(74,143,194,0.2)] border-[#4A8FC2] text-[#4A8FC2]"
                            : "bg-[#0B0E13] border-[#242B35] text-[#5D6A7A]"
                      }`}
                    >
                      {done ? <IconCheck size={13} /> : s.id}
                    </div>
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider whitespace-nowrap ${
                        done
                          ? "text-[#34D399]"
                          : active
                            ? "text-[#4A8FC2]"
                            : "text-[#5D6A7A]"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-2 mb-5 transition-colors ${
                        s.id < activeStepNum || step === "ready"
                          ? "bg-[#34D399]"
                          : "bg-[#242B35]"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1D2535] mx-5" />

        {/* Body */}
        <div className="px-5 py-5 space-y-4 min-h-[200px] flex flex-col justify-center">
          {/* ── Checking ── */}
          {step === "checking" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <IconLoader2 size={28} className="text-[#4A8FC2] animate-spin" />
              <p className="text-sm text-[#9AA4B2] text-center m-0">
                Checking Ollama installation…
              </p>
            </div>
          )}

          {/* ── Not Installed ── */}
          {step === "not-installed" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[rgba(74,143,194,0.07)] border border-[rgba(74,143,194,0.2)]">
                <p className="text-xs font-semibold text-[#F0F4F8] m-0 mb-1">
                  What is Ollama?
                </p>
                <p className="text-[11px] text-[#9AA4B2] m-0 leading-relaxed">
                  Ollama is a free, open-source runtime that lets you run AI
                  models 100% locally — no internet connection needed after
                  download, no data leaves your device.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#9AA4B2] uppercase tracking-wider m-0">
                  Installation steps
                </p>
                {[
                  {
                    n: 1,
                    text: "Download Ollama from the official site (free, ~60 MB)",
                  },
                  { n: 2, text: "Run the installer — takes under a minute" },
                  {
                    n: 3,
                    text: 'Come back here and click "I\'ve Installed Ollama"',
                  },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-[rgba(74,143,194,0.15)] border border-[rgba(74,143,194,0.3)] flex items-center justify-center text-[10px] font-bold text-[#4A8FC2]">
                      {n}
                    </span>
                    <p className="text-[11px] text-[#9AA4B2] m-0 leading-relaxed">
                      {text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => openUrl("https://ollama.com/download")}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#4A8FC2] hover:bg-[#5b9bd1] text-black font-semibold text-xs cursor-pointer transition-colors"
                >
                  <IconExternalLink size={14} />
                  Download Ollama
                </button>
                <button
                  onClick={checkStatus}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1D2535] hover:bg-[#242B35] text-[#F0F4F8] font-semibold text-xs cursor-pointer transition-colors border border-[#242B35]"
                >
                  <IconCheck size={14} />
                  I've Installed Ollama
                </button>
              </div>
            </div>
          )}

          {/* ── Installed but not running ── */}
          {step === "not-running" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[rgba(232,162,61,0.08)] border border-[rgba(232,162,61,0.25)] flex items-start gap-3">
                <IconAlertTriangle
                  size={16}
                  className="text-[#E8A23D] shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-xs font-semibold text-[#E8A23D] m-0 mb-0.5">
                    Ollama is installed but not running
                  </p>
                  <p className="text-[11px] text-[#9AA4B2] m-0 leading-relaxed">
                    {ollamaVersion && (
                      <span className="text-[#7A8492]">{ollamaVersion} · </span>
                    )}
                    The Ollama service needs to be active to download and run
                    models.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0B0E13] border border-[#242B35] space-y-2">
                <p className="text-[10px] font-mono text-[#7A8492] uppercase tracking-wider m-0">
                  Option A — Auto start
                </p>
                <button
                  onClick={handleStartOllama}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#4A8FC2] hover:bg-[#5b9bd1] text-black font-semibold text-xs cursor-pointer transition-colors"
                >
                  <IconPlayerPlay size={14} />
                  Start Ollama Now
                </button>
                <p className="text-[10px] font-mono text-[#7A8492] uppercase tracking-wider m-0 pt-1">
                  Option B — Manual
                </p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#151A21] border border-[#242B35]">
                  <IconTerminal2
                    size={12}
                    className="text-[#7A8492] shrink-0"
                  />
                  <code className="text-[11px] font-mono text-[#34D399]">
                    ollama serve
                  </code>
                </div>
                <p className="text-[10px] text-[#5D6A7A] m-0">
                  Then click "Check Again" below.
                </p>
              </div>

              {startError && (
                <p className="text-[11px] text-[#EF4444] m-0 leading-relaxed">
                  ⚠ {startError}
                </p>
              )}

              <button
                onClick={checkStatus}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1D2535] hover:bg-[#242B35] text-[#9AA4B2] hover:text-[#F0F4F8] text-xs font-mono cursor-pointer transition-colors border border-[#242B35]"
              >
                <IconRefresh size={13} />
                Check Again
              </button>
            </div>
          )}

          {/* ── Starting (polling) ── */}
          {step === "starting" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(74,143,194,0.1)] border border-[rgba(74,143,194,0.25)] flex items-center justify-center">
                  <IconLoader2
                    size={24}
                    className="text-[#4A8FC2] animate-spin"
                  />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E8A23D] animate-pulse border-2 border-[#151A21]" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-[#F0F4F8] m-0">
                  Starting Ollama…
                </p>
                <p className="text-[11px] text-[#7A8492] m-0">
                  Waiting for service to become ready
                  {".".repeat((pollCount % 3) + 1)}
                </p>
              </div>
              {pollCount > 10 && (
                <div className="w-full p-3 rounded-lg bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)]">
                  <p className="text-[11px] text-[#EF4444] m-0 text-center">
                    Taking longer than expected. You can try running{" "}
                    <code className="font-mono text-xs bg-[#0B0E13] px-1 rounded">
                      ollama serve
                    </code>{" "}
                    manually.
                  </p>
                </div>
              )}
              <button
                onClick={checkStatus}
                className="text-[11px] text-[#5D6A7A] hover:text-[#9AA4B2] cursor-pointer transition-colors flex items-center gap-1 mt-1"
              >
                <IconRefresh size={11} /> Check manually
              </button>
            </div>
          )}

          {/* ── Ready ── */}
          {step === "ready" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-2xl bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] flex items-center justify-center">
                <IconCheck size={28} className="text-[#34D399]" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-[#34D399] m-0">
                  Ollama is ready!
                </p>
                <p className="text-[11px] text-[#7A8492] m-0">
                  Starting download of {modelName}…
                </p>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.25)] flex items-start gap-3">
                <IconAlertTriangle
                  size={16}
                  className="text-[#EF4444] shrink-0 mt-0.5"
                />
                <p className="text-[11px] text-[#EF4444] m-0 leading-relaxed">
                  Unable to check Ollama status. Make sure the app has the
                  necessary permissions, then try again.
                </p>
              </div>
              <button
                onClick={checkStatus}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1D2535] hover:bg-[#242B35] text-[#F0F4F8] text-xs font-semibold cursor-pointer transition-colors border border-[#242B35]"
              >
                <IconRefresh size={13} /> Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          <p className="text-[10px] text-[#3D4A5C] text-center m-0">
            Ollama runs 100% locally · No data is sent to external servers ·
            Free &amp; open source
          </p>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
};
