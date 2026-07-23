import { ListMusic, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AnimatedPresenceState } from '../hooks/useAnimatedPresence';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { formatSourceContextLabel } from '../utils/providerDisplay';
import { createVirtualWindowRange, getCenteredVirtualScrollTop } from '../utils/virtualWindow';

interface QueuePanelProps {
  presenceState?: AnimatedPresenceState;
}

const queueItemSize = 66;
const queueListFallbackHeight = 520;
const queueListOverscan = 8;
const deferredQueueScrollItemThreshold = 80;

export function QueuePanel({ presenceState = 'open' }: QueuePanelProps) {
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const queueScrollFrameRef = useRef<number | null>(null);
  const queueItems = usePlayerStore((state) => state.queue);
  const queueMedia = usePlayerStore((state) => state.queueMedia);
  const currentQueueItemId = usePlayerStore((state) => state.currentQueueItemId);
  const selectQueueItem = usePlayerStore((state) => state.selectQueueItem);
  const setQueueOpen = useUiStore((state) => state.setQueueOpen);
  const activeIndex = useMemo(
    () => queueItems.findIndex((item) => item.id === currentQueueItemId),
    [currentQueueItemId, queueItems]
  );
  const [queueScrollTop, setQueueScrollTop] = useState(() => getCenteredVirtualScrollTop(activeIndex, queueItems.length, queueItemSize, queueListFallbackHeight));
  const [queueViewportHeight, setQueueViewportHeight] = useState(queueListFallbackHeight);
  const virtualWindow = createVirtualWindowRange({
    itemCount: queueItems.length,
    itemSize: queueItemSize,
    scrollTop: queueScrollTop,
    viewportSize: queueViewportHeight,
    overscan: queueListOverscan
  });
  const virtualQueueItems = queueItems.slice(virtualWindow.startIndex, virtualWindow.endIndex);

  useEffect(() => {
    if (presenceState !== 'open') {
      return;
    }

    if (activeIndex >= 0) {
      const list = queueListRef.current;
      const viewportHeight = list?.clientHeight || queueViewportHeight;
      const nextScrollTop = getCenteredVirtualScrollTop(activeIndex, queueItems.length, queueItemSize, viewportHeight);
      if (list && Math.abs(list.scrollTop - nextScrollTop) > 1) {
        list.scrollTop = nextScrollTop;
      }
      setQueueScrollTop(nextScrollTop);
    }
  }, [activeIndex, currentQueueItemId, presenceState, queueItems.length, queueViewportHeight]);

  const updateQueueScrollState = () => {
    const list = queueListRef.current;
    if (!list) {
      return;
    }

    setQueueScrollTop(list.scrollTop);
    const nextViewportHeight = list.clientHeight || queueListFallbackHeight;
    setQueueViewportHeight((currentHeight) => (currentHeight === nextViewportHeight ? currentHeight : nextViewportHeight));
  };

  const scheduleQueueScrollState = () => {
    if (queueScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(queueScrollFrameRef.current);
    }

    queueScrollFrameRef.current = window.requestAnimationFrame(() => {
      queueScrollFrameRef.current = null;
      updateQueueScrollState();
    });
  };

  const handleQueueScroll = () => {
    if (queueItems.length > deferredQueueScrollItemThreshold) {
      scheduleQueueScrollState();
      return;
    }

    updateQueueScrollState();
  };

  useEffect(() => () => {
    if (queueScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(queueScrollFrameRef.current);
      queueScrollFrameRef.current = null;
    }
  }, []);

  return (
    <aside className="queue-panel" aria-label="播放队列" data-state={presenceState}>
      <div className="queue-heading">
        <div>
          <h2>播放队列</h2>
        </div>
        <div className="queue-heading-actions">
          <ListMusic aria-hidden="true" size={20} />
          <button className="icon-button" type="button" aria-label="收起播放队列" onClick={() => setQueueOpen(false)}>
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      {queueItems.length === 0 ? (
        <p className="playlist-detail-message">播放队列为空</p>
      ) : null}

      <div className="queue-list" ref={queueListRef} onScroll={handleQueueScroll}>
        <div className="queue-list-virtual-space" style={{ height: `${virtualWindow.totalHeight}px` }}>
          <div className="queue-list-window" style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}>
        {virtualQueueItems.map((item, localIndex) => {
          const index = virtualWindow.startIndex + localIndex;
          const media = queueMedia[item.mediaId];
          if (!media || (item.mediaType === 'program' ? media.mediaType !== 'program' : media.mediaType === 'program')) {
            return null;
          }

          const isActive = item.id === currentQueueItemId;
          const isProgram = media.mediaType === 'program';
          const duration = formatDuration(media.durationMs);
          const sourceContext = item.sourceContext ?? media.sourceContext;
          const sourceLabel = formatSourceContextLabel(sourceContext?.providerId ?? media.providerId, sourceContext?.type ?? item.source);
          const secondaryLabel = isProgram ? media.podcast.author : media.artist;
          const collectionLabel = isProgram ? media.podcast.title : media.album;
          const queuePositionLabel = isProgram ? `${index + 1} 项` : `${index + 1} 首`;

          return (
            <button
              className={isActive ? 'queue-row queue-row-active' : 'queue-row'}
              type="button"
              aria-label={`双击播放队列第 ${queuePositionLabel}：${media.title}`}
              onDoubleClick={() => selectQueueItem(item.id)}
              key={item.id}
            >
              <span className="queue-row-content">
                <span
                  className="song-cover-small"
                  style={
                      {
                      '--cover-tone': media.coverTone,
                      '--song-cover-image': media.coverUrl ? `url("${media.coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                    } as CSSProperties
                  }
                />
                <span className="queue-song">
                  <strong>{media.title}</strong>
                  <small>{secondaryLabel}</small>
                  <span className="queue-meta">
                    <span>{collectionLabel}</span>
                    <span>{sourceLabel}</span>
                  </span>
                </span>
                <span className="queue-duration">{duration}</span>
              </span>
            </button>
          );
        })}
          </div>
        </div>
      </div>
    </aside>
  );
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
