import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { formatPlayCount } from '../utils/format';
import { ChevronRightIcon, MusicIcon, PlayBadgeIcon } from './icons';
import { CoverImage } from './CoverImage';

export interface MediaCardData {
  id: string;
  title: string;
  subtitle: string;
  coverUrl?: string;
  coverTone?: string;
  playCount?: number;
  badge?: string;
  /** 圆形封面（歌手头像） */
  round?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
}

const GRID_CHUNK_SIZE = 60;

export function MediaCardGrid({ cards, columns }: { cards: MediaCardData[]; columns?: number }) {
  const [renderCount, setRenderCount] = useState(GRID_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 追加时保留已渲染进度，仅在卡片总数变小（如切换分类）时才收敛：
    // 否则父组件无限滚动追加新卡片会把 renderCount 重置回 60，网格瞬间
    // 从已渲染的几百张坍缩回 60 张再被哨兵补回，造成“疯狂抽搐”。
    setRenderCount((count) => Math.min(cards.length, Math.max(GRID_CHUNK_SIZE, count)));
  }, [cards.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const container = el.closest<HTMLElement>('.main-content');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setRenderCount((count) => Math.min(cards.length, count + GRID_CHUNK_SIZE));
      },
      { root: container ?? null, rootMargin: '900px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cards.length]);

  const visibleCards = renderCount >= cards.length ? cards : cards.slice(0, renderCount);

  return (
    <div className="media-grid" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(160px, 1fr))` } : undefined}>
      {visibleCards.map((card, index) => (
        <MediaCard key={card.id} card={card} index={index} />
      ))}
      {renderCount < cards.length && (
        <div ref={sentinelRef} style={{ gridColumn: '1 / -1', height: 1 }} aria-hidden="true" />
      )}
    </div>
  );
}

export function MediaCard({ card, index = 0 }: { card: MediaCardData; index?: number }) {
  return (
    <div
      className="media-card"
      style={{ '--i': Math.min(index, 6) } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={card.subtitle ? `${card.title} · ${card.subtitle}` : card.title}
      onClick={card.onOpen}
      onKeyDown={(e) => {
        // 卡片是 div：必须自己处理 Enter/Space，否则整片网格键盘不可达
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.onOpen();
        }
      }}
    >
      <div className={`media-cover-container${card.round ? ' media-cover--round' : ''}`}>
        <CoverImage
          className="media-cover-img"
          src={card.coverUrl}
          tone={card.coverTone}
          alt={card.title}
          size={400}
          fallbackIconSize={34}
        />
        {card.playCount != null && card.playCount > 0 && (
          <div className="media-play-count">
            <PlayBadgeIcon size={11} strokeWidth={2} filled />
            {formatPlayCount(card.playCount)}
          </div>
        )}
        {card.badge && <span className="media-badge">{card.badge}</span>}
        {card.onPlay && (
          <button
            type="button"
            className="media-play-badge"
            title="播放"
            aria-label={`播放 ${card.title}`}
            onClick={(e) => {
              e.stopPropagation();
              card.onPlay?.();
            }}
          >
            <PlayBadgeIcon size={17} strokeWidth={2} filled />
          </button>
        )}
      </div>
      <div className="media-title">{card.title}</div>
      <div className="media-author">{card.subtitle}</div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: ReactNode; onAction?: () => void }) {
  return (
    <div className="section-header">
      <div className="section-title-group">
        <h2 className="section-main-title">{title}</h2>
        {subtitle && <span className="section-sub-title">{subtitle}</span>}
      </div>
      {action && (
        <button className="section-action-btn" onClick={onAction}>
          {action}
          <ChevronRightIcon size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, desc, actionLabel, onAction }: { title: string; desc?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <MusicIcon size={28} strokeWidth={1.5} />
      </div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {actionLabel && (
        <button className="btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
