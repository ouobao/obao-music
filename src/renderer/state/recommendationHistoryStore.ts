import { create } from 'zustand';
import type { RecommendationHistoryPage, Song } from '../../shared/musicTypes';
import type { ProviderFetchOptions, ProviderIpcResult } from '../../shared/providerTypes';

interface RecommendationHistoryCacheEntry {
  songs: Song[];
  updatedAt: number;
}

export interface RecommendationHistoryState {
  dates: string[];
  activeDate: string | null;
  songs: Song[];
  isLoading: boolean;
  loaded: boolean;
  errorMessage: string | null;
  datesUpdatedAt: number | null;
  cacheByDate: Record<string, RecommendationHistoryCacheEntry>;
  load: (options?: ProviderFetchOptions) => Promise<Song[]>;
  selectDate: (date: string, options?: ProviderFetchOptions) => Promise<Song[]>;
  clear: () => void;
  resetForTest: () => void;
}

export const RECOMMENDATION_HISTORY_RENDERER_TTL_MS = 10 * 60_000;
export const RECOMMENDATION_HISTORY_DATE_LIMIT = 7;

export const useRecommendationHistoryStore = create<RecommendationHistoryState>((set, get) => {
  let requestRevision = 0;
  let loadPromise: Promise<Song[]> | null = null;
  const detailPromises = new Map<string, Promise<Song[]>>();

  const clearState = () => {
    requestRevision += 1;
    loadPromise = null;
    detailPromises.clear();
    set(createInitialState());
  };

  return {
    ...createInitialState(),

    load: async (options = {}) => {
      if (!options.forceRefresh && loadPromise) {
        return loadPromise;
      }

      const now = Date.now();
      const current = get();
      const cachedActive = current.activeDate ? current.cacheByDate[current.activeDate] : undefined;
      if (
        !options.forceRefresh
        && current.loaded
        && current.datesUpdatedAt !== null
        && now - current.datesUpdatedAt < RECOMMENDATION_HISTORY_RENDERER_TTL_MS
        && (!current.activeDate || (
          cachedActive
          && now - cachedActive.updatedAt < RECOMMENDATION_HISTORY_RENDERER_TTL_MS
        ))
      ) {
        return current.songs;
      }

      const revision = ++requestRevision;
      set((state) => ({
        ...state,
        isLoading: true,
        errorMessage: null
      }));

      const promise = (async () => {
        const datesResult = await window.musicPlayer.music.getRecommendationHistoryDates(
          'netease',
          options.forceRefresh ? { forceRefresh: true } : undefined
        );
        if (!datesResult.ok) {
          throw new Error(datesResult.error.message);
        }

        const dates = datesResult.data.slice(0, RECOMMENDATION_HISTORY_DATE_LIMIT);
        if (dates.length === 0) {
          if (requestRevision === revision) {
            set({
              dates: [],
              activeDate: null,
              songs: [],
              isLoading: false,
              loaded: true,
              errorMessage: null,
              datesUpdatedAt: Date.now(),
              cacheByDate: {}
            });
          }
          return [];
        }

        const latestState = get();
        const targetDate = latestState.activeDate && dates.includes(latestState.activeDate)
          ? latestState.activeDate
          : dates[0];
        const pageResult = await window.musicPlayer.music.getRecommendationHistory(
          'netease',
          targetDate,
          options.forceRefresh ? { forceRefresh: true } : undefined
        );
        if (!pageResult.ok) {
          throw new Error(pageResult.error.message);
        }

        if (requestRevision === revision) {
          const updatedAt = Date.now();
          set((state) => ({
            dates,
            activeDate: targetDate,
            songs: pageResult.data.songs,
            isLoading: false,
            loaded: true,
            errorMessage: null,
            datesUpdatedAt: updatedAt,
            cacheByDate: {
              ...state.cacheByDate,
              [targetDate]: {
                songs: pageResult.data.songs,
                updatedAt
              }
            }
          }));
        }
        return pageResult.data.songs;
      })().catch((error: unknown) => {
        if (requestRevision === revision) {
          set((state) => ({
            ...state,
            isLoading: false,
            loaded: true,
            errorMessage: getErrorMessage(error, '网易云历史日推加载失败')
          }));
        }
        return get().songs;
      }).finally(() => {
        if (loadPromise === promise) {
          loadPromise = null;
        }
      });

      loadPromise = promise;
      return promise;
    },

    selectDate: async (date, options = {}) => {
      const current = get();
      if (!current.dates.includes(date)) {
        return current.songs;
      }

      const now = Date.now();
      const cached = current.cacheByDate[date];
      if (
        !options.forceRefresh
        && cached
        && now - cached.updatedAt < RECOMMENDATION_HISTORY_RENDERER_TTL_MS
      ) {
        set({
          activeDate: date,
          songs: cached.songs,
          isLoading: false,
          errorMessage: null
        });
        return cached.songs;
      }

      const existingPromise = detailPromises.get(date);
      if (!options.forceRefresh && existingPromise) {
        return existingPromise;
      }

      const revision = ++requestRevision;
      set((state) => ({ ...state, isLoading: true, errorMessage: null }));
      const promise = window.musicPlayer.music.getRecommendationHistory(
        'netease',
        date,
        options.forceRefresh ? { forceRefresh: true } : undefined
      ).then((result: ProviderIpcResult<RecommendationHistoryPage>) => {
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        if (requestRevision === revision) {
          const updatedAt = Date.now();
          set((state) => ({
            ...state,
            activeDate: date,
            songs: result.data.songs,
            isLoading: false,
            errorMessage: null,
            cacheByDate: {
              ...state.cacheByDate,
              [date]: { songs: result.data.songs, updatedAt }
            }
          }));
        }
        return result.data.songs;
      }).catch((error: unknown) => {
        if (requestRevision === revision) {
          set((state) => ({
            ...state,
            isLoading: false,
            errorMessage: getErrorMessage(error, '网易云历史日推加载失败')
          }));
        }
        return get().songs;
      }).finally(() => {
        if (detailPromises.get(date) === promise) {
          detailPromises.delete(date);
        }
      });

      detailPromises.set(date, promise);
      return promise;
    },

    clear: clearState,
    resetForTest: clearState
  };
});

function createInitialState(): Pick<
  RecommendationHistoryState,
  'dates' | 'activeDate' | 'songs' | 'isLoading' | 'loaded' | 'errorMessage' | 'datesUpdatedAt' | 'cacheByDate'
> {
  return {
    dates: [],
    activeDate: null,
    songs: [],
    isLoading: false,
    loaded: false,
    errorMessage: null,
    datesUpdatedAt: null,
    cacheByDate: {}
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
