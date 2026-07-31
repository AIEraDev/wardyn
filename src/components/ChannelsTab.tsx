import React, { useState } from 'react';
import {
  IconMail,
  IconCalendar,
  IconBrandSlack,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandApple,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandWhatsapp,
  IconBrandTeams,
  IconPlugConnected,
  IconPlus,
  IconCheck,
  IconSearch,
} from '@tabler/icons-react';
import { useQueueStore } from '../store/useQueueStore';
import { ChannelCategory } from '../types/queue';

const ICON_MAP: Record<string, React.ElementType> = {
  IconMail,
  IconCalendar,
  IconBrandSlack,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandApple,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandWhatsapp,
  IconBrandTeams,
};

export const ChannelsTab: React.FC = () => {
  const { channels, connectChannel, disconnectChannel, connectGmail } = useQueueStore();
  const [selectedCategory, setSelectedCategory] = useState<'all' | ChannelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [configuringChannelId, setConfiguringChannelId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [webhookUrlInput, setWebhookUrlInput] = useState('');

  const filteredChannels = channels.filter((ch) => {
    const matchesCategory = selectedCategory === 'all' || ch.category === selectedCategory;
    const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || ch.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleConnectSubmit = (e: React.FormEvent, channelId: string) => {
    e.preventDefault();
    if (channelId === 'gmail') {
      connectGmail();
    } else {
      connectChannel(channelId, apiKeyInput || 'api_key_sample', webhookUrlInput || undefined);
    }
    setConfiguringChannelId(null);
    setApiKeyInput('');
    setWebhookUrlInput('');
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header Bar */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F4F8] m-0">Channel Directory</h1>
          <p className="font-mono text-xs text-[#7A8492] mt-0.5">Multi-Channel Executive Chief-of-Staff Hub</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-[#151A21] text-[#4A8FC2] px-2.5 py-1 rounded-md border border-[rgba(74,143,194,0.3)]">
            {channels.filter((c) => c.status === 'connected').length} Connected Channels
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          {(['all', 'email', 'work', 'messaging', 'social'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`font-mono text-xs px-3 py-1 rounded-md transition-colors cursor-pointer capitalize ${
                selectedCategory === cat
                  ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.35)]'
                  : 'bg-[#151A21] text-[#9AA4B2] border border-[#242B35]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-48">
          <IconSearch size={14} className="absolute left-2.5 top-2.5 text-[#7A8492]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels..."
            className="w-full bg-[#151A21] text-xs text-[#F0F4F8] pl-8 pr-3 py-1.5 rounded-lg border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
          />
        </div>
      </div>

      {/* OpenClaw-Style Multi-Channel Directory Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredChannels.map((channel) => {
          const Icon = ICON_MAP[channel.iconName] || IconPlugConnected;
          const isConnected = channel.status === 'connected';
          const isConfiguring = configuringChannelId === channel.id;

          return (
            <div
              key={channel.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isConnected
                  ? 'bg-[#151A21] border-[rgba(74,143,194,0.4)] shadow-[0_0_12px_rgba(74,143,194,0.08)]'
                  : 'bg-[#181E27] border-[#242B35] hover:border-[#384352]'
              }`}
            >
              <div>
                {/* Icon & Title Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${isConnected ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2]' : 'bg-[#151A21] text-[#7A8492]'}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F0F4F8] m-0">{channel.name}</h3>
                      <span className="font-mono text-[10px] text-[#7A8492] uppercase">{channel.category}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                      isConnected
                        ? 'bg-[rgba(74,143,194,0.16)] text-[#4A8FC2] border border-[rgba(74,143,194,0.3)]'
                        : 'bg-[#151A21] text-[#7A8492] border border-[#242B35]'
                    }`}
                  >
                    {isConnected ? 'Active Bridge' : 'Available'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-[#9AA4B2] leading-relaxed mb-3">
                  {channel.description}
                </p>

                {channel.accountLabel && (
                  <p className="font-mono text-[11px] text-[#4A8FC2] mb-3 truncate">
                    • {channel.accountLabel}
                  </p>
                )}
              </div>

              {/* Action Controls */}
              {isConfiguring ? (
                <form onSubmit={(e) => handleConnectSubmit(e, channel.id)} className="space-y-2 pt-2 border-t border-[#242B35]">
                  {channel.id === 'gmail' ? (
                    <p className="text-xs text-[#9AA4B2]">Will open Google OAuth PKCE authentication in system browser.</p>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={`${channel.name} Bot Token / API Key...`}
                        className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
                      />
                      <input
                        type="text"
                        value={webhookUrlInput}
                        onChange={(e) => setWebhookUrlInput(e.target.value)}
                        placeholder="Webhook URL (optional)..."
                        className="w-full bg-[#151A21] text-xs text-[#F0F4F8] p-2 rounded border border-[#242B35] focus:outline-none focus:border-[#4A8FC2]"
                      />
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-medium text-black bg-[#4A8FC2] rounded hover:bg-[#5b9bd1] cursor-pointer"
                    >
                      Connect Channel
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfiguringChannelId(null)}
                      className="px-3 py-1 text-xs text-[#7A8492] hover:text-[#F0F4F8] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="pt-2 border-t border-[#242B35]">
                  {isConnected ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#4A8FC2] font-mono flex items-center gap-1">
                        <IconCheck size={13} /> Integrated
                      </span>
                      {channel.id !== 'calendar' && channel.id !== 'linkedin' && channel.id !== 'twitter' && (
                        <button
                          type="button"
                          onClick={() => disconnectChannel(channel.id)}
                          className="font-mono text-[11px] text-[#E8A23D] hover:underline cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfiguringChannelId(channel.id)}
                      className="w-full py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.3)] rounded-lg hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <IconPlus size={14} /> Configure Channel
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
