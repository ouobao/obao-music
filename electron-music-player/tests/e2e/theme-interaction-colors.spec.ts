import { expect, test, type Locator, type Page } from '@playwright/test';
import { qqVisualRuntimeData } from './fixtures/qqVisualFixtures';

const appUrl = process.env.THEME_COLOR_TEST_URL ?? '/';

test.describe('theme interaction colors', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((fixture) => {
      window.localStorage.setItem(
        'oubao-music-visual-preferences',
        JSON.stringify({ themePreference: 'light' })
      );

      const isKnownSong = (song) => fixture.songs.some((item) => item.id === song?.id);

      window.musicPlayer = {
        app: {
          getVersion: async () => '0.1.0'
        },
        window: {
          minimize: () => undefined,
          toggleMaximize: () => undefined,
          toggleFullscreen: () => undefined,
          close: () => undefined
        },
        music: {
          getLoginStatus: async (providerId) => ({
            ok: true,
            data: {
              providerId,
              loggedIn: providerId === 'qq',
              nickname: providerId === 'qq' ? 'QQ User' : undefined,
              playbackReady: false
            }
          }),
          login: async (providerId) => ({
            ok: true,
            data: {
              providerId,
              loggedIn: providerId === 'qq',
              nickname: providerId === 'qq' ? 'QQ User' : undefined,
              playbackReady: false
            }
          }),
          logout: async () => ({ ok: true, data: undefined }),
          search: async () => ({ ok: true, data: [...fixture.songs] }),
          getSearchSuggestions: async (providerId, keyword) => ({
            ok: true,
            data: providerId === 'qq'
              ? [{
                  id: `qq:suggestion:${String(keyword).toLowerCase()}`,
                  providerId: 'qq',
                  keyword: String(keyword),
                  title: String(keyword),
                  kind: 'song',
                  subtitle: fixture.songs[0]?.artist ?? 'QQ User'
                }]
              : []
          }),
          getSearchHotSearches: async (providerId) => ({
            ok: true,
            data: providerId === 'qq'
              ? [{ id: 'qq:hot:visual-runtime', providerId: 'qq', keyword: 'visual runtime', title: 'Visual runtime', rank: 1 }]
              : []
          }),
          searchEntities: async (providerId, keyword) => {
            const songs = providerId === 'qq' ? [...fixture.songs] : [];
            return {
              ok: true,
              data: {
                providerId,
                keyword: String(keyword),
                sections: {
                  songs: { available: true, items: songs, total: songs.length, hasMore: false, errorMessage: null },
                  artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
                  albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
                  playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
                }
              }
            };
          },
          getUserPlaylists: async (providerId) => ({
            ok: true,
            data: providerId === 'qq'
              ? fixture.playlists.map((playlist) => ({ ...playlist, songIds: [...playlist.songIds] }))
              : []
          }),
          getPlaylistTracks: async (providerId, playlistId) => ({
            ok: true,
            data: providerId === 'qq' && playlistId === fixture.playlists[0].id ? [...fixture.songs] : []
          }),
          getCharts: async () => ({ ok: true, data: [] }),
          getChartTracks: async () => ({ ok: true, data: [] }),
          getPlaylistCategories: async () => ({ ok: true, data: [] }),
          getDiscoveredPlaylists: async (providerId, query) => ({
            ok: true,
            data: {
              providerId,
              categoryId: query.categoryId,
              playlists: [],
              offset: query.offset ?? 0,
              limit: query.limit ?? 30,
              total: 0,
              hasMore: false
            }
          }),
          getArtistDetail: async (providerId) => ({
            ok: false,
            error: {
              code: 'provider_unsupported',
              providerId,
              message: 'Artist detail is outside this visual fixture.'
            }
          }),
          getAlbumDetail: async (providerId) => ({
            ok: false,
            error: {
              code: 'provider_unsupported',
              providerId,
              message: 'Album detail is outside this visual fixture.'
            }
          }),
          getRecommendationHome: async (providerId) => ({
            ok: true,
            data: {
              providerId,
              loggedIn: providerId === 'qq',
              dailySongs: [],
              newSongs: [],
              moduleResults: {
                daily: { status: 'skipped', errorMessage: null },
                new: { status: 'fulfilled', errorMessage: null }
              }
            }
          }),
          getNewAlbums: async () => ({ ok: true, data: [] }),
          getHomepageBlocks: async (providerId) => ({
            ok: true,
            data: { providerId, blocks: [] }
          }),
          getSongUrl: async (providerId, song, quality) => ({
            ok: true,
            data: {
              ok: providerId === 'qq' && isKnownSong(song),
              providerId,
              quality,
              url: providerId === 'qq' && isKnownSong(song) ? `https://example.test/${song.platformSongId}.mp3` : ''
            }
          }),
          getLyrics: async (providerId, song) => ({
            ok: true,
            data: {
              ok: providerId === 'qq' && isKnownSong(song),
              providerId,
              lrc: providerId === 'qq' && isKnownSong(song) ? fixture.lyrics : ''
            }
          }),
          setSongLiked: async (providerId, song, liked) => ({
            ok: true,
            data: { providerId, operation: liked ? 'like' : 'unlike', songId: song.id }
          }),
          addSongToPlaylist: async (providerId, song, playlistId) => ({
            ok: true,
            data: { providerId, operation: 'add_to_playlist', songId: song.id, playlistId }
          }),
          removeSongFromPlaylist: async (providerId, song, playlistId) => ({
            ok: true,
            data: { providerId, operation: 'remove_from_playlist', songId: song.id, playlistId }
          }),
          importLocalFiles: async () => ({ ok: true, data: [] })
        }
      };
    }, qqVisualRuntimeData);

    await page.setViewportSize({ width: 1220, height: 780 });
    await page.goto(appUrl);
    await expect(page.locator('.home-view')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('white');
  });

  test('restores independently backed theme surfaces without flattening glass chrome', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'compact'
      ? { width: 1040, height: 720 }
      : { width: 1440, height: 900 });
    const defaultStructuralSurfaces = await readStructuralThemeSurfaces(page);
    expectOpaqueThemeSurfaces(defaultStructuralSurfaces);

    if (testInfo.project.name !== 'compact') {
      await expectTransientGlassMaterial(page, '.login-button', '.login-popover', 'login popover');
    }
    await expectTransientGlassMaterial(page, '.quality-trigger', '.quality-popover', 'quality popover');
    await expectTransientGlassMaterial(page, '.volume-trigger', '.volume-popover', 'volume popover');
    await page.screenshot({
      path: `artifacts/ui-checks/theme-home-default-white-${testInfo.project.name}.png`,
      fullPage: true
    });

    await page.locator('.theme-trigger').click();
    await expectBlurredGlassMaterial(page.locator('.theme-popover'), 'theme popover', 24);
    await page.getByRole('button', { name: '使用黑色显示模式' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('black');
    await page.keyboard.press('Escape');
    await expect(page.locator('.theme-popover')).toHaveCount(0);

    const blackStructuralSurfaces = await readStructuralThemeSurfaces(page);
    expectOpaqueThemeSurfaces(blackStructuralSurfaces);
    expect(blackStructuralSurfaces.window.backgroundImage).not.toBe(
      defaultStructuralSurfaces.window.backgroundImage
    );
    expect(blackStructuralSurfaces.sidebar.backgroundImage).not.toBe(
      defaultStructuralSurfaces.sidebar.backgroundImage
    );
    expect(blackStructuralSurfaces.contentFrame.backgroundImage).not.toBe(
      defaultStructuralSurfaces.contentFrame.backgroundImage
    );
    await page.screenshot({
      path: `artifacts/ui-checks/theme-home-black-${testInfo.project.name}.png`,
      fullPage: true
    });

    await page.locator('.theme-trigger').click();
    await page.getByRole('button', { name: '使用白色显示模式' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('white');
    await expectRootToken(page, '--qq-content-bg', '#ffffff');
    await page.keyboard.press('Escape');
    await expect(page.locator('.theme-popover')).toHaveCount(0);

    const whiteStructuralSurfaces = await readStructuralThemeSurfaces(page);
    expectOpaqueThemeSurfaces(whiteStructuralSurfaces);
    expect(whiteStructuralSurfaces.window.backgroundImage).not.toBe(
      blackStructuralSurfaces.window.backgroundImage
    );
    expect(whiteStructuralSurfaces.sidebar.backgroundImage).not.toBe(
      blackStructuralSurfaces.sidebar.backgroundImage
    );
    expect(whiteStructuralSurfaces.contentFrame.backgroundImage).not.toBe(
      blackStructuralSurfaces.contentFrame.backgroundImage
    );
    await page.screenshot({
      path: `artifacts/ui-checks/theme-home-white-${testInfo.project.name}.png`,
      fullPage: true
    });

    const searchInput = page.locator('.search-box input[name="keyword"]');
    await searchInput.fill('visual runtime');
    await searchInput.press('Enter');
    await expect(page.locator('.qq-search-view')).toBeVisible();
    await expect(page.locator('.search-result-row').first()).toBeVisible();

    expectOpaqueThemeSurfaces(await readStructuralThemeSurfaces(page));
    expectSearchStructure(await readSearchStructuralSurfaces(page));
  });

  test('renders colored white and black interaction states', async ({ page }) => {
    await expectRootToken(page, '--qq-nav-hover', '#f5dede');
    await expectRootToken(page, '--qq-nav-active', 'color-mix(in srgb, #f5dede 84%, #cf3434 16%)');

    const homeTopNav = page.locator('.nav-top-section .nav-item').first();
    const inactiveTopNav = page.locator('.nav-top-section .nav-item').nth(1);

    await inactiveTopNav.hover();
    await expect.poll(() => readBackgroundColor(inactiveTopNav)).toBe('rgb(245, 222, 222)');
    await expect.poll(() => readBackgroundColor(homeTopNav)).not.toBe('rgb(245, 222, 222)');
    await expectNavigationOverlayDisabled(homeTopNav);
    await expectNavigationOverlayDisabled(inactiveTopNav);

    const playlistNav = page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).first();
    await playlistNav.click();
    await expect(playlistNav).toHaveClass(/nav-playlist-item-active/);
    await expect.poll(() => readBackgroundColor(playlistNav)).not.toBe('rgb(232, 235, 238)');
    await expectNavigationOverlayDisabled(playlistNav);

    const rows = page.locator('.playlist-detail-song-row');
    await expect(rows).toHaveCount(3);
    await rows.nth(1).hover();
    await expectSongHoverCloserToSurface(rows.nth(1));

    await rows.first().dblclick({ position: { x: 92, y: 24 } });
    await expect(rows.first()).toHaveClass(/song-row-current/);
    await page.mouse.move(900, 28);
    const currentRow = page.locator('.playlist-detail-song-row.song-row-current');
    await expect(currentRow).toHaveCount(1);
    await waitForCurrentSongBackgroundClear(page, currentRow);

    const defaultCurrentState = await readCurrentSongState(page, currentRow);
    expect(defaultCurrentState.background[3]).toBe(0);
    expect(defaultCurrentState.informationColors).toEqual([
      'rgb(207, 52, 52)',
      'rgb(207, 52, 52)',
      'rgb(207, 52, 52)',
      'rgb(207, 52, 52)'
    ]);
    expect(defaultCurrentState.bottomPlayIconColor).toBe('rgb(255, 255, 255)');
    expect(defaultCurrentState.playlistPlayIconColor).toBe('rgb(255, 255, 255)');
    expect(defaultCurrentState.playlistPlayLabelColor).toBe('rgb(255, 255, 255)');
    expect(defaultCurrentState.bottomPlayBackground.rgba).toEqual(defaultCurrentState.primaryAction.rgba);
    expect(defaultCurrentState.playlistPlayBackground.rgba).toEqual(defaultCurrentState.primaryAction.rgba);
    expect(contrastRatio(defaultCurrentState.primaryAction.rgba, [255, 255, 255, 255])).toBeGreaterThanOrEqual(4.5);

    const playbackNoticeClose = page.locator('.playback-notice-close');
    if (await playbackNoticeClose.count()) {
      await playbackNoticeClose.click();
      await expect(page.locator('.playback-notice')).toHaveCount(0);
    }
    await expect(page.locator('.playback-started-toast')).toHaveCount(0, { timeout: 2_500 });

    const playerBar = page.locator('.player-bar');
    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.locator('.queue-panel');
    await expect(queuePanel).toBeVisible();
    await waitForQueuePanelSettled(queuePanel);

    const defaultQueueSurface = await readGlassSurface(queuePanel);
    const defaultPlayerSurface = await readGlassSurface(playerBar);
    expect(defaultQueueSurface.backgroundImage).toContain('linear-gradient');
    expect(readBackdropBlurPx(defaultQueueSurface.backdropFilter)).toBe(24);
    expect(defaultPlayerSurface.backgroundImage).toContain('linear-gradient');
    expect(readBackdropBlurPx(defaultPlayerSurface.backdropFilter)).toBe(24);

    await inactiveTopNav.hover();

    await page.screenshot({
      path: 'artifacts/ui-checks/theme-interactions-default-white.png',
      fullPage: true
    });

    await playerBar.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveCount(0);

    await page.locator('.theme-trigger').click();
    await page.locator('.theme-card-list .theme-card').nth(2).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('black');
    await page.keyboard.press('Escape');
    await expect(page.locator('.theme-popover')).toHaveCount(0);

    await expectRootToken(page, '--qq-nav-hover', '#153a3e');
    await expectRootToken(page, '--qq-nav-active', 'color-mix(in srgb, #153a3e 84%, #247981 16%)');
    await expectNavigationOverlayDisabled(homeTopNav);
    await expectNavigationOverlayDisabled(inactiveTopNav);
    await inactiveTopNav.hover();
    const blackHoverBackground = await readBackgroundColor(inactiveTopNav);
    const blackSelectedBackground = await readBackgroundColor(playlistNav);
    expect(blackSelectedBackground).not.toBe(blackHoverBackground);
    expect(await readBorderRadius(inactiveTopNav)).toBe('12px');
    expect(await readBorderRadius(playlistNav)).toBe('10px');
    await rows.nth(1).hover();
    await expectSongHoverCloserToSurface(rows.nth(1));
    await page.mouse.move(900, 28);
    await waitForCurrentSongBackgroundClear(page, currentRow);

    const blackCurrentState = await readCurrentSongState(page, currentRow);
    expect(blackCurrentState.background[3]).toBe(0);
    expect(blackCurrentState.informationColors).toEqual([
      'rgb(36, 121, 129)',
      'rgb(36, 121, 129)',
      'rgb(36, 121, 129)',
      'rgb(36, 121, 129)'
    ]);
    expect(blackCurrentState.bottomPlayIconColor).toBe('rgb(255, 255, 255)');
    expect(blackCurrentState.playlistPlayIconColor).toBe('rgb(255, 255, 255)');
    expect(blackCurrentState.playlistPlayLabelColor).toBe('rgb(255, 255, 255)');
    expect(blackCurrentState.bottomPlayBackground.rgba).toEqual(blackCurrentState.primaryAction.rgba);
    expect(blackCurrentState.playlistPlayBackground.rgba).toEqual(blackCurrentState.primaryAction.rgba);
    expect(contrastRatio(blackCurrentState.primaryAction.rgba, [255, 255, 255, 255])).toBeGreaterThanOrEqual(4.5);

    await page.getByRole('button', { name: '展开播放队列' }).click();
    await expect(queuePanel).toBeVisible();
    await waitForQueuePanelSettled(queuePanel);
    const blackQueueSurface = await readGlassSurface(queuePanel);
    expect(blackQueueSurface.backgroundImage).toContain('linear-gradient');
    expect(readBackdropBlurPx(blackQueueSurface.backdropFilter)).toBe(24);
    const blackPlayerSurface = await readGlassSurface(playerBar);
    expect(blackPlayerSurface.backgroundImage).toContain('linear-gradient');
    expect(readBackdropBlurPx(blackPlayerSurface.backdropFilter)).toBe(24);

    await inactiveTopNav.hover();

    await page.screenshot({
      path: 'artifacts/ui-checks/theme-interactions-ocean.png',
      fullPage: true
    });
  });
});

