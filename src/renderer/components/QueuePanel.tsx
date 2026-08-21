import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { formatDuration } from '../utils/format';
import { sourceLabel } from '../utils/providerDisplay';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';
import { useSongContextMenu } from '../hooks/useSongContextMenu';
import { PopoverMenu } from './PopoverMenu';
import { CloseIcon, HeartIcon } from './icons';

const QUEUE_CHUNK_SIZE = 100;

function QueueSongItem({
  item,
  song,
  isCurrent
}: {
  item: ReturnType<typeof usePlayerStore.getState>['queue'][number];
  song: ReturnType<typeof usePlayerStore.getState>['queueSongs'][string];
  isCurrent: boolean;
}) {
  const selectQueueItem = usePlayerStore((s) => s.selectQueueItem);
  const removeQueueItem = usePlayerStore((s) => s.removeQueueItem);
  const enqueueNextSong = usePlayerStore((s) => s.enqueueNextSong);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cursorAnchored: boolean } | null>(null);

  const { menuItems, liked, pendingAction, toggleLiked } = useSongContextMenu(song, {
    source: item.source,
    onPlayNow: () => selectQueueItem(item.id),
    onPlayNext: () => enqueueNextSong(song, item.source),
    onRemoveFromQueue: () => removeQueueItem(item.id)
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
      className={`queue-song-item ${isCurrent ? 'playing' : ''}`}
      onClick={() => selectQueueItem(item.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, cursorAnchored: true });
      }}
      title={sourceLabel(item.source, song.providerId)}
    >
      {song.coverUrl ? (
        <img className="queue-song-cover" ref={imageRevealRef} src={song.coverUrl} alt="" loading="lazy" onLoad={onImageReveal} onError={onImageReveal} />
      ) : (
        <div className="queue-song-cover" style={{ background: song.coverTone || 'var(--bg-card)' }} />
      )}
      <div className="queue-song-meta">
        <div className="queue-song-title">
          {isCurrent && <span style={{ color: 'var(--accent-primary)', marginRight: 6 }}>♪</span>}
          {song.title}
        </div>
        <div className="queue-song-artist">
          {song.artist} · {sourceLabel(item.source, song.providerId)}
        </div>
      </div>
      <span className="queue-song-time">{formatDuration(song.durationMs)}</span>
      {song.providerId !== 'local' && (
        <button
          className={`queue-song-like ${liked ? 'liked' : ''}`}
          title={liked ? '取消喜欢' : '喜欢'}
          aria-label={liked ? '取消喜欢' : '喜欢'}
          disabled={pendingAction === 'like'}
          onClick={(e) => {
            e.stopPropagation();
            toggleLiked();
          }}
        >
          {pendingAction === 'like' ? (
            <span className="mini-spinner" aria-hidden="true" />
          ) : (
            <HeartIcon size={13} strokeWidth={2} filled={liked} />
          )}
        </button>
      )}
      <button
        style={{ color: 'var(--text-muted)', padding: 4 }}
        title="移除"
        aria-label="移除该歌曲"
        onClick={(e) => {
          e.stopPropagation();
          removeQueueItem(item.id);
        }}
      >
        <CloseIcon size={12} strokeWidth={2} />
      </button>
      {contextMenu && (
        <PopoverMenu
          open={Boolean(contextMenu)}
          onClose={() => setContextMenu(null)}
          fixedPosition={contextMenu}
          cursorAnchored={contextMenu.cursorAnchored}
          position="bottom"
          align="right"
          style={{ width: 190 }}
          ariaLabel="队列歌曲操作"
          items={menuItems}
        />
      )}
    </div>
  );
}

export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue);
  const queueSongs = usePlayerStore((s) => s.queueSongs);
  const currentQueueItemId = usePlayerStore((s) => s.currentQueueItemId);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const isQueueOpen = useUiStore((s) => s.isQueueOpen);
  const setQueueOpen = useUiStore((s) => s.setQueueOpen);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);

  // 队列大列表增量渲染
  const [renderCount, setRenderCount] = useState(QUEUE_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenderCount(Math.min(QUEUE_CHUNK_SIZE, queue.length));
  }, [queue.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const list = el.closest<HTMLElement>('.queue-song-list');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setRenderCount((count) => Math.min(queue.length, count + QUEUE_CHUNK_SIZE));
      },
      { root: list ?? null, rootMargin: '500px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const visibleQueue = renderCount >= queue.length ? queue : queue.slice(0, renderCount);

  return (
    <>
      <div
        className={`drawer-overlay ${isQueueOpen ? 'active' : ''} ${isLyricsOpen ? 'over-lyrics' : ''}`}
        onClick={() => setQueueOpen(false)}
      />
      <div className={`drawer-panel ${isQueueOpen ? 'open' : ''} ${isLyricsOpen ? 'over-lyrics' : ''}`} data-drawer-panel="queue">
        <div className="drawer-header">
          <h3 className="drawer-title">播放队列 ({queue.length})</h3>
          {queue.length > 0 && (
            <button className="section-action-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={clearQueue}>
              清空
            </button>
          )}
        </div>
        <div className="queue-song-list">
          {queue.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
              队列为空，播放歌曲后会自动加入
            </div>
          )}
          {visibleQueue.map((item) => {
            const song = queueSongs[item.mediaId];
            if (!song) return null;
            const isCurrent = item.id === currentQueueItemId;
            return (
              <QueueSongItem
                key={item.id}
                item={item}
                song={song}
                isCurrent={isCurrent}
              />
            );
          })}
          {renderCount < queue.length && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
        </div>
      </div>
    </>
  );
}
