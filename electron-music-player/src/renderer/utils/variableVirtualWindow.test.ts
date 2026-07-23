import { describe, expect, it } from 'vitest';
import {
  createVariableVirtualLayout,
  createVariableVirtualWindowRange,
  findVariableItemAtViewportCenter,
  getVariableItemOffset
} from './variableVirtualWindow';

describe('variable virtual window', () => {
  it('builds prefix offsets from measured and estimated item sizes', () => {
    const layout = createVariableVirtualLayout({
      itemSizes: [20, undefined, 0, 40],
      estimate: 30
    });

    expect(layout.prefixOffsets).toEqual([0, 20, 50, 80, 120]);
    expect(layout.totalHeight).toBe(120);
    expect(getVariableItemOffset(layout, 2)).toBe(50);
    expect(getVariableItemOffset(layout, layout.itemCount)).toBe(120);
  });

  it('calculates an exclusive virtual range using pixel overscan', () => {
    const layout = createVariableVirtualLayout({
      itemSizes: [20, 30, 40, 50],
      estimate: 30
    });

    expect(
      createVariableVirtualWindowRange(layout, {
        scrollTop: 25,
        viewportSize: 40,
        overscanPx: 10
      })
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      offsetTop: 0,
      totalHeight: 140
    });
  });

  it('keeps exact item boundaries out of the exclusive end index', () => {
    const layout = createVariableVirtualLayout({
      itemSizes: [20, 30, 40, 50],
      estimate: 30
    });

    expect(
      createVariableVirtualWindowRange(layout, {
        scrollTop: 50,
        viewportSize: 40,
        overscanPx: 0
      })
    ).toMatchObject({
      startIndex: 2,
      endIndex: 3,
      offsetTop: 50
    });
  });

  it('finds the item at the viewport center with variable sizes', () => {
    const layout = createVariableVirtualLayout({
      itemSizes: [20, 30, 50],
      estimate: 25
    });

    expect(findVariableItemAtViewportCenter(layout, 0, 60)).toBe(1);
    expect(findVariableItemAtViewportCenter(layout, 20, 1)).toBe(1);
    expect(findVariableItemAtViewportCenter(layout, 10_000, 20)).toBe(2);
  });

  it('normalizes invalid sizes and window measurements', () => {
    const layout = createVariableVirtualLayout({
      itemSizes: [Number.NaN, Number.POSITIVE_INFINITY, -5, null],
      estimate: 0
    });
    const range = createVariableVirtualWindowRange(layout, {
      scrollTop: Number.NaN,
      viewportSize: -10,
      overscanPx: Number.POSITIVE_INFINITY
    });

    expect(layout.estimate).toBe(1);
    expect(layout.prefixOffsets).toEqual([0, 1, 2, 3, 4]);
    expect(range).toEqual({
      startIndex: 0,
      endIndex: 1,
      offsetTop: 0,
      totalHeight: 4
    });
    expect(getVariableItemOffset(layout, -1)).toBe(0);
    expect(getVariableItemOffset(layout, Number.POSITIVE_INFINITY)).toBe(4);
  });

  it('returns stable empty results', () => {
    const layout = createVariableVirtualLayout({ itemSizes: [], estimate: 32 });

    expect(createVariableVirtualWindowRange(layout, {
      scrollTop: 100,
      viewportSize: 200,
      overscanPx: 100
    })).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0
    });
    expect(getVariableItemOffset(layout, 2)).toBe(0);
    expect(findVariableItemAtViewportCenter(layout, 0, 200)).toBe(-1);
  });
});