async function expectRootToken(page: Page, token: string, expected: string) {
  await expect.poll(() => page.evaluate((name) => (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  ), token)).toBe(expected);
}

async function readStructuralThemeSurfaces(page: Page) {
  return page.evaluate(() => {
    const readSurface = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`Unable to inspect structural theme surface: ${selector}`);
      }

      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage
      };
    };

    return {
      window: readSurface('.desktop-shell'),
      sidebar: readSurface('.sidebar'),
      contentFrame: readSurface('.content-frame'),
      topBar: readSurface('.top-bar'),
      mainContent: readSurface('.main-content'),
      transitionStage: readSurface('.main-content > .main-content-transition-stage'),
      transitionLayer: readSurface(
        '.main-content > .main-content-transition-stage > .main-content-transition-layer-active'
      )
    };
  });
}

async function readSearchStructuralSurfaces(page: Page) {
  return page.evaluate(() => {
    const readSurface = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`Unable to inspect search structural surface: ${selector}`);
      }

      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage
      };
    };

    return {
      contentFrame: readSurface('.content-frame'),
      searchView: readSurface('.qq-search-view'),
      searchHero: readSurface('.qq-search-hero'),
      resultTabs: readSurface('.search-result-tabs'),
      searchPanel: readSurface('.qq-search-panel'),
      songListHeader: readSurface('.qq-search-song-list-head')
    };
  });
}

