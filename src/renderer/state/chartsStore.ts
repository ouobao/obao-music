import { create } from 'zustand';
import type { ChartSummary, RemoteProviderId, Song } from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';

interface ChartsState {
  chartsByProvider: Record<RemoteProviderId, ChartSummary[]>;
  chartTracksById: Record<string, Song[]>;
  isLoadingByProvider: Record<RemoteProviderId, boolean>;
  errorMessageByProvider: Record<RemoteProviderId, string | null>;
  loadedByProvider: Record<RemoteProviderId, boolean>;
  isLoadingByChartId: Record<string, boolean>;
  errorMessageByChartId: Record<string, string | null>;
  loadedChartIds: Record<string, boolean>;
  lastProviderId: RemoteProviderId | null;
  loadCharts: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ChartSummary[]>;
  loadChartTracks: (providerId: RemoteProviderId, chartId: string, options?: ProviderFetchOptions) => Promise<Song[]>;
  setLastProviderId: (providerId: RemoteProviderId) => void;
  resetForTest: () => void;
}

const CHARTS_PROVIDER_STORAGE_KEY = 'musicplayer.charts-provider';

export const useChartsStore = create<ChartsState>((set, get) => ({
  ...createChartsDataState(readStoredProviderId()),

  loadCharts: async (providerId, options) => {
    const currentState = get();
    if (!options?.forceRefresh && currentState.loadedByProvider[providerId]) {
      return currentState.chartsByProvider[providerId];
    }

    set((state) => ({
      isLoadingByProvider: {
        ...state.isLoadingByProvider,
        [providerId]: true
      },
      errorMessageByProvider: {
        ...state.errorMessageByProvider,
        [providerId]: null
      }
    }));

    const result = options
      ? await window.musicPlayer.music.getCharts(providerId, options)
      : await window.musicPlayer.music.getCharts(providerId);
    if (!result.ok) {
      set((state) => ({
        isLoadingByProvider: {
          ...state.isLoadingByProvider,
          [providerId]: false
        },
        errorMessageByProvider: {
          ...state.errorMessageByProvider,
          [providerId]: result.error.message
        }
      }));
      return [];
    }

    set((state) => ({
      chartsByProvider: {
        ...state.chartsByProvider,
        [providerId]: result.data
      },
      isLoadingByProvider: {
        ...state.isLoadingByProvider,
        [providerId]: false
      },
      errorMessageByProvider: {
        ...state.errorMessageByProvider,
        [providerId]: null
      },
      loadedByProvider: {
        ...state.loadedByProvider,
        [providerId]: true
      }
    }));
    return result.data;
  },

  loadChartTracks: async (providerId, chartId, options) => {
    const currentState = get();
    if (!options?.forceRefresh && currentState.loadedChartIds[chartId]) {
      return currentState.chartTracksById[chartId] ?? [];
    }

    set((state) => ({
      isLoadingByChartId: {
        ...state.isLoadingByChartId,
        [chartId]: true
      },
      errorMessageByChartId: {
        ...state.errorMessageByChartId,
        [chartId]: null
      }
    }));

    const result = options
      ? await window.musicPlayer.music.getChartTracks(providerId, chartId, options)
      : await window.musicPlayer.music.getChartTracks(providerId, chartId);
    if (!result.ok) {
      set((state) => ({
        isLoadingByChartId: {
          ...state.isLoadingByChartId,
          [chartId]: false
        },
        errorMessageByChartId: {
          ...state.errorMessageByChartId,
          [chartId]: result.error.message
        }
      }));
      return [];
    }

    set((state) => ({
      chartTracksById: {
        ...state.chartTracksById,
        [chartId]: result.data
      },
      isLoadingByChartId: {
        ...state.isLoadingByChartId,
        [chartId]: false
      },
      errorMessageByChartId: {
        ...state.errorMessageByChartId,
        [chartId]: null
      },
      loadedChartIds: {
        ...state.loadedChartIds,
        [chartId]: true
      }
    }));
    return result.data;
  },

  setLastProviderId: (lastProviderId) => {
    set({ lastProviderId });
    writeStoredProviderId(lastProviderId);
  },

  resetForTest: () => set(createChartsDataState(null))
}));

function createChartsDataState(lastProviderId: RemoteProviderId | null) {
  return {
    chartsByProvider: {
      qq: [],
      netease: []
    },
    chartTracksById: {},
    isLoadingByProvider: {
      qq: false,
      netease: false
    },
    errorMessageByProvider: {
      qq: null,
      netease: null
    },
    loadedByProvider: {
      qq: false,
      netease: false
    },
    isLoadingByChartId: {},
    errorMessageByChartId: {},
    loadedChartIds: {},
    lastProviderId
  };
}

function readStoredProviderId(): RemoteProviderId | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const providerId = localStorage.getItem(CHARTS_PROVIDER_STORAGE_KEY);
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
    localStorage.setItem(CHARTS_PROVIDER_STORAGE_KEY, providerId);
  } catch {
    // The selected provider still updates when local storage is unavailable.
  }
}
