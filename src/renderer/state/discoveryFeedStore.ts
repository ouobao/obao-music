import { create } from 'zustand';
import type { RemoteProviderId, Song } from '../../shared/musicTypes';
import { useListeningHistoryStore } from './listeningHistoryStore';
import { useHomeFeedStore } from './homeFeedStore';
import { useArtistCatalogStore } from './artistCatalogStore';
import type { LoadStatus } from './loadStatus';

export interface DiscoveryFeedState {
  continueExploringByProvider: Record<string, Song[]>;
  notListenedByProvider: Record<string, Song[]>;
  newAlbumsByProvider: Record<string, AlbumRow[]>;
  frequentAlbumsByProvider: Record<string, AlbumRow[]>;
  homepageSongsByProvider: Record<string, Song[]>;
  loading: Record<string, boolean>;
  statusByModule: Record<string, LoadStatus>;
  loadedAtByProvider: Record<string, number>;

  loadContinueExploring(providerId: RemoteProviderId): Promise<void>;
  loadNotListened(providerId: RemoteProviderId): Promise<void>;
  loadNewAlbums(providerId: RemoteProviderId): Promise<void>;
  loadFrequentAlbums(providerId: RemoteProviderId): Promise<void>;
  loadHomepageSongs(providerId: RemoteProviderId): Promise<void>;
  loadAll(providerId: RemoteProviderId): Promise<void>;
  refreshAll(providerId: RemoteProviderId): Promise<void>;
}

export interface AlbumRow {
  id: string;
  title: string;
  artistName: string;
  coverTone: string;
  coverUrl?: string;
  releaseDate?: string;
  trackCount?: number;
}

const TTL_MS = 10 * 60 * 1000;
const CONTINUE_MAX = 12;
const NOT_LISTENED_MAX = 12;
const NOT_LISTENED_DAYS = 30;
const FREQUENT_ARTISTS_MAX = 4;
const NEW_ALBUMS_MAX = 12;
const revisionByKey: Record<string, number> = {};

function terminalIfLocked(status: LoadStatus | undefined): LoadStatus | undefined {
  if (status === 'loading' || status === 'refreshing' || status === 'appending') return 'error';
  return undefined;
}

