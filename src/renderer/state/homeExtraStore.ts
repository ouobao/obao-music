import { create } from 'zustand';
import type { RemoteProviderId, DiscoveredPlaylist, Song, ArtistSummary } from '../../shared/musicTypes';
import type { SearchHotSearch } from '../../shared/providerTypes';
import type { LoadStatus } from './loadStatus';
import { useListeningHistoryStore } from './listeningHistoryStore';
import { useArtistCatalogStore } from './artistCatalogStore';

export interface HomeExtraState {
  hotSearchesByProvider: Record<string, SearchHotSearch[]>;
  featuredPlaylistsByProvider: Record<string, DiscoveredPlaylist[]>;
  recommendedArtistsByProvider: Record<string, ArtistSummary[]>;
  radioSongsByProvider: Record<string, Song[]>;
  loading: Record<string, boolean>;
  statusByModule: Record<string, LoadStatus>;
  loadedAtByProvider: Record<string, number>;

  loadHotSearches(providerId: RemoteProviderId): Promise<void>;
  loadFeaturedPlaylists(providerId: RemoteProviderId): Promise<void>;
  loadRecommendedArtists(providerId: RemoteProviderId): Promise<void>;
  loadRadioSongs(providerId: RemoteProviderId): Promise<void>;
  loadAll(providerId: RemoteProviderId): Promise<void>;
  refreshAll(providerId: RemoteProviderId): Promise<void>;
}

const TTL_MS = 10 * 60 * 1000;
const HOT_SEARCH_LIMIT = 20;
const FEATURED_PLAYLIST_LIMIT = 30;
const RECOMMENDED_ARTISTS_MAX = 8;
const RADIO_SONGS_MAX = 30;
const revisionByKey: Record<string, number> = {};

function terminalIfLocked(status: LoadStatus | undefined): LoadStatus | undefined {
  if (status === 'loading' || status === 'refreshing' || status === 'appending') return 'error';
  return undefined;
}

