import { memo, type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { useMediaSession } from '../hooks/useMediaSession';
import { useTrayPlaybackControls } from '../hooks/useTrayPlaybackControls';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';
import { usePlayerStore } from '../state/playerStore';

const isTestRuntime = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');

interface AudioEngineProps {
  mediaRef?: MutableRefObject<HTMLAudioElement | null>;
}

export const AudioEngine = memo(function AudioEngine({ mediaRef }: AudioEngineProps) {
  useMediaSession();
  useTrayPlaybackControls();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialSeekUrlRef = useRef<string | null>(null);
  const naturalPlaybackRef = useRef({
    queueItemId: null as string | null,
    lastPositionMs: null as number | null,
    listenedMs: 0,
    recorded: false,
    seekRevision: 0
  });
  const currentQueueItemId = usePlayerStore((state) => state.currentQueueItemId);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentPlaybackUrl = usePlayerStore((state) => state.currentPlaybackUrl);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playbackPositionMs = usePlayerStore((state) => state.playbackPositionMs);
  const playbackSeekRevision = usePlayerStore((state) => state.playbackSeekRevision);
  const appliedSeekRevisionRef = useRef(playbackSeekRevision);
  const volume = usePlayerStore((state) => state.volume);
  const setPlaybackError = usePlayerStore((state) => state.setPlaybackError);
  const setPlaybackProgress = usePlayerStore((state) => state.setPlaybackProgress);
  const handlePlaybackEnded = usePlayerStore((state) => state.handlePlaybackEnded);
  const recordQualifiedListen = useListeningHistoryStore((state) => state.recordQualifiedListen);
  const setAudioRef = useCallback((audio: HTMLAudioElement | null) => {
    audioRef.current = audio;
    if (mediaRef) {
      mediaRef.current = audio;
    }
  }, [mediaRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentPlaybackUrl) {
      initialSeekUrlRef.current = null;
      if (audio.getAttribute('src')) {
        audio.pause();
        audio.removeAttribute('src');
        loadAudio(audio);
      }
      return;
    }

    if (audio.src !== currentPlaybackUrl) {
      initialSeekUrlRef.current = null;
      audio.src = currentPlaybackUrl;
      loadAudio(audio);
    }
  }, [currentPlaybackUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentPlaybackUrl) {
      return;
    }

    if (isPlaying) {
      try {
        const playResult = audio.play();
        void playResult?.catch((error) => {
          if (isInterruptedPlayError(error)) {
            return;
          }

          setPlaybackError(formatAudioErrorMessage(error), currentPlaybackUrl);
        });
      } catch (error) {
        if (isInterruptedPlayError(error)) {
          return;
        }

        setPlaybackError(formatAudioErrorMessage(error), currentPlaybackUrl);
      }
      return;
    }

    audio.pause();
  }, [currentPlaybackUrl, isPlaying, setPlaybackError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentPlaybackUrl) {
      return;
    }

    if (appliedSeekRevisionRef.current === playbackSeekRevision) {
      return;
    }

    const targetSeconds = getClampedAudioPositionSeconds(audio, playbackPositionMs);
    if (trySetAudioPosition(audio, targetSeconds)) {
      appliedSeekRevisionRef.current = playbackSeekRevision;
    }
  }, [currentPlaybackUrl, playbackPositionMs, playbackSeekRevision]);

  return (
    <audio
      ref={setAudioRef}
      preload="none"
      onLoadedMetadata={syncPlaybackProgress}
      onDurationChange={syncPlaybackProgress}
      onTimeUpdate={syncPlaybackProgress}
      onEnded={handlePlaybackEnded}
      onError={handleAudioError}
    />
  );

  function handleAudioError() {
    const audio = audioRef.current;
    if (!audio || !currentPlaybackUrl || !isCurrentAudioSource(audio, currentPlaybackUrl)) {
      return;
    }

    setPlaybackError('音频源不可播放，请重试或切换音质', currentPlaybackUrl);
  }

  function syncPlaybackProgress() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    applyInitialSeek(audio);
    const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined;
    trackNaturalPlayback(audio.currentTime * 1000, durationMs);
    setPlaybackProgress(audio.currentTime * 1000, durationMs);
  }

  function trackNaturalPlayback(positionMs: number, durationMs?: number) {
    const tracker = naturalPlaybackRef.current;
    if (tracker.queueItemId !== currentQueueItemId) {
      tracker.queueItemId = currentQueueItemId;
      tracker.lastPositionMs = positionMs;
      tracker.listenedMs = 0;
      tracker.recorded = false;
      tracker.seekRevision = playbackSeekRevision;
      return;
    }
    if (tracker.seekRevision !== playbackSeekRevision) {
      tracker.lastPositionMs = positionMs;
      tracker.seekRevision = playbackSeekRevision;
      return;
    }

    const previousPositionMs = tracker.lastPositionMs;
    tracker.lastPositionMs = positionMs;
    if (!isPlaying || !currentSong || !currentQueueItemId || previousPositionMs === null || tracker.recorded) {
      return;
    }

    const deltaMs = positionMs - previousPositionMs;
    if (deltaMs <= 0 || deltaMs > 5_000) {
      return;
    }

    tracker.listenedMs += deltaMs;
    const knownDurationMs = durationMs && durationMs > 0 ? durationMs : currentSong.durationMs;
    const thresholdMs = knownDurationMs > 0 ? Math.min(30_000, knownDurationMs * 0.5) : 30_000;
    if (tracker.listenedMs >= thresholdMs) {
      tracker.recorded = true;
      recordQualifiedListen(currentSong);
    }
  }

  function applyInitialSeek(audio: HTMLAudioElement) {
    if (!currentPlaybackUrl || initialSeekUrlRef.current === currentPlaybackUrl) {
      return;
    }

    if (playbackPositionMs <= 0) {
      initialSeekUrlRef.current = currentPlaybackUrl;
      return;
    }

    const durationSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const targetSeconds = durationSeconds > 0
      ? Math.min(playbackPositionMs / 1000, durationSeconds)
      : playbackPositionMs / 1000;
    if (trySetAudioPosition(audio, targetSeconds)) {
      initialSeekUrlRef.current = currentPlaybackUrl;
    }
  }
});

