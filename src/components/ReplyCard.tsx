import React, { useState, useEffect, useRef } from "react";
import {
  IconMail,
  IconCheck,
  IconAlertCircle,
  IconSparkles,
  IconCheckbox,
  IconBell,
  IconClock,
  IconLoader2,
} from "@tabler/icons-react";
import { QueueItem } from "../types/queue";
import { useQueueStore } from "../store/useQueueStore";
import { ConfirmModal } from "./ConfirmModal";

interface ReplyCardProps {
  item: QueueItem;
}

export const ReplyCard: React.FC<ReplyCardProps> = ({ item }) => {
  const {
    approveItem,
    skipItem,
    regenerateDraft,
    createTaskFromItem,
    createReminder,
    tasks,
  } = useQueueStore();
  const ollamaModels = useQueueStore((s) => s.ollamaModels);
  const ollamaChecked = useQueueStore((s) => s.ollamaChecked);
  const aiOnline = ollamaChecked && ollamaModels.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState(item.draft_text || "");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState(
    `Follow up with ${item.sender}`,
  );
  const [regenerating, setRegenerating] = useState(false);
  const [sendCountdown, setSendCountdown] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSendRef = useRef<{ id: string; draft?: string } | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, []);

  const triggerSendWithUndo = (id: string, draft?: string) => {
    pendingSendRef.current = { id, draft };
    setSendCountdown(4);
    undoTimerRef.current = setInterval(() => {
      setSendCountdown((prev) => {
        if (prev === null || prev <= 1) {
          // Timer done — actually send
          clearInterval(undoTimerRef.current!);
          undoTimerRef.current = null;
          const pending = pendingSendRef.current;
          if (pending) {
            approveItem(pending.id, pending.draft);
            pendingSendRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleUndoSend = () => {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    undoTimerRef.current = null;
    pendingSendRef.current = null;
    setSendCountdown(null);
  };

  const hasLinkedTask = tasks.some((t) => t.source_item_id === item.id);

  const isLowConfidence = item.confidence < 0.6;
  const isDone =
    item.status === "sent" ||
    item.status === "approved" ||
    item.status === "edited";
  const isSkipped = item.status === "skipped";

  const handleApproveClick = () => {
    if (isLowConfidence && (!editedDraft || editedDraft.trim().length === 0)) {
      setIsEditing(true);
      return;
    }

    if (item.flagged) {
      setShowConfirmModal(true);
    } else {
      const draft = isEditing || isLowConfidence ? editedDraft : undefined;
      triggerSendWithUndo(item.id, draft);
      setIsEditing(false);
    }
  };

  const handleConfirmedApprove = () => {
    setShowConfirmModal(false);
    const draft = isEditing || isLowConfidence ? editedDraft : undefined;
    triggerSendWithUndo(item.id, draft);
    setIsEditing(false);
  };

  const handleToneRegenerate = async (
    tone: "shorter" | "formal" | "availability",
  ) => {
    if (regenerating) return; // guard: ignore rapid clicks
    setRegenerating(true);
    await regenerateDraft(item.id, tone); // properly awaited — no stale reads
    // Read state AFTER the async action resolves to get the updated draft
    const updated = useQueueStore
      .getState()
      .items.find((i) => i.id === item.id);
    if (updated?.draft_text) {
      setEditedDraft(updated.draft_text);
    }
    setRegenerating(false);
  };

  const handleCreateTask = async () => {
    const subject =
      item.preview.length > 60
        ? `${item.preview.slice(0, 57)}...`
        : item.preview;
    await createTaskFromItem(
      item.id,
      `Reply: ${subject}`,
      `From ${item.sender}`,
    );
  };

  const handleSetFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpDate || !followUpMessage.trim()) return;
    const scheduledAt = new Date(followUpDate);
    if (scheduledAt.getTime() <= Date.now()) {
      useQueueStore
        .getState()
        .showStatusMessage(
          "error",
          "Reminder must be scheduled in the future.",
        );
      return;
    }
    await createReminder(
      item.id,
      scheduledAt.toISOString(),
      followUpMessage.trim(),
    );
    setShowFollowUp(false);
    setFollowUpDate("");
  };

  if (isSkipped) return null;

  return (
    <>
      <div
        className={`rcard p-5 mb-4 rounded-xl border transition-all duration-200 ${
          isDone
            ? "opacity-50 bg-[#151A21] border-[#242B35]"
            : "bg-[#181E27] border-[#242B35] hover:border-[#384352]"
        }`}
      >
        {/* Badges Bar */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#151A21] text-[#9AA4B2] border border-[#242B35] flex items-center gap-1">
            <IconMail size={13} />
            Gmail
          </span>

          {item.flagged && (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[rgba(232,162,61,0.15)] text-[#E8A23D] font-medium border border-[rgba(232,162,61,0.3)] flex items-center gap-1">
              ⚑ Flagged
            </span>
          )}

          <span
            className={`font-mono text-[11px] ml-auto px-2 py-0.5 rounded ${
              isLowConfidence
                ? "bg-[rgba(232,162,61,0.15)] text-[#E8A23D] font-medium"
                : "text-[#7A8492]"
            }`}
          >
            {(item.confidence * 100).toFixed(0)}% confidence
          </span>
          {!aiOnline && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)] font-semibold uppercase tracking-wider">
              ⚡ AI offline
            </span>
          )}
        </div>

        {/* Sender & Subject */}
        <p className="text-sm font-semibold text-[#F0F4F8] mb-0.5">
          {item.sender}
        </p>
        <p className="text-xs text-[#9AA4B2] mb-3">{item.preview}</p>

        {/* Low Confidence Guardrail Alert & Manual Draft Input */}
        {isLowConfidence ? (
          <div className="mb-3.5 p-3 rounded-lg bg-[rgba(232,162,61,0.08)] border border-[rgba(232,162,61,0.25)] space-y-2">
            <div className="flex items-start gap-2">
              <IconAlertCircle
                size={18}
                className="text-[#E8A23D] shrink-0 mt-0.5"
              />
              <div>
                <p className="text-xs font-semibold text-[#E8A23D]">
                  Uncertain — manual review required
                </p>
                <p className="text-[12px] text-[#9AA4B2] mt-0.5">
                  Model confidence is below threshold (
                  {(item.confidence * 100).toFixed(0)}% &lt; 60%). No draft was
                  auto-generated. Please write your reply manually before
                  approving.
                </p>
              </div>
            </div>
            {isEditing && (
              <textarea
                value={editedDraft}
                onChange={(e) => setEditedDraft(e.target.value)}
                placeholder="Type your manual reply here..."
                className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2.5 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] resize-none"
                rows={3}
              />
            )}
          </div>
        ) : (
          /* Quoted Draft Block with Quick Tone Refinement Options */
          <div className="border-l-2 border-[#384352] pl-3 py-1.5 mb-3.5 bg-[#151A21]/50 rounded-r-md space-y-2">
            {isEditing ? (
              <textarea
                value={editedDraft}
                onChange={(e) => setEditedDraft(e.target.value)}
                className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2.5 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] resize-none"
                rows={3}
              />
            ) : (
              <p className="text-xs text-[#9AA4B2] italic leading-relaxed">
                "{item.draft_text}"
              </p>
            )}

            {/* Quick Tone Refinement Pills */}
            {!isDone && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className="font-mono text-[10px] text-[#7A8492] flex items-center gap-1 mr-1">
                  {regenerating ? <IconLoader2 size={11} className="animate-spin" /> : <IconSparkles size={11} />} Tone:
                </span>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate("shorter")}
                  disabled={regenerating}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Shorter
                </button>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate("formal")}
                  disabled={regenerating}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Formal
                </button>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate("availability")}
                  disabled={regenerating}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Times
                </button>
              </div>
            )}
          </div>
        )}

        {/* Productivity Actions */}
        {!isDone && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {!hasLinkedTask && (
              <button
                type="button"
                onClick={handleCreateTask}
                className="font-mono text-[10px] px-2 py-1 rounded bg-[rgba(74,143,194,0.1)] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] hover:bg-[rgba(74,143,194,0.18)] transition-colors cursor-pointer flex items-center gap-1"
              >
                <IconCheckbox size={12} /> Add Task
              </button>
            )}
            {hasLinkedTask && (
              <span className="font-mono text-[10px] px-2 py-1 rounded text-[#34D399] bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.3)] flex items-center gap-1">
                <IconCheckbox size={12} /> Task linked
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowFollowUp(!showFollowUp)}
              className="font-mono text-[10px] px-2 py-1 rounded bg-[rgba(167,139,250,0.1)] text-[#A78BFA] border border-[rgba(167,139,250,0.3)] hover:bg-[rgba(167,139,250,0.18)] transition-colors cursor-pointer flex items-center gap-1"
            >
              <IconBell size={12} /> Set Follow-up
            </button>
          </div>
        )}

        {showFollowUp && !isDone && (
          <form
            onSubmit={handleSetFollowUp}
            className="mb-3 p-3 rounded-lg bg-[rgba(167,139,250,0.06)] border border-[rgba(167,139,250,0.25)] space-y-2"
          >
            <input
              type="text"
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#A78BFA] font-mono"
              required
            />
            <input
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#A78BFA] font-mono"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-black bg-[#A78BFA] rounded-lg hover:bg-[#b89afc] cursor-pointer flex items-center gap-1"
              >
                <IconClock size={12} /> Schedule
              </button>
              <button
                type="button"
                onClick={() => setShowFollowUp(false)}
                className="px-3 py-1.5 text-xs text-[#7A8492] hover:text-[#9AA4B2] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Undo-Send Grace Period Toast */}
        {sendCountdown !== null && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.25)]">
            <span className="text-xs text-[#F59E0B] font-medium flex items-center gap-1.5">
              <IconClock size={13} />
              Sending in {sendCountdown}s…
            </span>
            <button
              type="button"
              onClick={handleUndoSend}
              className="text-xs font-semibold text-[#F59E0B] hover:text-[#FCD34D] underline cursor-pointer bg-transparent border-0 p-0"
            >
              Undo
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isDone ? (
            <span className="font-mono text-xs text-[#34D399] flex items-center gap-1 font-medium">
              <IconCheck size={15} />
              Sent
            </span>
          ) : isEditing ? (
            <>
              <button
                type="button"
                onClick={handleApproveClick}
                disabled={isLowConfidence && !editedDraft.trim()}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  isLowConfidence && !editedDraft.trim()
                    ? "text-[#7A8492] bg-[#151A21] border border-[#242B35] cursor-not-allowed opacity-50"
                    : "text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] hover:bg-[rgba(74,143,194,0.25)]"
                }`}
              >
                Save & Approve
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#9AA4B2] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : isLowConfidence ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#E8A23D] bg-[rgba(232,162,61,0.15)] border border-[rgba(232,162,61,0.3)] rounded-lg hover:bg-[rgba(232,162,61,0.25)] transition-colors font-mono cursor-pointer"
              >
                Write Manual Reply
              </button>
              <button
                type="button"
                onClick={() => skipItem(item.id)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#7A8492] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
              >
                Skip
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleApproveClick}
                className="px-3.5 py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] rounded-lg hover:bg-[rgba(74,143,194,0.25)] transition-colors cursor-pointer"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditedDraft(item.draft_text || "");
                  setIsEditing(true);
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-[#F0F4F8] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => skipItem(item.id)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#7A8492] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
              >
                Skip
              </button>
            </>
          )}
        </div>
      </div>

      {/* Flagged Email Guardrail Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="Flagged Email — Review Before Sending"
        message="This email has been flagged as high-priority or sensitive. Double-check the draft before approving."
        confirmText="Send anyway"
        cancelText="Cancel"
        onConfirm={handleConfirmedApprove}
        onCancel={() => setShowConfirmModal(false)}
      />
    </>
  );
};