function expectOpaqueThemeSurfaces(surfaces: Awaited<ReturnType<typeof readStructuralThemeSurfaces>>) {
  for (const [name, surface] of Object.entries(surfaces)) {
    if (name === 'topBar' || name === 'mainContent' || name === 'transitionStage' || name === 'transitionLayer') {
      continue;
    }
    expect(readAlpha(surface.backgroundColor), `${name} background color alpha`).toBe(1);
    expect(surface.backgroundImage, `${name} background image`).toContain('linear-gradient');
  }
}

function expectSearchStructure(surfaces: Awaited<ReturnType<typeof readSearchStructuralSurfaces>>) {
  for (const [name, surface] of Object.entries(surfaces)) {
    if (name === 'contentFrame') {
      expect(readAlpha(surface.backgroundColor), `${name} background color alpha`).toBe(1);
      expect(surface.backgroundImage, `${name} background image`).toContain('linear-gradient');
      continue;
    }

    if (name === 'searchView') {
      expect(readAlpha(surface.backgroundColor), `${name} background color alpha`).toBe(0);
      expect(surface.backgroundImage, `${name} background image`).toBe('none');
      continue;
    }

    expect(readAlpha(surface.backgroundColor), `${name} background color alpha`).toBe(0);
    expect(surface.backgroundImage, `${name} background image`).toBe('none');
  }
}

