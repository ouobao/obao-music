import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodcastSourceContext, Program, RadioSourceContext, Song, SourceContext } from '../../shared/musicTypes';
import type { ProviderIpcResult, Quality, SongUrlResult } from '../../shared/providerTypes';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { usePlayerStore } from './playerStore';

const playlistSourceContext: SourceContext = {
  type: 'playlist',
  providerId: 'netease',
  playlistId: 'netease:6688',
  playlistTitle: 'My Playlist'
};

const neteaseSong: Song = {
  id: 'netease:42',
  providerId: 'netease',
  platformSongId: '42',
  title: 'Sunny Day',
  artist: 'Artist',
  album: 'Album',
  durationMs: 269000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://p1.music.126.net/song.jpg',
  sourceContext: playlistSourceContext
};

const secondNeteaseSong: Song = {
  id: 'netease:43',
  providerId: 'netease',
  platformSongId: '43',
  title: 'Cloud River',
  artist: 'Artist',
  album: 'Album',
  durationMs: 185000,
  coverTone: 'linear-gradient(135deg, #4673d8, #202938)',
  coverUrl: 'https://p1.music.126.net/song-2.jpg',
  sourceContext: playlistSourceContext
};

const thirdNeteaseSong: Song = {
  id: 'netease:44',
  providerId: 'netease',
  platformSongId: '44',
  title: 'Late Night',
  artist: 'Artist',
  album: 'Album',
  durationMs: 202000,
  coverTone: 'linear-gradient(135deg, #6f55d9, #202938)',
  coverUrl: 'https://p1.music.126.net/song-3.jpg',
  sourceContext: playlistSourceContext
};

const podcastSourceContext: PodcastSourceContext = {
  type: 'podcast',
  providerId: 'netease',
  podcastId: 'netease:podcast:42',
  podcastTitle: '深夜声场'
};

const neteasePodcast = {
  id: podcastSourceContext.podcastId,
  providerId: 'netease' as const,
  platformPodcastId: '42',
  title: podcastSourceContext.podcastTitle,
  description: '播客描述',
  author: '主播小满',
  coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)',
  coverUrl: 'https://example.test/podcast.jpg'
};

const neteaseProgram: Program = {
  id: 'netease:program:100',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: '100',
  title: '第一期：凌晨两点的声音',
  description: '节目描述',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)',
  coverUrl: 'https://example.test/program-100.jpg',
  podcast: neteasePodcast,
  sourceContext: podcastSourceContext
};

const secondNeteaseProgram: Program = {
  ...neteaseProgram,
  id: 'netease:program:101',
  platformProgramId: '101',
  title: '第二期：雨后的电台',
  coverUrl: 'https://example.test/program-101.jpg'
};

const firstRadioSourceContext: RadioSourceContext = {
  type: 'radio',
  providerId: 'netease',
  radioSessionId: 'netease:radio-session:42',
  radioItemId: 'radio-item:1'
};

const secondRadioSourceContext: RadioSourceContext = {
  ...firstRadioSourceContext,
  radioItemId: 'radio-item:2'
};

