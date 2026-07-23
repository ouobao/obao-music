import { type CSSProperties, type MouseEvent, type ReactNode, type SyntheticEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Copy, Heart, ListMusic, ListPlus, MoreHorizontal, Play, Plus, Trash2 } from 'lucide-react';
import type { Playlist, Song } from '../../shared/musicTypes';

export interface SongMenuPosition {
  x: number;
  y: number;
}

export interface SongMenuSize {
  width: number;
  height: number;
}

export interface SongMenuViewport {
  width: number;
  height: number;
  reservedBottom?: number;
}

interface SongRowActionsProps {
  song: Song;
  canLike: boolean;
  isLiked?: boolean;
  isLikedStatusReady?: boolean;
  menuOpen: boolean;
  menuPosition: SongMenuPosition | null;
  addTargets?: Playlist[];
  canRemove?: boolean;
  pendingAction?: 'like' | 'add' | 'remove' | null;
  onToggleLike?: () => void;
  onPlay: () => void;
  onPlayNext: () => void;
  onAddTo?: () => void;
  onAddToPlaylist?: (playlist: Playlist) => void;
  onDelete: () => void;
  onOpenMenu: (position: SongMenuPosition) => void;
  onCloseMenu: () => void;
}

interface ScrollSnapshot {
  element: HTMLElement;
  scrollLeft: number;
  scrollTop: number;
}

const songMenuViewportMargin = 8;
const songMenuFlipGap = 8;
const defaultSongMenuSize: SongMenuSize = {
  width: 168,
  height: 214
};

