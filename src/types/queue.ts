export type QueueItemStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'sent';
export type QueueItemSource = 'gmail' | 'calendar';
export type QueueItemKind = 'reply' | 'deadline';
export type TabType = 'today' | 'messages' | 'content' | 'deadlines' | 'settings';

export type SocialPlatform = 'linkedin' | 'twitter';
export type SocialPostStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'posted';

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
