import { create } from 'zustand';
import type { RemoteProviderId, Song } from '../../shared/musicTypes';
import { REMOTE_PROVIDER_IDS } from './providerSessionStore';
import type { LoadStatus } from './loadStatus';

export interface HomeFeedState {
  feedByProvider: Record<string, HomeFeed | undefined>;
  loadingByProvider: Record<string, boolean>;
  errorByProvider: Record<string, string | null>;
  statusByProvider: Record<string, LoadStatus>;
  loadedAtByProvider: Record<string, number>;

  load(providerId: RemoteProviderId): Promise<void>;
  refresh(providerId: RemoteProviderId): Promise<void>;
}

export interface HomeFeed {
  providerId: RemoteProviderId;
  loggedIn: boolean;
  dailySongs: Song[];
  newSongs: Song[];
  dailyStatus: string | null;
  newStatus: string | null;
}

const TTL_MS = 10 * 60 * 1000;
const revisionByKey: Record<string, number> = {};

export const useHomeFeedStore = create<HomeFeedState>((set, get) => ({
  feedByProvider: {},
  loadingByProvider: {},
  errorByProvider: {},
  statusByProvider: {},
  loadedAtByProvider: {},

  async load(providerId) {
    if (get().loadingByProvider[providerId]) return;
    const loadedAt = get().loadedAtByProvider[providerId];
    if (loadedAt && Date.now() - loadedAt < TTL_MS) return;
    await get().refresh(providerId);
  },

  async refresh(providerId) {
    const key = providerId;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().feedByProvider[providerId]);
    set((state) => ({
      loadingByProvider: { ...state.loadingByProvider, [providerId]: true },
      statusByProvider: { ...state.statusByProvider, [providerId]: hasData ? 'refreshing' : 'loading' }
    }));

    try {
      const result = await window.musicPlayer.music.getRecommendationHome(providerId, { forceRefresh: true });
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const feed = result.data;
        const dailySongs = feed.dailySongs ?? [];
        const newSongs = feed.newSongs ?? [];
        set((state) => ({
          feedByProvider: {
            ...state.feedByProvider,
            [providerId]: {
              providerId: feed.providerId,
              loggedIn: feed.loggedIn,
              dailySongs,
              newSongs,
              dailyStatus: feed.moduleResults?.daily?.status === 'fulfilled' ? null : feed.moduleResults?.daily?.errorMessage ?? null,
              newStatus: feed.moduleResults?.new?.status === 'fulfilled' ? null : feed.moduleResults?.new?.errorMessage ?? null
            }
          },
          errorByProvider: { ...state.errorByProvider, [providerId]: null },
          statusByProvider: {
            ...state.statusByProvider,
            [providerId]: dailySongs.length === 0 && newSongs.length === 0 ? 'success-empty' : 'success'
          },
          loadedAtByProvider: { ...state.loadedAtByProvider, [providerId]: Date.now() }
        }));
      } else {
        set((state) => ({
          errorByProvider: { ...state.errorByProvider, [providerId]: result.error.message },
          statusByProvider: { ...state.statusByProvider, [providerId]: 'error' }
        }));
      }
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({
        errorByProvider: {
          ...state.errorByProvider,
          [providerId]: error instanceof Error ? error.message : String(error)
        },
        statusByProvider: { ...state.statusByProvider, [providerId]: 'error' }
      }));
    } finally {
      if (revision === revisionByKey[key]) {
        set((state) => ({ loadingByProvider: { ...state.loadingByProvider, [providerId]: false } }));
      }
    }
  }
}));

export const REMOTE_PROVIDERS = REMOTE_PROVIDER_IDS;
