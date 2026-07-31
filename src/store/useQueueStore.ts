import { create } from 'zustand';
import { QueueItem, QueueItemStatus, TabType, SocialPost, SocialPlatform, ChannelConfig, LinkedInTimelineSummary } from '../types/queue';
import { SupportedLanguage, TRANSLATIONS, TranslationDictionary } from '../i18n/translations';

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

interface QueueStore {
  items: QueueItem[];
  socialPosts: SocialPost[];
  channels: ChannelConfig[];
  calendarEvents: SyncedCalendarEvent[];
  linkedInSummary: LinkedInTimelineSummary | null;
  linkedInAccount: string | null;
  activeTab: TabType;
  isLoading: boolean;
  error: string | null;
  gmailAccount: string | null;
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
  regenerateSocialPost: (id: string, tone: 'punchy' | 'detailed' | 'thread') => void;
  createSocialPost: (platform: SocialPlatform, topic: string) => void;
  syncLinkedInTimeline: () => Promise<void>;

  // Gmail OAuth & Send Actions
  checkGmailStatus: () => Promise<void>;
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  syncGmail: () => Promise<void>;

  // Ollama Actions
  processItemWithOllama: (id: string) => Promise<void>;

  // Calendar Sync Actions
  syncCalendarDeadlines: () => Promise<void>;

  // Native Notification Helper
  sendDesktopNotification: (title: string, body: string) => Promise<void>;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  socialPosts: [],
  channels: INITIAL_CHANNELS,
  calendarEvents: [],
  linkedInSummary: null,
  linkedInAccount: null,
  activeTab: 'today',
  isLoading: false,
  error: null,
  gmailAccount: null,
  testOverrideRecipient: null,
  language: 'en',
  notificationsEnabled: true,
  autoStartEnabled: false,
  syncIntervalMinutes: 5,

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
        await invoke('send_gmail_reply_command', {
          req: {
            item_id: id,
            recipient: target.sender,
            subject: target.preview,
            in_reply_to: null,
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

  regenerateSocialPost: (id: string, tone: 'punchy' | 'detailed' | 'thread') => {
    const target = get().socialPosts.find((p) => p.id === id);
    if (!target) return;

    let newContent = target.content;
    if (tone === 'punchy') {
      newContent = `Shipped ${target.topic}. Clean, zero-latency, and lightning fast. 🚀 #BuildInPublic`;
    } else if (tone === 'detailed') {
      newContent = `Deep dive into ${target.topic}:\n- Architectural design & state management\n- Benchmark performance results\n- Lessons learned building local-first apps. #Tech`;
    } else if (tone === 'thread') {
      newContent = `1/ How we built ${target.topic}:\n\n2/ The key challenge was local state performance...\n\n3/ Here is what we learned 🧵 #IndieHacker`;
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
          '💼 LinkedIn Personal Profile Synced',
          `Fetched real LinkedIn API timeline for ${summary.profile_name}`
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
        const email = await invoke<string | null>('get_gmail_auth_status');
        set({ gmailAccount: email });

        if (email) {
          set((state) => ({
            channels: state.channels.map((c) =>
              c.id === 'gmail' ? { ...c, status: 'connected', accountLabel: email } : c
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
        set({ gmailAccount: email });
        set((state) => ({
          channels: state.channels.map((c) =>
            c.id === 'gmail' ? { ...c, status: 'connected', accountLabel: email } : c
          ),
        }));
        await get().syncGmail();
        await get().sendDesktopNotification(
          '🔒 Wardyn Account Connected',
          `Successfully authenticated Gmail account: ${email}`
        );
      } catch (err: any) {
        set({ error: err.toString() });
      }
    }
  },

  disconnectGmail: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('disconnect_gmail');
        set({ gmailAccount: null });
        set((state) => ({
          channels: state.channels.map((c) =>
            c.id === 'gmail' ? { ...c, status: 'disconnected', accountLabel: undefined } : c
          ),
        }));
        await get().sendDesktopNotification(
          'Wardyn Disconnected',
          'Gmail credentials cleared securely.'
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
          if (urgentFlagged) {
            await get().sendDesktopNotification(
              '⚠️ Urgent Visa / Deadline Alert',
              `Action Required: ${urgentFlagged.sender} — ${urgentFlagged.preview}`
            );
          } else {
            await get().sendDesktopNotification(
              '📩 New Messages Triaged',
              `Wardyn fetched and triaged ${newItemsCount} new message(s) awaiting approval.`
            );
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
}));
