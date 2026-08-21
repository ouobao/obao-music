import { useEffect } from 'react';
import { usePlayerStore } from '../state/playerStore';

export function useTrayPlaybackControls() {
  useEffect(() => {
    const tray = window.musicPlayer.tray;
    if (!tray) return;

    const unsubscribe = tray.onPlaybackAction((action) => {
      const player = usePlayerStore.getState();
      if (action === 'previous') player.playPrevious();
      else if (action === 'next') player.playNext();
      else if (action === 'toggle') player.togglePlaying();
    });

    const pushState = (state: { currentSong: { title: string; artist: string } | null; isPlaying: boolean }) => {
      tray.updatePlaybackState({
        title: state.currentSong?.title ?? '',
        artist: state.currentSong?.artist ?? '',
        hasSong: Boolean(state.currentSong),
        isPlaying: state.isPlaying
      });
    };

    const unsubscribeStore = usePlayerStore.subscribe((state) => {
      pushState(state);
    });

    pushState(usePlayerStore.getState());

    return () => {
      unsubscribe();
      unsubscribeStore();
    };
  }, []);
}
