import { create } from 'zustand';

const SEARCH_HISTORY_STORAGE_KEY = 'musicplayer.search-history.v1';
const SEARCH_HISTORY_LIMIT = 8;

interface SearchHistoryState {
  entries: string[];
  hydrate: () => void;
  record: (keyword: string) => void;
  remove: (keyword: string) => void;
  clear: () => void;
  resetForTest: () => void;
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, ' ');
}

function readEntries(): string[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeEntries(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return [];
  }
}

function normalizeEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of entries) {
    const keyword = normalizeKeyword(entry);
    const identity = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    normalized.push(keyword);
    if (normalized.length === SEARCH_HISTORY_LIMIT) {
      break;
    }
  }

  return normalized;
}

function persist(entries: string[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Search remains available when storage is unavailable.
  }
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  entries: [],

  hydrate: () => {
    set({ entries: readEntries() });
  },

  record: (keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword) {
      return;
    }

    const entries = normalizeEntries([
      normalizedKeyword,
      ...get().entries.filter((entry) => entry.toLocaleLowerCase() !== normalizedKeyword.toLocaleLowerCase())
    ]);
    persist(entries);
    set({ entries });
  },

  remove: (keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword).toLocaleLowerCase();
    const entries = get().entries.filter((entry) => entry.toLocaleLowerCase() !== normalizedKeyword);
    persist(entries);
    set({ entries });
  },

  clear: () => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
      } catch {
        // The in-memory state can still be cleared.
      }
    }
    set({ entries: [] });
  },

  resetForTest: () => {
    set({ entries: [] });
  }
}));
