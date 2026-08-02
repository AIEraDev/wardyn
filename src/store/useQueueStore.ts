import { create } from "zustand";
import {
  QueueItem,
  QueueItemStatus,
  TabType,
  SocialPost,
  SocialPlatform,
  ChannelConfig,
  LinkedInTimelineSummary,
  FeedInsight,
  KnowledgeItem,
  Decision,
  CustomFeed,
  Task,
  Reminder,
  PomodoroSession,
  ResponseAnalytics,
  LifeEvent,
  ActiveProject,
  DailyHabit,
  HabitCompletion,
  DailyIntel,
  GeneratedPost,
  HabitReminder,
} from "../types/queue";

import {
  SupportedLanguage,
  TRANSLATIONS,
  TranslationDictionary,
  _registerUseQueueStore,
} from "../i18n/translations";

export type PostCadence = "daily" | "every_2_days" | "weekly" | "manual";

export interface SyncedCalendarEvent {
  id: string;
  queue_item_id: string;
  event_id: string;
  summary: string;
  event_date: string;
  created_at: string;
}

const INITIAL_CHANNELS: ChannelConfig[] = [
  {
    id: "gmail",
    name: "Gmail",
    category: "email",
    description:
      "Inbox triage, thread monitoring & voice drafting over OAuth 2.0 PKCE",
    iconName: "IconMail",
    status: "disconnected",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    category: "email",
    description:
      "Auto-sync deadline events and appointment requests automatically",
    iconName: "IconCalendar",
    status: "disconnected",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    description:
      "Executive network outreach, personal profile timeline ingestion & content briefs",
    iconName: "IconBrandLinkedin",
    status: "disconnected",
  },
];

export interface WeeklyAnalytics {
  week: string; // e.g. "Jul 24"
  emailsTriaged: number;
  hoursSaved: number;
  linkedInImpressions: number;
  postsPublished: number;
}

export type StatusMessageType = "error" | "success" | "info";

export interface StatusMessage {
  type: StatusMessageType;
  text: string;
}

let pomodoroAutoCompleteTimer: ReturnType<typeof setTimeout> | null = null;

function clearPomodoroAutoCompleteTimer() {
  if (pomodoroAutoCompleteTimer) {
    clearTimeout(pomodoroAutoCompleteTimer);
    pomodoroAutoCompleteTimer = null;
  }
}

function schedulePomodoroAutoComplete(
  sessionId: string,
  delayMs: number,
  onComplete: () => Promise<void>,
) {
  clearPomodoroAutoCompleteTimer();
  pomodoroAutoCompleteTimer = setTimeout(async () => {
    pomodoroAutoCompleteTimer = null;
    const { activePomodoroSession } = useQueueStore.getState();
    if (activePomodoroSession?.id === sessionId) {
      await onComplete();
    }
  }, delayMs);
}

interface QueueStore {
  items: QueueItem[];
  socialPosts: SocialPost[];
  channels: ChannelConfig[];
  calendarEvents: SyncedCalendarEvent[];
  linkedInSummary: LinkedInTimelineSummary | null;
  linkedInAccount: string | null;
  linkedInCadence: PostCadence;
  activeTab: TabType;
  isLoading: boolean;
  error: string | null;
  statusMessage: StatusMessage | null;
  gmailAccount: string | null;
  gmailAccounts: string[];
  testOverrideRecipient: string | null;

  // Preferences & i18n
  language: SupportedLanguage;
  notificationsEnabled: boolean;
  autoStartEnabled: boolean;
  syncIntervalMinutes: number;

