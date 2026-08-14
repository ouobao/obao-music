import { create } from 'zustand';
import type {
  PlayableMedia,
  PodcastSourceContext,
  Program,
  RadioSourceContext,
  QueueItem,
  QueueItemSource,
  Song,
  SourceContext
} from '../../shared/musicTypes';
import type { PlaybackRestriction, Quality } from '../../shared/providerTypes';

type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'restricted' | 'error';
export type PlaybackMode = 'sequence' | 'shuffle' | 'singleLoop' | 'listLoop';
type SourceContextFactory = (song: Song, index: number) => SourceContext;
type PlayableSourceContextFactory = (media: PlayableMedia, index: number) => SourceContext;
type StoredPlayerSession = Pick<
  PlayerSnapshot,
  | 'queue'
  | 'queueMedia'
  | 'queueSongs'
  | 'currentQueueItemId'
  | 'currentMedia'
  | 'currentSong'
  | 'playbackMode'
  | 'playbackQuality'
  | 'playbackPositionMs'
  | 'playbackDurationMs'
  | 'volume'
>;
type PlayerSessionSnapshot = StoredPlayerSession & { version: 2 };
type UnknownRecord = Record<string, unknown>;

interface PlayerState {
  queue: QueueItem[];
  queueMedia: Record<string, PlayableMedia>;
  queueSongs: Record<string, Song>;
  currentQueueItemId: string | null;
  currentMedia: PlayableMedia | null;
  currentSong: Song | null;
  currentPlaybackUrl: string | null;
  playbackRestriction: PlaybackRestriction | null;
  playbackStatus: PlaybackStatus;
  playbackMode: PlaybackMode;
  playbackQuality: Quality;
  playbackPositionMs: number;
  playbackDurationMs: number;
  playbackSeekRevision: number;
  volume: number;
  isPlaying: boolean;
  isLyricsOpen: boolean;
  playSong: (songId: string) => void;
  enqueueSong: (song: Song, sourceContext: SourceContext) => QueueItem;
  enqueueNextSong: (song: Song, sourceContext: SourceContext) => QueueItem;
  playSongFromList: (song: Song, sourceContext: SourceContext) => QueueItem;
  playSongsFromList: (songs: Song[], startIndex: number, createSourceContext: SourceContextFactory) => QueueItem | null;
  enqueueProgram: (program: Program) => QueueItem;
  enqueueNextProgram: (program: Program) => QueueItem;
  playProgramFromList: (program: Program) => QueueItem;
  playProgramsFromList: (programs: Program[], startIndex: number) => QueueItem | null;
  playPrevious: () => void;
  playNext: () => void;
  togglePlaying: () => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPlaybackQuality: (quality: Quality) => void;
  setPlaybackProgress: (positionMs: number, durationMs?: number) => void;
  seekPlayback: (positionMs: number, durationMs?: number) => void;
  setVolume: (volume: number) => void;
  selectQueueItem: (queueItemId: string) => void;
  setPlaybackError: (message: string, expectedPlaybackUrl?: string | null) => void;
  retryPlayback: () => void;
  dismissPlaybackRestriction: () => void;
  handlePlaybackEnded: () => void;
  setLyricsOpen: (open: boolean) => void;
  resetForTest: () => void;
}

type PlayerSnapshot = Pick<
  PlayerState,
  | 'queue'
  | 'queueMedia'
  | 'queueSongs'
  | 'currentQueueItemId'
  | 'currentMedia'
  | 'currentSong'
  | 'currentPlaybackUrl'
  | 'playbackRestriction'
  | 'playbackStatus'
  | 'playbackMode'
  | 'playbackQuality'
  | 'playbackPositionMs'
  | 'playbackDurationMs'
  | 'volume'
  | 'isPlaying'
  | 'isLyricsOpen'
>;

const PLAYER_VOLUME_STORAGE_KEY = 'musicplayer.volume';
const PLAYER_SESSION_STORAGE_KEY = 'musicplayer.playback-session';
const PLAYER_SESSION_STORAGE_VERSION = 2;
const PLAYER_SESSION_QUEUE_STORAGE_LIMIT = 500;
const PLAYBACK_PROGRESS_PERSIST_INTERVAL_MS = 2_000;
const defaultVolume = 58;

const initialState: PlayerSnapshot = createInitialState();

