import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumDetail, ArtistDetail, Song } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useArtistCatalogStore } from './artistCatalogStore';
import {
  selectContinueExplorationSeeds,
  useContinueExplorationStore
} from './continueExplorationStore';
import { useListeningHistoryStore } from './listeningHistoryStore';

const now = new Date('2026-07-17T12:00:00Z').getTime();
const artist = {
  id: 'qq:artist:seed',
  providerId: 'qq' as const,
  platformArtistId: 'seed',
  name: 'Seed Artist'
};
const historySong = createSong('history', artist);
const candidateSongs = Array.from({ length: 6 }, (_, index) => createSong(`candidate-${index}`, artist));
const album: AlbumDetail = {
  id: 'qq:album:latest',
  providerId: 'qq',
  platformAlbumId: 'latest',
  title: 'Latest Album',
  artistName: artist.name,
  coverTone: historySong.coverTone,
  releaseDate: '2026-07-01',
  description: '',
  artists: [artist],
  tracks: candidateSongs.slice(3)
};
const artistDetail: ArtistDetail = {
  ...artist,
  aliases: [],
  description: '',
  coverTone: historySong.coverTone,
  topSongs: candidateSongs.slice(0, 4),
  albums: [album]
};

describe('continue exploration store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    installMusicPlayerApiMock({
      getArtistDetail: vi.fn(async () => ({ ok: true as const, data: artistDetail })),
      getAlbumDetail: vi.fn(async () => ({ ok: true as const, data: album }))
    });
    useArtistCatalogStore.getState().resetForTest();
    useListeningHistoryStore.getState().resetForTest();
    useContinueExplorationStore.getState().resetForTest();
  });

  it('selects recent provider-scoped artists and uses current song only for cold start', () => {
    const entries = [{ song: historySong, qualifiedPlayCount: 2, lastPlayedAt: now - 1_000 }];

    expect(selectContinueExplorationSeeds('qq', entries, null, now)).toEqual([
      expect.objectContaining({ artist })
    ]);
    expect(selectContinueExplorationSeeds('netease', entries, null, now)).toEqual([]);
    expect(selectContinueExplorationSeeds('qq', [], historySong, now)).toEqual([
      expect.objectContaining({ artist })
    ]);
  });

  it('builds a stable daily batch from artist and album tracks without recent history songs', async () => {
    useListeningHistoryStore.getState().recordQualifiedListen(historySong, now - 1_000);

    const first = await useContinueExplorationStore.getState().load('qq', []);
    const second = await useContinueExplorationStore.getState().load('qq', []);

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(first).not.toContainEqual(historySong);
    expect(window.musicPlayer.music.getArtistDetail).toHaveBeenCalledTimes(1);
    expect(window.musicPlayer.music.getAlbumDetail).toHaveBeenCalledTimes(1);
  });

  it('filters current discovery songs and keeps provider states isolated', async () => {
    useListeningHistoryStore.getState().recordQualifiedListen(historySong, now - 1_000);

    const songs = await useContinueExplorationStore.getState().load('qq', [candidateSongs[0]]);

    expect(songs.map((song) => song.id)).not.toContain(candidateSongs[0].id);
    expect(useContinueExplorationStore.getState().byProvider.netease.songs).toEqual([]);
  });

  it('uses at most three seed artists and four songs from each artist', async () => {
    const seedArtists = Array.from({ length: 4 }, (_, index) => ({
      id: `qq:artist:seed-${index}`,
      providerId: 'qq' as const,
      platformArtistId: `seed-${index}`,
      name: `Seed Artist ${index}`
    }));
    const details = new Map(seedArtists.map((seedArtist, artistIndex) => [
      seedArtist.id,
      {
        ...seedArtist,
        aliases: [],
        description: '',
        coverTone: historySong.coverTone,
        topSongs: Array.from({ length: 6 }, (_, songIndex) => createSong(
          `artist-${artistIndex}-candidate-${songIndex}`,
          seedArtist
        )),
        albums: []
      } satisfies ArtistDetail
    ]));
    installMusicPlayerApiMock({
      getArtistDetail: vi.fn(async (_providerId, artistId) => ({
        ok: true as const,
        data: details.get(artistId)!
      }))
    });
    seedArtists.forEach((seedArtist, index) => {
      useListeningHistoryStore.getState().recordQualifiedListen(
        createSong(`seed-history-${index}`, seedArtist),
        now - index * 1_000
      );
    });

    const songs = await useContinueExplorationStore.getState().load('qq', []);
    const counts = songs.reduce<Record<string, number>>((result, song) => {
      const artistId = song.artists?.[0]?.id ?? '';
      result[artistId] = (result[artistId] ?? 0) + 1;
      return result;
    }, {});

    expect(songs).toHaveLength(12);
    expect(Object.values(counts)).toEqual([4, 4, 4]);
    expect(counts[seedArtists[3].id]).toBeUndefined();
  });

  it('keeps scanning six history artists until three valid groups can be round-robin selected', async () => {
    const seedArtists = Array.from({ length: 6 }, (_, index) => ({
      id: `qq:artist:scan-${index}`,
      providerId: 'qq' as const,
      platformArtistId: `scan-${index}`,
      name: `Scan Artist ${index}`
    }));
    const details = new Map(seedArtists.slice(2).map((seedArtist, artistIndex) => [
      seedArtist.id,
      {
        ...seedArtist,
        aliases: [],
        description: '',
        coverTone: historySong.coverTone,
        topSongs: Array.from({ length: 5 }, (_, songIndex) => createSong(
          `scan-${artistIndex + 2}-${songIndex}`,
          seedArtist
        )),
        albums: []
      } satisfies ArtistDetail
    ]));
    const getArtistDetail = vi.fn(async (_providerId, artistId) => {
      const detail = details.get(artistId);
      return detail
        ? { ok: true as const, data: detail }
        : {
            ok: false as const,
            error: { code: 'provider_failed' as const, providerId: 'qq' as const, message: 'not found' }
          };
    });
    installMusicPlayerApiMock({ getArtistDetail });
    seedArtists.forEach((seedArtist, index) => {
      useListeningHistoryStore.getState().recordQualifiedListen(
        createSong(`scan-history-${index}`, seedArtist),
        now - index * 1_000
      );
    });

    const songs = await useContinueExplorationStore.getState().load('qq', []);
    const selectedArtistIds = songs.map((song) => song.artists?.[0]?.id);

    expect(getArtistDetail).toHaveBeenCalledTimes(6);
    expect(new Set(selectedArtistIds)).toEqual(new Set(seedArtists.slice(2, 5).map((item) => item.id)));
    expect(selectedArtistIds.slice(0, 6)).toEqual([
      seedArtists[2].id,
      seedArtists[3].id,
      seedArtists[4].id,
      seedArtists[2].id,
      seedArtists[3].id,
      seedArtists[4].id
    ]);
  });

  it('recomputes when qualified play count or recent-play time changes the history fingerprint', async () => {
    useListeningHistoryStore.getState().recordQualifiedListen(historySong, now - 2_000);
    await useContinueExplorationStore.getState().load('qq', []);
    const firstGenerationKey = useContinueExplorationStore.getState().byProvider.qq.generationKey;

    useListeningHistoryStore.getState().recordQualifiedListen(historySong, now - 1_000);
    await useContinueExplorationStore.getState().load('qq', []);

    expect(useContinueExplorationStore.getState().byProvider.qq.generationKey)
      .not.toBe(firstGenerationKey);
  });

  it('returns a local error state when all seed catalog requests fail', async () => {
    installMusicPlayerApiMock({
      getArtistDetail: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'provider_failed' as const, providerId: 'qq' as const, message: 'catalog failed' }
      }))
    });
    useListeningHistoryStore.getState().recordQualifiedListen(historySong, now - 1_000);

    await useContinueExplorationStore.getState().load('qq', []);

    expect(useContinueExplorationStore.getState().byProvider.qq).toMatchObject({
      songs: [],
      isLoading: false,
      loaded: true,
      errorMessage: '继续探索内容暂时无法加载'
    });
  });
});

function createSong(id: string, songArtist = artist): Song {
  return {
    id: `qq:song:${id}`,
    providerId: 'qq',
    platformSongId: id,
    title: `Song ${id}`,
    artist: songArtist.name,
    album: 'Album',
    artists: [songArtist],
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
  };
}
