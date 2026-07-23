import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../shared/musicTypes';
import {
  LISTENING_HISTORY_LIMIT,
  useListeningHistoryStore
} from './listeningHistoryStore';

const song: Song = {
  id: 'qq:song:history-1',
  providerId: 'qq',
  platformSongId: 'history-1',
  title: 'History Song',
  artist: 'History Artist',
  album: 'History Album',
  artists: [{
    id: 'qq:artist:history-artist',
    providerId: 'qq',
    platformArtistId: 'history-artist',
    name: 'History Artist'
  }],
  durationMs: 180_000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

describe('listening history store', () => {
  beforeEach(() => {
    localStorage.clear();
    useListeningHistoryStore.getState().resetForTest();
  });

  it('aggregates qualified plays by provider song identity and persists versioned data', () => {
    useListeningHistoryStore.getState().recordQualifiedListen(song, 1_000);
    useListeningHistoryStore.getState().recordQualifiedListen({ ...song, title: 'Updated Title' }, 2_000);

    expect(useListeningHistoryStore.getState().entries).toEqual([{
      song: expect.objectContaining({ title: 'Updated Title' }),
      qualifiedPlayCount: 2,
      lastPlayedAt: 2_000
    }]);
    expect(JSON.parse(localStorage.getItem('musicplayer.listening-history:v1') ?? '{}')).toMatchObject({
      version: 1,
      entries: [{ qualifiedPlayCount: 2, lastPlayedAt: 2_000 }]
    });
  });

  it('keeps providers isolated even when platform song ids match', () => {
    useListeningHistoryStore.getState().recordQualifiedListen(song, 1_000);
    useListeningHistoryStore.getState().recordQualifiedListen({
      ...song,
      id: 'netease:song:history-1',
      providerId: 'netease'
    }, 2_000);

    expect(useListeningHistoryStore.getState().entries).toHaveLength(2);
  });

  it('retains only the most recent 500 unique songs', () => {
    for (let index = 0; index < LISTENING_HISTORY_LIMIT + 5; index += 1) {
      useListeningHistoryStore.getState().recordQualifiedListen({
        ...song,
        id: `qq:song:${index}`,
        platformSongId: String(index)
      }, index + 1);
    }

    const entries = useListeningHistoryStore.getState().entries;
    expect(entries).toHaveLength(LISTENING_HISTORY_LIMIT);
    expect(entries[0].song.platformSongId).toBe('504');
    expect(entries.at(-1)?.song.platformSongId).toBe('5');
  });

  it('ignores invalid timestamps without changing persisted history', () => {
    useListeningHistoryStore.getState().recordQualifiedListen(song, Number.NaN);

    expect(useListeningHistoryStore.getState().entries).toEqual([]);
    expect(JSON.parse(localStorage.getItem('musicplayer.listening-history:v1') ?? '{}')).toEqual({
      version: 1,
      entries: []
    });
  });

  it('recovers with an empty history when persisted storage is corrupted', async () => {
    localStorage.setItem('musicplayer.listening-history:v1', '{broken-json');
    vi.resetModules();

    const isolatedModule = await import('./listeningHistoryStore');

    expect(isolatedModule.useListeningHistoryStore.getState().entries).toEqual([]);
  });
});
