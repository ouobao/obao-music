import { describe, expect, it } from 'vitest';
import {
  createPlaylistGridWindow,
  getPlaylistGridColumnCount,
  playlistGridVirtualizationThreshold
} from './playlistGrid';

describe('playlist discovery grid', () => {
  it('uses deterministic column counts at every container breakpoint', () => {
    expect(getPlaylistGridColumnCount(420)).toBe(2);
    expect(getPlaylistGridColumnCount(559)).toBe(2);
    expect(getPlaylistGridColumnCount(560)).toBe(3);
    expect(getPlaylistGridColumnCount(819)).toBe(3);
    expect(getPlaylistGridColumnCount(820)).toBe(4);
    expect(getPlaylistGridColumnCount(1080)).toBe(5);
    expect(getPlaylistGridColumnCount(1360)).toBe(6);
  });

  it('keeps a small gallery fully rendered', () => {
    const window = createPlaylistGridWindow({
      itemCount: playlistGridVirtualizationThreshold,
      containerWidth: 980,
      scrollTop: 0,
      viewportHeight: 720
    });

    expect(window.virtualized).toBe(false);
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(playlistGridVirtualizationThreshold);
    expect(window.offsetTop).toBe(0);
  });

  it('virtualizes large collections on complete row boundaries', () => {
    const window = createPlaylistGridWindow({
      itemCount: 360,
      containerWidth: 980,
      scrollTop: 4200,
      viewportHeight: 720,
      overscanRows: 2
    });

    expect(window.virtualized).toBe(true);
    expect(window.columnCount).toBe(4);
    expect(window.startIndex % window.columnCount).toBe(0);
    expect(window.endIndex % window.columnCount).toBe(0);
    expect(window.endIndex - window.startIndex).toBeLessThan(40);
    expect(window.offsetTop).toBeGreaterThan(0);
    expect(window.totalHeight).toBeGreaterThan(720);
  });

  it('virtualizes the first render before the grid has been measured', () => {
    const window = createPlaylistGridWindow({
      itemCount: 360,
      containerWidth: 0,
      scrollTop: 0,
      viewportHeight: 720
    });

    expect(window.virtualized).toBe(true);
    expect(window.columnCount).toBe(4);
    expect(window.columnWidth).toBeGreaterThan(0);
    expect(window.endIndex).toBeLessThan(40);
    expect(window.totalHeight).toBeGreaterThan(720);
  });
});