function loadAudio(audio: HTMLAudioElement) {
  if (isTestRuntime) {
    return;
  }

  try {
    audio.load();
  } catch {
    // Native media loading errors are reported through onError/play rejection.
  }
}

function getClampedAudioPositionSeconds(audio: HTMLAudioElement, positionMs: number) {
  const targetSeconds = Math.max(0, positionMs / 1000);
  const durationSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;

  return durationSeconds > 0 ? Math.min(targetSeconds, durationSeconds) : targetSeconds;
}

function trySetAudioPosition(audio: HTMLAudioElement, positionSeconds: number) {
  try {
    audio.currentTime = positionSeconds;
    return true;
  } catch {
    return false;
  }
}

function isCurrentAudioSource(audio: HTMLAudioElement, expectedPlaybackUrl: string) {
  const expectedSource = normalizeAudioSourceUrl(expectedPlaybackUrl);
  const selectedSource = normalizeAudioSourceUrl(audio.currentSrc);
  const assignedSource = normalizeAudioSourceUrl(audio.src);

  return assignedSource === expectedSource && (!selectedSource || selectedSource === expectedSource);
}

function normalizeAudioSourceUrl(value: string) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, window.location.href).href;
  } catch {
    return value;
  }
}

function formatAudioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/no supported source|not supported|unsupported/i.test(message)) {
    return '音频源不可播放，请重试或切换音质';
  }

  return message || '音频播放失败';
}

function isInterruptedPlayError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';

  return name === 'AbortError' || /play\(\) request was interrupted|interrupted by a call to (pause|load)/i.test(message);
}
