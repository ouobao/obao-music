import { useState } from 'react';
import type { Song } from '../../shared/musicTypes';
import type { PopoverMenuItem } from '../components/PopoverMenu';
import { AddToListIcon, HeartIcon, PlayIcon, RemoveIcon, SkipForwardIcon } from '../components/icons';
import type { SongOrigin } from '../components/SongTable';
import { useLibraryStore } from '../state/libraryStore';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';
import { useNotificationStore } from '../state/notificationStore';
import { useSongRemoteActions } from './useSongRemoteActions';

export interface UseSongContextMenuOptions {
  source: string;
  origin?: SongOrigin;
  onPlayNow?: () => void;
  onPlayNext?: () => void;
  onEnqueue?: () => void;
  onRemoveFromQueue?: () => void;
}

export function useSongContextMenu(song: Song, options: UseSongContextMenuOptions) {
  const { liked, pendingAction, toggleLiked } = useSongRemoteActions(song);
  const providerPlaylists = useLibraryStore((s) => s.providerPlaylists[song.providerId] ?? []);
  const addSongToPlaylist = useLibraryStore((s) => s.addSongToPlaylist);
  const removeSongFromPlaylist = useLibraryStore((s) => s.removeSongFromPlaylist);
  const removeHistoryEntry = useListeningHistoryStore((s) => s.removeEntry);
  const [playlistPending, setPlaylistPending] = useState<string | null>(null);

  const isRemote = song.providerId !== 'local';
  const isLikedPlaylistOrigin = options.origin?.kind === 'playlist' && options.origin.ownership === 'liked';

  const addToPlaylist = async (playlistId: string) => {
    setPlaylistPending(playlistId);
    try {
      const result = await addSongToPlaylist(song.providerId, song, playlistId);
      useNotificationStore.getState().showNotification({
        key: `playlist-added-${song.id}`,
        message: result.ok ? '已添加到歌单' : (result.message ?? '添加失败'),
        tone: result.ok ? 'success' : 'error'
      });
    } finally {
      setPlaylistPending(null);
    }
  };

  const removeFromPlaylist = async () => {
    if (options.origin?.kind !== 'playlist' || options.origin.playlistId === undefined) return;
    setPlaylistPending(options.origin.playlistId);
    try {
      const result = await removeSongFromPlaylist(song.providerId, song, options.origin.playlistId);
      useNotificationStore.getState().showNotification({
        key: `playlist-removed-${song.id}`,
        message: result.ok ? '已从歌单移除' : (result.message ?? '移除失败'),
        tone: result.ok ? 'success' : 'error'
      });
    } finally {
      setPlaylistPending(null);
    }
  };

  const removeFromHistory = () => {
    removeHistoryEntry(song.providerId, song.id);
    useNotificationStore.getState().showNotification({
      key: `history-removed-${song.id}`,
      message: '已从最近播放移除',
      tone: 'success'
    });
  };

  const writablePlaylists = providerPlaylists.filter((p) => p.ownership === 'created');
  const playlistSubmenuItems: PopoverMenuItem[] =
    writablePlaylists.length === 0
      ? [{ key: 'none', label: '暂无可用歌单', disabled: true }]
      : writablePlaylists.map((playlist) => ({
          key: playlist.id,
          icon: (
            <span className="popover-menu-playlist-cover">
              {playlist.coverUrl ? (
                <img src={playlist.coverUrl} alt="" loading="lazy" />
              ) : (
                <span style={{ background: playlist.coverTone || 'var(--accent-gradient)' }} />
              )}
            </span>
          ),
          label: playlist.title,
          disabled: playlistPending === playlist.id || (options.origin?.kind === 'playlist' && options.origin.playlistId === playlist.id),
          onSelect: () => {
            void addToPlaylist(playlist.id);
          }
        }));

  const menuItems: PopoverMenuItem[] = [
    ...(options.onPlayNow
      ? [{ key: 'play-now', label: '立即播放', icon: <PlayIcon size={13} strokeWidth={2} filled />, onSelect: options.onPlayNow }]
      : []),
    ...(options.onPlayNext
      ? [{ key: 'play-next', label: '下一首播放', icon: <SkipForwardIcon size={13} strokeWidth={2} />, onSelect: options.onPlayNext }]
      : []),
    ...(options.onEnqueue
      ? [{ key: 'enqueue', label: '添加到播放队列', icon: <AddToListIcon size={13} strokeWidth={2} />, onSelect: options.onEnqueue }]
      : []),
    ...(options.onRemoveFromQueue
      ? [{ key: 'remove-queue', label: '从队列移除', icon: <RemoveIcon size={13} strokeWidth={2} />, onSelect: options.onRemoveFromQueue }]
      : []),
    { key: 'divider-1', divider: true },
    ...(isRemote
      ? [
          {
            key: 'like',
            label: liked ? '取消喜欢' : '喜欢',
            icon: <HeartIcon size={13} strokeWidth={2} filled={liked} className={liked ? 'menu-icon-accent' : undefined} />,
            onSelect: () => {
              void toggleLiked();
            }
          } as PopoverMenuItem,
          ...(writablePlaylists.length > 0 || (options.origin?.kind === 'playlist' && options.origin.playlistId !== undefined)
            ? [
                {
                  key: 'add-to-playlist',
                  label: '添加到歌单',
                  icon: <AddToListIcon size={13} strokeWidth={2} />,
                  children: playlistSubmenuItems
                } as PopoverMenuItem
              ]
            : [])
        ]
      : []),
    ...(options.origin?.kind === 'history'
      ? [{ key: 'remove-history', label: '从最近播放移除', icon: <RemoveIcon size={13} strokeWidth={2} />, onSelect: removeFromHistory } as PopoverMenuItem]
      : []),
    ...(options.origin?.kind === 'playlist' && options.origin.ownership === 'created'
      ? [{ key: 'remove-playlist', label: '从此歌单移除', icon: <RemoveIcon size={13} strokeWidth={2} />, onSelect: () => void removeFromPlaylist() } as PopoverMenuItem]
      : []),
    ...(options.origin?.kind === 'playlist' && isLikedPlaylistOrigin
      ? [{ key: 'unlike-playlist', label: '取消喜欢', icon: <HeartIcon size={13} strokeWidth={2} filled />, onSelect: () => void toggleLiked() } as PopoverMenuItem]
      : [])
  ];

  return { menuItems, liked, pendingAction, toggleLiked };
}
