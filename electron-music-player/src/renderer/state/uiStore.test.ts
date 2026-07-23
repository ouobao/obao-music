import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from './uiStore';

describe('ui store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.getState().resetForTest();
  });

  it('keeps the queue collapsed by default so the main canvas stays unobstructed', () => {
    expect(useUiStore.getState().isQueueOpen).toBe(false);
  });

  it('uses the approved soft transition without reduced effects by default', () => {
    expect(useUiStore.getState().contentTransitionStyle).toBe('soft');
    expect(useUiStore.getState().reduceEffects).toBe(false);
    expect(useUiStore.getState().navigationDirection).toBe('forward');
  });

  it('toggles queue visibility from player controls', () => {
    useUiStore.getState().toggleQueue();
    expect(useUiStore.getState().isQueueOpen).toBe(true);

    useUiStore.getState().toggleQueue();
    expect(useUiStore.getState().isQueueOpen).toBe(false);
  });

  it('persists queue visibility for the next startup', async () => {
    useUiStore.getState().setQueueOpen(true);

    expect(window.localStorage.getItem('musicplayer.ui-state')).toBeTruthy();

    vi.resetModules();
    const { useUiStore: freshUiStore } = await import('./uiStore');

    expect(freshUiStore.getState().isQueueOpen).toBe(true);
    expect(freshUiStore.getState().currentView).toEqual({ type: 'home' });
  });

  it('persists queue and motion preferences without persisting navigation history', async () => {
    useUiStore.getState().setQueueOpen(true);
    useUiStore.getState().setContentTransitionStyle('layered');
    useUiStore.getState().setReduceEffects(true);
    useUiStore.getState().navigateToView({ type: 'search' });
    useUiStore.getState().goBack();

    expect(JSON.parse(window.localStorage.getItem('musicplayer.ui-state') ?? '{}')).toEqual({
      isQueueOpen: true,
      contentTransitionStyle: 'layered',
      reduceEffects: true
    });

    vi.resetModules();
    const { useUiStore: freshUiStore } = await import('./uiStore');

    expect(freshUiStore.getState().isQueueOpen).toBe(true);
    expect(freshUiStore.getState().contentTransitionStyle).toBe('layered');
    expect(freshUiStore.getState().reduceEffects).toBe(true);
    expect(freshUiStore.getState().navigationDirection).toBe('forward');
    expect(freshUiStore.getState().currentView).toEqual({ type: 'home' });
  });

  it('falls back to safe motion defaults for invalid stored values', async () => {
    window.localStorage.setItem('musicplayer.ui-state', JSON.stringify({
      isQueueOpen: 'yes',
      contentTransitionStyle: 'spin',
      reduceEffects: 'sometimes'
    }));

    vi.resetModules();
    const { useUiStore: freshUiStore } = await import('./uiStore');

    expect(freshUiStore.getState().isQueueOpen).toBe(false);
    expect(freshUiStore.getState().contentTransitionStyle).toBe('soft');
    expect(freshUiStore.getState().reduceEffects).toBe(false);
  });

  it('keeps the sidebar expanded by default and toggles the collapsed state', () => {
    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);

    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);

    useUiStore.getState().setSidebarCollapsed(false);
    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
  });

  it('keeps simple page history for top-bar back and forward controls', () => {
    useUiStore.getState().navigateToView({ type: 'search' });
    useUiStore.getState().navigateToView({ type: 'playlist', providerId: 'qq', playlistId: 'qq:8800' });

    expect(useUiStore.getState().currentView).toEqual({ type: 'playlist', providerId: 'qq', playlistId: 'qq:8800' });
    expect(useUiStore.getState().canGoBack).toBe(true);
    expect(useUiStore.getState().canGoForward).toBe(false);
    expect(useUiStore.getState().navigationDirection).toBe('forward');

    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual({ type: 'search' });
    expect(useUiStore.getState().canGoForward).toBe(true);
    expect(useUiStore.getState().navigationDirection).toBe('backward');

    useUiStore.getState().goForward();
    expect(useUiStore.getState().currentView).toEqual({ type: 'playlist', providerId: 'qq', playlistId: 'qq:8800' });
    expect(useUiStore.getState().navigationDirection).toBe('forward');
  });

  it('marks a same-view content refresh as forward without adding history', () => {
    useUiStore.getState().navigateToView({ type: 'search' });
    useUiStore.getState().goBack();

    expect(useUiStore.getState().navigationDirection).toBe('backward');

    useUiStore.getState().navigateToView({ type: 'home' });

    expect(useUiStore.getState().navigationDirection).toBe('forward');
    expect(useUiStore.getState().backStack).toEqual([]);
  });

  it('restores chart sources and chart details through page history', () => {
    useUiStore.getState().navigateToView({ type: 'charts', providerId: 'qq' });
    useUiStore.getState().navigateToView({ type: 'charts', providerId: 'netease' });
    useUiStore.getState().navigateToView({
      type: 'chart',
      providerId: 'netease',
      chartId: 'netease:chart:19723756'
    });

    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual({ type: 'charts', providerId: 'netease' });

    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual({ type: 'charts', providerId: 'qq' });

    useUiStore.getState().goForward();
    expect(useUiStore.getState().currentView).toEqual({ type: 'charts', providerId: 'netease' });
  });

  it('restores playlist discovery sources and native categories through page history', () => {
    useUiStore.getState().navigateToView({
      type: 'playlistDiscovery',
      providerId: 'qq',
      categoryId: 'all'
    });
    useUiStore.getState().navigateToView({
      type: 'playlistDiscovery',
      providerId: 'qq',
      categoryId: '165'
    });
    useUiStore.getState().navigateToView({
      type: 'playlistDiscovery',
      providerId: 'netease',
      categoryId: 'all'
    });

    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual({
      type: 'playlistDiscovery',
      providerId: 'qq',
      categoryId: '165'
    });

    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual({
      type: 'playlistDiscovery',
      providerId: 'qq',
      categoryId: 'all'
    });
  });

  it('tracks distinct artist and album entity ids as separate history entries', () => {
    const firstArtist = {
      type: 'artist' as const,
      providerId: 'qq' as const,
      artistId: 'qq:artist:0025NhlN2yWrP4'
    };
    const secondArtist = {
      type: 'artist' as const,
      providerId: 'netease' as const,
      artistId: 'netease:artist:6452'
    };
    const album = {
      type: 'album' as const,
      providerId: 'netease' as const,
      albumId: 'netease:album:34720827'
    };

    useUiStore.getState().navigateToView(firstArtist);
    useUiStore.getState().navigateToView(secondArtist);
    useUiStore.getState().navigateToView(album);

    expect(useUiStore.getState().currentView).toEqual(album);
    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual(secondArtist);
    useUiStore.getState().goBack();
    expect(useUiStore.getState().currentView).toEqual(firstArtist);
  });
});
