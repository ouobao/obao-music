import { create } from 'zustand';
import type {
  DiscoveredPlaylist,
  PlaylistCategory,
  RemoteProviderId
} from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';

export interface PlaylistDiscoveryCollection {
  playlists: DiscoveredPlaylist[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
  isLoading: boolean;
  loadingKind: PlaylistDiscoveryLoadingKind;
  loaded: boolean;
  errorMessage: string | null;
  lastAccessedAt: number;
}

export type PlaylistDiscoveryLoadingKind = 'initial' | 'refresh' | 'append' | null;

interface PlaylistDiscoveryLoadOptions extends ProviderFetchOptions {
  append?: boolean;
}

interface PlaylistDiscoveryState {
  categoriesByProvider: Record<RemoteProviderId, PlaylistCategory[]>;
  categoriesLoadingByProvider: Record<RemoteProviderId, boolean>;
  categoriesErrorByProvider: Record<RemoteProviderId, string | null>;
  categoriesLoadedByProvider: Record<RemoteProviderId, boolean>;
  collectionsByKey: Record<string, PlaylistDiscoveryCollection>;
  lastProviderId: RemoteProviderId | null;
  loadCategories: (
    providerId: RemoteProviderId,
    options?: ProviderFetchOptions
  ) => Promise<PlaylistCategory[]>;
  loadPlaylists: (
    providerId: RemoteProviderId,
    categoryId: string,
    options?: PlaylistDiscoveryLoadOptions
  ) => Promise<DiscoveredPlaylist[]>;
  setLastProviderId: (providerId: RemoteProviderId) => void;
  resetForTest: () => void;
}

const PLAYLIST_DISCOVERY_PROVIDER_STORAGE_KEY = 'musicplayer.playlist-discovery-provider';
const PLAYLIST_DISCOVERY_PAGE_SIZE = 30;
const MAX_INACTIVE_DISCOVERY_COLLECTIONS = 8;

export const EMPTY_PLAYLIST_DISCOVERY_COLLECTION: PlaylistDiscoveryCollection = {
  playlists: [],
  total: 0,
  nextOffset: 0,
  hasMore: false,
  isLoading: false,
  loadingKind: null,
  loaded: false,
  errorMessage: null,
  lastAccessedAt: 0
};

export function getPlaylistDiscoveryCollectionKey(
  providerId: RemoteProviderId,
  categoryId: string
): string {
  return `${providerId}:${encodeURIComponent(categoryId)}`;
}

export const usePlaylistDiscoveryStore = create<PlaylistDiscoveryState>((set, get) => ({
  ...createPlaylistDiscoveryDataState(readStoredProviderId()),

  loadCategories: async (providerId, options) => {
    const currentState = get();
    if (currentState.categoriesLoadingByProvider[providerId]) {
      return currentState.categoriesByProvider[providerId];
    }
    if (!options?.forceRefresh && currentState.categoriesLoadedByProvider[providerId]) {
      return currentState.categoriesByProvider[providerId];
    }

    set((state) => ({
      categoriesLoadingByProvider: {
        ...state.categoriesLoadingByProvider,
        [providerId]: true
      },
      categoriesErrorByProvider: {
        ...state.categoriesErrorByProvider,
        [providerId]: null
      }
    }));

    const result = options
      ? await window.musicPlayer.music.getPlaylistCategories(providerId, options)
      : await window.musicPlayer.music.getPlaylistCategories(providerId);
    if (!result.ok) {
      set((state) => ({
        categoriesLoadingByProvider: {
          ...state.categoriesLoadingByProvider,
          [providerId]: false
        },
        categoriesErrorByProvider: {
          ...state.categoriesErrorByProvider,
          [providerId]: result.error.message
        }
      }));
      return [];
    }

    set((state) => ({
      categoriesByProvider: {
        ...state.categoriesByProvider,
        [providerId]: result.data
      },
      categoriesLoadingByProvider: {
        ...state.categoriesLoadingByProvider,
        [providerId]: false
      },
      categoriesErrorByProvider: {
        ...state.categoriesErrorByProvider,
        [providerId]: null
      },
      categoriesLoadedByProvider: {
        ...state.categoriesLoadedByProvider,
        [providerId]: true
      }
    }));
    return result.data;
  },

  loadPlaylists: async (providerId, categoryId, options) => {
    const collectionKey = getPlaylistDiscoveryCollectionKey(providerId, categoryId);
    const currentCollection = get().collectionsByKey[collectionKey] ?? EMPTY_PLAYLIST_DISCOVERY_COLLECTION;
    const shouldAppend = Boolean(options?.append && !options.forceRefresh);
    if (currentCollection.isLoading) {
      return currentCollection.playlists;
    }
    if (shouldAppend && currentCollection.loaded && !currentCollection.hasMore) {
      return currentCollection.playlists;
    }
    if (!shouldAppend && !options?.forceRefresh && currentCollection.loaded) {
      return currentCollection.playlists;
    }

    const offset = shouldAppend ? currentCollection.nextOffset : 0;
    const loadingKind: PlaylistDiscoveryLoadingKind = shouldAppend
      ? 'append'
      : options?.forceRefresh && currentCollection.loaded
        ? 'refresh'
        : 'initial';
    set((state) => ({
      collectionsByKey: {
        ...state.collectionsByKey,
        [collectionKey]: {
          ...currentCollection,
          isLoading: true,
          loadingKind,
          errorMessage: null,
          lastAccessedAt: Date.now()
        }
      }
    }));

    const query = {
      categoryId,
      limit: PLAYLIST_DISCOVERY_PAGE_SIZE,
      offset
    };
    const result = options?.forceRefresh
      ? await window.musicPlayer.music.getDiscoveredPlaylists(providerId, query, { forceRefresh: true })
      : await window.musicPlayer.music.getDiscoveredPlaylists(providerId, query);
    if (!result.ok) {
      set((state) => ({
      collectionsByKey: {
        ...pruneInactiveCollections(state.collectionsByKey, collectionKey),
        [collectionKey]: {
          ...(state.collectionsByKey[collectionKey] ?? currentCollection),
          isLoading: false,
          loadingKind: null,
          errorMessage: result.error.message,
          lastAccessedAt: Date.now()
          }
        }
      }));
      return currentCollection.playlists;
    }

    const playlists = shouldAppend
      ? mergeUniquePlaylists(currentCollection.playlists, result.data.playlists)
      : result.data.playlists;
    const consumedCount = result.data.playlists.length || result.data.limit;
    set((state) => ({
      collectionsByKey: {
        ...pruneInactiveCollections(state.collectionsByKey, collectionKey),
        [collectionKey]: {
          playlists,
          total: result.data.total,
          nextOffset: result.data.offset + consumedCount,
          hasMore: result.data.hasMore,
          isLoading: false,
          loadingKind: null,
          loaded: true,
          errorMessage: null,
          lastAccessedAt: Date.now()
        }
      }
    }));
    return playlists;
  },

  setLastProviderId: (lastProviderId) => {
    set({ lastProviderId });
    writeStoredProviderId(lastProviderId);
  },

  resetForTest: () => set(createPlaylistDiscoveryDataState(null))
}));

function createPlaylistDiscoveryDataState(lastProviderId: RemoteProviderId | null) {
  return {
    categoriesByProvider: {
      qq: [],
      netease: []
    },
    categoriesLoadingByProvider: {
      qq: false,
      netease: false
    },
    categoriesErrorByProvider: {
      qq: null,
      netease: null
    },
    categoriesLoadedByProvider: {
      qq: false,
      netease: false
    },
    collectionsByKey: {},
    lastProviderId
  };
}

function mergeUniquePlaylists(
  currentPlaylists: DiscoveredPlaylist[],
  incomingPlaylists: DiscoveredPlaylist[]
): DiscoveredPlaylist[] {
  const playlistsById = new Map(currentPlaylists.map((playlist) => [playlist.id, playlist]));
  incomingPlaylists.forEach((playlist) => playlistsById.set(playlist.id, playlist));
  return [...playlistsById.values()];
}

function pruneInactiveCollections(
  collectionsByKey: Record<string, PlaylistDiscoveryCollection>,
  activeCollectionKey: string
): Record<string, PlaylistDiscoveryCollection> {
  const inactiveEntries = Object.entries(collectionsByKey)
    .filter(([collectionKey, collection]) => collectionKey !== activeCollectionKey && !collection.isLoading)
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);
  const overflowCount = Math.max(0, inactiveEntries.length - MAX_INACTIVE_DISCOVERY_COLLECTIONS);
  if (overflowCount === 0) {
    return collectionsByKey;
  }

  const expiredKeys = new Set(inactiveEntries.slice(0, overflowCount).map(([collectionKey]) => collectionKey));
  return Object.fromEntries(
    Object.entries(collectionsByKey).filter(([collectionKey]) => !expiredKeys.has(collectionKey))
  );
}

function readStoredProviderId(): RemoteProviderId | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const providerId = localStorage.getItem(PLAYLIST_DISCOVERY_PROVIDER_STORAGE_KEY);
    return providerId === 'qq' || providerId === 'netease' ? providerId : null;
  } catch {
    return null;
  }
}

function writeStoredProviderId(providerId: RemoteProviderId): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(PLAYLIST_DISCOVERY_PROVIDER_STORAGE_KEY, providerId);
  } catch {
    // The selected provider still updates when local storage is unavailable.
  }
}
