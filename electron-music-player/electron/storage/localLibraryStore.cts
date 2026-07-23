import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path = require('node:path');
import type { Song } from '../providers/types.cjs';

export interface LocalLibraryEntry {
  song: Song;
  filePath: string;
  importedAt: number;
  lastSeenAt: number;
}

export interface LocalLibraryStore {
  list(): LocalLibraryEntry[];
  upsertMany(entries: LocalLibraryEntry[]): void;
  remove(songId: string): void;
  clear(): void;
}

export function createFileLocalLibraryStore(filePath: string, _options: { now?: () => number } = {}): LocalLibraryStore {
  const entriesBySongId = loadLibraryEntries(filePath);

  const persist = () => writeLibraryEntries(filePath, sortEntries([...entriesBySongId.values()]));

  return {
    list() {
      return sortEntries([...entriesBySongId.values()]);
    },

    upsertMany(entries) {
      entries.filter(isLocalLibraryEntry).forEach((entry) => {
        entriesBySongId.set(entry.song.id, entry);
      });
      persist();
    },

    remove(songId) {
      entriesBySongId.delete(songId);
      persist();
    },

    clear() {
      entriesBySongId.clear();
      persist();
    }
  };
}

function loadLibraryEntries(filePath: string): Map<string, LocalLibraryEntry> {
  if (!existsSync(filePath)) {
    return new Map();
  }

  try {
    const rawData = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    if (!isRecord(rawData) || !Array.isArray(rawData.entries)) {
      return new Map();
    }

    return new Map(
      sortEntries(rawData.entries.filter(isLocalLibraryEntry)).map((entry) => [entry.song.id, entry])
    );
  } catch {
    return new Map();
  }
}

function writeLibraryEntries(filePath: string, entries: LocalLibraryEntry[]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ entries }, null, 2), 'utf8');
}

function sortEntries(entries: LocalLibraryEntry[]): LocalLibraryEntry[] {
  return [...entries].sort((left, right) => left.importedAt - right.importedAt);
}

function isLocalLibraryEntry(value: unknown): value is LocalLibraryEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isSong(value.song) &&
    typeof value.filePath === 'string' &&
    typeof value.importedAt === 'number' &&
    Number.isFinite(value.importedAt) &&
    typeof value.lastSeenAt === 'number' &&
    Number.isFinite(value.lastSeenAt)
  );
}

function isSong(value: unknown): value is Song {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    value.providerId === 'local' &&
    typeof value.title === 'string' &&
    typeof value.artist === 'string' &&
    typeof value.album === 'string' &&
    typeof value.durationMs === 'number' &&
    typeof value.coverTone === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
