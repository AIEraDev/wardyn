import { create } from 'zustand';
import { QueueItem, QueueItemStatus, TabType } from '../types/queue';

export interface SyncedCalendarEvent {
  id: string;
  queue_item_id: string;
  event_id: string;
  summary: string;
  event_date: string;
  created_at: string;
}

const INITIAL_MOCK_ITEMS: QueueItem[] = [
  {
    id: 'q-1',
    source: 'gmail',
    kind: 'reply',
    sender: 'UK Visas and Immigration <noreply@homeoffice.gov.uk>',
    preview: 'Additional documents required for your Global Talent application',
    draft_text: 'Thanks for the update, I have attached the requested reference letters and will follow up by Friday.',
    status: 'pending',
    flagged: true,
    confidence: 0.94,
    created_at: '2026-07-30T10:00:00Z',
    updated_at: '2026-07-30T10:00:00Z',
  },
  {
    id: 'q-2',
    source: 'gmail',
    kind: 'reply',
    sender: 'Stackkith Organizers <hello@stackkith.org>',
    preview: 'Can you confirm the workshop time for next event?',
    draft_text: 'Confirmed, workshop starts 3pm WAT, I will share the meet link Thursday morning.',
    status: 'pending',
    flagged: false,
    confidence: 0.88,
    created_at: '2026-07-30T11:30:00Z',
    updated_at: '2026-07-30T11:30:00Z',
  },
  {
    id: 'q-3',
    source: 'gmail',
    kind: 'reply',
    sender: 'Venture Partner <investor@capital.io>',
    preview: 'Quick sync regarding Clypra text-effects rewrite milestone',
    draft_text: null,
    status: 'pending',
    flagged: false,
    confidence: 0.42,
    created_at: '2026-07-30T14:15:00Z',
    updated_at: '2026-07-30T14:15:00Z',
  },
];

interface QueueStore {
  items: QueueItem[];
  calendarEvents: SyncedCalendarEvent[];
  activeTab: TabType;
  isLoading: boolean;
  error: string | null;
  gmailAccount: string | null;
  testOverrideRecipient: string | null;

  // Actions
  setActiveTab: (tab: TabType) => void;
  fetchItems: () => Promise<void>;
  approveItem: (id: string, editedDraft?: string) => Promise<void>;
  skipItem: (id: string) => Promise<void>;
  updateDraft: (id: string, text: string) => void;
  setTestOverrideRecipient: (email: string | null) => void;

  // Gmail OAuth & Send Actions
  checkGmailStatus: () => Promise<void>;
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  syncGmail: () => Promise<void>;

  // Ollama Actions
  processItemWithOllama: (id: string) => Promise<void>;

  // Calendar Sync Actions
  syncCalendarDeadlines: () => Promise<void>;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: INITIAL_MOCK_ITEMS,
  calendarEvents: [
    {
      id: 'cal-1',
      queue_item_id: 'q-1',
      event_id: 'evt-101',
      summary: 'UKVI Document Deadline',
      event_date: '2026-08-01T17:00:00Z',
      created_at: '2026-07-30T10:00:00Z',
    },
    {
      id: 'cal-2',
      queue_item_id: 'q-1',
      event_id: 'evt-102',
      summary: 'Global Talent Follow-up',
      event_date: '2026-08-05T12:00:00Z',
      created_at: '2026-07-30T10:00:00Z',
    },
  ],
  activeTab: 'today',
  isLoading: false,
  error: null,
  gmailAccount: null,
  testOverrideRecipient: null,

  setActiveTab: (tab: TabType) => {
    set({ activeTab: tab });
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
      console.warn('Backend IPC not active, using local store:', err);
      set({ isLoading: false });
    }
  },

  setTestOverrideRecipient: (email: string | null) => {
    set({ testOverrideRecipient: email });
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

  checkGmailStatus: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const email = await invoke<string | null>('get_gmail_auth_status');
        set({ gmailAccount: email });
      } catch (err) {
        console.error('Failed to check Gmail status:', err);
      }
    }
  },

  connectGmail: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const email = await invoke<string>('start_gmail_auth');
        set({ gmailAccount: email });
        await get().syncGmail();
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
      } catch (err) {
        console.error('Failed to disconnect Gmail:', err);
      }
    }
  },

  syncGmail: async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke<number>('sync_gmail_messages');
        await get().fetchItems();
        await get().syncCalendarDeadlines();
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
