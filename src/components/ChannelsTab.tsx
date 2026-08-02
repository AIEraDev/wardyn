import React, { useState } from "react";
import {
  IconMail,
  IconCalendar,
  IconBrandLinkedin,
  IconPlugConnected,
  IconPlus,
  IconCheck,
  IconSearch,
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
  } = useQueueStore();

  const [searchQuery, setSearchQuery] = useState("");

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

          return (
            <div
              key={channel.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isConnected
                  ? "bg-[#151A21] border-[rgba(74,143,194,0.4)] shadow-[0_0_12px_rgba(74,143,194,0.08)]"
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
                        : "bg-[#151A21] text-[#7A8492] border border-[#242B35]"
                    }`}
                  >
                    {isGmail && isConnected
                      ? `${gmailAccounts.length} Account${gmailAccounts.length !== 1 ? "s" : ""}`
                      : isCalendar
                        ? "Auto-Synced"
                        : isConnected
                          ? "Active"
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

                {/* LinkedIn account label */}
                {isLinkedIn && channel.accountLabel && (
                  <p className="font-mono text-[11px] text-[#4A8FC2] mb-3 truncate">
                    • {channel.accountLabel}
                  </p>
                )}
              </div>

              {/* Action row */}
              <div className="pt-2 border-t border-[#242B35]">
                {isCalendar ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#4A8FC2]">
                    <IconCheck size={13} /> Synced automatically via Gmail OAuth
                  </div>
                ) : isGmail ? (
                  <button
                    type="button"
                    onClick={() => connectGmail()}
                    className="w-full py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.3)] rounded-lg hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono"
                  >
                    <IconPlus size={14} />
                    {gmailAccounts.length > 0
                      ? "Connect Another Gmail Account"
                      : "Connect Gmail OAuth"}
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
                      onClick={() => connectLinkedIn()}
                      className="w-full py-1.5 text-xs font-medium text-[#4A8FC2] bg-[rgba(74,143,194,0.12)] border border-[rgba(74,143,194,0.3)] rounded-lg hover:bg-[rgba(74,143,194,0.2)] transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono"
                    >
                      <IconPlus size={14} /> Connect LinkedIn OAuth
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
