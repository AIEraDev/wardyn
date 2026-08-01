export type QueueItemStatus = "pending" | "approved" | "edited" | "skipped" | "sent";
export type QueueItemSource = "gmail" | "calendar" | "slack" | "discord" | "telegram" | "imessage" | "linkedin" | "twitter" | "whatsapp" | "teams";
export type QueueItemKind = "reply" | "deadline" | "social" | "dm";
export type TabType = "today" | "messages" | "content" | "deadlines" | "channels" | "settings" | "analytics" | "memory" | "productivity" | "active-life" | "research";

export type SocialPlatform = "linkedin" | "twitter";
export type SocialPostStatus = "pending" | "approved" | "edited" | "skipped" | "posted";

export type ChannelCategory = "email" | "work" | "messaging" | "social";
export type ChannelStatus = "connected" | "disconnected" | "configuring";

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
  urgency?: "high" | "low" | null;
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

export interface KnowledgeItem {
  id: string;
  content: string;
  url?: string | null;
  tags: string; // JSON array string e.g. '["ai","rust"]'
  summary?: string | null;
  source: string;
  created_at: string;
}

export interface Decision {
  id: string;
  decision: string;
  rationale: string;
  alternatives?: string | null;
  outcome?: string | null;
  created_at: string;
}

export interface CustomFeed {
  id: string;
  title: string;
  url: string;
  category: string;
  created_at: string;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────

export interface ResponseAnalytics {
  id: string;
  queue_item_id: string;
  sender: string;
  category: string | null;
  received_at: string;
  responded_at: string | null;
  response_time_seconds: number | null;
  draft_generation_time_ms: number | null;
}

export interface CategoryResponseTime {
  category: string;
  avg_time_seconds: number;
}

// ─── Productivity Types ──────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string | null;
  source_item_id: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
}

export interface Reminder {
  id: string;
  item_id: string;
  reminder_date: string;
  message: string;
  status: "pending" | "triggered";
  created_at: string;
  triggered_at: string | null;
}

export interface PomodoroSession {
  id: string;
  task_id: string | null;
  duration_minutes: number;
  completed: boolean;
  started_at: string;
  ended_at: string | null;
}

// ─── Life Intelligence Types ──────────────────────────────────────────────────

export interface LifeTask {
  id: string;
  life_event_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
}

export interface LifeEvent {
  id: string;
  title: string;
  raw_input: string;
  intent: "event_prep" | "study_plan" | "project_kickoff" | "habit_goal" | "deadline" | "travel";
  event_date: string | null;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  tasks: LifeTask[];
}

// ─── Active Life Types ────────────────────────────────────────────────────────

export interface ActiveProject {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed";
  daily_target_minutes: number;
  last_worked_at: string | null;
  color: string;
  created_at: string;
  today_minutes: number;
}

export interface ProjectTimeLog {
  id: string;
  project_id: string;
  session_date: string;
  minutes_spent: number;
  notes: string | null;
  created_at: string;
}

export interface DailyHabit {
  id: string;
  name: string;
  icon: string;
  category: "health" | "spiritual" | "learning" | "social" | "work" | "general";
  sort_order: number;
  created_at: string;
  completed_today: boolean;
  current_streak: number;
}

export interface HabitCompletion {
  id: string;
  habit_id: string;
  completed_date: string;
  completed_at: string;
}

export interface DailyIntel {
  date: string;
  motivation_quote: string | null;
  quote_author: string | null;
  learning_topic: string | null;
  learning_summary: string | null;
  social_post_idea: string | null;
  social_format: "video" | "image_text" | "plain_text" | null;
  social_platform: "linkedin" | "twitter" | null;
  day_plan: string | null;
  generated_at: string;
}

export interface GeneratedPost {
  platform: string;
  format: string;
  hook: string;
  body: string;
  hashtags: string[];
  media_cue: string | null;
}

export interface HabitReminder {
  id: string;
  habit_id: string;
  habit_name: string;
  habit_icon: string;
  remind_time: string;   // "HH:MM" 24h e.g. "05:30"
  enabled: boolean;
  created_at: string;
}
