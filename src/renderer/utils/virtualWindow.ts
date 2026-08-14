export interface VirtualWindowOptions {
  itemCount: number;
  itemSize: number;
  scrollTop: number;
  viewportSize: number;
  overscan: number;
}

export interface VirtualWindowRange {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function createVirtualWindowRange({
  itemCount,
  itemSize,
  scrollTop,
  viewportSize,
  overscan
}: VirtualWindowOptions): VirtualWindowRange {
  if (itemCount <= 0 || itemSize <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0
    };
  }

  const safeViewportSize = viewportSize > 0 ? viewportSize : itemSize;
  const visibleCount = Math.ceil(safeViewportSize / itemSize);
  const startIndex = clamp(Math.floor(Math.max(0, scrollTop) / itemSize) - overscan, 0, itemCount - 1);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * itemSize,
    totalHeight: itemCount * itemSize
  };
}

export function getCenteredVirtualScrollTop(index: number, itemCount: number, itemSize: number, viewportSize: number): number {
  if (index < 0 || itemCount <= 0 || itemSize <= 0) {
    return 0;
  }

  const safeViewportSize = viewportSize > 0 ? viewportSize : itemSize;
  const maxScrollTop = Math.max(0, itemCount * itemSize - safeViewportSize);
  const centeredScrollTop = index * itemSize - (safeViewportSize - itemSize) / 2;

  return clamp(centeredScrollTop, 0, maxScrollTop);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
