import React from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Send anyway',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#151A21] border border-[#242B35] rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[rgba(232,162,61,0.15)] text-[#E8A23D]">
            <IconAlertTriangle size={22} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#F0F4F8]">{title}</h3>
            <p className="text-xs text-[#9AA4B2] mt-0.5">Guardrail confirmation required</p>
          </div>
        </div>

        <p className="text-sm text-[#9AA4B2] leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[#9AA4B2] bg-[#151A21] hover:bg-[#181E27] border border-[#242B35] rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-medium text-black bg-[#E8A23D] hover:bg-[#f0ad4e] rounded-lg transition-colors font-mono"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
