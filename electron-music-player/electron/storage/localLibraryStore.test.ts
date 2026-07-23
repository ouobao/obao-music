import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileLocalLibraryStore, type LocalLibraryEntry } from './localLibraryStore.cts';

describe('main process local library store', () => {
  it('persists local library entries across store instances', () => {
    const filePath = createLibraryFilePath('persist');
    const firstStore = createFileLocalLibraryStore(filePath);
    const entry = createLocalLibraryEntry('local:city', 'D:/Music/City Lights.mp3', 1_000);

    firstStore.upsertMany([entry]);
    const secondStore = createFileLocalLibraryStore(filePath);

    expect(secondStore.list()).toEqual([entry]);
  });

  it('upserts duplicate song id instead of appending', () => {
    const filePath = createLibraryFilePath('upsert');
    const store = createFileLocalLibraryStore(filePath);

    store.upsertMany([createLocalLibraryEntry('local:city', 'D:/Music/Old.mp3', 2_000)]);
    store.upsertMany([createLocalLibraryEntry('local:city', 'D:/Music/New.mp3', 1_000)]);

    expect(store.list()).toEqual([createLocalLibraryEntry('local:city', 'D:/Music/New.mp3', 1_000)]);
  });

  it('removes one song without clearing the whole library', () => {
    const filePath = createLibraryFilePath('remove');
    const store = createFileLocalLibraryStore(filePath);
    const city = createLocalLibraryEntry('local:city', 'D:/Music/City Lights.mp3', 1_000);
    const night = createLocalLibraryEntry('local:night', 'D:/Music/Night Drive.flac', 2_000);

    store.upsertMany([night, city]);
    store.remove('local:city');

    expect(store.list()).toEqual([night]);
  });

  it('starts empty when the JSON file is corrupt', () => {
    const filePath = createLibraryFilePath('corrupt');
    writeFileSync(filePath, '{broken-json', 'utf8');

    const store = createFileLocalLibraryStore(filePath);

    expect(store.list()).toEqual([]);
  });
});

function createLibraryFilePath(name: string): string {
  const runtimeDir = join(process.cwd(), '.runtime');
  mkdirSync(runtimeDir, { recursive: true });
  return join(runtimeDir, `local-library-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function createLocalLibraryEntry(id: string, filePath: string, importedAt: number): LocalLibraryEntry {
  return {
    song: {
      id,
      providerId: 'local',
      platformSongId: id.slice('local:'.length),
      title: id === 'local:city' ? 'City Lights' : 'Night Drive',
      artist: 'Unknown Artist',
      album: 'Local Album',
      durationMs: 0,
      coverTone: 'linear-gradient(135deg, #4f8aa8, #30343b)',
      sourceContext: {
        type: 'local',
        providerId: 'local'
      }
    },
    filePath,
    importedAt,
    lastSeenAt: importedAt
  };
}
