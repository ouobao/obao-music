import { create } from 'zustand';
import type {
  HomepageBlockFeed,
  ProviderId,
  RecommendationHomeFeed,
  RemoteProviderId
} from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';

export interface DiscoveryRecommendationState {
  feed: RecommendationHomeFeed | null;
  modules: Record<DiscoveryRecommendationModule, DiscoveryRecommendationModuleState>;
}

export type DiscoveryRecommendationModule = 'daily' | 'new';

export interface DiscoveryRecommendationModuleState {
  isLoading: boolean;
  loaded: boolean;
  loadedAt: number | null;
  errorMessage: string | null;
}

export interface DiscoveryHomepageBlockState {
  feed: HomepageBlockFeed | null;
  isLoading: boolean;
  loaded: boolean;
  loadedAt: number | null;
  errorMessage: string | null;
}

interface DiscoveryHomeState {
  lastProviderId: RemoteProviderId | null;
  recommendationsByProvider: Record<RemoteProviderId, DiscoveryRecommendationState>;
  homepageBlocks: DiscoveryHomepageBlockState;
  setLastProviderId: (providerId: RemoteProviderId | null) => void;
  loadRecommendationHome: (
    providerId: RemoteProviderId,
    options?: ProviderFetchOptions
  ) => Promise<RecommendationHomeFeed | null>;
  refreshRecommendationModule: (
    providerId: RemoteProviderId,
    module: DiscoveryRecommendationModule
  ) => Promise<RecommendationHomeFeed | null>;
  loadHomepageBlocks: (options?: ProviderFetchOptions) => Promise<HomepageBlockFeed | null>;
  resetForTest: () => void;
}

const DISCOVERY_HOME_PROVIDER_STORAGE_KEY = 'musicplayer.discovery-home-provider';
export const RECOMMENDATION_HOME_CACHE_TTL_MS = 10 * 60 * 1000;
export const HOMEPAGE_BLOCK_CACHE_TTL_MS = 10 * 60 * 1000;

export const useDiscoveryHomeStore = create<DiscoveryHomeState>((set, get) => {
  const recommendationRequestRevisions = createRecommendationRequestRevisions();
  let homepageBlockRequestRevision = 0;

  return {
    lastProviderId: readStoredProviderId(),
    recommendationsByProvider: createRecommendationState(),
    homepageBlocks: createEmptyHomepageBlockState(),

    setLastProviderId: (lastProviderId) => {
      set({ lastProviderId });
      writeStoredProviderId(lastProviderId);
    },

    loadRecommendationHome: (providerId, options) => loadRecommendationModules(
      set,
      get,
      recommendationRequestRevisions,
      providerId,
      getProviderRecommendationModules(providerId),
      options
    ),

    refreshRecommendationModule: (providerId, module) => loadRecommendationModules(
      set,
      get,
      recommendationRequestRevisions,
      providerId,
      [module],
      { forceRefresh: true }
    ),

    loadHomepageBlocks: async (options) => {
      const current = get().homepageBlocks;
      if (current.isLoading) {
        return current.feed;
      }
      if (
        !options?.forceRefresh
        && current.loaded
        && current.loadedAt !== null
        && Date.now() - current.loadedAt < HOMEPAGE_BLOCK_CACHE_TTL_MS
      ) {
        return current.feed;
      }

      const requestRevision = ++homepageBlockRequestRevision;
      set((state) => ({
        homepageBlocks: {
          ...state.homepageBlocks,
          isLoading: true,
          errorMessage: null
        }
      }));

      try {
        const musicApi = typeof window === 'undefined' ? undefined : window.musicPlayer?.music;
        if (!musicApi?.getHomepageBlocks) {
          throw new Error('当前版本暂不支持首页专题歌曲');
        }

        const result = options
          ? await musicApi.getHomepageBlocks('netease', options)
          : await musicApi.getHomepageBlocks('netease');
        if (homepageBlockRequestRevision !== requestRevision) {
          return get().homepageBlocks.feed;
        }
        if (!result.ok) {
          setHomepageBlocksError(set, result.error.message);
          return current.feed;
        }

        set({
          homepageBlocks: {
            feed: result.data,
            isLoading: false,
            loaded: true,
            loadedAt: Date.now(),
            errorMessage: null
          }
        });
        return result.data;
      } catch (error) {
        if (homepageBlockRequestRevision !== requestRevision) {
          return get().homepageBlocks.feed;
        }
        setHomepageBlocksError(
          set,
          error instanceof Error ? error.message : '首页专题歌曲加载失败'
        );
        return current.feed;
      }
    },

    resetForTest: () => {
      for (const providerId of ['qq', 'netease'] as const) {
        recommendationRequestRevisions[providerId].daily += 1;
        recommendationRequestRevisions[providerId].new += 1;
      }
      homepageBlockRequestRevision += 1;
      set({
        lastProviderId: null,
        recommendationsByProvider: createRecommendationState(),
        homepageBlocks: createEmptyHomepageBlockState()
      });
      writeStoredProviderId(null);
    }
  };
});

