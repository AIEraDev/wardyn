import React, { useState } from 'react';
import {
  IconBrandLinkedin,
  IconBrandX,
  IconPencil,
  IconCheck,
  IconPlayerPlay,
  IconSparkles,
  IconPlus,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import { SocialPlatform } from '../types/queue';

export const ContentTab: React.FC = () => {
  const {
    socialPosts,
    approveSocialPost,
    skipSocialPost,
    regenerateSocialPost,
    createSocialPost,
  } = useQueueStore();

  const [platformFilter, setPlatformFilter] = useState<'all' | 'linkedin' | 'twitter'>('all');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newPlatform, setNewPlatform] = useState<SocialPlatform>('linkedin');

  const filteredPosts = socialPosts.filter((p) => {
    if (p.status === 'skipped') return false;
    if (platformFilter === 'all') return true;
    return p.platform === platformFilter;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTopic.trim()) {
      createSocialPost(newPlatform, newTopic.trim());
      setNewTopic('');
      setShowNewModal(false);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header Bar */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Content Briefs</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">LinkedIn & Twitter (X) Chief-of-Staff Briefs</p>
        </div>
        <div className="flex items-center gap-2">
          {/* New Brief Button */}
          <button
            onClick={() => setShowNewModal(true)}
            className="font-mono text-xs bg-[#4A8FC2] text-black px-3 py-1 rounded-md font-medium hover:bg-[#5b9bd1] transition-colors flex items-center gap-1 cursor-pointer"
          >
            <IconPlus size={14} /> New Social Brief
          </button>
          <span className="font-mono text-xs bg-[#151A21] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[rgba(74,143,194,0.3)]">
            {filteredPosts.filter((p) => p.status === 'pending').length} Briefs Pending
          </span>
        </div>
      </div>

      {/* Platform Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setPlatformFilter('all')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer ${
            platformFilter === 'all'
              ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          All Platforms
        </button>
        <button
          onClick={() => setPlatformFilter('linkedin')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            platformFilter === 'linkedin'
              ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          <IconBrandLinkedin size={14} /> LinkedIn
        </button>
        <button
          onClick={() => setPlatformFilter('twitter')}
          className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            platformFilter === 'twitter'
              ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
              : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
          }`}
        >
          <IconBrandX size={14} /> Twitter / X
        </button>
      </div>

      {/* New Brief Creation Form */}
      {showNewModal && (
        <form onSubmit={handleCreateSubmit} className="mb-4 p-4 rounded-xl bg-[#151A21] border border-[#242B35] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#F0F4F8] m-0">Generate Social Brief</h4>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as SocialPlatform)}
              className="bg-[#181E27] text-xs text-[#F0F4F8] font-mono px-2.5 py-1 rounded border border-[#242B35] cursor-pointer"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter / X</option>
            </select>
          </div>
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Enter milestone topic (e.g. Shipped new auth flow or Launched v2 release)..."
            className="w-full bg-[#181E27] text-xs text-[#F0F4F8] p-2.5 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="text-xs bg-[#4A8FC2] text-black px-3.5 py-1.5 rounded-lg font-medium cursor-pointer">
              Generate Brief
            </button>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="text-xs text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Social Post Cards */}
      {filteredPosts.length === 0 ? (
        <div className="p-8 text-center bg-[#151A21] border border-[#242B35] rounded-xl text-xs text-[#7A8492]">
          No active content briefs for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const isLinkedIn = post.platform === 'linkedin';
            const isPosted = post.status === 'posted';
            const isEditing = editingPostId === post.id;
            const charCount = (isEditing ? editedContent : post.content).length;

            return (
              <div
                key={post.id}
                className={`p-5 rounded-xl border transition-all ${
                  isPosted
                    ? 'opacity-50 bg-[#151A21] border-[#242B35]'
                    : 'bg-[#181E27] border-[#242B35] hover:border-[#384352]'
                }`}
              >
                {/* Platform Badge & Topic */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#151A21] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)] flex items-center gap-1.5">
                      {isLinkedIn ? <IconBrandLinkedin size={14} /> : <IconBrandX size={14} />}
                      {isLinkedIn ? 'LinkedIn' : 'Twitter / X'}
                    </span>
                    <span className="text-xs font-semibold text-[#F0F4F8]">{post.topic}</span>
                  </div>

                  {!isLinkedIn && (
                    <span className={`font-mono text-[11px] ${charCount > 280 ? 'text-[#E8A23D]' : 'text-[#7A8492]'}`}>
                      {charCount} / 280 chars
                    </span>
                  )}
                </div>

                {/* Content Block */}
                {isEditing ? (
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-3 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2] resize-none mb-3"
                    rows={4}
                  />
                ) : (
                  <p className="text-xs text-[#F0F4F8] leading-relaxed whitespace-pre-wrap mb-3 bg-[#151A21] p-3 rounded-lg border border-[#242B35]">
                    {post.content}
                  </p>
                )}

                {/* Hashtags & Media Cue */}
                <div className="space-y-1.5 mb-3.5">
                  {post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-[#4A8FC2]">
                      {post.hashtags.map((tag, idx) => (
                        <span key={idx}>{tag}</span>
                      ))}
                    </div>
                  )}

                  {post.media_cue && (
                    <p className="text-[11px] text-[#7A8492] font-mono flex items-center gap-1.5">
                      <IconPlayerPlay size={13} className="text-[#E8A23D]" />
                      Media cue: {post.media_cue}
                    </p>
                  )}
                </div>

                {/* Quick Tone Pills & Action Buttons */}
                {!isPosted && (
                  <div className="space-y-3 pt-1 border-t border-[#242B35]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-[#7A8492] flex items-center gap-1 mr-1">
                        <IconSparkles size={11} /> Refine:
                      </span>
                      <button
                        type="button"
                        onClick={() => regenerateSocialPost(post.id, 'punchy')}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#151A21] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] transition-colors cursor-pointer"
                      >
                        Punchy
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerateSocialPost(post.id, 'detailed')}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#151A21] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] transition-colors cursor-pointer"
                      >
                        Detailed
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerateSocialPost(post.id, 'thread')}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#151A21] text-[#9AA4B2] border border-[#242B35] hover:text-[#4A8FC2] transition-colors cursor-pointer"
                      >
                        Thread
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              approveSocialPost(post.id, editedContent);
                              setEditingPostId(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] rounded-lg hover:bg-[rgba(74,143,194,0.25)] transition-colors cursor-pointer"
                          >
                            Save & Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPostId(null)}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#9AA4B2] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => approveSocialPost(post.id)}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.16)] border border-[rgba(74,143,194,0.35)] rounded-lg hover:bg-[rgba(74,143,194,0.25)] transition-colors cursor-pointer"
                          >
                            <IconCheck size={14} className="inline mr-1 -mt-0.5" />
                            Approve & Queue Post
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditedContent(post.content);
                              setEditingPostId(post.id);
                            }}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#F0F4F8] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
                          >
                            <IconPencil size={14} className="inline mr-1 -mt-0.5" /> Edit Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => skipSocialPost(post.id)}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#7A8492] bg-[#151A21] border border-[#242B35] rounded-lg hover:bg-[#181E27] transition-colors cursor-pointer"
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