export const usePlayerStore = create<PlayerState>((set, get) => {
  let progressPersistTimer: number | null = null;
  let hasDirtyPlaybackProgress = false;
  let playbackRequestRevision = 0;
  const failedQueueItemIds = new Set<string>();

  const clearScheduledPlaybackProgressPersistence = () => {
    if (progressPersistTimer === null) {
      return;
    }

    window.clearTimeout(progressPersistTimer);
    progressPersistTimer = null;
  };

  const flushPlaybackProgressPersistence = () => {
    clearScheduledPlaybackProgressPersistence();
    if (!hasDirtyPlaybackProgress) {
      return;
    }

    hasDirtyPlaybackProgress = false;
    writeStoredSession(get());
  };

  const persistCurrentSessionNow = () => {
    clearScheduledPlaybackProgressPersistence();
    hasDirtyPlaybackProgress = false;
    writeStoredSession(get());
  };

  const schedulePlaybackProgressPersistence = () => {
    hasDirtyPlaybackProgress = true;
    if (progressPersistTimer !== null) {
      return;
    }

    progressPersistTimer = window.setTimeout(flushPlaybackProgressPersistence, PLAYBACK_PROGRESS_PERSIST_INTERVAL_MS);
  };

  const updatePlaybackProgress = (positionMs: number, durationMs: number | undefined, isSeek: boolean) => {
    set((state) => {
      const playbackDurationMs = normalizePlaybackMs(durationMs ?? state.playbackDurationMs);
      return {
        playbackPositionMs: clampPlaybackPositionMs(positionMs, playbackDurationMs),
        playbackDurationMs,
        playbackSeekRevision: isSeek ? state.playbackSeekRevision + 1 : state.playbackSeekRevision
      };
    });
    schedulePlaybackProgressPersistence();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPlaybackProgressPersistence);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPlaybackProgressPersistence();
      }
    });
  }

  const clearPlaybackFailures = () => {
    failedQueueItemIds.clear();
  };

  const handlePlaybackFailure = (
    failure: PlaybackRestriction | string,
    expectedMediaId?: string,
    expectedPlaybackUrl?: string | null,
    shouldSkip = true
  ) => {
    const state = get();
    if (expectedMediaId && getCurrentPlayableMedia(state)?.id !== expectedMediaId) {
      return;
    }
    if (expectedPlaybackUrl && state.currentPlaybackUrl !== expectedPlaybackUrl) {
      return;
    }

    const restriction = typeof failure === 'string' ? createPlaybackRestriction(failure) : failure;
    if (shouldSkip && state.currentQueueItemId) {
      failedQueueItemIds.add(state.currentQueueItemId);
      if (startQueueItem(findAdjacentQueueItem('next', failedQueueItemIds), true)) {
        return;
      }
    }

    set({
      currentPlaybackUrl: null,
      playbackRestriction: restriction,
      playbackStatus: typeof failure === 'string' ? 'error' : 'restricted',
      isPlaying: false
    });
    persistCurrentSessionNow();
  };

  const isCurrentPlaybackRequest = (media: PlayableMedia, requestRevision: number) => (
    requestRevision === playbackRequestRevision
    && hasSamePlayableMediaIdentity(getCurrentPlayableMedia(get()), media)
  );

  const resolvePlaybackUrl = async (media: PlayableMedia, requestRevision: number) => {
    const musicApi = window.musicPlayer?.music;
    if (!musicApi) {
      handlePlaybackFailure('音乐服务桥接不可用', media.id, undefined, false);
      return;
    }

    try {
      const result = isProgram(media)
        ? await musicApi.getProgramPlayback(media.providerId, media)
        : await musicApi.getSongUrl(media.providerId, media, get().playbackQuality);
      if (!isCurrentPlaybackRequest(media, requestRevision)) {
        return;
      }

      if (!result.ok) {
        handlePlaybackFailure(result.error.message, media.id, undefined, false);
        return;
      }

      if (result.data.ok && result.data.url) {
        set({
          currentPlaybackUrl: result.data.url,
          playbackRestriction: null,
          playbackStatus: 'ready',
          isPlaying: true
        });
        return;
      }

      const fallbackMessage = isProgram(media)
        ? '当前节目暂时无法获取播放地址'
        : '当前歌曲暂时无法获取播放地址';
      const restriction = result.data.reason ?? createPlaybackRestriction(fallbackMessage);
      handlePlaybackFailure(restriction, media.id, undefined, shouldSkipPlaybackRestriction(restriction));
    } catch (error) {
      if (!isCurrentPlaybackRequest(media, requestRevision)) {
        return;
      }

      handlePlaybackFailure(error instanceof Error ? error.message : '播放地址获取失败', media.id, undefined, false);
    }
  };

  const beginPlaybackUrlRequest = (media: PlayableMedia) => {
    const requestRevision = ++playbackRequestRevision;
    void resolvePlaybackUrl(media, requestRevision);
  };

  const startPlayback = (queueItem: QueueItem, media: PlayableMedia, preserveFailures = false) => {
    if (!preserveFailures) {
      clearPlaybackFailures();
    }
    set((state) => ({
      currentQueueItemId: queueItem.id,
      currentMedia: media,
      currentSong: isProgram(media) ? null : media,
      currentPlaybackUrl: null,
      playbackRestriction: null,
      playbackStatus: 'loading',
      playbackPositionMs: 0,
      playbackDurationMs: normalizePlaybackMs(media.durationMs),
      isPlaying: true,
      isLyricsOpen: isProgram(media) ? false : state.isLyricsOpen
    }));
    persistCurrentSessionNow();
    beginPlaybackUrlRequest(media);
  };

  const getMediaForQueueItem = (queueItem: QueueItem): PlayableMedia | undefined => {
    const state = get();
    const media = state.queueMedia[queueItem.mediaId];
    if (media && getPlayableMediaType(media) === queueItem.mediaType) {
      return {
        ...media,
        sourceContext: queueItem.sourceContext ?? media.sourceContext
      } as PlayableMedia;
    }

    if (queueItem.mediaType !== 'song' || !queueItem.songId) {
      return undefined;
    }

    const song = state.queueSongs[queueItem.songId];
    if (!song) {
      return undefined;
    }

    return {
      ...song,
      sourceContext: queueItem.sourceContext ?? song.sourceContext
    };
  };

  const startQueueItem = (queueItem: QueueItem | undefined, preserveFailures = false) => {
    if (!queueItem) {
      return false;
    }

    const media = getMediaForQueueItem(queueItem);
    if (!media) {
      return false;
    }

    startPlayback(queueItem, media, preserveFailures);
    return true;
  };

  const findAdjacentQueueItem = (direction: 'previous' | 'next', excludedQueueItemIds?: ReadonlySet<string>) => {
    const state = get();
    if (state.queue.length === 0) {
      return undefined;
    }

    const isExcluded = (queueItem: QueueItem) => excludedQueueItemIds?.has(queueItem.id) ?? false;
    const hasExcludedItems = Boolean(excludedQueueItemIds?.size);
    const currentIndex = state.queue.findIndex((item) => item.id === state.currentQueueItemId);
    if (state.playbackMode === 'singleLoop' && !hasExcludedItems) {
      return currentIndex >= 0 ? state.queue[currentIndex] : undefined;
    }

    if (state.playbackMode === 'shuffle') {
      const candidates = state.queue.filter((item) => item.id !== state.currentQueueItemId && !isExcluded(item));
      return pickRandomItem(candidates.length > 0 ? candidates : state.queue.filter((item) => !isExcluded(item)));
    }

    const offset = direction === 'next' ? 1 : -1;
    const startIndex = currentIndex >= 0 ? currentIndex : direction === 'next' ? -1 : state.queue.length;
    const canWrap = state.playbackMode === 'listLoop' || (state.playbackMode === 'singleLoop' && hasExcludedItems);
    for (let step = 1; step <= state.queue.length; step += 1) {
      let candidateIndex = startIndex + offset * step;
      if (candidateIndex < 0 || candidateIndex >= state.queue.length) {
        if (!canWrap) {
          return undefined;
        }
        candidateIndex = (candidateIndex + state.queue.length) % state.queue.length;
      }

      const candidate = state.queue[candidateIndex];
      if (!isExcluded(candidate)) {
        return candidate;
      }
    }

    return undefined;
  };

  const enqueueMedia = (media: PlayableMedia, sourceContext: SourceContext) => {
    const queuedMedia = withSourceContext(media, sourceContext);
    const mediaType = getPlayableMediaType(media);
    const existingItem = get().queue.find((item) => (
      item.mediaId === media.id
      && item.mediaType === mediaType
      && hasSameSourceContext(item.sourceContext, sourceContext)
    ));

    if (existingItem) {
      set((state) => updateMediaState(state, queuedMedia));
      persistCurrentSessionNow();
      return existingItem;
    }

    const queueItem = createQueueItem(queuedMedia, sourceContext, get().queue.length + 1);
    set((state) => ({
      queue: [...state.queue, queueItem],
      ...updateMediaState(state, queuedMedia)
    }));
    persistCurrentSessionNow();

    return queueItem;
  };

  const enqueueNextMedia = (media: PlayableMedia, sourceContext: SourceContext) => {
    const queuedMedia = withSourceContext(media, sourceContext);
    const mediaType = getPlayableMediaType(media);
    const state = get();
    const existingItem = state.queue.find((item) => (
      item.mediaId === media.id
      && item.mediaType === mediaType
      && hasSameSourceContext(item.sourceContext, sourceContext)
    ));

    if (existingItem?.id === state.currentQueueItemId) {
      set((current) => updateMediaState(current, queuedMedia));
      persistCurrentSessionNow();
      return existingItem;
    }

    const queueItem = existingItem ?? createQueueItem(queuedMedia, sourceContext, state.queue.length + 1);
    const queueWithoutExisting = existingItem ? state.queue.filter((item) => item.id !== existingItem.id) : state.queue;
    const currentIndex = queueWithoutExisting.findIndex((item) => item.id === state.currentQueueItemId);
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : queueWithoutExisting.length;
    const nextQueue = [
      ...queueWithoutExisting.slice(0, insertIndex),
      queueItem,
      ...queueWithoutExisting.slice(insertIndex)
    ];

    set((current) => ({
      queue: nextQueue,
      ...updateMediaState(current, queuedMedia)
    }));
    persistCurrentSessionNow();

    return queueItem;
  };

  const playMediaList = (
    media: PlayableMedia[],
    startIndex: number,
    createSourceContext: PlayableSourceContextFactory
  ) => {
    if (media.length === 0 || startIndex < 0 || startIndex >= media.length) {
      return null;
    }

    const queueMedia: Record<string, PlayableMedia> = {};
    const queueSongs: Record<string, Song> = {};
    const queue = media.map((item, index) => {
      const sourceContext = createSourceContext(item, index);
      const queuedMedia = withSourceContext(item, sourceContext);
      queueMedia[item.id] = queuedMedia;
      if (!isProgram(queuedMedia)) {
        queueSongs[item.id] = queuedMedia;
      }

      return createQueueItem(queuedMedia, sourceContext, index + 1);
    });

    set({ queue, queueMedia, queueSongs });

    const queueItem = queue[startIndex];
    const queuedMedia = getMediaForQueueItem(queueItem);
    if (!queuedMedia) {
      return null;
    }

    startPlayback(queueItem, queuedMedia);
    return queueItem;
  };

  return {
    ...initialState,
    playbackSeekRevision: 0,
    playSong: (songId) => {
      const queueItem = get().queue.find((item) => item.mediaType === 'song' && item.songId === songId);
      if (!queueItem) {
        return;
      }

      void startQueueItem(queueItem);
    },
    enqueueSong: (song, sourceContext) => enqueueMedia(song, sourceContext),
    enqueueNextSong: (song, sourceContext) => enqueueNextMedia(song, sourceContext),
    playSongFromList: (song, sourceContext) => {
      const queueItem = playMediaList([song], 0, () => sourceContext);
      return queueItem ?? get().enqueueSong(song, sourceContext);
    },
    playSongsFromList: (songs, startIndex, createSourceContext) => playMediaList(
      songs,
      startIndex,
      (media, index) => createSourceContext(media as Song, index)
    ),
    enqueueProgram: (program) => enqueueMedia(program, program.sourceContext),
    enqueueNextProgram: (program) => enqueueNextMedia(program, program.sourceContext),
    playProgramFromList: (program) => {
      const queueItem = playMediaList([program], 0, (media) => (media as Program).sourceContext);
      return queueItem ?? get().enqueueProgram(program);
    },
    playProgramsFromList: (programs, startIndex) => playMediaList(
      programs,
      startIndex,
      (media) => (media as Program).sourceContext
    ),
    playPrevious: () => {
      void startQueueItem(findAdjacentQueueItem('previous'));
    },
    playNext: () => {
      void startQueueItem(findAdjacentQueueItem('next'));
    },
    togglePlaying: () => {
      const activeMedia = getCurrentPlayableMedia(get());
      if (!activeMedia) {
        return;
      }

      const state = get();
      if (!state.currentPlaybackUrl && state.playbackStatus !== 'loading') {
        clearPlaybackFailures();
        set({
          currentPlaybackUrl: null,
          playbackRestriction: null,
          playbackStatus: 'loading',
          isPlaying: true
        });
        beginPlaybackUrlRequest(activeMedia);
        return;
      }

      set({ isPlaying: !state.isPlaying });
    },
    setPlaybackMode: (playbackMode) => {
      set({ playbackMode });
      persistCurrentSessionNow();
    },
    setPlaybackQuality: (quality) => {
      const activeMedia = getCurrentPlayableMedia(get());
      const song = activeMedia && !isProgram(activeMedia) ? activeMedia : null;
      clearPlaybackFailures();
      set((state) => ({
        playbackQuality: quality,
        currentPlaybackUrl: song ? null : state.currentPlaybackUrl,
        playbackRestriction: song ? null : state.playbackRestriction,
        playbackStatus: song ? 'loading' : state.playbackStatus,
        playbackPositionMs: song ? 0 : state.playbackPositionMs,
        playbackDurationMs: song ? normalizePlaybackMs(song.durationMs) : state.playbackDurationMs,
        isPlaying: song ? true : state.isPlaying
      }));
      persistCurrentSessionNow();

      if (song) {
        beginPlaybackUrlRequest(song);
      }
    },
    setPlaybackProgress: (positionMs, durationMs) => {
      updatePlaybackProgress(positionMs, durationMs, false);
    },
    seekPlayback: (positionMs, durationMs) => {
      updatePlaybackProgress(positionMs, durationMs, true);
    },
    setVolume: (volume) => {
      const nextVolume = clampVolume(volume);
      set({ volume: nextVolume });
      writeStoredVolume(nextVolume);
      persistCurrentSessionNow();
    },
    selectQueueItem: (queueItemId) => {
      const queueItem = get().queue.find((item) => item.id === queueItemId);
      if (!queueItem) {
        return;
      }

      void startQueueItem(queueItem);
    },
    setPlaybackError: (message, expectedPlaybackUrl) => {
      handlePlaybackFailure(message, undefined, expectedPlaybackUrl);
    },
    retryPlayback: () => {
      const activeMedia = getCurrentPlayableMedia(get());
      if (!activeMedia) {
        return;
      }

      clearPlaybackFailures();
      set({
        currentPlaybackUrl: null,
        playbackRestriction: null,
        playbackStatus: 'loading',
        playbackPositionMs: 0,
        playbackDurationMs: normalizePlaybackMs(activeMedia.durationMs),
        isPlaying: true
      });
      persistCurrentSessionNow();
      beginPlaybackUrlRequest(activeMedia);
    },
    dismissPlaybackRestriction: () => {
      set({ playbackRestriction: null });
    },
    handlePlaybackEnded: () => {
      if (startQueueItem(findAdjacentQueueItem('next'))) {
        return;
      }

      set((state) => ({
        isPlaying: false,
        playbackPositionMs: state.playbackDurationMs
      }));
      persistCurrentSessionNow();
    },
    setLyricsOpen: (open) => {
      if (open && isProgram(getCurrentPlayableMedia(get()))) {
        return;
      }
      set({ isLyricsOpen: open });
    },
    resetForTest: () => {
      clearScheduledPlaybackProgressPersistence();
      hasDirtyPlaybackProgress = false;
      clearPlaybackFailures();
      set({
        ...createDefaultPlayerSnapshot(defaultVolume),
        playbackSeekRevision: 0
      });
    }
  };
});

