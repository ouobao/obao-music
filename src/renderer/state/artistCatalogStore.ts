import { create } from 'zustand';
import type { AlbumDetail, AlbumSummary, ArtistDetail, RemoteProviderId, Song } from '../../shared/musicTypes';

export interface ArtistCatalogState {
  artistsByKey: Record<string, ArtistDetail>;
  albumsByKey: Record<string, AlbumDetail>;
  loadingArtist: Record<string, boolean>;
  loadingAlbum: Record<string, boolean>;
  loadingMoreSongs: Record<string, boolean>;
  errorArtist: Record<string, string | null>;
  errorAlbum: Record<string, string | null>;

  loadArtist(providerId: RemoteProviderId, artistId: string): Promise<ArtistDetail | null>;
  loadAlbum(providerId: RemoteProviderId, albumId: string): Promise<AlbumDetail | null>;
  loadMoreArtistSongs(providerId: RemoteProviderId, artistId: string, offset: number): Promise<Song[] | null>;
}

const revisionByKey: Record<string, number> = {};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useArtistCatalogStore = create<ArtistCatalogState>((set, get) => ({
  artistsByKey: {},
  albumsByKey: {},
  loadingArtist: {},
  loadingAlbum: {},
  loadingMoreSongs: {},
  errorArtist: {},
  errorAlbum: {},

  async loadArtist(providerId, artistId) {
    const key = `${providerId}:${artistId}`;
    const existing = get().artistsByKey[key];
    if (existing) return existing;
    if (get().loadingArtist[key]) return null;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);

    set((state) => ({ loadingArtist: { ...state.loadingArtist, [key]: true } }));
    try {
      const result = await window.musicPlayer.music.getArtistDetail(providerId, artistId);
      if (revision !== revisionByKey[key]) return null;
      if (result.ok) {
        set((state) => ({
          artistsByKey: { ...state.artistsByKey, [key]: result.data },
          errorArtist: { ...state.errorArtist, [key]: null }
        }));
        return result.data;
      }
      set((state) => ({ errorArtist: { ...state.errorArtist, [key]: result.error.message } }));
      return null;
    } catch (error) {
      if (revision !== revisionByKey[key]) return null;
      set((state) => ({ errorArtist: { ...state.errorArtist, [key]: errorMessage(error) } }));
      return null;
    } finally {
      if (revision === revisionByKey[key]) {
        set((state) => ({ loadingArtist: { ...state.loadingArtist, [key]: false } }));
      }
    }
  },

  async loadAlbum(providerId, albumId) {
    const key = `${providerId}:${albumId}`;
    const existing = get().albumsByKey[key];
    if (existing) return existing;
    if (get().loadingAlbum[key]) return null;
    const revision = (revisionByKey[key] = (revisionByKey[key] ?? 0) + 1);

    set((state) => ({ loadingAlbum: { ...state.loadingAlbum, [key]: true } }));
    try {
      const result = await window.musicPlayer.music.getAlbumDetail(providerId, albumId);
      if (revision !== revisionByKey[key]) return null;
      if (result.ok) {
        set((state) => ({
          albumsByKey: { ...state.albumsByKey, [key]: result.data },
          errorAlbum: { ...state.errorAlbum, [key]: null }
        }));
        return result.data;
      }
      set((state) => ({ errorAlbum: { ...state.errorAlbum, [key]: result.error.message } }));
      return null;
    } catch (error) {
      if (revision !== revisionByKey[key]) return null;
      set((state) => ({ errorAlbum: { ...state.errorAlbum, [key]: errorMessage(error) } }));
      return null;
    } finally {
      if (revision === revisionByKey[key]) {
        set((state) => ({ loadingAlbum: { ...state.loadingAlbum, [key]: false } }));
      }
    }
  },

  async loadMoreArtistSongs(providerId, artistId, offset) {
    const key = `${providerId}:${artistId}`;
    const existing = get().artistsByKey[key];
    if (!existing) return null;
    if (get().loadingMoreSongs[key]) return null;
    set((state) => ({ loadingMoreSongs: { ...state.loadingMoreSongs, [key]: true } }));
    try {
      const result = await window.musicPlayer.music.getArtistSongsPage(providerId, artistId, offset);
      if (!result.ok) return null;
      const page = result.data;
      const seen = new Set(existing.topSongs.map((s) => s.id));
      const merged = [...existing.topSongs];
      for (const song of page.songs) {
        if (!seen.has(song.id)) {
          seen.add(song.id);
          merged.push(song);
        }
      }
      set((state) => ({
        artistsByKey: { ...state.artistsByKey, [key]: { ...existing, topSongs: merged } }
      }));
      return page.songs;
    } catch {
      return null;
    } finally {
      set((state) => ({ loadingMoreSongs: { ...state.loadingMoreSongs, [key]: false } }));
    }
  }
}));

export function toSongRow(song: Song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationMs: song.durationMs,
    coverTone: song.coverTone,
    coverUrl: song.coverUrl
  };
}

export function toAlbumRow(album: AlbumSummary) {
  return {
    id: album.id,
    title: album.title,
    artistName: album.artistName,
    coverTone: album.coverTone,
    coverUrl: album.coverUrl,
    releaseDate: album.releaseDate,
    trackCount: album.trackCount
  };
}
