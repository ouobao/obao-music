import { create } from 'zustand';
import type { DiscoveredPlaylist, PlaylistCategory, RemoteProviderId } from '../../shared/musicTypes';
import type { LoadStatus } from './loadStatus';

export interface PlaylistDiscoveryState {
  categoriesByProvider: Record<string, PlaylistCategory[]>;
  playlistsByKey: Record<string, DiscoveredPlaylist[]>;
  hasMoreByKey: Record<string, boolean>;
  nextOffsetByKey: Record<string, number>;
  loadingCategories: Record<string, boolean>;
  loadingPlaylists: Record<string, boolean>;
  categoryErrors: Record<string, string | null>;
  playlistErrors: Record<string, string | null>;
  statusCategoriesByProvider: Record<string, LoadStatus>;
  statusPlaylistsByKey: Record<string, LoadStatus>;
  loadedAtCategories: Record<string, number>;
  lastProviderId: RemoteProviderId;

  loadCategories(providerId: RemoteProviderId): Promise<void>;
  loadPlaylists(providerId: RemoteProviderId, categoryId: string, mode: 'initial' | 'append'): Promise<void>;
  setLastProvider(providerId: RemoteProviderId): void;
}

const PAGE_SIZE = 30;
const CATEGORY_TTL_MS = 10 * 60 * 1000;
const revisionByKey: Record<string, number> = {};

export const usePlaylistDiscoveryStore = create<PlaylistDiscoveryState>((set, get) => ({
  categoriesByProvider: {},
  playlistsByKey: {},
  hasMoreByKey: {},
  nextOffsetByKey: {},
  loadingCategories: {},
  loadingPlaylists: {},
  categoryErrors: {},
  playlistErrors: {},
  statusCategoriesByProvider: {},
  statusPlaylistsByKey: {},
  loadedAtCategories: {},
  lastProviderId: 'netease',

  async loadCategories(providerId) {
    const loadedAt = get().loadedAtCategories[providerId];
    if (loadedAt && Date.now() - loadedAt < CATEGORY_TTL_MS) return;
    if (get().loadingCategories[providerId]) return;
    const revision = (revisionByKey[`${providerId}:categories`] = (revisionByKey[`${providerId}:categories`] ?? 0) + 1);

    set((state) => ({
      loadingCategories: { ...state.loadingCategories, [providerId]: true },
      categoryErrors: { ...state.categoryErrors, [providerId]: null },
      statusCategoriesByProvider: { ...state.statusCategoriesByProvider, [providerId]: 'loading' }
    }));

    try {
      const result = await window.musicPlayer.music.getPlaylistCategories(providerId);
      if (revision !== revisionByKey[`${providerId}:categories`]) return;
      if (result.ok) {
        set((state) => ({
          categoriesByProvider: { ...state.categoriesByProvider, [providerId]: result.data },
          statusCategoriesByProvider: {
            ...state.statusCategoriesByProvider,
            [providerId]: result.data.length > 0 ? 'success' : 'success-empty'
          },
          loadedAtCategories: { ...state.loadedAtCategories, [providerId]: Date.now() }
        }));
      } else {
        set((state) => ({
          categoryErrors: { ...state.categoryErrors, [providerId]: result.error.message },
          statusCategoriesByProvider: { ...state.statusCategoriesByProvider, [providerId]: 'error' }
        }));
      }
    } catch (error) {
      if (revision !== revisionByKey[`${providerId}:categories`]) return;
      set((state) => ({
        categoryErrors: {
          ...state.categoryErrors,
          [providerId]: error instanceof Error ? error.message : String(error)
        },
        statusCategoriesByProvider: { ...state.statusCategoriesByProvider, [providerId]: 'error' }
      }));
    } finally {
      if (revision === revisionByKey[`${providerId}:categories`]) {
        set((state) => ({ loadingCategories: { ...state.loadingCategories, [providerId]: false } }));
      }
    }
  },

  async loadPlaylists(providerId, categoryId, mode) {
    const key = `${providerId}:${categoryId}`;
    if (get().loadingPlaylists[key]) return;
    const offset = mode === 'append' ? (get().nextOffsetByKey[key] ?? 0) : 0;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);

    set((state) => ({
      loadingPlaylists: { ...state.loadingPlaylists, [key]: true },
      playlistErrors: { ...state.playlistErrors, [key]: null },
      statusPlaylistsByKey: {
        ...state.statusPlaylistsByKey,
        [key]: mode === 'append' ? 'appending' : (get().playlistsByKey[key]?.length ? 'refreshing' : 'loading')
      }
    }));

    try {
      const result = await window.musicPlayer.music.getDiscoveredPlaylists(providerId, {
        categoryId,
        limit: PAGE_SIZE,
        offset
      });
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const page = result.data;
        set((state) => {
          const existing = state.playlistsByKey[key] ?? [];
          let merged: DiscoveredPlaylist[];
          if (mode === 'append') {
            const seen = new Set(existing.map((p) => p.id));
            merged = [...existing];
            for (const playlist of page.playlists) {
              if (!seen.has(playlist.id)) {
                seen.add(playlist.id);
                merged.push(playlist);
              }
            }
          } else {
            const seen = new Set<string>();
            merged = [];
            for (const playlist of page.playlists) {
              if (!seen.has(playlist.id)) {
                seen.add(playlist.id);
                merged.push(playlist);
              }
            }
          }
          const nextOffset = page.offset + page.playlists.length;
          return {
            playlistsByKey: { ...state.playlistsByKey, [key]: merged },
            hasMoreByKey: { ...state.hasMoreByKey, [key]: page.hasMore },
            nextOffsetByKey: { ...state.nextOffsetByKey, [key]: nextOffset },
            statusPlaylistsByKey: {
              ...state.statusPlaylistsByKey,
              [key]: merged.length > 0 ? 'success' : 'success-empty'
            }
          };
        });
      } else {
        set((state) => ({
          playlistErrors: { ...state.playlistErrors, [key]: result.error.message },
          statusPlaylistsByKey: { ...state.statusPlaylistsByKey, [key]: 'error' }
        }));
      }
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({
        playlistErrors: {
          ...state.playlistErrors,
          [key]: error instanceof Error ? error.message : String(error)
        },
        statusPlaylistsByKey: { ...state.statusPlaylistsByKey, [key]: 'error' }
      }));
    } finally {
      if (revision === revisionByKey[key]) {
        set((state) => ({ loadingPlaylists: { ...state.loadingPlaylists, [key]: false } }));
      }
    }
  },

  setLastProvider(providerId) {
    set({ lastProviderId: providerId });
  }
}));