  // Actions
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: keyof TranslationDictionary) => string;
  setActiveTab: (tab: TabType) => void;
  setLinkedInCadence: (cadence: PostCadence) => void;
  toggleNotifications: (enabled: boolean) => void;
  checkAutoStartStatus: () => Promise<void>;
  toggleAutoStart: (enable: boolean) => Promise<void>;
  setSyncInterval: (minutes: number) => void;
  showStatusMessage: (type: StatusMessageType, text: string) => void;
  clearStatusMessage: () => void;
  fetchItems: () => Promise<void>;
  approveItem: (id: string, editedDraft?: string) => Promise<void>;
  skipItem: (id: string) => Promise<void>;
  updateDraft: (id: string, text: string) => void;
  regenerateDraft: (
    id: string,
    tone: "shorter" | "formal" | "availability",
  ) => Promise<void>;
  setTestOverrideRecipient: (email: string | null) => void;

  // Multi-Channel Actions
  connectChannel: (
    channelId: string,
    apiKey?: string,
    webhookUrl?: string,
  ) => void;
  disconnectChannel: (channelId: string) => void;

  // LinkedIn OAuth Actions
  connectLinkedIn: () => Promise<void>;

  // Social Post Actions (LinkedIn & Twitter/X)
  approveSocialPost: (id: string, editedContent?: string) => Promise<void>;
  skipSocialPost: (id: string) => void;
  regenerateSocialPost: (
    id: string,
    tone: "punchy" | "detailed" | "thread" | "leadership" | "story",
  ) => Promise<void>;
  createSocialPost: (platform: SocialPlatform, topic: string) => Promise<void>;
  generateCadenceLinkedInPost: () => Promise<void>;
  remixInsightToPersonalPost: (insight: FeedInsight) => void;
  syncLinkedInTimeline: () => Promise<void>;

  // Gmail OAuth & Send Actions
  checkGmailStatus: () => Promise<void>;
  connectGmail: () => Promise<void>;
  disconnectGmail: (email?: string) => Promise<void>;
  syncGmail: () => Promise<void>;

  // Ollama Actions
  processItemWithOllama: (id: string) => Promise<void>;

  // Calendar Sync Actions
  syncCalendarDeadlines: () => Promise<void>;

  // Analytics State
  analyticsWeeklyData: WeeklyAnalytics[];
  publishingStatus: "idle" | "publishing" | "success" | "error";
  publishingError: string | null;

  // LinkedIn Direct Publish Action
  publishLinkedInPost: (id: string, content?: string) => Promise<void>;

  // Native Notification Helper
  sendDesktopNotification: (title: string, body: string) => Promise<void>;

  // Morning Intelligence Brief
  morningBrief: string | null;
  morningBriefLoading: boolean;
  fetchMorningBrief: () => Promise<void>;
  refreshMorningBrief: () => Promise<void>;

  // Memory: Personal Knowledge Capture & Decision Log
  knowledgeItems: KnowledgeItem[];
  decisions: Decision[];
  saveKnowledgeItem: (content: string, url?: string) => Promise<void>;
  fetchKnowledgeItems: () => Promise<void>;
  saveDecision: (
    decision: string,
    rationale: string,
    alternatives?: string,
  ) => Promise<void>;
  fetchDecisions: () => Promise<void>;
  updateDecisionOutcome: (id: string, outcome: string) => Promise<void>;

  // Phase C: Weekly Review & Interest Learning
  weeklyReview: string | null;
  weeklyReviewLoading: boolean;
  fetchWeeklyReview: () => Promise<void>;
  refreshWeeklyReview: () => Promise<void>;
  recordFeedInteraction: (
    itemId: string,
    itemSource: string,
    tags: string,
    action: string,
  ) => Promise<void>;

  // Phase D: Vault Sync
  vaultPath: string | null;
  isPlayingAudio: boolean;
  speakText: (text: string) => Promise<void>;
  stopSpeech: () => Promise<void>;
  fetchVaultPath: () => Promise<void>;
  setVaultPath: (path: string) => Promise<void>;

  // Phase E & F: Custom RSS Feeds & Deep Reader
  customFeeds: CustomFeed[];
  fetchCustomFeeds: () => Promise<void>;
  addCustomFeed: (
    title: string,
    url: string,
    category?: string,
  ) => Promise<void>;
  deleteCustomFeed: (id: string) => Promise<void>;
  deepReadUrl: (url: string) => Promise<string>;

  // Phase G: Analytics & Insights
  responseAnalytics: ResponseAnalytics[];
  categoryResponseTimes: Array<{ category: string; avg_time_seconds: number }>;
  fetchResponseAnalytics: (days: number) => Promise<void>;
  fetchCategoryResponseTimes: (days: number) => Promise<void>;
  exportAnalyticsSummary: (markdown: string) => Promise<string | null>;

  // Phase H: Productivity Features
  tasks: Task[];
  reminders: Reminder[];
  pomodoroSessions: PomodoroSession[];
  activePomodoroSession: PomodoroSession | null;
  createTask: (
    title: string,
    description?: string,
    sourceItemId?: string,
    dueDate?: string,
    priority?: string,
  ) => Promise<void>;
  createTaskFromItem: (
    itemId: string,
    title: string,
    description?: string,
    priority?: string,
  ) => Promise<Task | null>;
  fetchTasks: (statusFilter?: string) => Promise<void>;
  updateTaskStatus: (id: string, status: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createReminder: (
    itemId: string,
    reminderDate: string,
    message: string,
  ) => Promise<void>;
  fetchReminders: () => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  snoozeReminder: (id: string, newDate: string) => Promise<void>;
  checkPendingReminders: () => Promise<void>;
  startPomodoro: (taskId?: string, durationMinutes?: number) => Promise<void>;
  completePomodoro: (id: string) => Promise<void>;
  restoreActivePomodoro: () => void;
  fetchPomodoroSessions: (days: number) => Promise<void>;

  // Phase G: Life Intelligence Capture
  lifeEvents: LifeEvent[];
  lifeEventCapturing: boolean;
  captureLifeEvent: (text: string) => Promise<LifeEvent | null>;
  fetchLifeEvents: () => Promise<void>;
  updateLifeEventStatus: (id: string, status: string) => Promise<void>;

  // Ollama Model Guard & Background Downloads
  ollamaModels: Array<{ name: string; size_gb: string }>;
  ollamaChecked: boolean;
  pullProgress: Record<
    string,
    {
      status: string;
      completed: number;
      total: number;
      percent: number;
      done: boolean;
      error?: string;
    }
  >;
  pendingDownloads: Record<string, true>; // models invoked but no progress event yet
  _ollamaListenerInitialized: boolean;
  checkOllamaModels: () => Promise<void>;
  initOllamaProgressListener: () => Promise<void>;
  installOllamaModel: (modelName: string) => Promise<void>;
  cancelOllamaModelInstall: (modelName: string) => Promise<void>;

  // Active Life
  activeProjects: ActiveProject[];
  dailyHabits: DailyHabit[];
  habitCompletions: HabitCompletion[];
  dailyIntel: DailyIntel | null;
  dailyIntelLoading: boolean;
  dayPlan: string | null;
  dayPlanLoading: boolean;
  generatedPost: GeneratedPost | null;
  generatedPostLoading: boolean;
  fetchActiveProjects: () => Promise<void>;
  addActiveProject: (
    name: string,
    description?: string,
    daily_target_minutes?: number,
    color?: string,
  ) => Promise<void>;
  updateActiveProject: (
    id: string,
    updates: Partial<ActiveProject>,
  ) => Promise<void>;
  deleteActiveProject: (id: string) => Promise<void>;
  logProjectSession: (
    projectId: string,
    minutes: number,
    notes?: string,
  ) => Promise<void>;
  fetchDailyHabits: () => Promise<void>;
  addDailyHabit: (
    name: string,
    icon?: string,
    category?: string,
  ) => Promise<void>;
  deleteDailyHabit: (id: string) => Promise<void>;
  toggleHabitComplete: (habitId: string) => Promise<void>;
  fetchDailyIntel: (forceRefresh?: boolean) => Promise<void>;
  generateDayPlan: () => Promise<void>;
  generateSocialPost: (
    platform: string,
    idea: string,
    format: string,
  ) => Promise<void>;

  // Habit Reminders
  habitReminders: HabitReminder[];
  fetchHabitReminders: () => Promise<void>;
  addHabitReminder: (habitId: string, remindTime: string) => Promise<void>;
  deleteHabitReminder: (id: string) => Promise<void>;
  toggleHabitReminder: (id: string, enabled: boolean) => Promise<void>;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  socialPosts: [],
  channels: INITIAL_CHANNELS,
  calendarEvents: [],
  linkedInSummary: null,
  linkedInAccount: null,
  linkedInCadence: "every_2_days",
  activeTab: "today",
  isLoading: false,
  error: null,
  statusMessage: null,
  gmailAccount: null,
  gmailAccounts: [],
  testOverrideRecipient: null,

  language: "en",
  notificationsEnabled: true,
  autoStartEnabled: false,
  syncIntervalMinutes: 5,
  publishingStatus: "idle",
  publishingError: null,
  analyticsWeeklyData: [],
  morningBrief: null,
  morningBriefLoading: false,
  knowledgeItems: [],
  decisions: [],
  weeklyReview: null,
  weeklyReviewLoading: false,
  isPlayingAudio: false,
  vaultPath: null,
  customFeeds: [],
  responseAnalytics: [],
  categoryResponseTimes: [],
  tasks: [],
  reminders: [],
  pomodoroSessions: [],
  activePomodoroSession: null,
  lifeEvents: [],
  lifeEventCapturing: false,
  ollamaModels: [],
  ollamaChecked: false,
  pullProgress: {},
  pendingDownloads: {} as Record<string, true>,
  _ollamaListenerInitialized: false,

  setLanguage: (lang: SupportedLanguage) => {
    set({ language: lang });
    get().sendDesktopNotification(
      "🌐 Language Updated",
      `Wardyn interface switched to ${lang.toUpperCase()}`,
    );
  },

  t: (key: keyof TranslationDictionary) => {
    const currentLang = get().language;
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  },

  setActiveTab: (tab: TabType) => {
    set({ activeTab: tab });
  },

  setLinkedInCadence: (cadence: PostCadence) => {
    set({ linkedInCadence: cadence });
    const label =
      cadence === "daily"
        ? "Daily (9:00 AM)"
        : cadence === "every_2_days"
          ? "Every 2 Days"
          : cadence === "weekly"
            ? "Weekly"
            : "Manual";
    get().sendDesktopNotification(
      "🗓️ Post Cadence Updated",
      `LinkedIn personal post auto-drafting frequency set to: ${label}`,
    );
  },

  toggleNotifications: (enabled: boolean) => {
    set({ notificationsEnabled: enabled });
  },

  checkAutoStartStatus: async () => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        const active = await isEnabled();
        set({ autoStartEnabled: active });
      }
    } catch (err) {
      console.warn("Autostart plugin status check failed:", err);
    }
  },

  toggleAutoStart: async (enable: boolean) => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { enable: enableAutostart, disable: disableAutostart } =
          await import("@tauri-apps/plugin-autostart");
        if (enable) {
          await enableAutostart();
          set({ autoStartEnabled: true });
        } else {
          await disableAutostart();
          set({ autoStartEnabled: false });
        }
      }
    } catch (err) {
      console.error("Autostart toggle failed:", err);
    }
  },

  setSyncInterval: (minutes: number) => {
    set({ syncIntervalMinutes: minutes });
  },

  showStatusMessage: (type: StatusMessageType, text: string) => {
    set({
      statusMessage: { type, text },
      error: type === "error" ? text : null,
    });
  },

  clearStatusMessage: () => {
    set({ statusMessage: null });
  },

  sendDesktopNotification: async (title: string, body: string) => {
    if (!get().notificationsEnabled) return;
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { isPermissionGranted, requestPermission, sendNotification } =
          await import("@tauri-apps/plugin-notification");
        let permission = await isPermissionGranted();
        if (!permission) {
          const permissionGranted = await requestPermission();
          permission = permissionGranted === "granted";
        }
        if (permission) {
          sendNotification({ title, body });
        }
      }
    } catch (err) {
      console.warn("Desktop notification dispatch unavailable:", err);
    }
  },

  fetchItems: async () => {
    set({ isLoading: true, error: null });
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const items = await invoke<QueueItem[]>("get_queue_items");
        set({ items, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      console.warn("Backend IPC not active:", err);
      set({ isLoading: false });
    }
  },

  setTestOverrideRecipient: (email: string | null) => {
    set({ testOverrideRecipient: email });
  },

  connectChannel: (channelId: string, apiKey?: string, webhookUrl?: string) => {
    if (channelId === "linkedin") {
      get().connectLinkedIn();
      return;
    }

    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId
          ? {
              ...c,
              status: "connected",
              apiKey,
              webhookUrl,
              accountLabel: "Active Bridge",
            }
          : c,
      ),
    }));

    const ch = get().channels.find((c) => c.id === channelId);
    if (ch) {
      get().sendDesktopNotification(
        `🔌 Channel Connected: ${ch.name}`,
        `Successfully integrated ${ch.name} into Wardyn Multi-Channel Hub.`,
      );
    }
  },

  disconnectChannel: (channelId: string) => {
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId
          ? {
              ...c,
              status: "disconnected",
              accountLabel: undefined,
              apiKey: undefined,
              webhookUrl: undefined,
            }
          : c,
      ),
    }));
  },

  connectLinkedIn: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");

      // Validate credentials before opening browser
      const creds = await invoke<{
        linkedin_client_id: string | null;
        linkedin_client_secret: string | null;
      }>("get_oauth_credentials_command");
      const clientId = creds?.linkedin_client_id?.trim() ?? "";
      const clientSecret = creds?.linkedin_client_secret?.trim() ?? "";
      if (!clientId) {
        const msg =
          "LinkedIn Client ID not set. Go to Settings → OAuth Credentials first.";
        set({ error: msg });
        await get().sendDesktopNotification("⚠️ LinkedIn Setup Required", msg);
        throw new Error(msg);
      }
      if (!clientSecret) {
        const msg =
          "LinkedIn Client Secret not set. Go to Settings → OAuth Credentials first.";
        set({ error: msg });
        await get().sendDesktopNotification("⚠️ LinkedIn Setup Required", msg);
        throw new Error(msg);
      }

      const profileName = await invoke<string>("start_linkedin_auth");
      set({ linkedInAccount: profileName });
      set((state) => ({
        channels: state.channels.map((c) =>
          c.id === "linkedin"
            ? { ...c, status: "connected", accountLabel: profileName }
            : c,
        ),
      }));
      await get().syncLinkedInTimeline();
      await get().sendDesktopNotification(
        "💼 LinkedIn Personal Profile Connected",
        `Authenticated profile for: ${profileName}`,
      );
    }
  },

  approveItem: async (id: string, editedDraft?: string) => {
    const target = get().items.find((i) => i.id === id);
    if (!target) return;

    const finalDraft =
      editedDraft !== undefined ? editedDraft : target.draft_text;
    if (!finalDraft) return;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");

        if (
          editedDraft !== undefined &&
          target.draft_text &&
          editedDraft !== target.draft_text
        ) {
          invoke("record_voice_edit_command", {
            itemId: id,
            original: target.draft_text,
            edited: editedDraft,
          }).catch(console.error);
        }

        await invoke("send_gmail_reply_command", {
          req: {
            item_id: id,
            recipient: target.sender,
            subject: target.preview,
            in_reply_to: target.message_id || null,
            thread_id: target.thread_id || null,
            body_text: finalDraft,
            test_override_recipient: get().testOverrideRecipient,
          },
        });

        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "sent" as QueueItemStatus,
                  draft_text: finalDraft,
                  updated_at: new Date().toISOString(),
                }
              : item,
          ),
          error: null,
          statusMessage: null,
        }));

        const actionLabel =
          editedDraft !== undefined
            ? "✍️ Edited Reply Sent"
            : "✅ Reply Approved & Sent";
        const overrideNotice = get().testOverrideRecipient
          ? ` (to test target: ${get().testOverrideRecipient})`
          : "";
        await get().sendDesktopNotification(
          actionLabel,
          `Sent response to ${target.sender}${overrideNotice}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to send via Gmail API:", err);
        get().showStatusMessage(
          "error",
          `Send failed — your reply to ${target.sender} was not sent. ${msg}`,
        );
      }
    }
  },

  skipItem: async (id: string) => {
    const target = get().items.find((i) => i.id === id);
    // Optimistic update
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, status: "skipped", updated_at: new Date().toISOString() }
          : item,
      ),
    }));
    if (target) {
      await get().sendDesktopNotification(
        "⏭️ Item Skipped",
        `Skipped reply card for ${target.sender}`,
      );
    }
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("skip_queue_item", { id });
      } catch (err) {
        console.error("Failed to persist skip to Tauri SQLite:", err);
        // Revert optimistic update on failure
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "pending",
                  updated_at: new Date().toISOString(),
                }
              : item,
          ),
        }));
        get().showStatusMessage(
          "error",
          "Failed to skip item — please try again.",
        );
      }
    }
  },

  updateDraft: (id: string, text: string) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, draft_text: text, updated_at: new Date().toISOString() }
          : item,
      ),
    }));
  },

  regenerateDraft: async (
    id: string,
    tone: "shorter" | "formal" | "availability",
  ) => {
    const target = get().items.find((i) => i.id === id);
    if (!target || !target.draft_text) return;

    // Try Ollama-backed tone refinement first
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const refined = await invoke<string>("regenerate_draft_command", {
          originalDraft: target.draft_text,
          senderName: target.sender,
          tone,
        });
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  draft_text: refined,
                  updated_at: new Date().toISOString(),
                }
              : item,
          ),
        }));
        get().sendDesktopNotification(
          `✨ Draft Refined (${tone.toUpperCase()})`,
          `Updated reply draft for ${target.sender}`,
        );
        return;
      } catch {
        // Ollama unavailable — fall through to template fallback
      }
    }

    // Template fallback when Ollama is offline
    let newDraft = target.draft_text;
    if (tone === "shorter") {
      newDraft = "Thanks, received. Will follow up shortly.";
    } else if (tone === "formal") {
      newDraft =
        "Thank you for your message. I have noted the details and will provide a formal response by end of week.";
    } else if (tone === "availability") {
      newDraft =
        "Thanks for the invite. Could you send a few time options and I'll confirm what works on my end?";
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              draft_text: newDraft,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    }));
    get().sendDesktopNotification(
      `✨ Draft Refined (${tone.toUpperCase()})`,
      `Updated reply draft for ${target.sender}`,
    );
  },

  approveSocialPost: async (id: string, editedContent?: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;

    const finalContent =
      editedContent !== undefined ? editedContent : target.content;

    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id
          ? { ...post, status: "posted", content: finalContent }
          : post,
      ),
    }));

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(finalContent);
      }
    } catch (err) {
      console.warn("Clipboard write warning:", err);
    }

    const shareUrl =
      target.platform === "linkedin"
        ? `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(finalContent)}`
        : `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalContent)}`;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_external_url", { url: shareUrl });
      } catch (err) {
        console.warn("Tauri open_external_url fallback:", err);
        window.open(shareUrl, "_blank");
      }
    } else if (typeof window !== "undefined") {
      window.open(shareUrl, "_blank");
    }

    const platformLabel =
      target.platform === "linkedin" ? "LinkedIn" : "Twitter / X";
    await get().sendDesktopNotification(
      `🚀 ${platformLabel} Post Approved`,
      `Copied to clipboard! Opened ${platformLabel} composer window.`,
    );
  },

  skipSocialPost: (id: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id ? { ...post, status: "skipped" } : post,
      ),
    }));

    if (target) {
      get().sendDesktopNotification(
        "⏭️ Social Brief Skipped",
        `Skipped ${target.platform.toUpperCase()} post brief for ${target.topic}`,
      );
    }
  },

  publishLinkedInPost: async (id: string, content?: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;
    const finalContent = content !== undefined ? content : target.content;

    set({ publishingStatus: "publishing", publishingError: null });

    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const postId = await invoke<string>("publish_linkedin_post_command", {
          text: finalContent,
        });

        // Mark as posted in store
        set((state) => ({
          publishingStatus: "success",
          socialPosts: state.socialPosts.map((post) =>
            post.id === id
              ? { ...post, status: "posted", content: finalContent }
              : post,
          ),
        }));

        await get().sendDesktopNotification(
          "🚀 Published to LinkedIn",
          `Post published directly via API${postId !== "published" ? ` (ID: ${postId})` : ""}. No browser needed.`,
        );
      } else {
        throw new Error("Tauri not available — cannot publish directly.");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      set({ publishingStatus: "error", publishingError: errMsg });
      await get().sendDesktopNotification(
        "❌ LinkedIn Publish Failed",
        errMsg.length > 100 ? errMsg.slice(0, 100) + "…" : errMsg,
      );
    }
  },

  regenerateSocialPost: async (
    id: string,
    tone: "punchy" | "detailed" | "thread" | "leadership" | "story",
  ) => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;

    // Try Ollama-backed generation first
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>(
          "generate_social_content_command",
          {
            platform: target.platform,
            topic: target.topic,
            tone,
          },
        );
        set((state) => ({
          socialPosts: state.socialPosts.map((post) =>
            post.id === id ? { ...post, content } : post,
          ),
        }));
        get().sendDesktopNotification(
          `✨ Social Brief Refined (${tone.toUpperCase()})`,
          `Updated ${target.platform.toUpperCase()} draft content`,
        );
        return;
      } catch {
        // Ollama unavailable — fall through to template fallback
      }
    }

    // Template fallback when Ollama is offline
    let newContent = target.content;
    if (tone === "punchy") {
      newContent = `Shipped ${target.topic}. Clean, zero-latency, and lightning fast. 🚀 #BuildInPublic #AI`;
    } else if (tone === "detailed") {
      newContent = `Deep dive into ${target.topic}:\n- Architectural design & local state management\n- Real-world benchmark performance\n- Key lessons learned building local-first executive software. #Tech #AI`;
    } else if (tone === "thread") {
      newContent = `1/ How we built ${target.topic}:\n\n2/ The key challenge was local state performance...\n\n3/ Here is what we learned 🧵 #IndieHacker`;
    } else if (tone === "leadership") {
      newContent = `Building great software isn't just about code — it's about reducing executive cognitive load.\n\nHere is how we approached ${target.topic}:\n\n1. Prioritize user privacy.\n2. Local-first AI fallback.\n3. High-signal automation.\n\nWhat's your approach? #Leadership #Tech`;
    } else if (tone === "story") {
      newContent = `A few weeks ago, we noticed a major bottleneck in our workflow.\n\nInstead of patching symptoms, we rebuilt ${target.topic} from scratch.\n\nThe result? Zero latency, 100% data privacy, and full executive control. #BuildInPublic`;
    }

    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id ? { ...post, content: newContent } : post,
      ),
    }));
    get().sendDesktopNotification(
      `✨ Social Brief Refined (${tone.toUpperCase()})`,
      `Updated ${target.platform.toUpperCase()} draft content`,
    );
  },

  createSocialPost: async (platform: SocialPlatform, topic: string) => {
    // Generate a stub immediately so the UI shows something
    const stub: SocialPost = {
      id: `soc-${Date.now()}`,
      platform,
      topic,
      content: `Generating ${platform} post about: ${topic}…`,
      hashtags: [],
      media_cue: "",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    set((state) => ({ socialPosts: [stub, ...state.socialPosts] }));

    // Try Ollama for real content
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>(
          "generate_social_content_command",
          {
            platform,
            topic,
            tone: platform === "linkedin" ? "leadership" : "punchy",
          },
        );
        set((state) => ({
          socialPosts: state.socialPosts.map((p) =>
            p.id === stub.id ? { ...p, content } : p,
          ),
        }));
        get().sendDesktopNotification(
          `✍️ New ${platform.toUpperCase()} Brief Generated`,
          `Created social post brief for "${topic}"`,
        );
        return;
      } catch {
        // Fall through to template
      }
    }

    // Template fallback
    const fallback =
      platform === "linkedin"
        ? `Excited to share thoughts on: ${topic}. Building in public and pushing what's possible with local-first AI. #BuildInPublic #AI`
        : `1/ Quick breakdown on ${topic} 🧵\n\nBuilding local-first apps. #BuildInPublic`;

    set((state) => ({
      socialPosts: state.socialPosts.map((p) =>
        p.id === stub.id ? { ...p, content: fallback } : p,
      ),
    }));
    get().sendDesktopNotification(
      `✍️ New ${platform.toUpperCase()} Brief Generated`,
      `Created social post brief for "${topic}"`,
    );
  },

  generateCadenceLinkedInPost: async () => {
    const topics = [
      "Local-First Executive Chief-of-Staff Software Architecture",
      "AI Multilingual Triage & High-Signal Inbox Management",
      "Building Latency-Free Native Desktop Apps with Tauri & Rust",
      "Privately Hosting Open-Source 70B Frontier LLMs Locally",
    ];
    const chosenTopic = topics[Math.floor(Math.random() * topics.length)];

    const stub: SocialPost = {
      id: `soc-cadence-${Date.now()}`,
      platform: "linkedin",
      topic: chosenTopic,
      content: `Generating post about: ${chosenTopic}…`,
      hashtags: ["#BuildInPublic", "#AI", "#Tech", "#Leadership"],
      media_cue: "System architecture diagram or clean workflow GIF",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    set((state) => ({ socialPosts: [stub, ...state.socialPosts] }));

    // Try Ollama
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>(
          "generate_social_content_command",
          {
            platform: "linkedin",
            topic: chosenTopic,
            tone: "leadership",
          },
        );
        set((state) => ({
          socialPosts: state.socialPosts.map((p) =>
            p.id === stub.id ? { ...p, content } : p,
          ),
        }));
        get().sendDesktopNotification(
          "🗓️ Cadence Post Draft Ready",
          `Auto-generated LinkedIn post for: "${chosenTopic}"`,
        );
        return;
      } catch {
        // Fallback below
      }
    }

    const fallback = `💡 ${chosenTopic}\n\nHere is a quick breakdown of what we're building:\n\n- Zero cloud dependencies for user privacy\n- Instant local AI response generation\n- Seamless OAuth multi-channel sync\n\nHow are you optimizing your workflow this week? #BuildInPublic #AI #Leadership`;
    set((state) => ({
      socialPosts: state.socialPosts.map((p) =>
        p.id === stub.id ? { ...p, content: fallback } : p,
      ),
    }));
    get().sendDesktopNotification(
      "🗓️ Cadence Post Draft Ready",
      `Auto-generated LinkedIn post for: "${chosenTopic}"`,
    );
  },

  remixInsightToPersonalPost: (insight: FeedInsight) => {
    const topicTitle = `Learnings from ${insight.author_name}: ${insight.domain_tag}`;
    const remixedContent = `💡 Inspired by a post from ${insight.author_name} (${insight.author_title}):\n\n"${insight.core_lesson}"\n\nHere is how we apply this framework in Wardyn:\n- ${insight.actionable_application}\n\nWhat are your thoughts on this approach? ${insight.domain_tag} #Leadership`;

    const newPost: SocialPost = {
      id: `soc-remix-${Date.now()}`,
      platform: "linkedin",
      topic: topicTitle,
      content: remixedContent,
      hashtags: [insight.domain_tag, "#BuildInPublic", "#Tech"],
      media_cue: `Learned copywriting framework: ${insight.copy_structure}`,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      socialPosts: [newPost, ...state.socialPosts],
    }));

    get().sendDesktopNotification(
      "♻️ Feed Insight Remixed",
      `Created personalized LinkedIn post draft inspired by ${insight.author_name}`,
    );
  },

  syncLinkedInTimeline: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const authStatus = await invoke<string | null>(
          "get_linkedin_auth_status",
        );
        if (!authStatus) {
          await get().sendDesktopNotification(
            "💼 LinkedIn Account Unsynced",
            'Click "Connect LinkedIn OAuth" in Channels or Settings to connect your personal profile.',
          );
          return;
        }

        const summary = await invoke<LinkedInTimelineSummary>(
          "fetch_linkedin_timeline_command",
        );
        set({ linkedInSummary: summary });
        await get().sendDesktopNotification(
          "💼 LinkedIn Personal Profile & Feed Synced",
          `Fetched network insights & feed briefs for ${summary.profile_name}`,
        );
      } catch (err: any) {
        console.info("LinkedIn live API check:", err);
      }
    }
  },

  checkGmailStatus: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const res = await invoke<string[] | string | null>(
          "get_gmail_auth_status",
        );
        const list: string[] = Array.isArray(res) ? res : res ? [res] : [];
        set({ gmailAccounts: list, gmailAccount: list[0] || null });

        if (list.length > 0) {
          const label =
            list.length === 1 ? list[0] : `${list.length} Connected Accounts`;
          set((state) => ({
            channels: state.channels.map((c) => {
              if (c.id === "gmail")
                return { ...c, status: "connected", accountLabel: label };
              if (c.id === "calendar")
                return {
                  ...c,
                  status: "connected",
                  accountLabel: "Via Gmail OAuth",
                };
              return c;
            }),
          }));
        } else {
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === "gmail" || c.id === "calendar"
                ? { ...c, status: "disconnected", accountLabel: undefined }
                : c,
            ),
          }));
        }
      } catch (err) {
        console.error("Failed to check Gmail auth status:", err);
      }

      // LinkedIn check is independent — a failure here must not affect Gmail state
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const linkedinAccount = await invoke<string | null>(
          "get_linkedin_auth_status",
        );
        if (linkedinAccount) {
          set({ linkedInAccount: linkedinAccount });
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === "linkedin"
                ? { ...c, status: "connected", accountLabel: linkedinAccount }
                : c,
            ),
          }));
        }
      } catch {
        // LinkedIn not connected — non-fatal
      }
    }
  },

  connectGmail: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");

      // Validate: check user has saved Google credentials before opening browser
      const creds = await invoke<{
        google_client_id: string | null;
        google_client_secret: string | null;
      }>("get_oauth_credentials_command");
      const clientId = creds?.google_client_id?.trim() ?? "";
      const clientSecret = creds?.google_client_secret?.trim() ?? "";
      if (!clientId || clientId.includes("YOUR_GOOGLE")) {
        const msg =
          "Google Client ID not set. Go to Settings → OAuth Credentials first.";
        set({ error: msg });
        await get().sendDesktopNotification("⚠️ Gmail Setup Required", msg);
        throw new Error(msg);
      }
      if (!clientSecret) {
        const msg =
          "Google Client Secret not set. Go to Settings → OAuth Credentials first.";
        set({ error: msg });
        await get().sendDesktopNotification("⚠️ Gmail Setup Required", msg);
        throw new Error(msg);
      }

      const email = await invoke<string>("start_gmail_auth");
      // Update channel state immediately — don't wait for sync to unblock the button
      await get().checkGmailStatus();
      // Kick off inbox sync in background — non-blocking
      get().syncGmail().catch(console.error);
      await get().sendDesktopNotification(
        "🔒 Gmail Account Connected",
        `Successfully authenticated: ${email}`,
      );
    }
  },

  disconnectGmail: async (targetEmail?: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("disconnect_gmail", { email: targetEmail || null });
        await get().checkGmailStatus();
        await get().sendDesktopNotification(
          "Gmail Disconnected",
          targetEmail
            ? `Cleared credentials for ${targetEmail}`
            : "Cleared all Gmail credentials.",
        );
      } catch (err) {
        console.error("Failed to disconnect Gmail:", err);
      }
    }
  },

  syncGmail: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const newItemsCount = await invoke<number>("sync_gmail_messages");
        await get().fetchItems();
        await get().syncCalendarDeadlines();
        await get().fetchTasks();

        if (newItemsCount > 0) {
          const latestItems = get().items;
          const urgentFlagged = latestItems.find(
            (i) => i.flagged && i.status === "pending",
          );
          const highUrgentItem = latestItems.find(
            (i) =>
              (i.urgency === "high" || !i.urgency) && i.status === "pending",
          );

          if (urgentFlagged) {
            await get().sendDesktopNotification(
              "⚠️ Urgent Visa / Deadline Alert",
              `Action Required: ${urgentFlagged.sender} — ${urgentFlagged.preview}`,
            );
          } else if (highUrgentItem) {
            await get().sendDesktopNotification(
              "📩 Priority Message Triaged",
              `High Urgency: ${highUrgentItem.sender} — ${highUrgentItem.preview}`,
            );
          } else {
            console.log(
              `[Executive Triage] ${newItemsCount} low-urgency item(s) suppressed from desktop alerts and batched to Daily Digest.`,
            );
          }
        }
      } catch (err: any) {
        if (
          err.toString().includes("revoked") ||
          err.toString().includes("expired")
        ) {
          set({ gmailAccount: null });
        }
        console.error("Sync Gmail error:", err);
      }
    }
  },

  processItemWithOllama: async (id: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const updatedItem = await invoke<QueueItem>(
          "process_item_with_ollama",
          { id },
        );
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? updatedItem : i)),
        }));
      } catch (err) {
        console.error("Ollama processing error:", err);
      }
    }
  },

  syncCalendarDeadlines: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const events = await invoke<SyncedCalendarEvent[]>(
          "sync_calendar_deadlines_command",
        );
        const customEvents = get().calendarEvents.filter((e) =>
          e.id.startsWith("custom_"),
        );
        set({ calendarEvents: [...customEvents, ...events] });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Calendar sync error:", msg);
        // Surface scope/auth errors directly so the user knows what to do
        if (
          msg.includes("403") ||
          msg.includes("scope") ||
          msg.includes("401") ||
          msg.includes("expired")
        ) {
          get().showStatusMessage("error", msg);
        } else {
          get().showStatusMessage(
            "error",
            "Calendar sync failed. Custom events were preserved.",
          );
        }
      }
    }
  },

  fetchMorningBrief: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        set({ morningBriefLoading: true });
        const { invoke } = await import("@tauri-apps/api/core");
        const brief = await invoke<string>("get_morning_brief_command");
        set({ morningBrief: brief, morningBriefLoading: false });
      } catch (err) {
        console.error("Morning brief fetch error:", err);
        set({ morningBriefLoading: false });
      }
    }
  },

  refreshMorningBrief: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        set({ morningBriefLoading: true, morningBrief: null });
        const { invoke } = await import("@tauri-apps/api/core");
        const brief = await invoke<string>("refresh_morning_brief_command");
        set({ morningBrief: brief, morningBriefLoading: false });
      } catch (err) {
        console.error("Morning brief refresh error:", err);
        set({ morningBriefLoading: false });
      }
    }
  },

  saveKnowledgeItem: async (content: string, url?: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const item = await invoke<KnowledgeItem>(
          "save_knowledge_item_command",
          {
            content,
            url: url || null,
            source: "manual",
          },
        );
        // Optimistically prepend; Ollama tagging happens in background on server
        set((state) => ({ knowledgeItems: [item, ...state.knowledgeItems] }));
        // Re-fetch after brief delay to pick up Ollama tags
        setTimeout(() => get().fetchKnowledgeItems(), 8000);
      } catch (err) {
        console.error("Save knowledge item error:", err);
      }
    }
  },

  fetchKnowledgeItems: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const items = await invoke<KnowledgeItem[]>(
          "get_knowledge_items_command",
        );
        set({ knowledgeItems: items });
      } catch (err) {
        console.error("Fetch knowledge items error:", err);
      }
    }
  },

  saveDecision: async (
    decision: string,
    rationale: string,
    alternatives?: string,
  ) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const item = await invoke<Decision>("save_decision_command", {
          decision,
          rationale,
          alternatives: alternatives || null,
        });
        set((state) => ({ decisions: [item, ...state.decisions] }));
      } catch (err) {
        console.error("Save decision error:", err);
      }
    }
  },

  fetchDecisions: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const items = await invoke<Decision[]>("get_decisions_command");
        set({ decisions: items });
      } catch (err) {
        console.error("Fetch decisions error:", err);
      }
    }
  },

  updateDecisionOutcome: async (id: string, outcome: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_decision_outcome_command", { id, outcome });
        set((state) => ({
          decisions: state.decisions.map((d) =>
            d.id === id ? { ...d, outcome } : d,
          ),
        }));
      } catch (err) {
        console.error("Update decision outcome error:", err);
      }
    }
  },

  fetchWeeklyReview: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        set({ weeklyReviewLoading: true });
        const { invoke } = await import("@tauri-apps/api/core");
        const review = await invoke<string>("get_weekly_review_command");
        set({ weeklyReview: review, weeklyReviewLoading: false });
      } catch (err) {
        console.error("Weekly review fetch error:", err);
        set({ weeklyReviewLoading: false });
      }
    }
  },

  refreshWeeklyReview: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        set({ weeklyReviewLoading: true, weeklyReview: null });
        const { invoke } = await import("@tauri-apps/api/core");
        const review = await invoke<string>("refresh_weekly_review_command");
        set({ weeklyReview: review, weeklyReviewLoading: false });
      } catch (err) {
        console.error("Weekly review refresh error:", err);
        set({ weeklyReviewLoading: false });
      }
    }
  },

  recordFeedInteraction: async (
    itemId: string,
    itemSource: string,
    tags: string,
    action: string,
  ) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("record_feed_interaction_command", {
          itemId,
          itemSource,
          tags,
          action,
        });
      } catch (err) {
        console.error("Record feed interaction error:", err);
      }
    }
  },

  speakText: async (text: string) => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
      return;
    set({ isPlayingAudio: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("speak_text_command", { text });
      // Backend emits "speech-ended" when the macOS `say` process finishes naturally.
      // Listen once and auto-reset isPlayingAudio.
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen("speech-ended", () => {
        set({ isPlayingAudio: false });
        unlisten();
      });
    } catch (err) {
      console.error("Speech synthesis error:", err);
      // Reset immediately on error — audio never started
      set({ isPlayingAudio: false });
    }
  },

  stopSpeech: async () => {
    // Always reset state first — optimistic, so UI responds instantly
    set({ isPlayingAudio: false });
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
      return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_speech_command");
    } catch (err) {
      console.error("Stop speech error:", err);
      // State already reset above — nothing else to do
    }
  },

  fetchVaultPath: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = await invoke<string | null>("get_vault_path_command");
        set({ vaultPath: path });
      } catch (err) {
        console.error("Fetch vault path error:", err);
      }
    }
  },

  setVaultPath: async (path: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_vault_path_command", { path });
        set({ vaultPath: path });
      } catch (err) {
        console.error("Set vault path error:", err);
      }
    }
  },

  fetchCustomFeeds: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const feeds = await invoke<CustomFeed[]>("get_custom_feeds_command");
        set({ customFeeds: feeds });
      } catch (err) {
        console.error("Fetch custom feeds error:", err);
      }
    }
  },

  addCustomFeed: async (title: string, url: string, category?: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const feed = await invoke<CustomFeed>("add_custom_feed_command", {
          title,
          url,
          category: category || "custom",
        });
        set((state) => ({ customFeeds: [feed, ...state.customFeeds] }));
      } catch (err) {
        console.error("Add custom feed error:", err);
      }
    }
  },

  deleteCustomFeed: async (id: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_custom_feed_command", { id });
        set((state) => ({
          customFeeds: state.customFeeds.filter((f) => f.id !== id),
        }));
      } catch (err) {
        console.error("Delete custom feed error:", err);
      }
    }
  },

  deepReadUrl: async (url: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("deep_read_url_command", { url });
    }
    return "Tauri environment required for deep URL reading.";
  },

  // ─── Analytics Actions ───────────────────────────────────────────────────────

  fetchResponseAnalytics: async (days: number) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const analytics = await invoke<ResponseAnalytics[]>(
          "get_response_analytics_command",
          { days },
        );
        set({ responseAnalytics: analytics });
      } catch (err) {
        console.error("Fetch response analytics error:", err);
      }
    }
  },

  fetchCategoryResponseTimes: async (days: number) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const times = await invoke<Array<[string, number]>>(
          "get_avg_response_time_by_category_command",
          { days },
        );
        const formatted = times.map(([category, avg_time_seconds]) => ({
          category,
          avg_time_seconds,
        }));
        set({ categoryResponseTimes: formatted });
      } catch (err) {
        console.error("Fetch category response times error:", err);
      }
    }
  },

  exportAnalyticsSummary: async (markdown: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<string>("export_analytics_summary_command", {
          content: markdown,
        });
      } catch (err) {
        console.error("Export analytics summary error:", err);
        return null;
      }
    }
    return null;
  },

  // ─── Productivity: Tasks ─────────────────────────────────────────────────────

  createTask: async (
    title: string,
    description?: string,
    sourceItemId?: string,
    dueDate?: string,
    priority?: string,
  ) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const task = await invoke<Task>("create_task_command", {
          title,
          description: description || null,
          sourceItemId: sourceItemId || null,
          dueDate: dueDate || null,
          priority: priority || "medium",
        });
        set((state) => ({ tasks: [task, ...state.tasks] }));
      } catch (err) {
        console.error("Create task error:", err);
        get().showStatusMessage("error", "Failed to create task.");
      }
    }
  },

  createTaskFromItem: async (
    itemId: string,
    title: string,
    description?: string,
    priority?: string,
  ) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const task = await invoke<Task>("create_task_from_item_command", {
          itemId,
          title,
          description: description || null,
          priority: priority || "medium",
        });
        set((state) => ({ tasks: [task, ...state.tasks] }));
        get().showStatusMessage("success", "Task created from email.");
        return task;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        get().showStatusMessage(
          "error",
          msg.includes("already exists")
            ? "A task already exists for this email."
            : "Failed to create task from email.",
        );
        return null;
      }
    }
    return null;
  },

  fetchTasks: async (statusFilter?: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const tasks = await invoke<Task[]>("get_tasks_command", {
          statusFilter: statusFilter || null,
        });
        set({ tasks });
      } catch (err) {
        console.error("Fetch tasks error:", err);
      }
    }
  },

  updateTaskStatus: async (id: string, status: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_task_status_command", { id, status });
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: status as any,
                  completed_at:
                    status === "completed" ? new Date().toISOString() : null,
                }
              : t,
          ),
        }));
      } catch (err) {
        console.error("Update task status error:", err);
      }
    }
  },

  deleteTask: async (id: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_task_command", { id });
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      } catch (err) {
        console.error("Delete task error:", err);
      }
    }
  },

  // ─── Productivity: Reminders ─────────────────────────────────────────────────

  createReminder: async (
    itemId: string,
    reminderDate: string,
    message: string,
  ) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const reminder = await invoke<Reminder>("create_reminder_command", {
          itemId,
          reminderDate,
          message,
        });
        set((state) => ({ reminders: [reminder, ...state.reminders] }));
        get().showStatusMessage("success", "Follow-up reminder set.");
      } catch (err) {
        console.error("Create reminder error:", err);
      }
    }
  },

  fetchReminders: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const reminders = await invoke<Reminder[]>("get_reminders_command");
        set({ reminders });
      } catch (err) {
        console.error("Fetch reminders error:", err);
      }
    }
  },

  deleteReminder: async (id: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_reminder_command", { id });
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
        }));
      } catch (err) {
        console.error("Delete reminder error:", err);
        get().showStatusMessage("error", "Failed to delete reminder.");
      }
    }
  },

  snoozeReminder: async (id: string, newDate: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("snooze_reminder_command", { id, newDate });
        await get().fetchReminders();
        get().showStatusMessage("success", "Reminder snoozed.");
      } catch (err) {
        console.error("Snooze reminder error:", err);
        get().showStatusMessage("error", "Failed to snooze reminder.");
      }
    }
  },

  checkPendingReminders: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const pending = await invoke<Reminder[]>(
          "get_pending_reminders_command",
        );

        for (const reminder of pending) {
          await invoke("mark_reminder_triggered_command", { id: reminder.id });
          await get().sendDesktopNotification(
            "⏰ Follow-up Reminder",
            reminder.message,
          );
        }

        if (pending.length > 0) {
          await get().fetchReminders();
        }
      } catch (err) {
        console.error("Check pending reminders error:", err);
      }
    }
  },

  // ─── Productivity: Pomodoro ──────────────────────────────────────────────────

  startPomodoro: async (taskId?: string, durationMinutes: number = 25) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        clearPomodoroAutoCompleteTimer();
        const { invoke } = await import("@tauri-apps/api/core");
        const session = await invoke<PomodoroSession>(
          "start_pomodoro_command",
          {
            taskId: taskId || null,
            durationMinutes,
          },
        );
        set({ activePomodoroSession: session });

        await get().sendDesktopNotification(
          "🍅 Pomodoro Started",
          `Focus session started: ${durationMinutes} minutes`,
        );

        schedulePomodoroAutoComplete(
          session.id,
          durationMinutes * 60 * 1000,
          async () => {
            await get().completePomodoro(session.id);
            await get().sendDesktopNotification(
              "✅ Pomodoro Complete",
              "Great work! Time for a break.",
            );
          },
        );
      } catch (err) {
        console.error("Start pomodoro error:", err);
        get().showStatusMessage("error", "Failed to start Pomodoro session.");
      }
    }
  },

  completePomodoro: async (id: string) => {
    clearPomodoroAutoCompleteTimer();
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("complete_pomodoro_command", { id });
        set({ activePomodoroSession: null });
      } catch (err) {
        console.error("Complete pomodoro error:", err);
      }
    }
  },

  restoreActivePomodoro: () => {
    const { pomodoroSessions, activePomodoroSession } = get();
    if (activePomodoroSession) return;

    const now = Date.now();
    const active = pomodoroSessions.find((session) => {
      if (session.completed) return false;
      const endTime =
        new Date(session.started_at).getTime() +
        session.duration_minutes * 60 * 1000;
      return endTime > now;
    });

    if (!active) return;

    set({ activePomodoroSession: active });
    const remainingMs =
      new Date(active.started_at).getTime() +
      active.duration_minutes * 60 * 1000 -
      now;
    schedulePomodoroAutoComplete(active.id, remainingMs, async () => {
      await get().completePomodoro(active.id);
      await get().sendDesktopNotification(
        "✅ Pomodoro Complete",
        "Great work! Time for a break.",
      );
    });
  },

  fetchPomodoroSessions: async (days: number) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const sessions = await invoke<PomodoroSession[]>(
          "get_pomodoro_sessions_command",
          { days },
        );
        set({ pomodoroSessions: sessions });
        get().restoreActivePomodoro();
      } catch (err) {
        console.error("Fetch pomodoro sessions error:", err);
      }
    }
  },

  // ─── Ollama Model Guard ─────────────────────────────────────────────────────

  checkOllamaModels: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const models = await invoke<
          Array<{ name: string; size_gb: string; status: string }>
        >("get_installed_ollama_models_command");
        set({ ollamaModels: models, ollamaChecked: true });
      } catch {
        // Ollama not running — only mark checked (showing banner) after a retry.
        // First failure is silently ignored; App.tsx retries after 3s.
        const alreadyChecked = get().ollamaChecked;
        if (alreadyChecked) {
          // Second+ failure — Ollama is genuinely unavailable, show the banner
          set({ ollamaModels: [], ollamaChecked: true });
        }
        // First failure: leave ollamaChecked: false so banner stays hidden until retry
      }
    } else {
      set({ ollamaChecked: true });
    }
  },

  initOllamaProgressListener: async () => {
    if (get()._ollamaListenerInitialized) return;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        set({ _ollamaListenerInitialized: true });
        await listen<any>("ollama-pull-progress", (event) => {
          const data = event.payload;
          if (data && data.model) {
            // Move from pending to active progress tracking
            const { [data.model]: _removed, ...remainingPending } =
              get().pendingDownloads;
            set((state) => ({
              pendingDownloads: remainingPending,
              pullProgress: {
                ...state.pullProgress,
                [data.model]: {
                  status: data.status,
                  completed: data.completed,
                  total: data.total,
                  percent: data.percent,
                  done: data.done,
                  error: data.error,
                },
              },
            }));
            if (data.done) {
              get().checkOllamaModels();
              if (data.error) {
                // Show error banner to user
                get().showStatusMessage(
                  "error",
                  `Model ${data.model} download failed: ${data.error}`,
                );
                // Clean up the error entry after 5 s so the card resets to "Install Model"
                setTimeout(() => {
                  set((state) => {
                    const updated = { ...state.pullProgress };
                    if (
                      updated[data.model]?.done &&
                      updated[data.model]?.error
                    ) {
                      delete updated[data.model];
                    }
                    return { pullProgress: updated };
                  });
                }, 5_000);
              } else {
                get().sendDesktopNotification(
                  "🎉 AI Model Installed",
                  `Model ${data.model} has been downloaded and is ready for local AI synthesis.`,
                );
              }
            }
          }
        });
      } catch (err) {
        console.warn("Failed to attach ollama-pull-progress listener:", err);
      }
    }
  },

  installOllamaModel: async (modelName: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        // 1. Ensure listener is registered BEFORE invoking, so we never miss the first event
        await get().initOllamaProgressListener();

        // 2. Immediately mark as pending so UI shows downloading state
        set((state) => ({
          pendingDownloads: { ...state.pendingDownloads, [modelName]: true },
        }));

        // 3. Safety net: if no progress event arrives within 30 s, auto-clear pending
        //    and show an error. This catches cases where Rust emits no event at all.
        const timeoutId = setTimeout(() => {
          const state = get();
          if (
            modelName in state.pendingDownloads &&
            !state.pullProgress[modelName]
          ) {
            const { [modelName]: _removed, ...rest } = get().pendingDownloads;
            set({ pendingDownloads: rest });
            get().showStatusMessage(
              "error",
              `Download of ${modelName} timed out — Ollama may not be running. Start Ollama and try again.`,
            );
          }
        }, 30_000);

        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("install_ollama_model_command", { modelName });

        // If invoke itself returns without error, clear the safety timeout
        // (the background thread will drive progress via events from here)
        clearTimeout(timeoutId);
      } catch (err: any) {
        // invoke() threw — remove from pending immediately
        const { [modelName]: _removed, ...rest } = get().pendingDownloads;
        set({ pendingDownloads: rest });
        get().showStatusMessage(
          "error",
          `Failed to start model download: ${err?.message || err}`,
        );
      }
    }
  },

  cancelOllamaModelInstall: async (modelName: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("cancel_model_install_command", { modelName });
        set((state) => {
          const updated = { ...state.pullProgress };
          delete updated[modelName];
          const { [modelName]: _removed, ...remainingPending } =
            state.pendingDownloads;
          return { pullProgress: updated, pendingDownloads: remainingPending };
        });
      } catch (err: any) {
        get().showStatusMessage(
          "error",
          `Failed to cancel download: ${err?.message || err}`,
        );
      }
    }
  },

  // ─── Life Intelligence ─────────────────────────────────────────────────────

  captureLifeEvent: async (text: string) => {
    set({ lifeEventCapturing: true });
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        const event = await invoke<LifeEvent>("capture_life_event_command", {
          text,
        });
        set((s) => ({ lifeEvents: [event, ...s.lifeEvents] }));
        return event;
      }
    } catch (err) {
      console.error("Capture life event error:", err);
      throw err;
    } finally {
      set({ lifeEventCapturing: false });
    }
    return null;
  },

  fetchLifeEvents: async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const events = await invoke<LifeEvent[]>("get_life_events_command");
        set({ lifeEvents: events });
      } catch (err) {
        console.error("Fetch life events error:", err);
      }
    }
  },

  updateLifeEventStatus: async (id: string, status: string) => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_life_event_status_command", { id, status });
        set((s) => ({
          lifeEvents: s.lifeEvents.map((e) =>
            e.id === id ? { ...e, status: status as LifeEvent["status"] } : e,
          ),
        }));
      } catch (err) {
        console.error("Update life event status error:", err);
      }
    }
  },

  // ─── Active Life ───────────────────────────────────────────────────────────

  activeProjects: [],
  dailyHabits: [],
  habitCompletions: [],
  dailyIntel: null,
  dailyIntelLoading: false,
  dayPlan: null,
  dayPlanLoading: false,
  generatedPost: null,
  generatedPostLoading: false,

  fetchActiveProjects: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const projects = await invoke<ActiveProject[]>(
        "get_active_projects_command",
      );
      set({ activeProjects: projects });
    } catch (err) {
      console.error("fetchActiveProjects error:", err);
    }
  },

  addActiveProject: async (
    name: string,
    description?: string,
    daily_target_minutes?: number,
    color?: string,
  ) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const project = await invoke<ActiveProject>(
        "create_active_project_command",
        {
          req: {
            name,
            description: description ?? null,
            daily_target_minutes: daily_target_minutes ?? 60,
            color: color ?? "#4A8FC2",
          },
        },
      );
      set((s) => ({ activeProjects: [project, ...s.activeProjects] }));
    } catch (err) {
      console.error("addActiveProject error:", err);
    }
  },

  updateActiveProject: async (id: string, updates: Partial<ActiveProject>) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_active_project_command", {
        id,
        name: updates.name,
        description: updates.description,
        status: updates.status,
        dailyTargetMinutes: updates.daily_target_minutes,
        color: updates.color,
      });
      set((s) => ({
        activeProjects: s.activeProjects.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      }));
    } catch (err) {
      console.error("updateActiveProject error:", err);
    }
  },

  deleteActiveProject: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_active_project_command", { id });
      set((s) => ({
        activeProjects: s.activeProjects.filter((p) => p.id !== id),
      }));
    } catch (err) {
      console.error("deleteActiveProject error:", err);
    }
  },

  logProjectSession: async (
    projectId: string,
    minutes: number,
    notes?: string,
  ) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("log_project_session_command", {
        projectId,
        minutes,
        notes: notes ?? null,
      });
      // Refresh projects to get updated today_minutes
      const projects = await invoke<ActiveProject[]>(
        "get_active_projects_command",
      );
      set({ activeProjects: projects });
    } catch (err) {
      console.error("logProjectSession error:", err);
    }
  },

  fetchDailyHabits: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const habits = await invoke<DailyHabit[]>("get_daily_habits_command");
      set({ dailyHabits: habits });
    } catch (err) {
      console.error("fetchDailyHabits error:", err);
    }
  },

  addDailyHabit: async (name: string, icon?: string, category?: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const habit = await invoke<DailyHabit>("create_daily_habit_command", {
        req: { name, icon: icon ?? "✅", category: category ?? "general" },
      });
      set((s) => ({ dailyHabits: [...s.dailyHabits, habit] }));
    } catch (err) {
      console.error("addDailyHabit error:", err);
    }
  },

  deleteDailyHabit: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_daily_habit_command", { id });
      set((s) => ({ dailyHabits: s.dailyHabits.filter((h) => h.id !== id) }));
    } catch (err) {
      console.error("deleteDailyHabit error:", err);
    }
  },

  toggleHabitComplete: async (habitId: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const isNowDone = await invoke<boolean>(
        "toggle_habit_completion_command",
        { habitId },
      );
      set((s) => ({
        dailyHabits: s.dailyHabits.map((h) =>
          h.id === habitId
            ? {
                ...h,
                completed_today: isNowDone,
                current_streak: isNowDone
                  ? h.current_streak + 1
                  : Math.max(0, h.current_streak - 1),
              }
            : h,
        ),
      }));
    } catch (err) {
      console.error("toggleHabitComplete error:", err);
    }
  },

  fetchDailyIntel: async (forceRefresh = false) => {
    set({ dailyIntelLoading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const intel = await invoke<DailyIntel>("get_daily_intel_command", {
        forceRefresh,
      });
      set({ dailyIntel: intel, dailyIntelLoading: false });
    } catch (err) {
      console.error("fetchDailyIntel error:", err);
      set({ dailyIntelLoading: false });
    }
  },

  generateDayPlan: async () => {
    set({ dayPlanLoading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const plan = await invoke<string>("generate_day_plan_command");
      set({ dayPlan: plan, dayPlanLoading: false });
      // Also refresh intel to get saved plan
      const intel = await invoke<DailyIntel>("get_daily_intel_command", {
        forceRefresh: false,
      });
      set({ dailyIntel: intel });
    } catch (err) {
      console.error("generateDayPlan error:", err);
      set({ dayPlanLoading: false });
    }
  },

  generateSocialPost: async (
    platform: string,
    idea: string,
    format: string,
  ) => {
    set({ generatedPostLoading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const post = await invoke<GeneratedPost>("generate_social_post_command", {
        platform,
        idea,
        format,
      });
      set({ generatedPost: post, generatedPostLoading: false });
    } catch (err) {
      console.error("generateSocialPost error:", err);
      set({ generatedPostLoading: false });
    }
  },

  // ─── Habit Reminders ───────────────────────────────────────────────────────

  habitReminders: [],

  fetchHabitReminders: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const reminders = await invoke<HabitReminder[]>(
        "get_habit_reminders_command",
      );
      set({ habitReminders: reminders });
    } catch (err) {
      console.error("fetchHabitReminders error:", err);
    }
  },

  addHabitReminder: async (habitId: string, remindTime: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const reminder = await invoke<HabitReminder>(
        "create_habit_reminder_command",
        {
          req: { habit_id: habitId, remind_time: remindTime },
        },
      );
      set((s) => ({
        habitReminders: [
          ...s.habitReminders.filter((r) => r.habit_id !== habitId),
          reminder,
        ],
      }));
    } catch (err) {
      console.error("addHabitReminder error:", err);
    }
  },

  deleteHabitReminder: async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_habit_reminder_command", { id });
      set((s) => ({
        habitReminders: s.habitReminders.filter((r) => r.id !== id),
      }));
    } catch (err) {
      console.error("deleteHabitReminder error:", err);
    }
  },

  toggleHabitReminder: async (id: string, enabled: boolean) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_habit_reminder_command", { id, enabled });
      set((s) => ({
        habitReminders: s.habitReminders.map((r) =>
          r.id === id ? { ...r, enabled } : r,
        ),
      }));
    } catch (err) {
      console.error("toggleHabitReminder error:", err);
    }
  },
}));

// Register the hook with the translations module so useTranslation() can
// subscribe to language changes without a circular ESM dependency.
_registerUseQueueStore(useQueueStore);
