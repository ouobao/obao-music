import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef } from 'react';

interface SongListVisualScrollbarProps {
  scrollHostRef: RefObject<HTMLElement | null>;
}

interface VisualScrollbarMetrics {
  isScrollable: boolean;
  thumbHeight: number;
  thumbTop: number;
  trackBottom: number;
}

const minThumbHeight = 36;

interface VisualScrollbarLayout extends VisualScrollbarMetrics {
  maxScrollTop: number;
  maxThumbTop: number;
}

interface DragState {
  pointerId: number;
  startY: number;
  startThumbTop: number;
  maxScrollTop: number;
  maxThumbTop: number;
}

export function SongListVisualScrollbar({ scrollHostRef }: SongListVisualScrollbarProps) {
  const scrollbarRef = useRef<HTMLDivElement | null>(null);
  const metricsRef = useRef<VisualScrollbarMetrics | null>(null);
  const layoutRef = useRef<VisualScrollbarLayout | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const scrollHost = scrollHostRef.current;
    if (!scrollHost) {
      return undefined;
    }

    let layoutFrameId = 0;
    let scrollFrameId = 0;
    const updateMetrics = (layout: VisualScrollbarLayout, scrollTop: number) => {
      const nextMetrics = createVisualScrollbarMetrics(layout, scrollTop);
      const previousMetrics = metricsRef.current;
      if (previousMetrics && areMetricsEqual(previousMetrics, nextMetrics)) {
        return;
      }

      metricsRef.current = nextMetrics;
      const scrollbar = scrollbarRef.current;
      if (!scrollbar) {
        return;
      }

      if (!previousMetrics || previousMetrics.isScrollable !== nextMetrics.isScrollable) {
        scrollbar.dataset.scrollable = nextMetrics.isScrollable ? 'true' : 'false';
      }
      if (!previousMetrics || Math.abs(previousMetrics.thumbHeight - nextMetrics.thumbHeight) >= 0.1) {
        scrollbar.style.setProperty('--song-list-scrollbar-thumb-height', `${formatCssNumber(nextMetrics.thumbHeight)}px`);
      }
      scrollbar.style.setProperty('--song-list-scrollbar-thumb-top', `${formatCssNumber(nextMetrics.thumbTop)}px`);
      if (!previousMetrics || Math.abs(previousMetrics.trackBottom - nextMetrics.trackBottom) >= 0.1) {
        scrollbar.style.setProperty('--song-list-scrollbar-track-bottom', `${formatCssNumber(nextMetrics.trackBottom)}px`);
      }
    };
    const refreshLayout = () => {
      layoutFrameId = 0;
      const nextLayout = readVisualScrollbarLayout(scrollHost);
      layoutRef.current = nextLayout;
      updateMetrics(nextLayout, scrollHost.scrollTop);
    };
    const refreshThumb = () => {
      scrollFrameId = 0;
      const layout = layoutRef.current;
      if (!layout) {
        refreshLayout();
        return;
      }

      updateMetrics(layout, scrollHost.scrollTop);
    };
    const scheduleLayoutUpdate = () => {
      if (layoutFrameId !== 0) {
        return;
      }

      layoutFrameId = window.requestAnimationFrame(refreshLayout);
    };
    const scheduleThumbUpdate = () => {
      if (scrollFrameId !== 0) {
        return;
      }

      scrollFrameId = window.requestAnimationFrame(refreshThumb);
    };

    scheduleLayoutUpdate();
    scrollHost.addEventListener('scroll', scheduleThumbUpdate, { passive: true });
    window.addEventListener('resize', scheduleLayoutUpdate);

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleLayoutUpdate);
    resizeObserver?.observe(scrollHost);
    Array.from(scrollHost.children).forEach((child) => resizeObserver?.observe(child));

    return () => {
      window.cancelAnimationFrame(layoutFrameId);
      window.cancelAnimationFrame(scrollFrameId);
      scrollHost.removeEventListener('scroll', scheduleThumbUpdate);
      window.removeEventListener('resize', scheduleLayoutUpdate);
      resizeObserver?.disconnect();
      layoutRef.current = null;
      metricsRef.current = null;
    };
  }, [scrollHostRef]);

  useEffect(() => () => {
    dragCleanupRef.current?.();
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollHost = scrollHostRef.current;
    if (!scrollHost) {
      return;
    }

    const layout = readVisualScrollbarLayout(scrollHost);
    layoutRef.current = layout;
    if (!layout.isScrollable || layout.maxThumbTop <= 0 || layout.maxScrollTop <= 0) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startThumbTop: createVisualScrollbarMetrics(layout, scrollHost.scrollTop).thumbTop,
      maxScrollTop: layout.maxScrollTop,
      maxThumbTop: layout.maxThumbTop
    };
    let dragFrameId = 0;
    let pendingScrollTop: number | null = null;
    const flushDragScroll = () => {
      dragFrameId = 0;
      if (pendingScrollTop === null) {
        return;
      }

      scrollHost.scrollTop = pendingScrollTop;
      pendingScrollTop = null;
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || pointerEvent.pointerId !== dragState.pointerId) {
        return;
      }

      pointerEvent.preventDefault();
      const nextThumbTop = clamp(dragState.startThumbTop + pointerEvent.clientY - dragState.startY, 0, dragState.maxThumbTop);
      pendingScrollTop = (nextThumbTop / dragState.maxThumbTop) * dragState.maxScrollTop;
      if (dragFrameId === 0) {
        dragFrameId = window.requestAnimationFrame(flushDragScroll);
      }
    };

    const handlePointerEnd = (pointerEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || pointerEvent.pointerId !== dragState.pointerId) {
        return;
      }

      dragCleanupRef.current?.();
    };

    const cleanupDrag = () => {
      if (dragFrameId !== 0) {
        window.cancelAnimationFrame(dragFrameId);
        flushDragScroll();
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      dragStateRef.current = null;
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanupDrag;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
  };

  return (
    <div
      className="song-list-visual-scrollbar"
      data-scrollable="false"
      aria-hidden="true"
      ref={scrollbarRef}
      onPointerDown={handlePointerDown}
    />
  );
}

