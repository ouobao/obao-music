import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../../shared/musicTypes';
import { usePlayerStore, songKey } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { useNotificationStore } from '../state/notificationStore';
import { useSongContextMenu } from '../hooks/useSongContextMenu';
import { PopoverMenu } from './PopoverMenu';
import { formatDuration } from '../utils/format';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';
import { toThumbnailUrl } from '../utils/remoteCover';

export function SimilarSongsPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isOpen = useUiStore((s) => s.isSimilarOpen);
  const setSimilarOpen = useUiStore((s) => s.setSimilarOpen);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const revisionRef = useRef(0);
  const lastSeedRef = useRef<string | null>(null);

  const loadSimilar = useCallback(async () => {
    const song = currentSong;
    if (!song || song.providerId !== 'netease') {
      revisionRef.current += 1;
      setSongs([]);
      setIsLoading(false);
      return;
    }

    const revision = ++revisionRef.current;
    setIsLoading(true);
    try {
      const result = await window.musicPlayer.music.getSimilarSongs(song.providerId, song);
      if (revision !== revisionRef.current) return;
      if (result.ok) {
        setSongs(result.data);
      } else {
        useNotificationStore.getState().showNotification({
          key: 'similar-fail',
          message: result.error.message,
          tone: 'warning'
        });
      }
    } catch (error) {
      if (revision === revisionRef.current) {
        useNotificationStore.getState().showNotification({
          key: 'similar-fail',
          message: error instanceof Error ? error.message : String(error),
          tone: 'warning'
        });
      }
    } finally {
      if (revision === revisionRef.current) setIsLoading(false);
    }
  }, [currentSong]);

  useEffect(() => {
    if (!isOpen) {
      revisionRef.current += 1;
      lastSeedRef.current = null;
      setIsLoading(false);
      return;
    }

    const seedKey = currentSong ? songKey(currentSong) : null;
    if (currentSong?.providerId === 'netease' && lastSeedRef.current !== seedKey) {
      lastSeedRef.current = seedKey;
      void loadSimilar();
    } else if (!currentSong || currentSong.providerId !== 'netease') {
      lastSeedRef.current = seedKey;
      revisionRef.current += 1;
      setSongs([]);
      setIsLoading(false);
    }
  }, [isOpen, currentSong, loadSimilar]);

  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const enqueueSong = usePlayerStore((s) => s.enqueueSong);
  const enqueueNextSong = usePlayerStore((s) => s.enqueueNextSong);

  const handlePlay = (song: Song) => {
    const rest = songs.filter((candidate) => candidate.id !== song.id || candidate.providerId !== song.providerId);
    playSongsFromList([...rest, song], rest.length);
  };

  return (
    <>
      <div className={`drawer-overlay ${isOpen ? 'active' : ''}`} onClick={() => setSimilarOpen(false)} />
      <div className={`drawer-panel ${isOpen ? 'open' : ''}`} data-drawer-panel="similar">
        <div className="drawer-header">
          <h3 className="drawer-title">相似歌曲推荐</h3>
          <button className="section-action-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={loadSimilar}>
            换一批
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          {currentSong ? `基于当前收听《${currentSong.title}》智能生成` : '暂无可推荐内容'}
        </div>
        <div className="queue-song-list">
          {isLoading && songs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)' }}>加载中...</div>
          )}
          {!isLoading && songs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
              暂无相似歌曲推荐
            </div>
          )}
          {songs.map((song) => (
            <SimilarSongItem
              key={`${song.providerId}:${song.id}`}
              song={song}
              songs={songs}
              onPlay={() => handlePlay(song)}
              onPlayNext={() => enqueueNextSong(song, 'recommendation')}
              onEnqueue={() => enqueueSong(song, 'recommendation')}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SimilarSongItem({
  song,
  songs,
  onPlay,
  onPlayNext,
  onEnqueue
}: {
  song: Song;
  songs: Song[];
  onPlay: () => void;
  onPlayNext: () => void;
  onEnqueue: () => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cursorAnchored: boolean } | null>(null);
  const { menuItems } = useSongContextMenu(song, {
    source: 'recommendation',
    origin: { kind: 'recommendation', providerId: song.providerId },
    onPlayNow: onPlay,
    onPlayNext,
    onEnqueue
  });

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.popover-menu')) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  return (
    <div
      className="queue-song-item"
      onClick={onPlay}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, cursorAnchored: true });
      }}
    >
      {song.coverUrl ? (
        <img className="queue-song-cover" ref={imageRevealRef} src={toThumbnailUrl(song.coverUrl)} alt="" loading="lazy" onLoad={onImageReveal} onError={onImageReveal} />
      ) : (
        <div className="queue-song-cover" style={{ background: song.coverTone || 'var(--bg-card)' }} />
      )}
      <div className="queue-song-meta">
        <div className="queue-song-title">{song.title}</div>
        <div className="queue-song-artist">{song.artist}</div>
      </div>
      <span className="queue-song-time">{formatDuration(song.durationMs)}</span>
      {contextMenu && (
        <PopoverMenu
          open={Boolean(contextMenu)}
          onClose={() => setContextMenu(null)}
          fixedPosition={contextMenu}
          cursorAnchored={contextMenu.cursorAnchored}
          position="bottom"
          align="right"
          style={{ width: 190 }}
          ariaLabel="相似歌曲操作"
          items={menuItems}
        />
      )}
    </div>
  );
}