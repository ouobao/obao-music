import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AlbumSummary,
  ArtistDetail,
  ArtistReference,
  RemoteProviderId,
  Song
} from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useArtistCatalogStore } from './artistCatalogStore';
import {
  FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS,
  selectFrequentArtistAlbums,
  selectFrequentArtistAlbumSeeds,
  useFrequentArtistAlbumsStore
} from './frequentArtistAlbumsStore';
import type { ListeningHistoryEntry } from './listeningHistoryStore';
import { useListeningHistoryStore } from './listeningHistoryStore';

const now = new Date('2026-07-18T12:00:00Z').getTime();

describe('frequent artist albums store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    installMusicPlayerApiMock();
    useArtistCatalogStore.getState().resetForTest();
    useListeningHistoryStore.getState().resetForTest();
    useFrequentArtistAlbumsStore.getState().resetForTest();
  });

  it('keeps providers isolated and uses only the latest 90 days of history', () => {
    const qqArtist = createArtist('qq', 'qq-recent');
    const boundaryQQArtist = createArtist('qq', 'qq-boundary');
    const oldQQArtist = createArtist('qq', 'qq-old');
    const neteaseArtist = createArtist('netease', 'netease-recent');
    const entries = [
      createHistoryEntry(createSong('qq-recent', qqArtist), now - 1_000),
      createHistoryEntry(
        createSong('qq-boundary', boundaryQQArtist),
        now - FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS
      ),
      createHistoryEntry(
        createSong('qq-old', oldQQArtist),
        now - FREQUENT_ARTIST_ALBUM_HISTORY_WINDOW_MS - 1
      ),
      createHistoryEntry(createSong('netease-recent', neteaseArtist), now - 2_000)
    ];

    expect(selectFrequentArtistAlbumSeeds('qq', entries, now).map((seed) => seed.artist.id))
      .toEqual([qqArtist.id, boundaryQQArtist.id]);
    expect(selectFrequentArtistAlbumSeeds('netease', entries, now).map((seed) => seed.artist.id))
      .toEqual([neteaseArtist.id]);
  });

  it('selects at most four reliable seed artists and ignores missing artist ids', () => {
    const artists = Array.from({ length: 5 }, (_, index) => createArtist('qq', `seed-${index}`));
    const invalidArtist = {
      ...createArtist('qq', 'invalid'),
      id: '',
      platformArtistId: ''
    };
    const entries = [
      ...artists.map((artist, index) => createHistoryEntry(
        createSong(`seed-${index}`, artist),
        now - index * 1_000,
        10 - index
      )),
      createHistoryEntry(createSong('invalid', invalidArtist), now - 500, 50)
    ];

    const seeds = selectFrequentArtistAlbumSeeds('qq', entries, now);

    expect(seeds).toHaveLength(4);
    expect(seeds.map((seed) => seed.artist.id)).toEqual(artists.slice(0, 4).map((artist) => artist.id));
    expect(seeds.some((seed) => seed.artist.id === '')).toBe(false);
  });

  it('keeps one latest album per artist, caps the module at six, deduplicates, and excludes new releases', () => {
    const sharedLatest = createAlbum('qq', 'shared-latest', '2026-07-15');
    const excludedLatest = createAlbum('qq', 'excluded-latest', '2026-07-16');
    const details = Array.from({ length: 8 }, (_, index) => {
      const artist = createArtist('qq', `artist-${index}`);
      const latest = index < 2
        ? sharedLatest
        : index === 2
          ? excludedLatest
          : createAlbum('qq', `latest-${index}`, `2026-07-${String(18 - index).padStart(2, '0')}`);
      return createArtistDetail(artist, [
        createAlbum('qq', `older-${index}`, '2025-01-01'),
        { ...latest, artistName: artist.name }
      ]);
    });

    const albums = selectFrequentArtistAlbums('qq', details, [excludedLatest]);

    expect(albums).toHaveLength(6);
    expect(new Set(albums.map((album) => `${album.providerId}:${album.platformAlbumId}`)).size)
      .toBe(albums.length);
    expect(albums.map((album) => album.platformAlbumId)).not.toContain(excludedLatest.platformAlbumId);
    expect(albums.map((album) => album.platformAlbumId)).not.toContain('older-2');
  });

  it('generates stable same-day results and recomputes without bypassing the artist cache', async () => {
    const artists = Array.from({ length: 4 }, (_, index) => createArtist('qq', `stable-${index}`));
    const details = new Map(artists.map((artist, index) => [
      artist.id,
      createArtistDetail(artist, [createAlbum('qq', `stable-album-${index}`, `2026-07-0${index + 1}`)])
    ]));
    const getArtistDetail = vi.fn(async (_providerId: RemoteProviderId, artistId: string) => ({
      ok: true as const,
      data: details.get(artistId)!
    }));
    const getAlbumDetail = vi.fn();
    installMusicPlayerApiMock({ getArtistDetail, getAlbumDetail });
    artists.forEach((artist, index) => {
      useListeningHistoryStore.getState().recordQualifiedListen(
        createSong(`stable-${index}`, artist),
        now - index * 1_000
      );
    });

    const first = await useFrequentArtistAlbumsStore.getState().load('qq', []);
    const second = await useFrequentArtistAlbumsStore.getState().load('qq', []);
    const refreshed = await useFrequentArtistAlbumsStore.getState().load('qq', [], {
      forceRefresh: true
    });

    expect(second).toEqual(first);
    expect(refreshed).toEqual(first);
    expect(getArtistDetail).toHaveBeenCalledTimes(4);
    expect(getArtistDetail).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { forceRefresh: true }
    );
    expect(getAlbumDetail).not.toHaveBeenCalled();
    expect(useFrequentArtistAlbumsStore.getState().byProvider.netease.albums).toEqual([]);
  });

  it('stays hidden on cold start or when history has no reliable artist id', async () => {
    const getArtistDetail = vi.fn();
    installMusicPlayerApiMock({ getArtistDetail });

    expect(await useFrequentArtistAlbumsStore.getState().load('qq', [])).toEqual([]);

    const invalidArtist = {
      ...createArtist('qq', 'invalid'),
      id: '',
      platformArtistId: ''
    };
    useListeningHistoryStore.getState().resetForTest([
      createHistoryEntry(createSong('invalid', invalidArtist), now - 1_000)
    ]);

    expect(await useFrequentArtistAlbumsStore.getState().load('qq', [])).toEqual([]);
    expect(getArtistDetail).not.toHaveBeenCalled();
    expect(useFrequentArtistAlbumsStore.getState().byProvider.qq).toMatchObject({
      albums: [],
      isLoading: false,
      loaded: true
    });
  });
});

