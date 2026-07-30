import React from 'react';
import { IconMail, IconCpu, IconVolume } from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';

export const SettingsTab: React.FC = () => {
  const { gmailAccount, connectGmail, disconnectGmail } = useQueueStore();

  return (
    <div className="flex-1 min-w-0 space-y-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Settings</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Connectors, Local Model & Tone Preferences</p>
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
                onClick={disconnectGmail}
                className="text-xs text-[#E8A23D] hover:underline"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectGmail}
              className="text-xs font-medium text-black bg-[#4A8FC2] px-3.5 py-1.5 rounded-lg hover:bg-[#5b9bd1] transition-colors font-mono"
            >
              Connect Account
            </button>
          )}
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
