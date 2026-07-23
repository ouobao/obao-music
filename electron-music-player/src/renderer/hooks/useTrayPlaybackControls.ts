import { useEffect } from 'react';
import type { TrayPlaybackAction } from '../../shared/global';
import { usePlayerStore } from '../state/playerStore';

export function useTrayPlaybackControls() {
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentPlayableMedia = currentMedia ?? currentSong;
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  useEffect(() => {
    const trayApi = window.musicPlayer?.tray;
    if (!trayApi) {
      return undefined;
    }

    return trayApi.onPlaybackAction(handleTrayPlaybackAction);
  }, []);

  useEffect(() => {
    window.musicPlayer?.tray?.updatePlaybackState({
      title: currentPlayableMedia?.title ?? '',
      artist: currentPlayableMedia?.mediaType === 'program'
        ? currentPlayableMedia.podcast.author
        : currentPlayableMedia?.artist ?? '',
      hasSong: Boolean(currentPlayableMedia),
      isPlaying: Boolean(currentPlayableMedia && isPlaying)
    });
  }, [currentPlayableMedia, isPlaying]);
}

function handleTrayPlaybackAction(action: TrayPlaybackAction) {
  const player = usePlayerStore.getState();

  switch (action) {
    case 'previous':
      player.playPrevious();
      break;
    case 'toggle':
      player.togglePlaying();
      break;
    case 'next':
      player.playNext();
      break;
  }
}