function readVisualScrollbarLayout(scrollHost: HTMLElement): VisualScrollbarLayout {
  const computedStyle = getComputedStyle(scrollHost);
  const tailSpace = readCssPixelValue(computedStyle.paddingBottom) || readCssCustomPropertyPixels(computedStyle, '--song-list-tail-space');
  const trackHeight = Math.max(0, scrollHost.clientHeight - tailSpace);
  const effectiveScrollHeight = Math.max(trackHeight, scrollHost.scrollHeight - tailSpace);
  const maxScrollTop = Math.max(0, effectiveScrollHeight - trackHeight);
  const rawThumbHeight = effectiveScrollHeight > 0 ? trackHeight * (trackHeight / effectiveScrollHeight) : trackHeight;
  const thumbHeight = Math.min(trackHeight, Math.max(minThumbHeight, rawThumbHeight));
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  return {
    isScrollable: maxScrollTop > 0,
    thumbHeight,
    thumbTop: 0,
    trackBottom: tailSpace,
    maxScrollTop,
    maxThumbTop
  };
}

function createVisualScrollbarMetrics(layout: VisualScrollbarLayout, scrollTop: number): VisualScrollbarMetrics {
  const thumbTop = layout.maxScrollTop > 0
    ? Math.min(layout.maxThumbTop, (Math.max(0, scrollTop) / layout.maxScrollTop) * layout.maxThumbTop)
    : 0;

  return {
    isScrollable: layout.isScrollable,
    thumbHeight: layout.thumbHeight,
    thumbTop,
    trackBottom: layout.trackBottom
  };
}

function readCssCustomPropertyPixels(computedStyle: CSSStyleDeclaration, propertyName: string): number {
  return readCssPixelValue(computedStyle.getPropertyValue(propertyName));
}

function readCssPixelValue(cssValue: string): number {
  const value = Number.parseFloat(cssValue);
  return Number.isFinite(value) ? value : 0;
}

function areMetricsEqual(left: VisualScrollbarMetrics, right: VisualScrollbarMetrics): boolean {
  return left.isScrollable === right.isScrollable &&
    Math.abs(left.thumbHeight - right.thumbHeight) < 0.1 &&
    Math.abs(left.thumbTop - right.thumbTop) < 0.1 &&
    Math.abs(left.trackBottom - right.trackBottom) < 0.1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCssNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}
