import { createVirtualWindowRange } from './virtualWindow';

export const playlistGridVirtualizationThreshold = 60;
export const playlistGridInitialContainerWidth = 820;
export const playlistGridColumnGap = 18;
export const playlistGridRowGap = 30;
export const playlistGridCopyHeight = 88;
export const playlistGridCoverCopyGap = 10;

interface PlaylistGridWindowOptions {
  itemCount: number;
  containerWidth: number;
  scrollTop: number;
  viewportHeight: number;
  overscanRows?: number;
}

export interface PlaylistGridWindow {
  virtualized: boolean;
  columnCount: number;
  columnWidth: number;
  rowStride: number;
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function getPlaylistGridColumnCount(containerWidth: number) {
  if (containerWidth >= 1360) {
    return 6;
  }
  if (containerWidth >= 1080) {
    return 5;
  }
  if (containerWidth >= 820) {
    return 4;
  }
  if (containerWidth >= 560) {
    return 3;
  }
  return 2;
}

export function createPlaylistGridWindow({
  itemCount,
  containerWidth,
  scrollTop,
  viewportHeight,
  overscanRows = 3
}: PlaylistGridWindowOptions): PlaylistGridWindow {
  const safeItemCount = Math.max(0, itemCount);
  const safeContainerWidth = containerWidth > 0
    ? containerWidth
    : playlistGridInitialContainerWidth;
  const columnCount = getPlaylistGridColumnCount(safeContainerWidth);
  const columnWidth = Math.max(
    0,
    (safeContainerWidth - playlistGridColumnGap * (columnCount - 1)) / columnCount
  );
  const rowStride = columnWidth + playlistGridCoverCopyGap + playlistGridCopyHeight + playlistGridRowGap;
  const rowCount = Math.ceil(safeItemCount / columnCount);
  const totalHeight = Math.max(0, rowCount * rowStride - playlistGridRowGap);
  const virtualized = safeItemCount > playlistGridVirtualizationThreshold;

  if (!virtualized) {
    return {
      virtualized,
      columnCount,
      columnWidth,
      rowStride,
      startIndex: 0,
      endIndex: safeItemCount,
      offsetTop: 0,
      totalHeight
    };
  }

  const rowWindow = createVirtualWindowRange({
    itemCount: rowCount,
    itemSize: rowStride,
    scrollTop: Math.max(0, scrollTop),
    viewportSize: Math.max(rowStride, viewportHeight),
    overscan: Math.max(1, overscanRows)
  });

  return {
    virtualized,
    columnCount,
    columnWidth,
    rowStride,
    startIndex: rowWindow.startIndex * columnCount,
    endIndex: Math.min(safeItemCount, rowWindow.endIndex * columnCount),
    offsetTop: rowWindow.offsetTop,
    totalHeight
  };
}