async function expectTransientGlassMaterial(
  page: Page,
  triggerSelector: string,
  popoverSelector: string,
  name: string
) {
  await page.locator(triggerSelector).click();
  const popover = page.locator(popoverSelector);
  await expectBlurredGlassMaterial(popover, name, 24);
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0, { timeout: 1_000 });
}

async function expectBlurredGlassMaterial(locator: Locator, name: string, minimumBlur: number) {
  await expect(locator).toHaveAttribute('data-state', 'open');
  const material = await readGlassSurface(locator);

  expect(material.backgroundImage, `${name} background`).toContain('linear-gradient');
  expect(readBackdropBlurPx(material.backdropFilter), `${name} backdrop blur`).toBe(minimumBlur);
}

async function readBackgroundColor(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

async function readBorderRadius(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).borderRadius);
}

async function readGlassSurface(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backdropFilter: style.backdropFilter
    };
  });
}

function readBackdropBlurPx(filter: string) {
  const match = filter.match(/blur\(([\d.]+)px\)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function readAlpha(color: string) {
  if (color === 'transparent') {
    return 0;
  }

  const slashAlphaMatch = color.match(/\/\s*([\d.]+%?)\s*\)/);
  if (slashAlphaMatch) {
    const alpha = slashAlphaMatch[1];
    return alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
  }

  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
  if (!rgbaMatch) {
    return 1;
  }

  const parts = rgbaMatch[1].split(',').map((part) => part.trim());
  return parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
}

async function waitForQueuePanelSettled(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
}

async function expectNavigationOverlayDisabled(locator: Locator) {
  await expect.poll(() => readNavigationOverlay(locator)).toEqual({
    content: 'none',
    backgroundImage: 'none',
    opacity: 0
  });
}

async function readNavigationOverlay(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element, '::before');

    return {
      content: style.content,
      backgroundImage: style.backgroundImage,
      opacity: Number.parseFloat(style.opacity)
    };
  });
}

