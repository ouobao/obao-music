import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path = require('node:path');
import { pathToFileURL } from 'node:url';
import type { LocalLibraryEntry, LocalLibraryStore } from '../storage/localLibraryStore.cjs';
import type { LyricsResult, LoginStatus, MusicProvider, Playlist, Quality, SearchOptions, Song, SongMutationResult, SongUrlResult } from './types.cjs';

export const LOCAL_LIBRARY_PLAYLIST_ID = 'local:library';

const LOCAL_SOURCE_LABEL = '本地音乐';
const LOCAL_COVER_TONE = 'linear-gradient(135deg, #4f8aa8, #30343b)';
const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg']);

export interface LocalMusicProvider extends MusicProvider {
  importFiles(filePaths: string[]): Song[];
}

interface LocalProviderOptions {
  now?: () => number;
}

export function createLocalProvider(store?: LocalLibraryStore, options: LocalProviderOptions = {}): LocalMusicProvider {
  const songsById = new Map<string, Song>();
  const filePathsBySongId = new Map<string, string>();
  const entriesBySongId = new Map<string, LocalLibraryEntry>();
  const now = options.now ?? (() => Date.now());

  store?.list().forEach((entry) => {
    songsById.set(entry.song.id, entry.song);
    filePathsBySongId.set(entry.song.id, entry.filePath);
    entriesBySongId.set(entry.song.id, entry);
  });

  const getLibrarySongs = () => [...songsById.values()];

  return {
    id: 'local',

    importFiles(filePaths) {
      const importedSongs: Song[] = [];
      const entriesToPersist: LocalLibraryEntry[] = [];
      const importedSongIds = new Set<string>();

      filePaths.forEach((filePath) => {
        if (!isSupportedAudioFile(filePath)) {
          return;
        }

        const songId = createLocalSongId(filePath);
        if (importedSongIds.has(songId)) {
          return;
        }

        const existingSong = songsById.get(songId);
        if (existingSong) {
          const existingEntry = entriesBySongId.get(songId);
          if (existingEntry) {
            const seenEntry = { ...existingEntry, lastSeenAt: now() };
            entriesBySongId.set(songId, seenEntry);
            entriesToPersist.push(seenEntry);
          }
          importedSongs.push(existingSong);
          importedSongIds.add(songId);
          return;
        }

        const song = mapLocalFileToSong(filePath, songId);
        const importedAt = now();
        const entry = {
          song,
          filePath,
          importedAt,
          lastSeenAt: importedAt
        };
        songsById.set(song.id, song);
        filePathsBySongId.set(song.id, filePath);
        entriesBySongId.set(song.id, entry);
        entriesToPersist.push(entry);
        importedSongs.push(song);
        importedSongIds.add(song.id);
      });

      if (entriesToPersist.length > 0) {
        store?.upsertMany(entriesToPersist);
      }

      return importedSongs;
    },

    async getLoginStatus() {
      return createLocalLoginStatus();
    },

    async login() {
      return createLocalLoginStatus();
    },

    async logout() {
      return;
    },

    async search(keyword, options = {}) {
      const normalizedKeyword = keyword.trim().toLocaleLowerCase();
      if (!normalizedKeyword) {
        return [];
      }

      const matches = getLibrarySongs().filter((song) => {
        const target = `${song.title} ${song.artist} ${song.album}`.toLocaleLowerCase();
        return target.includes(normalizedKeyword);
      });

      return sliceBySearchOptions(matches, options);
    },

    async getUserPlaylists() {
      return [createLibraryPlaylist(getLibrarySongs())];
    },

    async getPlaylistTracks(playlistId) {
      if (playlistId !== LOCAL_LIBRARY_PLAYLIST_ID) {
        throw new Error('本地音乐歌单不存在');
      }

      return getLibrarySongs();
    },

    async getSongUrl(song, quality) {
      const filePath = filePathsBySongId.get(song.id);
      if (!filePath || !existsSync(filePath)) {
        return createMissingLocalFileResult(quality);
      }

      return {
        ok: true,
        providerId: 'local',
        quality,
        url: pathToFileURL(filePath).toString()
      };
    },

    async getLyrics() {
      return createNoLyricsResult();
    },

    async setSongLiked(): Promise<SongMutationResult> {
      throw createUnsupportedRemotePlaylistMutationError();
    },

    async addSongToPlaylist(): Promise<SongMutationResult> {
      throw createUnsupportedRemotePlaylistMutationError();
    },

    async removeSongFromPlaylist(): Promise<SongMutationResult> {
      throw createUnsupportedRemotePlaylistMutationError();
    }
  };
}

function createUnsupportedRemotePlaylistMutationError(): Error {
  return new Error('本地音乐不支持远端歌单操作');
}

function createMissingLocalFileResult(quality: Quality): SongUrlResult {
  return {
    ok: false,
    providerId: 'local',
    quality,
    reason: {
      category: 'url_unavailable',
      message: '本地音频文件不可用，请重新导入',
      action: 'none'
    }
  };
}

export const localProvider = createLocalProvider();

function createLocalLoginStatus(): LoginStatus {
  return {
    providerId: 'local',
    loggedIn: true,
    playbackReady: true,
    stale: false,
    message: '本地音乐已就绪'
  };
}

function createLibraryPlaylist(songs: Song[]): Playlist {
  return {
    id: LOCAL_LIBRARY_PLAYLIST_ID,
    providerId: 'local',
    title: LOCAL_SOURCE_LABEL,
    description: songs.length ? `${songs.length} 首本地音乐` : '导入本地音频文件后会显示在这里',
    songIds: songs.map((song) => song.id),
    coverTone: LOCAL_COVER_TONE,
    sourceLabel: LOCAL_SOURCE_LABEL
  };
}

function mapLocalFileToSong(filePath: string, songId: string): Song {
  const extension = path.extname(filePath);
  const title = path.basename(filePath, extension);
  const album = path.basename(path.dirname(filePath)) || LOCAL_SOURCE_LABEL;

  return {
    id: songId,
    providerId: 'local',
    platformSongId: parseProviderScopedId(songId),
    title,
    artist: 'Unknown Artist',
    album,
    durationMs: 0,
    coverTone: LOCAL_COVER_TONE,
    sourceContext: {
      type: 'local',
      providerId: 'local'
    }
  };
}

function isSupportedAudioFile(filePath: string): boolean {
  return SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase());
}

function createLocalSongId(filePath: string): string {
  const hash = createHash('sha256').update(path.resolve(filePath)).digest('hex').slice(0, 16);
  return `local:${hash}`;
}

function parseProviderScopedId(id: string): string {
  return id.startsWith('local:') ? id.slice('local:'.length) : id;
}

function sliceBySearchOptions(songs: Song[], options: SearchOptions): Song[] {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? songs.length);
  return songs.slice(offset, offset + limit);
}

function createNoLyricsResult(): LyricsResult {
  return {
    ok: false,
    providerId: 'local',
    reason: {
      category: 'url_unavailable',
      message: '本地音乐暂无歌词',
      action: 'none'
    }
  };
}