function createRecommendationState(): Record<RemoteProviderId, DiscoveryRecommendationState> {
  return {
    qq: createEmptyRecommendationState(),
    netease: createEmptyRecommendationState()
  };
}

function createEmptyRecommendationState(): DiscoveryRecommendationState {
  return {
    feed: null,
    modules: {
      daily: createEmptyRecommendationModuleState(),
      new: createEmptyRecommendationModuleState()
    }
  };
}

function createEmptyRecommendationModuleState(): DiscoveryRecommendationModuleState {
  return {
    isLoading: false,
    loaded: false,
    loadedAt: null,
    errorMessage: null
  };
}

function createEmptyHomepageBlockState(): DiscoveryHomepageBlockState {
  return {
    feed: null,
    isLoading: false,
    loaded: false,
    loadedAt: null,
    errorMessage: null
  };
}

function setHomepageBlocksError(
  set: (updater: (state: DiscoveryHomeState) => Partial<DiscoveryHomeState>) => void,
  errorMessage: string
): void {
  set((state) => ({
    homepageBlocks: {
      ...state.homepageBlocks,
      isLoading: false,
      errorMessage
    }
  }));
}

async function loadRecommendationModules(
  set: (updater: (state: DiscoveryHomeState) => Partial<DiscoveryHomeState>) => void,
  get: () => DiscoveryHomeState,
  requestRevisions: RecommendationRequestRevisions,
  providerId: RemoteProviderId,
  requestedModules: readonly DiscoveryRecommendationModule[],
  options?: ProviderFetchOptions
): Promise<RecommendationHomeFeed | null> {
  const current = get().recommendationsByProvider[providerId];
  const modules = options?.forceRefresh
    ? [...requestedModules]
    : requestedModules.filter((module) => !isRecommendationModuleFresh(current.modules[module]));
  if (modules.length === 0 || modules.some((module) => current.modules[module].isLoading)) {
    return current.feed;
  }
  const revisions = Object.fromEntries(modules.map((module) => [
    module,
    ++requestRevisions[providerId][module]
  ])) as Partial<Record<DiscoveryRecommendationModule, number>>;

  set((state) => ({
    recommendationsByProvider: {
      ...state.recommendationsByProvider,
      [providerId]: {
        ...state.recommendationsByProvider[providerId],
        modules: updateRecommendationModules(
          state.recommendationsByProvider[providerId].modules,
          modules,
          (moduleState) => ({
            ...moduleState,
            isLoading: true,
            errorMessage: null
          })
        )
      }
    }
  }));

  try {
    const musicApi = typeof window === 'undefined' ? undefined : window.musicPlayer?.music;
    if (!musicApi?.getRecommendationHome) {
      throw new Error('当前版本暂不支持推荐首页');
    }

    const result = options
      ? await musicApi.getRecommendationHome(providerId, options)
      : await musicApi.getRecommendationHome(providerId);
    const activeModules = modules.filter((module) => (
      requestRevisions[providerId][module] === revisions[module]
    ));
    if (activeModules.length === 0) {
      return get().recommendationsByProvider[providerId].feed;
    }
    if (!result.ok) {
      setRecommendationModulesError(set, providerId, activeModules, result.error.message);
      return current.feed;
    }

    const loadedAt = Date.now();
    set((state) => {
      const providerState = state.recommendationsByProvider[providerId];
      const feed = mergeRecommendationFeed(providerState.feed, result.data, activeModules);
      const nextModules = updateRecommendationModules(
        providerState.modules,
        activeModules,
        (_moduleState, module) => {
          const moduleResult = result.data.moduleResults[module];
          return {
            isLoading: false,
            loaded: true,
            loadedAt,
            errorMessage: moduleResult.status === 'rejected'
              ? moduleResult.errorMessage
              : null
          };
        }
      );

      return {
        recommendationsByProvider: {
          ...state.recommendationsByProvider,
          [providerId]: { feed, modules: nextModules }
        }
      };
    });
    return get().recommendationsByProvider[providerId].feed;
  } catch (error) {
    const activeModules = modules.filter((module) => (
      requestRevisions[providerId][module] === revisions[module]
    ));
    if (activeModules.length === 0) {
      return get().recommendationsByProvider[providerId].feed;
    }
    setRecommendationModulesError(
      set,
      providerId,
      activeModules,
      error instanceof Error ? error.message : '推荐内容加载失败'
    );
    return current.feed;
  }
}

