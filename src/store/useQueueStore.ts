import { create } from 'zustand';
import { QueueItem, QueueItemStatus, TabType, SocialPost, SocialPlatform, ChannelConfig, LinkedInTimelineSummary, FeedInsight, KnowledgeItem, Decision, CustomFeed } from '../types/queue';

import { SupportedLanguage, TRANSLATIONS, TranslationDictionary } from '../i18n/translations';


export type PostCadence = 'daily' | 'every_2_days' | 'weekly' | 'manual';

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
    id: 'gmail',
    name: 'Gmail',
    category: 'email',
    description: 'Inbox triage, thread monitoring & voice drafting over OAuth 2.0 PKCE',
    iconName: 'IconMail',
    status: 'disconnected',
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    category: 'email',
    description: 'Auto-sync deadline events and appointment requests automatically',
    iconName: 'IconCalendar',
    status: 'disconnected',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'work',
    description: 'Channels, DMs, workspace mentions, and executive thread triaging',
    iconName: 'IconBrandSlack',
    status: 'disconnected',
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'work',
    description: 'Server channels, direct messages, and bot command triggers',
    iconName: 'IconBrandDiscord',
    status: 'disconnected',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    description: 'Bot API integration for priority direct messaging and channel alerts',
    iconName: 'IconBrandTelegram',
    status: 'disconnected',
  },
  {
    id: 'imessage',
    name: 'iMessage',
    category: 'messaging',
    description: 'Native macOS messaging bridge for priority contact triaging',
    iconName: 'IconBrandApple',
    status: 'disconnected',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    description: 'Executive network outreach, personal profile timeline ingestion & content briefs',
    iconName: 'IconBrandLinkedin',
    status: 'disconnected',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    category: 'social',
    description: 'High-signal DMs, social mentions, and viral thread drafting',
    iconName: 'IconBrandX',
    status: 'disconnected',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'messaging',
    description: 'Priority direct messages and scheduled status updates',
    iconName: 'IconBrandWhatsapp',
    status: 'disconnected',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    category: 'work',
    description: 'Enterprise conversations and Bot Framework bridge',
    iconName: 'IconBrandTeams',
    status: 'disconnected',
  },
];

export interface WeeklyAnalytics {
  week: string; // e.g. "Jul 24"
  emailsTriaged: number;
  hoursSaved: number;
  linkedInImpressions: number;
  postsPublished: number;
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
  fetchItems: () => Promise<void>;
  approveItem: (id: string, editedDraft?: string) => Promise<void>;
  skipItem: (id: string) => Promise<void>;
  updateDraft: (id: string, text: string) => void;
  regenerateDraft: (id: string, tone: 'shorter' | 'formal' | 'availability') => void;
  setTestOverrideRecipient: (email: string | null) => void;

  // Multi-Channel Actions
  connectChannel: (channelId: string, apiKey?: string, webhookUrl?: string) => void;
  disconnectChannel: (channelId: string) => void;

  // LinkedIn OAuth Actions
  connectLinkedIn: () => Promise<void>;

  // Social Post Actions (LinkedIn & Twitter/X)
  approveSocialPost: (id: string, editedContent?: string) => Promise<void>;
  skipSocialPost: (id: string) => void;
  regenerateSocialPost: (id: string, tone: 'punchy' | 'detailed' | 'thread' | 'leadership' | 'story') => void;
  createSocialPost: (platform: SocialPlatform, topic: string) => void;
  generateCadenceLinkedInPost: () => void;
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
  publishingStatus: 'idle' | 'publishing' | 'success' | 'error';
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
  saveDecision: (decision: string, rationale: string, alternatives?: string) => Promise<void>;
  fetchDecisions: () => Promise<void>;

  // Phase C: Weekly Review & Interest Learning
  weeklyReview: string | null;
  weeklyReviewLoading: boolean;
  fetchWeeklyReview: () => Promise<void>;
  refreshWeeklyReview: () => Promise<void>;
  recordFeedInteraction: (itemId: string, itemSource: string, tags: string, action: string) => Promise<void>;

