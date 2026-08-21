import { create } from 'zustand';
import type { Playlist, ProviderId, Song } from '../../shared/musicTypes';

export interface PlaylistMutationResult {
  ok: boolean;
  message?: string;
}

export interface LibraryState {
  providerPlaylists: Record<ProviderId, Playlist[]>;
  playlistsLoading: Record<ProviderId, boolean>;
  playlistTracks: Record<string, Song[]>;
  playlistTracksLoading: Record<string, boolean>;
  selectedProviderId: ProviderId | null;
  selectedPlaylistId: string | null;
  likedSongIds: Record<ProviderId, Set<string>>;
  likedLoaded: Record<ProviderId, boolean>;

  loadProviderPlaylists(providerId: ProviderId): Promise<void>;
  loadPlaylistTracks(providerId: ProviderId, playlistId: string): Promise<void>;
  seedPlaylistTracks(providerId: ProviderId, playlistId: string, tracks: Song[]): void;
  selectPlaylist(providerId: ProviderId, playlistId: string): void;
  ensureLikedSongIds(providerId: ProviderId): Promise<void>;
  setSongLiked(song: Song, liked: boolean): Promise<void>;
  addSongToPlaylist(providerId: ProviderId, song: Song, playlistId: string): Promise<PlaylistMutationResult>;
  removeSongFromPlaylist(providerId: ProviderId, song: Song, playlistId: string): Promise<PlaylistMutationResult>;
  clearProviderLibrary(providerId: ProviderId): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  providerPlaylists: { netease: [], qq: [], local: [] },
  playlistsLoading: { netease: false, qq: false, local: false },
  playlistTracks: {},
  playlistTracksLoading: {},
  selectedProviderId: null,
  selectedPlaylistId: null,
  likedSongIds: { netease: new Set(), qq: new Set(), local: new Set() },
  likedLoaded: { netease: false, qq: false, local: false },

  async loadProviderPlaylists(providerId) {
    if (get().playlistsLoading[providerId]) return;
    set((state) => ({ playlistsLoading: { ...state.playlistsLoading, [providerId]: true } }));
    try {
      const result = await window.musicPlayer.music.getUserPlaylists(providerId);
      if (result.ok) {
        set((state) => ({ providerPlaylists: { ...state.providerPlaylists, [providerId]: result.data } }));
      }
    } catch (error) {
      // ignore: 保持旧数据，避免阻塞后续重试
    } finally {
      set((state) => ({ playlistsLoading: { ...state.playlistsLoading, [providerId]: false } }));
    }
  },

  async loadPlaylistTracks(providerId, playlistId) {
    const key = `${providerId}:${playlistId}`;
    if (get().playlistTracksLoading[key]) return;
    set((state) => ({ playlistTracksLoading: { ...state.playlistTracksLoading, [key]: true } }));
    try {
      const result = await window.musicPlayer.music.getPlaylistTracks(providerId, playlistId);
      if (result.ok) {
        set((state) => ({ playlistTracks: { ...state.playlistTracks, [key]: result.data } }));
      }
    } catch (error) {
      // ignore
    } finally {
      set((state) => ({ playlistTracksLoading: { ...state.playlistTracksLoading, [key]: false } }));
    }
  },

  selectPlaylist(providerId, playlistId) {
    set({ selectedProviderId: providerId, selectedPlaylistId: playlistId });
  },

  seedPlaylistTracks(providerId, playlistId, tracks) {
    if (!tracks || tracks.length === 0) return;
    const key = `${providerId}:${playlistId}`;
    const existing = get().playlistTracks[key];
    if (existing && existing.length > 0) return;
    set((state) => ({ playlistTracks: { ...state.playlistTracks, [key]: tracks } }));
  },

