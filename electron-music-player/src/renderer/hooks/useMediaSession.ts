import { useEffect } from 'react';
import type { PlayableMedia } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';

const fallbackArtworkUrl = new URL('../../../assets/branding/obao-logo.png', import.meta.url).href;
const mediaSessionActions: MediaSessionAction[] = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekto'
];

export function useMediaSession() {
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentPlayableMedia = currentMedia ?? currentSong;
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playbackPositionMs = usePlayerStore((state) => state.playbackPositionMs);
  const playbackDurationMs = usePlayerStore((state) => state.playbackDurationMs);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) {
      return undefined;
    }

    const handlers: Record<MediaSessionAction, MediaSessionActionHandler | null> = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      previoustrack: () => usePlayerStore.getState().playPrevious(),
      nexttrack: () => usePlayerStore.getState().playNext(),
      seekto: ({ seekTime }) => {
        if (typeof seekTime !== 'number' || !Number.isFinite(seekTime)) {
          return;
        }

        const player = usePlayerStore.getState();
        player.seekPlayback(seekTime * 1000, player.playbackDurationMs);
      },
      seekbackward: null,
      seekforward: null,
      skipad: null,
      stop: null
    };
    const registeredActions = mediaSessionActions.filter((action) => (
      setActionHandler(mediaSession, action, handlers[action])
    ));

    return () => {
      registeredActions.forEach((action) => setActionHandler(mediaSession, action, null));
      mediaSession.metadata = null;
      mediaSession.playbackState = 'none';
      clearPositionState(mediaSession);
    };
  }, []);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) {
      return;
    }

    mediaSession.metadata = currentPlayableMedia ? createMediaMetadata(currentPlayableMedia) : null;
  }, [currentPlayableMedia]);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) {
      return;
    }

    mediaSession.playbackState = currentPlayableMedia ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [currentPlayableMedia, isPlaying]);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession || !currentPlayableMedia) {
      if (mediaSession) {
        clearPositionState(mediaSession);
      }
      return;
    }

    const duration = playbackDurationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) {
      clearPositionState(mediaSession);
      return;
    }

    const position = Math.min(Math.max(playbackPositionMs / 1000, 0), duration);
    setPositionState(mediaSession, {
      duration,
      playbackRate: 1,
      position
    });
  }, [currentPlayableMedia, playbackDurationMs, playbackPositionMs]);
}

function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }

  return navigator.mediaSession;
}

function createMediaMetadata(media: PlayableMedia): MediaMetadata {
  const artworkUrl = media.coverUrl?.trim() || fallbackArtworkUrl;
  const artist = media.mediaType === 'program' ? media.podcast.author : media.artist;
  const album = media.mediaType === 'program' ? media.podcast.title : media.album;

  return new MediaMetadata({
    title: media.title,
    artist,
    album,
    artwork: [{ src: artworkUrl }]
  });
}

function setPlaying(playing: boolean) {
  const player = usePlayerStore.getState();
  if (player.isPlaying !== playing) {
    player.togglePlaying();
  }
}

function setActionHandler(
  mediaSession: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
): boolean {
  try {
    mediaSession.setActionHandler(action, handler);
    return true;
  } catch {
    return false;
  }
}

function setPositionState(mediaSession: MediaSession, state: MediaPositionState) {
  try {
    mediaSession.setPositionState(state);
  } catch {
    // The platform may reject position updates before a media session becomes active.
  }
}

function clearPositionState(mediaSession: MediaSession) {
  try {
    mediaSession.setPositionState();
  } catch {
    // Older platform implementations may not support clearing position state.
  }
}
