import React, { useState } from 'react';
import { IconMail, IconCheck, IconAlertCircle, IconSparkles } from '@tabler/icons-react';
import { QueueItem } from '../types/queue';
import { useQueueStore } from '../store/useQueueStore';
import { ConfirmModal } from './ConfirmModal';

interface ReplyCardProps {
  item: QueueItem;
}

export const ReplyCard: React.FC<ReplyCardProps> = ({ item }) => {
  const { approveItem, skipItem, regenerateDraft } = useQueueStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState(item.draft_text || '');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const isLowConfidence = item.confidence < 0.6;
  const isDone = item.status === 'sent' || item.status === 'approved' || item.status === 'edited';
  const isSkipped = item.status === 'skipped';

  const handleApproveClick = () => {
    if (isLowConfidence && (!editedDraft || editedDraft.trim().length === 0)) {
      setIsEditing(true);
      return;
    }

    if (item.flagged) {
      setShowConfirmModal(true);
    } else {
      approveItem(item.id, isEditing || isLowConfidence ? editedDraft : undefined);
      setIsEditing(false);
    }
  };

  const handleConfirmedApprove = () => {
    setShowConfirmModal(false);
    approveItem(item.id, isEditing || isLowConfidence ? editedDraft : undefined);
    setIsEditing(false);
  };

  const handleToneRegenerate = (tone: 'shorter' | 'formal' | 'availability') => {
    regenerateDraft(item.id, tone);
    const updated = useQueueStore.getState().items.find((i) => i.id === item.id);
    if (updated?.draft_text) {
      setEditedDraft(updated.draft_text);
    }
  };

  if (isSkipped) return null;

  return (
    <>
      <div
        className={`rcard p-5 mb-4 rounded-xl border transition-all duration-200 ${
          isDone
            ? 'opacity-50 bg-[#151A21] border-[#242B35]'
            : 'bg-[#181E27] border-[#242B35] hover:border-[#384352]'
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
              Visa
            </span>
          )}

          <span
            className={`font-mono text-[11px] ml-auto px-2 py-0.5 rounded ${
              isLowConfidence
                ? 'bg-[rgba(232,162,61,0.15)] text-[#E8A23D] font-medium'
                : 'text-[#7A8492]'
            }`}
          >
            {(item.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>

        {/* Sender & Subject */}
        <p className="text-sm font-semibold text-[#F0F4F8] mb-0.5">{item.sender}</p>
        <p className="text-xs text-[#9AA4B2] mb-3">{item.preview}</p>

        {/* Low Confidence Guardrail Alert & Manual Draft Input */}
        {isLowConfidence ? (
          <div className="mb-3.5 p-3 rounded-lg bg-[rgba(232,162,61,0.08)] border border-[rgba(232,162,61,0.25)] space-y-2">
            <div className="flex items-start gap-2">
              <IconAlertCircle size={18} className="text-[#E8A23D] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#E8A23D]">Uncertain — manual review required</p>
                <p className="text-[12px] text-[#9AA4B2] mt-0.5">
                  Model confidence is below threshold ({(item.confidence * 100).toFixed(0)}% &lt; 60%). No draft was auto-generated. Please write your reply manually before approving.
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
                  <IconSparkles size={11} /> Tone:
                </span>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate('shorter')}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer"
                >
                  Shorter
                </button>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate('formal')}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer"
                >
                  Formal
                </button>
                <button
                  type="button"
                  onClick={() => handleToneRegenerate('availability')}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] hover:border-[#4A8FC2] transition-colors cursor-pointer"
                >
                  Add Times
                </button>
              </div>
            )}
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
                    ? 'text-[#7A8492] bg-[#151A21] border border-[#242B35] cursor-not-allowed opacity-50'
                    : 'text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] hover:bg-[rgba(74,143,194,0.25)]'
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
                  setEditedDraft(item.draft_text || '');
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

      {/* Visa Warning Guardrail Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="Visa-Related Email Guardrail"
        message="This is a visa-related email. Are you sure you want to approve and send this response to UK Visas and Immigration?"
        confirmText="Send anyway"
        cancelText="Cancel"
        onConfirm={handleConfirmedApprove}
        onCancel={() => setShowConfirmModal(false)}
      />
    </>
  );
};
