import { useCallback, useEffect, useState } from 'react';
import type { Song } from '../../shared/musicTypes';
import { useLibraryStore } from '../state/libraryStore';
import { useNotificationStore } from '../state/notificationStore';

export function useSongRemoteActions(song: Song | null) {
  const [liked, setLiked] = useState(false);
  const [likedLoaded, setLikedLoaded] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const ensureLiked = useLibraryStore((s) => s.ensureLikedSongIds);
  const setSongLiked = useLibraryStore((s) => s.setSongLiked);
  const likedSongIds = useLibraryStore((s) => s.likedSongIds);

  useEffect(() => {
    setLikedLoaded(false);
    setLiked(false);
    if (!song) return;
    ensureLiked(song.providerId).then(() => setLikedLoaded(true));
  }, [song?.id, song?.providerId, ensureLiked]);

  useEffect(() => {
    if (song && likedLoaded) {
      setLiked(Boolean(likedSongIds[song.providerId]?.has(song.id)));
    }
  }, [song, likedSongIds, likedLoaded]);

  const toggleLiked = useCallback(async () => {
    if (!song) return;
    setPendingAction('like');
    const next = !liked;
    setLiked(next);
    try {
      await setSongLiked(song, next);
    } catch {
      setLiked(!next);
      useNotificationStore.getState().showNotification({
        key: 'like-fail',
        message: '收藏操作失败',
        tone: 'error'
      });
    }
    setPendingAction(null);
  }, [song, liked, setSongLiked]);

  return { liked, likedLoaded, pendingAction, toggleLiked };
}