export const useHomeExtraStore = create<HomeExtraState>((set, get) => ({
  hotSearchesByProvider: {},
  featuredPlaylistsByProvider: {},
  recommendedArtistsByProvider: {},
  radioSongsByProvider: {},
  loading: {},
  statusByModule: {},
  loadedAtByProvider: {},

  async loadHotSearches(providerId) {
    const key = `${providerId}:hot-searches`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().hotSearchesByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const result = await window.musicPlayer.music.getSearchHotSearches(providerId, { limit: HOT_SEARCH_LIMIT });
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const items = result.data;
        set((state) => ({
          hotSearchesByProvider: { ...state.hotSearchesByProvider, [providerId]: items },
          loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
          statusByModule: { ...state.statusByModule, [key]: items.length > 0 ? 'success' : 'success-empty' }
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

  async loadFeaturedPlaylists(providerId) {
    const key = `${providerId}:featured-playlists`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().featuredPlaylistsByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const categoriesResult = await window.musicPlayer.music.getPlaylistCategories(providerId);
      if (revision !== revisionByKey[key]) return;
      let categoryId = '';
      if (categoriesResult.ok) {
        const hot = categoriesResult.data.find((c) => c.hot);
        categoryId = hot?.id ?? categoriesResult.data[0]?.id ?? '';
      }
      if (!categoryId) {
        set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'success-empty' } }));
        return;
      }
      const playlistsResult = await window.musicPlayer.music.getDiscoveredPlaylists(providerId, {
        categoryId,
        limit: FEATURED_PLAYLIST_LIMIT,
        offset: 0
      });
      if (revision !== revisionByKey[key]) return;
      if (playlistsResult.ok) {
        const playlists = playlistsResult.data.playlists;
        set((state) => ({
          featuredPlaylistsByProvider: { ...state.featuredPlaylistsByProvider, [providerId]: playlists },
          loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
          statusByModule: { ...state.statusByModule, [key]: playlists.length > 0 ? 'success' : 'success-empty' }
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

  async loadRecommendedArtists(providerId) {
    const key = `${providerId}:recommended-artists`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().recommendedArtistsByProvider[providerId]?.length);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const history = useListeningHistoryStore.getState().entries;
      const recent = history
        .filter((e) => e.song.providerId === providerId)
        .sort((a, b) => b.qualifiedPlayCount - a.qualifiedPlayCount);

      const artistEntries = recent
        .map((e) => {
          const artist = e.song.artists?.[0];
          return artist ? { id: artist.id, artist } as const : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const artistIds = Array.from(
        new Map(artistEntries.map((e) => [e.id, e.artist] as const)).values()
      ).slice(0, RECOMMENDED_ARTISTS_MAX);

      const artists: ArtistSummary[] = [];
      await Promise.all(
        artistIds.map(async (artist) => {
          try {
            const detail = await useArtistCatalogStore.getState().loadArtist(providerId, artist.id);
            if (detail) {
              artists.push({
                id: detail.id,
                providerId: detail.providerId,
                platformArtistId: detail.platformArtistId,
                name: detail.name,
                coverTone: detail.coverTone,
                imageUrl: detail.imageUrl,
                aliases: detail.aliases,
                sourceLabel: detail.sourceLabel,
                songCount: detail.songCount,
                albumCount: detail.albumCount
              });
            }
          } catch {
            // skip failed artist lookups
          }
        })
      );

      if (revision !== revisionByKey[key]) return;
      set((state) => ({
        recommendedArtistsByProvider: { ...state.recommendedArtistsByProvider, [providerId]: artists },
        loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
        statusByModule: { ...state.statusByModule, [key]: artists.length > 0 ? 'success' : 'success-empty' }
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

  async loadRadioSongs(providerId) {
    const key = `${providerId}:radio-songs`;
    const now = Date.now();
    if (get().loadedAtByProvider[key] && now - get().loadedAtByProvider[key] < TTL_MS) return;
    const current = get().statusByModule[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    set((state) => ({ statusByModule: { ...state.statusByModule, [key]: 'loading' } }));

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
        seedArtists.slice(0, 4).map(async (entry) => {
          if (!entry) return;
          const artistId = entry.song.artists?.[0]?.id;
          if (!artistId) return;
          try {
            const detail = await useArtistCatalogStore.getState().loadArtist(providerId, artistId);
            if (detail) artistSongs.push(...detail.topSongs);
          } catch {
            // skip
          }
        })
      );

      if (revision !== revisionByKey[key]) return;
      const excluded = new Set(recent.map((e) => e.song.id));
      const candidates = artistSongs.filter((s) => !excluded.has(s.id));
      const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, RADIO_SONGS_MAX);

      set((state) => ({
        radioSongsByProvider: { ...state.radioSongsByProvider, [providerId]: shuffled },
        loadedAtByProvider: { ...state.loadedAtByProvider, [key]: now },
        statusByModule: { ...state.statusByModule, [key]: shuffled.length > 0 ? 'success' : 'success-empty' }
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

  async loadAll(providerId) {
    if (get().loading[providerId]) return;
    set((state) => ({
      loading: { ...state.loading, [providerId]: true },
      statusByModule: { ...state.statusByModule, [`${providerId}:extra-all`]: 'loading' }
    }));

    try {
      await Promise.allSettled([
        get().loadHotSearches(providerId),
        get().loadFeaturedPlaylists(providerId),
        get().loadRecommendedArtists(providerId),
        get().loadRadioSongs(providerId)
      ]);
      set((state) => ({ statusByModule: { ...state.statusByModule, [`${providerId}:extra-all`]: 'success' } }));
    } finally {
      set((state) => ({ loading: { ...state.loading, [providerId]: false } }));
    }
  },

  async refreshAll(providerId) {
    const loadedAt = get().loadedAtByProvider;
    const nextLoadedAt: Record<string, number> = {};
    for (const key of Object.keys(loadedAt)) {
      if (!key.startsWith(`${providerId}:`)) nextLoadedAt[key] = loadedAt[key];
    }
    set({ loadedAtByProvider: nextLoadedAt });
    await get().loadAll(providerId);
  }
}));