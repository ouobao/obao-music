import { create } from 'zustand';
import type { DiscoveredPlaylist, PlaylistDetail, ProviderId } from '../../shared/musicTypes';
import type { LoadStatus } from './loadStatus';

export interface PlaylistDetailState {
  detailsByKey: Record<string, PlaylistDetail>;
  statusByKey: Record<string, LoadStatus>;
  errorByKey: Record<string, string | null>;

  load(providerId: ProviderId, playlistId: string, options?: { force?: boolean }): Promise<PlaylistDetail | null>;
  seed(providerId: ProviderId, playlistId: string, detail: PlaylistDetail): void;
  clear(providerId: ProviderId): void;
}

const revisionByKey: Record<string, number> = {};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

export const usePlaylistDetailStore = create<PlaylistDetailState>((set, get) => ({
  detailsByKey: {},
  statusByKey: {},
  errorByKey: {},

  async load(providerId, playlistId, options) {
    const key = `${providerId}:${playlistId}`;
    const current = get().statusByKey[key];
    // 非强制刷新时，加载中/刷新中的请求合并（避免并发重复拉取）；
    // force（如应用从后台回到前台）时无视当前状态直接重新拉取
    if (!options?.force && (current === 'loading' || current === 'refreshing')) return get().detailsByKey[key] ?? null;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);
    const hasData = Boolean(get().detailsByKey[key]);
    set((state) => ({
      statusByKey: { ...state.statusByKey, [key]: hasData ? 'refreshing' : 'loading' },
      errorByKey: { ...state.errorByKey, [key]: null }
    }));

    try {
      const result = await window.musicPlayer.music.getPlaylistDetail(providerId, playlistId);
      if (revision !== revisionByKey[key]) return null;
      if (result.ok) {
        const detail = result.data;
        const prev = get().detailsByKey[key];
        const prevCover = prev?.playlist.coverUrl;
        const newCover = detail.playlist.coverUrl;
        // 如果后端返回的封面为空，但之前 seed 过有效封面，则保留原有封面
        if (!newCover && prevCover) {
          detail.playlist.coverUrl = prevCover;
        } else if (newCover && prevCover && newCover !== prevCover) {
          // 后端返回了新封面，预加载成功后再切换；加载失败则回退保留旧封面
          try {
            await preloadImage(newCover);
          } catch {
            detail.playlist.coverUrl = prevCover;
          }
        }
        set((state) => ({
          detailsByKey: { ...state.detailsByKey, [key]: detail },
          statusByKey: {
            ...state.statusByKey,
            [key]: detail.tracks.length > 0 || detail.playlist.songIds.length > 0 ? 'success' : 'success-empty'
          }
        }));
        return detail;
      }
      set((state) => ({
        errorByKey: { ...state.errorByKey, [key]: result.error.message },
        statusByKey: { ...state.statusByKey, [key]: 'error' }
      }));
      return null;
    } catch (error) {
      if (revision !== revisionByKey[key]) return null;
      set((state) => ({
        errorByKey: { ...state.errorByKey, [key]: errorMessage(error) },
        statusByKey: { ...state.statusByKey, [key]: 'error' }
      }));
      return null;
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

  seed(providerId, playlistId, detail) {
    const key = `${providerId}:${playlistId}`;
    const current = get().statusByKey[key];
    if (current === 'success' || current === 'error') return;
    set((state) => ({
      detailsByKey: { ...state.detailsByKey, [key]: detail },
      statusByKey: { ...state.statusByKey, [key]: get().statusByKey[key] === 'loading' ? 'refreshing' : 'success' }
    }));
  },

  clear(providerId) {
    set((state) => {
      const prefix = `${providerId}:`;
      const detailsByKey: Record<string, PlaylistDetail> = {};
      const statusByKey: Record<string, LoadStatus> = {};
      const errorByKey: Record<string, string | null> = {};
      for (const key of Object.keys(state.detailsByKey)) {
        if (!key.startsWith(prefix)) detailsByKey[key] = state.detailsByKey[key];
      }
      for (const key of Object.keys(state.statusByKey)) {
        if (!key.startsWith(prefix)) statusByKey[key] = state.statusByKey[key];
      }
      for (const key of Object.keys(state.errorByKey)) {
        if (!key.startsWith(prefix)) errorByKey[key] = state.errorByKey[key];
      }
      return { detailsByKey, statusByKey, errorByKey };
    });
  }
}));

export function toPlaylistDetail(playlist: DiscoveredPlaylist): PlaylistDetail {
  return {
    providerId: playlist.providerId,
    playlist: {
      id: playlist.id,
      providerId: playlist.providerId,
      title: playlist.title,
      description: playlist.description,
      songIds: playlist.songIds ?? [],
      coverTone: playlist.coverTone,
      ...(playlist.coverUrl ? { coverUrl: playlist.coverUrl } : {}),
      ...(playlist.sourceLabel ? { sourceLabel: playlist.sourceLabel } : {})
    },
    tracks: [],
    ...(playlist.creatorName ? { creatorName: playlist.creatorName } : {}),
    ...(playlist.playCount != null ? { playCount: playlist.playCount } : {}),
    ...(playlist.trackCount != null ? { trackCount: playlist.trackCount } : {})
  };
}
