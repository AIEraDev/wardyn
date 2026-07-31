export type QueueItemStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'sent';
export type QueueItemSource = 'gmail' | 'calendar' | 'slack' | 'discord' | 'telegram' | 'imessage' | 'linkedin' | 'twitter' | 'whatsapp' | 'teams';
export type QueueItemKind = 'reply' | 'deadline' | 'social' | 'dm';
export type TabType = 'today' | 'messages' | 'content' | 'deadlines' | 'channels' | 'settings';

export type SocialPlatform = 'linkedin' | 'twitter';
export type SocialPostStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'posted';

export type ChannelCategory = 'email' | 'work' | 'messaging' | 'social';
export type ChannelStatus = 'connected' | 'disconnected' | 'configuring';

export interface ChannelConfig {
  id: string;
  name: string;
  category: ChannelCategory;
  description: string;
  iconName: string;
  status: ChannelStatus;
  accountLabel?: string;
  webhookUrl?: string;
  apiKey?: string;
}

export interface QueueItem {
  id: string;
  source: QueueItemSource;
  kind: QueueItemKind;
  sender: string;
  preview: string;
  draft_text: string | null;
  status: QueueItemStatus;
  flagged: boolean;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  topic: string;
  content: string;
  hashtags: string[];
  media_cue: string | null;
  status: SocialPostStatus;
  created_at: string;
}