type RecommendationRequestRevisions = Record<
  RemoteProviderId,
  Record<DiscoveryRecommendationModule, number>
>;

function createRecommendationRequestRevisions(): RecommendationRequestRevisions {
  return {
    qq: { daily: 0, new: 0 },
    netease: { daily: 0, new: 0 }
  };
}

function mergeRecommendationFeed(
  current: RecommendationHomeFeed | null,
  incoming: RecommendationHomeFeed,
  modules: readonly DiscoveryRecommendationModule[]
): RecommendationHomeFeed {
  const next: RecommendationHomeFeed = current
    ? {
        ...current,
        loggedIn: modules.includes('daily') ? incoming.loggedIn : current.loggedIn,
        moduleResults: { ...current.moduleResults }
      }
    : {
        providerId: incoming.providerId,
        loggedIn: incoming.loggedIn,
        dailySongs: [],
        newSongs: [],
        moduleResults: {
          daily: { status: 'skipped', errorMessage: null },
          new: { status: 'skipped', errorMessage: null }
        }
      };

  for (const module of modules) {
    const result = incoming.moduleResults[module];
    next.moduleResults[module] = result;
    if (result.status === 'fulfilled') {
      if (module === 'daily') {
        next.dailySongs = incoming.dailySongs;
      } else {
        next.newSongs = incoming.newSongs;
      }
    } else if (result.status === 'skipped') {
      if (module === 'daily') {
        next.dailySongs = [];
      } else {
        next.newSongs = [];
      }
    }
  }

  return next;
}

function setRecommendationModulesError(
  set: (updater: (state: DiscoveryHomeState) => Partial<DiscoveryHomeState>) => void,
  providerId: RemoteProviderId,
  modules: readonly DiscoveryRecommendationModule[],
  errorMessage: string
): void {
  const loadedAt = Date.now();
  set((state) => ({
    recommendationsByProvider: {
      ...state.recommendationsByProvider,
      [providerId]: {
        ...state.recommendationsByProvider[providerId],
        modules: updateRecommendationModules(
          state.recommendationsByProvider[providerId].modules,
          modules,
          () => ({
            isLoading: false,
            loaded: true,
            loadedAt,
            errorMessage
          })
        )
      }
    }
  }));
}

function updateRecommendationModules(
  current: Record<DiscoveryRecommendationModule, DiscoveryRecommendationModuleState>,
  modules: readonly DiscoveryRecommendationModule[],
  update: (
    state: DiscoveryRecommendationModuleState,
    module: DiscoveryRecommendationModule
  ) => DiscoveryRecommendationModuleState
): Record<DiscoveryRecommendationModule, DiscoveryRecommendationModuleState> {
  const next = { ...current };
  for (const module of modules) {
    next[module] = update(current[module], module);
  }
  return next;
}

function isRecommendationModuleFresh(state: DiscoveryRecommendationModuleState): boolean {
  return state.loaded
    && state.loadedAt !== null
    && Date.now() - state.loadedAt < RECOMMENDATION_HOME_CACHE_TTL_MS;
}

function getProviderRecommendationModules(
  providerId: RemoteProviderId
): readonly DiscoveryRecommendationModule[] {
  return providerId === 'netease' ? ['daily', 'new'] : ['new'];
}

export function resolveDiscoveryHomeProviderId(
  lastProviderId: unknown,
  defaultProviderId: ProviderId | null,
  defaultProviderLoggedIn: boolean
): RemoteProviderId {
  if (isRemoteProviderId(lastProviderId)) {
    return lastProviderId;
  }

  if (defaultProviderLoggedIn && isRemoteProviderId(defaultProviderId)) {
    return defaultProviderId;
  }

  return 'qq';
}

function readStoredProviderId(): RemoteProviderId | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const providerId = localStorage.getItem(DISCOVERY_HOME_PROVIDER_STORAGE_KEY);
    return isRemoteProviderId(providerId) ? providerId : null;
  } catch {
    return null;
  }
}

function writeStoredProviderId(providerId: RemoteProviderId | null): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (providerId) {
      localStorage.setItem(DISCOVERY_HOME_PROVIDER_STORAGE_KEY, providerId);
      return;
    }

    localStorage.removeItem(DISCOVERY_HOME_PROVIDER_STORAGE_KEY);
  } catch {
    // The in-memory selection remains usable when local storage is unavailable.
  }
}

function isRemoteProviderId(providerId: unknown): providerId is RemoteProviderId {
  return providerId === 'qq' || providerId === 'netease';
}
