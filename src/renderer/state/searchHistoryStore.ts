import { create } from 'zustand';

const SEARCH_HISTORY_KEY = 'musicplayer.search-history';
const MAX_ENTRIES = 8;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string').slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist(entries: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export interface SearchHistoryState {
  entries: string[];
  hydrate(): void;
  record(keyword: string): void;
  remove(keyword: string): void;
  clear(): void;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  entries: loadHistory(),

  hydrate() {
    set({ entries: loadHistory() });
  },

  record(keyword) {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    set((state) => {
      const next = [trimmed, ...state.entries.filter((e) => e !== trimmed)].slice(0, MAX_ENTRIES);
      persist(next);
      return { entries: next };
    });
  },

  remove(keyword) {
    set((state) => {
      const next = state.entries.filter((e) => e !== keyword);
      persist(next);
      return { entries: next };
    });
  },

  clear() {
    set({ entries: [] });
    persist([]);
  }
}));
