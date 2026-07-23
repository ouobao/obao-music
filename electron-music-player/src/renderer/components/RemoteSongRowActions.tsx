import { memo } from 'react';
import type { Playlist, Song } from '../../shared/musicTypes';
import { useSongRemoteActions } from '../hooks/useSongRemoteActions';
import { SongRowActions, type SongMenuPosition } from './SongRowActions';

interface RemoteSongRowActionsProps {
  song: Song;
  sourcePlaylist?: Playlist | null;
  canLike: boolean;
  ensureLikedStatus?: boolean;
  menuOpen: boolean;
  menuPosition: SongMenuPosition | null;
  onPlay: () => void;
  onPlayNext: () => void;
  onOpenMenu: (position: SongMenuPosition) => void;
  onCloseMenu: () => void;
  onNotice?: (message: string) => void;
}

export const RemoteSongRowActions = memo(function RemoteSongRowActions({
  song,
  sourcePlaylist = null,
  canLike,
  ensureLikedStatus = true,
  menuOpen,
  menuPosition,
  onPlay,
  onPlayNext,
  onOpenMenu,
  onCloseMenu,
  onNotice
}: RemoteSongRowActionsProps) {
  const remoteActions = useSongRemoteActions({ ensureLikedStatus, song, sourcePlaylist, onNotice });

  return (
    <SongRowActions
      song={song}
      canLike={canLike}
      isLiked={remoteActions.isLiked}
      isLikedStatusReady={remoteActions.isLikedStatusReady}
      menuOpen={menuOpen}
      menuPosition={menuPosition}
      addTargets={remoteActions.addTargets}
      canRemove={remoteActions.canRemove}
      pendingAction={remoteActions.pendingAction}
      onToggleLike={remoteActions.toggleLiked}
      onPlay={onPlay}
      onPlayNext={onPlayNext}
      onAddToPlaylist={remoteActions.addToPlaylist}
      onDelete={remoteActions.removeFromSource}
      onOpenMenu={onOpenMenu}
      onCloseMenu={onCloseMenu}
    />
  );
});