export const useDiscoveryFeedStore = create<DiscoveryFeedState>((set, get) => ({
  continueExploringByProvider: {},
  notListenedByProvider: {},
  newAlbumsByProvider: {},
  frequentAlbumsByProvider: {},
  homepageSongsByProvider: {},
  loading: {},
  statusByModule: {},
  loadedAtByProvider: {},

  async loadContinueExploring(providerId) {
    const key = `${providerId}:continue-exploring`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().continueExploringByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const history = useListeningHistoryStore.getState().entries;
      const recent = history
        .filter((e) => e.song.providerId === providerId && now - e.lastPlayedAt < 90 * 24 * 3600 * 1000)
        .sort((a, b) => b.qualifiedPlayCount - a.qualifiedPlayCount);

      const seedArtists = Array.from(new Set(recent.map((e) => e.song.artist)))
        .slice(0, 6)
        .map((name) => recent.find((e) => e.song.artist === name));

      const artistSongs: Song[] = [];
      await Promise.all(
        seedArtists.slice(0, 3).map(async (entry) => {
          if (!entry) return;
          const song = entry.song;
          const artistId = song.artists?.[0]?.id;
          if (!artistId) return;
          const detail = await useArtistCatalogStore.getState().loadArtist(providerId, artistId);
          if (detail) artistSongs.push(...detail.topSongs);
        })
      );

      if (revision !== revisionByKey[key]) return;
      const excluded = new Set(recent.map((e) => e.song.id));
      const candidates = artistSongs.filter((s) => !excluded.has(s.id));
      const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, CONTINUE_MAX);

      set((state) => ({
        continueExploringByProvider: { ...state.continueExploringByProvider, [providerId]: shuffled },
        loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
        statusByModule: {
          ...state.statusByModule,
          [key]: shuffled.length > 0 ? 'success' : 'success-empty'
        }
      }));
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
    } finally {
      if (revision === revisionByKey[key]) {
        const fallback = terminalIfLocked(get().statusByModule[key]);
        if (fallback) set((state) => ({ statusByModule: { ...state.statusByModule, [key]: fallback } }));
      }
    }
  },

  async loadNotListened(providerId) {
    const history = useListeningHistoryStore.getState().entries;
    const cutoff = Date.now() - NOT_LISTENED_DAYS * 24 * 3600 * 1000;
    const oldSongs = history
      .filter((e) => e.song.providerId === providerId && e.lastPlayedAt < cutoff)
      .map((e) => e.song);

    const result = oldSongs.slice(0, NOT_LISTENED_MAX);
    set((state) => ({
      notListenedByProvider: { ...state.notListenedByProvider, [providerId]: result },
      statusByModule: { ...state.statusByModule, [`${providerId}:not-listened`]: result.length > 0 ? 'success' : 'success-empty' }
    }));
  },

  async loadNewAlbums(providerId) {
    const key = `${providerId}:new-albums`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().newAlbumsByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const result = await window.musicPlayer.music.getNewAlbums(providerId);
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const albums = result.data.slice(0, NEW_ALBUMS_MAX).map((a) => ({
          id: a.id,
          title: a.title,
          artistName: a.artistName,
          coverTone: a.coverTone,
          coverUrl: a.coverUrl,
          releaseDate: a.releaseDate,
          trackCount: a.trackCount
        }));
        set((state) => ({
          newAlbumsByProvider: { ...state.newAlbumsByProvider, [providerId]: albums },
          loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
          statusByModule: { ...state.statusByModule, [key]: albums.length > 0 ? 'success' : 'success-empty' }
        }));
      } else {
        set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
      }
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
    } finally {
      if (revision === revisionByKey[key]) {
        const fallback = terminalIfLocked(get().statusByModule[key]);
        if (fallback) set((state) => ({ statusByModule: { ...state.statusByModule, [key]: fallback } }));
      }
    }
  },

  async loadFrequentAlbums(providerId) {
    const key = `${providerId}:frequent-albums`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().frequentAlbumsByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const history = useListeningHistoryStore.getState().entries;
      const frequentArtists = history
        .filter((e) => e.song.providerId === providerId)
        .sort((a, b) => b.qualifiedPlayCount - a.qualifiedPlayCount)
        .map((e) => e.song.artists?.[0])
        .filter(Boolean)
        .slice(0, FREQUENT_ARTISTS_MAX);

      const albums: AlbumRow[] = [];
      await Promise.all(
        Array.from(new Map(frequentArtists.map((a) => [a!.id, a!])).values()).map(async (artist) => {
          if (!artist) return;
          const detail = await useArtistCatalogStore.getState().loadArtist(providerId, artist.id);
          if (!detail) return;
          const latest = detail.albums[0];
          if (latest) {
            albums.push({
              id: latest.id,
              title: latest.title,
              artistName: latest.artistName,
              coverTone: latest.coverTone,
              coverUrl: latest.coverUrl,
              releaseDate: latest.releaseDate,
              trackCount: latest.trackCount
            });
          }
        })
      );

      if (revision !== revisionByKey[key]) return;
      set((state) => ({
        frequentAlbumsByProvider: { ...state.frequentAlbumsByProvider, [providerId]: albums },
        loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
        statusByModule: { ...state.statusByModule, [key]: albums.length > 0 ? 'success' : 'success-empty' }
      }));
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
    } finally {
      if (revision === revisionByKey[key]) {
        const fallback = terminalIfLocked(get().statusByModule[key]);
        if (fallback) set((state) => ({ statusByModule: { ...state.statusByModule, [key]: fallback } }));
      }
    }
  },

  async loadHomepageSongs(providerId) {
    if (providerId !== 'netease') return;
    const key = `${providerId}:homepage`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'loading' } }));

    try {
      const result = await window.musicPlayer.music.getHomepageBlocks(providerId);
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const songs: Song[] = [];
        const seen = new Set<string>();
        for (const block of result.data.blocks) {
          if (block.kind !== 'song') continue;
          for (const song of block.songs) {
            if (!seen.has(song.id)) {
              seen.add(song.id);
              songs.push(song);
            }
          }
        }
        set((state) => ({
          homepageSongsByProvider: { ...state.homepageSongsByProvider, [providerId]: songs },
          loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
          statusByModule: {
            ...state.statusByModule,
            [key]: songs.length > 0 ? 'success' : 'success-empty'
          }
        }));
      } else {
        set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
      }
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'error' } }));
    } finally {
      if (revision === revisionByKey[key]) {
        const fallback = terminalIfLocked(get().statusByModule[key]);
        if (fallback) set((state) => ({ statusByModule: { ...state.statusByModule, [key]: fallback } }));
      }
    }
  },

  async loadAll(providerId) {
    if (get().loading[providerId]) return;
    set((state) => ({
      loading: { ...state.loading, [providerId]: true },
      statusByModule: { ...state.statusByModule, [`${providerId}:all`]: 'loading' }
    }));

    try {
      await Promise.allSettled([
        get().loadContinueExploring(providerId),
        get().loadNotListened(providerId),
        get().loadNewAlbums(providerId),
        get().loadFrequentAlbums(providerId),
        get().loadHomepageSongs(providerId)
      ]);
      set((state) => ({ statusByModule: { ...state.statusByModule, [`${providerId}:all`]: 'success' } }));
    } finally {
      set((state) => ({ loading: { ...state.loading, [providerId]: false } }));
    }
  },

  async refreshAll(providerId) {
    // 清空该平台的 TTL 时间戳，强制各模块重新拉取，避免“刷新推荐”被缓存拦截
    const loadedAt = get().loadedAtByProvider;
    const nextLoadedAt: Record<string, number> = {};
    for (const key of Object.keys(loadedAt)) {
      if (!key.startsWith(`${providerId}:`)) nextLoadedAt[key] = loadedAt[key];
    }
    set({ loadedAtByProvider: nextLoadedAt });
    await get().loadAll(providerId);
  }
}));

export function discoverHomeSongs(providerId: RemoteProviderId): Song[] {
  const state = useDiscoveryFeedStore.getState();
  const feed = useHomeFeedStore.getState().feedByProvider[providerId];
  const daily = feed?.dailySongs ?? [];
  const newSongs = feed?.newSongs ?? [];
  const explore = state.continueExploringByProvider[providerId] ?? [];
  const notListened = state.notListenedByProvider[providerId] ?? [];
  const seen = new Set<string>();
  const result: Song[] = [];
  for (const song of [...daily, ...newSongs, ...explore, ...notListened]) {
    if (!seen.has(song.id)) {
      seen.add(song.id);
      result.push(song);
    }
  }
  return result;
}