function createInitialState(): PlayerSnapshot {
  const storedSession = readStoredSession();
  if (!storedSession) {
    return createDefaultPlayerSnapshot(readStoredVolume());
  }

  return {
    ...createDefaultPlayerSnapshot(storedSession.volume),
    ...storedSession,
    currentPlaybackUrl: null,
    playbackRestriction: null,
    playbackStatus: 'idle',
    isPlaying: false,
    isLyricsOpen: false
  };
}

function createDefaultPlayerSnapshot(volume: number): PlayerSnapshot {
  return {
    queue: [],
    queueMedia: {},
    queueSongs: {},
    currentQueueItemId: null,
    currentMedia: null,
    currentSong: null,
    currentPlaybackUrl: null,
    playbackRestriction: null,
    playbackStatus: 'idle',
    playbackMode: 'sequence',
    playbackQuality: 'standard',
    playbackPositionMs: 0,
    playbackDurationMs: 0,
    volume: clampVolume(volume),
    isPlaying: false,
    isLyricsOpen: false
  };
}

function toQueueItemSource(sourceType: SourceContext['type']): QueueItemSource {
  return sourceType === 'recommendation' ? 'playlist' : sourceType;
}

function hasSameSourceContext(left: SourceContext | undefined, right: SourceContext): boolean {
  if (!left) {
    return false;
  }

  return (
    left.type === right.type &&
    left.providerId === right.providerId &&
    left.playlistId === right.playlistId &&
    left.searchKeyword === right.searchKeyword &&
    left.artistId === right.artistId &&
    left.albumId === right.albumId &&
    left.podcastId === right.podcastId &&
    left.podcastTitle === right.podcastTitle &&
    left.radioSessionId === right.radioSessionId &&
    left.radioItemId === right.radioItemId
  );
}

