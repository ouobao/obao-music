import { create } from 'zustand';
import type { QueueItem, Song } from '../../shared/musicTypes';
import type { PlaybackRestriction, Quality } from '../../shared/providerTypes';
import type { PlaybackMode, PlaybackStatus, SourceContextLike } from './playerTypes';
import { createSourceContext, queueItemForSong } from './playerTypes';
import { uid, clamp } from '../utils/format';

const QUEUE_LIMIT = 500;
const SESSION_KEY = 'musicplayer.playback-session:v2';
const VOLUME_KEY = 'musicplayer.volume';
const MODE_KEY = 'musicplayer.playback-mode';
const QUALITY_KEY = 'musicplayer.playback-quality';
const FAILED_KEY = 'musicplayer.failed-queue-item-ids';
const LYRIC_OFFSET_PREFIX = 'musicplayer.lyric-offset:';

export interface PlayerState {
  queue: QueueItem[];
  queueSongs: Record<string, Song>;
  /** 队列整表替换计数：仅 playSongsFromList 递增，供虚拟列表滚动复位判定 */
  queueEpoch: number;
  currentQueueItemId: string | null;
  currentSong: Song | null;
  currentPlaybackUrl: string | null;
  playbackRestriction: PlaybackRestriction | null;
  playbackStatus: PlaybackStatus;
  playbackMode: PlaybackMode;
  playbackQuality: Quality;
  playbackPositionMs: number;
  playbackDurationMs: number;
  playbackSeekRevision: number;
  playbackSessionRevision: number;
  volume: number;
  isPlaying: boolean;
  isLyricsOpen: boolean;
  failedQueueItemIds: string[];
  /** 当前 <audio> 元素引用（非持久化，供歌词 rAF 时钟直接采样 currentTime） */
  mediaElement: HTMLAudioElement | null;

