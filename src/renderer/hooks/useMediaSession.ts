import { useEffect } from 'react';
import { usePlayerStore } from '../state/playerStore';

export function useMediaSession() {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const player = usePlayerStore.getState();

    const handlers = {
      play: () => usePlayerStore.getState().togglePlaying(),
      pause: () => usePlayerStore.getState().togglePlaying(),
      previoustrack: () => usePlayerStore.getState().playPrevious(),
      nexttrack: () => usePlayerStore.getState().playNext(),
      seekto: (details: MediaSessionActionDetails) => {
        if (details.seekTime != null) {
          usePlayerStore.getState().seekPlayback(details.seekTime * 1000);
        }
      }
    };

    const register = () => {
      try {
        navigator.mediaSession.setActionHandler('play', handlers.play);
        navigator.mediaSession.setActionHandler('pause', handlers.pause);
        navigator.mediaSession.setActionHandler('previoustrack', handlers.previoustrack);
        navigator.mediaSession.setActionHandler('nexttrack', handlers.nexttrack);
        navigator.mediaSession.setActionHandler('seekto', handlers.seekto);
      } catch {
        // MediaSession API 部分浏览器不支持 setPositionState
      }
    };

    register();

    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      const song = state.currentSong;
      const isPlaying = state.isPlaying;

      if (song && (song.id !== prev.currentSong?.id || isPlaying !== prev.isPlaying)) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: song.album,
            artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: '512x512' }] : []
          });
          navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
          if (state.playbackDurationMs > 0) {
            navigator.mediaSession.setPositionState?.({
              duration: state.playbackDurationMs / 1000,
              position: state.playbackPositionMs / 1000,
              playbackRate: 1
            });
          }
        } catch {
          // ignore
        }
      } else if (isPlaying !== prev.isPlaying && song) {
        try {
          navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        } catch {
          // ignore
        }
      }
    });

    return () => {
      unsubscribe();
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        // ignore
      }
    };
  }, []);
}