export function SongRowActions({
  song,
  canLike,
  isLiked = false,
  isLikedStatusReady = true,
  menuOpen,
  menuPosition,
  addTargets = [],
  canRemove = true,
  pendingAction = null,
  onToggleLike,
  onPlay,
  onPlayNext,
  onAddTo,
  onAddToPlaylist,
  onDelete,
  onOpenMenu,
  onCloseMenu
}: SongRowActionsProps) {
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previousLikedRef = useRef(isLiked);
  const [likeAnimationDirection, setLikeAnimationDirection] = useState<'like-in' | 'like-out' | null>(null);
  const [boundedMenuPosition, setBoundedMenuPosition] = useState<SongMenuPosition | null>(null);
  const [isAddTargetMenuOpen, setAddTargetMenuOpen] = useState(false);

  useEffect(() => {
    if (previousLikedRef.current === isLiked) {
      return;
    }

    previousLikedRef.current = isLiked;
    setLikeAnimationDirection(isLiked ? 'like-in' : 'like-out');

    const animationTimer = window.setTimeout(() => {
      setLikeAnimationDirection(null);
    }, 280);

    return () => {
      window.clearTimeout(animationTimer);
    };
  }, [isLiked]);

  useEffect(() => {
    if (!menuOpen) {
      setBoundedMenuPosition(null);
      setAddTargetMenuOpen(false);
      return;
    }

    const scrollSnapshots = createScrollSnapshots(actionsRef.current);
    let isRestoringScroll = false;
    const restoreScroll = () => {
      if (isRestoringScroll) {
        return;
      }

      isRestoringScroll = true;
      scrollSnapshots.forEach(({ element, scrollLeft, scrollTop }) => {
        if (element.scrollTop !== scrollTop) {
          element.scrollTop = scrollTop;
        }
        if (element.scrollLeft !== scrollLeft) {
          element.scrollLeft = scrollLeft;
        }
      });
      isRestoringScroll = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      onCloseMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMenu();
        return;
      }

      if (isScrollKey(event.key)) {
        event.preventDefault();
        restoreScroll();
      }
    };
    const handleScroll = () => {
      restoreScroll();
    };
    const handleScrollIntent = (event: Event) => {
      event.preventDefault();
      restoreScroll();
    };
    const preventScrollOptions: AddEventListenerOptions = { capture: true, passive: false };
    const captureOptions: EventListenerOptions = { capture: true };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleScrollIntent, preventScrollOptions);
    document.addEventListener('touchmove', handleScrollIntent, preventScrollOptions);
    scrollSnapshots.forEach(({ element }) => {
      element.addEventListener('scroll', handleScroll);
    });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleScrollIntent, captureOptions);
      document.removeEventListener('touchmove', handleScrollIntent, captureOptions);
      scrollSnapshots.forEach(({ element }) => {
        element.removeEventListener('scroll', handleScroll);
      });
    };
  }, [menuOpen, onCloseMenu]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuPosition || typeof window === 'undefined') {
      return;
    }

    const menuRect = menuRef.current?.getBoundingClientRect();
    const playerRect = document.querySelector<HTMLElement>('.player-bar')?.getBoundingClientRect();
    const menuSize = normalizeMenuSize(menuRect, defaultSongMenuSize);
    const nextPosition = getBoundedSongMenuPosition(menuPosition, menuSize, {
      width: window.innerWidth,
      height: window.innerHeight,
      reservedBottom: playerRect?.top
    });

    setBoundedMenuPosition((currentPosition) => {
      if (currentPosition?.x === nextPosition.x && currentPosition.y === nextPosition.y) {
        return currentPosition;
      }

      return nextPosition;
    });
  }, [menuOpen, menuPosition]);

  const openMenuFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAddTargetMenuOpen(false);
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6)
    });
  };

  const openAddTargetMenuFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!onAddToPlaylist) {
      onAddTo?.();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setAddTargetMenuOpen(true);
    onOpenMenu({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6)
    });
  };

  const openAddTargetMenu = () => {
    if (!onAddToPlaylist) {
      onAddTo?.();
      onCloseMenu();
      return;
    }

    setAddTargetMenuOpen(true);
  };

  const selectAddTarget = (playlist: Playlist) => {
    onAddToPlaylist?.(playlist);
    onCloseMenu();
  };

  const isPending = pendingAction !== null;

  return (
    <div className="song-row-actions" ref={actionsRef} onClick={stopPropagation} onDoubleClick={stopPropagation}>
      {canLike ? (
        <button
          className={[
            'song-row-action-button',
            isLiked ? 'song-row-action-button-liked' : '',
            likeAnimationDirection ? `song-row-action-button-${likeAnimationDirection}` : ''
          ].filter(Boolean).join(' ')}
          type="button"
          aria-label={`添加到喜欢：${song.title}`}
          aria-pressed={isLiked}
          disabled={!isLikedStatusReady || isPending}
          onClick={handleAction(onToggleLike)}
        >
          <Heart aria-hidden="true" className="song-row-like-icon" size={17} fill="currentColor" />
        </button>
      ) : (
        <span className="song-row-action-spacer" aria-hidden="true" />
      )}
      <span className="song-row-secondary-actions">
        <button className="song-row-action-button" type="button" aria-label={`下一首播放：${song.title}`} onClick={handleAction(onPlayNext)}>
          <ListPlus aria-hidden="true" size={17} />
        </button>
        <button className="song-row-action-button" type="button" aria-label={`添加到：${song.title}`} disabled={isPending} onClick={openAddTargetMenuFromButton}>
          <Plus aria-hidden="true" size={17} />
        </button>
        <button className="song-row-action-button" type="button" aria-label={`更多操作：${song.title}`} onClick={openMenuFromButton}>
          <MoreHorizontal aria-hidden="true" size={18} />
        </button>
      </span>
      {menuOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="song-context-menu"
          role="menu"
          aria-label={`歌曲操作：${song.title}`}
          ref={menuRef}
          style={
            {
              '--song-menu-x': `${(boundedMenuPosition ?? menuPosition)?.x ?? 0}px`,
              '--song-menu-y': `${(boundedMenuPosition ?? menuPosition)?.y ?? 0}px`
            } as CSSProperties
          }
          onClick={stopPropagation}
          onDoubleClick={stopPropagation}
        >
          {isAddTargetMenuOpen ? (
            <div className="song-context-menu-targets" role="menu" aria-label="添加到歌单">
              <SongContextMenuItem label="返回" onSelect={() => setAddTargetMenuOpen(false)} disabled={isPending}>
                <ChevronLeft aria-hidden="true" size={17} strokeWidth={2.25} />
              </SongContextMenuItem>
              {addTargets.length > 0 ? addTargets.map((playlist) => (
                <SongContextMenuItem
                  key={playlist.id}
                  label={playlist.title}
                  onSelect={() => selectAddTarget(playlist)}
                  disabled={isPending}
                >
                  <span
                    className="song-context-menu-playlist-cover"
                    style={
                      {
                        '--cover-tone': playlist.coverTone,
                        '--playlist-cover-image': playlist.coverUrl
                          ? `url("${playlist.coverUrl}")`
                          : 'linear-gradient(135deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                </SongContextMenuItem>
              )) : (
                <SongContextMenuItem label="暂无可添加的自建歌单" disabled>
                  <ListMusic aria-hidden="true" size={15} />
                </SongContextMenuItem>
              )}
            </div>
          ) : (
            <>
          <SongContextMenuItem label="播放" onSelect={handleMenuSelect(onPlay)} disabled={isPending}>
            <Play aria-hidden="true" size={15} fill="currentColor" />
          </SongContextMenuItem>
          <SongContextMenuItem label="下一首播放" onSelect={handleMenuSelect(onPlayNext)} disabled={isPending}>
            <ListPlus aria-hidden="true" size={15} />
          </SongContextMenuItem>
          {canLike ? (
            <SongContextMenuItem label={isLiked ? "取消喜欢" : "我喜欢"} onSelect={handleMenuSelect(onToggleLike)} disabled={!isLikedStatusReady || isPending}>
              <Heart aria-hidden="true" size={15} fill={isLiked ? 'currentColor' : 'none'} />
            </SongContextMenuItem>
          ) : null}
          <SongContextMenuItem label="添加到" onSelect={openAddTargetMenu} disabled={isPending}>
            <Plus aria-hidden="true" size={15} />
          </SongContextMenuItem>
          {canRemove ? <SongContextMenuItem label="删除" onSelect={handleMenuSelect(onDelete)} tone="danger" disabled={isPending}>
            <Trash2 aria-hidden="true" size={15} />
          </SongContextMenuItem> : null}
          <SongContextMenuItem label="复制歌曲信息" onSelect={handleMenuSelect(() => {
            void copySongInfo(song);
          })} disabled={isPending}>
            <Copy aria-hidden="true" size={15} />
          </SongContextMenuItem>
            </>
          )}
        </div>,
        document.body
      ) : null}
    </div>
  );

  function handleAction(action: (() => void) | undefined) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      action?.();
    };
  }

  function handleMenuSelect(action: (() => void) | undefined) {
    return () => {
      action?.();
      onCloseMenu();
    };
  }
}