  playSongsFromList(songs: Song[], startIndex: number, sourceContext?: SourceContextLike): void;
  playSongFromList(song: Song, sourceContext?: SourceContextLike): void;
  enqueueSong(song: Song, source: string, sourceContext?: SourceContextLike): void;
  enqueueNextSong(song: Song, source: string, sourceContext?: SourceContextLike): void;
  playQueueItem(item: QueueItem): void;
  selectQueueItem(queueItemId: string): void;
  removeQueueItem(queueItemId: string): void;
  clearQueue(): void;
  playPrevious(): void;
  playNext(): void;
  togglePlaying(): void;
  setPlaybackMode(mode: PlaybackMode): void;
  setPlaybackQuality(quality: Quality): void;
  setPlaybackProgress(positionMs: number, durationMs?: number): void;
  seekPlayback(positionMs: number, durationMs?: number): void;
  setVolume(volume: number): void;
  setLyricsOpen(open: boolean): void;
  setPlaybackUrl(url: string): void;
  setPlaybackRestriction(restriction: PlaybackRestriction | null): void;
  setPlaybackStatus(status: PlaybackStatus): void;
  setPlaybackError(message: string, expectedUrl?: string): void;
  retryPlayback(): void;
  dismissPlaybackRestriction(): void;
  handlePlaybackEnded(): void;
  setLyricOffset(songKey: string, offsetSeconds: number): void;
  getLyricOffset(songKey: string): number;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function restorePlaybackMode(fallback: PlaybackMode | undefined): PlaybackMode {
  if (fallback === 'sequence' || fallback === 'shuffle' || fallback === 'singleLoop' || fallback === 'listLoop') {
    return fallback;
  }
  const stored = loadString(MODE_KEY);
  return stored === 'sequence' || stored === 'shuffle' || stored === 'singleLoop' || stored === 'listLoop'
    ? stored
    : 'sequence';
}

function restorePlaybackQuality(fallback: Quality | undefined): Quality {
  if (fallback === 'standard' || fallback === 'higher' || fallback === 'exhigh' || fallback === 'lossless') {
    return fallback;
  }
  const stored = loadString(QUALITY_KEY);
  return stored === 'standard' || stored === 'higher' || stored === 'exhigh' || stored === 'lossless'
    ? stored
    : 'standard';
}

function loadSession() {
  const session = loadJSON<{
    queue: QueueItem[];
    queueSongs: Record<string, Song>;
    currentQueueItemId: string | null;
    positionMs: number;
    durationMs: number;
    mode?: PlaybackMode;
    quality?: Quality;
  } | null>(SESSION_KEY, null);

  if (!session || !Array.isArray(session.queue) || !session.queueSongs || typeof session.queueSongs !== 'object') {
    return {};
  }

  const queueSongs: Record<string, Song> = {};
  const validQueue: QueueItem[] = [];
  for (const item of session.queue) {
    if (!item || typeof item !== 'object') continue;
    const song = session.queueSongs[item.mediaId] ?? (item.songId ? session.queueSongs[item.songId] : undefined);
    if (!song) continue;
    const mediaId = songKey(song);
    queueSongs[mediaId] = song;
    validQueue.push({ ...item, mediaId, songId: song.id });
  }
  if (validQueue.length === 0) return {};

  const mode = session.mode;
  const quality = session.quality;
  return {
    queue: validQueue.slice(0, QUEUE_LIMIT),
    queueSongs,
    currentQueueItemId:
      session.currentQueueItemId && validQueue.some((q) => q.id === session.currentQueueItemId)
        ? session.currentQueueItemId
        : null,
    playbackPositionMs: Number(session.positionMs) || 0,
    playbackDurationMs: Number(session.durationMs) || 0,
    playbackMode: mode === 'sequence' || mode === 'shuffle' || mode === 'singleLoop' || mode === 'listLoop' ? mode : 'sequence',
    playbackQuality: quality === 'standard' || quality === 'higher' || quality === 'exhigh' || quality === 'lossless' ? quality : 'standard'
  };
}

function saveSession(state: {
  queue: QueueItem[];
  queueSongs: Record<string, Song>;
  currentQueueItemId: string | null;
  playbackPositionMs: number;
  playbackDurationMs: number;
  playbackMode: PlaybackMode;
  playbackQuality: Quality;
}) {
  try {
    const payload = {
      queue: state.queue,
      queueSongs: state.queueSongs,
      currentQueueItemId: state.currentQueueItemId,
      positionMs: state.playbackPositionMs,
      durationMs: state.playbackDurationMs,
      mode: state.playbackMode,
      quality: state.playbackQuality,
      version: 2
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // 队列超限时忽略持久化失败
  }
}

export function songKey(song: Song): string {
  return `${song.providerId}:${song.id}`;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const restored = loadSession();
  let playbackRequestRevision = 0;
  let lastPersistAt = 0;

  const persist = () => saveSession(get());

  /** 连续自动跳歌失败计数：成功起播清零；≥3 次熔断停止自动跳歌 */
  let consecutiveAutoSkipFailures = 0;

  const resolvePlaybackUrl = (song: Song, options?: { forceRefresh?: boolean }) => {
    const requestedQuality = get().playbackQuality;
    const requestedSongKey = songKey(song);
    const requestRevision = ++playbackRequestRevision;
    const isCurrentRequest = () => {
      const state = get();
      return requestRevision === playbackRequestRevision
        && state.currentSong != null
        && songKey(state.currentSong) === requestedSongKey
        && state.playbackQuality === requestedQuality;
    };

    set({ playbackStatus: 'loading', playbackRestriction: null, currentPlaybackUrl: null, isPlaying: false });
    window.musicPlayer.music
      .getSongUrl(song.providerId, song, requestedQuality, options)
      .then((result) => {
        if (!isCurrentRequest()) return;
        if (result.ok) {
          if (result.data.ok && result.data.url) {
            consecutiveAutoSkipFailures = 0;
            set({ currentPlaybackUrl: result.data.url, playbackStatus: 'ready', isPlaying: true });
          } else {
            set({
              playbackRestriction: result.data.reason ?? null,
              playbackStatus: result.data.reason ? 'restricted' : 'error',
              currentPlaybackUrl: null,
              isPlaying: false
            });
          }
        } else {
          set({
            playbackStatus: 'error',
            isPlaying: false,
            currentPlaybackUrl: null,
            playbackRestriction: { category: 'url_unavailable', message: result.error.message, action: 'retry' }
          });
        }
      })
      .catch((error) => {
        if (!isCurrentRequest()) return;
        set({
          playbackStatus: 'error',
          isPlaying: false,
          currentPlaybackUrl: null,
          playbackRestriction: { category: 'url_unavailable', message: String(error?.message ?? error), action: 'retry' }
        });
      });
  };

  const playQueueItemAt = (index: number) => {
    const { queue, queueSongs, playbackSessionRevision } = get();
    const item = queue[index];
    if (!item || item.mediaType !== 'song' || !queueSongs[item.mediaId]) return;
    const song = queueSongs[item.mediaId];
    set({
      currentQueueItemId: item.id,
      currentSong: song,
      currentPlaybackUrl: null,
      playbackPositionMs: 0,
      playbackDurationMs: song.durationMs || 0,
      playbackRestriction: null,
      playbackSessionRevision: playbackSessionRevision + 1,
      isPlaying: true
    });
    persist();
    resolvePlaybackUrl(song);
  };

  return {
    queue: restored.queue ?? [],
    queueSongs: restored.queueSongs ?? {},
    queueEpoch: 0,
    currentQueueItemId: restored.currentQueueItemId ?? null,
    currentSong: null,
    currentPlaybackUrl: null,
    playbackRestriction: null,
    playbackStatus: 'idle',
    playbackMode: restorePlaybackMode(restored.playbackMode),
    playbackQuality: restorePlaybackQuality(restored.playbackQuality),
    playbackPositionMs: restored.playbackPositionMs ?? 0,
    playbackDurationMs: restored.playbackDurationMs ?? 0,
    playbackSeekRevision: 0,
    playbackSessionRevision: 0,
    volume: clamp(Number(localStorage.getItem(VOLUME_KEY) ?? '58') || 58, 0, 100),
    isPlaying: false,
    isLyricsOpen: false,
    failedQueueItemIds: [],
    mediaElement: null,

    playSongsFromList(songs, startIndex, sourceContext) {
      if (songs.length === 0) return;
      const start = clamp(startIndex, 0, songs.length - 1);
      const queueItems: QueueItem[] = songs.map((song) => queueItemForSong(song, 'playlist', sourceContext));
      const queueSongs: Record<string, Song> = {};
      for (const song of songs) queueSongs[songKey(song)] = song;
      set({
        queue: queueItems.slice(0, QUEUE_LIMIT),
        queueSongs,
        failedQueueItemIds: [],
        queueEpoch: get().queueEpoch + 1
      });
      playQueueItemAt(start);
    },

    playSongFromList(song, sourceContext) {
      get().playSongsFromList([song], 0, sourceContext);
    },

    enqueueSong(song, source, sourceContext) {
      const { queue, queueSongs } = get();
      const mediaId = songKey(song);
      if (queue.some((item) => item.mediaId === mediaId)) return;

      const item = queueItemForSong(song, source, sourceContext);
      const nextQueue = queue.length >= QUEUE_LIMIT ? [...queue.slice(1), item] : [...queue, item];
      set({ queue: nextQueue, queueSongs: { ...queueSongs, [mediaId]: song } });
      persist();
    },

    enqueueNextSong(song, source, sourceContext) {
      const { queue, queueSongs, currentQueueItemId } = get();
      const mediaId = songKey(song);
      const existing = queue.find((item) => item.mediaId === mediaId);
      if (existing?.id === currentQueueItemId) return;

      const queueWithoutSong = existing ? queue.filter((item) => item.id !== existing.id) : queue;
      const item = existing ?? queueItemForSong(song, source, sourceContext);
      const currentIndex = queueWithoutSong.findIndex((queueItem) => queueItem.id === currentQueueItemId);
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
      const nextQueue = [
        ...queueWithoutSong.slice(0, insertAt),
        item,
        ...queueWithoutSong.slice(insertAt)
      ].slice(0, QUEUE_LIMIT);
      set({
        queue: nextQueue,
        queueSongs: { ...queueSongs, [mediaId]: song }
      });
      persist();
    },

    playQueueItem(item) {
      const index = get().queue.findIndex((q) => q.id === item.id);
      if (index >= 0) playQueueItemAt(index);
    },

    selectQueueItem(queueItemId) {
      const index = get().queue.findIndex((q) => q.id === queueItemId);
      if (index >= 0) playQueueItemAt(index);
    },

    removeQueueItem(queueItemId) {
      const { queue, currentQueueItemId } = get();
      const index = queue.findIndex((q) => q.id === queueItemId);
      if (index < 0) return;
      set({ queue: queue.filter((q) => q.id !== queueItemId) });
      if (currentQueueItemId === queueItemId) {
        const nextIndex = Math.min(index, queue.length - 2);
        if (nextIndex >= 0) {
          playQueueItemAt(nextIndex);
        } else {
          set({ currentSong: null, currentQueueItemId: null, isPlaying: false, playbackStatus: 'idle', currentPlaybackUrl: null });
        }
      }
      persist();
    },

    clearQueue() {
      set({
        queue: [],
        queueSongs: {},
        currentQueueItemId: null,
        currentSong: null,
        currentPlaybackUrl: null,
        playbackStatus: 'idle',
        isPlaying: false,
        playbackRestriction: null
      });
      persist();
    },

    playPrevious() {
      const { queue, currentQueueItemId, playbackMode } = get();
      if (queue.length === 0) return;
      const currentIndex = queue.findIndex((q) => q.id === currentQueueItemId);
      let targetIndex: number;
      if (playbackMode === 'shuffle') {
        targetIndex = Math.floor(Math.random() * queue.length);
      } else if (playbackMode === 'singleLoop') {
        targetIndex = currentIndex;
      } else {
        targetIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
      }
      playQueueItemAt(targetIndex);
    },

    playNext() {
      const { queue, currentQueueItemId, playbackMode } = get();
      if (queue.length === 0) return;
      const currentIndex = queue.findIndex((q) => q.id === currentQueueItemId);
      let targetIndex: number;
      if (playbackMode === 'shuffle') {
        targetIndex = Math.floor(Math.random() * queue.length);
      } else if (playbackMode === 'singleLoop') {
        targetIndex = currentIndex;
      } else {
        targetIndex = currentIndex >= queue.length - 1 ? 0 : currentIndex + 1;
      }
      playQueueItemAt(targetIndex);
    },

    togglePlaying() {
      const { isPlaying, currentSong, currentPlaybackUrl, playbackStatus, queue, currentQueueItemId } = get();
      if (isPlaying) {
        set({ isPlaying: false });
        persist();
        return;
      }
      if (currentSong && (currentPlaybackUrl || playbackStatus === 'ready')) {
        set({ isPlaying: true });
        return;
      }
      if (currentSong && !currentPlaybackUrl) {
        resolvePlaybackUrl(currentSong);
        return;
      }
      if (!currentSong && queue.length > 0) {
        const item = queue.find((q) => q.id === currentQueueItemId) ?? queue[0];
        playQueueItemAt(queue.indexOf(item));
      }
    },

    setPlaybackMode(mode) {
      set({ playbackMode: mode });
      localStorage.setItem(MODE_KEY, mode);
    },

    setPlaybackQuality(quality) {
      const previous = get().playbackQuality;
      set({ playbackQuality: quality });
      localStorage.setItem(QUALITY_KEY, quality);
      const song = get().currentSong;
      if (song && quality !== previous) {
        resolvePlaybackUrl(song);
      }
    },

    setPlaybackProgress(positionMs, durationMs) {
      set((state) => ({
        playbackPositionMs: positionMs,
        playbackDurationMs: durationMs ?? state.playbackDurationMs
      }));
      const now = Date.now();
      if (now - lastPersistAt > 5000) {
        persist();
        lastPersistAt = now;
      }
    },

    seekPlayback(positionMs, durationMs) {
      set((state) => ({
        playbackPositionMs: positionMs,
        playbackDurationMs: durationMs ?? state.playbackDurationMs,
        playbackSeekRevision: state.playbackSeekRevision + 1
      }));
      persist();
    },

    setVolume(volume) {
      const clamped = clamp(volume, 0, 100);
      set({ volume: clamped });
      localStorage.setItem(VOLUME_KEY, String(clamped));
    },

    setLyricsOpen(open) {
      if (open && !get().currentSong) return;
      set({ isLyricsOpen: open });
    },

    setPlaybackUrl(url) {
      set({ currentPlaybackUrl: url, playbackStatus: 'ready' });
    },

    setPlaybackRestriction(restriction) {
      set({ playbackRestriction: restriction });
    },

    setPlaybackStatus(status) {
      set({ playbackStatus: status });
    },

    setPlaybackError(message, expectedUrl) {
      const { queue, currentQueueItemId, failedQueueItemIds, currentSong } = get();
      if (currentSong && expectedUrl && expectedUrl !== get().currentPlaybackUrl) return;

      // 连败熔断：环境性故障（网络断开/连接池坏死等）下，无退避的自动跳歌会把
      // 整个队列逐个标记失败、烧穿全库，用户视角即"无论怎么点都无法播放"。
      // 连续 3 次失败即停止自动跳歌，置为错误态交还用户决定（成功起播后清零）。
      consecutiveAutoSkipFailures += 1;
      if (consecutiveAutoSkipFailures >= 3) {
        consecutiveAutoSkipFailures = 0;
        const failedWithCurrent = currentQueueItemId
          ? [...failedQueueItemIds, currentQueueItemId]
          : [...failedQueueItemIds];
        set({
          playbackStatus: 'error',
          isPlaying: false,
          currentPlaybackUrl: null,
          failedQueueItemIds: failedWithCurrent.slice(-40),
          playbackRestriction: {
            category: 'url_unavailable',
            message: message || '连续多首播放失败，已停止自动切歌',
            action: 'retry'
          }
        });
        return;
      }

      const currentIndex = queue.findIndex((q) => q.id === currentQueueItemId);
      const failed = [...failedQueueItemIds];
      if (currentQueueItemId) failed.push(currentQueueItemId);

      let targetIndex = -1;
      for (let offset = 1; offset <= queue.length; offset++) {
        const candidate = (currentIndex + offset) % queue.length;
        const item = queue[candidate];
        if (item && !failed.includes(item.id)) {
          targetIndex = candidate;
          break;
        }
      }

      if (targetIndex >= 0) {
        set({ failedQueueItemIds: failed.slice(-40) });
        playQueueItemAt(targetIndex);
      } else {
        set({
          playbackStatus: 'error',
          isPlaying: false,
          currentPlaybackUrl: null,
          playbackRestriction: { category: 'url_unavailable', message: message || '播放失败', action: 'retry' }
        });
      }
    },

    retryPlayback() {
      const song = get().currentSong;
      if (song) {
        set({ playbackRestriction: null, failedQueueItemIds: [] });
        // forceRefresh：跳过主进程的播放失败缓存，确保重试真正发起网络请求
        resolvePlaybackUrl(song, { forceRefresh: true });
      }
    },

    dismissPlaybackRestriction() {
      set({ playbackRestriction: null, playbackStatus: 'error' });
    },

    handlePlaybackEnded() {
      const { playbackMode, queue, currentQueueItemId } = get();
      if (queue.length === 0) {
        set({ isPlaying: false, playbackStatus: 'idle', playbackPositionMs: 0 });
        return;
      }
      if (playbackMode === 'singleLoop') {
        set((state) => ({
          playbackPositionMs: 0,
          playbackSessionRevision: state.playbackSessionRevision + 1
        }));
        get().seekPlayback(0);
        return;
      }
      if (playbackMode === 'sequence') {
        const currentIndex = queue.findIndex((q) => q.id === currentQueueItemId);
        if (currentIndex >= queue.length - 1) {
          set((state) => ({
            isPlaying: false,
            playbackStatus: 'idle',
            playbackPositionMs: 0,
            playbackSessionRevision: state.playbackSessionRevision + 1
          }));
          return;
        }
        playQueueItemAt(currentIndex + 1);
        return;
      }
      const currentIndex = queue.findIndex((q) => q.id === currentQueueItemId);
      let targetIndex: number;
      if (playbackMode === 'shuffle') {
        targetIndex = Math.floor(Math.random() * queue.length);
      } else {
        targetIndex = currentIndex >= queue.length - 1 ? 0 : currentIndex + 1;
      }
      playQueueItemAt(targetIndex);
    },

    setLyricOffset(songKeyValue, offsetSeconds) {
      try {
        localStorage.setItem(`${LYRIC_OFFSET_PREFIX}${songKeyValue}`, String(offsetSeconds));
      } catch {
        // ignore
      }
    },

    getLyricOffset(songKeyValue) {
      try {
        return Number(localStorage.getItem(`${LYRIC_OFFSET_PREFIX}${songKeyValue}`)) || 0;
      } catch {
        return 0;
      }
    }
  };
});

export function useCurrentSongKey(): string | null {
  const song = usePlayerStore.getState().currentSong;
  return song ? songKey(song) : null;
}

export function currentQueueIndex(state: PlayerState): number {
  return state.queue.findIndex((q) => q.id === state.currentQueueItemId);
}
