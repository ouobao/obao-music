import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { createVirtualWindowRange, type VirtualWindowRange } from '../utils/virtualWindow';

interface FixedVirtualWindowOptions {
  enabled: boolean;
  itemCount: number;
  itemSize: number;
  overscan: number;
  fallbackViewportSize: number;
  resetKey: string;
}

interface FixedVirtualWindowResult extends VirtualWindowRange {
  scrollHostRef: MutableRefObject<HTMLDivElement | null>;
}

export function useFixedVirtualWindow({
  enabled,
  itemCount,
  itemSize,
  overscan,
  fallbackViewportSize,
  resetKey
}: FixedVirtualWindowOptions): FixedVirtualWindowResult {
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({
    scrollTop: 0,
    size: fallbackViewportSize
  });
  const previousResetKeyRef = useRef(resetKey);
  const resetPending = previousResetKeyRef.current !== resetKey;

  if (resetPending) {
    previousResetKeyRef.current = resetKey;
  }

  useLayoutEffect(() => {
    const scrollHost = scrollHostRef.current;
    if (!enabled || !scrollHost) {
      return undefined;
    }

    let frameId = 0;
    let viewportSize = scrollHost.clientHeight || fallbackViewportSize;
    const updateViewport = () => {
      frameId = 0;
      const nextViewport = {
        scrollTop: Math.floor(Math.max(0, scrollHost.scrollTop) / itemSize) * itemSize,
        size: viewportSize
      };
      setViewport((current) => (
        current.scrollTop === nextViewport.scrollTop && current.size === nextViewport.size
          ? current
          : nextViewport
      ));
    };
    const scheduleViewportUpdate = () => {
      if (frameId === 0) {
        frameId = window.requestAnimationFrame(updateViewport);
      }
    };
    const refreshViewportSize = () => {
      viewportSize = scrollHost.clientHeight || fallbackViewportSize;
      scheduleViewportUpdate();
    };

    scrollHost.scrollTop = 0;
    updateViewport();
    scrollHost.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(refreshViewportSize);
    resizeObserver?.observe(scrollHost);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      scrollHost.removeEventListener('scroll', scheduleViewportUpdate);
      resizeObserver?.disconnect();
    };
  }, [enabled, fallbackViewportSize, itemSize, resetKey]);

  const virtualWindow = createVirtualWindowRange({
    itemCount,
    itemSize,
    scrollTop: resetPending ? 0 : viewport.scrollTop,
    viewportSize: Math.max(itemSize, resetPending ? fallbackViewportSize : viewport.size),
    overscan
  });

  return {
    scrollHostRef,
    ...virtualWindow
  };
}