function createArtist(providerId: RemoteProviderId, platformArtistId: string): ArtistReference {
  return {
    id: `${providerId}:artist:${platformArtistId}`,
    providerId,
    platformArtistId,
    name: `Artist ${platformArtistId}`
  };
}

function createAlbum(
  providerId: RemoteProviderId,
  platformAlbumId: string,
  releaseDate: string
): AlbumSummary {
  return {
    id: `${providerId}:album:${platformAlbumId}`,
    providerId,
    platformAlbumId,
    title: `Album ${platformAlbumId}`,
    artistName: `Artist ${platformAlbumId}`,
    coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
    releaseDate
  };
}

function createArtistDetail(
  artist: ArtistReference,
  albums: AlbumSummary[]
): ArtistDetail {
  return {
    ...artist,
    aliases: [],
    description: '',
    coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
    topSongs: [],
    albums
  };
}

function createSong(id: string, artist: ArtistReference): Song {
  return {
    id: `${artist.providerId}:song:${id}`,
    providerId: artist.providerId,
    platformSongId: id,
    title: `Song ${id}`,
    artist: artist.name,
    album: 'History Album',
    artists: [artist],
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)'
  };
}

function createHistoryEntry(
  song: Song,
  lastPlayedAt: number,
  qualifiedPlayCount = 1
): ListeningHistoryEntry {
  return { song, lastPlayedAt, qualifiedPlayCount };
}