  // Phase D: Audio Brief & Vault Sync
  isPlayingAudio: boolean;
  vaultPath: string | null;
  speakText: (text: string) => Promise<void>;
  stopSpeech: () => Promise<void>;
  fetchVaultPath: () => Promise<void>;
  setVaultPath: (path: string) => Promise<void>;

  // Phase E & F: Custom RSS Feeds & Deep Reader
  customFeeds: CustomFeed[];
  fetchCustomFeeds: () => Promise<void>;
  addCustomFeed: (title: string, url: string, category?: string) => Promise<void>;
  deleteCustomFeed: (id: string) => Promise<void>;
  deepReadUrl: (url: string) => Promise<string>;
}




export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  socialPosts: [],
  channels: INITIAL_CHANNELS,
  calendarEvents: [],
  linkedInSummary: null,
  linkedInAccount: null,
  linkedInCadence: 'every_2_days',
  activeTab: 'today',
  isLoading: false,
  error: null,
  gmailAccount: null,
  gmailAccounts: [],
  testOverrideRecipient: null,

  language: 'en',
  notificationsEnabled: true,
  autoStartEnabled: false,
  syncIntervalMinutes: 5,
  publishingStatus: 'idle',
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






  setLanguage: (lang: SupportedLanguage) => {
    set({ language: lang });
    get().sendDesktopNotification(
      '🌐 Language Updated',
      `Wardyn interface switched to ${lang.toUpperCase()}`
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
    const label = cadence === 'daily' ? 'Daily (9:00 AM)' : cadence === 'every_2_days' ? 'Every 2 Days' : cadence === 'weekly' ? 'Weekly' : 'Manual';
    get().sendDesktopNotification(
      '🗓️ Post Cadence Updated',
      `LinkedIn personal post auto-drafting frequency set to: ${label}`
    );
  },

  toggleNotifications: (enabled: boolean) => {
    set({ notificationsEnabled: enabled });
  },

  checkAutoStartStatus: async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { isEnabled } = await import('@tauri-apps/plugin-autostart');
        const active = await isEnabled();
        set({ autoStartEnabled: active });
      }
    } catch (err) {
      console.warn('Autostart plugin status check failed:', err);
    }
  },

  toggleAutoStart: async (enable: boolean) => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { enable: enableAutostart, disable: disableAutostart } = await import('@tauri-apps/plugin-autostart');
        if (enable) {
          await enableAutostart();
          set({ autoStartEnabled: true });
        } else {
          await disableAutostart();
          set({ autoStartEnabled: false });
        }
      }
    } catch (err) {
      console.error('Autostart toggle failed:', err);
    }
  },

  setSyncInterval: (minutes: number) => {
    set({ syncIntervalMinutes: minutes });
  },

  sendDesktopNotification: async (title: string, body: string) => {
    if (!get().notificationsEnabled) return;
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
        let permission = await isPermissionGranted();
        if (!permission) {
          const permissionGranted = await requestPermission();
          permission = permissionGranted === 'granted';
        }
        if (permission) {
          sendNotification({ title, body });
        }
      }
    } catch (err) {
      console.warn('Desktop notification dispatch unavailable:', err);
    }
  },

  fetchItems: async () => {
    set({ isLoading: true, error: null });
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<QueueItem[]>('get_queue_items');
        set({ items, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      console.warn('Backend IPC not active:', err);
      set({ isLoading: false });
    }
  },

  setTestOverrideRecipient: (email: string | null) => {
    set({ testOverrideRecipient: email });
  },

  connectChannel: (channelId: string, apiKey?: string, webhookUrl?: string) => {
    if (channelId === 'linkedin') {
      get().connectLinkedIn();
      return;
    }

    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId
          ? { ...c, status: 'connected', apiKey, webhookUrl, accountLabel: 'Active Bridge' }
          : c
      ),
    }));

    const ch = get().channels.find((c) => c.id === channelId);
    if (ch) {
      get().sendDesktopNotification(
        `🔌 Channel Connected: ${ch.name}`,
        `Successfully integrated ${ch.name} into Wardyn Multi-Channel Hub.`
      );
    }
  },

  disconnectChannel: (channelId: string) => {
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId
          ? { ...c, status: 'disconnected', accountLabel: undefined, apiKey: undefined, webhookUrl: undefined }
          : c
      ),
    }));
  },

  connectLinkedIn: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const profileName = await invoke<string>('start_linkedin_auth');
        set({ linkedInAccount: profileName });
        set((state) => ({
          channels: state.channels.map((c) =>
            c.id === 'linkedin' ? { ...c, status: 'connected', accountLabel: profileName } : c
          ),
        }));
        await get().syncLinkedInTimeline();
        await get().sendDesktopNotification(
          '💼 LinkedIn Personal Profile Connected',
          `Authenticated profile for: ${profileName}`
        );
      } catch (err: any) {
        set({ error: err.toString() });
      }
    }
  },

  approveItem: async (id: string, editedDraft?: string) => {
    const target = get().items.find((i) => i.id === id);
    if (!target) return;

    const newStatus: QueueItemStatus = editedDraft !== undefined ? 'edited' : 'approved';
    const finalDraft = editedDraft !== undefined ? editedDraft : target.draft_text;

    if (!finalDraft) return;

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: newStatus,
              draft_text: finalDraft,
              updated_at: new Date().toISOString(),
            }
          : item
      ),
    }));

    const actionLabel = editedDraft !== undefined ? '✍️ Edited Reply Sent' : '✅ Reply Approved & Sent';
    const overrideNotice = get().testOverrideRecipient ? ` (to test target: ${get().testOverrideRecipient})` : '';
    await get().sendDesktopNotification(
      actionLabel,
      `Sent response to ${target.sender}${overrideNotice}`
    );

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // Record edit preference pair for continuous voice reinforcement learning
        if (editedDraft !== undefined && target.draft_text && editedDraft !== target.draft_text) {
          invoke('record_voice_edit_command', {
            itemId: id,
            original: target.draft_text,
            edited: editedDraft,
          }).catch(console.error);
        }

        await invoke('send_gmail_reply_command', {
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


      } catch (err: any) {
        console.error('Failed to send via Gmail API:', err);
        set({ error: err.toString() });
      }
    }
  },

  skipItem: async (id: string) => {
    const target = get().items.find((i) => i.id === id);

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'skipped',
              updated_at: new Date().toISOString(),
            }
          : item
      ),
    }));

    if (target) {
      await get().sendDesktopNotification(
        '⏭️ Item Skipped',
        `Skipped reply card for ${target.sender}`
      );
    }

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('skip_queue_item', { id });
      } catch (err) {
        console.error('Failed to persist skip to Tauri SQLite:', err);
      }
    }
  },

  updateDraft: (id: string, text: string) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, draft_text: text, updated_at: new Date().toISOString() }
          : item
      ),
    }));
  },

  regenerateDraft: (id: string, tone: 'shorter' | 'formal' | 'availability') => {
    const target = get().items.find((i) => i.id === id);
    if (!target) return;

    let newDraft = target.draft_text || 'Thanks for reaching out.';
    if (tone === 'shorter') {
      newDraft = 'Thanks, received. Will follow up shortly.';
    } else if (tone === 'formal') {
      newDraft = 'Thank you for your message. I have noted the details and will provide a formal response by Friday.';
    } else if (tone === 'availability') {
      newDraft = 'Thanks for the invite. I am available Thursday between 2pm - 4pm WAT. Let me know if that works.';
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, draft_text: newDraft, updated_at: new Date().toISOString() }
          : item
      ),
    }));

    get().sendDesktopNotification(
      `✨ Draft Refined (${tone.toUpperCase()})`,
      `Updated reply draft for ${target.sender}`
    );
  },

  approveSocialPost: async (id: string, editedContent?: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;

    const finalContent = editedContent !== undefined ? editedContent : target.content;

    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id
          ? { ...post, status: 'posted', content: finalContent }
          : post
      ),
    }));

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(finalContent);
      }
    } catch (err) {
      console.warn('Clipboard write warning:', err);
    }

    const shareUrl = target.platform === 'linkedin'
      ? `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(finalContent)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalContent)}`;

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external_url', { url: shareUrl });
      } catch (err) {
        console.warn('Tauri open_external_url fallback:', err);
        window.open(shareUrl, '_blank');
      }
    } else if (typeof window !== 'undefined') {
      window.open(shareUrl, '_blank');
    }

    const platformLabel = target.platform === 'linkedin' ? 'LinkedIn' : 'Twitter / X';
    await get().sendDesktopNotification(
      `🚀 ${platformLabel} Post Approved`,
      `Copied to clipboard! Opened ${platformLabel} composer window.`
    );
  },

  skipSocialPost: (id: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id ? { ...post, status: 'skipped' } : post
      ),
    }));

    if (target) {
      get().sendDesktopNotification(
        '⏭️ Social Brief Skipped',
        `Skipped ${target.platform.toUpperCase()} post brief for ${target.topic}`
      );
    }
  },

  publishLinkedInPost: async (id: string, content?: string) => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;
    const finalContent = content !== undefined ? content : target.content;

    set({ publishingStatus: 'publishing', publishingError: null });

    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const postId = await invoke<string>('publish_linkedin_post_command', { text: finalContent });

        // Mark as posted in store
        set((state) => ({
          publishingStatus: 'success',
          socialPosts: state.socialPosts.map((post) =>
            post.id === id ? { ...post, status: 'posted', content: finalContent } : post
          ),
        }));


        await get().sendDesktopNotification(
          '🚀 Published to LinkedIn',
          `Post published directly via API${postId !== 'published' ? ` (ID: ${postId})` : ''}. No browser needed.`
        );
      } else {
        throw new Error('Tauri not available — cannot publish directly.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      set({ publishingStatus: 'error', publishingError: errMsg });
      await get().sendDesktopNotification(
        '❌ LinkedIn Publish Failed',
        errMsg.length > 100 ? errMsg.slice(0, 100) + '…' : errMsg
      );
    }
  },


  regenerateSocialPost: (id: string, tone: 'punchy' | 'detailed' | 'thread' | 'leadership' | 'story') => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;

    let newContent = target.content;
    if (tone === 'punchy') {
      newContent = `Shipped ${target.topic}. Clean, zero-latency, and lightning fast. 🚀 #BuildInPublic #AI`;
    } else if (tone === 'detailed') {
      newContent = `Deep dive into ${target.topic}:\n- Architectural design & local state management\n- Real-world benchmark performance\n- Key lessons learned building local-first executive software. #Tech #AI`;
    } else if (tone === 'thread') {
      newContent = `1/ How we built ${target.topic}:\n\n2/ The key challenge was local state performance...\n\n3/ Here is what we learned 🧵 #IndieHacker`;
    } else if (tone === 'leadership') {
      newContent = `Building great software isn't just about code — it's about reducing executive cognitive load.\n\nHere is how we approached ${target.topic}:\n\n1. Prioritize user privacy.\n2. Local-first AI fallback.\n3. High-signal automation.\n\nWhat's your approach? #Leadership #Tech`;
    } else if (tone === 'story') {
      newContent = `A few weeks ago, we noticed a major bottleneck in our workflow.\n\nInstead of patching symptoms, we rebuilt ${target.topic} from scratch.\n\nThe result? Zero latency, 100% data privacy, and full executive control. #BuildInPublic`;
    }

    set((state) => ({
      socialPosts: state.socialPosts.map((post) =>
        post.id === id ? { ...post, content: newContent } : post
      ),
    }));

    get().sendDesktopNotification(
      `✨ Social Brief Refined (${tone.toUpperCase()})`,
      `Updated ${target.platform.toUpperCase()} draft content`
    );
  },

  createSocialPost: (platform: SocialPlatform, topic: string) => {
    const newPost: SocialPost = {
      id: `soc-${Date.now()}`,
      platform,
      topic,
      content: platform === 'linkedin'
        ? `Excited to announce: ${topic}. Building in public and pushing the boundaries of executive chief-of-staff software. #BuildInPublic #AI`
        : `1/ Quick breakdown on ${topic} 🧵\n\nBuilding local-first apps with Tauri & React. #BuildInPublic`,
      hashtags: ['#BuildInPublic', '#Tech', '#AI'],
      media_cue: 'Demo screenshot / screen recording',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      socialPosts: [newPost, ...state.socialPosts],
    }));

    get().sendDesktopNotification(
      `✍️ New ${platform.toUpperCase()} Brief Generated`,
      `Created social post brief for "${topic}"`
    );
  },

  generateCadenceLinkedInPost: () => {
    const topics = [
      'Local-First Executive Chief-of-Staff Software Architecture',
      'AI Multilingual Triage & High-Signal Inbox Management',
      'Building Latency-Free Native Desktop Apps with Tauri & Rust',
      'Privately Hosting Open-Source 70B Frontier LLMs Locally',
    ];
    const chosenTopic = topics[Math.floor(Math.random() * topics.length)];

    const newPost: SocialPost = {
      id: `soc-cadence-${Date.now()}`,
      platform: 'linkedin',
      topic: chosenTopic,
      content: `💡 Scheduled Personal Brief: ${chosenTopic}\n\nHere is a quick breakdown of what we're building:\n\n- Zero cloud dependencies for user privacy\n- Instant local AI response generation\n- Seamless OAuth multi-channel sync\n\nHow are you optimizing your executive workflow this week? #BuildInPublic #AI #Leadership`,
      hashtags: ['#BuildInPublic', '#AI', '#Tech', '#Leadership'],
      media_cue: 'System architecture diagram or clean workflow GIF',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      socialPosts: [newPost, ...state.socialPosts],
    }));

    get().sendDesktopNotification(
      '🗓️ Cadence Post Draft Ready',
      `Auto-generated personal LinkedIn post brief for: "${chosenTopic}"`
    );
  },

  remixInsightToPersonalPost: (insight: FeedInsight) => {
    const topicTitle = `Learnings from ${insight.author_name}: ${insight.domain_tag}`;
    const remixedContent = `💡 Inspired by a post from ${insight.author_name} (${insight.author_title}):\n\n"${insight.core_lesson}"\n\nHere is how we apply this framework in Wardyn:\n- ${insight.actionable_application}\n\nWhat are your thoughts on this approach? ${insight.domain_tag} #Leadership`;

    const newPost: SocialPost = {
      id: `soc-remix-${Date.now()}`,
      platform: 'linkedin',
      topic: topicTitle,
      content: remixedContent,
      hashtags: [insight.domain_tag, '#BuildInPublic', '#Tech'],
      media_cue: `Learned copywriting framework: ${insight.copy_structure}`,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      socialPosts: [newPost, ...state.socialPosts],
    }));

    get().sendDesktopNotification(
      '♻️ Feed Insight Remixed',
      `Created personalized LinkedIn post draft inspired by ${insight.author_name}`
    );
  },

  syncLinkedInTimeline: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const authStatus = await invoke<string | null>('get_linkedin_auth_status');
        if (!authStatus) {
          await get().sendDesktopNotification(
            '💼 LinkedIn Account Unsynced',
            'Click "Connect LinkedIn OAuth" in Channels or Settings to connect your personal profile.'
          );
          return;
        }

        const summary = await invoke<LinkedInTimelineSummary>('fetch_linkedin_timeline_command');
        set({ linkedInSummary: summary });
        await get().sendDesktopNotification(
          '💼 LinkedIn Personal Profile & Feed Synced',
          `Fetched network insights & feed briefs for ${summary.profile_name}`
        );
      } catch (err: any) {
        console.info('LinkedIn live API check:', err);
      }
    }
  },

  checkGmailStatus: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<string[] | string | null>('get_gmail_auth_status');
        const list: string[] = Array.isArray(res) ? res : (res ? [res] : []);
        set({ gmailAccounts: list, gmailAccount: list[0] || null });

        if (list.length > 0) {
          const label = list.length === 1 ? list[0] : `${list.length} Connected Accounts`;
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === 'gmail' ? { ...c, status: 'connected', accountLabel: label } : c
            ),
          }));
        } else {
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === 'gmail' ? { ...c, status: 'disconnected', accountLabel: undefined } : c
            ),
          }));
        }

        const linkedinAccount = await invoke<string | null>('get_linkedin_auth_status');
        if (linkedinAccount) {
          set({ linkedInAccount: linkedinAccount });
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === 'linkedin' ? { ...c, status: 'connected', accountLabel: linkedinAccount } : c
            ),
          }));
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
      }
    }
  },

  connectGmail: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const email = await invoke<string>('start_gmail_auth');
        await get().checkGmailStatus();
        await get().syncGmail();
        await get().sendDesktopNotification(
          '🔒 Gmail Account Connected',
          `Successfully authenticated: ${email}`
        );
      } catch (err: any) {
        set({ error: err.toString() });
      }
    }
  },

  disconnectGmail: async (targetEmail?: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('disconnect_gmail', { email: targetEmail || null });
        await get().checkGmailStatus();
        await get().sendDesktopNotification(
          'Gmail Disconnected',
          targetEmail ? `Cleared credentials for ${targetEmail}` : 'Cleared all Gmail credentials.'
        );
      } catch (err) {
        console.error('Failed to disconnect Gmail:', err);
      }
    }
  },


  syncGmail: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const newItemsCount = await invoke<number>('sync_gmail_messages');
        await get().fetchItems();
        await get().syncCalendarDeadlines();

        if (newItemsCount > 0) {
          const latestItems = get().items;
          const urgentFlagged = latestItems.find((i) => i.flagged && i.status === 'pending');
          const highUrgentItem = latestItems.find((i) => (i.urgency === 'high' || !i.urgency) && i.status === 'pending');

          if (urgentFlagged) {
            await get().sendDesktopNotification(
              '⚠️ Urgent Visa / Deadline Alert',
              `Action Required: ${urgentFlagged.sender} — ${urgentFlagged.preview}`
            );
          } else if (highUrgentItem) {
            await get().sendDesktopNotification(
              '📩 Priority Message Triaged',
              `High Urgency: ${highUrgentItem.sender} — ${highUrgentItem.preview}`
            );
          } else {
            console.log(`[Executive Triage] ${newItemsCount} low-urgency item(s) suppressed from desktop alerts and batched to Daily Digest.`);
          }
        }

      } catch (err: any) {
        if (err.toString().includes('revoked') || err.toString().includes('expired')) {
          set({ gmailAccount: null });
        }
        console.error('Sync Gmail error:', err);
      }
    }
  },

  processItemWithOllama: async (id: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedItem = await invoke<QueueItem>('process_item_with_ollama', { id });
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? updatedItem : i)),
        }));
      } catch (err) {
        console.error('Ollama processing error:', err);
      }
    }
  },

  syncCalendarDeadlines: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const events = await invoke<SyncedCalendarEvent[]>('sync_calendar_deadlines_command');
        set({ calendarEvents: events });
      } catch (err) {
        console.error('Calendar sync error:', err);
      }
    }
  },

  fetchMorningBrief: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ morningBriefLoading: true });
        const { invoke } = await import('@tauri-apps/api/core');
        const brief = await invoke<string>('get_morning_brief_command');
        set({ morningBrief: brief, morningBriefLoading: false });
      } catch (err) {
        console.error('Morning brief fetch error:', err);
        set({ morningBriefLoading: false });
      }
    }
  },

  refreshMorningBrief: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ morningBriefLoading: true, morningBrief: null });
        const { invoke } = await import('@tauri-apps/api/core');
        const brief = await invoke<string>('refresh_morning_brief_command');
        set({ morningBrief: brief, morningBriefLoading: false });
      } catch (err) {
        console.error('Morning brief refresh error:', err);
        set({ morningBriefLoading: false });
      }
    }
  },

  saveKnowledgeItem: async (content: string, url?: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const item = await invoke<KnowledgeItem>('save_knowledge_item_command', {
          content, url: url || null, source: 'manual'
        });
        // Optimistically prepend; Ollama tagging happens in background on server
        set((state) => ({ knowledgeItems: [item, ...state.knowledgeItems] }));
        // Re-fetch after brief delay to pick up Ollama tags
        setTimeout(() => get().fetchKnowledgeItems(), 8000);
      } catch (err) {
        console.error('Save knowledge item error:', err);
      }
    }
  },

  fetchKnowledgeItems: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<KnowledgeItem[]>('get_knowledge_items_command');
        set({ knowledgeItems: items });
      } catch (err) {
        console.error('Fetch knowledge items error:', err);
      }
    }
  },

  saveDecision: async (decision: string, rationale: string, alternatives?: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const item = await invoke<Decision>('save_decision_command', {
          decision, rationale, alternatives: alternatives || null
        });
        set((state) => ({ decisions: [item, ...state.decisions] }));
      } catch (err) {
        console.error('Save decision error:', err);
      }
    }
  },

  fetchDecisions: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const items = await invoke<Decision[]>('get_decisions_command');
        set({ decisions: items });
      } catch (err) {
        console.error('Fetch decisions error:', err);
      }
    }
  },

  fetchWeeklyReview: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ weeklyReviewLoading: true });
        const { invoke } = await import('@tauri-apps/api/core');
        const review = await invoke<string>('get_weekly_review_command');
        set({ weeklyReview: review, weeklyReviewLoading: false });
      } catch (err) {
        console.error('Weekly review fetch error:', err);
        set({ weeklyReviewLoading: false });
      }
    }
  },

  refreshWeeklyReview: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ weeklyReviewLoading: true, weeklyReview: null });
        const { invoke } = await import('@tauri-apps/api/core');
        const review = await invoke<string>('refresh_weekly_review_command');
        set({ weeklyReview: review, weeklyReviewLoading: false });
      } catch (err) {
        console.error('Weekly review refresh error:', err);
        set({ weeklyReviewLoading: false });
      }
    }
  },

  recordFeedInteraction: async (itemId: string, itemSource: string, tags: string, action: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('record_feed_interaction_command', { itemId, itemSource, tags, action });
      } catch (err) {
        console.error('Record feed interaction error:', err);
      }
    }
  },

  speakText: async (text: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ isPlayingAudio: true });
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('speak_text_command', { text });
      } catch (err) {
        console.error('Speech synthesis error:', err);
        set({ isPlayingAudio: false });
      }
    }
  },

  stopSpeech: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        set({ isPlayingAudio: false });
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('stop_speech_command');
      } catch (err) {
        console.error('Stop speech error:', err);
      }
    }
  },

  fetchVaultPath: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const path = await invoke<string | null>('get_vault_path_command');
        set({ vaultPath: path });
      } catch (err) {
        console.error('Fetch vault path error:', err);
      }
    }
  },

  setVaultPath: async (path: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_vault_path_command', { path });
        set({ vaultPath: path });
      } catch (err) {
        console.error('Set vault path error:', err);
      }
    }
  },

  fetchCustomFeeds: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const feeds = await invoke<CustomFeed[]>('get_custom_feeds_command');
        set({ customFeeds: feeds });
      } catch (err) {
        console.error('Fetch custom feeds error:', err);
      }
    }
  },

  addCustomFeed: async (title: string, url: string, category?: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const feed = await invoke<CustomFeed>('add_custom_feed_command', {
          title, url, category: category || 'custom'
        });
        set((state) => ({ customFeeds: [feed, ...state.customFeeds] }));
      } catch (err) {
        console.error('Add custom feed error:', err);
      }
    }
  },

  deleteCustomFeed: async (id: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_custom_feed_command', { id });
        set((state) => ({ customFeeds: state.customFeeds.filter((f) => f.id !== id) }));
      } catch (err) {
        console.error('Delete custom feed error:', err);
      }
    }
  },

  deepReadUrl: async (url: string) => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('deep_read_url_command', { url });
    }
    return 'Tauri environment required for deep URL reading.';
  },
}));





