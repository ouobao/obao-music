import { create } from 'zustand';
import type { ArtistReference, ProviderId, Song } from '../../shared/musicTypes';

export interface ListeningHistoryEntry {
  song: Song;
  qualifiedPlayCount: number;
  lastPlayedAt: number;
}

interface ListeningHistoryState {
  entries: ListeningHistoryEntry[];
  recordQualifiedListen: (song: Song, playedAt?: number) => void;
  resetForTest: (entries?: ListeningHistoryEntry[]) => void;
}

const LISTENING_HISTORY_STORAGE_KEY = 'musicplayer.listening-history:v1';
const LISTENING_HISTORY_STORAGE_VERSION = 1;
export const LISTENING_HISTORY_LIMIT = 500;

export const useListeningHistoryStore = create<ListeningHistoryState>((set) => ({
  entries: readStoredHistory(),

  recordQualifiedListen: (song, playedAt = Date.now()) => {
    if (!isSong(song) || !Number.isFinite(playedAt) || playedAt <= 0) {
      return;
    }

    set((state) => {
      const identity = getSongIdentity(song);
      const existing = state.entries.find((entry) => getSongIdentity(entry.song) === identity);
      const nextEntry: ListeningHistoryEntry = {
        song,
        qualifiedPlayCount: (existing?.qualifiedPlayCount ?? 0) + 1,
        lastPlayedAt: playedAt
      };
      const entries = [
        nextEntry,
        ...state.entries.filter((entry) => getSongIdentity(entry.song) !== identity)
      ]
        .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
        .slice(0, LISTENING_HISTORY_LIMIT);

      writeStoredHistory(entries);
      return { entries };
    });
  },

  resetForTest: (entries = []) => {
    const normalizedEntries = entries.slice(0, LISTENING_HISTORY_LIMIT);
    set({ entries: normalizedEntries });
    writeStoredHistory(normalizedEntries);
  }
}));

function readStoredHistory(): ListeningHistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(LISTENING_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed) || parsed.version !== LISTENING_HISTORY_STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries
      .filter(isListeningHistoryEntry)
      .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
      .slice(0, LISTENING_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeStoredHistory(entries: readonly ListeningHistoryEntry[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(LISTENING_HISTORY_STORAGE_KEY, JSON.stringify({
      version: LISTENING_HISTORY_STORAGE_VERSION,
      entries
    }));
  } catch {
    // Discovery remains available in memory when local storage is unavailable.
  }
}

function isListeningHistoryEntry(value: unknown): value is ListeningHistoryEntry {
  return isObjectRecord(value)
    && isSong(value.song)
    && typeof value.qualifiedPlayCount === 'number'
    && Number.isInteger(value.qualifiedPlayCount)
    && value.qualifiedPlayCount > 0
    && typeof value.lastPlayedAt === 'number'
    && Number.isFinite(value.lastPlayedAt)
    && value.lastPlayedAt > 0;
}

function isSong(value: unknown): value is Song {
  if (!isObjectRecord(value) || !isProviderId(value.providerId)) {
    return false;
  }

  return typeof value.id === 'string'
    && Boolean(value.id)
    && typeof value.title === 'string'
    && typeof value.artist === 'string'
    && typeof value.album === 'string'
    && typeof value.durationMs === 'number'
    && Number.isFinite(value.durationMs)
    && value.durationMs >= 0
    && typeof value.coverTone === 'string'
    && (value.artists === undefined || (
      Array.isArray(value.artists)
      && value.artists.every(isArtistReference)
    ));
}

function isArtistReference(value: unknown): value is ArtistReference {
  return isObjectRecord(value)
    && (value.providerId === 'qq' || value.providerId === 'netease')
    && typeof value.id === 'string'
    && Boolean(value.id)
    && typeof value.platformArtistId === 'string'
    && Boolean(value.platformArtistId)
    && typeof value.name === 'string'
    && Boolean(value.name);
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'qq' || value === 'netease' || value === 'local';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getSongIdentity(song: Song): string {
  return `${song.providerId}:${song.platformSongId ?? song.id}`;
}
