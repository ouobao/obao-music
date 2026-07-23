import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LocalLibraryEntry, LocalLibraryStore } from '../storage/localLibraryStore.cts';
import { createLocalProvider, LOCAL_LIBRARY_PLAYLIST_ID } from './localProvider.cts';

describe('local provider', () => {
  it('maps selected audio file paths into provider songs without exposing raw paths', () => {
    const provider = createLocalProvider();

    const songs = provider.importFiles([
      'D:/Music/Local Album/City Lights.mp3',
      'D:/Music/Local Album/Notes.txt',
      'D:/Music/Another Album/Night Drive.flac'
    ]);

    expect(songs).toHaveLength(2);
    expect(songs[0]).toMatchObject({
      providerId: 'local',
      title: 'City Lights',
      artist: 'Unknown Artist',
      album: 'Local Album',
      durationMs: 0,
      sourceContext: {
        type: 'local',
        providerId: 'local'
      }
    });
    expect(songs[0].id).toMatch(/^local:[a-f0-9]{16}$/);
    expect(JSON.stringify(songs)).not.toContain('D:/Music');
  });

  it('returns file URLs for imported local songs', async () => {
    const provider = createLocalProvider();
    const filePath = createAudioFilePath('City Lights.mp3');
    const [song] = provider.importFiles([filePath]);

    const result = await provider.getSongUrl(song, 'standard');

    expect(result).toEqual({
      ok: true,
      providerId: 'local',
      quality: 'standard',
      url: pathToFileURL(filePath).toString()
    });
  });

  it('returns url_unavailable when the indexed local file no longer exists', async () => {
    const provider = createLocalProvider();
    const [song] = provider.importFiles(['D:/Music/Missing Album/Gone.mp3']);

    const result = await provider.getSongUrl(song, 'standard');

    expect(result).toEqual({
      ok: false,
      providerId: 'local',
      quality: 'standard',
      reason: {
        category: 'url_unavailable',
        message: '本地音频文件不可用，请重新导入',
        action: 'none'
      }
    });
    expect(JSON.stringify(result)).not.toContain('D:/Music/Missing Album/Gone.mp3');
  });

  it('exposes imported songs through a virtual local library playlist', async () => {
    const provider = createLocalProvider();
    provider.importFiles(['D:/Music/Local Album/City Lights.mp3']);

    const playlists = await provider.getUserPlaylists();
    const tracks = await provider.getPlaylistTracks(LOCAL_LIBRARY_PLAYLIST_ID);

    expect(playlists).toEqual([
      expect.objectContaining({
        id: LOCAL_LIBRARY_PLAYLIST_ID,
        providerId: 'local',
        title: '本地音乐',
        songIds: [tracks[0].id],
        sourceLabel: '本地音乐'
      })
    ]);
    expect(tracks[0]).toMatchObject({
      id: expect.stringMatching(/^local:[a-f0-9]{16}$/),
      title: 'City Lights'
    });
  });

  it('persists imported songs through an injected local library store', async () => {
    const store = createMemoryLocalLibraryStore();
    const firstProvider = createLocalProvider(store, { now: () => 1_000 });
    const [song] = firstProvider.importFiles(['D:/Music/Local Album/City Lights.mp3']);

    const secondProvider = createLocalProvider(store, { now: () => 2_000 });
    const tracks = await secondProvider.getPlaylistTracks(LOCAL_LIBRARY_PLAYLIST_ID);

    expect(store.list()).toEqual([
      expect.objectContaining({
        song,
        filePath: 'D:/Music/Local Album/City Lights.mp3',
        importedAt: 1_000,
        lastSeenAt: 1_000
      })
    ]);
    expect(tracks).toEqual([song]);
  });

  it('keeps duplicate imports as one song', async () => {
    const provider = createLocalProvider();
    const filePath = createAudioFilePath('Duplicate Song.mp3');

    const importedSongs = provider.importFiles([filePath, filePath]);
    const tracks = await provider.getPlaylistTracks(LOCAL_LIBRARY_PLAYLIST_ID);

    expect(importedSongs).toHaveLength(1);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual(importedSongs[0]);
  });

  it('searches persisted local songs after provider recreation', async () => {
    const store = createMemoryLocalLibraryStore();
    const filePath = createAudioFilePath('Restart Song.flac');
    createLocalProvider(store, { now: () => 1_000 }).importFiles([filePath]);

    const provider = createLocalProvider(store, { now: () => 2_000 });
    const results = await provider.search('restart');

    expect(results).toEqual([
      expect.objectContaining({
        providerId: 'local',
        title: 'Restart Song'
      })
    ]);
  });
});

function createAudioFilePath(fileName: string): string {
  const runtimeDir = join(
    process.cwd(),
    '.runtime',
    'local-provider-test',
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  mkdirSync(runtimeDir, { recursive: true });
  const filePath = join(runtimeDir, fileName);
  writeFileSync(filePath, 'audio', 'utf8');
  return filePath;
}

function createMemoryLocalLibraryStore(): LocalLibraryStore {
  const entries = new Map<string, LocalLibraryEntry>();

  return {
    list() {
      return [...entries.values()];
    },
    upsertMany(nextEntries) {
      nextEntries.forEach((entry) => {
        entries.set(entry.song.id, entry);
      });
    },
    remove(songId) {
      entries.delete(songId);
    },
    clear() {
      entries.clear();
    }
  };
}
