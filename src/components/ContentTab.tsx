import React from 'react';
import { IconPencil, IconBrandLinkedin, IconPlayerPlay } from '@tabler/icons-react';

export const ContentTab: React.FC = () => {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Content Briefs</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Daily Social & Post Recommendations</p>
        </div>
        <span className="font-mono text-xs bg-[#151A21] text-[#9AA4B2] px-2.5 py-1 rounded-md border border-[#242B35]">
          1 Brief Available
        </span>
      </div>

      <div className="p-5 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#181E27] text-[#9AA4B2] border border-[#242B35] flex items-center gap-1.5">
            <IconBrandLinkedin size={14} />
            LinkedIn
          </span>
        </div>

        <p className="text-sm text-[#F0F4F8] leading-relaxed">
          Caption: shipped the text-effects engine rewrite in Clypra this week, cleaner api, 30+ effects ported.
        </p>

        <p className="text-xs text-[#7A8492] flex items-center gap-1.5 font-mono">
          <IconPlayerPlay size={14} />
          Record cue: 20s clip of the effect picker in action
        </p>

        <div className="flex items-center gap-2 pt-2">
          <button className="px-3.5 py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] rounded-lg hover:bg-[rgba(74,143,194,0.25)] transition-colors">
            <IconPencil size={14} className="inline mr-1 -mt-0.5" /> Use this
          </button>
          <button className="px-3.5 py-1.5 text-xs font-medium text-[#7A8492] bg-[#181E27] border border-[#242B35] rounded-lg hover:bg-[#212532] transition-colors">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
