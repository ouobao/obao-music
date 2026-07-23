export interface VariableVirtualLayoutOptions {
  itemSizes: ReadonlyArray<number | null | undefined>;
  estimate: number;
}

export interface VariableVirtualLayout {
  itemCount: number;
  estimate: number;
  prefixOffsets: readonly number[];
  totalHeight: number;
}

export interface VariableVirtualRangeOptions {
  scrollTop: number;
  viewportSize: number;
  overscanPx?: number;
}

export interface VariableVirtualWindowRange {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function createVariableVirtualLayout({
  itemSizes,
  estimate
}: VariableVirtualLayoutOptions): VariableVirtualLayout {
  const safeEstimate = normalizeSize(estimate, 1);
  const prefixOffsets = new Array<number>(itemSizes.length + 1);
  prefixOffsets[0] = 0;

  for (let index = 0; index < itemSizes.length; index += 1) {
    prefixOffsets[index + 1] = prefixOffsets[index] + normalizeSize(itemSizes[index], safeEstimate);
  }

  return {
    itemCount: itemSizes.length,
    estimate: safeEstimate,
    prefixOffsets,
    totalHeight: prefixOffsets[itemSizes.length]
  };
}

export function createVariableVirtualWindowRange(
  layout: VariableVirtualLayout,
  { scrollTop, viewportSize, overscanPx = 0 }: VariableVirtualRangeOptions
): VariableVirtualWindowRange {
  if (layout.itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0
    };
  }

  const safeViewportSize = normalizeSize(viewportSize, layout.estimate);
  const maxScrollTop = Math.max(0, layout.totalHeight - safeViewportSize);
  const safeScrollTop = clamp(normalizeNonNegative(scrollTop), 0, maxScrollTop);
  const safeOverscanPx = normalizeNonNegative(overscanPx);
  const rangeStart = Math.max(0, safeScrollTop - safeOverscanPx);
  const rangeEnd = Math.min(
    layout.totalHeight,
    safeScrollTop + safeViewportSize + safeOverscanPx
  );
  const startIndex = findItemIndexAtOffset(layout, rangeStart);
  const endIndex = Math.max(
    startIndex + 1,
    lowerBound(layout.prefixOffsets, rangeEnd, layout.itemCount)
  );

  return {
    startIndex,
    endIndex,
    offsetTop: layout.prefixOffsets[startIndex],
    totalHeight: layout.totalHeight
  };
}

export function getVariableItemOffset(layout: VariableVirtualLayout, index: number): number {
  if (layout.itemCount === 0 || Number.isNaN(index) || index <= 0) {
    return 0;
  }

  if (index >= layout.itemCount) {
    return layout.totalHeight;
  }

  return layout.prefixOffsets[Math.floor(index)];
}

export function findVariableItemAtViewportCenter(
  layout: VariableVirtualLayout,
  scrollTop: number,
  viewportSize: number
): number {
  if (layout.itemCount === 0) {
    return -1;
  }

  const safeViewportSize = normalizeSize(viewportSize, layout.estimate);
  const maxScrollTop = Math.max(0, layout.totalHeight - safeViewportSize);
  const safeScrollTop = clamp(normalizeNonNegative(scrollTop), 0, maxScrollTop);
  const centerOffset = Math.min(
    layout.totalHeight,
    safeScrollTop + safeViewportSize / 2
  );

  return findItemIndexAtOffset(layout, centerOffset);
}

function findItemIndexAtOffset(layout: VariableVirtualLayout, offset: number): number {
  let low = 0;
  let high = layout.itemCount;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (layout.prefixOffsets[middle + 1] <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return Math.min(low, layout.itemCount - 1);
}

function lowerBound(values: readonly number[], target: number, end: number): number {
  let low = 0;
  let high = end;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function normalizeSize(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