describe('player store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.getState().resetForTest();
    window.musicPlayer = {
      app: {
        getVersion: async () => '0.1.0'
      },
      window: {
        minimize: () => undefined,
        toggleMaximize: () => undefined,
        toggleFullscreen: () => undefined,
        close: () => undefined
      },
      music: {
        ...createMusicPlayerApi().music,
        getLoginStatus: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true } }),
        login: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true } }),
        logout: async () => ({ ok: true, data: undefined }),
        search: async () => ({ ok: true, data: [] }),
        getUserPlaylists: async () => ({ ok: true, data: [] }),
        getPlaylistTracks: async () => ({ ok: true, data: [] }),
        getSongUrl: async (_providerId, song, quality) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            quality,
            url: 'https://example.test/song.mp3'
          }
        }),
        getLyrics: async (_providerId, song) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            lrc: '[00:01.00]Test lyric'
          }
        }),
        setSongLiked: async (providerId, _song, liked) => ({ ok: true, data: { providerId, operation: liked ? 'like' : 'unlike' } }),
        addSongToPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'add_to_playlist' } }),
        removeSongFromPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'remove_from_playlist' } }),
        getCharts: async () => ({ ok: true, data: [] }),
        getChartTracks: async () => ({ ok: true, data: [] }),
        importLocalFiles: async () => ({ ok: true, data: [] })
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with an empty real playback queue', () => {
    expect(usePlayerStore.getState().queue).toEqual([]);
    expect(usePlayerStore.getState().queueSongs).toEqual({});
  });

  it('selects a queued provider song and starts playback', () => {
    const target = enqueueNeteaseSong();

    usePlayerStore.getState().selectQueueItem(target.id);

    const state = usePlayerStore.getState();
    expect(state.currentQueueItemId).toBe(target.id);
    expect(state.currentSong?.id).toBe(target.songId);
    expect(state.isPlaying).toBe(true);
  });

  it('toggles playback only when a song exists', () => {
    usePlayerStore.getState().togglePlaying();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    const target = enqueueNeteaseSong();
    usePlayerStore.getState().selectQueueItem(target.id);
    usePlayerStore.getState().togglePlaying();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    usePlayerStore.getState().togglePlaying();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('re-resolves playback when an interrupted load leaves the URL empty', async () => {
    const target = enqueueNeteaseSong();
    usePlayerStore.getState().selectQueueItem(target.id);
    await Promise.resolve();

    usePlayerStore.setState({
      currentPlaybackUrl: null,
      playbackStatus: 'error',
      isPlaying: true
    });

    usePlayerStore.getState().togglePlaying();
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.playbackStatus).toBe('ready');
    expect(state.currentPlaybackUrl).toBe('https://example.test/song.mp3');
  });

  it('opens and closes the lyrics panel', () => {
    usePlayerStore.getState().setLyricsOpen(true);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(true);

    usePlayerStore.getState().setLyricsOpen(false);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(false);
  });

  it('stores playback URL when provider returns a playable result', async () => {
    const target = enqueueNeteaseSong();

    usePlayerStore.getState().selectQueueItem(target.id);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.currentPlaybackUrl).toBe('https://example.test/song.mp3');
    expect(state.playbackRestriction).toBeNull();
    expect(state.playbackStatus).toBe('ready');
  });

  it('ignores an older playback URL request after an A-B-A provider switch', async () => {
    const pendingRequests: Array<(url: string) => void> = [];
    window.musicPlayer.music.getSongUrl = vi.fn((_providerId, song, quality) => new Promise<ProviderIpcResult<SongUrlResult>>((resolve) => {
      pendingRequests.push((url) => resolve({
        ok: true,
        data: {
          ok: true,
          providerId: song.providerId,
          quality,
          url
        }
      }));
    }));
    const qqSourceContext: SourceContext = { type: 'search', providerId: 'qq', searchKeyword: 'switch' };
    const qqSong: Song = {
      ...neteaseSong,
      id: 'qq:42',
      providerId: 'qq',
      platformSongId: 'qq-42',
      sourceContext: qqSourceContext
    };
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(qqSong, qqSourceContext);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    usePlayerStore.getState().selectQueueItem(secondItem.id);
    usePlayerStore.getState().selectQueueItem(firstItem.id);
    expect(pendingRequests).toHaveLength(3);

    pendingRequests[2]('https://example.test/latest-a.mp3');
    await Promise.resolve();
    expect(usePlayerStore.getState().currentPlaybackUrl).toBe('https://example.test/latest-a.mp3');

    pendingRequests[0]('https://example.test/stale-a.mp3');
    await Promise.resolve();
    expect(usePlayerStore.getState().currentPlaybackUrl).toBe('https://example.test/latest-a.mp3');
  });

  it('uses the dedicated Program playback path without requesting a song URL', async () => {
    window.musicPlayer.music.getProgramPlayback = async (providerId, program) => ({
      ok: true,
      data: {
        ok: true,
        providerId,
        url: `https://example.test/program/${program.platformProgramId}.mp3`
      }
    });
    const getProgramPlayback = vi.spyOn(window.musicPlayer.music, 'getProgramPlayback');
    const getSongUrl = vi.spyOn(window.musicPlayer.music, 'getSongUrl');

    const queueItem = usePlayerStore.getState().playProgramFromList(neteaseProgram);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(getProgramPlayback).toHaveBeenCalledWith('netease', expect.objectContaining({
      id: neteaseProgram.id,
      mediaType: 'program'
    }));
    expect(getSongUrl).not.toHaveBeenCalled();
    expect(queueItem).toMatchObject({
      mediaId: neteaseProgram.id,
      mediaType: 'program',
      source: 'podcast'
    });
    expect(queueItem?.songId).toBeUndefined();
    expect(state.queueMedia[neteaseProgram.id]).toMatchObject({ id: neteaseProgram.id, mediaType: 'program' });
    expect(state.queueSongs[neteaseProgram.id]).toBeUndefined();
    expect(state.currentMedia).toMatchObject({ id: neteaseProgram.id, mediaType: 'program' });
    expect(state.currentSong).toBeNull();
    expect(state.currentPlaybackUrl).toBe('https://example.test/program/100.mp3');
  });

  it('does not re-request a Program playback URL when the song quality changes', async () => {
    window.musicPlayer.music.getProgramPlayback = async (providerId, program) => ({
      ok: true,
      data: {
        ok: true,
        providerId,
        url: `https://example.test/program/${program.platformProgramId}.mp3`
      }
    });
    const getProgramPlayback = vi.spyOn(window.musicPlayer.music, 'getProgramPlayback');

    usePlayerStore.getState().playProgramFromList(neteaseProgram);
    await Promise.resolve();
    usePlayerStore.getState().setPlaybackQuality('lossless');
    await Promise.resolve();

    expect(getProgramPlayback).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().currentPlaybackUrl).toBe('https://example.test/program/100.mp3');
    expect(usePlayerStore.getState().playbackQuality).toBe('lossless');
  });

  it('uses the selected playback quality when resolving provider URLs', async () => {
    let requestedQuality = '';
    window.musicPlayer.music.getSongUrl = async (_providerId, song, quality) => {
      requestedQuality = quality;
      return {
        ok: true,
        data: {
          ok: true,
          providerId: song.providerId,
          quality,
          url: `https://example.test/${quality}.mp3`
        }
      };
    };

    usePlayerStore.getState().setPlaybackQuality('lossless');
    const target = enqueueNeteaseSong();
    usePlayerStore.getState().selectQueueItem(target.id);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(requestedQuality).toBe('lossless');
    expect(state.playbackQuality).toBe('lossless');
    expect(state.currentPlaybackUrl).toBe('https://example.test/lossless.mp3');
  });

  it('stores the shared output volume as a percentage', () => {
    usePlayerStore.getState().setVolume(24);

    expect(usePlayerStore.getState().volume).toBe(24);
  });

  it('persists the shared output volume for the next startup', async () => {
    usePlayerStore.getState().setVolume(24);
    expect(window.localStorage.getItem('musicplayer.volume')).toBe('24');

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    expect(freshPlayerStore.getState().volume).toBe(24);
  });

  it('persists the current playback session for the next startup without autoplaying', async () => {
    usePlayerStore.getState().setPlaybackQuality('lossless');
    usePlayerStore.getState().setPlaybackMode('listLoop');
    const queueItem = usePlayerStore.getState().playSongsFromList(
      [neteaseSong, secondNeteaseSong],
      1,
      () => playlistSourceContext
    );
    await Promise.resolve();
    usePlayerStore.getState().setPlaybackProgress(76000, 185000);
    usePlayerStore.getState().setVolume(24);

    expect(window.localStorage.getItem('musicplayer.playback-session')).toBeTruthy();

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    const state = freshPlayerStore.getState();
    expect(state.queue.map((item) => item.songId)).toEqual([neteaseSong.id, secondNeteaseSong.id]);
    expect(state.queueSongs[secondNeteaseSong.id]).toMatchObject({
      id: secondNeteaseSong.id,
      title: secondNeteaseSong.title,
      sourceContext: playlistSourceContext
    });
    expect(state.currentQueueItemId).toBe(queueItem?.id);
    expect(state.currentSong?.id).toBe(secondNeteaseSong.id);
    expect(state.playbackQuality).toBe('lossless');
    expect(state.playbackMode).toBe('listLoop');
    expect(state.playbackPositionMs).toBe(76000);
    expect(state.playbackDurationMs).toBe(185000);
    expect(state.volume).toBe(24);
    expect(state.isPlaying).toBe(false);
    expect(state.currentPlaybackUrl).toBeNull();
    expect(state.playbackRestriction).toBeNull();
    expect(state.playbackStatus).toBe('idle');
  });

  it('restores a Program session without autoplaying and resolves its URL only after an explicit resume', async () => {
    window.musicPlayer.music.getProgramPlayback = async (providerId, program) => ({
      ok: true,
      data: {
        ok: true,
        providerId,
        url: `https://example.test/program/${program.platformProgramId}.mp3`
      }
    });
    const getProgramPlayback = vi.spyOn(window.musicPlayer.music, 'getProgramPlayback');
    const queueItem = usePlayerStore.getState().playProgramsFromList(
      [neteaseProgram, secondNeteaseProgram],
      1
    );
    await Promise.resolve();
    usePlayerStore.getState().setPlaybackProgress(76_000, secondNeteaseProgram.durationMs);
    window.dispatchEvent(new Event('pagehide'));

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    const restored = freshPlayerStore.getState();
    expect(restored.queue.map((item) => item.mediaType)).toEqual(['program', 'program']);
    expect(restored.currentQueueItemId).toBe(queueItem?.id);
    expect(restored.currentMedia).toMatchObject({ id: secondNeteaseProgram.id, mediaType: 'program' });
    expect(restored.currentSong).toBeNull();
    expect(restored.isPlaying).toBe(false);
    expect(restored.currentPlaybackUrl).toBeNull();

    freshPlayerStore.getState().togglePlaying();
    await Promise.resolve();

    expect(getProgramPlayback).toHaveBeenCalledTimes(2);
    expect(freshPlayerStore.getState().currentPlaybackUrl).toBe('https://example.test/program/101.mp3');
  });

  it('migrates a v1 Song session to the v2 queue shape on its next persisted update', async () => {
    const queueItemId = 'queue-1-netease-42';
    window.localStorage.setItem('musicplayer.playback-session', JSON.stringify({
      version: 1,
      queue: [{
        id: queueItemId,
        songId: neteaseSong.id,
        source: 'playlist',
        sourceContext: playlistSourceContext
      }],
      queueSongs: { [neteaseSong.id]: neteaseSong },
      currentQueueItemId: queueItemId,
      currentSong: neteaseSong,
      playbackMode: 'sequence',
      playbackQuality: 'standard',
      playbackPositionMs: 12_000,
      playbackDurationMs: neteaseSong.durationMs,
      volume: 58
    }));

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');
    const migrated = freshPlayerStore.getState();

    expect(migrated.queue[0]).toMatchObject({
      id: queueItemId,
      mediaId: neteaseSong.id,
      mediaType: 'song',
      songId: neteaseSong.id
    });
    expect(migrated.queueMedia[neteaseSong.id]).toMatchObject({ id: neteaseSong.id });

    freshPlayerStore.getState().setPlaybackMode('listLoop');
    const persisted = JSON.parse(window.localStorage.getItem('musicplayer.playback-session') ?? '{}');
    expect(persisted).toMatchObject({ version: 2, playbackMode: 'listLoop' });
    expect(persisted.queue[0]).toMatchObject({ mediaId: neteaseSong.id, mediaType: 'song' });
  });

  it('persists structured music references and artist or album queue sources', async () => {
    const artistRef = {
      id: 'netease:artist:6452',
      providerId: 'netease' as const,
      platformArtistId: '6452',
      name: 'Artist'
    };
    const albumRef = {
      id: 'netease:album:34720827',
      providerId: 'netease' as const,
      platformAlbumId: '34720827',
      title: 'Album'
    };
    const artistSong = { ...neteaseSong, artists: [artistRef], albumRef };
    const albumSong = { ...secondNeteaseSong, artists: [artistRef], albumRef };

    usePlayerStore.getState().enqueueSong(artistSong, {
      type: 'artist',
      providerId: 'netease',
      artistId: artistRef.id,
      artistName: artistRef.name
    });
    usePlayerStore.getState().enqueueSong(albumSong, {
      type: 'album',
      providerId: 'netease',
      albumId: albumRef.id,
      albumTitle: albumRef.title
    });

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    const state = freshPlayerStore.getState();
    expect(state.queue.map((item) => item.source)).toEqual(['artist', 'album']);
    expect(state.queue[0].sourceContext).toMatchObject({ type: 'artist', artistId: artistRef.id });
    expect(state.queue[1].sourceContext).toMatchObject({ type: 'album', albumId: albumRef.id });
    expect(state.queueSongs[artistSong.id]).toMatchObject({ artists: [artistRef], albumRef });
  });

  it('persists a bounded playback snapshot for oversized queues', () => {
    const largeSongs = Array.from({ length: 1200 }, (_, index) => ({
      ...neteaseSong,
      id: `netease:large-${index + 1}`,
      title: `Large Song ${index + 1}`
    }));

    const queueItem = usePlayerStore.getState().playSongsFromList(
      largeSongs,
      700,
      () => playlistSourceContext
    );

    const rawSession = window.localStorage.getItem('musicplayer.playback-session');
    expect(rawSession).toBeTruthy();
    const session = JSON.parse(rawSession ?? '{}') as { queue?: unknown[]; queueSongs?: Record<string, unknown>; currentQueueItemId?: string };

    expect(usePlayerStore.getState().queue).toHaveLength(1200);
    expect(session.queue?.length).toBeLessThanOrEqual(500);
    expect(session.queue?.some((item) => typeof item === 'object' && item !== null && 'id' in item && item.id === queueItem?.id)).toBe(true);
    expect(Object.keys(session.queueSongs ?? {})).toHaveLength(session.queue?.length ?? 0);
    expect(session.currentQueueItemId).toBe(queueItem?.id);
  });

  it('distinguishes continuous playback progress from explicit seeks', () => {
    const initialRevision = usePlayerStore.getState().playbackSeekRevision;

    usePlayerStore.getState().setPlaybackProgress(1_000, 10_000);

    expect(usePlayerStore.getState().playbackSeekRevision).toBe(initialRevision);

    usePlayerStore.getState().seekPlayback(12_000, 10_000);

    expect(usePlayerStore.getState()).toMatchObject({
      playbackPositionMs: 10_000,
      playbackDurationMs: 10_000,
      playbackSeekRevision: initialRevision + 1
    });
  });

  it('defers large queue persistence during repeated progress updates', () => {
    vi.useFakeTimers();
    const largeSongs = Array.from({ length: 3000 }, (_, index) => ({
      ...neteaseSong,
      id: `netease:progress-${index + 1}`
    }));
    usePlayerStore.getState().playSongsFromList(largeSongs, 1500, () => playlistSourceContext);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockClear();

    usePlayerStore.getState().setPlaybackProgress(1_000, 269_000);
    usePlayerStore.getState().setPlaybackProgress(1_500, 269_000);
    usePlayerStore.getState().setPlaybackProgress(2_000, 269_000);

    expect(usePlayerStore.getState().playbackPositionMs).toBe(2_000);
    expect(setItem).not.toHaveBeenCalledWith('musicplayer.playback-session', expect.any(String));

    vi.advanceTimersByTime(2_000);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem('musicplayer.playback-session') ?? '{}')).toMatchObject({
      playbackPositionMs: 2_000
    });
  });

  it('flushes pending playback progress when the page is hidden', () => {
    vi.useFakeTimers();
    usePlayerStore.getState().playSongsFromList([neteaseSong], 0, () => playlistSourceContext);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockClear();

    usePlayerStore.getState().setPlaybackProgress(42_000, 269_000);

    expect(setItem).not.toHaveBeenCalledWith('musicplayer.playback-session', expect.any(String));

    window.dispatchEvent(new Event('pagehide'));

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem('musicplayer.playback-session') ?? '{}')).toMatchObject({
      playbackPositionMs: 42_000
    });
  });

  it('persists structural playback changes immediately while progress persistence is pending', () => {
    vi.useFakeTimers();
    usePlayerStore.getState().playSongsFromList([neteaseSong], 0, () => playlistSourceContext);
    usePlayerStore.getState().setPlaybackProgress(12_000, 269_000);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockClear();

    usePlayerStore.getState().setPlaybackMode('listLoop');

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem('musicplayer.playback-session') ?? '{}')).toMatchObject({
      playbackMode: 'listLoop',
      playbackPositionMs: 12_000
    });

    vi.advanceTimersByTime(2_000);

    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('resolves a fresh playback URL when a restored session is resumed', async () => {
    usePlayerStore.getState().setPlaybackQuality('lossless');
    usePlayerStore.getState().playSongsFromList(
      [neteaseSong, secondNeteaseSong],
      1,
      () => playlistSourceContext
    );
    await Promise.resolve();
    usePlayerStore.getState().setPlaybackProgress(76000, 185000);
    window.dispatchEvent(new Event('pagehide'));

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    freshPlayerStore.getState().togglePlaying();
    await Promise.resolve();

    const state = freshPlayerStore.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.playbackStatus).toBe('ready');
    expect(state.currentPlaybackUrl).toBe('https://example.test/song.mp3');
    expect(state.playbackPositionMs).toBe(76000);
  });

  it('ignores malformed playback session storage on startup', async () => {
    window.localStorage.setItem('musicplayer.playback-session', '{broken');

    vi.resetModules();
    const { usePlayerStore: freshPlayerStore } = await import('./playerStore');

    const state = freshPlayerStore.getState();
    expect(state.queue).toEqual([]);
    expect(state.queueSongs).toEqual({});
    expect(state.currentQueueItemId).toBeNull();
    expect(state.currentSong).toBeNull();
    expect(state.playbackQuality).toBe('standard');
    expect(state.playbackMode).toBe('sequence');
    expect(state.playbackPositionMs).toBe(0);
    expect(state.playbackDurationMs).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('plays the previous and next queue item in sequence mode', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().playNext();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(secondItem.id);
    expect(usePlayerStore.getState().currentSong?.id).toBe(secondNeteaseSong.id);

    usePlayerStore.getState().playPrevious();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(firstItem.id);
    expect(usePlayerStore.getState().currentSong?.id).toBe(neteaseSong.id);
  });

  it('queues Program items with podcast context and navigates them through shared transport controls', async () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const programItem = usePlayerStore.getState().enqueueNextProgram(neteaseProgram);
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().playNext();
    await Promise.resolve();

    expect(programItem).toMatchObject({
      mediaId: neteaseProgram.id,
      mediaType: 'program',
      source: 'podcast',
      sourceContext: podcastSourceContext
    });
    expect(usePlayerStore.getState().currentMedia).toMatchObject({ id: neteaseProgram.id, mediaType: 'program' });
    expect(usePlayerStore.getState().currentSong).toBeNull();

    usePlayerStore.getState().playPrevious();
    expect(usePlayerStore.getState().currentSong?.id).toBe(neteaseSong.id);
  });

  it('wraps queue navigation in list loop mode', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().setPlaybackMode('listLoop');
    usePlayerStore.getState().selectQueueItem(secondItem.id);

    usePlayerStore.getState().playNext();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(firstItem.id);

    usePlayerStore.getState().playPrevious();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(secondItem.id);
  });

  it('restarts the current song in single loop mode when playback ends', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().setPlaybackMode('singleLoop');
    usePlayerStore.getState().selectQueueItem(firstItem.id);
    usePlayerStore.getState().setPlaybackProgress(76000, 269000);

    usePlayerStore.getState().handlePlaybackEnded();

    const state = usePlayerStore.getState();
    expect(state.currentQueueItemId).toBe(firstItem.id);
    expect(state.currentSong?.id).toBe(neteaseSong.id);
    expect(state.playbackPositionMs).toBe(0);
    expect(state.isPlaying).toBe(true);
  });

  it('selects another queued song in shuffle mode when possible', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().setPlaybackMode('shuffle');
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().playNext();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(secondItem.id);
  });

  it('uses a randomized queue candidate in shuffle mode instead of the first non-current item', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    const thirdItem = usePlayerStore.getState().enqueueSong(thirdNeteaseSong, playlistSourceContext);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    usePlayerStore.getState().setPlaybackMode('shuffle');
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().playNext();

    expect(usePlayerStore.getState().currentQueueItemId).toBe(thirdItem.id);
    expect(usePlayerStore.getState().currentQueueItemId).not.toBe(secondItem.id);
  });

  it('stores bridge unavailable errors for real provider songs without the Electron bridge', async () => {
    delete (window as { musicPlayer?: Window['musicPlayer'] }).musicPlayer;
    const target = enqueueNeteaseSong();

    usePlayerStore.getState().selectQueueItem(target.id);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.currentQueueItemId).toBe(target.id);
    expect(state.currentSong?.id).toBe(target.songId);
    expect(state.currentPlaybackUrl).toBeNull();
    expect(state.playbackStatus).toBe('error');
    expect(state.playbackRestriction).toMatchObject({
      category: 'url_unavailable'
    });
    expect(state.isPlaying).toBe(false);
  });

  it('stores structured playback restriction and stops playback when provider denies URL', async () => {
    window.musicPlayer.music.getSongUrl = async (_providerId, song, quality) => ({
      ok: true,
      data: {
        ok: false,
        providerId: song.providerId,
        quality,
        reason: {
          category: 'vip_required',
          message: 'Current track requires membership',
          action: 'upgrade'
        }
      }
    });

    const target = enqueueNeteaseSong();
    usePlayerStore.getState().selectQueueItem(target.id);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentPlaybackUrl).toBeNull();
    expect(state.playbackStatus).toBe('restricted');
    expect(state.playbackRestriction).toEqual({
      category: 'vip_required',
      message: 'Current track requires membership',
      action: 'upgrade'
    });
  });

  it.each([
    ['provider_risk', 'retry'],
    ['login_required', 'login'],
    ['playback_auth_incomplete', 'login']
  ] as const)('does not scan the queue after a provider-wide %s restriction', async (category, action) => {
    const getSongUrl = vi.fn(async (_providerId: Song['providerId'], song: Song, quality: Quality) => ({
      ok: true as const,
      data: {
        ok: false,
        providerId: song.providerId,
        quality,
        reason: {
          category,
          message: 'Provider-wide playback failure',
          action
        }
      }
    }));
    window.musicPlayer.music.getSongUrl = getSongUrl;
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();

    expect(getSongUrl).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: firstItem.id,
      currentSong: { id: neteaseSong.id },
      currentPlaybackUrl: null,
      playbackStatus: 'restricted',
      playbackRestriction: { category },
      isPlaying: false
    });
  });

  it('does not scan the queue after a provider IPC failure', async () => {
    const getSongUrl = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'provider_failed' as const,
        providerId: 'netease' as const,
        message: '网易云音乐请求失败，请稍后重试'
      }
    }));
    window.musicPlayer.music.getSongUrl = getSongUrl;
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();

    expect(getSongUrl).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: firstItem.id,
      currentSong: { id: neteaseSong.id },
      playbackStatus: 'error',
      isPlaying: false
    });
  });

  it('stores audio playback errors as URL unavailable restrictions', () => {
    usePlayerStore.getState().setPlaybackError('Audio playback failed');

    const state = usePlayerStore.getState();
    expect(state.playbackStatus).toBe('error');
    expect(state.isPlaying).toBe(false);
    expect(state.playbackRestriction).toMatchObject({
      category: 'url_unavailable',
      message: 'Audio playback failed'
    });
  });

  it('skips an unplayable queue item and resolves the next available song', async () => {
    window.musicPlayer.music.getSongUrl = async (_providerId, song, quality) => ({
      ok: true,
      data: song.id === neteaseSong.id
        ? {
            ok: false,
            providerId: song.providerId,
            quality,
            reason: {
              category: 'url_unavailable',
              message: 'First source failed',
              action: 'retry'
            }
          }
        : {
            ok: true,
            providerId: song.providerId,
            quality,
            url: 'https://example.test/next-song.mp3'
          }
    });
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: secondItem.id,
      currentSong: { id: secondNeteaseSong.id },
      currentPlaybackUrl: 'https://example.test/next-song.mp3',
      playbackStatus: 'ready',
      isPlaying: true
    });
  });

  it('skips an unplayable Program and resolves the next Program without requesting song URLs', async () => {
    window.musicPlayer.music.getProgramPlayback = async (providerId, program) => ({
      ok: true,
      data: program.id === neteaseProgram.id
        ? {
            ok: false,
            providerId,
            reason: {
              category: 'url_unavailable',
              message: 'First program source failed',
              action: 'retry'
            }
          }
        : {
            ok: true,
            providerId,
            url: 'https://example.test/program-next.mp3'
          }
    });
    const getSongUrl = vi.spyOn(window.musicPlayer.music, 'getSongUrl');
    const firstItem = usePlayerStore.getState().enqueueProgram(neteaseProgram);
    const secondItem = usePlayerStore.getState().enqueueProgram(secondNeteaseProgram);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(getSongUrl).not.toHaveBeenCalled();
    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: secondItem.id,
      currentMedia: { id: secondNeteaseProgram.id, mediaType: 'program' },
      currentSong: null,
      currentPlaybackUrl: 'https://example.test/program-next.mp3',
      playbackStatus: 'ready',
      isPlaying: true
    });
  });

  it('does not scan the Program queue after a program-playback capability IPC failure', async () => {
    window.musicPlayer.music.getProgramPlayback = async (providerId) => ({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId,
        message: '节目播放能力暂不可用'
      }
    });
    const getProgramPlayback = vi.spyOn(window.musicPlayer.music, 'getProgramPlayback');
    const firstItem = usePlayerStore.getState().enqueueProgram(neteaseProgram);
    usePlayerStore.getState().enqueueProgram(secondNeteaseProgram);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();

    expect(getProgramPlayback).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: firstItem.id,
      currentMedia: { id: neteaseProgram.id, mediaType: 'program' },
      currentSong: null,
      playbackStatus: 'error',
      isPlaying: false,
      playbackRestriction: { message: '节目播放能力暂不可用' }
    });
  });

  it.each([
    ['vip_required', 'upgrade'],
    ['copyright_unavailable', 'switch_source']
  ] as const)('still skips a genuinely song-level %s restriction', async (category, action) => {
    const getSongUrl = vi.fn(async (_providerId: Song['providerId'], song: Song, quality: Quality) => ({
      ok: true as const,
      data: song.id === neteaseSong.id
        ? {
            ok: false,
            providerId: song.providerId,
            quality,
            reason: {
              category,
              message: 'Song-level playback restriction',
              action
            }
          }
        : {
            ok: true,
            providerId: song.providerId,
            quality,
            url: 'https://example.test/next-song.mp3'
          }
    }));
    window.musicPlayer.music.getSongUrl = getSongUrl;
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);

    usePlayerStore.getState().selectQueueItem(firstItem.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(getSongUrl).toHaveBeenCalledTimes(2);
    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: secondItem.id,
      currentSong: { id: secondNeteaseSong.id },
      currentPlaybackUrl: 'https://example.test/next-song.mp3',
      playbackStatus: 'ready',
      isPlaying: true
    });
  });

  it('does not retry a failed item forever in single loop mode', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().setPlaybackMode('singleLoop');
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().setPlaybackError('Audio playback failed');

    expect(usePlayerStore.getState()).toMatchObject({
      currentQueueItemId: secondItem.id,
      currentSong: { id: secondNeteaseSong.id },
      playbackStatus: 'loading',
      isPlaying: true
    });
  });

  it('stops playback on audio ended without clearing the current queue item', () => {
    const target = enqueueNeteaseSong();
    usePlayerStore.getState().selectQueueItem(target.id);
    const currentQueueItemId = usePlayerStore.getState().currentQueueItemId;
    const currentSong = usePlayerStore.getState().currentSong;

    usePlayerStore.getState().handlePlaybackEnded();

    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentQueueItemId).toBe(currentQueueItemId);
    expect(state.currentSong).toEqual(currentSong);
  });

  it('advances to the next queued song when playback ends', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    usePlayerStore.getState().handlePlaybackEnded();

    const state = usePlayerStore.getState();
    expect(state.currentQueueItemId).toBe(secondItem.id);
    expect(state.currentSong?.id).toBe(secondNeteaseSong.id);
    expect(state.playbackPositionMs).toBe(0);
    expect(state.isPlaying).toBe(true);
  });

  it('enqueues a provider song with playlist source context and reuses the same queue item', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);

    const state = usePlayerStore.getState();
    expect(firstItem.id).toBe(secondItem.id);
    expect(state.queue.filter((item) => item.songId === neteaseSong.id)).toHaveLength(1);
    expect(firstItem.source).toBe('playlist');
    expect(firstItem.sourceContext).toEqual(playlistSourceContext);
    expect(state.queueSongs[neteaseSong.id]).toMatchObject({
      id: 'netease:42',
      title: 'Sunny Day',
      sourceContext: playlistSourceContext
    });
  });

  it('keeps radio session items distinct and persists their radio source context', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, firstRadioSourceContext);
    const secondItem = usePlayerStore.getState().enqueueSong(neteaseSong, secondRadioSourceContext);
    const persisted = JSON.parse(window.localStorage.getItem('musicplayer.playback-session') ?? '{}');

    expect(firstItem.source).toBe('radio');
    expect(secondItem.source).toBe('radio');
    expect(firstItem.id).not.toBe(secondItem.id);
    expect(usePlayerStore.getState().queue).toHaveLength(2);
    expect(persisted.queue).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'radio', sourceContext: firstRadioSourceContext }),
      expect.objectContaining({ source: 'radio', sourceContext: secondRadioSourceContext })
    ]));
  });

  it('inserts a song after the current queue item for play-next actions', () => {
    const firstItem = usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
    usePlayerStore.getState().enqueueSong(secondNeteaseSong, playlistSourceContext);
    usePlayerStore.getState().selectQueueItem(firstItem.id);

    const nextSong = {
      ...secondNeteaseSong,
      id: 'netease:play-next',
      title: 'Play Next Song'
    };
    const nextItem = usePlayerStore.getState().enqueueNextSong(nextSong, playlistSourceContext);

    const state = usePlayerStore.getState();
    expect(nextItem.sourceContext).toEqual(playlistSourceContext);
    expect(state.queue.map((item) => item.songId)).toEqual([neteaseSong.id, nextSong.id, secondNeteaseSong.id]);
    expect(state.currentQueueItemId).toBe(firstItem.id);
    expect(state.currentSong?.id).toBe(neteaseSong.id);
  });

  it('plays a provider song from a playlist and resolves its playback URL', async () => {
    const queueItem = usePlayerStore.getState().playSongFromList(neteaseSong, playlistSourceContext);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.currentQueueItemId).toBe(queueItem.id);
    expect(state.currentSong).toMatchObject({
      id: 'netease:42',
      providerId: 'netease',
      sourceContext: playlistSourceContext
    });
    expect(state.currentPlaybackUrl).toBe('https://example.test/song.mp3');
    expect(state.playbackStatus).toBe('ready');
    expect(state.isPlaying).toBe(true);
  });

  it('replaces the queue with a list playback context and starts at the selected song', async () => {
    usePlayerStore.getState().enqueueSong({
      ...neteaseSong,
      id: 'netease:stale',
      title: 'Old Queue Song'
    }, playlistSourceContext);

    const queueItem = usePlayerStore.getState().playSongsFromList(
      [neteaseSong, secondNeteaseSong],
      1,
      () => playlistSourceContext
    );
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(queueItem?.songId).toBe(secondNeteaseSong.id);
    expect(state.queue.map((item) => item.songId)).toEqual([neteaseSong.id, secondNeteaseSong.id]);
    expect(state.currentQueueItemId).toBe(queueItem?.id);
    expect(state.currentSong?.id).toBe(secondNeteaseSong.id);
    expect(state.queueSongs[neteaseSong.id]).toMatchObject({ title: neteaseSong.title });
    expect(state.queueSongs[secondNeteaseSong.id]).toMatchObject({ title: secondNeteaseSong.title });
    expect(state.playbackStatus).toBe('ready');
    expect(state.isPlaying).toBe(true);
  });
});

function enqueueNeteaseSong() {
  return usePlayerStore.getState().enqueueSong(neteaseSong, playlistSourceContext);
}
