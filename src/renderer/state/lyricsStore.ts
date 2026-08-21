import { create } from 'zustand';
import type { Song } from '../../shared/musicTypes';
import { validateLyricsInput } from '../lyrics/lyricsTimeline';

interface LyricsState {
  songId: string | null;
  songKey: string | null;
  lrc: string | null;
  tlyric: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  loadLyrics: (song: Song) => Promise<string | null>;
  resetForTest: () => void;
}

interface LyricsRequestSuccess {
  ok: true;
  lrc: string;
  tlyric: string | null;
}

interface LyricsRequestFailure {
  ok: false;
  errorMessage: string;
}

type LyricsRequestOutcome = LyricsRequestSuccess | LyricsRequestFailure;

const initialState = {
  songId: null,
  songKey: null,
  lrc: null,
  tlyric: null,
  isLoading: false,
  errorMessage: null
};

const pendingLyricsRequests = new Map<string, Promise<LyricsRequestOutcome>>();
let lyricsRequestRevision = 0;
let latestLyricsRequestRevision = 0;

export function createLyricsRequestKey(song: Song) {
  return JSON.stringify([song.providerId, song.id, song.platformSongId ?? null]);
}

export const useLyricsStore = create<LyricsState>((set, get) => {
  const loadLyrics: LyricsState['loadLyrics'] = async (song) => {
    const songKey = createLyricsRequestKey(song);
    const requestRevision = ++lyricsRequestRevision;
    latestLyricsRequestRevision = requestRevision;
    const currentState = get();

    if (currentState.songKey === songKey && currentState.lrc && !currentState.isLoading) {
      return currentState.lrc;
    }

    const ownsRetainedLyrics = currentState.songKey === songKey;
    set({
      songId: song.id,
      songKey,
      lrc: ownsRetainedLyrics ? currentState.lrc : null,
      tlyric: ownsRetainedLyrics ? currentState.tlyric : null,
      isLoading: true,
      errorMessage: null
    });

    const outcome = await getOrCreateLyricsRequest(songKey, song);
    if (latestLyricsRequestRevision !== requestRevision || get().songKey !== songKey) {
      return null;
    }

    if (outcome.ok) {
      set({
        songId: song.id,
        songKey,
        lrc: outcome.lrc,
        tlyric: outcome.tlyric,
        isLoading: false,
        errorMessage: null
      });
      return outcome.lrc;
    }

    set({
      songId: song.id,
      songKey,
      lrc: null,
      tlyric: null,
      isLoading: false,
      errorMessage: outcome.errorMessage
    });
    return null;
  };

  const resetForTest: LyricsState['resetForTest'] = () => {
    latestLyricsRequestRevision = ++lyricsRequestRevision;
    pendingLyricsRequests.clear();
    set({ ...initialState, loadLyrics, resetForTest });
  };

  return { ...initialState, loadLyrics, resetForTest };
});

function getOrCreateLyricsRequest(songKey: string, song: Song) {
  const pendingRequest = pendingLyricsRequests.get(songKey);
  if (pendingRequest) return pendingRequest;

  const request = requestLyrics(song);
  pendingLyricsRequests.set(songKey, request);
  void request.then(() => {
    if (pendingLyricsRequests.get(songKey) === request) {
      pendingLyricsRequests.delete(songKey);
    }
  });
  return request;
}

async function requestLyrics(song: Song): Promise<LyricsRequestOutcome> {
  const musicApi = typeof window === 'undefined' ? undefined : window.musicPlayer?.music;
  if (!musicApi?.getLyrics) {
    return { ok: false, errorMessage: '歌词服务不可用' };
  }

  try {
    const result: unknown = await musicApi.getLyrics(song.providerId, song);
    return decodeLyricsResult(result, song);
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : '歌词加载失败'
    };
  }
}

function decodeLyricsResult(result: unknown, song: Song): LyricsRequestOutcome {
  if (!isRecord(result)) return invalidLyricsResponse();

  if (result.ok === false) {
    return {
      ok: false,
      errorMessage: readNonEmptyString(isRecord(result.error) ? result.error.message : null) ?? '歌词加载失败'
    };
  }

  if (result.ok !== true || !isRecord(result.data)) return invalidLyricsResponse();

  const data = result.data;
  if (data.providerId !== song.providerId || typeof data.ok !== 'boolean') return invalidLyricsResponse();

  if (!data.ok) {
    return {
      ok: false,
      errorMessage: readNonEmptyString(isRecord(data.reason) ? data.reason.message : null) ?? '当前歌曲暂无歌词'
    };
  }

  const lrc = readNonEmptyString(data.lrc);
  if (!lrc) return invalidLyricsResponse();

  const lrcError = validateLyricsInput(lrc);
  if (lrcError) return { ok: false, errorMessage: lrcError };

  const tlyric = readNonEmptyString(data.tlyric);
  const tlyricError = tlyric ? validateLyricsInput(tlyric) : null;
  if (tlyricError) return { ok: false, errorMessage: tlyricError };

  return { ok: true, lrc, tlyric };
}

function invalidLyricsResponse(): LyricsRequestFailure {
  return { ok: false, errorMessage: '歌词数据格式无效' };
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