async function expectSongHoverCloserToSurface(row: Locator) {
  const readColors = () => row.evaluate((element) => {
    const sample = (value: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });

      if (!context) {
        throw new Error('Unable to sample CSS color');
      }

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const resolve = (value: string) => {
      const probe = document.createElement('span');
      probe.style.background = value;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { css: resolved, rgba: sample(resolved) };
    };

    const actualCss = getComputedStyle(element, '::before').backgroundColor;

    return {
      actual: { css: actualCss, rgba: sample(actualCss) },
      token: resolve('var(--qq-song-hover)'),
      previous: resolve('var(--qq-hover)'),
      surface: resolve('var(--qq-content-bg)')
    };
  });
  await expect.poll(async () => {
    const colors = await readColors();
    return colors.actual.rgba;
  }).toEqual((await readColors()).token.rgba);

  const colors = await readColors();

  expect(colors.actual.rgba).toEqual(colors.token.rgba);
  expect(colors.actual.rgba).not.toEqual(colors.previous.rgba);
  expect(colorDistance(colors.actual.rgba, colors.surface.rgba)).toBeLessThan(
    colorDistance(colors.previous.rgba, colors.surface.rgba)
  );
}

async function readCurrentSongState(page: Page, row: Locator) {
  const background = await row.evaluate((element) => {
    const value = getComputedStyle(element, '::before').backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('Unable to sample current-song background');
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  const informationColors = await row.locator(
    '.song-row-main strong, .song-row-main small, .song-album, .playlist-detail-duration'
  ).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
  const bottomPlayButton = page.locator('.play-button');
  const playlistPlayButton = page.locator('.playlist-detail-play-button');

  return {
    background,
    informationColors,
    bottomPlayIconColor: await bottomPlayButton.locator('svg').evaluate((icon) => getComputedStyle(icon).color),
    playlistPlayIconColor: await playlistPlayButton.locator('svg').evaluate((icon) => getComputedStyle(icon).color),
    playlistPlayLabelColor: await playlistPlayButton.evaluate((button) => getComputedStyle(button).color),
    bottomPlayBackground: await readElementBackground(bottomPlayButton),
    playlistPlayBackground: await readElementBackground(playlistPlayButton),
    primaryAction: await readResolvedBackground(page, 'var(--qq-primary-action)')
  };
}

async function waitForCurrentSongBackgroundClear(page: Page, row: Locator) {
  await expect.poll(async () => (await readCurrentSongState(page, row)).background[3]).toBe(0);
}

async function readElementBackground(locator: Locator) {
  return locator.evaluate((element) => {
    const value = getComputedStyle(element).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('Unable to sample element background');
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);

    return {
      css: value,
      rgba: Array.from(context.getImageData(0, 0, 1, 1).data)
    };
  });
}

async function readResolvedBackground(page: Page, value: string) {
  return page.evaluate((background) => {
    const probe = document.createElement('span');
    probe.style.background = background;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      probe.remove();
      throw new Error('Unable to sample resolved background');
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const resolved = {
      css: value,
      rgba: Array.from(context.getImageData(0, 0, 1, 1).data)
    };
    probe.remove();
    return resolved;
  }, value);
}

function contrastRatio(first: number[], second: number[]) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);

  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function relativeLuminance(color: number[]) {
  const [red, green, blue] = color.slice(0, 3).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function colorDistance(first: number[], second: number[]) {
  return Math.sqrt(
    ((first[0] ?? 0) - (second[0] ?? 0)) ** 2 +
    ((first[1] ?? 0) - (second[1] ?? 0)) ** 2 +
    ((first[2] ?? 0) - (second[2] ?? 0)) ** 2
  );
}
