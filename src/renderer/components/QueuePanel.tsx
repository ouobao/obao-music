import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { formatDuration } from '../utils/format';
import { sourceLabel } from '../utils/providerDisplay';
import { toThumbnailUrl } from '../utils/remoteCover';
import { useSongContextMenu } from '../hooks/useSongContextMenu';
import { useFixedVirtualWindow } from '../hooks/useFixedVirtualWindow';
import { PopoverMenu } from './PopoverMenu';
import { CoverImage } from './CoverImage';
import { CloseIcon, HeartIcon } from './icons';

/** 固定行高：32px 内容 + 8px*2 padding + 4px 列表间距 */
const QUEUE_ITEM_SIZE = 56;
/** 超过该数量启用虚拟滚动（≤时走原 flex 布局） */
const QUEUE_VIRTUAL_THRESHOLD = 40;

function QueueSongItem({
  item,
  song,
  isCurrent,
  virtualOffset,
  instantReveal,
  entryIndex
}: {
  item: ReturnType<typeof usePlayerStore.getState>['queue'][number];
  song: ReturnType<typeof usePlayerStore.getState>['queueSongs'][string];
  isCurrent: boolean;
  virtualOffset?: number;
  instantReveal?: boolean;
  /** 列表中的真实索引，用于进入动画的 --i 交错延迟 */
  entryIndex?: number;
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
      className={`queue-song-item ${isCurrent ? 'playing' : ''} ${virtualOffset !== undefined ? 'virtual' : ''}`}
      style={
        {
          ...(virtualOffset !== undefined ? { '--queued-item-y': `${virtualOffset}px` } : {}),
          ...(entryIndex !== undefined ? { '--i': Math.min(entryIndex, 6) } : {})
        } as React.CSSProperties
      }
      onClick={() => selectQueueItem(item.id)}
      role="button"
      tabIndex={0}
      aria-label={`播放 ${song.title} - ${song.artist}`}
      onKeyDown={(event) => {
        // 队列行是 div：Enter/Space 需要自己接，否则键盘无法切歌
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectQueueItem(item.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, cursorAnchored: true });
      }}
      title={sourceLabel(item.source, song.providerId)}
    >
      <CoverImage
        className={`queue-song-cover${instantReveal ? ' no-reveal' : ''}`}
        src={song.coverUrl}
        tone={song.coverTone}
        size={88}
        noReveal={instantReveal}
        fallbackIconSize={16}
      />
      <div className="queue-song-meta">
        <div className="queue-song-title">
          {isCurrent && (
            <span className="playing-wave queue-item-wave" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
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
        className="queue-song-remove"
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
          style={{ width: 156 }}
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
  const queueEpoch = usePlayerStore((s) => s.queueEpoch);
  const currentQueueItemId = usePlayerStore((s) => s.currentQueueItemId);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const isQueueOpen = useUiStore((s) => s.isQueueOpen);
  const setQueueOpen = useUiStore((s) => s.setQueueOpen);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);
  // 首次打开：封面直接显示（跳过淡入过渡），避免首开时成群加载+同步过渡卡顿
  const [instantReveal, setInstantReveal] = useState(false);
  const openedOnceRef = useRef(false);
  // 面板打开时的条目进入动画：只在打开瞬间保持（滚动新挂载的行不再触发动画）
  const [entryAnimActive, setEntryAnimActive] = useState(false);
  const entryAnimTimerRef = useRef(0);

  useEffect(() => {
    if (!isQueueOpen || openedOnceRef.current) return;
    openedOnceRef.current = true;
    setInstantReveal(true);
    // 打开后下一轮渲染恢复正常淡入（仅首次无过渡）
  }, [isQueueOpen]);

  // 打开时启动条目入场动画，动画播完后移除类（避免滚动加载的新行重复淡入）
  useEffect(() => {
    if (entryAnimTimerRef.current) {
      window.clearTimeout(entryAnimTimerRef.current);
      entryAnimTimerRef.current = 0;
    }
    if (!isQueueOpen) {
      setEntryAnimActive(false);
      return;
    }
    setEntryAnimActive(true);
    entryAnimTimerRef.current = window.setTimeout(() => {
      entryAnimTimerRef.current = 0;
      setEntryAnimActive(false);
    }, 1600);
    return () => {
      if (entryAnimTimerRef.current) {
        window.clearTimeout(entryAnimTimerRef.current);
        entryAnimTimerRef.current = 0;
      }
    };
  }, [isQueueOpen]);

  // 打开时预热可见区封面：让首屏图片提前进入 HTTP/解码缓存，
  // 打开瞬间 <img> 直接从缓存渲染，避免成群加载与解码延迟
  useEffect(() => {
    if (!isQueueOpen || queue.length === 0) return;
    const visibleCount = Math.min(queue.length, 20);
    for (let index = 0; index < visibleCount; index += 1) {
      const song = queueSongs[queue[index].mediaId];
      if (song?.coverUrl) {
        const preloader = new Image();
        preloader.src = toThumbnailUrl(song.coverUrl);
      }
    }
  }, [isQueueOpen, queue, queueSongs]);

  const virtualized = queue.length > QUEUE_VIRTUAL_THRESHOLD;
  const {
    scrollHostRef,
    startIndex,
    endIndex,
    offsetTop,
    totalHeight
  } = useFixedVirtualWindow({
    enabled: virtualized,
    itemCount: queue.length,
    itemSize: QUEUE_ITEM_SIZE,
    overscan: 6,
    fallbackViewportSize: 560,
    resetKey: String(queueEpoch)
  });

  const visibleQueue = virtualized ? queue.slice(startIndex, endIndex) : queue;

  return (
    <>
      <div
        className={`drawer-overlay ${isQueueOpen ? 'active' : ''} ${isLyricsOpen ? 'over-lyrics' : ''}`}
        onClick={() => setQueueOpen(false)}
      />
      <div className={`drawer-panel ${isQueueOpen ? 'open' : ''} ${isLyricsOpen ? 'over-lyrics' : ''}`} data-drawer-panel="queue">
        <div className="drawer-header">
          <h3 className="drawer-title">播放队列 ({queue.length})</h3>
          <div className="drawer-header-actions">
            {queue.length > 0 && (
              <button className="section-action-btn drawer-action-btn" onClick={clearQueue}>
                清空
              </button>
            )}
            <button
              className="drawer-close-btn"
              type="button"
              aria-label="关闭播放队列"
              title="关闭"
              onClick={() => setQueueOpen(false)}
            >
              <CloseIcon size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* 列表首项就是当前歌曲（带波形与高亮），不再额外渲染一张
            "正在播放"卡：同一首歌重复两遍，既占高度又让人误以为队列有两条。 */}
        <div
          className={`queue-song-list ${virtualized ? 'queued-list-virtual' : ''} ${entryAnimActive ? 'queued-entry-anim' : ''}`}
          ref={scrollHostRef}
        >
          {queue.length === 0 && (
            <div className="drawer-status">
              队列为空，播放歌曲后会自动加入
            </div>
          )}
          {virtualized ? (
            <div className="queued-list-spacer" style={{ height: totalHeight }}>
              {visibleQueue.map((item, index) => {
                const song = queueSongs[item.mediaId];
                if (!song) return null;
                const isCurrent = item.id === currentQueueItemId;
                return (
                  <QueueSongItem
                    key={item.id}
                    item={item}
                    song={song}
                    isCurrent={isCurrent}
                    virtualOffset={offsetTop + index * QUEUE_ITEM_SIZE}
                    instantReveal={instantReveal}
                    entryIndex={startIndex + index}
                  />
                );
              })}
            </div>
          ) : (
            queue.map((item, index) => {
              const song = queueSongs[item.mediaId];
              if (!song) return null;
              const isCurrent = item.id === currentQueueItemId;
              return (
                <QueueSongItem
                  key={item.id}
                  item={item}
                  song={song}
                  isCurrent={isCurrent}
                  instantReveal={instantReveal}
                  entryIndex={index}
                />
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
