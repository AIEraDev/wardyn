export type QueueItemStatus = 'pending' | 'approved' | 'edited' | 'skipped' | 'sent';
export type QueueItemSource = 'gmail' | 'calendar';
export type QueueItemKind = 'reply' | 'deadline';
export type TabType = 'today' | 'messages' | 'content' | 'deadlines' | 'settings';

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
