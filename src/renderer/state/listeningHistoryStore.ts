import { create } from 'zustand';
import type { ProviderId, Song } from '../../shared/musicTypes';

export interface ListeningHistoryEntry {
  song: Song;
  qualifiedPlayCount: number;
  lastPlayedAt: number;
}

const HISTORY_KEY = 'musicplayer.listening-history:v1';
const MAX_ENTRIES = 500;
const QUALIFIED_MIN_MS = 30 * 1000;

function loadHistory(): ListeningHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && e.song && typeof e.song.id === 'string')
      .map((e) => ({
        song: e.song,
        qualifiedPlayCount: Number(e.qualifiedPlayCount) || 0,
        lastPlayedAt: Number(e.lastPlayedAt) || Date.now()
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function persist(entries: ListeningHistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export interface ListeningHistoryState {
  entries: ListeningHistoryEntry[];

  recordQualifiedListen(song: Song, playedAt?: number): void;
  recordPlayback(song: Song, positionMs: number, durationMs: number): void;
  removeEntry(providerId: ProviderId, songId: string): void;
  clear(): void;
}

export const useListeningHistoryStore = create<ListeningHistoryState>((set, get) => ({
  entries: loadHistory(),

  recordQualifiedListen(song, playedAt) {
    const timestamp = playedAt ?? Date.now();
    set((state) => {
      const existing = state.entries.find((e) => e.song.id === song.id && e.song.providerId === song.providerId);
      let next: ListeningHistoryEntry[];
      if (existing) {
        next = state.entries.map((e) =>
          e === existing
            ? { ...e, qualifiedPlayCount: e.qualifiedPlayCount + 1, lastPlayedAt: timestamp }
            : e
        );
      } else {
        next = [{ song, qualifiedPlayCount: 1, lastPlayedAt: timestamp }, ...state.entries];
      }
      next.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
      next = next.slice(0, MAX_ENTRIES);
      persist(next);
      return { entries: next };
    });
  },

  recordPlayback(song, positionMs, durationMs) {
    const qualified = positionMs >= QUALIFIED_MIN_MS || (durationMs > 0 && positionMs >= durationMs * 0.5);
    if (qualified) {
      get().recordQualifiedListen(song);
    }
  },

  removeEntry(providerId: ProviderId, songId: string) {
    set((state) => {
      const next = state.entries.filter((e) => !(e.song.providerId === providerId && e.song.id === songId));
      persist(next);
      return { entries: next };
    });
  },

  clear() {
    set({ entries: [] });
    persist([]);
  }
}));