function createQueueItem(media: PlayableMedia, sourceContext: SourceContext, position: number): QueueItem {
  const mediaType = getPlayableMediaType(media);
  return {
    id: createQueueItemId(media.id, position),
    mediaId: media.id,
    mediaType,
    ...(mediaType === 'song' ? { songId: media.id } : {}),
    source: toQueueItemSource(sourceContext.type),
    sourceContext
  };
}

function createQueueItemId(mediaId: string, position: number): string {
  return `queue-${position}-${mediaId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getPlayableMediaType(media: PlayableMedia): QueueItem['mediaType'] {
  return isProgram(media) ? 'program' : 'song';
}

function getCurrentPlayableMedia(
  state: Pick<PlayerState, 'currentMedia' | 'currentSong'>
): PlayableMedia | null {
  return state.currentMedia ?? state.currentSong;
}

function hasSamePlayableMediaIdentity(
  left: PlayableMedia | null | undefined,
  right: PlayableMedia
): boolean {
  if (!left) {
    return false;
  }

  return left.id === right.id && getPlayableMediaType(left) === getPlayableMediaType(right);
}

function withSourceContext(media: PlayableMedia, sourceContext: SourceContext): PlayableMedia {
  if (isProgram(media)) {
    return {
      ...media,
      sourceContext: isPodcastSourceContext(sourceContext) ? sourceContext : media.sourceContext
    };
  }

  return {
    ...media,
    sourceContext
  };
}

function updateMediaState(
  state: Pick<PlayerState, 'queueMedia' | 'queueSongs'>,
  media: PlayableMedia
): Pick<PlayerState, 'queueMedia' | 'queueSongs'> {
  return {
    queueMedia: {
      ...state.queueMedia,
      [media.id]: media
    },
    queueSongs: isProgram(media)
      ? state.queueSongs
      : {
          ...state.queueSongs,
          [media.id]: media
        }
  };
}

function pickRandomItem<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const index = Math.min(items.length - 1, Math.floor(Math.random() * items.length));
  return items[index];
}

function createPlaybackRestriction(message: string): PlaybackRestriction {
  return {
    category: 'url_unavailable',
    message,
    action: 'retry'
  };
}

function shouldSkipPlaybackRestriction(restriction: PlaybackRestriction): boolean {
  return restriction.category !== 'login_required'
    && restriction.category !== 'playback_auth_incomplete'
    && restriction.category !== 'provider_risk';
}

function readStoredVolume(): number {
  if (typeof localStorage === 'undefined') {
    return defaultVolume;
  }

  try {
    const rawVolume = localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
    if (rawVolume === null) {
      return defaultVolume;
    }

    const parsedVolume = Number(rawVolume);
    return Number.isFinite(parsedVolume) ? clampVolume(parsedVolume) : defaultVolume;
  } catch {
    return defaultVolume;
  }
}

function writeStoredVolume(volume: number) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Volume changes should still apply even when local storage is unavailable.
  }
}

function readStoredSession(): StoredPlayerSession | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const rawSession = localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!rawSession) {
      return null;
    }

    const parsed = JSON.parse(rawSession) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version === PLAYER_SESSION_STORAGE_VERSION) {
      return readStoredSessionV2(parsed);
    }

    return parsed.version === 1 ? migrateStoredSessionV1(parsed) : null;
  } catch {
    return null;
  }
}

function readStoredSessionV2(parsed: UnknownRecord): StoredPlayerSession | null {
  if (
    !Array.isArray(parsed.queue) ||
    !parsed.queue.every(isQueueItem) ||
    !isPlayableMediaRecord(parsed.queueMedia) ||
    !isSongRecord(parsed.queueSongs) ||
    !isNullableString(parsed.currentQueueItemId) ||
    !isNullablePlayableMedia(parsed.currentMedia) ||
    !isNullableSong(parsed.currentSong) ||
    !isPlaybackMode(parsed.playbackMode) ||
    !isQuality(parsed.playbackQuality) ||
    typeof parsed.playbackPositionMs !== 'number' ||
    typeof parsed.playbackDurationMs !== 'number' ||
    typeof parsed.volume !== 'number'
  ) {
    return null;
  }

  const playbackDurationMs = normalizePlaybackMs(parsed.playbackDurationMs);
  const currentMedia = parsed.currentMedia ?? parsed.currentSong;
  return {
    queue: parsed.queue,
    queueMedia: parsed.queueMedia,
    queueSongs: parsed.queueSongs,
    currentQueueItemId: parsed.currentQueueItemId,
    currentMedia,
    currentSong: isProgram(currentMedia) ? null : currentMedia,
    playbackMode: parsed.playbackMode,
    playbackQuality: parsed.playbackQuality,
    playbackPositionMs: clampPlaybackPositionMs(parsed.playbackPositionMs, playbackDurationMs),
    playbackDurationMs,
    volume: clampVolume(parsed.volume)
  };
}

function migrateStoredSessionV1(parsed: UnknownRecord): StoredPlayerSession | null {
  if (
    !Array.isArray(parsed.queue) ||
    !parsed.queue.every(isLegacyQueueItem) ||
    !isSongRecord(parsed.queueSongs) ||
    !isNullableString(parsed.currentQueueItemId) ||
    !isNullableSong(parsed.currentSong) ||
    !isPlaybackMode(parsed.playbackMode) ||
    !isQuality(parsed.playbackQuality) ||
    typeof parsed.playbackPositionMs !== 'number' ||
    typeof parsed.playbackDurationMs !== 'number' ||
    typeof parsed.volume !== 'number'
  ) {
    return null;
  }

  const playbackDurationMs = normalizePlaybackMs(parsed.playbackDurationMs);
  const queue = parsed.queue.map((item) => ({
    ...item,
    mediaId: item.songId,
    mediaType: 'song' as const
  }));
  return {
    queue,
    queueMedia: { ...parsed.queueSongs },
    queueSongs: parsed.queueSongs,
    currentQueueItemId: parsed.currentQueueItemId,
    currentMedia: parsed.currentSong,
    currentSong: parsed.currentSong,
    playbackMode: parsed.playbackMode,
    playbackQuality: parsed.playbackQuality,
    playbackPositionMs: clampPlaybackPositionMs(parsed.playbackPositionMs, playbackDurationMs),
    playbackDurationMs,
    volume: clampVolume(parsed.volume)
  };
}

function writeStoredSession(state: StoredPlayerSession) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const playbackDurationMs = normalizePlaybackMs(state.playbackDurationMs);
    const queueSnapshot = createStoredQueueSnapshot(state);
    const currentMedia = getCurrentPlayableMedia(state);
    const session: PlayerSessionSnapshot = {
      version: PLAYER_SESSION_STORAGE_VERSION,
      queue: queueSnapshot.queue,
      queueMedia: queueSnapshot.queueMedia,
      queueSongs: queueSnapshot.queueSongs,
      currentQueueItemId: state.currentQueueItemId,
      currentMedia,
      currentSong: isProgram(currentMedia) ? null : currentMedia,
      playbackMode: state.playbackMode,
      playbackQuality: state.playbackQuality,
      playbackPositionMs: clampPlaybackPositionMs(state.playbackPositionMs, playbackDurationMs),
      playbackDurationMs,
      volume: clampVolume(state.volume)
    };
    localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Playback should continue even when local storage is unavailable.
  }
}

function createStoredQueueSnapshot(
  state: StoredPlayerSession
): Pick<StoredPlayerSession, 'queue' | 'queueMedia' | 'queueSongs'> {
  const selectedQueue = state.queue.length <= PLAYER_SESSION_QUEUE_STORAGE_LIMIT
    ? state.queue
    : getStoredQueueWindow(state);
  const queue: QueueItem[] = [];
  const queueMedia: Record<string, PlayableMedia> = {};
  const queueSongs: Record<string, Song> = {};

  for (const item of selectedQueue) {
    const media = getStoredQueueItemMedia(state, item);
    if (!media) {
      continue;
    }

    queue.push(item);
    queueMedia[media.id] = media;
    if (!isProgram(media)) {
      queueSongs[media.id] = media;
    }
  }

  return { queue, queueMedia, queueSongs };
}

function getStoredQueueWindow(state: StoredPlayerSession): QueueItem[] {
  const currentIndex = state.queue.findIndex((item) => item.id === state.currentQueueItemId);
  const anchorIndex = currentIndex >= 0 ? currentIndex : 0;
  const halfWindow = Math.floor(PLAYER_SESSION_QUEUE_STORAGE_LIMIT / 2);
  const startIndex = Math.min(
    Math.max(0, anchorIndex - halfWindow),
    Math.max(0, state.queue.length - PLAYER_SESSION_QUEUE_STORAGE_LIMIT)
  );
  return state.queue.slice(startIndex, startIndex + PLAYER_SESSION_QUEUE_STORAGE_LIMIT);
}

function getStoredQueueItemMedia(
  state: Pick<PlayerState, 'queueMedia' | 'queueSongs'>,
  item: QueueItem
): PlayableMedia | undefined {
  const media = state.queueMedia[item.mediaId];
  if (media && getPlayableMediaType(media) === item.mediaType) {
    return media;
  }

  return item.mediaType === 'song' && item.songId ? state.queueSongs[item.songId] : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isProviderId(value: unknown): value is Song['providerId'] {
  return value === 'netease' || value === 'qq' || value === 'local';
}

function isQueueItemSource(value: unknown): value is QueueItemSource {
  return value === 'playlist'
    || value === 'search'
    || value === 'local'
    || value === 'artist'
    || value === 'album'
    || value === 'podcast'
    || value === 'radio';
}

function isSourceContextType(value: unknown): value is SourceContext['type'] {
  return isQueueItemSource(value) || value === 'recommendation';
}

function isQuality(value: unknown): value is Quality {
  return value === 'standard' || value === 'higher' || value === 'exhigh' || value === 'lossless';
}

function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === 'sequence' || value === 'shuffle' || value === 'singleLoop' || value === 'listLoop';
}

function isSourceContext(value: unknown): value is SourceContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isSourceContextType(value.type) &&
    isProviderId(value.providerId) &&
    (value.playlistId === undefined || typeof value.playlistId === 'string') &&
    (value.playlistTitle === undefined || typeof value.playlistTitle === 'string') &&
    (value.searchKeyword === undefined || typeof value.searchKeyword === 'string') &&
    (value.artistId === undefined || typeof value.artistId === 'string') &&
    (value.artistName === undefined || typeof value.artistName === 'string') &&
    (value.albumId === undefined || typeof value.albumId === 'string') &&
    (value.albumTitle === undefined || typeof value.albumTitle === 'string') &&
    (value.podcastId === undefined || typeof value.podcastId === 'string') &&
    (value.podcastTitle === undefined || typeof value.podcastTitle === 'string') &&
    (value.radioSessionId === undefined || typeof value.radioSessionId === 'string') &&
    (value.radioItemId === undefined || typeof value.radioItemId === 'string') &&
    (value.type !== 'podcast' || (
      typeof value.podcastId === 'string'
      && Boolean(value.podcastId)
      && typeof value.podcastTitle === 'string'
      && Boolean(value.podcastTitle)
    )) &&
    (value.type !== 'radio' || (
      typeof value.radioSessionId === 'string'
      && Boolean(value.radioSessionId)
      && typeof value.radioItemId === 'string'
      && Boolean(value.radioItemId)
    ))
  );
}

function isPodcastSourceContext(value: unknown): value is PodcastSourceContext {
  return isSourceContext(value)
    && value.type === 'podcast'
    && typeof value.podcastId === 'string'
    && Boolean(value.podcastId)
    && typeof value.podcastTitle === 'string'
    && Boolean(value.podcastTitle);
}

function isRadioSourceContext(value: unknown): value is RadioSourceContext {
  return isSourceContext(value)
    && value.type === 'radio'
    && typeof value.radioSessionId === 'string'
    && Boolean(value.radioSessionId)
    && typeof value.radioItemId === 'string'
    && Boolean(value.radioItemId);
}

function isSong(value: unknown): value is Song {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.mediaType === undefined || value.mediaType === 'song') &&
    isProviderId(value.providerId) &&
    (value.platformSongId === undefined || typeof value.platformSongId === 'string') &&
    (value.platformMediaId === undefined || typeof value.platformMediaId === 'string') &&
    typeof value.title === 'string' &&
    typeof value.artist === 'string' &&
    typeof value.album === 'string' &&
    typeof value.durationMs === 'number' &&
    typeof value.coverTone === 'string' &&
    (value.coverUrl === undefined || typeof value.coverUrl === 'string') &&
    (value.artistImageUrl === undefined || typeof value.artistImageUrl === 'string') &&
    (value.artists === undefined || (Array.isArray(value.artists) && value.artists.every(isArtistReference))) &&
    (value.albumRef === undefined || isAlbumReference(value.albumRef)) &&
    (value.sourceContext === undefined || isSourceContext(value.sourceContext))
  );
}

function isProgram(value: unknown): value is Program {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.mediaType === 'program' &&
    typeof value.id === 'string' &&
    (value.providerId === 'netease' || value.providerId === 'qq') &&
    typeof value.platformProgramId === 'string' &&
    Boolean(value.platformProgramId) &&
    typeof value.title === 'string' &&
    Boolean(value.title) &&
    typeof value.description === 'string' &&
    typeof value.durationMs === 'number' &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0 &&
    typeof value.coverTone === 'string' &&
    Boolean(value.coverTone) &&
    (value.coverUrl === undefined || typeof value.coverUrl === 'string') &&
    (value.publishedAt === undefined || typeof value.publishedAt === 'string') &&
    isPodcast(value.podcast) &&
    isPodcastSourceContext(value.sourceContext)
  );
}

function isPodcast(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.providerId === 'netease' || value.providerId === 'qq')
    && typeof value.platformPodcastId === 'string'
    && Boolean(value.platformPodcastId)
    && typeof value.title === 'string'
    && Boolean(value.title)
    && typeof value.description === 'string'
    && typeof value.author === 'string'
    && typeof value.coverTone === 'string'
    && Boolean(value.coverTone)
    && (value.coverUrl === undefined || typeof value.coverUrl === 'string')
    && (value.sourceLabel === undefined || typeof value.sourceLabel === 'string');
}

function isArtistReference(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    (value.providerId === 'netease' || value.providerId === 'qq') &&
    typeof value.platformArtistId === 'string' &&
    typeof value.name === 'string';
}

function isAlbumReference(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    (value.providerId === 'netease' || value.providerId === 'qq') &&
    typeof value.platformAlbumId === 'string' &&
    typeof value.title === 'string';
}

function isNullableSong(value: unknown): value is Song | null {
  return value === null || isSong(value);
}

function isNullablePlayableMedia(value: unknown): value is PlayableMedia | null {
  return value === null || isSong(value) || isProgram(value);
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.mediaId === 'string' &&
    (value.mediaType === 'song' || value.mediaType === 'program') &&
    (value.songId === undefined || typeof value.songId === 'string') &&
    (value.mediaType !== 'song' || value.songId === value.mediaId) &&
    (value.mediaType !== 'program' || value.songId === undefined) &&
    isQueueItemSource(value.source) &&
    (value.sourceContext === undefined || isSourceContext(value.sourceContext)) &&
    (value.mediaType !== 'program' || (
      value.source === 'podcast' && isPodcastSourceContext(value.sourceContext)
    )) &&
    (value.source !== 'radio' || isRadioSourceContext(value.sourceContext))
  );
}

function isLegacyQueueItem(value: unknown): value is Omit<QueueItem, 'mediaId' | 'mediaType'> & { songId: string } {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.songId === 'string' &&
    isQueueItemSource(value.source) &&
    (value.sourceContext === undefined || isSourceContext(value.sourceContext)) &&
    (value.source !== 'radio' || isRadioSourceContext(value.sourceContext))
  );
}

function isSongRecord(value: unknown): value is Record<string, Song> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isSong);
}

function isPlayableMediaRecord(value: unknown): value is Record<string, PlayableMedia> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((media) => isSong(media) || isProgram(media));
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(volume)));
}

function normalizePlaybackMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

function clampPlaybackPositionMs(positionMs: number, durationMs: number): number {
  const normalizedPosition = normalizePlaybackMs(positionMs);
  if (durationMs <= 0) {
    return normalizedPosition;
  }

  return Math.min(normalizedPosition, durationMs);
}
