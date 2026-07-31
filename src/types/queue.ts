export type QueueItemStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'sent';
export type QueueItemSource = 'gmail' | 'calendar' | 'slack' | 'discord' | 'telegram' | 'imessage' | 'linkedin' | 'twitter' | 'whatsapp' | 'teams';
export type QueueItemKind = 'reply' | 'deadline' | 'social' | 'dm';
export type TabType = 'today' | 'messages' | 'content' | 'deadlines' | 'channels' | 'settings' | 'analytics';


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
  thread_id?: string | null;
  message_id?: string | null;
  urgency?: 'high' | 'low' | null;
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

export interface FeedInsight {
  id: string;
  author_name: string;
  author_title: string;
  original_snippet: string;
  core_lesson: string;
  copy_structure: string;
  actionable_application: string;
  domain_tag: string;
  engagement: string;
  image_url?: string;
  image_analysis?: string;
  created_at: string;
}

export interface LinkedInTimelineSummary {
  profile_name: string;
  headline: string;
  total_posts_analyzed: number;
  total_impressions: string;
  top_performing_topic: string;
  executive_summary: string;
  recent_posts: Array<{
    id: string;
    text: string;
    engagement: string;
    date: string;
  }>;
  feed_insights?: FeedInsight[];
}
