import { create } from 'zustand';
import type { ChartSummary, RemoteProviderId, Song } from '../../shared/musicTypes';
import type { LoadStatus } from './loadStatus';

export interface ChartsState {
  chartsByProvider: Record<string, ChartSummary[]>;
  chartTracksByKey: Record<string, Song[]>;
  isLoadingByProvider: Record<string, boolean>;
  errorByProvider: Record<string, string | null>;
  statusByProvider: Record<string, LoadStatus>;
  statusByKey: Record<string, LoadStatus>;
  loadedAtByProvider: Record<string, number>;
  loadedAtByKey: Record<string, number>;
  lastProviderId: RemoteProviderId;

  loadCharts(providerId: RemoteProviderId): Promise<void>;
  loadChartTracks(providerId: RemoteProviderId, chartId: string): Promise<void>;
  setLastProvider(providerId: RemoteProviderId): void;
}

const TTL_MS = 10 * 60 * 1000;
const revisionByKey: Record<string, number> = {};

export const useChartsStore = create<ChartsState>((set, get) => ({
  chartsByProvider: {},
  chartTracksByKey: {},
  isLoadingByProvider: {},
  errorByProvider: {},
  statusByProvider: {},
  statusByKey: {},
  loadedAtByProvider: {},
  loadedAtByKey: {},
  lastProviderId: 'netease',

  async loadCharts(providerId) {
    const key = providerId;
    const loadedAt = get().loadedAtByProvider[key];
    if (loadedAt && Date.now() - loadedAt < TTL_MS) return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().chartsByProvider[providerId]?.length);
    set((state) => ({
      isLoadingByProvider: { ...state.isLoadingByProvider, [providerId]: true },
      statusByProvider: { ...state.statusByProvider, [providerId]: hasData ? 'refreshing' : 'loading' }
    }));

    try {
      const result = await window.musicPlayer.music.getCharts(providerId);
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const charts = result.data;
        set((state) => ({
          chartsByProvider: { ...state.chartsByProvider, [providerId]: charts },
          errorByProvider: { ...state.errorByProvider, [providerId]: null },
          statusByProvider: {
            ...state.statusByProvider,
            [providerId]: charts.length > 0 ? 'success' : 'success-empty'
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
        set((state) => ({ isLoadingByProvider: { ...state.isLoadingByProvider, [providerId]: false } }));
      }
    }
  },

  async loadChartTracks(providerId, chartId) {
    const key = `${providerId}:${chartId}`;
    const loadedAt = get().loadedAtByKey[key];
    if (loadedAt && Date.now() - loadedAt < TTL_MS) return;
    const current = get().statusByKey[key];
    if (current === 'loading' || current === 'refreshing') return;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().chartTracksByKey[key]?.length);
    set((state) => ({ statusByKey: { ...state.statusByKey, [key]: hasData ? 'refreshing' : 'loading' } }));

    try {
      const result = await window.musicPlayer.music.getChartTracks(providerId, chartId);
      if (revision !== revisionByKey[key]) return;
      if (result.ok) {
        const tracks = result.data;
        set((state) => ({
          chartTracksByKey: { ...state.chartTracksByKey, [key]: tracks },
          statusByKey: { ...state.statusByKey, [key]: tracks.length > 0 ? 'success' : 'success-empty' },
          loadedAtByKey: { ...state.loadedAtByKey, [key]: Date.now() }
        }));
      } else {
        set((state) => ({ statusByKey: { ...state.statusByKey, [key]: 'error' } }));
      }
    } catch (error) {
      if (revision !== revisionByKey[key]) return;
      set((state) => ({ statusByKey: { ...state.statusByKey, [key]: 'error' } }));
    } finally {
      if (revision === revisionByKey[key]) {
        set((state) => {
          const currentStatus = state.statusByKey[key];
          if (currentStatus === 'loading' || currentStatus === 'refreshing') {
            return { statusByKey: { ...state.statusByKey, [key]: 'error' } };
          }
          return state;
        });
      }
    }
  },

  setLastProvider(providerId) {
    set({ lastProviderId: providerId });
  }
}));