  async ensureLikedSongIds(providerId) {
    if (get().likedLoaded[providerId]) return;
    const likedPlaylist = get().providerPlaylists[providerId].find((p) => p.isLiked);
    if (!likedPlaylist) return;
    const key = `${providerId}:${likedPlaylist.id}`;
    const tracks = get().playlistTracks[key];
    if (tracks) {
      set((state) => ({
        likedSongIds: { ...state.likedSongIds, [providerId]: new Set(tracks.map((t) => t.id)) },
        likedLoaded: { ...state.likedLoaded, [providerId]: true }
      }));
      return;
    }
    try {
      const result = await window.musicPlayer.music.getPlaylistTracks(providerId, likedPlaylist.id);
      if (result.ok) {
        set((state) => ({
          playlistTracks: { ...state.playlistTracks, [key]: result.data },
          likedSongIds: { ...state.likedSongIds, [providerId]: new Set(result.data.map((t) => t.id)) },
          likedLoaded: { ...state.likedLoaded, [providerId]: true }
        }));
      }
    } catch (error) {
      // ignore
    }
  },

  async setSongLiked(song, liked) {
    try {
      const result = await window.musicPlayer.music.setSongLiked(song.providerId, song, liked);
      if (result.ok) {
        set((state) => {
          const likedPlaylist = state.providerPlaylists[song.providerId]?.find((p) => p.isLiked);
          const current = new Set(state.likedSongIds[song.providerId] ?? []);
          if (liked) current.add(song.id);
          else current.delete(song.id);
          const patch: Partial<LibraryState> = {
            likedSongIds: { ...state.likedSongIds, [song.providerId]: current }
          };
          if (likedPlaylist) {
            const playlistKey = `${song.providerId}:${likedPlaylist.id}`;
            const tracks = state.playlistTracks[playlistKey];
            if (tracks) {
              const exists = tracks.some((t) => t.id === song.id && t.providerId === song.providerId);
              const next = liked
                ? (exists ? tracks : [...tracks, song])
                : tracks.filter((t) => !(t.id === song.id && t.providerId === song.providerId));
              patch.playlistTracks = { ...state.playlistTracks, [playlistKey]: next };
            }
          }
          return patch;
        });
      }
    } catch (error) {
      // ignore
    }
  },

  async addSongToPlaylist(providerId, song, playlistId) {
    try {
      const result = await window.musicPlayer.music.addSongToPlaylist(providerId, song, playlistId);
      if (result.ok) {
        set((state) => {
          const key = `${providerId}:${playlistId}`;
          const existing = state.playlistTracks[key];
          if (existing && !existing.some((s) => s.id === song.id && s.providerId === song.providerId)) {
            return { playlistTracks: { ...state.playlistTracks, [key]: [...existing, song] } };
          }
          return state;
        });
        const likedPlaylist = get().providerPlaylists[providerId]?.find((p) => p.isLiked && p.id === playlistId);
        if (likedPlaylist) {
          set((state) => {
            const current = new Set(state.likedSongIds[providerId] ?? []);
            current.add(song.id);
            return { likedSongIds: { ...state.likedSongIds, [providerId]: current } };
          });
        }
        return { ok: true };
      }
      return { ok: false, message: result.error.message };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  },

  async removeSongFromPlaylist(providerId, song, playlistId) {
    try {
      const result = await window.musicPlayer.music.removeSongFromPlaylist(providerId, song, playlistId);
      if (result.ok) {
        set((state) => {
          const key = `${providerId}:${playlistId}`;
          const existing = state.playlistTracks[key];
          if (existing) {
            return {
              playlistTracks: {
                ...state.playlistTracks,
                [key]: existing.filter((s) => !(s.id === song.id && s.providerId === song.providerId))
              }
            };
          }
          return state;
        });
        const likedPlaylist = get().providerPlaylists[providerId]?.find((p) => p.isLiked && p.id === playlistId);
        if (likedPlaylist) {
          set((state) => {
            const current = new Set(state.likedSongIds[providerId] ?? []);
            current.delete(song.id);
            return { likedSongIds: { ...state.likedSongIds, [providerId]: current } };
          });
        }
        return { ok: true };
      }
      return { ok: false, message: result.error.message };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  },

  clearProviderLibrary(providerId) {
    set((state) => ({
      providerPlaylists: { ...state.providerPlaylists, [providerId]: [] },
      likedSongIds: { ...state.likedSongIds, [providerId]: new Set() },
      likedLoaded: { ...state.likedLoaded, [providerId]: false }
    }));
  }
}));
