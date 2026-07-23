import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Playlist, Song } from '../../shared/musicTypes';
import { useLibraryStore } from '../state/libraryStore';

export type SongRemotePendingAction = 'like' | 'add' | 'remove' | null;

const emptyPlaylists: Playlist[] = [];
const emptySongIds = new Set<string>();

interface UseSongRemoteActionsOptions {
  ensureLikedStatus?: boolean;
  song: Song;
  sourcePlaylist?: Playlist | null;
  onNotice?: (message: string) => void;
}

export function useSongRemoteActions({
  ensureLikedStatus = true,
  song,
  sourcePlaylist = null,
  onNotice
}: UseSongRemoteActionsOptions) {
  const {
    ensureLikedSongIds,
    setSongLiked,
    addSongToPlaylist,
    removeSongFromPlaylist,
    providerPlaylists,
    isLiked,
    isLikedStatusReady
  } = useLibraryStore(useShallow((state) => ({
    ensureLikedSongIds: state.ensureLikedSongIds,
    setSongLiked: state.setSongLiked,
    addSongToPlaylist: state.addSongToPlaylist,
    removeSongFromPlaylist: state.removeSongFromPlaylist,
    providerPlaylists: state.providerPlaylists[song.providerId] ?? emptyPlaylists,
    isLiked: (state.likedSongIdsByProvider[song.providerId] ?? emptySongIds).has(song.id),
    isLikedStatusReady: Boolean(state.likedSongIdsLoaded[song.providerId])
  })));
  const [pendingAction, setPendingAction] = useState<SongRemotePendingAction>(null);

  useEffect(() => {
    if (!ensureLikedStatus || isLikedStatusReady) {
      return;
    }

    void ensureLikedSongIds(song.providerId);
  }, [ensureLikedSongIds, ensureLikedStatus, isLikedStatusReady, song.providerId]);

  const addTargets = useMemo(
    () => providerPlaylists.filter((playlist) => playlist.providerId === song.providerId && playlist.ownership === 'created'),
    [providerPlaylists, song.providerId]
  );
  const canRemove = sourcePlaylist?.providerId === song.providerId && (sourcePlaylist.isLiked || sourcePlaylist.ownership === 'created');

  const run = useCallback(async (
    action: Exclude<SongRemotePendingAction, null>,
    execute: () => ReturnType<typeof setSongLiked>,
    successMessage: string
  ) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    try {
      const result = await execute();
      onNotice?.(result.ok ? successMessage : result.error.message);
    } finally {
      setPendingAction(null);
    }
  }, [onNotice, pendingAction, setSongLiked]);

  const toggleLiked = useCallback(async () => {
    if (!isLikedStatusReady) {
      return;
    }

    return run('like', () => setSongLiked(song, !isLiked), isLiked ? '已取消喜欢' : '已添加到我喜欢');
  }, [isLiked, isLikedStatusReady, run, setSongLiked, song]);

  const addToPlaylist = useCallback(async (playlist: Playlist) => {
    return run('add', () => addSongToPlaylist(song, playlist), `已添加到 ${playlist.title}`);
  }, [addSongToPlaylist, run, song]);

  const removeFromSource = useCallback(async () => {
    if (!sourcePlaylist) {
      return;
    }

    const successMessage = sourcePlaylist.isLiked ? '已取消喜欢' : `已从 ${sourcePlaylist.title} 移除`;
    return run('remove', () => removeSongFromPlaylist(song, sourcePlaylist), successMessage);
  }, [removeSongFromPlaylist, run, song, sourcePlaylist]);

  return {
    isLiked,
    isLikedStatusReady,
    addTargets,
    canRemove: Boolean(canRemove),
    pendingAction,
    toggleLiked,
    addToPlaylist,
    removeFromSource
  };
}
