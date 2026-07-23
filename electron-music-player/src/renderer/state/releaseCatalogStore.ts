import { create } from 'zustand';
import type { AlbumSummary, RemoteProviderId } from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';

export interface ReleaseCatalogProviderState {
  albums: AlbumSummary[];
  isLoading: boolean;
  loaded: boolean;
  loadedAt: number | null;
  errorMessage: string | null;
}

interface ReleaseCatalogState {
  byProvider: Record<RemoteProviderId, ReleaseCatalogProviderState>;
  load: (
    providerId: RemoteProviderId,
    options?: ProviderFetchOptions
  ) => Promise<AlbumSummary[]>;
  resetForTest: () => void;
}

export const RELEASE_CATALOG_CACHE_TTL_MS = 10 * 60 * 1_000;

export const useReleaseCatalogStore = create<ReleaseCatalogState>((set, get) => ({
  byProvider: createProviderStates(),

  load: async (providerId, options) => {
    const current = get().byProvider[providerId];
    if (current.isLoading) {
      return current.albums;
    }
    if (
      !options?.forceRefresh
      && current.loaded
      && current.loadedAt !== null
      && Date.now() - current.loadedAt < RELEASE_CATALOG_CACHE_TTL_MS
    ) {
      return current.albums;
    }

    set((state) => ({
      byProvider: {
        ...state.byProvider,
        [providerId]: {
          ...state.byProvider[providerId],
          isLoading: true,
          errorMessage: null
        }
      }
    }));

    try {
      const musicApi = typeof window === 'undefined' ? undefined : window.musicPlayer?.music;
      if (!musicApi?.getNewAlbums) {
        throw new Error('当前版本暂不支持新碟速递');
      }
      const result = options
        ? await musicApi.getNewAlbums(providerId, options)
        : await musicApi.getNewAlbums(providerId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      const albums = result.data.slice(0, 12);
      set((state) => ({
        byProvider: {
          ...state.byProvider,
          [providerId]: {
            albums,
            isLoading: false,
            loaded: true,
            loadedAt: Date.now(),
            errorMessage: null
          }
        }
      }));
      return albums;
    } catch (error) {
      set((state) => ({
        byProvider: {
          ...state.byProvider,
          [providerId]: {
            ...state.byProvider[providerId],
            isLoading: false,
            loaded: current.loaded,
            loadedAt: current.loadedAt,
            errorMessage: error instanceof Error ? error.message : '新碟速递加载失败'
          }
        }
      }));
      return current.albums;
    }
  },

  resetForTest: () => set({ byProvider: createProviderStates() })
}));

function createProviderStates(): Record<RemoteProviderId, ReleaseCatalogProviderState> {
  return {
    qq: createProviderState(),
    netease: createProviderState()
  };
}

function createProviderState(): ReleaseCatalogProviderState {
  return {
    albums: [],
    isLoading: false,
    loaded: false,
    loadedAt: null,
    errorMessage: null
  };
}
