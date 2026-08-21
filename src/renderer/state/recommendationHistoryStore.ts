import { create } from 'zustand';
import type { RemoteProviderId } from '../../shared/musicTypes';

export interface RecommendationHistoryState {
  dates: string[];
  activeDate: string | null;
  songs: RecommendationHistorySong[];
  isLoading: boolean;
  isLoadingDates: boolean;
  errorMessage: string | null;
  loadedAt: number | null;

  loadDates(providerId: RemoteProviderId): Promise<void>;
  loadSongs(providerId: RemoteProviderId, date: string): Promise<void>;
  clear(): void;
}

export interface RecommendationHistorySong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverTone: string;
  coverUrl?: string;
  providerId: RemoteProviderId;
}

const TTL_MS = 10 * 60 * 1000;
const revisionByKey: Record<string, number> = {};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useRecommendationHistoryStore = create<RecommendationHistoryState>((set, get) => ({
  dates: [],
  activeDate: null,
  songs: [],
  isLoading: false,
  isLoadingDates: false,
  errorMessage: null,
  loadedAt: null,

  async loadDates(providerId) {
    const loadedAt = get().loadedAt;
    if (loadedAt && Date.now() - loadedAt < TTL_MS) {
      if (!get().activeDate && get().dates.length > 0) {
        await get().loadSongs(providerId, get().dates[0]);
      }
      return;
    }
    if (get().isLoadingDates) return;
    const revision = (revisionByKey['dates'] = (revisionByKey['dates'] ?? 0) + 1);
    set({ isLoadingDates: true, errorMessage: null });

    try {
      const result = await window.musicPlayer.music.getRecommendationHistoryDates(providerId);
      if (revision !== revisionByKey['dates']) return;
      if (result.ok) {
        const dates = result.data.slice(0, 7);
        set({ dates, loadedAt: Date.now() });
        if (!get().activeDate && dates.length > 0) {
          await get().loadSongs(providerId, dates[0]);
        }
      } else {
        set({ errorMessage: result.error.message });
      }
    } catch (error) {
      if (revision === revisionByKey['dates']) set({ errorMessage: errorMessage(error) });
    } finally {
      if (revision === revisionByKey['dates']) set({ isLoadingDates: false });
    }
  },

  async loadSongs(providerId, date) {
    const revision = (revisionByKey['songs'] = (revisionByKey['songs'] ?? 0) + 1);
    set({ isLoading: true, errorMessage: null, activeDate: date });

    try {
      const result = await window.musicPlayer.music.getRecommendationHistory(providerId, date);
      if (revision !== revisionByKey['songs']) return;
      if (result.ok) {
        set({
          songs: result.data.songs.map((song) => ({
            id: song.id,
            title: song.title,
            artist: song.artist,
            album: song.album,
            durationMs: song.durationMs,
            coverTone: song.coverTone,
            coverUrl: song.coverUrl,
            providerId: result.data.providerId
          })),
          isLoading: false
        });
      } else {
        set({ errorMessage: result.error.message, isLoading: false, songs: [] });
      }
    } catch (error) {
      if (revision !== revisionByKey['songs']) return;
      set({ errorMessage: errorMessage(error), isLoading: false, songs: [] });
    } finally {
      if (revision === revisionByKey['songs']) set({ isLoading: false });
    }
  },

  clear() {
    revisionByKey['dates'] = (revisionByKey['dates'] ?? 0) + 1;
    revisionByKey['songs'] = (revisionByKey['songs'] ?? 0) + 1;
    set({ dates: [], activeDate: null, songs: [], errorMessage: null, loadedAt: null, isLoading: false, isLoadingDates: false });
  }
}));