export function getBoundedSongMenuPosition(
  position: SongMenuPosition,
  size: SongMenuSize,
  viewport: SongMenuViewport
): SongMenuPosition {
  const safeBottom = Math.min(viewport.height, viewport.reservedBottom ?? viewport.height) - songMenuViewportMargin;
  const maxX = Math.max(songMenuViewportMargin, viewport.width - size.width - songMenuViewportMargin);
  const maxY = Math.max(songMenuViewportMargin, safeBottom - size.height);
  const flippedY = position.y - size.height - songMenuFlipGap;
  const preferredY = position.y + size.height > safeBottom ? flippedY : position.y;

  return {
    x: Math.round(clamp(position.x, songMenuViewportMargin, maxX)),
    y: Math.round(clamp(preferredY, songMenuViewportMargin, maxY))
  };
}

function normalizeMenuSize(rect: DOMRect | undefined, fallback: SongMenuSize): SongMenuSize {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return fallback;
  }

  return {
    width: rect.width,
    height: rect.height
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function SongContextMenuItem({
  children,
  label,
  tone,
  disabled = false,
  onSelect
}: {
  children: ReactNode;
  label: string;
  tone?: 'danger';
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      className={tone === 'danger' ? 'song-context-menu-item song-context-menu-item-danger' : 'song-context-menu-item'}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onSelect?.();
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

function createScrollSnapshots(source: HTMLElement | null): ScrollSnapshot[] {
  const snapshots: ScrollSnapshot[] = [];
  const seenElements = new Set<HTMLElement>();
  const addElement = (element: HTMLElement | null) => {
    if (!element || seenElements.has(element)) {
      return;
    }

    seenElements.add(element);
    snapshots.push({
      element,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    });
  };

  let currentElement = source?.parentElement ?? null;
  while (currentElement) {
    addElement(currentElement);
    currentElement = currentElement.parentElement;
  }

  addElement(document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);

  return snapshots;
}

function isScrollKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'PageDown' || key === 'PageUp' || key === 'Home' || key === 'End';
}

async function copySongInfo(song: Song): Promise<void> {
  try {
    await navigator.clipboard?.writeText(`${song.title} - ${song.artist} · ${song.album}`);
  } catch {
    // Clipboard availability varies by runtime; the menu should stay non-blocking.
  }
}
