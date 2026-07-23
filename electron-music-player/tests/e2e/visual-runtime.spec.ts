import { expect, test, type Locator, type Page } from '@playwright/test';
import { qqVisualRuntimeData } from './fixtures/qqVisualFixtures';

const visualRuntimeUrl = process.env.VISUAL_RUNTIME_TEST_URL ?? '/';

interface LyricsEntranceGeometryMetrics {
  maxDeltas: number[];
  stageTransition: string;
  depthCoverTransition: string;
  depthTextTransition: string;
}

interface LyricsExitGeometryRect {
  centerX: number;
  centerY: number;
  height: number;
  opacity: number;
  visible: boolean;
  width: number;
}

interface LyricsExitGeometrySample {
  artwork: LyricsExitGeometryRect | null;
  at: number;
  portal: LyricsExitGeometryRect | null;
}

interface LyricsExitGeometryMetrics {
  beforeExit: LyricsExitGeometrySample;
  depthAtExitStart: Record<'coverTiltX' | 'coverTiltY' | 'stageTiltX' | 'stageTiltY', string>;
  exitStartedAt: number;
  samples: LyricsExitGeometrySample[];
}

interface LyricsExitHandoffMetrics {
  appBlurClearedAt: number | null;
  exitStartedAt: number;
  portalArrivedAt: number | null;
  sourceCoverRestoredAt: number | null;
}

test.describe('visual runtime', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((fixture) => {
      window.localStorage.setItem(
        'oubao-music-visual-preferences',
        JSON.stringify({ themePreference: 'light' })
      );

      const expectedSearchTerms = ['visual', 'runtime'];
      const isExpectedQqQuery = (query) =>
        typeof query === 'string' &&
        expectedSearchTerms.every((term) => query.toLowerCase().includes(term));
      const isKnownQqSong = (song) =>
        song?.providerId === 'qq' &&
        fixture.songs.some(
          (fixtureSong) =>
            fixtureSong.providerId === 'qq' &&
            fixtureSong.id === song?.id &&
            fixtureSong.platformSongId === song?.platformSongId
        );
      const discoveryCharts = {
        qq: [{
          id: 'qq:chart:visual-runtime',
          providerId: 'qq',
          platformChartId: 'visual-runtime',
          title: 'Visual Runtime Chart',
          description: 'QQ public chart fixture',
          songIds: [],
          coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
          sourceLabel: 'QQ音乐',
          updateLabel: '每日更新'
        }],
        netease: [{
          id: 'netease:chart:visual-runtime',
          providerId: 'netease',
          platformChartId: 'visual-runtime',
          title: 'Visual Runtime 新歌榜',
          description: 'Netease public chart fixture',
          songIds: [],
          coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
          sourceLabel: '网易云',
          updateLabel: '每天更新'
        }]
      };
      const discoveryCategories = {
        qq: [
          { id: 'all', providerId: 'qq', name: '全部' },
          { id: 'visual-runtime', providerId: 'qq', name: '通勤', hot: true }
        ],
        netease: [
          { id: 'all', providerId: 'netease', name: '全部' },
          { id: '华语', providerId: 'netease', name: '华语', hot: true }
        ]
      };
      const qqDiscoveryPlaylists = fixture.playlists.map((playlist, index) => ({
        ...playlist,
        platformPlaylistId: `visual-runtime-${index + 1}`,
        creatorName: `Visual Runtime Creator ${index + 1}`,
        playCount: 10_000 + index * 1_000,
        trackCount: playlist.songIds.length
      }));

      window.musicPlayer = {
        app: {
          getVersion: async () => '0.1.0'
        },
        window: {
          minimize: () => undefined,
          toggleMaximize: () => undefined,
          close: () => undefined
        },
        music: {
          getLoginStatus: async (providerId) => ({
            ok: true,
            data: {
              providerId,
              loggedIn: providerId === 'qq',
              nickname: providerId === 'qq' ? 'QQ 用户' : undefined,
              playbackReady: false
            }
          }),
          login: async (providerId) => ({
            ok: true,
            data: {
              providerId,
              loggedIn: providerId === 'qq',
              nickname: providerId === 'qq' ? 'QQ 用户' : undefined,
              playbackReady: false
            }
          }),
          logout: async () => ({ ok: true, data: undefined }),
          search: async (providerId, query) => ({
            ok: true,
            data: providerId === 'qq' && isExpectedQqQuery(query) ? fixture.songs : []
          }),
          getSearchSuggestions: async (providerId, keyword) => ({
            ok: true,
            data: providerId === 'qq'
              ? [{
                  id: `qq:suggestion:${String(keyword).toLowerCase()}`,
                  providerId: 'qq',
                  keyword: String(keyword),
                  title: String(keyword),
                  kind: 'song',
                  subtitle: fixture.songs[0]?.artist ?? 'Visual Runtime Artist'
                }]
              : []
          }),
          getSearchHotSearches: async (providerId) => ({
            ok: true,
            data: providerId === 'qq'
              ? [{ id: 'qq:hot:visual-runtime', providerId: 'qq', keyword: 'visual runtime', title: 'Visual runtime', rank: 1 }]
              : []
          }),
          searchEntities: async (providerId, query) => {
            const songs = providerId === 'qq' && isExpectedQqQuery(query) ? fixture.songs : [];
            return {
              ok: true,
              data: {
                providerId,
                keyword: String(query),
                sections: {
                  songs: { available: true, items: songs, total: songs.length, hasMore: false, errorMessage: null },
                  artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
                  albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
                  playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
                }
              }
            };
          },
          getUserPlaylists: async (providerId) => ({ ok: true, data: providerId === 'qq' ? fixture.playlists : [] }),
          getPlaylistTracks: async (providerId, playlistId) => {
            const requestCountKey = `visual-runtime:playlist-track-requests:${providerId}:${playlistId}`;
            const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
            window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));
            const playlist = providerId === 'qq'
              ? fixture.playlists.find((candidate) => candidate.id === playlistId)
              : undefined;

            return {
              ok: true,
              data: playlist
                ? fixture.songs.filter((song) => playlist.songIds.includes(song.id))
                : []
            };
          },
          getCharts: async (providerId) => {
            const count = Number.parseInt(window.sessionStorage.getItem('visual-runtime:getCharts') ?? '0', 10);
            window.sessionStorage.setItem('visual-runtime:getCharts', String(count + 1));
            return {
              ok: true,
              data: discoveryCharts[providerId] ?? []
            };
          },
          getChartTracks: async (providerId, chartId) => {
            const count = Number.parseInt(window.sessionStorage.getItem('visual-runtime:getChartTracks') ?? '0', 10);
            window.sessionStorage.setItem('visual-runtime:getChartTracks', String(count + 1));
            return {
              ok: true,
              data: providerId === 'qq' && chartId === discoveryCharts.qq[0].id
                ? fixture.songs.map((song) => ({
                    ...song,
                    sourceContext: {
                      type: 'playlist',
                      providerId: 'qq',
                      playlistId: chartId,
                      playlistTitle: discoveryCharts.qq[0].title
                    }
                  }))
                : []
            };
          },
          getPlaylistCategories: async (providerId) => ({
            ok: true,
            data: discoveryCategories[providerId] ?? []
          }),
          getDiscoveredPlaylists: async (providerId, query) => {
            const count = Number.parseInt(window.sessionStorage.getItem('visual-runtime:getDiscoveredPlaylists') ?? '0', 10);
            window.sessionStorage.setItem('visual-runtime:getDiscoveredPlaylists', String(count + 1));
            const playlists = providerId === 'qq' ? qqDiscoveryPlaylists : [];
            const offset = query.offset ?? 0;

            return {
              ok: true,
              data: {
                providerId,
                categoryId: query.categoryId,
                playlists: playlists.slice(offset, offset + (query.limit ?? 30)),
                offset,
                limit: query.limit ?? 30,
                total: playlists.length,
                hasMore: offset + (query.limit ?? 30) < playlists.length
              }
            };
          },
          getRecommendationHome: async (providerId) => ({
            ok: providerId === 'netease',
            ...(providerId === 'netease'
              ? {
                  data: {
                    providerId,
                    loggedIn: false,
                    dailySongs: [],
                    newSongs: [],
                    moduleResults: {
                      daily: { status: 'skipped', errorMessage: null },
                      new: { status: 'fulfilled', errorMessage: null }
                    }
                  }
                }
              : {
                  error: {
                    code: 'provider_unsupported',
                    providerId,
                    message: 'QQ 音乐暂不支持推荐首页能力'
                  }
              })
          }),
          getNewAlbums: async () => ({ ok: true, data: [] }),
          getHomepageBlocks: async (providerId) => ({
            ok: true,
            data: { providerId, blocks: [] }
          }),
          getSongUrl: async (providerId, song, quality) => ({
            ok: true,
            data: {
              ok: providerId === 'qq' && isKnownQqSong(song),
              providerId,
              quality,
              url: providerId === 'qq' && isKnownQqSong(song) ? `https://example.test/${song.platformSongId}.mp3` : ''
            }
          }),
          getLyrics: async (providerId, song) => ({
            ok: true,
            data: {
              ok: providerId === 'qq' && isKnownQqSong(song),
              providerId,
              lrc: providerId === 'qq' && isKnownQqSong(song) ? fixture.lyrics : ''
            }
          }),
          importLocalFiles: async () => ({ ok: true, data: [] })
        }
      };
    }, qqVisualRuntimeData);
    await page.goto(visualRuntimeUrl);
    await expect(page.locator('.qq-discovery-home')).toBeVisible();
  });

  test('keeps the QQ surface free of ambient visual backdrop', async ({ page }) => {
    const canvas = page.getByTestId('visual-backdrop-canvas');

    await expect.poll(() => canvas.getAttribute('data-visual-mode')).toBe('disabled');
    await expect(page.locator('.visual-backdrop')).toBeHidden();
    await expect(canvas).toBeHidden();
    await expect(page.locator('.ambient-mesh')).toBeHidden();
    await expect(page.locator('.ambient-sheet')).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('white');

    const canvasState = await canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      const mode = element.dataset.visualMode ?? '';
      const rect = element.getBoundingClientRect();

      return {
        mode,
        width: element.width,
        height: element.height,
        visibleWidth: rect.width,
        visibleHeight: rect.height
      };
    });

    expect(canvasState.visibleWidth).toBe(0);
    expect(canvasState.visibleHeight).toBe(0);
    expect(canvasState.width).toBe(0);
    expect(canvasState.height).toBe(0);
  });

  test('keeps top bar controls separated at constrained desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 1220, height: 780 });

    const metrics = await page.evaluate(() => {
      const search = document.querySelector('.search-box')?.getBoundingClientRect();
      const theme = document.querySelector('.theme-switcher')?.getBoundingClientRect();
      const login = document.querySelector('.login-button')?.getBoundingClientRect();

      if (!search || !theme || !login) {
        throw new Error('Unable to find top bar controls');
      }

      return {
        searchRight: search.right,
        themeLeft: theme.left,
        loginHeight: login.height,
        loginWidth: login.width
      };
    });

    expect(metrics.searchRight).toBeLessThanOrEqual(metrics.themeLeft - 8);
    expect(metrics.loginHeight).toBeLessThanOrEqual(38);
    expect(metrics.loginWidth).toBeGreaterThanOrEqual(66);
  });

  test('coordinates top popover dismissal and themed play-button shadows', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'compact'
      ? { width: 1040, height: 720 }
      : { width: 1440, height: 900 });
    const topBar = page.locator('.top-bar');
    const themeTrigger = page.getByRole('button', { name: '主题设置' });
    const settingsTrigger = page.getByRole('button', { name: '设置', exact: true });

    await themeTrigger.click();
    const themePopover = page.getByRole('dialog', { name: '主题设置面板' });
    await expect(topBar).toHaveAttribute('data-top-popover', 'theme');
    await expect(themePopover).toHaveAttribute('data-top-popover-owner', 'theme');
    await themePopover.dispatchEvent('pointerdown');
    await expect(topBar).toHaveAttribute('data-top-popover', 'theme');

    await settingsTrigger.click();
    const settingsPopover = page.getByRole('dialog', { name: '设置面板', exact: true });
    await expect(topBar).toHaveAttribute('data-top-popover', 'settings');
    await expect(settingsPopover).toHaveAttribute('data-top-popover-owner', 'settings');
    await expect(page.locator('[data-top-popover-owner][data-state="open"]')).toHaveCount(1);
    await expect(page.locator('.top-bar-drag-surface')).toHaveCSS('-webkit-app-region', 'drag');
    await expect(page.locator('.top-drag-space')).toHaveCSS('-webkit-app-region', 'drag');

    await page.locator('.top-drag-space').dispatchEvent('pointerdown');
    await expect(topBar).not.toHaveAttribute('data-top-popover');

    await settingsTrigger.click();
    await page.locator('.main-content').dispatchEvent('pointerdown');
    await expect(topBar).not.toHaveAttribute('data-top-popover');

    await themeTrigger.click();
    await page.keyboard.press('Escape');
    await expect(topBar).not.toHaveAttribute('data-top-popover');

    await settingsTrigger.click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(topBar).not.toHaveAttribute('data-top-popover');

    const playButton = page.locator('.play-button');
    const basePlayStyle = await playButton.evaluate((button) => ({
      boxShadow: getComputedStyle(button).boxShadow,
      primaryAction: getComputedStyle(document.documentElement).getPropertyValue('--qq-primary-action').trim()
    }));
    await playButton.hover();
    const hoverPlayStyle = await playButton.evaluate((button) => ({
      boxShadow: getComputedStyle(button).boxShadow,
      transform: getComputedStyle(button).transform
    }));

    expect(basePlayStyle.primaryAction).not.toBe('');
    expect(basePlayStyle.boxShadow).not.toBe('none');
    expect(hoverPlayStyle.boxShadow).not.toBe('none');
    expect(hoverPlayStyle.boxShadow).not.toBe(basePlayStyle.boxShadow);
    expect(hoverPlayStyle.transform).toBe('none');
    await page.screenshot({
      path: `artifacts/ui-checks/top-popover-play-shadow-${testInfo.project.name}.png`
    });
  });

  test('keeps bottom player action buttons inside the bar at constrained desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });

    const metrics = await page.evaluate(() => {
      const playerBar = document.querySelector('.player-bar')?.getBoundingClientRect();
      const playerActions = document.querySelector('.player-actions')?.getBoundingClientRect();
      const actionButtons = Array.from(document.querySelectorAll('.player-actions button')).map((button) =>
        button.getBoundingClientRect()
      );

      if (!playerBar || !playerActions || actionButtons.length === 0) {
        throw new Error('Unable to measure player actions');
      }

      return {
        playerBarRight: playerBar.right,
        actionsRight: playerActions.right,
        actionsWidth: playerActions.width,
        clippedButtonCount: actionButtons.filter((button) => button.left < playerBar.left || button.right > playerBar.right).length,
        minButtonWidth: Math.min(...actionButtons.map((button) => button.width))
      };
    });

    expect(metrics.actionsRight).toBeLessThanOrEqual(metrics.playerBarRight);
    expect(metrics.actionsWidth).toBeGreaterThanOrEqual(116);
    expect(metrics.clippedButtonCount).toBe(0);
    expect(metrics.minButtonWidth).toBeGreaterThanOrEqual(32);
  });

  test('keeps the song cover painted through the back half of its flip', async ({ page }, testInfo) => {
    await page.evaluate((audioUrl) => {
      window.musicPlayer.music.getSongUrl = async (providerId, _song, quality) => ({
        ok: true,
        data: { ok: true, providerId, quality, url: audioUrl }
      });
    }, createSilentWavDataUrl());
    await playFirstVisualRuntimeSong(page);
    const cover = page.locator('.player-bar .cover-thumb-button');
    await expect(cover).toBeVisible();
    const pauseStyle = await page.addStyleTag({
      content: [
        '.cover-thumb-song-switching .cover-thumb-artwork {',
        '  animation-play-state: paused !important;',
        '}'
      ].join('\n')
    });
    const secondSong = page.locator('.search-result-row').filter({ hasText: 'Visual Runtime Song 2' }).first();
    await secondSong.dblclick({ position: { x: 92, y: 24 } });
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Visual Runtime Song 2');
    await expect(cover).toHaveAttribute('data-song-transition', 'switching');
    const faceTones = await cover.evaluate((element) => ({
      front: (element.querySelector('.cover-thumb-artwork-front') as HTMLElement | null)
        ?.style.getPropertyValue('--cover-tone') ?? '',
      back: (element.querySelector('.cover-thumb-artwork-back') as HTMLElement | null)
        ?.style.getPropertyValue('--cover-tone') ?? ''
    }));
    await cover.evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.currentTime = 260;
      }
    });
    const peakBlur = await cover.locator('.cover-thumb-artwork-back').evaluate((artwork) => getComputedStyle(artwork).filter);
    const midpointFrameState = await cover.evaluate((element) => {
      const after = getComputedStyle(element, '::after');
      const front = element.querySelector<HTMLElement>('.cover-thumb-artwork-front');
      const back = element.querySelector<HTMLElement>('.cover-thumb-artwork-back');

      return {
        afterContent: after.content,
        backTiming: back ? getComputedStyle(back).animationTimingFunction : '',
        frontTiming: front ? getComputedStyle(front).animationTimingFunction : ''
      };
    });
    await cover.evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.currentTime = 390;
      }
    });
    const coverState = await cover.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

      return {
        backfaceVisibility: getComputedStyle(element).backfaceVisibility,
        hitCover: Boolean(hit?.closest('.cover-thumb-button'))
      };
    });
    const artworkState = await cover.locator('.cover-thumb-artwork-back').evaluate((artwork) => {
      const style = getComputedStyle(artwork);

      return {
        backfaceVisibility: style.backfaceVisibility,
        backgroundImage: style.backgroundImage,
        transform: style.transform
      };
    });
    const screenshot = await cover.screenshot({
      path: `artifacts/ui-checks/player-cover-back-half-${testInfo.project.name}.png`
    });
    const colorfulPixelRatio = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to sample the cover screenshot');
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaquePixels = 0;
      let colorfulPixels = 0;

      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] < 240) {
          continue;
        }
        opaquePixels += 1;
        if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2])
          - Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 24) {
          colorfulPixels += 1;
        }
      }

      return opaquePixels === 0 ? 0 : colorfulPixels / opaquePixels;
    }, `data:image/png;base64,${screenshot.toString('base64')}`);

    expect(coverState.backfaceVisibility).toBe('visible');
    expect(coverState.hitCover).toBe(true);
    expect(faceTones.front).toBe(qqVisualRuntimeData.songs[0].coverTone);
    expect(faceTones.back).toBe(qqVisualRuntimeData.songs[1].coverTone);
    expect(artworkState.backfaceVisibility).toBe('hidden');
    expect(artworkState.backgroundImage).not.toBe('none');
    expect(artworkState.transform).not.toBe('none');
    expect(peakBlur).toContain('blur(10px)');
    expect(midpointFrameState.afterContent).toBe('none');
    expect(midpointFrameState.frontTiming).toBe('cubic-bezier(0.2, 0, 0.8, 0.5)');
    expect(midpointFrameState.backTiming).toBe('cubic-bezier(0.2, 0.5, 0.8, 1)');
    expect(colorfulPixelRatio).toBeGreaterThan(0.35);

    await pauseStyle.evaluate((style) => style.remove());
    await expect(cover).not.toHaveAttribute('data-song-transition', { timeout: 1_000 });
    const settledState = await cover.evaluate((element) => {
      const flipper = element.querySelector<HTMLElement>('.cover-thumb-flipper');
      if (!flipper) {
        throw new Error('Unable to find the cover flipper');
      }

      return {
        animationCount: flipper.getAnimations({ subtree: true }).length,
        backTone: (element.querySelector('.cover-thumb-artwork-back') as HTMLElement | null)
          ?.style.getPropertyValue('--cover-tone') ?? '',
        frontTone: (element.querySelector('.cover-thumb-artwork-front') as HTMLElement | null)
          ?.style.getPropertyValue('--cover-tone') ?? '',
        transform: getComputedStyle(flipper).transform,
        transitionDuration: getComputedStyle(flipper).transitionDuration
      };
    });
    expect(settledState.animationCount).toBe(0);
    expect(settledState.frontTone).toBe(qqVisualRuntimeData.songs[1].coverTone);
    expect(settledState.backTone).toBe(qqVisualRuntimeData.songs[1].coverTone);
    expect(settledState.transform).toBe('none');
    expect(settledState.transitionDuration).toBe('0s');
    await cover.screenshot({
      path: `artifacts/ui-checks/player-cover-settled-${testInfo.project.name}.png`
    });
  });

  test('uses the unified persistent chrome blur on the bottom player bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const initialPlayerBarStyle = await page.locator('.player-bar').evaluate((bar) => {
      const style = getComputedStyle(bar);

      return {
        backdropFilter: style.backdropFilter,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderTopStyle: style.borderTopStyle,
        boxShadow: style.boxShadow,
        persistentChromeFilter: getComputedStyle(document.documentElement).getPropertyValue('--qq-persistent-chrome-filter').trim(),
        sharedGlassFilter: getComputedStyle(document.documentElement).getPropertyValue('--qq-glass-filter').trim()
      };
    });

    expect(initialPlayerBarStyle.backdropFilter).toContain('blur');
    expect(readBackdropBlurPx(initialPlayerBarStyle.backdropFilter)).toBe(24);
    expect(initialPlayerBarStyle.persistentChromeFilter).toContain('blur(24px)');
    expect(initialPlayerBarStyle.persistentChromeFilter).not.toBe(initialPlayerBarStyle.sharedGlassFilter);
    expect(readAlpha(initialPlayerBarStyle.backgroundColor)).toBeLessThan(1);
    expect(initialPlayerBarStyle.backgroundImage).not.toBe('none');
    expect(initialPlayerBarStyle.borderTopStyle).toBe('none');
    expect(initialPlayerBarStyle.boxShadow).not.toBe('none');

    const backdropGeometry = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;
      const playerBar = document.querySelector('.player-bar') as HTMLElement | null;

      if (!mainContent || !playerBar) {
        throw new Error('Unable to inspect bottom player backdrop geometry');
      }

      const mainRect = mainContent.getBoundingClientRect();
      const playerRect = playerBar.getBoundingClientRect();

      return {
        overlap: mainRect.bottom - playerRect.top,
        mainBottom: mainRect.bottom,
        playerTop: playerRect.top,
        playerBottom: playerRect.bottom
      };
    });

    expect(backdropGeometry.overlap).toBeGreaterThan(36);
    expect(backdropGeometry.mainBottom).toBeGreaterThanOrEqual(backdropGeometry.playerBottom - 1);

    await page.locator('.theme-trigger').click();
    await page.getByRole('button', { name: '使用黑色显示模式' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('black');

    const oceanPlayerBarStyle = await page.locator('.player-bar').evaluate((bar) => {
      const style = getComputedStyle(bar);

      return {
        backgroundImage: style.backgroundImage,
        qqAccent: getComputedStyle(document.documentElement).getPropertyValue('--qq-accent').trim()
      };
    });

    expect(oceanPlayerBarStyle.qqAccent).toBe('#247981');
    expect(oceanPlayerBarStyle.backgroundImage).not.toBe(initialPlayerBarStyle.backgroundImage);
  });

  test('opens lyrics as a full-window stage with no maximize toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await expect(page.locator('.lyrics-immersive-toggle')).toHaveCount(0);
    await expect(page.locator('.lyrics-collapse')).toBeVisible();
    await expect(page.getByText('Visible QQ lyric line')).toBeVisible();

    const overlayMetrics = await page.evaluate(() => {
      const overlay = document.querySelector('.lyrics-overlay')?.getBoundingClientRect();
      const panel = document.querySelector('.lyrics-panel')?.getBoundingClientRect();
      const stage = document.querySelector('.playback-stage-3d')?.getBoundingClientRect();

      if (!overlay || !panel || !stage) {
        throw new Error('Unable to measure lyrics stage');
      }

      return {
        overlayWidth: overlay.width,
        overlayHeight: overlay.height,
        panelWidth: panel.width,
        panelHeight: panel.height,
        stageLeft: stage.left,
        stageRight: stage.right,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });

    expect(overlayMetrics.overlayWidth).toBe(overlayMetrics.viewportWidth);
    expect(overlayMetrics.overlayHeight).toBe(overlayMetrics.viewportHeight);
    expect(overlayMetrics.panelWidth).toBe(overlayMetrics.viewportWidth);
    expect(overlayMetrics.panelHeight).toBe(overlayMetrics.viewportHeight);
    expect(overlayMetrics.stageLeft).toBeGreaterThanOrEqual(40);
    expect(overlayMetrics.stageRight).toBeLessThanOrEqual(overlayMetrics.viewportWidth - 40);

    const layerState = await page.evaluate(() => {
      const overlay = document.querySelector('.lyrics-overlay') as HTMLElement | null;
      const topBar = document.querySelector('.top-bar') as HTMLElement | null;
      const search = document.querySelector('.search-box')?.getBoundingClientRect();

      if (!overlay || !topBar || !search) {
        throw new Error('Unable to inspect lyrics layer ordering');
      }

      const hit = document.elementFromPoint(search.left + search.width / 2, search.top + search.height / 2);

      return {
        hitLyricsOverlay: Boolean(hit?.closest('.lyrics-overlay')),
        overlayZIndex: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
        topBarZIndex: Number.parseInt(getComputedStyle(topBar).zIndex, 10)
      };
    });

    expect(layerState.hitLyricsOverlay).toBe(true);
    expect(layerState.overlayZIndex).toBeGreaterThan(layerState.topBarZIndex);
  });

  test('keeps one moving character fill with persistent character glow', async ({ page }) => {
    await openLyricsFromCover(page);
    const audio = page.locator('audio');

    await expect.poll(async () => {
      await audio.evaluate((element) => {
        const audioElement = element as HTMLAudioElement;
        audioElement.currentTime = 6.29;
        audioElement.dispatchEvent(new Event('timeupdate', { bubbles: true }));
      });
      return page.locator('.lyric-active .lyric-char').count();
    }).toBeGreaterThanOrEqual(15);
    await expect(page.locator('.lyric-active .lyric-char').nth(12)).toHaveClass(/lyric-char-in-progress/);
    await page.waitForTimeout(220);

    const boundaryState = await audio.evaluate(async (element) => {
      const audioElement = element as HTMLAudioElement;
      audioElement.currentTime = 6.303;
      audioElement.dispatchEvent(new Event('timeupdate', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const chars = Array.from(document.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));
      const outgoing = chars[12];
      const incoming = chars[13];
      const lyricsLines = document.querySelector<HTMLElement>('.lyrics-lines');
      return {
        mediaClockActive: lyricsLines?.dataset.lyricMediaClock === 'active',
        fractionalCount: chars.filter((char) => {
          const progress = Number(char.style.getPropertyValue('--lyric-char-progress'));
          return progress > 0 && progress < 1;
        }).length,
        inProgressCount: chars.filter((char) => char.classList.contains('lyric-char-in-progress')).length,
        outgoingFillRightInset: (() => {
          const clipPath = getComputedStyle(outgoing, '::after').clipPath;
          const values = clipPath.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
          return values.length > 1 ? values[1] : values[0] ?? Number.NaN;
        })(),
        outgoingFillTransitionDuration: getComputedStyle(outgoing, '::after').transitionDuration,
        incomingFillTransitionDuration: getComputedStyle(incoming, '::after').transitionDuration
      };
    });

    expect(boundaryState.fractionalCount).toBe(1);
    expect(boundaryState.inProgressCount).toBe(1);
    expect(boundaryState.outgoingFillRightInset).toBeCloseTo(0, 3);
    expect(boundaryState.outgoingFillTransitionDuration).toBe('0s');
    expect(boundaryState.incomingFillTransitionDuration).toBe(
      boundaryState.mediaClockActive ? '0s' : '0.18s'
    );

    const fillTransitionState = await audio.evaluate(async (element) => {
      const audioElement = element as HTMLAudioElement;
      audioElement.currentTime = 6.45;
      audioElement.dispatchEvent(new Event('timeupdate', { bubbles: true }));
      const readFillInsets = () => Array.from(document.querySelectorAll<HTMLElement>('.lyric-active .lyric-char')).map((char, index) => {
        if (!char.classList.contains('lyric-char-filled')) {
          return { index, isCurrent: false, rightInset: null };
        }
        const clipPath = getComputedStyle(char, '::after').clipPath;
        const values = clipPath.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
        return {
          index,
          isCurrent: char.classList.contains('lyric-char-in-progress'),
          rightInset: values.length > 1 ? values[1] : values[0] ?? Number.NaN
        };
      });

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = readFillInsets();
      audioElement.currentTime = 6.54;
      audioElement.dispatchEvent(new Event('timeupdate', { bubbles: true }));
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const waitForSample = () => {
          if (performance.now() - startedAt >= 90) {
            resolve();
            return;
          }
          requestAnimationFrame(waitForSample);
        };
        requestAnimationFrame(waitForSample);
      });
      return { first, second: readFillInsets() };
    });

    const changingFillIndexes = fillTransitionState.first
      .filter((first) => {
        const second = fillTransitionState.second[first.index];
        return first.rightInset !== null && second?.rightInset !== null && Math.abs(first.rightInset - second.rightInset) > 0.01;
      })
      .map(({ index }) => index);
    expect(changingFillIndexes).toEqual([13]);
    expect(fillTransitionState.first[12].rightInset).toBeCloseTo(0, 3);
    expect(fillTransitionState.second[12].rightInset).toBeCloseTo(0, 3);
    expect(fillTransitionState.first[13].isCurrent).toBe(true);
    expect(fillTransitionState.second[13].rightInset).toBeLessThan(fillTransitionState.first[13].rightInset ?? 0);
    await page.waitForTimeout(140);

    const glowState = await page.locator('.lyrics-lines').evaluate((viewport) => {
      const chars = Array.from(viewport.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));
      const line = viewport.querySelector<HTMLElement>('.lyric-active');
      if (!line) {
        throw new Error('Unable to inspect active lyric line');
      }
      return {
        completedOpacity: Number.parseFloat(getComputedStyle(chars[12], '::before').opacity),
        currentOpacity: Number.parseFloat(getComputedStyle(chars[13], '::before').opacity),
        futureOpacity: Number.parseFloat(getComputedStyle(chars[14], '::before').opacity),
        lineBackground: getComputedStyle(line).backgroundColor,
        lineBoxShadow: getComputedStyle(line).boxShadow,
        lineBeforeContent: getComputedStyle(line, '::before').content,
        lineAfterContent: getComputedStyle(line, '::after').content
      };
    });

    expect(glowState.completedOpacity).toBeCloseTo(0.6, 2);
    expect(glowState.currentOpacity).toBeGreaterThan(glowState.completedOpacity);
    expect(glowState.futureOpacity).toBe(0);
    expect(glowState.lineBackground).toBe('rgba(0, 0, 0, 0)');
    expect(glowState.lineBoxShadow).toBe('none');
    expect(glowState.lineBeforeContent).toBe('none');
    expect(glowState.lineAfterContent).toBe('none');
    await page.screenshot({
      path: 'artifacts/ui-checks/lyrics-single-fill-persistent-glow.png'
    });

    const slider = page.locator('.lyrics-player-bar .progress-line input[type="range"]');
    await slider.evaluate((element) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, '9000');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('.lyrics-lines')).toHaveAttribute('data-lyric-glow-transition', 'instant');

    const seekState = await page.locator('.lyrics-lines').evaluate((viewport) => {
      const chars = Array.from(viewport.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));
      return {
        fillTransitionDurations: chars.map((char) => getComputedStyle(char, '::after').transitionDuration),
        glowTransitionDurations: chars.map((char) => getComputedStyle(char, '::before').transitionDuration)
      };
    });

    expect(new Set(seekState.fillTransitionDurations)).toEqual(new Set(['0s']));
    expect(new Set(seekState.glowTransitionDurations)).toEqual(new Set(['0s']));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceEffects)).toBe('true');
    await audio.evaluate((element) => {
      const audioElement = element as HTMLAudioElement;
      audioElement.currentTime = 9.1;
      audioElement.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    });
    await expect(page.locator('.lyrics-lines')).toHaveAttribute('data-lyric-glow-transition', 'flowing');
    const reducedMotionState = await page.locator('.lyrics-lines').evaluate((viewport) => {
      const chars = Array.from(viewport.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));
      return {
        mediaClockActive: viewport.dataset.lyricMediaClock === 'active',
        fillTransitionDurations: chars.map((char) => getComputedStyle(char, '::after').transitionDuration),
        glowDisplays: chars.map((char) => getComputedStyle(char, '::before').display)
      };
    });
    expect(new Set(reducedMotionState.fillTransitionDurations)).toEqual(
      new Set(reducedMotionState.mediaClockActive ? ['0s'] : ['0s', '0.3s'])
    );
    expect(new Set(reducedMotionState.glowDisplays)).toEqual(new Set(['none']));
  });

  test('keeps 1000 lyrics lines windowed during continuous scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop lyrics performance sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const largeLyrics = Array.from({ length: 1000 }, (_, index) => {
      const minutes = String(Math.floor(index / 60)).padStart(2, '0');
      const seconds = String(index % 60).padStart(2, '0');
      return `[${minutes}:${seconds}.00]Performance lyric line ${index + 1}`;
    }).join('\n');

    await page.evaluate((lrc) => {
      window.musicPlayer.music.getLyrics = async (providerId) => ({
        ok: true,
        data: {
          ok: true,
          providerId,
          lrc
        }
      });
    }, largeLyrics);
    await openLyricsFromCover(page);
    const overlay = page.locator('.lyrics-overlay');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    const lyricsViewport = page.locator('.lyrics-lines');
    await expect(lyricsViewport).toHaveAttribute('data-virtualized', 'true');
    await expect.poll(() => page.locator('.lyric-line').count()).toBeLessThan(45);
    await page.screenshot({ path: 'artifacts/ui-checks/lyrics-large-windowed.png' });

    const metrics = await lyricsViewport.evaluate(async (viewport) => {
      const frameDurations: number[] = [];
      let longTaskDuration = 0;
      let maxRenderedLineCount = 0;
      let previousFrameTime: number | null = null;
      const longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = longTaskSupported
        ? new PerformanceObserver((list) => {
            longTaskDuration += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
          })
        : null;
      observer?.observe({ type: 'longtask', buffered: false });

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      for (let index = 1; index <= 90; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame((timestamp) => {
          if (previousFrameTime !== null) {
            frameDurations.push(timestamp - previousFrameTime);
          }
          previousFrameTime = timestamp;
          viewport.scrollTop = maxScrollTop * index / 90;
          viewport.dispatchEvent(new Event('scroll'));
          maxRenderedLineCount = Math.max(
            maxRenderedLineCount,
            viewport.querySelectorAll('.lyric-line').length
          );
          resolve();
        }));
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (observer) {
        longTaskDuration += observer.takeRecords().reduce((sum, entry) => sum + entry.duration, 0);
      }
      observer?.disconnect();

      const sortedDurations = [...frameDurations].sort((left, right) => left - right);
      const p95Index = Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * 0.95)
      );
      return {
        longTaskSupported,
        longTaskDuration,
        maxFrameDuration: Math.max(...frameDurations, 0),
        p95FrameDuration: sortedDurations[p95Index] ?? 0,
        maxRenderedLineCount
      };
    });

    expect(metrics.maxRenderedLineCount).toBeLessThan(45);
    expect(metrics.p95FrameDuration).toBeLessThanOrEqual(24);
    expect(metrics.maxFrameDuration).toBeLessThanOrEqual(50);
    if (metrics.longTaskSupported) {
      expect(metrics.longTaskDuration).toBe(0);
    }
  });

  test('keeps a very long active lyric chunked with full glow styling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop long-line visual sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const longLine = 'Long lyric glow segment '.repeat(40).trim();
    await page.evaluate((lrc) => {
      window.musicPlayer.music.getLyrics = async (providerId) => ({
        ok: true,
        data: {
          ok: true,
          providerId,
          lrc: `[00:00.00]${lrc}\n[00:20.00]Next lyric line`
        }
      });
    }, longLine);
    await openLyricsFromCover(page);
    const overlay = page.locator('.lyrics-overlay');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    await page.locator('audio').evaluate((element) => {
      const audio = element as HTMLAudioElement;
      audio.currentTime = 10;
      audio.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    });

    const activeLine = page.locator('.lyric-active.lyric-long-line');
    await expect(activeLine).toBeVisible();
    const state = await activeLine.evaluate((line) => {
      const filledChunk = line.querySelector<HTMLElement>('.lyric-char-chunk-filled');
      const rect = line.getBoundingClientRect();
      return {
        characterNodes: line.querySelectorAll('.lyric-char').length,
        chunkNodes: line.querySelectorAll('.lyric-char-chunk').length,
        glowShadow: filledChunk ? getComputedStyle(filledChunk).textShadow : 'none',
        right: rect.right,
        left: rect.left,
        viewportWidth: window.innerWidth
      };
    });
    expect(state.characterNodes).toBeLessThanOrEqual(48);
    expect(state.chunkNodes).toBeLessThan(24);
    expect(state.glowShadow).not.toBe('none');
    expect(state.left).toBeGreaterThanOrEqual(0);
    expect(state.right).toBeLessThanOrEqual(state.viewportWidth);
    await page.screenshot({ path: 'artifacts/ui-checks/lyrics-long-line-chunked.png' });
  });

  test('uses the cover portal as the only lyrics transition', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'compact' ? { width: 1040, height: 720 } : { width: 1440, height: 900 });
    await playFirstVisualRuntimeSong(page);
    await expect(page.locator('.search-suggestion-popover')).toHaveCount(0);
    const readPlayerChromeState = () => page.locator('.player-bar').evaluate((bar) => {
      const style = getComputedStyle(bar);
      const sourceCover = bar.querySelector<HTMLElement>('.cover-thumb-button');
      const sourceCoverStyle = sourceCover ? getComputedStyle(sourceCover) : null;
      return {
        backdropFilter: style.backdropFilter,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        opacity: style.opacity,
        sourceCoverOpacity: sourceCoverStyle?.opacity ?? '',
        sourceCoverVisibility: sourceCoverStyle?.visibility ?? ''
      };
    });
    const initialPlayerChrome = await readPlayerChromeState();

    await page.locator('.player-bar .cover-thumb-button').click();
    const overlay = page.locator('.lyrics-overlay');
    const lyricsPanel = page.locator('.lyrics-panel');
    const transitionFlight = page.locator('.lyrics-transition-flight');
    const sideTools = page.locator('.lyrics-side-tools');
    await expect(transitionFlight).toBeVisible();
    const transitionFlightBox = await transitionFlight.boundingBox();
    expect(transitionFlightBox?.width ?? 0).toBeLessThanOrEqual(140);
    expect(transitionFlightBox?.height ?? 0).toBeLessThanOrEqual(140);
    await expect(page.locator('.lyrics-toolbar .lyrics-transition-switch')).toHaveCount(0);
    await expect(page.locator('.lyrics-transition-curtain')).toHaveCount(0);
    await expect(page.locator('.lyrics-transition-refraction')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /歌词转场/ })).toHaveCount(0);

    const sideToolsPosition = await sideTools.evaluate((element) => getComputedStyle(element).position);
    expect(sideToolsPosition).toBe('fixed');

    await expect(transitionFlight).toBeHidden();
    const settledLyricsGeometry = await page.evaluate(() => {
      const artwork = document.querySelector('.lyrics-art')?.getBoundingClientRect();
      const title = document.querySelector('.lyrics-depth-title')?.getBoundingClientRect();
      const lyrics = document.querySelector('.lyrics-lines')?.getBoundingClientRect();

      if (!artwork || !title || !lyrics) {
        throw new Error('Unable to measure settled lyrics geometry');
      }

      return { artworkTop: artwork.top, titleTop: title.top, lyricsTop: lyrics.top };
    });
    expect(settledLyricsGeometry.artworkTop).toBeLessThanOrEqual(260);
    expect(settledLyricsGeometry.titleTop).toBeLessThanOrEqual(260);
    expect(settledLyricsGeometry.lyricsTop).toBeLessThanOrEqual(520);
    await expect(lyricsPanel).toHaveCSS('filter', 'none');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    await expect.poll(() => readLyricsPlayerLayerState(page).then((state) => state.playerOpacity))
      .toBeGreaterThan(0.95);
    const settledPlayerLayer = await readLyricsPlayerLayerState(page);
    expect(settledPlayerLayer.playerIsInsideOverlay).toBe(true);
    expect(settledPlayerLayer.playerPointerEvents).toBe('auto');
    expect(settledPlayerLayer.playerAnimationName).toContain('lyricsImmersivePlayerIn');
    expect(settledPlayerLayer.playerBackgroundImage).toContain('linear-gradient');
    expect(settledPlayerLayer.playerBackdropFilter).toBe('none');
    expect(settledPlayerLayer.playerFilter).toBe('none');
    expect(settledPlayerLayer.playerHitLyricsPlayerBar).toBe(true);
    expect(settledPlayerLayer.playerHitMainPlayer).toBe(false);
    expect(settledPlayerLayer.playerLeft).toBeCloseTo(0, 0);
    expect(settledPlayerLayer.playerRight).toBeCloseTo(settledPlayerLayer.viewportWidth, 0);
    expect(Math.abs(settledPlayerLayer.viewportHeight - settledPlayerLayer.playerBottom)).toBeLessThanOrEqual(4);
    await page.screenshot({
      path: `artifacts/ui-checks/lyrics-transition-${testInfo.project.name}-portal.png`
    });
    await page.evaluate(() => {
      const captureWindow = window as typeof window & {
        __lyricsExitHandoffCapture?: Promise<LyricsExitHandoffMetrics>;
      };
      const overlayElement = document.querySelector<HTMLElement>('.lyrics-overlay');
      const sourceCover = document.querySelector<HTMLElement>('.player-bar .cover-thumb-button');
      if (!overlayElement || !sourceCover) {
        throw new Error('Unable to prepare lyrics exit handoff capture');
      }

      captureWindow.__lyricsExitHandoffCapture = new Promise((resolve) => {
        const captureStartedAt = performance.now();
        let exitStartedAt: number | null = null;
        let portalArrivedAt: number | null = null;
        let sourceCoverRestoredAt: number | null = null;
        let appBlurClearedAt: number | null = null;
        let sourceCoverWasHidden = false;
        let appBlurWasApplied = false;

        const finish = () => resolve({
          appBlurClearedAt,
          exitStartedAt: exitStartedAt ?? -1,
          portalArrivedAt,
          sourceCoverRestoredAt
        });
        const sampleFrame = (at: number) => {
          if (exitStartedAt === null) {
            if (overlayElement.dataset.transitionPhase === 'exiting') {
              exitStartedAt = at;
            } else if (at - captureStartedAt >= 2_000) {
              finish();
              return;
            }
            requestAnimationFrame(sampleFrame);
            return;
          }

          const sourceStyle = getComputedStyle(sourceCover);
          const sourceIsVisible = Number.parseFloat(sourceStyle.opacity) >= 0.95
            && sourceStyle.visibility !== 'hidden';
          sourceCoverWasHidden ||= !sourceIsVisible;
          if (sourceCoverWasHidden && sourceIsVisible && sourceCoverRestoredAt === null) {
            sourceCoverRestoredAt = at;
          }

          const vignette = document.querySelector<HTMLElement>('.lyrics-transition-app-vignette');
          const blurMatch = vignette
            ? getComputedStyle(vignette).backdropFilter.match(/blur\(([\d.]+)px\)/)
            : null;
          const appBlur = blurMatch ? Number.parseFloat(blurMatch[1]) : 0;
          appBlurWasApplied ||= appBlur > 1;
          if (appBlurWasApplied && appBlur <= 1 && appBlurClearedAt === null) {
            appBlurClearedAt = at;
          }

          const portal = document.querySelector<HTMLElement>('.lyrics-transition-card');
          const flight = document.querySelector<HTMLElement>('.lyrics-transition-flight');
          if (portal && flight && portalArrivedAt === null) {
            const flightStyle = getComputedStyle(flight);
            const portalRect = portal.getBoundingClientRect();
            const sourceRect = sourceCover.getBoundingClientRect();
            const centerDistance = Math.hypot(
              portalRect.left + portalRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
              portalRect.top + portalRect.height / 2 - (sourceRect.top + sourceRect.height / 2)
            );
            const sizeError = Math.max(
              Math.abs(portalRect.width - sourceRect.width) / Math.max(1, sourceRect.width),
              Math.abs(portalRect.height - sourceRect.height) / Math.max(1, sourceRect.height)
            );
            const flightIsVisible = Number.parseFloat(flightStyle.opacity) > 0.05
              && flightStyle.visibility !== 'hidden';

            if (flightIsVisible && centerDistance <= 2.5 && sizeError <= 0.04) {
              portalArrivedAt = at;
            }
          }

          if (
            (portalArrivedAt !== null && sourceCoverRestoredAt !== null && appBlurClearedAt !== null)
            || at - exitStartedAt >= 1_600
          ) {
            finish();
            return;
          }

          requestAnimationFrame(sampleFrame);
        };

        requestAnimationFrame(sampleFrame);
      });
    });
    await page.locator('.lyrics-collapse').click();
    await expect(overlay).toHaveAttribute('data-transition-phase', 'exiting');
    const exitingPlayerLayer = await readLyricsPlayerLayerState(page);
    expect(exitingPlayerLayer.playerAnimationName).toContain('lyricsImmersivePlayerOut');
    expect(exitingPlayerLayer.playerPointerEvents).toBe('none');
    await expect(transitionFlight).toBeVisible();

    await page.waitForTimeout(360);
    const exitContentState = await overlay.evaluate((element) => {
      const panel = element.querySelector<HTMLElement>('.lyrics-panel');
      const title = element.querySelector<HTMLElement>('.lyrics-depth-title');
      const titleEnter = element.querySelector<HTMLElement>('.lyrics-title-enter');
      const lines = element.querySelector<HTMLElement>('.lyrics-lines');
      const tools = element.querySelector<HTMLElement>('.lyrics-side-tools');
      const textEnter = element.querySelector<HTMLElement>('.lyrics-text-enter');
      if (!panel || !title || !titleEnter || !lines || !tools || !textEnter) {
        throw new Error('Unable to inspect lyrics exit content');
      }

      return {
        linesOpacity: Number.parseFloat(getComputedStyle(lines).opacity),
        panelFilter: getComputedStyle(panel).filter,
        panelOpacity: Number.parseFloat(getComputedStyle(panel).opacity),
        textFilter: getComputedStyle(textEnter).filter,
        titleFilter: getComputedStyle(titleEnter).filter,
        titleOpacity: Number.parseFloat(getComputedStyle(title).opacity),
        toolsFilter: getComputedStyle(tools).filter,
        toolsOpacity: Number.parseFloat(getComputedStyle(tools).opacity)
      };
    });
    expect(exitContentState.panelOpacity).toBeGreaterThan(0.95);
    expect(exitContentState.titleOpacity).toBeGreaterThan(0.95);
    expect(exitContentState.linesOpacity).toBeGreaterThan(0.95);
    expect(exitContentState.toolsOpacity).toBeGreaterThan(0.95);
    expect(exitContentState.panelFilter).toBe('none');
    expect(exitContentState.titleFilter).toBe('none');
    expect(exitContentState.textFilter).toBe('none');
    expect(exitContentState.toolsFilter).toBe('none');

    const exitHandoff = await page.evaluate(() => {
      const capture = (window as typeof window & {
        __lyricsExitHandoffCapture?: Promise<LyricsExitHandoffMetrics>;
      }).__lyricsExitHandoffCapture;
      if (!capture) {
        throw new Error('Lyrics exit handoff capture was not initialized');
      }
      return capture;
    });
    expect(exitHandoff.exitStartedAt).toBeGreaterThanOrEqual(0);
    expect(exitHandoff.portalArrivedAt).not.toBeNull();
    expect(exitHandoff.sourceCoverRestoredAt).not.toBeNull();
    expect(exitHandoff.appBlurClearedAt).not.toBeNull();

    const portalArrivedAt = exitHandoff.portalArrivedAt!;
    const sourceCoverRestoredAt = exitHandoff.sourceCoverRestoredAt!;
    const appBlurClearedAt = exitHandoff.appBlurClearedAt!;
    const sampledHandoffBudgetMs = 340;
    expect(portalArrivedAt - exitHandoff.exitStartedAt).toBeLessThanOrEqual(1_000);
    expect(sourceCoverRestoredAt - portalArrivedAt).toBeGreaterThanOrEqual(0);
    expect(sourceCoverRestoredAt - portalArrivedAt).toBeLessThanOrEqual(sampledHandoffBudgetMs);
    expect(appBlurClearedAt - portalArrivedAt).toBeGreaterThanOrEqual(0);
    expect(appBlurClearedAt - portalArrivedAt).toBeLessThanOrEqual(sampledHandoffBudgetMs);

    await expect(overlay).toHaveCount(0, { timeout: 750 });
    await expect(page.locator('.lyrics-transition-curtain')).toHaveCount(0);
    await expect.poll(readPlayerChromeState).toEqual(initialPlayerChrome);
  });

  test('preserves the active 3D depth while the lyrics exit portal starts', async ({ page }) => {
    await openLyricsFromCover(page);
    const overlay = page.locator('.lyrics-overlay');
    const stage = page.locator('.playback-stage-3d');

    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    const viewport = page.viewportSize();
    const viewportWidth = viewport?.width ?? 1440;
    const pointerX = Math.max(80, viewportWidth - 80);
    await page.mouse.move(pointerX, 120);
    const expectedStageTiltY = (pointerX / viewportWidth - 0.5) * 26;
    await expect.poll(() => stage.evaluate((element) => (
      Number.parseFloat(element.style.getPropertyValue('--stage-tilt-y'))
    ))).toBeCloseTo(expectedStageTiltY, 1);

    const depthBeforeExit = await stage.evaluate((element) => ({
      stageTiltX: element.style.getPropertyValue('--stage-tilt-x'),
      stageTiltY: element.style.getPropertyValue('--stage-tilt-y'),
      coverTiltX: element.style.getPropertyValue('--cover-tilt-x'),
      coverTiltY: element.style.getPropertyValue('--cover-tilt-y')
    }));

    await page.evaluate(() => {
      const captureWindow = window as typeof window & {
        __lyricsExitGeometryCapture?: Promise<LyricsExitGeometryMetrics>;
      };
      const overlayElement = document.querySelector<HTMLElement>('.lyrics-overlay');
      const stageElement = document.querySelector<HTMLElement>('.playback-stage-3d');
      if (!overlayElement || !stageElement) {
        throw new Error('Unable to prepare lyrics exit geometry capture');
      }

      const readGeometry = (element: HTMLElement | null): LyricsExitGeometryRect | null => {
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        let displayed = true;
        let opacity = 1;
        let visibility = true;
        let current: HTMLElement | null = element;

        while (current) {
          const style = getComputedStyle(current);
          displayed = displayed && style.display !== 'none';
          visibility = visibility && style.visibility !== 'hidden' && style.visibility !== 'collapse';
          opacity *= Number.parseFloat(style.opacity) || 0;
          current = current.parentElement;
        }

        return {
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          height: rect.height,
          opacity,
          visible: displayed && visibility && opacity >= 0.02 && rect.width > 0 && rect.height > 0,
          width: rect.width
        };
      };
      const readSample = (at: number): LyricsExitGeometrySample => ({
        artwork: readGeometry(document.querySelector<HTMLElement>('.lyrics-art')),
        at,
        portal: readGeometry(document.querySelector<HTMLElement>('.lyrics-transition-card'))
      });
      const readDepthState = () => ({
        stageTiltX: stageElement.style.getPropertyValue('--stage-tilt-x'),
        stageTiltY: stageElement.style.getPropertyValue('--stage-tilt-y'),
        coverTiltX: stageElement.style.getPropertyValue('--cover-tilt-x'),
        coverTiltY: stageElement.style.getPropertyValue('--cover-tilt-y')
      });

      captureWindow.__lyricsExitGeometryCapture = new Promise((resolve) => {
        let beforeExit = readSample(performance.now());
        let depthAtExitStart = readDepthState();
        let exitStartedAt: number | null = null;
        const samples: LyricsExitGeometrySample[] = [];
        const phaseObserver = new MutationObserver(() => {
          if (exitStartedAt === null && overlayElement.dataset.transitionPhase === 'exiting') {
            exitStartedAt = performance.now();
            depthAtExitStart = readDepthState();
          }
        });
        phaseObserver.observe(overlayElement, { attributeFilter: ['data-transition-phase'] });

        const sampleFrame = (at: number) => {
          if (exitStartedAt === null) {
            beforeExit = readSample(at);
            requestAnimationFrame(sampleFrame);
            return;
          }

          samples.push(readSample(at));
          if (at - exitStartedAt >= 480) {
            phaseObserver.disconnect();
            resolve({ beforeExit, depthAtExitStart, exitStartedAt, samples });
            return;
          }

          requestAnimationFrame(sampleFrame);
        };

        requestAnimationFrame(sampleFrame);
      });
    });

    await page.locator('.lyrics-collapse').click();
    await expect(overlay).toHaveAttribute('data-transition-phase', 'exiting');

    const exitGeometry = await page.evaluate(() => {
      const capture = (window as typeof window & {
        __lyricsExitGeometryCapture?: Promise<LyricsExitGeometryMetrics>;
      }).__lyricsExitGeometryCapture;
      if (!capture) {
        throw new Error('Lyrics exit geometry capture was not initialized');
      }
      return capture;
    });
    Object.values(exitGeometry.depthAtExitStart).forEach((value) => {
      expect(Number.parseFloat(value)).not.toBeCloseTo(0, 2);
    });
    Object.entries(exitGeometry.depthAtExitStart).forEach(([key, value]) => {
      const before = Number.parseFloat(depthBeforeExit[key as keyof typeof depthBeforeExit]);
      expect(Math.abs(Number.parseFloat(value) - before)).toBeLessThan(2.2);
    });

    const elapsed = (sample: LyricsExitGeometrySample) => sample.at - exitGeometry.exitStartedAt;
    const handoffSamples = exitGeometry.samples.filter((sample) => {
      const elapsedMs = elapsed(sample);
      return elapsedMs >= 180 && elapsedMs <= 340;
    });

    expect(exitGeometry.samples.length).toBeGreaterThanOrEqual(12);
    expect(elapsed(exitGeometry.samples[0])).toBeLessThanOrEqual(34);
    expect(elapsed(exitGeometry.samples.at(-1)!)).toBeGreaterThanOrEqual(480);
    expect(handoffSamples.length).toBeGreaterThanOrEqual(4);
    expect(exitGeometry.beforeExit.artwork?.visible).toBe(true);
    expect(exitGeometry.beforeExit.portal?.visible).toBe(false);

    const blankFrames = exitGeometry.samples
      .filter((sample) => !sample.artwork?.visible && !sample.portal?.visible)
      .map((sample) => Math.round(elapsed(sample)));
    expect(blankFrames).toEqual([]);

    const weakestHandoffOpacity = Math.min(...handoffSamples.map((sample) => Math.max(
      sample.artwork?.opacity ?? 0,
      sample.portal?.opacity ?? 0
    )));
    expect(weakestHandoffOpacity).toBeGreaterThanOrEqual(0.42);

    const firstPortalIndex = exitGeometry.samples.findIndex((sample) => sample.portal?.visible);
    expect(firstPortalIndex).toBeGreaterThan(0);
    const firstPortalSample = exitGeometry.samples[firstPortalIndex];
    expect(elapsed(firstPortalSample)).toBeGreaterThanOrEqual(180);
    expect(elapsed(firstPortalSample)).toBeLessThanOrEqual(340);

    let lastArtworkIndex = -1;
    for (let index = 0; index < firstPortalIndex; index += 1) {
      if (exitGeometry.samples[index].artwork?.visible) {
        lastArtworkIndex = index;
      }
    }
    expect(lastArtworkIndex).toBe(firstPortalIndex - 1);

    const sourceAtHandoff = exitGeometry.samples[lastArtworkIndex].artwork!;
    const portalAtHandoff = firstPortalSample.portal!;
    expect(Math.hypot(
      portalAtHandoff.centerX - sourceAtHandoff.centerX,
      portalAtHandoff.centerY - sourceAtHandoff.centerY
    )).toBeLessThanOrEqual(2);
    expect(Math.abs(portalAtHandoff.width - sourceAtHandoff.width) / sourceAtHandoff.width)
      .toBeLessThanOrEqual(0.01);
    expect(Math.abs(portalAtHandoff.height - sourceAtHandoff.height) / sourceAtHandoff.height)
      .toBeLessThanOrEqual(0.01);

    const settledHandoffSample = exitGeometry.samples.find((sample) => elapsed(sample) >= 340);
    expect(settledHandoffSample?.portal?.opacity ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(settledHandoffSample?.artwork?.opacity ?? 1).toBeLessThanOrEqual(0.1);

    const maxAdjacentGeometryDeltas = (
      key: 'artwork' | 'portal',
      includeBeforeExit: boolean
    ) => {
      const track = [
        ...(includeBeforeExit ? [exitGeometry.beforeExit] : []),
        ...exitGeometry.samples
      ].filter((sample) => sample[key]?.visible && (
        sample === exitGeometry.beforeExit || elapsed(sample) <= 340
      ));
      let maxCenterDelta = 0;
      let maxSizeDelta = 0;

      for (let index = 1; index < track.length; index += 1) {
        const previous = track[index - 1];
        const current = track[index];
        const previousRect = previous[key]!;
        const currentRect = current[key]!;
        const normalizedFrameDuration = (1000 / 60) / Math.max(1, current.at - previous.at);
        maxCenterDelta = Math.max(maxCenterDelta, Math.hypot(
          currentRect.centerX - previousRect.centerX,
          currentRect.centerY - previousRect.centerY
        ) * normalizedFrameDuration);
        maxSizeDelta = Math.max(maxSizeDelta,
          Math.abs(currentRect.width - previousRect.width) / sourceAtHandoff.width * normalizedFrameDuration,
          Math.abs(currentRect.height - previousRect.height) / sourceAtHandoff.height * normalizedFrameDuration
        );
      }

      return { maxCenterDelta, maxSizeDelta };
    };

    const artworkDeltas = maxAdjacentGeometryDeltas('artwork', true);
    const portalDeltas = maxAdjacentGeometryDeltas('portal', false);
    expect(artworkDeltas.maxCenterDelta).toBeLessThanOrEqual(32);
    expect(artworkDeltas.maxSizeDelta).toBeLessThanOrEqual(0.12);
    expect(portalDeltas.maxCenterDelta).toBeLessThanOrEqual(34);
    expect(portalDeltas.maxSizeDelta).toBeLessThanOrEqual(0.06);
  });

  test('restores the interactive lyrics stage when fullscreen exit fails and closes on retry', async ({ page }) => {
    await openLyricsFromCover(page);
    const overlay = page.locator('.lyrics-overlay');
    const panel = page.locator('.lyrics-panel');
    const artwork = page.locator('.lyrics-art');
    const transitionFlight = page.locator('.lyrics-transition-flight');
    const playerCover = page.locator('.player-bar .cover-thumb-button');

    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    await page.evaluate(() => {
      const mockWindow = window as typeof window & {
        __lyricsFullscreenRestoreCalls?: boolean[];
        __lyricsFullscreenRestoreResult?: boolean;
      };
      mockWindow.__lyricsFullscreenRestoreCalls = [];
      mockWindow.__lyricsFullscreenRestoreResult = true;
      window.musicPlayer.window.setFullscreen = (fullscreen) => {
        mockWindow.__lyricsFullscreenRestoreCalls!.push(fullscreen);
        return mockWindow.__lyricsFullscreenRestoreResult ?? false;
      };
    });

    await page.locator('.lyrics-collapse').click();
    await expect(overlay).toHaveAttribute('data-transition-phase', 'exiting');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive', { timeout: 3_200 });
    await expect(panel).toBeVisible();
    await expect(artwork).toBeVisible();
    await expect(transitionFlight).toBeHidden();
    await expect(playerCover).toBeVisible();

    const restoredState = await page.evaluate(() => {
      const panelElement = document.querySelector<HTMLElement>('.lyrics-panel');
      const artworkElement = document.querySelector<HTMLElement>('.lyrics-art');
      const stageElement = document.querySelector<HTMLElement>('.playback-stage-3d');
      const sourceCover = document.querySelector<HTMLElement>('.player-bar .cover-thumb-button');
      const mockWindow = window as typeof window & {
        __lyricsFullscreenRestoreCalls?: boolean[];
      };
      if (!panelElement || !artworkElement || !stageElement || !sourceCover) {
        throw new Error('Unable to inspect restored lyrics exit state');
      }

      const panelStyle = getComputedStyle(panelElement);
      const artworkStyle = getComputedStyle(artworkElement);
      const sourceCoverStyle = getComputedStyle(sourceCover);
      const artworkRect = artworkElement.getBoundingClientRect();
      const sourceCoverRect = sourceCover.getBoundingClientRect();

      return {
        artworkHeight: artworkRect.height,
        artworkOpacity: Number.parseFloat(artworkStyle.opacity),
        artworkVisibility: artworkStyle.visibility,
        artworkWidth: artworkRect.width,
        coverShiftX: Number.parseFloat(stageElement.style.getPropertyValue('--cover-shift-x')),
        coverShiftY: Number.parseFloat(stageElement.style.getPropertyValue('--cover-shift-y')),
        coverTiltX: Number.parseFloat(stageElement.style.getPropertyValue('--cover-tilt-x')),
        coverTiltY: Number.parseFloat(stageElement.style.getPropertyValue('--cover-tilt-y')),
        panelOpacity: Number.parseFloat(panelStyle.opacity),
        panelVisibility: panelStyle.visibility,
        pointerX: Number.parseFloat(stageElement.style.getPropertyValue('--pointer-x')),
        pointerY: Number.parseFloat(stageElement.style.getPropertyValue('--pointer-y')),
        restoreCalls: mockWindow.__lyricsFullscreenRestoreCalls ?? [],
        sourceCoverHeight: sourceCoverRect.height,
        sourceCoverOpacity: Number.parseFloat(sourceCoverStyle.opacity),
        sourceCoverVisibility: sourceCoverStyle.visibility,
        sourceCoverWidth: sourceCoverRect.width,
        stageTiltX: Number.parseFloat(stageElement.style.getPropertyValue('--stage-tilt-x')),
        stageTiltY: Number.parseFloat(stageElement.style.getPropertyValue('--stage-tilt-y'))
      };
    });

    expect(restoredState.restoreCalls).toEqual([false]);
    expect(restoredState.panelOpacity).toBeGreaterThanOrEqual(0.99);
    expect(restoredState.panelVisibility).toBe('visible');
    expect(restoredState.artworkOpacity).toBeGreaterThanOrEqual(0.99);
    expect(restoredState.artworkVisibility).toBe('visible');
    expect(restoredState.artworkWidth).toBeGreaterThan(0);
    expect(restoredState.artworkHeight).toBeGreaterThan(0);
    expect(restoredState.pointerX).toBeCloseTo(0.5, 3);
    expect(restoredState.pointerY).toBeCloseTo(0.5, 3);
    expect(restoredState.stageTiltX).toBeCloseTo(0, 3);
    expect(restoredState.stageTiltY).toBeCloseTo(0, 3);
    expect(restoredState.coverShiftX).toBeCloseTo(0, 3);
    expect(restoredState.coverShiftY).toBeCloseTo(0, 3);
    expect(restoredState.coverTiltX).toBeCloseTo(0, 3);
    expect(restoredState.coverTiltY).toBeCloseTo(0, 3);
    expect(restoredState.sourceCoverOpacity).toBeGreaterThanOrEqual(0.99);
    expect(restoredState.sourceCoverVisibility).toBe('visible');
    expect(restoredState.sourceCoverWidth).toBeGreaterThan(0);
    expect(restoredState.sourceCoverHeight).toBeGreaterThan(0);

    await page.evaluate(() => {
      (window as typeof window & { __lyricsFullscreenRestoreResult?: boolean })
        .__lyricsFullscreenRestoreResult = false;
    });
    await page.locator('.lyrics-collapse').click();
    await expect(overlay).toHaveAttribute('data-transition-phase', 'exiting');
    await expect(overlay).toHaveCount(0, { timeout: 3_200 });
    await expect(playerCover).toBeVisible();
    const restoreCalls = await page.evaluate(() => (
      (window as typeof window & { __lyricsFullscreenRestoreCalls?: boolean[] })
        .__lyricsFullscreenRestoreCalls ?? []
    ));
    expect(restoreCalls).toEqual([false, false]);
  });

  test('keeps app defocus and player-cover handoff aligned with the portal flight', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await playFirstVisualRuntimeSong(page);
    const mainContentBox = await page.locator('.main-content').boundingBox();
    if (!mainContentBox) {
      throw new Error('Unable to capture the app defocus sample region');
    }
    const defocusSampleClip = {
      x: mainContentBox.x + 24,
      y: mainContentBox.y + 18,
      width: Math.min(620, mainContentBox.width - 48),
      height: Math.min(300, mainContentBox.height - 36)
    };
    const focusedSample = await page.screenshot({ clip: defocusSampleClip });
    await page.evaluate(() => window.localStorage.removeItem('musicplayer.lyrics-transition'));
    await page.locator('.player-bar .cover-thumb-button').click();
    await expect(page.locator('.lyrics-overlay')).toBeVisible();
    await expect.poll(async () => (await readLyricsPortalHandoffState(page)).appBlur)
      .toBeGreaterThanOrEqual(10);

    const entryState = await readLyricsPortalHandoffState(page);
    const defocusedSample = await page.screenshot({
      clip: defocusSampleClip,
      path: `artifacts/ui-checks/lyrics-app-defocus-${testInfo.project.name}.png`
    });
    const focusedPixels = await readVisiblePixelStats(page, focusedSample);
    const defocusedPixels = await readVisiblePixelStats(page, defocusedSample);
    expect(entryState.flightOpacity).toBeGreaterThan(0);
    expect(entryState.appVignetteOpacity).toBeGreaterThan(0);
    expect(entryState.appBlur).toBeGreaterThanOrEqual(10);
    expect(entryState.flightZIndex).toBeGreaterThan(entryState.overlayZIndex);
    expect(entryState.vignetteInsideOverlay).toBe(true);
    expect(entryState.panelZIndex).toBeGreaterThan(entryState.vignetteZIndex);
    expect(entryState.playerBackdropFilter).toContain('blur');
    expect(entryState.playerBackgroundImage).not.toBe('none');
    expect(entryState.playerVisible).toBe(true);
    expect(entryState.playerPointerEvents).toBe('auto');
    expect(entryState.playerHitPlayerBar).toBe(false);
    expect(entryState.playerHitLyricsOverlay).toBe(true);
    expect(entryState.lyricsPlayerVisible).toBe(false);
    expect(entryState.overlayFilter).toBe('none');
    expect(entryState.panelFilter).toBe('none');
    expect(entryState.stageFilter).toBe('none');
    expect(defocusedPixels.edgeEnergy).toBeLessThan(focusedPixels.edgeEnergy * 0.9);

    await expect.poll(async () => {
      const state = await readLyricsPortalHandoffState(page);
      return state.panelTop < state.viewportHeight * 0.9 && state.appBlur > 0;
    }).toBe(true);
    const drawerOverlapState = await readLyricsPortalHandoffState(page);
    expect(drawerOverlapState.overlayFilter).toBe('none');
    expect(drawerOverlapState.panelFilter).toBe('none');
    expect(drawerOverlapState.stageFilter).toBe('none');
    expect(drawerOverlapState.titleFilter).toBe('none');
    expect(drawerOverlapState.textFilter).toBe('none');
    expect(drawerOverlapState.toolsFilter).toBe('none');

    const overlay = page.locator('.lyrics-overlay');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    await page.locator('.lyrics-collapse').click();
    await waitForAnimationFrames(page, 2);

    const exitState = await readLyricsPortalHandoffState(page);
    expect(exitState.appVignetteOpacity).toBeGreaterThan(0);
    expect(exitState.appBlur).toBeGreaterThan(0);
    expect(exitState.overlayFilter).toBe('none');
    expect(exitState.panelFilter).toBe('none');
    expect(exitState.stageFilter).toBe('none');

    await expect.poll(() => readLyricsPortalHandoffState(page), { timeout: 2_400 }).toMatchObject({
      playerVisible: true,
      flightVisible: true
    });
  });

  test('keeps the portal flight near the player cover and supports early collapse', async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === 'compact' ? { width: 1040, height: 720 } : { width: 1440, height: 900 });
    await playFirstVisualRuntimeSong(page);

    const sourceRect = await page.locator('.player-bar .cover-thumb-button').evaluate((element) => element.getBoundingClientRect().toJSON());
    await page.locator('.player-bar .cover-thumb-button').click();
    const flight = page.locator('.lyrics-transition-flight');
    await expect(flight).toBeVisible();
    await page.waitForTimeout(520);

    const flightState = await flight.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });

    expect(flightState.left).toBeGreaterThanOrEqual(-8);
    expect(flightState.top).toBeGreaterThanOrEqual(-8);
    expect(flightState.right).toBeLessThanOrEqual(flightState.viewportWidth + 8);
    expect(flightState.bottom).toBeLessThanOrEqual(flightState.viewportHeight + 8);
    expect(Math.abs(flightState.centerX - (sourceRect.left + sourceRect.width / 2))).toBeLessThanOrEqual(56);
    expect(Math.abs(flightState.centerY - (sourceRect.top + sourceRect.height / 2))).toBeLessThanOrEqual(56);
    expect(flightState.width).toBeGreaterThanOrEqual(sourceRect.width * 0.92);
    expect(flightState.height).toBeGreaterThanOrEqual(sourceRect.height * 0.92);

    const overlay = page.locator('.lyrics-overlay');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'entering');
    await page.locator('.lyrics-collapse').dispatchEvent('click');
    await expect(overlay).toHaveCount(0, { timeout: 1_000 });
  });

  test('blocks pointer hits from reaching the main app while lyrics are open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);

    const hitState = await page.evaluate(() => {
      const overlay = document.querySelector('.lyrics-overlay') as HTMLElement | null;
      const panel = document.querySelector('.lyrics-panel') as HTMLElement | null;
      const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;

      if (!overlay || !panel || !sidebar || !mainContent) {
        throw new Error('Unable to inspect lyrics pointer shielding');
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const mainRect = mainContent.getBoundingClientRect();
      const sidebarHitY = sidebarRect.top + Math.min(sidebarRect.height - 8, 220);
      const sidebarHit = document.elementFromPoint(sidebarRect.left + sidebarRect.width / 2, sidebarHitY);
      const mainHit = document.elementFromPoint(mainRect.left + 120, mainRect.top + 120);

      return {
        overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
        panelPointerEvents: getComputedStyle(panel).pointerEvents,
        sidebarHitLyricsOverlay: Boolean(sidebarHit?.closest('.lyrics-overlay')),
        sidebarHitMainShell: Boolean(sidebarHit?.closest('.sidebar, .content-frame')),
        mainHitLyricsOverlay: Boolean(mainHit?.closest('.lyrics-overlay')),
        mainHitMainShell: Boolean(mainHit?.closest('.sidebar, .content-frame'))
      };
    });

    expect(hitState.overlayPointerEvents).toBe('auto');
    expect(hitState.panelPointerEvents).toBe('auto');
    expect(hitState.sidebarHitLyricsOverlay).toBe(true);
    expect(hitState.sidebarHitMainShell).toBe(false);
    expect(hitState.mainHitLyricsOverlay).toBe(true);
    expect(hitState.mainHitMainShell).toBe(false);
  });

  test('keeps the playback queue frosted above the lyrics stage', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute('data-transition-phase', 'interactive');
    await page.locator('.lyrics-player-bar').getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.locator('.queue-panel');
    await expect(queuePanel).toHaveAttribute('data-state', 'open');

    const queueLayerState = await queuePanel.evaluate((panel) => {
      const queue = panel as HTMLElement;
      const overlay = document.querySelector('.lyrics-overlay') as HTMLElement | null;
      const style = getComputedStyle(queue);
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const rect = queue.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

      return {
        backgroundImage: style.backgroundImage,
        backdropFilter: style.backdropFilter,
        boxShadow: style.boxShadow,
        queueZIndex: Number.parseInt(style.zIndex, 10),
        overlayZIndex: overlayStyle ? Number.parseInt(overlayStyle.zIndex, 10) : Number.NaN,
        hitQueuePanel: Boolean(hit?.closest('.queue-panel')),
        hitLyricsOverlay: Boolean(hit?.closest('.lyrics-overlay'))
      };
    });

    expect(queueLayerState.backgroundImage).toContain('linear-gradient');
    expect(queueLayerState.backdropFilter).toContain('blur');
    expect(readBackdropBlurPx(queueLayerState.backdropFilter)).toBe(24);
    expect(queueLayerState.boxShadow).not.toBe('none');
    expect(queueLayerState.queueZIndex).toBeGreaterThan(queueLayerState.overlayZIndex);
    expect(queueLayerState.hitQueuePanel).toBe(true);
    expect(queueLayerState.hitLyricsOverlay).toBe(false);
  });

  test('uses animated blurred anchored popovers for transient player controls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.locator('.theme-trigger').click();
    await expectAnchoredGlassPopover(page.locator('.theme-popover'), '.top-bar', 'top');
    await page.mouse.click(20, 20);
    await expect(page.locator('.theme-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.theme-popover')).toHaveCount(0, { timeout: 1000 });

    await page.locator('.login-button').click();
    await expectAnchoredGlassPopover(page.locator('.login-popover'), '.top-bar', 'top');
    await page.mouse.click(20, 20);
    await expect(page.locator('.login-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.login-popover')).toHaveCount(0, { timeout: 1000 });

    await page.locator('.top-actions > button.icon-button').last().click();
    await expectAnchoredGlassPopover(page.locator('.settings-popover'), '.top-bar', 'top');
    await page.mouse.click(20, 20);
    await expect(page.locator('.settings-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.settings-popover')).toHaveCount(0, { timeout: 1000 });

    await page.locator('.playback-mode-trigger').click();
    await expectAnchoredGlassPopover(page.locator('.playback-mode-popover'), '.player-bar', 'bottom');
    await expectPopoverCenteredOverTrigger(page.locator('.playback-mode-popover'), page.locator('.playback-mode-trigger'));
    await page.mouse.click(20, 20);
    await expect(page.locator('.playback-mode-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.playback-mode-popover')).toHaveCount(0, { timeout: 1000 });

    await page.locator('.quality-trigger').click();
    await expectAnchoredGlassPopover(page.locator('.quality-popover'), '.player-bar', 'bottom');
    await expectPopoverCenteredOverTrigger(page.locator('.quality-popover'), page.locator('.quality-trigger'));
    await page.mouse.click(20, 20);
    await expect(page.locator('.quality-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.quality-popover')).toHaveCount(0, { timeout: 1000 });

    await page.locator('.volume-trigger').click();
    await expect(page.locator('.volume-trigger')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.volume-popover')).toHaveAttribute('data-state', 'open');
    await expectAnchoredGlassPopover(page.locator('.volume-popover'), '.player-bar', 'bottom');
    await expectPopoverCenteredOverTrigger(page.locator('.volume-popover'), page.locator('.volume-trigger'));

    const volumeState = await page.locator('.volume-popover').evaluate((popover) => {
      const slider = popover.querySelector('.volume-slider') as HTMLInputElement | null;
      const playerBar = document.querySelector('.player-bar') as HTMLElement | null;
      const popoverStyle = getComputedStyle(popover);
      const sliderStyle = slider ? getComputedStyle(slider) : null;
      const popoverRect = popover.getBoundingClientRect();
      const playerBarRect = playerBar?.getBoundingClientRect();
      const sliderRect = slider?.getBoundingClientRect();

      if (!slider || !sliderRect || !sliderStyle || !playerBarRect) {
        throw new Error('Unable to inspect volume popover');
      }

      const hit = document.elementFromPoint(popoverRect.left + popoverRect.width / 2, popoverRect.top + popoverRect.height / 2);

      return {
        insidePlayerBar: Boolean(popover.closest('.player-bar')),
        hitVolumePopover: Boolean(hit?.closest('.volume-popover')),
        popoverBorderRadius: popoverStyle.borderRadius,
        popoverBorderStyle: popoverStyle.borderStyle,
        popoverTop: popoverRect.top,
        popoverBottom: popoverRect.bottom,
        playerBarTop: playerBarRect.top,
        sliderWritingMode: sliderStyle.writingMode,
        sliderWidth: sliderRect.width,
        sliderHeight: sliderRect.height
      };
    });

    expect(volumeState.popoverBorderRadius).toBe('8px');
    expect(volumeState.popoverBorderStyle).toBe('solid');
    expect(volumeState.insidePlayerBar).toBe(false);
    expect(volumeState.hitVolumePopover).toBe(true);
    expect(volumeState.popoverTop).toBeLessThan(volumeState.playerBarTop);
    expect(volumeState.sliderWritingMode).toBe('vertical-lr');
    expect(volumeState.sliderHeight).toBeGreaterThan(volumeState.sliderWidth * 3);

    await page.mouse.click(20, 20);
    await expect(page.locator('.volume-popover')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.volume-popover')).toHaveCount(0, { timeout: 1000 });
    await expect(page.locator('.volume-trigger')).toHaveAttribute('aria-expanded', 'false');
  });

  test('uses elastic selection and bounded range feedback in real pointer interactions', async ({ page }) => {
    await page.locator('.playback-mode-trigger').click();
    const playbackPopover = page.locator('.playback-mode-popover');
    const indicator = playbackPopover.locator('.elastic-option-indicator');
    const activeOption = playbackPopover.locator('.playback-mode-option-active');

    await expect.poll(async () => (await indicator.boundingBox())?.width ?? 0).toBeGreaterThan(80);
    const indicatorBox = await indicator.boundingBox();
    const activeOptionBox = await activeOption.boundingBox();
    if (!indicatorBox || !activeOptionBox) {
      throw new Error('Unable to inspect the elastic selection indicator');
    }
    expect(Math.abs(indicatorBox.y - activeOptionBox.y)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(indicatorBox.height - activeOptionBox.height)).toBeLessThanOrEqual(1.5);

    await playbackPopover.locator('.playback-mode-option').last().click();
    await expect(playbackPopover).toHaveAttribute('data-edge-impulse', 'max');
    await expect(indicator).toHaveAttribute('data-motion-state', 'impact');
    await expect(playbackPopover).toHaveCount(0, { timeout: 1500 });

    await page.locator('.volume-trigger').click();
    const volumePopover = page.locator('.volume-popover');
    const volumeSlider = volumePopover.locator('.volume-slider');
    await volumeSlider.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const sliderBox = await volumeSlider.boundingBox();
    if (!sliderBox) {
      throw new Error('Unable to inspect the volume slider');
    }
    const pointerX = sliderBox.x + sliderBox.width / 2;
    const pointerY = sliderBox.y + 8;
    await page.mouse.move(pointerX, pointerY);
    await page.mouse.down();
    await page.mouse.move(pointerX, pointerY - 28, { steps: 4 });

    await expect(volumePopover).toHaveAttribute('data-edge-impulse', 'max');
    await expect(volumePopover).toHaveAttribute('data-edge-state', 'pulling');

    await page.mouse.up();
    await expect(volumePopover).toHaveAttribute('data-edge-state', 'rebounding');
    await expect(volumePopover).toHaveAttribute('data-edge-state', 'settled', { timeout: 1500 });
  });

  test('animates the playback queue as a right-side frosted panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.locator('.queue-panel');
    await expect(queuePanel).toHaveAttribute('data-state', 'open');

    const openStyle = await queuePanel.evaluate((panel) => {
      const style = getComputedStyle(panel);

      return {
        animationName: style.animationName,
        backgroundImage: style.backgroundImage,
        backdropFilter: style.backdropFilter,
        filter: style.filter,
        transformOrigin: style.transformOrigin
      };
    });

    expect(openStyle.animationName).toBe('queuePanelIn');
    expect(openStyle.backgroundImage).toContain('linear-gradient');
    expect(openStyle.backdropFilter).toContain('blur');
    expect(readBackdropBlurPx(openStyle.backdropFilter)).toBe(24);
    expect(openStyle.transformOrigin).not.toBe('50% 50%');

    await page.waitForTimeout(260);
    const settledOpenStyle = await queuePanel.evaluate((panel) => getComputedStyle(panel).filter);
    expect(settledOpenStyle === 'none' || settledOpenStyle === 'blur(0px)').toBe(true);

    await page.locator('.player-bar').getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveAttribute('data-state', 'closed');

    const closedStyle = await queuePanel.evaluate((panel) => {
      const style = getComputedStyle(panel);

      return {
        animationName: style.animationName,
        filter: style.filter,
        pointerEvents: style.pointerEvents
      };
    });

    expect(closedStyle.animationName).toBe('queuePanelOut');
    expect(closedStyle.filter).toContain('blur');
    expect(closedStyle.pointerEvents).toBe('none');
    await expect(queuePanel).toHaveCount(0, { timeout: 1000 });
  });

  test('uses the shared themed blurred glass material on the lyric font popover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await page.locator('.lyrics-translation-toggle').click();
    const unavailableNotice = page.locator('.lyrics-translation-unavailable');
    await expect(unavailableNotice).toHaveAttribute('data-state', 'open');
    await expect(unavailableNotice).toHaveCSS('animation-name', 'anchoredPopoverIn');

    await page.locator('.lyrics-translation-toggle').click();
    await expect(unavailableNotice).toHaveAttribute('data-state', 'closed');
    await expect(unavailableNotice).toHaveCSS('animation-name', 'anchoredPopoverOut');
    await expect(unavailableNotice).toHaveCount(0, { timeout: 1000 });

    await page.locator('.lyrics-translation-toggle').click();
    await expect(unavailableNotice).toHaveAttribute('data-state', 'open');
    await page.locator('.lyrics-font-button').click();
    const fontPopover = page.locator('.lyrics-font-popover');
    await expect(fontPopover).toHaveAttribute('data-state', 'open');

    const popoverStyle = await fontPopover.evaluate((popover) => {
      const slider = popover.querySelector('.lyrics-font-slider') as HTMLInputElement | null;
      const style = getComputedStyle(popover);
      const sliderStyle = slider ? getComputedStyle(slider) : null;
      const rect = popover.getBoundingClientRect();
      const unavailable = document.querySelector('.lyrics-translation-unavailable') as HTMLElement | null;
      const unavailableRect = unavailable?.getBoundingClientRect();
      const overlapLeft = unavailableRect ? Math.max(rect.left, unavailableRect.left) : 0;
      const overlapRight = unavailableRect ? Math.min(rect.right, unavailableRect.right) : 0;
      const overlapTop = unavailableRect ? Math.max(rect.top, unavailableRect.top) : 0;
      const overlapBottom = unavailableRect ? Math.min(rect.bottom, unavailableRect.bottom) : 0;
      const overlapWidth = Math.max(0, overlapRight - overlapLeft);
      const overlapHeight = Math.max(0, overlapBottom - overlapTop);
      const overlapHit = unavailableRect
        ? document.elementFromPoint(
          overlapLeft + Math.max(1, overlapWidth / 2),
          overlapTop + Math.max(1, overlapHeight / 2)
        )
        : null;

      return {
        animationName: style.animationName,
        backdropFilter: style.backdropFilter,
        backgroundImage: style.backgroundImage,
        borderRadius: style.borderRadius,
        borderStyle: style.borderStyle,
        insideSideTools: Boolean(popover.closest('.lyrics-side-tools')),
        parentTag: popover.parentElement?.tagName ?? '',
        position: style.position,
        sliderDirection: sliderStyle?.direction ?? '',
        sliderHeight: Number.parseFloat(sliderStyle?.height ?? '0'),
        sliderWidth: Number.parseFloat(sliderStyle?.width ?? '0'),
        sliderWritingMode: sliderStyle?.writingMode ?? '',
        zIndex: Number.parseInt(style.zIndex, 10),
        overlapHitFontPopover: Boolean(overlapHit?.closest('.lyrics-font-popover')),
        transformOrigin: style.transformOrigin
      };
    });

    expect(popoverStyle.animationName).toBe('anchoredPopoverIn');
    expect(popoverStyle.backdropFilter).toContain('blur');
    expect(readBackdropBlurPx(popoverStyle.backdropFilter)).toBe(24);
    expect(popoverStyle.backgroundImage).toContain('linear-gradient');
    expect(popoverStyle.borderRadius).toBe('8px');
    expect(popoverStyle.borderStyle).toBe('solid');
    expect(popoverStyle.parentTag).toBe('BODY');
    expect(popoverStyle.position).toBe('fixed');
    expect(popoverStyle.sliderDirection).toBe('rtl');
    expect(popoverStyle.sliderHeight).toBeCloseTo(116, 0);
    expect(popoverStyle.sliderWidth).toBeCloseTo(26, 0);
    expect(popoverStyle.sliderWritingMode).toBe('vertical-lr');
    expect(popoverStyle.zIndex).toBeGreaterThanOrEqual(120);
    expect(popoverStyle.insideSideTools).toBe(false);
    expect(popoverStyle.overlapHitFontPopover).toBe(true);
    expect(popoverStyle.transformOrigin).not.toBe('50% 50%');
  });

  test('centers content-sized global notifications without a close button', async ({ page }) => {
    await page.evaluate(() => {
      window.musicPlayer.music.getSongUrl = async (providerId, _song, quality) => ({
        ok: true,
        data: {
          ok: false,
          providerId,
          quality,
          reason: {
            category: 'provider_risk',
            message: '网络暂不可用',
            action: 'none'
          }
        }
      });
    });
    await playFirstVisualRuntimeSong(page);

    const notification = page.locator('.app-notification');
    await expect(notification).toContainText('网络暂不可用');
    await page.waitForTimeout(220);
    const shortGeometry = await notification.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        centerDelta: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
        pointerEvents: getComputedStyle(element).pointerEvents,
        top: rect.top,
        width: rect.width
      };
    });
    expect(shortGeometry.width).toBeLessThan(460);
    expect(shortGeometry.centerDelta).toBeLessThanOrEqual(1);
    expect(shortGeometry.top).toBeCloseTo(36, 0);
    expect(shortGeometry.pointerEvents).toBe('none');
    await expect(notification.locator('.app-notification-close')).toHaveCount(0);

    const longMessage = '这是一条用于验证通知内容换行和最大宽度的较长消息，通知应当保持水平居中，同时不能超出当前视口的安全边距。';
    await page.evaluate((message) => {
      window.musicPlayer.music.getSongUrl = async (providerId, _song, quality) => ({
        ok: true,
        data: {
          ok: false,
          providerId,
          quality,
          reason: {
            category: 'provider_risk',
            message,
            action: 'none'
          }
        }
      });
    }, longMessage);
    const secondSong = page.locator('.search-result-row').filter({ hasText: 'Visual Runtime Song 2' }).first();
    await secondSong.dblclick({ position: { x: 92, y: 24 } });
    await expect(notification).toContainText(longMessage);
    const longGeometry = await notification.evaluate((element) => {
      const copy = element.querySelector<HTMLElement>('.app-notification-copy strong');
      const rect = element.getBoundingClientRect();
      return {
        centerDelta: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
        copyWhiteSpace: copy ? getComputedStyle(copy).whiteSpace : '',
        viewportWidth: window.innerWidth,
        width: rect.width
      };
    });
    expect(longGeometry.width).toBeLessThanOrEqual(Math.min(460, longGeometry.viewportWidth - 32));
    expect(longGeometry.centerDelta).toBeLessThanOrEqual(1);
    expect(longGeometry.copyWhiteSpace).toBe('normal');
  });

  test('keeps provider-native discovery content inside the main surface', async ({ page }) => {
    await expect(page.locator('.qq-discovery-primary-open')).toBeDisabled();

    const metrics = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.main-content');
      const home = document.querySelector<HTMLElement>('.discovery-home');
      const firstCard = document.querySelector<HTMLElement>('.qq-discovery-primary-open');
      const player = document.querySelector<HTMLElement>('.player-bar');

      if (!main || !home || !firstCard || !player) {
        throw new Error('Unable to measure provider-native discovery content');
      }

      return {
        horizontalOverflow: main.scrollWidth - main.clientWidth,
        homeLeft: home.getBoundingClientRect().left,
        cardLeft: firstCard.getBoundingClientRect().left,
        playerTop: player.getBoundingClientRect().top
      };
    });

    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.cardLeft).toBeGreaterThanOrEqual(metrics.homeLeft);
    expect(metrics.playerTop).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => ({
      charts: Number.parseInt(window.sessionStorage.getItem('visual-runtime:getCharts') ?? '0', 10),
      chartTracks: Number.parseInt(window.sessionStorage.getItem('visual-runtime:getChartTracks') ?? '0', 10),
      playlists: Number.parseInt(window.sessionStorage.getItem('visual-runtime:getDiscoveredPlaylists') ?? '0', 10)
    }))).toEqual({ charts: 0, chartTracks: 0, playlists: 0 });
  });

  test('keeps account playlists in the sidebar and catalog cards out of discovery home', async ({ page }) => {
    await expect(page.locator('.qq-discovery-playlist-card')).toHaveCount(0);
    await expect(page.locator('.nav-playlist-item')).toHaveCount(6);
    await expect(page.getByRole('region', { name: '发现音乐' })).toBeVisible();
    await expect(page.locator('.qq-discovery-quick-start > article')).toHaveCount(1);
    await expect(page.locator('.qq-discovery-service-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /暂不可用/ })).toHaveCount(0);
    await expect(page.getByText(/歌单补给站|榜单精选|推荐歌单/)).toHaveCount(0);
  });

  test('opens a provider playlist detail from the sidebar with dense QQ rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.getByRole('region', { name: '歌单详情' })).toBeVisible();
    await expect(page.locator('.playlist-detail-song-row')).toHaveCount(3);
    await expect(page.locator('.playlist-detail-hero')).toBeVisible();
    await expect(page.locator('.player-bar')).toBeVisible();
  });

  test('keeps a short playlist header expanded when available scroll is insufficient', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row')).toHaveCount(3);

    const songList = page.locator('.playlist-detail-song-list');
    await songList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(180);

    const headerState = await page.evaluate(() => {
      const detail = document.querySelector('.playlist-detail-view') as HTMLElement | null;
      const list = document.querySelector('.playlist-detail-song-list') as HTMLElement | null;

      if (!detail || !list) {
        throw new Error('Unable to measure short playlist header');
      }

      return {
        maxScrollTop: Math.max(0, list.scrollHeight - list.clientHeight),
        progress: detail.style.getPropertyValue('--playlist-detail-scroll-progress'),
        height: detail.style.getPropertyValue('--playlist-detail-hero-current-min-height'),
        blur: detail.style.getPropertyValue('--playlist-detail-header-content-blur'),
        compact: detail.dataset.headerCompact
      };
    });

    expect(headerState.maxScrollTop).toBeLessThan(168);
    expect(headerState.progress).toBe('0');
    expect(headerState.height).toBe('156px');
    expect(headerState.blur).toBe('0px');
    expect(headerState.compact).toBe('false');
  });

  test('keeps playlist detail header clear until its trigger and completes the full transition', async ({ page }, testInfo) => {
    const viewport = testInfo.project.name === 'compact'
      ? { width: 1040, height: 720 }
      : { width: 1220, height: 780 };
    await page.setViewportSize(viewport);
    const songs = createScrollingVisualRuntimeSongs(34, 'Header Motion Song');
    await page.evaluate(({ fixture, songs }) => {
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data: providerId === 'qq' && playlistId === fixture.playlists[0].id ? songs : []
      });
    }, { fixture: qqVisualRuntimeData, songs });

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row').first()).toContainText('Header Motion Song 1');

    await setPlaylistDetailScrollTop(page, 132);
    await waitForAnimationFrames(page, 3);
    expect(await readPlaylistDetailHeaderMotionState(page)).toEqual({
      blur: '0px',
      compact: 'false',
      progress: '0'
    });

    await setPlaylistDetailScrollTop(page, 168);
    await expect.poll(() => readPlaylistDetailHeaderMotionState(page)).toEqual({
      blur: '0px',
      compact: 'true',
      progress: '1'
    });

    const compactGlowState = await readPlaylistDetailGlowState(page);
    await page.screenshot({
      path: `artifacts/playlist-header-trigger-and-glow-${testInfo.project.name}-compact-header.png`
    });
    expect(compactGlowState.coverLeftClearance).toBeGreaterThanOrEqual(36);
    expect(compactGlowState.coverTopClearance).toBeGreaterThanOrEqual(8);
    expect(compactGlowState.coverTopClearance).toBeLessThanOrEqual(12);

    await setPlaylistDetailScrollTop(page, 132);
    await waitForAnimationFrames(page, 3);
    expect(await readPlaylistDetailHeaderMotionState(page)).toEqual({
      blur: '0px',
      compact: 'true',
      progress: '1'
    });

    await setPlaylistDetailScrollTop(page, 96);
    await expect.poll(() => readPlaylistDetailHeaderMotionState(page)).toEqual({
      blur: '0px',
      compact: 'false',
      progress: '0'
    });

    const glowState = await readPlaylistDetailGlowState(page);

    expect(glowState.coverGlow).toBe('var(--qq-text)');
    expect(glowState.coverLeftClearance).toBeGreaterThanOrEqual(36);
    expect(glowState.coverShadow).not.toBe('none');
    expect(glowState.coverTopClearance).toBeGreaterThanOrEqual(14);
    expect(glowState.coverTopClearance).toBeLessThanOrEqual(16);
    expect(glowState.detailOverflow).toBe('visible');
    expect(glowState.heroOverflow).toBe('visible');
    expect(glowState.mainContentOverflow).toBe('visible');
    expect(glowState.panelOverflow).toBe('hidden');
    expect(glowState.transitionStageContain).not.toContain('paint');
    expect(glowState.playButtonShadow).not.toBe('none');
    await page.screenshot({
      path: `artifacts/playlist-header-trigger-and-glow-${testInfo.project.name}.png`
    });
  });

  test('updates the neutral cover shadow when the theme changes before image sampling', async ({ page }, testInfo) => {
    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-cover')).toBeVisible();

    const readShadowState = () => page.locator('.playlist-detail-cover').evaluate((cover) => ({
      coverGlow: (cover as HTMLElement).style.getPropertyValue('--playlist-detail-cover-glow'),
      coverShadow: getComputedStyle(cover).boxShadow,
      themeText: getComputedStyle(document.documentElement).getPropertyValue('--qq-text').trim()
    }));

    await page.locator('.theme-trigger').click();
    await page.getByRole('button', { name: '使用白色显示模式' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.theme-popover')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('white');

    const lightState = await readShadowState();
    expect(lightState.coverGlow).toBe('var(--qq-text)');
    expect(lightState.themeText).toBe('#202124');
    await page.screenshot({
      path: `artifacts/qq-cover-neutral-fallback-default-white-${testInfo.project.name}.png`
    });

    await page.locator('.theme-trigger').click();
    await page.getByRole('button', { name: '使用黑色显示模式' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.theme-popover')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('black');

    const obsidianState = await readShadowState();
    expect(obsidianState.coverGlow).toBe('var(--qq-text)');
    expect(obsidianState.themeText).toBe('#effffc');
    expect(obsidianState.coverShadow).not.toBe(lightState.coverShadow);
    await page.screenshot({
      path: `artifacts/qq-cover-neutral-fallback-obsidian-${testInfo.project.name}.png`
    });
  });

  test('keeps playlist detail header in a layout row and keeps bottom rows readable above the blurred player', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    await page.evaluate((fixture) => {
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data:
          providerId === 'qq' && playlistId === fixture.playlists[0].id
            ? Array.from({ length: 34 }, (_, index) => {
                const baseSong = fixture.songs[index % fixture.songs.length];

                return {
                  ...baseSong,
                  id: `${baseSong.id}:scroll-${index}`,
                  platformSongId: `${baseSong.platformSongId}-scroll-${index}`,
                  title: `Scroll Runtime Song ${index + 1}`,
                  sourceContext: {
                    type: 'playlist',
                    providerId: 'qq',
                    playlistId: fixture.playlists[0].id,
                    playlistTitle: fixture.playlists[0].title
                  }
                };
              })
            : []
      });
    }, qqVisualRuntimeData);

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row').first()).toContainText('Scroll Runtime Song 1');

    const expandedDescriptionLayout = await readPlaylistDescriptionLayout(page);
    expect(expandedDescriptionLayout.maxWidth).toBe('none');
    expect(Math.abs(expandedDescriptionLayout.descriptionWidth - expandedDescriptionLayout.headingWidth)).toBeLessThanOrEqual(1);
    expect(expandedDescriptionLayout.metaGap).toBeGreaterThanOrEqual(6);

    await page.setViewportSize({ width: 1040, height: 720 });
    const compactDescriptionLayout = await readPlaylistDescriptionLayout(page);
    expect(compactDescriptionLayout.descriptionWidth).toBeLessThan(expandedDescriptionLayout.descriptionWidth);
    expect(Math.abs(compactDescriptionLayout.descriptionWidth - compactDescriptionLayout.headingWidth)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1440, height: 720 });

    await page.locator('.playlist-detail-song-list').evaluate((songList) => {
      songList.scrollTop = 190;
      songList.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('.playlist-detail-view')).toHaveAttribute('data-header-compact', 'true');

    const headerState = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;
      const heroShell = document.querySelector('.playlist-detail-hero-shell') as HTMLElement | null;
      const detail = document.querySelector('.playlist-detail-view') as HTMLElement | null;
      const songList = document.querySelector('.playlist-detail-song-list') as HTMLElement | null;

      if (!mainContent || !heroShell || !detail || !songList) {
        throw new Error('Unable to measure playlist detail layout');
      }

      const mainRect = mainContent.getBoundingClientRect();
      const shellRect = heroShell.getBoundingClientRect();
      const listRect = songList.getBoundingClientRect();
      const headerHit = document.elementFromPoint(shellRect.left + shellRect.width / 2, shellRect.top + shellRect.height / 2);

      return {
        mainOverflow: getComputedStyle(mainContent).overflow,
        shellPosition: getComputedStyle(heroShell).position,
        topDelta: shellRect.top - mainRect.top,
        rightEdgeGap: mainRect.right - listRect.right,
        listBelowHeaderGap: listRect.top - shellRect.bottom,
        hitSongRowInHeader: Boolean(headerHit?.closest('.playlist-detail-song-row')),
        compactHeight: Number.parseFloat(detail.style.getPropertyValue('--playlist-detail-hero-current-min-height')),
        listScrollTop: songList.scrollTop
      };
    });

    expect(headerState.mainOverflow).toBe('visible');
    expect(headerState.shellPosition).toBe('relative');
    expect(Math.abs(headerState.topDelta)).toBeLessThanOrEqual(32);
    expect(headerState.rightEdgeGap).toBeLessThanOrEqual(12);
    expect(headerState.listBelowHeaderGap).toBeGreaterThanOrEqual(0);
    expect(headerState.hitSongRowInHeader).toBe(false);
    expect(headerState.compactHeight).toBe(72);
    expect(headerState.listScrollTop).toBeGreaterThan(0);

    await scrollSongListToBottom(page, '.playlist-detail-song-list', '.playlist-detail-song-row', 'Scroll Runtime Song 34');

    const bottomState = await page.evaluate(() => {
      const songList = document.querySelector('.playlist-detail-song-list') as HTMLElement | null;
      const panel = document.querySelector('.playlist-detail-panel') as HTMLElement | null;
      const playerBar = document.querySelector('.player-bar') as HTMLElement | null;
      const scrollbar = document.querySelector('.playlist-detail-panel .song-list-visual-scrollbar') as HTMLElement | null;
      const rows = Array.from(document.querySelectorAll('.playlist-detail-song-row')) as HTMLElement[];

      if (!songList || !panel || !playerBar || !scrollbar || rows.length === 0) {
        throw new Error('Unable to measure playlist bottom spacing');
      }

      const listRect = songList.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const playerBarRect = playerBar.getBoundingClientRect();
      const scrollbarRect = scrollbar.getBoundingClientRect();
      const lastRow = rows.at(-1)!;
      const lastRowRect = lastRow.getBoundingClientRect();
      const paddingBottom = Number.parseFloat(getComputedStyle(songList).paddingBottom);
      const lastRowBottomHit = document.elementFromPoint(
        lastRowRect.left + Math.min(48, lastRowRect.width / 2),
        lastRowRect.bottom - 2
      );
      const scrollbarBottomHit = document.elementFromPoint(
        scrollbarRect.left + scrollbarRect.width / 2,
        scrollbarRect.bottom - 2
      );

      return {
        bottomGap: listRect.bottom - lastRowRect.bottom,
        listToPlayerGap: playerBarRect.top - listRect.bottom,
        lastRowToPlayerGap: playerBarRect.top - lastRowRect.bottom,
        lastRowBottomCoveredByPlayer: Boolean(lastRowBottomHit?.closest('.player-bar')),
        visualScrollbarBottomToPlayerGap: playerBarRect.top - scrollbarRect.bottom,
        visualScrollbarBottomCoveredByPlayer: Boolean(scrollbarBottomHit?.closest('.player-bar')),
        paddingBottom,
        playerHeight: playerBarRect.height,
        lastRowBorderBottomWidth: getComputedStyle(lastRow).borderBottomWidth,
        panelBottomGap: panelRect.bottom - listRect.bottom
      };
    });

    expect(bottomState.lastRowBorderBottomWidth).toBe('0px');
    expect.soft(bottomState.lastRowToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(bottomState.lastRowBottomCoveredByPlayer).toBe(false);
    expect.soft(bottomState.visualScrollbarBottomToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(bottomState.visualScrollbarBottomCoveredByPlayer).toBe(false);
    expect(bottomState.panelBottomGap).toBeGreaterThanOrEqual(-0.5);
    expect(bottomState.panelBottomGap).toBeLessThanOrEqual(bottomState.playerHeight);
  });

  test('renders playlist floating controls with visible frosted material and open/close blur animations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    await page.evaluate((fixture) => {
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data:
          providerId === 'qq' && playlistId === fixture.playlists[0].id
            ? Array.from({ length: 34 }, (_, index) => {
                const baseSong = fixture.songs[index % fixture.songs.length];

                return {
                  ...baseSong,
                  id: `${baseSong.id}:floating-${index}`,
                  platformSongId: `${baseSong.platformSongId}-floating-${index}`,
                  title: `Floating Runtime Song ${index + 1}`
                };
              })
            : []
      });
    }, qqVisualRuntimeData);

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    const songList = page.locator('.playlist-detail-song-list');
    await expect(songList.locator('.playlist-detail-song-row').first()).toContainText('Floating Runtime Song 1');

    await songList.evaluate((element) => {
      element.scrollTop = 190;
      element.dispatchEvent(new Event('scroll'));
    });

    const scrollTopButton = page.getByRole('button', { name: '回到歌单顶部' });
    await expect(scrollTopButton).toHaveAttribute('data-state', 'open');

    const openMaterial = await readFloatingControlMaterial(scrollTopButton);
    expect(openMaterial.animationName).toContain('anchoredPopoverIn');
    expect(openMaterial.backdropFilter).toContain('blur');
    expect(readBackdropBlurPx(openMaterial.backdropFilter)).toBe(24);
    expect(openMaterial.borderRadius).toBe('8px');
    expect(openMaterial.transformOrigin).toBe('34px 34px');
    expect(openMaterial.backgroundImage).toContain('linear-gradient');
    expect(openMaterial.boxShadow).toContain('inset');
    expect(openMaterial.beforeContent).toBe('""');
    expect(openMaterial.beforeBackgroundImage).toContain('linear-gradient');
    expect(openMaterial.beforeOpacity).toBeGreaterThan(0);

    await songList.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });

    await expect(scrollTopButton).toHaveAttribute('data-state', 'closed');
    const closedMaterial = await readFloatingControlMaterial(scrollTopButton);
    expect(closedMaterial.animationName).toContain('anchoredPopoverOut');
    expect(closedMaterial.beforeContent).toBe('""');
  });

  test('keeps long search queries compact and scrolls overview entities clear of the player', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    const keyword = 'visual runtime left turn signal 1000 times plus one extended search query for compact layout';
    const songs = createScrollingVisualRuntimeSongs(16, 'Compact Search Runtime Song');
    const albums = Array.from({ length: 12 }, (_, index) => ({
      id: `qq:album:compact-search-${index + 1}`,
      providerId: 'qq' as const,
      platformAlbumId: `compact-search-${index + 1}`,
      title: `Compact Search Runtime Album ${index + 1}`,
      artistName: 'Compact Search Runtime Artist',
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: 'QQ音乐'
    }));

    await page.evaluate(({ keyword, songs, albums }) => {
      window.musicPlayer.music.searchEntities = async (providerId, query) => {
        const matches = providerId === 'qq' && String(query) === keyword;
        return {
          ok: true,
          data: {
            providerId,
            keyword: String(query),
            sections: {
              songs: {
                available: true,
                items: matches ? songs : [],
                total: matches ? songs.length : 0,
                hasMore: false,
                errorMessage: null
              },
              artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
              albums: {
                available: true,
                items: matches ? albums : [],
                total: matches ? albums.length : 0,
                hasMore: false,
                errorMessage: null
              },
              playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
            }
          }
        };
      };
    }, { keyword, songs, albums });

    const searchInput = page.locator('.search-box input[name="keyword"]');
    await searchInput.fill(keyword);
    await searchInput.press('Enter');
    await expect(page.locator('.qq-search-query')).toHaveAttribute('title', keyword);
    await expect(page.getByRole('button', { name: `查看全部${songs.length}首歌曲` })).toBeVisible();
    await expect(page.getByRole('button', { name: `查看全部${albums.length}项专辑` })).toBeVisible();
    await waitForMainContentTransition(page);

    const layout = await page.locator('.qq-search-view').evaluate((view) => {
      const query = view.querySelector<HTMLElement>('.qq-search-query');
      const toolbar = view.querySelector<HTMLElement>('.qq-search-hero');
      const summary = view.querySelector<HTMLElement>('.qq-search-summary');
      const tabs = view.querySelector<HTMLElement>('.search-result-tabs');
      const provider = view.querySelector<HTMLElement>('.provider-segmented-control');
      const scroller = view.querySelector<HTMLElement>('.search-results-content.search-results-scroll');
      if (!query || !toolbar || !summary || !tabs || !provider || !scroller) {
        throw new Error('Unable to inspect compact search layout');
      }

      const queryStyle = getComputedStyle(query);
      const toolbarRect = toolbar.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const tabsRect = tabs.getBoundingClientRect();
      const providerRect = provider.getBoundingClientRect();
      return {
        hasOverflow: scroller.scrollHeight > scroller.clientHeight,
        keywordEllipsized: query.scrollWidth > query.clientWidth,
        providerGap: providerRect.left - tabsRect.right,
        summaryGap: tabsRect.left - summaryRect.right,
        textOverflow: queryStyle.textOverflow,
        toolbarHeight: toolbarRect.height,
        whiteSpace: queryStyle.whiteSpace
      };
    });

    expect(layout.whiteSpace).toBe('nowrap');
    expect(layout.textOverflow).toBe('ellipsis');
    expect(layout.keywordEllipsized).toBe(true);
    expect(layout.toolbarHeight).toBeLessThanOrEqual(72);
    expect(layout.summaryGap).toBeGreaterThanOrEqual(8);
    expect(layout.providerGap).toBeGreaterThanOrEqual(8);
    expect(layout.hasOverflow).toBe(true);

    const overviewScroller = page.locator('.search-results-content.search-results-scroll');
    await overviewScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });

    const bottomLayout = await page.locator('.search-entity-card').last().evaluate((lastAlbum) => {
      const scroller = document.querySelector<HTMLElement>('.search-results-content.search-results-scroll');
      const player = document.querySelector<HTMLElement>('.player-bar');
      if (!scroller || !player) {
        throw new Error('Unable to inspect search overview bottom clearance');
      }

      const albumRect = lastAlbum.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const playerRect = player.getBoundingClientRect();
      return {
        albumBottomToPlayerGap: playerRect.top - albumRect.bottom,
        albumVisible: albumRect.top >= scrollerRect.top && albumRect.bottom <= scrollerRect.bottom,
        reachedBottom: Math.abs(scroller.scrollTop - (scroller.scrollHeight - scroller.clientHeight)) <= 1
      };
    });

    expect(bottomLayout.reachedBottom).toBe(true);
    expect(bottomLayout.albumVisible).toBe(true);
    expect(bottomLayout.albumBottomToPlayerGap).toBeGreaterThanOrEqual(0);
  });

  test('keeps song list column headers pinned while search and playlist lists scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    const scrollingSongs = createScrollingVisualRuntimeSongs(34);

    await page.evaluate(({ fixture, songs }) => {
      window.musicPlayer.music.searchEntities = async (providerId, query) => {
        const items = providerId === 'qq' && String(query).toLowerCase().includes('sticky') ? songs : [];
        return {
          ok: true,
          data: {
            providerId,
            keyword: String(query),
            sections: {
              songs: { available: true, items, total: items.length, hasMore: false, errorMessage: null },
              artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
              albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
              playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
            }
          }
        };
      };
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data: providerId === 'qq' && playlistId === fixture.playlists[0].id ? songs : []
      });
    }, { fixture: qqVisualRuntimeData, songs: scrollingSongs });

    const searchInput = page.locator('.search-box input[name="keyword"]');
    await searchInput.fill('sticky headers');
    await searchInput.press('Enter');
    await page.getByRole('tab', { name: '歌曲', exact: true }).click();
    await expect.poll(() => page.locator('.search-result-row').count()).toBeLessThan(34);
    await expect(page.locator('.qq-search-song-list-virtual-space')).toHaveCSS('height', '1700px');
    await waitForMainContentTransition(page);

    await page.locator('.qq-search-song-list').evaluate((songList) => {
      songList.scrollTop = 190;
      songList.dispatchEvent(new Event('scroll'));
    });

    const searchHeaderState = await readStickyHeaderState(page, '.qq-search-song-list', '.qq-search-song-list-head');
    expect(searchHeaderState.scrollTop).toBeGreaterThan(0);
    expect(searchHeaderState.position).toBe('relative');
    expect(searchHeaderState.topDelta).toBeGreaterThanOrEqual(0);
    expect(searchHeaderState.headerBottom).toBeLessThanOrEqual(searchHeaderState.listTop + 1);
    expect(searchHeaderState.boxShadow).toBe('none');
    expect(searchHeaderState.hitSongRowInHeader).toBe(false);
    const searchMidBackdropState = await readLivePlayerBackdropState(page, '.qq-search-song-list', '.search-result-row');
    expect(searchMidBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(searchMidBackdropState.hasRealRowBehindPlayer).toBe(true);
    expect(searchMidBackdropState.liveBackdropText).toContain('Sticky Runtime Song');

    await scrollSongListToBottom(page, '.qq-search-song-list', '.search-result-row', 'Sticky Runtime Song 34');
    const searchBottomState = await readBottomPlayerClearance(page, '.qq-search-song-list', '.search-result-row');
    const searchBackdropState = await readLivePlayerBackdropState(page, '.qq-search-song-list', '.search-result-row');
    expect.soft(searchBottomState.lastRowToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(searchBottomState.lastRowBottomCoveredByPlayer).toBe(false);
    expect.soft(searchBottomState.visualScrollbarBottomToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(searchBottomState.visualScrollbarBottomCoveredByPlayer).toBe(false);
    expect(searchBackdropState.hasStaticSampler).toBe(false);
    expect(searchBackdropState.hasMainContentStaticAfter).toBe(false);
    expect(searchBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(searchBackdropState.playerBackdrop).not.toBe('none');
    expect(searchBackdropState.hasRealRowBehindPlayer).toBe(false);
    expect(searchBackdropState.liveBackdropText).not.toContain('Sticky Runtime Song 34');

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row').first()).toContainText('Sticky Runtime Song 1');
    await waitForMainContentTransition(page);

    const playlistDockState = await page.evaluate(() => {
      const topBar = document.querySelector<HTMLElement>('.top-bar');
      const mainContent = document.querySelector<HTMLElement>('.main-content-playlist');
      const detail = document.querySelector<HTMLElement>('.playlist-detail-view');
      if (!topBar || !mainContent || !detail) {
        throw new Error('Unable to read playlist top docking geometry');
      }
      const topBarRect = topBar.getBoundingClientRect();
      const mainRect = mainContent.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      return {
        paddingTop: getComputedStyle(mainContent).paddingTop,
        mainToTopBarDelta: Math.abs(mainRect.top - topBarRect.bottom),
        detailToMainDelta: Math.abs(detailRect.top - mainRect.top)
      };
    });
    expect(playlistDockState.paddingTop).toBe('0px');
    expect(playlistDockState.mainToTopBarDelta).toBeLessThanOrEqual(2);
    expect(playlistDockState.detailToMainDelta).toBeLessThanOrEqual(1);

    await page.locator('.playlist-detail-song-list').evaluate((songList) => {
      songList.scrollTop = 190;
      songList.dispatchEvent(new Event('scroll'));
    });

    const playlistHeaderState = await readStickyHeaderState(page, '.playlist-detail-song-list', '.playlist-detail-song-list-head');
    expect(playlistHeaderState.scrollTop).toBeGreaterThan(0);
    expect(playlistHeaderState.position).toBe('relative');
    expect(playlistHeaderState.topDelta).toBeGreaterThanOrEqual(0);
    expect(playlistHeaderState.headerBottom).toBeLessThanOrEqual(playlistHeaderState.listTop + 1);
    expect(playlistHeaderState.boxShadow).toBe('none');
    expect(playlistHeaderState.hitSongRowInHeader).toBe(false);
    const playlistMidBackdropState = await readLivePlayerBackdropState(page, '.playlist-detail-song-list', '.playlist-detail-song-row');
    expect(playlistMidBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(playlistMidBackdropState.hasRealRowBehindPlayer).toBe(true);
    expect(playlistMidBackdropState.liveBackdropText).toContain('Sticky Runtime Song');

    await scrollSongListToBottom(page, '.playlist-detail-song-list', '.playlist-detail-song-row', 'Sticky Runtime Song 34');
    const playlistBottomState = await readBottomPlayerClearance(page, '.playlist-detail-song-list', '.playlist-detail-song-row');
    const playlistBackdropState = await readLivePlayerBackdropState(page, '.playlist-detail-song-list', '.playlist-detail-song-row');
    expect.soft(playlistBottomState.lastRowToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(playlistBottomState.lastRowBottomCoveredByPlayer).toBe(false);
    expect.soft(playlistBottomState.visualScrollbarBottomToPlayerGap).toBeGreaterThanOrEqual(0);
    expect.soft(playlistBottomState.visualScrollbarBottomCoveredByPlayer).toBe(false);
    expect(playlistBackdropState.hasStaticSampler).toBe(false);
    expect(playlistBackdropState.hasMainContentStaticAfter).toBe(false);
    expect(playlistBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(playlistBackdropState.playerBackdrop).not.toBe('none');
    expect(playlistBackdropState.hasRealRowBehindPlayer).toBe(false);
    expect(playlistBackdropState.liveBackdropText).not.toContain('Sticky Runtime Song 34');
  });

  test('keeps a 1000-song playlist virtualized during continuous scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop performance sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const songs = createScrollingVisualRuntimeSongs(1000, 'Performance Runtime Song');

    await page.evaluate(({ fixture, songs }) => {
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data: providerId === 'qq' && playlistId === fixture.playlists[0].id ? songs : []
      });
    }, { fixture: qqVisualRuntimeData, songs });

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row').first()).toContainText('Performance Runtime Song 1');
    await waitForMainContentTransition(page);

    const songList = page.locator('.playlist-detail-song-list');
    await expect.poll(() => page.locator('.playlist-detail-song-row').count()).toBeLessThan(40);
    await songList.evaluate((element) => {
      const detail = document.querySelector<HTMLElement>('.playlist-detail-view');
      if (!detail) {
        throw new Error('Unable to observe the playlist detail header');
      }

      delete element.dataset.headerThresholdAt;
      delete element.dataset.headerProgressAt;
      const readProgress = () => Number.parseFloat(
        detail.style.getPropertyValue('--playlist-detail-scroll-progress') || '0'
      );
      const observeHeaderProgress = () => {
        if (readProgress() > 0) {
          element.dataset.headerProgressAt = String(performance.now());
          return;
        }

        requestAnimationFrame(observeHeaderProgress);
      };
      const observeThreshold = () => {
        if (element.scrollTop < 168) {
          return;
        }

        element.removeEventListener('scroll', observeThreshold);
        element.dataset.headerThresholdAt = String(performance.now());
        requestAnimationFrame(observeHeaderProgress);
      };

      element.addEventListener('scroll', observeThreshold, { passive: true });
    });

    const visualScrollbar = page.locator('.song-list-visual-scrollbar');
    await expect(visualScrollbar).toHaveAttribute('data-scrollable', 'true');
    const scrollbarBox = await visualScrollbar.boundingBox();
    if (!scrollbarBox) {
      throw new Error('Unable to drag the playlist visual scrollbar');
    }

    const dragX = scrollbarBox.x + scrollbarBox.width / 2;
    const dragStartY = scrollbarBox.y + Math.min(18, scrollbarBox.height / 4);
    const dragEndY = scrollbarBox.y + scrollbarBox.height * 0.68;
    await page.mouse.move(dragX, dragStartY);
    await page.mouse.down();
    try {
      for (let index = 1; index <= 12; index += 1) {
        await page.mouse.move(dragX, dragStartY + (dragEndY - dragStartY) * index / 12);
      }

      await expect.poll(async () => songList.evaluate((element) => (
        Number(element.dataset.headerProgressAt ?? 0)
      ))).toBeGreaterThan(0);
    } finally {
      await page.mouse.up();
    }

    const dragResult = await songList.evaluate(async (element) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const rect = element.getBoundingClientRect();
      const centerElement = document.elementFromPoint(rect.left + Math.min(160, rect.width / 2), rect.top + rect.height / 2);
      const centerRow = centerElement?.closest<HTMLElement>('.playlist-detail-song-row') ?? null;
      const actualSongNumber = Number(centerRow?.dataset.songId?.match(/(\d+)$/)?.[1] ?? 0);
      const expectedSongNumber = Math.floor((element.scrollTop + element.clientHeight / 2) / 58) + 1;
      const thresholdAt = Number(element.dataset.headerThresholdAt ?? 0);
      const progressAt = Number(element.dataset.headerProgressAt ?? 0);

      return {
        actualSongNumber,
        expectedSongNumber,
        headerStartDelay: progressAt - thresholdAt,
        renderedRowCount: document.querySelectorAll('.playlist-detail-song-row').length
      };
    });

    expect(dragResult.headerStartDelay).toBeGreaterThanOrEqual(0);
    expect(dragResult.headerStartDelay).toBeLessThanOrEqual(80);
    expect(dragResult.actualSongNumber).toBeGreaterThan(0);
    expect(Math.abs(dragResult.actualSongNumber - dragResult.expectedSongNumber)).toBeLessThanOrEqual(1);
    expect(dragResult.renderedRowCount).toBeLessThan(40);

    const metrics = await songList.evaluate(async (element) => {
      const frameDurations: number[] = [];
      let longTaskDuration = 0;
      let previousFrameTime: number | null = null;
      const longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes.includes('longtask')
      const observer = longTaskSupported
        ? new PerformanceObserver((list) => {
            longTaskDuration += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
          })
        : null;
      observer?.observe({ type: 'longtask', buffered: false });

      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      for (let index = 1; index <= 90; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame((timestamp) => {
          if (previousFrameTime !== null) {
            frameDurations.push(timestamp - previousFrameTime);
          }
          previousFrameTime = timestamp;
          element.scrollTop = maxScrollTop * index / 90;
          resolve();
        }));
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (observer) {
        longTaskDuration += observer.takeRecords().reduce((sum, entry) => sum + entry.duration, 0);
      }
      observer?.disconnect();

      const sortedDurations = [...frameDurations].sort((left, right) => left - right);
      const p95Index = Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * 0.95)
      );
      return {
        longTaskSupported,
        longTaskDuration,
        maxFrameDuration: Math.max(...frameDurations, 0),
        p95FrameDuration: sortedDurations[p95Index] ?? 0,
        renderedRowCount: document.querySelectorAll('.playlist-detail-song-row').length
      };
    });

    expect(metrics.renderedRowCount).toBeLessThan(40);
    expect(metrics.p95FrameDuration).toBeLessThanOrEqual(24);
    expect(metrics.maxFrameDuration).toBeLessThanOrEqual(50);
    if (metrics.longTaskSupported) {
      expect(metrics.longTaskDuration).toBe(0);
    }
  });

  test('keeps 1000 full search results virtualized and globally indexed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop performance sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const songs = createScrollingVisualRuntimeSongs(1000, 'Search Performance Runtime Song');
    const lastSong = songs.at(-1)!;

    await page.evaluate(({ songs, audioUrl }) => {
      window.musicPlayer.music.searchEntities = async (providerId, query) => {
        const items = providerId === 'qq' && String(query).toLowerCase().includes('search performance')
          ? songs
          : [];

        return {
          ok: true,
          data: {
            providerId,
            keyword: String(query),
            sections: {
              songs: { available: true, items, total: items.length, hasMore: false, errorMessage: null },
              artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
              albums: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
              playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
            }
          }
        };
      };
      window.musicPlayer.music.getSongUrl = async (providerId, _song, quality) => ({
        ok: true,
        data: {
          ok: providerId === 'qq',
          providerId,
          quality,
          url: providerId === 'qq' ? audioUrl : ''
        }
      });
    }, { songs, audioUrl: createSilentWavDataUrl() });

    const searchInput = page.locator('.search-box input[name="keyword"]');
    await searchInput.fill('search performance');
    await searchInput.press('Enter');
    await page.getByRole('tab', { name: '歌曲', exact: true }).click();
    await expect(page.locator('.qq-search-view')).toHaveAttribute('data-search-result-view', 'song');
    await expect(page.locator('.qq-search-song-row').first()).toContainText('Search Performance Runtime Song 1');
    await waitForMainContentTransition(page);

    const songList = page.locator('.qq-search-song-list');
    await expect.poll(() => page.locator('.qq-search-song-row').count()).toBeLessThan(40);
    const metrics = await songList.evaluate(async (element) => {
      const virtualSpace = element.querySelector<HTMLElement>('.qq-search-song-list-virtual-space');
      if (!virtualSpace) {
        throw new Error('Unable to inspect full search result virtual space');
      }

      const frameDurations: number[] = [];
      let previousFrameTime: number | null = null;
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      for (let index = 1; index <= 90; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame((timestamp) => {
          if (previousFrameTime !== null) {
            frameDurations.push(timestamp - previousFrameTime);
          }
          previousFrameTime = timestamp;
          element.scrollTop = maxScrollTop * index / 90;
          element.dispatchEvent(new Event('scroll'));
          resolve();
        }));
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const sortedDurations = [...frameDurations].sort((left, right) => left - right);
      const p95Index = Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * 0.95)
      );
      return {
        maxFrameDuration: Math.max(...frameDurations, 0),
        p95FrameDuration: sortedDurations[p95Index] ?? 0,
        reachedBottom: Math.abs(element.scrollTop - maxScrollTop) <= 1,
        renderedRowCount: element.querySelectorAll('.qq-search-song-row').length,
        totalHeight: virtualSpace.getBoundingClientRect().height
      };
    });

    expect(metrics.totalHeight).toBeGreaterThanOrEqual(49_990);
    expect(metrics.totalHeight).toBeLessThanOrEqual(50_010);
    expect(metrics.renderedRowCount).toBeLessThan(40);
    expect(metrics.reachedBottom).toBe(true);
    expect(metrics.p95FrameDuration).toBeLessThanOrEqual(24);
    expect(metrics.maxFrameDuration).toBeLessThanOrEqual(50);

    const lastRow = page.locator(`.qq-search-song-row[data-song-id="${lastSong.id}"]`);
    await expect(lastRow).toContainText(lastSong.title);
    await expect.poll(() => page.locator('.qq-search-song-row').count()).toBeLessThan(40);
    await lastRow.click({ button: 'right', position: { x: 80, y: 24 } });
    const lastSongMenu = page.getByRole('menu', { name: `歌曲操作：${lastSong.title}` });
    await expect(lastSongMenu).toBeVisible();
    await lastSongMenu.getByRole('menuitem', { name: '播放', exact: true }).click();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', lastSong.title);
  });

  test('keeps a large playlist discovery grid virtualized during continuous scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop performance sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const playlists = createLargeDiscoveredPlaylists(360);

    await page.evaluate((largePlaylists) => {
      window.musicPlayer.music.getDiscoveredPlaylists = async (providerId, query) => ({
        ok: true,
        data: {
          providerId,
          categoryId: query.categoryId,
          playlists: providerId === 'qq' ? largePlaylists : [],
          offset: query.offset,
          limit: largePlaylists.length,
          total: largePlaylists.length,
          hasMore: false
        }
      });
    }, playlists);

    await page.getByRole('button', { name: '歌单广场' }).click();
    const discovery = page.getByRole('region', { name: '歌单广场' });
    await expect(discovery).toBeVisible();
    const gridShell = page.locator('.playlist-discovery-grid-shell');
    await expect.poll(() => gridShell.getAttribute('data-virtualized')).toBe('true');
    await waitForMainContentTransition(page);

    const gridMetrics = await page.locator('.main-content-playlist-discovery').evaluate(async (scrollRoot) => {
      const frameDurations: number[] = [];
      let longTaskDuration = 0;
      let previousFrameTime: number | null = null;
      const longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = longTaskSupported
        ? new PerformanceObserver((list) => {
            longTaskDuration += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
          })
        : null;
      observer?.observe({ type: 'longtask', buffered: false });
      const gridShell = scrollRoot.querySelector<HTMLElement>('.playlist-discovery-grid-shell');
      const virtualSpace = scrollRoot.querySelector<HTMLElement>('.playlist-discovery-grid-virtual-space');
      if (!gridShell || !virtualSpace) {
        throw new Error('Unable to inspect large playlist discovery grid');
      }

      const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      for (let index = 1; index <= 90; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame((timestamp) => {
          if (previousFrameTime !== null) {
            frameDurations.push(timestamp - previousFrameTime);
          }
          previousFrameTime = timestamp;
          scrollRoot.scrollTop = maxScrollTop * index / 90;
          scrollRoot.dispatchEvent(new Event('scroll'));
          resolve();
        }));
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      observer?.disconnect();

      const sortedDurations = [...frameDurations].sort((left, right) => left - right);
      const p95Index = Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * 0.95)
      );
      return {
        longTaskSupported,
        longTaskDuration,
        maxFrameDuration: Math.max(...frameDurations, 0),
        p95FrameDuration: sortedDurations[p95Index] ?? 0,
        renderedCardCount: gridShell.querySelectorAll('.playlist-discovery-card').length,
        totalHeight: virtualSpace.getBoundingClientRect().height,
        viewportHeight: scrollRoot.clientHeight,
        virtualized: gridShell.dataset.virtualized
      };
    });

    expect(gridMetrics.virtualized).toBe('true');
    expect(gridMetrics.renderedCardCount).toBeLessThan(60);
    expect(gridMetrics.totalHeight).toBeGreaterThan(gridMetrics.viewportHeight);
    expect(gridMetrics.p95FrameDuration).toBeLessThanOrEqual(24);
    expect(gridMetrics.maxFrameDuration).toBeLessThanOrEqual(50);
    if (gridMetrics.longTaskSupported) {
      expect(gridMetrics.longTaskDuration).toBe(0);
    }
  });

  test('keeps live player blur while a long discovery page is scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop scroll-compositing sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const playlists = createLargeDiscoveredPlaylists(360);

    await page.evaluate((largePlaylists) => {
      window.musicPlayer.music.getDiscoveredPlaylists = async (providerId, query) => ({
        ok: true,
        data: {
          providerId,
          categoryId: query.categoryId,
          playlists: providerId === 'qq' ? largePlaylists : [],
          offset: query.offset,
          limit: largePlaylists.length,
          total: largePlaylists.length,
          hasMore: false
        }
      });
    }, playlists);

    await page.getByRole('button', { name: '歌单广场' }).click();
    await expect(page.getByRole('region', { name: '歌单广场' })).toBeVisible();
    await expect(page.locator('.playlist-discovery-grid-shell')).toHaveAttribute('data-virtualized', 'true');
    await waitForMainContentTransition(page);

    const player = page.locator('.player-bar');
    const idleStyle = await player.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter,
        transitionProperty: style.transitionProperty
      };
    });
    expect(idleStyle.backdropFilter).toContain('blur(24px)');
    expect(idleStyle.transitionProperty).not.toContain('backdrop-filter');

    const scrollingStyle = await page.locator('.main-content-playlist-discovery').evaluate(async (scrollRoot) => {
      const shell = scrollRoot.closest<HTMLElement>('.desktop-shell');
      const playerElement = document.querySelector<HTMLElement>('.player-bar');
      if (!shell || !playerElement) {
        throw new Error('Unable to inspect scrolling player surface');
      }

      const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      if (maxScrollTop <= 0) {
        throw new Error('Discovery fixture did not produce a scrollable page');
      }

      const backdropFilters = new Set<string>();
      for (let index = 1; index <= 18; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => {
          scrollRoot.scrollTop = maxScrollTop * index / 18;
          scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
          backdropFilters.add(getComputedStyle(playerElement).backdropFilter);
          resolve();
        }));
      }

      return {
        shellScrolling: shell.dataset.scrolling === 'true',
        scrollTop: scrollRoot.scrollTop,
        maxScrollTop,
        backdropFilters: [...backdropFilters]
      };
    });

    expect(scrollingStyle.shellScrolling).toBe(false);
    expect(scrollingStyle.scrollTop).toBeGreaterThan(0);
    expect(scrollingStyle.maxScrollTop).toBeGreaterThan(0);
    expect(scrollingStyle.backdropFilters.length).toBeGreaterThan(0);
    expect(scrollingStyle.backdropFilters.every((filter) => filter.includes('blur(24px)'))).toBe(true);
    await expect(page.locator('.desktop-shell')).not.toHaveAttribute('data-scrolling', /.+/);

    const settledStyle = await player.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter
      };
    });
    expect(settledStyle.backdropFilter).toBe(idleStyle.backdropFilter);
  });

  test('updates the blurred player backdrop source when the active list content changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    const searchSongs = createScrollingVisualRuntimeSongs(34, 'Search Backdrop Song');
    const playlistSongs = createScrollingVisualRuntimeSongs(34, 'Playlist Backdrop Song');

    await page.evaluate(({ fixture, searchSongs, playlistSongs }) => {
      window.musicPlayer.music.searchEntities = async (providerId, query) => {
        const items = providerId === 'qq' && String(query).toLowerCase().includes('live backdrop') ? searchSongs : [];
        return {
          ok: true,
          data: {
            providerId,
            keyword: String(query),
            sections: {
              songs: { available: true, items, total: items.length, hasMore: false, errorMessage: null },
              artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
              albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
              playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
            }
          }
        };
      };
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => ({
        ok: true,
        data: providerId === 'qq' && playlistId === fixture.playlists[0].id ? playlistSongs : []
      });
    }, { fixture: qqVisualRuntimeData, searchSongs, playlistSongs });

    const searchInput = page.locator('.search-box input[name="keyword"]');
    await searchInput.fill('live backdrop');
    await searchInput.press('Enter');
    await page.getByRole('tab', { name: '歌曲', exact: true }).click();
    await expect.poll(() => page.locator('.search-result-row').count()).toBeLessThan(34);
    await expect(page.locator('.qq-search-song-list-virtual-space')).toHaveCSS('height', '1700px');

    await scrollSongListToBackdropSample(page, '.qq-search-song-list', '.search-result-row', 'Search Backdrop Song');

    const searchBackdropState = await readLivePlayerBackdropState(page, '.qq-search-song-list', '.search-result-row');
    expect(searchBackdropState.hasStaticSampler).toBe(false);
    expect(searchBackdropState.hasMainContentStaticAfter).toBe(false);
    expect(searchBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(searchBackdropState.hasRealRowBehindPlayer).toBe(true);
    expect(searchBackdropState.liveBackdropText).toContain('Search Backdrop Song');

    await page.locator('.nav-playlist-item', { hasText: 'Visual Runtime Playlist 1' }).click();
    await expect(page.locator('.playlist-detail-song-row').first()).toContainText('Playlist Backdrop Song 1');

    await scrollSongListToBackdropSample(page, '.playlist-detail-song-list', '.playlist-detail-song-row', 'Playlist Backdrop Song');

    const playlistBackdropState = await readLivePlayerBackdropState(page, '.playlist-detail-song-list', '.playlist-detail-song-row');
    expect(playlistBackdropState.hasStaticSampler).toBe(false);
    expect(playlistBackdropState.hasMainContentStaticAfter).toBe(false);
    expect(playlistBackdropState.hasLiveBackdropMirror).toBe(false);
    expect(playlistBackdropState.hasRealRowBehindPlayer).toBe(true);
    expect(playlistBackdropState.liveBackdropText).toContain('Playlist Backdrop Song');
    expect(playlistBackdropState.liveBackdropText).not.toBe(searchBackdropState.liveBackdropText);
  });

  test('guards injected search and playlist fixtures by provider and expected QQ query', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const musicApi = window.musicPlayer.music;
      const wrongProvider = await musicApi.search('netease', 'visual runtime');
      const wrongQuery = await musicApi.search('qq', 'unexpected keyword');
      const correctQuery = await musicApi.search('qq', 'visual runtime');
      const wrongPlaylistProvider = await musicApi.getPlaylistTracks('netease', 'qq:visual-runtime-playlist-1');
      const wrongPlaylistId = await musicApi.getPlaylistTracks('qq', 'qq:unknown-playlist');
      const correctPlaylist = await musicApi.getPlaylistTracks('qq', 'qq:visual-runtime-playlist-1');

      return {
        wrongProviderSongs: wrongProvider.data.length,
        wrongQuerySongs: wrongQuery.data.length,
        correctQuerySongs: correctQuery.data.length,
        wrongPlaylistProviderSongs: wrongPlaylistProvider.data.length,
        wrongPlaylistIdSongs: wrongPlaylistId.data.length,
        correctPlaylistSongs: correctPlaylist.data.length
      };
    });

    expect(result.wrongProviderSongs).toBe(0);
    expect(result.wrongQuerySongs).toBe(0);
    expect(result.correctQuerySongs).toBe(qqVisualRuntimeData.songs.length);
    expect(result.wrongPlaylistProviderSongs).toBe(0);
    expect(result.wrongPlaylistIdSongs).toBe(0);
    expect(result.correctPlaylistSongs).toBe(qqVisualRuntimeData.songs.length);
  });

  test('guards song url and lyrics fixtures by provider and song ownership', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const musicApi = window.musicPlayer.music;
      const validSong = {
        id: 'qq:visual-runtime-1',
        providerId: 'qq',
        platformSongId: 'visual-runtime-1',
        title: 'Visual Runtime Song 1',
        artist: 'Visual Runtime Artist',
        album: 'Visual Runtime Album',
        durationMs: 210000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      };
      const unknownQqSong = {
        ...validSong,
        id: 'qq:unknown-runtime-song',
        platformSongId: 'unknown-runtime-song'
      };
      const wrongProviderUrl = await musicApi.getSongUrl('netease', validSong, 'standard');
      const wrongSongProviderUrl = await musicApi.getSongUrl('qq', { ...validSong, providerId: 'netease' }, 'standard');
      const unknownQqSongUrl = await musicApi.getSongUrl('qq', unknownQqSong, 'standard');
      const validUrl = await musicApi.getSongUrl('qq', validSong, 'standard');
      const wrongProviderLyrics = await musicApi.getLyrics('netease', validSong);
      const wrongSongProviderLyrics = await musicApi.getLyrics('qq', { ...validSong, providerId: 'netease' });
      const unknownQqSongLyrics = await musicApi.getLyrics('qq', unknownQqSong);
      const validLyrics = await musicApi.getLyrics('qq', validSong);

      return {
        wrongProviderUrlOk: wrongProviderUrl.data.ok,
        wrongSongProviderUrlOk: wrongSongProviderUrl.data.ok,
        unknownQqSongUrlOk: unknownQqSongUrl.data.ok,
        validUrlOk: validUrl.data.ok,
        validUrlProviderId: validUrl.data.providerId,
        wrongProviderLyricsOk: wrongProviderLyrics.data.ok,
        wrongSongProviderLyricsOk: wrongSongProviderLyrics.data.ok,
        unknownQqSongLyricsOk: unknownQqSongLyrics.data.ok,
        validLyricsOk: validLyrics.data.ok,
        validLyricsProviderId: validLyrics.data.providerId
      };
    });

    expect(result.wrongProviderUrlOk).toBe(false);
    expect(result.wrongSongProviderUrlOk).toBe(false);
    expect(result.unknownQqSongUrlOk).toBe(false);
    expect(result.validUrlOk).toBe(true);
    expect(result.validUrlProviderId).toBe('qq');
    expect(result.wrongProviderLyricsOk).toBe(false);
    expect(result.wrongSongProviderLyricsOk).toBe(false);
    expect(result.unknownQqSongLyricsOk).toBe(false);
    expect(result.validLyricsOk).toBe(true);
    expect(result.validLyricsProviderId).toBe('qq');
  });

  test('keeps lyrics entrance stable and cover depth strong', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await page.waitForTimeout(120);

    const entranceState = await page.evaluate(() => {
      const cover = document.querySelector('.lyrics-depth-cover') as HTMLElement | null;
      const text = document.querySelector('.lyrics-depth-text') as HTMLElement | null;
      const directMetaLines = Array.from(document.querySelectorAll('.lyrics-content > p')).map((node) => node.textContent?.trim() ?? '');
      const titleText = document.querySelector('.lyrics-content h2')?.textContent?.trim() ?? '';

      if (!cover || !text) {
        throw new Error('Unable to inspect lyrics entrance');
      }

      return {
        coverStyle: cover.getAttribute('style') ?? '',
        textStyle: text.getAttribute('style') ?? '',
        directMetaLines,
        titleText
      };
    });

    expect(entranceState.coverStyle).not.toContain('transform:');
    expect(entranceState.textStyle).not.toContain('transform:');
    expect(entranceState.directMetaLines).toEqual([]);
    expect(qqVisualRuntimeData.songs.map((song) => song.title)).toContain(entranceState.titleText);

    await expect(page.locator('.lyrics-overlay')).toHaveAttribute(
      'data-transition-phase',
      'interactive',
      { timeout: 3_400 }
    );
    await page.mouse.move(1430, 120);
    await expect.poll(async () => {
      const value = await page.evaluate(() => {
        const stage = document.querySelector('.playback-stage-3d') as HTMLElement | null;
        return stage?.style.getPropertyValue('--cover-shift-x') ?? '0px';
      });

      return Number.parseFloat(value);
    }).toBeGreaterThan(34);
  });

  test('keeps lyrics entrance geometry calm during the first animation frames', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await playFirstVisualRuntimeSong(page);

    await page.evaluate(() => {
      const captureWindow = window as typeof window & {
        __lyricsEntranceGeometryCapture?: Promise<LyricsEntranceGeometryMetrics>;
      };

      captureWindow.__lyricsEntranceGeometryCapture = new Promise((resolve) => {
        let observer: MutationObserver | null = null;
        const startCapture = () => {
          const stage = document.querySelector('.playback-stage-3d') as HTMLElement | null;
          const depthCover = document.querySelector('.lyrics-depth-cover') as HTMLElement | null;
          const depthText = document.querySelector('.lyrics-depth-text') as HTMLElement | null;
          const targets = [
            document.querySelector('.lyrics-art'),
            document.querySelector('.lyrics-content h2'),
            document.querySelector('.lyrics-lines')
          ];

          if (!stage || !depthCover || !depthText || targets.some((target) => !target)) {
            return false;
          }

          observer?.disconnect();
          void (async () => {
            const samples: Array<{
              at: number;
              rects: Array<{ left: number; top: number; width: number; height: number }>;
            }> = [];
            const start = performance.now();
            while (performance.now() - start < 420) {
              const at = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
              samples.push({
                at,
                rects: targets.map((target) => {
                  const rect = target!.getBoundingClientRect();
                  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                })
              });
            }

            const maxDeltas = [0, 1, 2].map((targetIndex) => Math.max(
              0,
              ...samples.slice(1).map((sample, sampleIndex) => {
                const previousSample = samples[sampleIndex];
                const previous = previousSample.rects[targetIndex];
                const current = sample.rects[targetIndex];
                const frameDuration = Math.max(1, sample.at - previousSample.at);
                const distance = Math.hypot(
                  current.left - previous.left,
                  current.top - previous.top,
                  current.width - previous.width,
                  current.height - previous.height
                );
                return distance * ((1000 / 60) / frameDuration);
              })
            ));

            resolve({
              maxDeltas,
              stageTransition: getComputedStyle(stage).transition,
              depthCoverTransition: getComputedStyle(depthCover).transition,
              depthTextTransition: getComputedStyle(depthText).transition
            });
          })();
          return true;
        };

        if (!startCapture()) {
          observer = new MutationObserver(startCapture);
          observer.observe(document.body, { childList: true, subtree: true });
        }
      });
    });
    await page.locator('.player-bar .cover-thumb-button').click();
    const metrics = await page.evaluate(async () => {
      const captureWindow = window as typeof window & {
        __lyricsEntranceGeometryCapture?: Promise<LyricsEntranceGeometryMetrics>;
      };
      const capture = captureWindow.__lyricsEntranceGeometryCapture;
      if (!capture) {
        throw new Error('Lyrics entrance geometry capture was not armed');
      }

      const result = await capture;
      delete captureWindow.__lyricsEntranceGeometryCapture;
      return result;
    });

    expect(Math.max(...metrics.maxDeltas)).toBeLessThanOrEqual(8);
    expect(metrics.stageTransition).not.toContain('transform');
    expect(metrics.depthCoverTransition).not.toContain('transform');
    expect(metrics.depthTextTransition).not.toContain('transform');
  });

  test('uses double click playback for the quiet blurred queue', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await enqueueVisualRuntimeSongs(page);
    await page.getByRole('button', { name: '展开播放队列' }).click();
    await expect(page.locator('.queue-panel')).toBeVisible();
    await expect(page.locator('.queue-panel .section-kicker')).toHaveCount(0);

    const rows = page.locator('.queue-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('svg')).toHaveCount(0);
    await expect(rows.nth(0).locator('.queue-row-plane')).toHaveCount(0);
    await expect(rows.nth(0).locator('canvas.queue-card-canvas')).toHaveCount(0);

    const queueStyle = await rows.nth(0).evaluate((row) => {
      const rowStyle = getComputedStyle(row);
      const beforeStyle = getComputedStyle(row, '::before');
      const content = row.querySelector('.queue-row-content') as HTMLElement | null;
      const contentStyle = content ? getComputedStyle(content) : null;
      const panel = row.closest('.queue-panel') as HTMLElement | null;
      const list = row.closest('.queue-list') as HTMLElement | null;
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const panelRect = panel?.getBoundingClientRect();
      const listRect = list?.getBoundingClientRect();

      return {
        rowBackdropFilter: rowStyle.backdropFilter,
        rowBoxShadow: rowStyle.boxShadow,
        rowBorderStyle: rowStyle.borderStyle,
        rowTransform: rowStyle.transform,
        beforeContent: beforeStyle.content,
        contentOpacity: contentStyle?.opacity ?? '',
        contentTransform: contentStyle?.transform ?? '',
        panelBackdropFilter: panelStyle?.backdropFilter ?? '',
        panelBoxShadow: panelStyle?.boxShadow ?? '',
        listRightEdgeGap: panelRect && listRect ? panelRect.right - listRect.right : Number.NaN
      };
    });

    expect(queueStyle.rowBackdropFilter === 'none' || queueStyle.rowBackdropFilter === '').toBe(true);
    expect(queueStyle.rowBoxShadow).toBe('none');
    expect(queueStyle.rowBorderStyle).toBe('none');
    expect(queueStyle.rowTransform === 'none' || queueStyle.rowTransform === '').toBe(true);
    expect(queueStyle.beforeContent).toBe('none');
    expect(queueStyle.contentOpacity).toBe('1');
    expect(queueStyle.contentTransform === 'none' || queueStyle.contentTransform === '').toBe(true);
    expect(queueStyle.panelBackdropFilter).toContain('blur');
    expect(readBackdropBlurPx(queueStyle.panelBackdropFilter)).toBe(24);
    expect(queueStyle.panelBoxShadow).not.toBe('none');
    expect(queueStyle.listRightEdgeGap).toBeLessThanOrEqual(12);

    const quietInitialTitle = await page.locator('.now-playing strong').getAttribute('title');
    const quietTargetTitle = await rows.nth(1).locator('.queue-song strong').innerText();

    await rows.nth(1).click();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', quietInitialTitle ?? '');

    await rows.nth(1).dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', quietTargetTitle);
    await expect(page.locator('.play-button')).toHaveAccessibleName(/暂停|播放/);
    await page.locator('.player-bar').getByRole('button', { name: '收起播放队列' }).click();
    await expect(page.locator('.queue-panel')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('.queue-panel')).toHaveCount(0, { timeout: 1000 });
  });

  test('keeps the main window close icon dark on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1220, height: 780 });

    const closeButton = page.locator('.window-close-button');
    await closeButton.hover();

    const hoverColors = await closeButton.evaluate((button) => {
      const style = getComputedStyle(button);
      const icon = button.querySelector('svg');
      const iconStyle = icon ? getComputedStyle(icon) : null;

      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        iconColor: iconStyle?.color ?? ''
      };
    });

    expect(hoverColors.color).not.toBe('rgb(255, 255, 255)');
    expect(hoverColors.iconColor).not.toBe('rgb(255, 255, 255)');
    expect(hoverColors.backgroundColor).not.toBe('rgb(217, 47, 60)');
  });

  test('keeps all lyrics depth layers responsive after the GSAP entrance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute(
      'data-transition-phase',
      'interactive',
      { timeout: 3_400 }
    );
    await expect.poll(async () => (await readLyricsDepthState(page)).coverInlineStyle, { timeout: 2_400 }).not.toContain('transform:');
    await expect.poll(async () => (await readLyricsDepthState(page)).textInlineStyle, { timeout: 2_400 }).not.toContain('transform:');

    const centered = await readLyricsDepthState(page);
    await page.mouse.move(1260, 170);
    await expect.poll(async () => (await readLyricsDepthState(page)).pointerX).toBeGreaterThan(0.8);
    await expect.poll(async () => (await readLyricsDepthState(page)).backgroundTransform).not.toBe(centered.backgroundTransform);
    await expect.poll(async () => (await readLyricsDepthState(page)).coverShiftX).not.toBe(centered.coverShiftX);
    await expect.poll(async () => (await readLyricsDepthState(page)).textShiftX).not.toBe(centered.textShiftX);

    const shifted = await readLyricsDepthState(page);
    expect(shifted.coverInlineStyle).not.toContain('transform:');
    expect(shifted.textInlineStyle).not.toContain('transform:');
  });

  test('keeps title and lyric lines on separate smoothed depth layers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await openLyricsFromCover(page);
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute(
      'data-transition-phase',
      'interactive',
      { timeout: 3_400 }
    );
    await expect.poll(async () => (await readLyricsDepthState(page)).coverInlineStyle, { timeout: 2_400 }).not.toContain('transform:');

    const centered = await readLyricsDepthState(page);
    await page.mouse.move(1260, 170);
    const immediate = await readLyricsDepthState(page);
    const targetPointerX = 1260 / 1440;

    expect(immediate.pointerX).toBeLessThan(targetPointerX - 0.02);
    await expect.poll(async () => (await readLyricsDepthState(page)).pointerX).toBeGreaterThan(0.8);

    const shifted = await readLyricsDepthState(page);
    expect(shifted.titleShiftX).not.toBe(centered.titleShiftX);
    expect(shifted.textShiftX).not.toBe(centered.textShiftX);
    expect(shifted.titleShiftX).not.toBe(shifted.textShiftX);

    expect(shifted.pointerX).toBeGreaterThan(0.8);
  });

  test('centers on window leave and enters a bounded idle depth orbit with immersive chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLyricsFromCover(page);
    const overlay = page.locator('.lyrics-overlay');
    const panel = page.locator('.lyrics-panel');
    await expect(overlay).toHaveAttribute('data-transition-phase', 'interactive', { timeout: 3_400 });

    await page.mouse.move(1240, 170);
    await expect.poll(async () => (await readLyricsDepthState(page)).pointerX).toBeGreaterThan(0.8);
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null })));
    await expect(panel).toHaveAttribute('data-depth-mode', 'centering');
    await expect.poll(async () => (await readLyricsDepthState(page)).pointerX, { timeout: 1_400 })
      .toBeCloseTo(0.5, 2);

    await page.mouse.move(720, 450);
    await expect(panel).toHaveAttribute('data-depth-mode', 'pointer');
    await expect(panel).toHaveAttribute('data-chrome-state', 'hidden', { timeout: 6_200 });
    await expect(panel).toHaveAttribute('data-depth-mode', 'idle', { timeout: 7_200 });
    await expect.poll(() => page.locator('.top-bar').evaluate((bar) => Number.parseFloat(getComputedStyle(bar).opacity)))
      .toBeLessThan(0.05);
    await expect.poll(() => readLyricsPlayerLayerState(page).then((state) => state.playerOpacity))
      .toBeLessThan(0.05);
    const idlePlayerLayer = await readLyricsPlayerLayerState(page);
    expect(idlePlayerLayer.playerBackdropFilter).toBe('none');
    expect(idlePlayerLayer.playerBackgroundImage).toContain('linear-gradient');
    expect(idlePlayerLayer.playerFilter).toBe('none');
    expect(idlePlayerLayer.playerIsInsideOverlay).toBe(true);
    expect(idlePlayerLayer.playerPointerEvents).toBe('none');
    expect(idlePlayerLayer.playerHitLyricsPlayerBar).toBe(false);
    expect(idlePlayerLayer.playerHitMainPlayer).toBe(false);

    const idleSamples = await page.locator('.playback-stage-3d').evaluate(async (stage) => {
      const samples: Array<{ x: number; y: number }> = [];
      for (let index = 0; index < 12; index += 1) {
        const style = getComputedStyle(stage);
        samples.push({
          x: Number.parseFloat(style.getPropertyValue('--pointer-x')),
          y: Number.parseFloat(style.getPropertyValue('--pointer-y'))
        });
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return samples;
    });
    const idleStepSizes = idleSamples.slice(1).map((sample, index) => Math.hypot(
      sample.x - idleSamples[index].x,
      sample.y - idleSamples[index].y
    ));
    expect(Math.max(...idleStepSizes)).toBeLessThan(0.012);
    expect(idleStepSizes.some((step) => step > 0.0001)).toBe(true);
    expect(Math.min(...idleSamples.map((sample) => sample.x))).toBeGreaterThanOrEqual(0.43);
    expect(Math.max(...idleSamples.map((sample) => sample.x))).toBeLessThanOrEqual(0.57);
    expect(Math.min(...idleSamples.map((sample) => sample.y))).toBeGreaterThanOrEqual(0.445);
    expect(Math.max(...idleSamples.map((sample) => sample.y))).toBeLessThanOrEqual(0.555);

    await page.mouse.move(1120, 220);
    await expect(panel).toHaveAttribute('data-depth-mode', 'pointer');
    await expect(panel).toHaveAttribute('data-chrome-state', 'visible');
    await expect.poll(() => page.locator('.top-bar').evaluate((bar) => Number.parseFloat(getComputedStyle(bar).opacity)))
      .toBeGreaterThan(0.95);
    await expect.poll(() => readLyricsPlayerLayerState(page).then((state) => state.playerHitLyricsPlayerBar))
      .toBe(true);
  });

  test('releases main top-bar hit testing as soon as the lyrics exit transition starts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLyricsFromCover(page);
    const lyricsPanel = page.locator('.lyrics-panel');
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute('data-transition-phase', 'interactive');
    await expect(lyricsPanel).toHaveAttribute('data-chrome-state', 'hidden', { timeout: 6_200 });
    const collapseButton = page.locator('.lyrics-collapse');
    const collapseBounds = await collapseButton.boundingBox();
    if (!collapseBounds) {
      throw new Error('Unable to measure the lyrics collapse button');
    }
    await page.mouse.move(
      collapseBounds.x + collapseBounds.width / 2,
      collapseBounds.y + collapseBounds.height / 2
    );
    await expect(lyricsPanel).toHaveAttribute('data-chrome-state', 'visible');

    const immersiveChromeStyles = await page.evaluate(() => {
      const selectors = ['.top-bar', '.lyrics-toolbar', '.lyrics-player-bar'];
      return selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          throw new Error(`Unable to inspect ${selector}`);
        }
        const style = getComputedStyle(element);
        return {
          selector,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backdropFilter: style.backdropFilter
        };
      });
    });

    immersiveChromeStyles.filter((style) => style.selector !== '.lyrics-player-bar').forEach((style) => {
      expect(readAlpha(style.backgroundColor)).toBe(0);
      expect(style.backdropFilter).toBe('none');
    });
    const lyricsPlayerChrome = immersiveChromeStyles.find((style) => style.selector === '.lyrics-player-bar');
    expect(lyricsPlayerChrome?.backgroundImage).toContain('linear-gradient');
    expect(lyricsPlayerChrome?.backdropFilter).toBe('none');
    const lyricsPlayerLayer = await readLyricsPlayerLayerState(page);
    expect(lyricsPlayerLayer.playerIsInsideOverlay).toBe(true);
    expect(lyricsPlayerLayer.playerPointerEvents).toBe('auto');
    expect(lyricsPlayerLayer.playerHitMainPlayer).toBe(false);

    const settingsTrigger = page.locator('.top-actions > .icon-button');
    const triggerBounds = await settingsTrigger.boundingBox();
    if (!triggerBounds) {
      throw new Error('Unable to measure the settings trigger');
    }

    await collapseButton.click();
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute('data-transition-phase', 'exiting');
    const exitingPlayerLayer = await readLyricsPlayerLayerState(page);
    expect(exitingPlayerLayer.playerAnimationName).toContain('lyricsImmersivePlayerOut');
    expect(exitingPlayerLayer.playerPointerEvents).toBe('none');

    const hitState = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return {
        hitLyricsOverlay: Boolean(hit?.closest('.lyrics-overlay')),
        hitTopBar: Boolean(hit?.closest('.top-bar'))
      };
    }, {
      x: triggerBounds.x + triggerBounds.width / 2,
      y: triggerBounds.y + triggerBounds.height / 2
    });

    expect(hitState.hitLyricsOverlay).toBe(false);
    expect(hitState.hitTopBar).toBe(true);
  });

  test('keeps three 1000-song playlists responsive across repeated warm switches', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop performance sample is sufficient.');
    await page.setViewportSize({ width: 1440, height: 900 });
    const playlists = qqVisualRuntimeData.playlists.slice(0, 3).map((playlist, playlistIndex) => ({
      id: playlist.id,
      title: playlist.title,
      songs: createScrollingVisualRuntimeSongs(1000, `Switch ${playlistIndex + 1} Song`).map((song, songIndex) => ({
        ...song,
        id: `${playlist.id}:switch-song-${songIndex + 1}`,
        platformSongId: `${playlist.id}:switch-song-${songIndex + 1}`,
        sourceContext: {
          type: 'playlist' as const,
          providerId: 'qq' as const,
          playlistId: playlist.id,
          playlistTitle: playlist.title
        }
      }))
    }));

    await page.evaluate((entries) => {
      const tracksByPlaylistId = new Map(entries.map((entry) => [entry.id, entry.songs]));
      entries.forEach((entry) => {
        window.sessionStorage.removeItem(`visual-runtime:playlist-track-requests:qq:${entry.id}`);
      });
      window.musicPlayer.music.getPlaylistTracks = async (providerId, playlistId) => {
        const requestCountKey = `visual-runtime:playlist-track-requests:${providerId}:${playlistId}`;
        const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
        window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));
        return {
          ok: true,
          data: providerId === 'qq' ? tracksByPlaylistId.get(playlistId) ?? [] : []
        };
      };
    }, playlists);

    const transitionStage = page.getByTestId('main-content-transition');
    for (const playlist of playlists) {
      await page.locator('.nav-playlist-item', { hasText: playlist.title }).click();
      await expect(transitionStage).toHaveAttribute('data-transition-key', `playlist:qq:${playlist.id}`);
      await expect(transitionStage.locator('.main-content-transition-layer-active h1')).toHaveText(playlist.title);
      await expect.poll(() => page.locator('.main-content-transition-layer-active .playlist-detail-song-row').count()).toBeLessThan(40);
      await waitForMainContentTransition(page);
    }

    const metrics = await page.evaluate(async (entries) => {
      const stage = document.querySelector<HTMLElement>('[data-testid="main-content-transition"]');
      const player = document.querySelector<HTMLElement>('.player-bar');
      if (!stage || !player) {
        throw new Error('Playlist transition performance surfaces are unavailable');
      }

      const buttons = entries.map((entry) => {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-playlist-item'))
          .find((candidate) => candidate.textContent?.includes(entry.title));
        if (!button) {
          throw new Error(`Unable to find playlist button: ${entry.title}`);
        }
        return { button, entry };
      });
      const frameDurations: number[] = [];
      const routeLatencies: number[] = [];
      const activeOpacities = new Set<string>();
      const activeTransforms = new Set<string>();
      const outgoingOpacities = new Set<string>();
      const outgoingTransforms = new Set<string>();
      let previousFrameTime: number | null = null;
      let maxActiveRows = 0;
      let maxLayerCount = 0;
      let maxOutgoingRows = 0;
      let mixedPlaylistFrameCount = 0;
      let playerFilterMismatchCount = 0;
      let longTaskDuration = 0;
      let running = true;
      const longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = longTaskSupported
        ? new PerformanceObserver((list) => {
            longTaskDuration += list.getEntries().reduce((sum, entry) => sum + entry.duration, 0);
          })
        : null;
      observer?.observe({ type: 'longtask', buffered: false });

      const sampleFrame = (timestamp: number) => {
        if (previousFrameTime !== null) {
          frameDurations.push(timestamp - previousFrameTime);
        }
        previousFrameTime = timestamp;

        const activeLayer = stage.querySelector<HTMLElement>(':scope > .main-content-transition-layer-active');
        const outgoingLayer = stage.querySelector<HTMLElement>(':scope > .main-content-transition-layer-outgoing');
        const activeContent = activeLayer?.querySelector<HTMLElement>(':scope > .main-content-transition-content');
        const outgoingContent = outgoingLayer?.querySelector<HTMLElement>(':scope > .main-content-transition-content');
        const activeRows = Array.from(activeLayer?.querySelectorAll<HTMLElement>('.playlist-detail-song-row') ?? []);
        const outgoingRows = outgoingLayer?.querySelectorAll('.playlist-detail-song-row').length ?? 0;
        maxActiveRows = Math.max(maxActiveRows, activeRows.length);
        maxOutgoingRows = Math.max(maxOutgoingRows, outgoingRows);
        maxLayerCount = Math.max(
          maxLayerCount,
          stage.querySelectorAll(':scope > .main-content-transition-layer').length
        );

        const activePlaylistId = stage.dataset.transitionKey?.replace(/^playlist:qq:/, '') ?? '';
        if (activeRows.some((row) => !(row.dataset.songId ?? '').startsWith(`${activePlaylistId}:switch-song-`))) {
          mixedPlaylistFrameCount += 1;
        }

        const playerFilter = getComputedStyle(player).backdropFilter;
        if (!playerFilter.includes('blur(24px)') || !playerFilter.includes('saturate(1.12)')) {
          playerFilterMismatchCount += 1;
        }
        if (activeContent) {
          const style = getComputedStyle(activeContent);
          activeOpacities.add(style.opacity);
          activeTransforms.add(style.transform);
        }
        if (outgoingContent) {
          const style = getComputedStyle(outgoingContent);
          outgoingOpacities.add(style.opacity);
          outgoingTransforms.add(style.transform);
        }

        if (running) {
          requestAnimationFrame(sampleFrame);
        }
      };
      requestAnimationFrame(sampleFrame);

      const waitForRoute = async (playlistId: string) => {
        const expectedKey = `playlist:qq:${playlistId}`;
        const startedAt = performance.now();
        while (stage.dataset.transitionKey !== expectedKey) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        routeLatencies.push(performance.now() - startedAt);
      };
      const waitForDuration = async (durationMs: number) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < durationMs) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      };

      for (let index = 0; index < 12; index += 1) {
        const target = buttons[index % buttons.length];
        target.button.click();
        await waitForRoute(target.entry.id);
        await waitForDuration(180);
      }
      await waitForDuration(420);
      running = false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (observer) {
        longTaskDuration += observer.takeRecords().reduce((sum, entry) => sum + entry.duration, 0);
      }
      observer?.disconnect();

      const sortedFrames = [...frameDurations].sort((left, right) => left - right);
      const sortedLatencies = [...routeLatencies].sort((left, right) => left - right);
      const percentile = (values: number[], fraction: number) => values[
        Math.min(values.length - 1, Math.floor(values.length * fraction))
      ] ?? 0;
      const requestCounts = Object.fromEntries(entries.map((entry) => [
        entry.id,
        Number.parseInt(
          window.sessionStorage.getItem(`visual-runtime:playlist-track-requests:qq:${entry.id}`) ?? '0',
          10
        )
      ]));

      return {
        activeOpacitySampleCount: activeOpacities.size,
        activeTransformSampleCount: activeTransforms.size,
        longTaskDuration,
        longTaskSupported,
        maxActiveRows,
        maxFrameDuration: Math.max(...frameDurations, 0),
        maxLayerCount,
        maxOutgoingRows,
        maxRouteLatency: Math.max(...routeLatencies, 0),
        mixedPlaylistFrameCount,
        outgoingOpacitySampleCount: outgoingOpacities.size,
        outgoingTransformSampleCount: outgoingTransforms.size,
        p95FrameDuration: percentile(sortedFrames, 0.95),
        p95RouteLatency: percentile(sortedLatencies, 0.95),
        playerFilterMismatchCount,
        requestCounts
      };
    }, playlists.map(({ id, title }) => ({ id, title })));

    expect(metrics.requestCounts).toEqual(Object.fromEntries(playlists.map((playlist) => [playlist.id, 1])));
    expect(metrics.maxActiveRows).toBeLessThan(40);
    expect(metrics.maxOutgoingRows).toBeLessThan(40);
    expect(metrics.maxLayerCount).toBeLessThanOrEqual(2);
    expect(metrics.mixedPlaylistFrameCount).toBe(0);
    expect(metrics.playerFilterMismatchCount).toBe(0);
    expect(metrics.activeOpacitySampleCount).toBeGreaterThan(2);
    expect(metrics.activeTransformSampleCount).toBeGreaterThan(2);
    expect(metrics.outgoingOpacitySampleCount).toBeGreaterThan(2);
    expect(metrics.outgoingTransformSampleCount).toBeGreaterThan(2);
    expect(metrics.p95RouteLatency).toBeLessThanOrEqual(50);
    expect(metrics.maxRouteLatency).toBeLessThanOrEqual(100);
    expect(metrics.p95FrameDuration).toBeLessThanOrEqual(24);
    expect(metrics.maxFrameDuration).toBeLessThanOrEqual(50);
    if (metrics.longTaskSupported) {
      expect(metrics.longTaskDuration).toBe(0);
    }
  });

  test('fades through the surface without overlapping pages on a warm playlist switch', async ({ page }, testInfo) => {
    const transitionStage = page.getByTestId('main-content-transition');
    const firstPlaylist = page.locator('.nav-playlist-item', { hasText: qqVisualRuntimeData.playlists[0].title });
    const secondPlaylist = page.locator('.nav-playlist-item', { hasText: qqVisualRuntimeData.playlists[1].title });
    const activeLayer = transitionStage.locator(':scope > .main-content-transition-layer-active');

    await expect(firstPlaylist).toBeVisible();
    await expect(secondPlaylist).toBeVisible();
    await firstPlaylist.click();
    await expect(transitionStage).toHaveAttribute(
      'data-transition-key',
      `playlist:qq:${qqVisualRuntimeData.playlists[0].id}`
    );
    await expect(activeLayer.locator('h1')).toHaveText(qqVisualRuntimeData.playlists[0].title);
    await expect(activeLayer.locator('.playlist-detail-song-row')).toHaveCount(qqVisualRuntimeData.playlists[0].songIds.length);
    await waitForMainContentTransition(page);

    await secondPlaylist.click();
    await expect(transitionStage).toHaveAttribute(
      'data-transition-key',
      `playlist:qq:${qqVisualRuntimeData.playlists[1].id}`
    );
    await expect(transitionStage).toHaveAttribute(
      'data-motion-key',
      `playlist:qq:${qqVisualRuntimeData.playlists[1].id}`
    );
    await expect(activeLayer.locator('h1')).toHaveText(qqVisualRuntimeData.playlists[1].title);
    await expect(activeLayer.locator('.playlist-detail-song-row')).toHaveCount(qqVisualRuntimeData.playlists[1].songIds.length);
    await waitForMainContentTransition(page);

    await activeLayer.evaluate((layer) => {
      (layer as HTMLElement).dataset.playlistSwitchMarker = 'warm-outgoing';
    });

    const transitionTrace = await firstPlaylist.evaluate(async (button) => {
      const samples: Array<{
        activeOpacity: number;
        activeTransform: string;
        outgoingOpacity: number;
        outgoingTransform: string;
      }> = [];
      let structure: {
        activeSongCount: number;
        activeTitle: string | null;
        layerCount: number;
        outgoingAriaHidden: string | null;
        outgoingCount: number;
        outgoingInert: boolean;
        outgoingMarker: string | null;
        outgoingSongCount: number;
        outgoingTitle: string | null;
        outgoingTransitionKey: string | null;
        stageMotionKey: string | null;
        stageTransitionKey: string | null;
      } | null = null;
      const captureFrame = () => {
        const stage = document.querySelector<HTMLElement>('[data-testid="main-content-transition"]');
        const active = stage?.querySelector<HTMLElement>(':scope > .main-content-transition-layer-active');
        const outgoing = stage?.querySelector<HTMLElement>(':scope > .main-content-transition-layer-outgoing');

        if (!active || !outgoing) {
          return;
        }

        const activeContent = active.querySelector<HTMLElement>(':scope > .main-content-transition-content');
        const outgoingContent = outgoing.querySelector<HTMLElement>(':scope > .main-content-transition-content');
        if (!activeContent || !outgoingContent) {
          return;
        }

        structure ??= {
          activeSongCount: active.querySelectorAll('.playlist-detail-song-row').length,
          activeTitle: active.querySelector('h1')?.textContent?.trim() ?? null,
          layerCount: stage?.querySelectorAll(':scope > .main-content-transition-layer').length ?? 0,
          outgoingAriaHidden: outgoing.getAttribute('aria-hidden'),
          outgoingCount: stage?.querySelectorAll(':scope > .main-content-transition-layer-outgoing').length ?? 0,
          outgoingInert: outgoing.hasAttribute('inert'),
          outgoingMarker: outgoing.dataset.playlistSwitchMarker ?? null,
          outgoingSongCount: outgoing.querySelectorAll('.playlist-detail-song-row').length,
          outgoingTitle: outgoing.querySelector('h1')?.textContent?.trim() ?? null,
          outgoingTransitionKey: outgoing.dataset.transitionKey ?? null,
          stageMotionKey: stage?.dataset.motionKey ?? null,
          stageTransitionKey: stage?.dataset.transitionKey ?? null
        };
        const activeStyle = getComputedStyle(activeContent);
        const outgoingStyle = getComputedStyle(outgoingContent);
        samples.push({
          activeOpacity: Number.parseFloat(activeStyle.opacity),
          activeTransform: activeStyle.transform,
          outgoingOpacity: Number.parseFloat(outgoingStyle.opacity),
          outgoingTransform: outgoingStyle.transform
        });
      };

      (button as HTMLButtonElement).click();
      captureFrame();
      const startedAt = performance.now();
      while (performance.now() - startedAt < 340) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        captureFrame();
      }

      return { samples, structure };
    });
    expect(transitionTrace.structure).toEqual({
      activeSongCount: qqVisualRuntimeData.playlists[0].songIds.length,
      activeTitle: qqVisualRuntimeData.playlists[0].title,
      layerCount: 2,
      outgoingAriaHidden: 'true',
      outgoingCount: 1,
      outgoingInert: true,
      outgoingMarker: 'warm-outgoing',
      outgoingSongCount: qqVisualRuntimeData.playlists[1].songIds.length,
      outgoingTitle: qqVisualRuntimeData.playlists[1].title,
      outgoingTransitionKey: `playlist:qq:${qqVisualRuntimeData.playlists[1].id}`,
      stageMotionKey: `playlist:qq:${qqVisualRuntimeData.playlists[0].id}`,
      stageTransitionKey: `playlist:qq:${qqVisualRuntimeData.playlists[0].id}`
    });
    const motionSamples = transitionTrace.samples;
    expect(motionSamples.length).toBeGreaterThan(5);
    expect(new Set(motionSamples.map((sample) => sample.activeTransform)).size).toBeGreaterThan(2);
    expect(new Set(motionSamples.map((sample) => sample.activeOpacity)).size).toBeGreaterThan(2);
    expect(motionSamples.some((sample) => (
      sample.outgoingOpacity > 0.05
      && sample.activeOpacity <= 0.05
    ))).toBe(true);
    expect(motionSamples.some((sample) => (
      sample.activeOpacity > 0.05
      && sample.outgoingOpacity <= 0.05
    ))).toBe(true);
    expect(motionSamples.some((sample) => (
      sample.activeOpacity > 0.05
      && sample.outgoingOpacity > 0.05
    ))).toBe(false);
    const firstIncomingVisibleIndex = motionSamples.findIndex(
      (sample) => sample.activeOpacity > 0.05
    );
    const lastOutgoingVisibleIndex = motionSamples.reduce((lastIndex, sample, index) => (
      sample.outgoingOpacity > 0.05 ? index : lastIndex
    ), -1);
    expect(lastOutgoingVisibleIndex).toBeGreaterThanOrEqual(0);
    expect(firstIncomingVisibleIndex).toBeGreaterThanOrEqual(0);
    expect(lastOutgoingVisibleIndex).toBeLessThan(firstIncomingVisibleIndex);

    await page.screenshot({
      path: `artifacts/ui-checks/warm-playlist-fade-through-${testInfo.project.name}.png`
    });

    await waitForMainContentTransition(page);
    const settledLayerState = await activeLayer.locator(':scope > .main-content-transition-content').evaluate((content) => {
      const style = getComputedStyle(content);
      return {
        filter: style.filter,
        layerCount: content.parentElement?.parentElement?.querySelectorAll(':scope > .main-content-transition-layer').length ?? 0,
        opacity: style.opacity,
        transform: style.transform,
        willChange: style.willChange
      };
    });
    expect(settledLayerState).toEqual({
      filter: 'none',
      layerCount: 1,
      opacity: '1',
      transform: 'none',
      willChange: 'auto'
    });
    await expect(activeLayer.locator('h1')).toHaveText(qqVisualRuntimeData.playlists[0].title);
    const requestCounts = await page.evaluate((playlists) => Object.fromEntries(playlists.map((playlist) => [
      playlist.id,
      Number.parseInt(
        window.sessionStorage.getItem(`visual-runtime:playlist-track-requests:qq:${playlist.id}`) ?? '0',
        10
      )
    ])), qqVisualRuntimeData.playlists.slice(0, 2));
    expect(requestCounts).toEqual({
      [qqVisualRuntimeData.playlists[0].id]: 1,
      [qqVisualRuntimeData.playlists[1].id]: 1
    });
  });

  test('controls main transitions and applies the complete reduced-effects policy', async ({ page }, testInfo) => {
    const transitionStage = page.getByTestId('main-content-transition');
    const activeLayer = transitionStage.locator(':scope > .main-content-transition-layer-active');
    const outgoingLayer = transitionStage.locator(':scope > .main-content-transition-layer-outgoing');
    const settingsTrigger = page.getByRole('button', { name: '设置', exact: true });

    await settingsTrigger.click();
    const settings = page.getByRole('dialog', { name: '设置面板' });
    const motionGroup = settings.getByRole('radiogroup', { name: '页面切换' });
    await expect(motionGroup.getByRole('radio', { name: '柔和' })).toHaveAttribute('aria-checked', 'true');
    await motionGroup.getByRole('radio', { name: '滑移' }).click();
    await expect(transitionStage).toHaveAttribute('data-transition-style', 'directional');
    await motionGroup.getByRole('radio', { name: '分层' }).click();
    await expect(transitionStage).toHaveAttribute('data-transition-style', 'layered');

    const normalGlass = await readReducedEffectsSurfaces(page);
    expect(normalGlass.settingsBackdropFilter).toContain('blur');
    expect(normalGlass.playerBackdropFilter).toContain('blur');

    await settingsTrigger.click();
    await expect(settings).toHaveCount(0, { timeout: 1_000 });

    await page.getByRole('combobox', { name: '搜索音乐' }).fill('visual runtime');
    await page.getByRole('combobox', { name: '搜索音乐' }).press('Enter');
    await expect(transitionStage).toHaveAttribute('data-transition-key', 'search:qq:visual runtime');
    await expect(transitionStage.locator(':scope > .main-content-transition-layer')).toHaveCount(2);
    await expect(outgoingLayer).toHaveCount(1);
    await expect(outgoingLayer).toHaveAttribute('inert', '');
    await expect(outgoingLayer).toHaveAttribute('aria-hidden', 'true');
    await waitForAnimationFrames(page, 2);

    const transitionStateInFlight = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-testid="main-content-transition"]');
      const active = stage?.querySelector<HTMLElement>(':scope > .main-content-transition-layer-active');
      const outgoing = stage?.querySelector<HTMLElement>(':scope > .main-content-transition-layer-outgoing');
      const activeContent = active?.querySelector<HTMLElement>(':scope > .main-content-transition-content');
      const outgoingContent = outgoing?.querySelector<HTMLElement>(':scope > .main-content-transition-content');
      if (!stage || !active || !outgoing || !activeContent || !outgoingContent) {
        throw new Error('Main content transition layers are unavailable');
      }

      const activeStyle = getComputedStyle(activeContent);
      const outgoingStyle = getComputedStyle(outgoingContent);
      return {
        activeBackground: getComputedStyle(active).backgroundColor,
        activeFilter: activeStyle.filter,
        activeOpacity: Number.parseFloat(activeStyle.opacity),
        activeTransform: activeStyle.transform,
        activeWillChange: activeStyle.willChange,
        layerCount: stage.querySelectorAll(':scope > .main-content-transition-layer').length,
        outgoingFilter: outgoingStyle.filter,
        outgoingOpacity: Number.parseFloat(outgoingStyle.opacity),
        outgoingTransform: outgoingStyle.transform,
        outgoingWillChange: outgoingStyle.willChange
      };
    });
    expect(readAlpha(transitionStateInFlight.activeBackground)).toBe(0);
    expect(transitionStateInFlight.activeOpacity).toBeGreaterThanOrEqual(0);
    expect(transitionStateInFlight.activeOpacity).toBeLessThan(1);
    expect(readBackdropBlurPx(transitionStateInFlight.activeFilter)).toBeGreaterThan(0);
    expect(transitionStateInFlight.activeTransform).not.toBe('none');
    expect(transitionStateInFlight.activeWillChange).toContain('transform');
    expect(transitionStateInFlight.activeWillChange).toContain('opacity');
    expect(transitionStateInFlight.activeWillChange).toContain('filter');
    expect(transitionStateInFlight.layerCount).toBe(2);
    expect(transitionStateInFlight.outgoingOpacity).toBeGreaterThanOrEqual(0);
    expect(transitionStateInFlight.outgoingOpacity).toBeLessThan(1);
    expect(Math.min(
      transitionStateInFlight.activeOpacity,
      transitionStateInFlight.outgoingOpacity
    )).toBeLessThanOrEqual(0.05);
    expect(readBackdropBlurPx(transitionStateInFlight.outgoingFilter)).toBeGreaterThan(0);
    expect(transitionStateInFlight.outgoingTransform).not.toBe('none');
    expect(transitionStateInFlight.outgoingWillChange).toContain('transform');
    expect(transitionStateInFlight.outgoingWillChange).toContain('opacity');
    expect(transitionStateInFlight.outgoingWillChange).toContain('filter');
    await page.screenshot({
      path: `artifacts/ui-checks/main-transition-clean-${testInfo.project.name}.png`
    });

    await waitForMainContentTransition(page);
    const settledTransitionState = await activeLayer.locator(':scope > .main-content-transition-content').evaluate((content) => ({
      filter: getComputedStyle(content).filter,
      opacity: getComputedStyle(content).opacity,
      transform: getComputedStyle(content).transform,
      willChange: getComputedStyle(content).willChange
    }));
    expect(settledTransitionState).toEqual({
      filter: 'none',
      opacity: '1',
      transform: 'none',
      willChange: 'auto'
    });

    await settingsTrigger.click();
    const reduceEffectsSwitch = settings.getByRole('switch', { name: '减少动态与特效' });
    await settings.getByText('减少动态与特效', { exact: true }).click();
    await expect(reduceEffectsSwitch).toBeChecked();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceEffects)).toBe('true');

    const reducedGlass = await readReducedEffectsSurfaces(page);
    expect(readBackdropBlurPx(reducedGlass.settingsBackdropFilter)).toBe(24);
    expect(reducedGlass.settingsAnimationName).toBe('reducedEffectsFadeIn');
    expect(reducedGlass.settingsBackgroundOpaque).toBe(false);
    expect(readBackdropBlurPx(reducedGlass.playerBackdropFilter)).toBe(24);
    expect(reducedGlass.playerBackgroundOpaque).toBe(false);
    await expect(settings).toHaveCSS('opacity', '1');

    await page.screenshot({
      path: `artifacts/ui-checks/main-motion-settings-reduced-${testInfo.project.name}.png`,
      fullPage: true
    });

    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queue = page.locator('.queue-panel');
    await expect(queue).toBeVisible();
    const queueStyle = await queue.evaluate((panel) => {
      const style = getComputedStyle(panel);
      return {
        animationName: style.animationName,
        backdropFilter: style.backdropFilter,
        backgroundColor: style.backgroundColor,
        filter: style.filter,
        transform: style.transform
      };
    });
    expect(queueStyle.animationName).toBe('reducedEffectsFadeIn');
    expect(readBackdropBlurPx(queueStyle.backdropFilter)).toBe(24);
    expect(readAlpha(queueStyle.backgroundColor)).toBe(0);
    expect(queueStyle.filter).toBe('none');
    expect(queueStyle.transform).toBe('none');
    await page.locator('.player-bar').getByRole('button', { name: '收起播放队列' }).click();
    await expect(queue).toHaveCount(0);

    const firstSong = page.locator('.search-result-row').filter({ hasText: 'Visual Runtime Song 1' }).first();
    await firstSong.dblclick({ position: { x: 92, y: 24 } });
    await page.locator('.player-bar .cover-thumb-button').click();
    await expect(page.locator('.lyrics-panel')).toBeVisible();
    await expect(page.locator('.lyrics-overlay')).toHaveAttribute('data-reduce-effects', 'true');

    const reducedLyrics = await page.evaluate(() => {
      const stage = document.querySelector('.playback-stage-3d') as HTMLElement | null;
      const cover = document.querySelector('.lyrics-depth-cover') as HTMLElement | null;
      const transitionLayer = document.querySelector('.lyrics-transition-ripple') as HTMLElement | null;
      const playerBar = document.querySelector('.lyrics-player-bar') as HTMLElement | null;
      if (!stage || !cover || !transitionLayer || !playerBar) {
        throw new Error('Unable to inspect reduced lyrics depth');
      }

      return {
        perspective: getComputedStyle(stage).perspective,
        stageTransform: getComputedStyle(stage).transform,
        coverTransform: getComputedStyle(cover).transform,
        transitionDisplay: getComputedStyle(transitionLayer).display,
        playerBackdropFilter: getComputedStyle(playerBar).backdropFilter,
        playerBackgroundImage: getComputedStyle(playerBar).backgroundImage,
        playerFilter: getComputedStyle(playerBar).filter
      };
    });
    expect(reducedLyrics.perspective).toBe('none');
    expect(reducedLyrics.stageTransform).toBe('none');
    expect(reducedLyrics.coverTransform).toBe('none');
    expect(reducedLyrics.transitionDisplay).toBe('none');
    expect(reducedLyrics.playerBackdropFilter).toBe('none');
    expect(reducedLyrics.playerBackgroundImage).toContain('linear-gradient');
    expect(reducedLyrics.playerFilter).toBe('none');
    await expect(page.locator('.lyrics-transition-refraction')).toHaveCount(0);

    await page.mouse.move(720, 170);
    await waitForAnimationFrames(page, 4);
    await expect(page.locator('.lyrics-overlay')).toHaveCSS('opacity', '1');
    const pointerAfterMove = await page.locator('.playback-stage-3d').evaluate((stage) => ({
      x: getComputedStyle(stage).getPropertyValue('--pointer-x').trim(),
      y: getComputedStyle(stage).getPropertyValue('--pointer-y').trim()
    }));
    expect(pointerAfterMove).toEqual({ x: '0.5', y: '0.5' });

    const lyricsPanel = page.locator('.lyrics-panel');
    await expect(lyricsPanel).toHaveAttribute('data-chrome-state', 'hidden', { timeout: 6_200 });
    await expect(lyricsPanel).toHaveCSS('cursor', 'default');
    await expect.poll(() => page.locator('.top-bar').evaluate((bar) => Number.parseFloat(getComputedStyle(bar).opacity)))
      .toBeLessThan(0.05);
    await expect.poll(() => readLyricsPlayerLayerState(page).then((state) => state.playerOpacity))
      .toBeLessThan(0.05);
    const reducedIdlePlayerLayer = await readLyricsPlayerLayerState(page);
    expect(reducedIdlePlayerLayer.playerBackdropFilter).toBe('none');
    expect(reducedIdlePlayerLayer.playerBackgroundImage).toContain('linear-gradient');
    expect(reducedIdlePlayerLayer.playerFilter).toBe('none');
    expect(reducedIdlePlayerLayer.playerIsInsideOverlay).toBe(true);
    expect(reducedIdlePlayerLayer.playerAnimationName).toBe('none');
    expect(reducedIdlePlayerLayer.playerTransform).toBe('none');
    expect(reducedIdlePlayerLayer.playerPointerEvents).toBe('none');
    expect(reducedIdlePlayerLayer.playerHitLyricsPlayerBar).toBe(false);
    expect(reducedIdlePlayerLayer.playerHitMainPlayer).toBe(false);

    await page.mouse.move(720, 220);
    await expect(lyricsPanel).toHaveAttribute('data-chrome-state', 'visible');
    await expect.poll(() => page.locator('.top-bar').evaluate((bar) => Number.parseFloat(getComputedStyle(bar).opacity)))
      .toBeGreaterThan(0.95);
    await expect.poll(() => readLyricsPlayerLayerState(page).then((state) => state.playerOpacity)).toBeGreaterThan(0.95);

    await page.screenshot({
      path: `artifacts/ui-checks/lyrics-reduced-effects-${testInfo.project.name}.png`,
      fullPage: true
    });
  });

  test('honors the system reduced-motion preference without changing the manual switch', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.localStorage.removeItem('musicplayer.ui-state'));
    await page.reload();
    await expect(page.locator('.qq-discovery-home')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceEffects)).toBe('true');

    await page.getByRole('button', { name: '设置', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '设置面板' });
    await expect(settings.getByRole('switch', { name: '减少动态与特效' })).not.toBeChecked();

    const surfaces = await readReducedEffectsSurfaces(page);
    expect(readBackdropBlurPx(surfaces.settingsBackdropFilter)).toBe(24);
    expect(readBackdropBlurPx(surfaces.playerBackdropFilter)).toBe(24);
    expect(surfaces.settingsBackgroundOpaque).toBe(false);
    expect(surfaces.playerBackgroundOpaque).toBe(false);
  });
});

async function readReducedEffectsSurfaces(page: Page) {
  return page.evaluate(() => {
    const settingsElement = document.querySelector('.settings-popover') as HTMLElement | null;
    const player = document.querySelector('.player-bar') as HTMLElement | null;
    if (!settingsElement || !player) {
      throw new Error('Unable to inspect settings and player surfaces');
    }

    const settingsStyle = getComputedStyle(settingsElement);
    const playerStyle = getComputedStyle(player);
    const isOpaque = (color: string) => {
      if (color === 'transparent') {
        return false;
      }
      const alphaMatch = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      return !alphaMatch || Number.parseFloat(alphaMatch[1]) >= 1;
    };

    return {
      settingsAnimationName: settingsStyle.animationName,
      settingsBackdropFilter: settingsStyle.backdropFilter,
      settingsBackgroundOpaque: isOpaque(settingsStyle.backgroundColor),
      playerBackdropFilter: playerStyle.backdropFilter,
      playerBackgroundOpaque: isOpaque(playerStyle.backgroundColor)
    };
  });
}

function createSilentWavDataUrl(durationSeconds = 5) {
  const sampleRate = 8_000;
  const dataSize = sampleRate * durationSeconds;
  const wav = Buffer.alloc(44 + dataSize, 128);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

async function openLyricsFromCover(page: Page) {
  await playFirstVisualRuntimeSong(page);
  await page.locator('.player-bar .cover-thumb-button').click();
  await expect(page.locator('.lyrics-panel')).toBeVisible();
}

async function playFirstVisualRuntimeSong(page: Page) {
  await searchVisualRuntimeSongs(page);
  const firstSong = page.locator('.search-result-row').filter({ hasText: 'Visual Runtime Song 1' }).first();
  await firstSong.dblclick({ position: { x: 92, y: 24 } });
  await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Visual Runtime Song 1');
}

async function enqueueVisualRuntimeSongs(page: Page) {
  await searchVisualRuntimeSongs(page);
  const rows = page.locator('.search-result-row');
  await rows.nth(0).click({ position: { x: 72, y: 20 } });
  await rows.nth(1).click({ position: { x: 72, y: 20 } });
}

async function searchVisualRuntimeSongs(page: Page) {
  await page.getByRole('combobox', { name: '搜索音乐' }).fill('visual runtime');
  await page.getByRole('combobox', { name: '搜索音乐' }).press('Enter');
  await expect(page.locator('.search-result-row').first()).toBeVisible();
}

function createScrollingVisualRuntimeSongs(count: number, titlePrefix = 'Sticky Runtime Song') {
  return Array.from({ length: count }, (_, index) => {
    const baseSong = qqVisualRuntimeData.songs[index % qqVisualRuntimeData.songs.length];

    return {
      ...baseSong,
      id: `${baseSong.id}:sticky-${index}`,
      platformSongId: `${baseSong.platformSongId}-sticky-${index}`,
      title: `${titlePrefix} ${index + 1}`
    };
  });
}

function createLargeDiscoveredPlaylists(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const basePlaylist = qqVisualRuntimeData.playlists[index % qqVisualRuntimeData.playlists.length];

    return {
      ...basePlaylist,
      id: `qq:discovery-performance-${index + 1}`,
      platformPlaylistId: `visual-discovery-performance-${index + 1}`,
      title: `Performance Discovery Playlist ${index + 1}`,
      creatorName: `Performance Creator ${index + 1}`,
      playCount: 10_000 + index * 1_000,
      trackCount: basePlaylist.songIds.length
    };
  });
}

async function setPlaylistDetailScrollTop(page: Page, scrollTop: number) {
  await page.locator('.playlist-detail-song-list').evaluate((songList, nextScrollTop) => {
    songList.scrollTop = nextScrollTop;
    songList.dispatchEvent(new Event('scroll'));
  }, scrollTop);
}

async function waitForAnimationFrames(page: Page, frameCount: number) {
  await page.evaluate((count) => new Promise<void>((resolve) => {
    const waitForNextFrame = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => waitForNextFrame(remaining - 1));
    };

    waitForNextFrame(count);
  }), frameCount);
}

async function readPlaylistDetailHeaderMotionState(page: Page) {
  return page.locator('.playlist-detail-view').evaluate((detail) => ({
    blur: detail.style.getPropertyValue('--playlist-detail-header-content-blur'),
    compact: detail.dataset.headerCompact ?? '',
    progress: detail.style.getPropertyValue('--playlist-detail-scroll-progress')
  }));
}

async function readPlaylistDescriptionLayout(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('.playlist-detail-heading');
    const description = document.querySelector<HTMLElement>('.playlist-detail-description');
    const meta = document.querySelector<HTMLElement>('.playlist-detail-meta');
    if (!heading || !description || !meta) {
      throw new Error('Unable to measure playlist description layout');
    }

    const headingRect = heading.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    const metaRect = meta.getBoundingClientRect();
    return {
      descriptionWidth: descriptionRect.width,
      headingWidth: headingRect.width,
      maxWidth: getComputedStyle(description).maxWidth,
      metaGap: metaRect.top - descriptionRect.bottom
    };
  });
}

async function readPlaylistDetailGlowState(page: Page) {
  return page.evaluate(() => {
    const cover = document.querySelector('.playlist-detail-cover') as HTMLElement | null;
    const playButton = document.querySelector('.playlist-detail-play-button') as HTMLElement | null;
    const detail = document.querySelector('.playlist-detail-view') as HTMLElement | null;
    const hero = document.querySelector('.playlist-detail-hero') as HTMLElement | null;
    const panel = document.querySelector('.playlist-detail-panel') as HTMLElement | null;
    const mainContent = document.querySelector('.main-content-playlist') as HTMLElement | null;
    const transitionStage = mainContent?.querySelector('.main-content-transition-stage') as HTMLElement | null;
    if (!cover || !playButton || !detail || !hero || !panel || !mainContent || !transitionStage) {
      throw new Error('Unable to read playlist detail glow material');
    }
    const coverRect = cover.getBoundingClientRect();
    const mainContentRect = mainContent.getBoundingClientRect();

    return {
      coverGlow: cover.style.getPropertyValue('--playlist-detail-cover-glow'),
      coverLeftClearance: coverRect.left - mainContentRect.left,
      coverShadow: getComputedStyle(cover).boxShadow,
      coverTopClearance: coverRect.top - mainContentRect.top,
      detailOverflow: getComputedStyle(detail).overflow,
      heroOverflow: getComputedStyle(hero).overflow,
      mainContentOverflow: getComputedStyle(mainContent).overflow,
      panelOverflow: getComputedStyle(panel).overflow,
      transitionStageContain: getComputedStyle(transitionStage).contain,
      playButtonShadow: getComputedStyle(playButton).boxShadow
    };
  });
}

async function readStickyHeaderState(page: Page, listSelector: string, headerSelector: string) {
  return page.evaluate(({ listSelector, headerSelector }) => {
    const list = document.querySelector(listSelector) as HTMLElement | null;
    const header = document.querySelector(headerSelector) as HTMLElement | null;

    if (!list || !header) {
      throw new Error(`Unable to find sticky header fixture: ${listSelector} ${headerSelector}`);
    }

    const listRect = (header.parentElement?.classList.contains('song-list-scroll-shell')
      ? header.parentElement
      : list).getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const hit = document.elementFromPoint(
      headerRect.left + Math.min(24, headerRect.width / 2),
      headerRect.top + headerRect.height / 2
    );

    return {
      scrollTop: list.scrollTop,
      position: getComputedStyle(header).position,
      boxShadow: getComputedStyle(header).boxShadow,
      topDelta: Math.abs(headerRect.top - listRect.top),
      headerBottom: headerRect.bottom,
      listTop: list.getBoundingClientRect().top,
      hitSongRowInHeader: Boolean(hit?.closest('.search-result-row, .playlist-detail-song-row'))
    };
  }, { listSelector, headerSelector });
}

async function scrollSongListToBottom(page: Page, listSelector: string, rowSelector: string, expectedLastRowText: string) {
  await page.locator(listSelector).evaluate((songList) => {
    songList.scrollTop = songList.scrollHeight;
    songList.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator(rowSelector).last()).toContainText(expectedLastRowText);
}

async function scrollSongListToBackdropSample(page: Page, listSelector: string, rowSelector: string, expectedRowText: string) {
  await page.locator(listSelector).evaluate((songList) => {
    songList.scrollTop = 190;
    songList.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => {
    const state = await readLivePlayerBackdropState(page, listSelector, rowSelector);
    return state.hasRealRowBehindPlayer && state.liveBackdropText.includes(expectedRowText);
  }).toBe(true);
}

async function readBottomPlayerClearance(page: Page, listSelector: string, rowSelector: string) {
  return page.evaluate(({ listSelector, rowSelector }) => {
    const list = document.querySelector(listSelector) as HTMLElement | null;
    const rows = Array.from(document.querySelectorAll(rowSelector)) as HTMLElement[];
    const playerBar = document.querySelector('.player-bar') as HTMLElement | null;
    const scrollbar = list?.parentElement?.querySelector('.song-list-visual-scrollbar') as HTMLElement | null;

    if (!list || rows.length === 0 || !playerBar || !scrollbar) {
      throw new Error(`Unable to measure player clearance: ${listSelector} ${rowSelector}`);
    }

    const lastRow = rows.at(-1)!;
    const lastRowRect = lastRow.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const playerBarRect = playerBar.getBoundingClientRect();
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const lastRowBottomHit = document.elementFromPoint(
      lastRowRect.left + Math.min(48, lastRowRect.width / 2),
      lastRowRect.bottom - 2
    );
    const scrollbarBottomHit = document.elementFromPoint(
      scrollbarRect.left + scrollbarRect.width / 2,
      scrollbarRect.bottom - 2
    );

    return {
      listBottomToLastRowGap: listRect.bottom - lastRowRect.bottom,
      listToPlayerGap: playerBarRect.top - listRect.bottom,
      lastRowToPlayerGap: playerBarRect.top - lastRowRect.bottom,
      lastRowBottomCoveredByPlayer: Boolean(lastRowBottomHit?.closest('.player-bar')),
      visualScrollbarBottomToPlayerGap: playerBarRect.top - scrollbarRect.bottom,
      visualScrollbarBottomCoveredByPlayer: Boolean(scrollbarBottomHit?.closest('.player-bar')),
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      playerHeight: playerBarRect.height
    };
  }, { listSelector, rowSelector });
}

async function readLivePlayerBackdropState(page: Page, listSelector: string, rowSelector: string) {
  return page.evaluate(({ listSelector, rowSelector }) => {
    const list = document.querySelector(listSelector) as HTMLElement | null;
    const playerBar = document.querySelector('.player-bar') as HTMLElement | null;
    const rows = Array.from(document.querySelectorAll(rowSelector)) as HTMLElement[];
    const mainSearch = document.querySelector('.main-content-search') as HTMLElement | null;
    const mainPlaylist = document.querySelector('.main-content-playlist') as HTMLElement | null;

    if (!list || !playerBar || rows.length === 0) {
      throw new Error(`Unable to inspect live player backdrop: ${listSelector} ${rowSelector}`);
    }

    const playerRect = playerBar.getBoundingClientRect();
    const sampleX = playerRect.left + Math.min(160, playerRect.width * 0.24);
    const sampleY = playerRect.top + 10;
    const stack = document.elementsFromPoint(sampleX, sampleY);
    const liveMirror = stack.find((element) => Boolean(element.closest('[data-player-backdrop-live="true"], .player-backdrop-live')));
    const realRow = stack.find((element) => Boolean(element.closest(rowSelector)))?.closest(rowSelector);
    const overlappedRow = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > playerRect.top && rect.top < playerRect.bottom;
    });
    const rowOverlapInPlayer = overlappedRow
      ? Math.min(overlappedRow.getBoundingClientRect().bottom, playerRect.bottom) - Math.max(overlappedRow.getBoundingClientRect().top, playerRect.top)
      : 0;
    const playerStyle = getComputedStyle(playerBar) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    const hasGeneratedPseudoContent = (content: string) =>
      content !== 'none' && content !== 'normal' && content !== '""';
    const searchAfterContent = mainSearch ? getComputedStyle(mainSearch, '::after').content : 'none';
    const playlistAfterContent = mainPlaylist ? getComputedStyle(mainPlaylist, '::after').content : 'none';

    return {
      hasStaticSampler: stack.some((element) => element.classList.contains('player-backdrop-sampler')),
      hasMainContentStaticAfter: [searchAfterContent, playlistAfterContent].some(hasGeneratedPseudoContent),
      hasLiveBackdropMirror: Boolean(liveMirror),
      hasRealRowBehindPlayer: stack.some((element) => Boolean(element.closest(rowSelector))),
      liveBackdropText: realRow?.textContent?.trim() ?? '',
      playerBackdrop: playerStyle.backdropFilter || playerStyle.webkitBackdropFilter,
      rowOverlapInPlayer,
      listBottom: list.getBoundingClientRect().bottom,
      playerTop: playerRect.top
    };
  }, { listSelector, rowSelector });
}

async function readLyricsDepthState(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.playback-stage-3d') as HTMLElement | null;
    const background = document.querySelector('.lyrics-depth-background');
    const cover = document.querySelector('.lyrics-depth-cover') as HTMLElement | null;
    const title = document.querySelector('.lyrics-depth-title') as HTMLElement | null;
    const text = document.querySelector('.lyrics-depth-text') as HTMLElement | null;

    if (!stage || !background || !cover || !title || !text) {
      throw new Error('Unable to read lyrics depth layers');
    }

    return {
      pointerX: Number.parseFloat(stage.style.getPropertyValue('--pointer-x')),
      backgroundTransform: getComputedStyle(background).transform,
      coverTransform: getComputedStyle(cover).transform,
      titleTransform: getComputedStyle(title).transform,
      textTransform: getComputedStyle(text).transform,
      coverShiftX: stage.style.getPropertyValue('--cover-shift-x'),
      titleShiftX: stage.style.getPropertyValue('--title-shift-x'),
      textShiftX: stage.style.getPropertyValue('--text-shift-x'),
      coverInlineStyle: cover.getAttribute('style') ?? '',
      textInlineStyle: text.getAttribute('style') ?? ''
    };
  });
}

async function readVisiblePixelStats(page: Page, png: Buffer) {
  return page.evaluate(async (source) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to decode screenshot'));
      image.src = source;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      return { width, height, meaningfulPixels: 0, edgeEnergy: 0 };
    }

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const pixelStep = Math.max(1, Math.floor((width * height) / 6000));
    let meaningfulPixels = 0;

    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += pixelStep) {
      const dataIndex = pixelIndex * 4;
      const red = data[dataIndex];
      const green = data[dataIndex + 1];
      const blue = data[dataIndex + 2];
      const alpha = data[dataIndex + 3];
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);

      if (alpha > 8 && (maxChannel - minChannel > 16 || maxChannel < 248)) {
        meaningfulPixels += 1;
      }
    }

    let edgeEnergy = 0;
    let edgeSamples = 0;
    const luminanceAt = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    };
    for (let y = 2; y < height; y += 2) {
      for (let x = 2; x < width; x += 2) {
        const luminance = luminanceAt(x, y);
        edgeEnergy += Math.abs(luminance - luminanceAt(x - 2, y));
        edgeEnergy += Math.abs(luminance - luminanceAt(x, y - 2));
        edgeSamples += 2;
      }
    }

    return {
      width,
      height,
      meaningfulPixels,
      edgeEnergy: edgeSamples > 0 ? edgeEnergy / edgeSamples : 0
    };
  }, `data:image/png;base64,${png.toString('base64')}`);
}

async function readLyricsPortalHandoffState(page: Page) {
  return page.evaluate(() => {
    const vignette = document.querySelector<HTMLElement>('.lyrics-transition-app-vignette');
    const flight = document.querySelector<HTMLElement>('.lyrics-transition-flight');
    const overlay = document.querySelector<HTMLElement>('.lyrics-overlay');
    const panel = document.querySelector<HTMLElement>('.lyrics-panel');
    const stage = document.querySelector<HTMLElement>('.playback-stage-3d');
    const title = document.querySelector<HTMLElement>('.lyrics-title-enter');
    const text = document.querySelector<HTMLElement>('.lyrics-text-enter');
    const tools = document.querySelector<HTMLElement>('.lyrics-side-tools');
    const lyricsPlayer = document.querySelector<HTMLElement>('.lyrics-player-bar');
    const player = document.querySelector<HTMLElement>('.player-bar');

    if (!vignette || !flight || !overlay || !panel || !stage || !title || !text || !tools || !lyricsPlayer || !player) {
      throw new Error('Unable to inspect the lyrics portal handoff');
    }

    const vignetteStyle = getComputedStyle(vignette);
    const flightStyle = getComputedStyle(flight);
    const overlayStyle = getComputedStyle(overlay);
    const panelStyle = getComputedStyle(panel);
    const stageStyle = getComputedStyle(stage);
    const titleStyle = getComputedStyle(title);
    const textStyle = getComputedStyle(text);
    const toolsStyle = getComputedStyle(tools);
    const lyricsPlayerStyle = getComputedStyle(lyricsPlayer);
    const playerStyle = getComputedStyle(player);
    const playerRect = player.getBoundingClientRect();
    const playerHit = document.elementFromPoint(
      playerRect.left + playerRect.width / 2,
      playerRect.top + playerRect.height / 2
    );
    const blurMatch = vignetteStyle.backdropFilter.match(/blur\(([\d.]+)px\)/);

    return {
      appVignetteOpacity: Number.parseFloat(vignetteStyle.opacity),
      appBlur: blurMatch ? Number.parseFloat(blurMatch[1]) : 0,
      flightOpacity: Number.parseFloat(flightStyle.opacity),
      vignetteZIndex: Number.parseInt(vignetteStyle.zIndex, 10),
      vignetteInsideOverlay: overlay.contains(vignette),
      overlayZIndex: Number.parseInt(overlayStyle.zIndex, 10),
      overlayFilter: overlayStyle.filter,
      panelZIndex: Number.parseInt(panelStyle.zIndex, 10),
      panelFilter: panelStyle.filter,
      panelTop: panel.getBoundingClientRect().top,
      stageFilter: stageStyle.filter,
      titleFilter: titleStyle.filter,
      textFilter: textStyle.filter,
      toolsFilter: toolsStyle.filter,
      flightZIndex: Number.parseInt(flightStyle.zIndex, 10),
      playerZIndex: Number.parseInt(playerStyle.zIndex, 10),
      playerAnimationName: playerStyle.animationName,
      playerBackdropFilter: playerStyle.backdropFilter,
      playerBackgroundImage: playerStyle.backgroundImage,
      playerPointerEvents: playerStyle.pointerEvents,
      playerHitPlayerBar: Boolean(playerHit?.closest('.player-bar')),
      playerHitLyricsOverlay: Boolean(playerHit?.closest('.lyrics-overlay')),
      playerVisible: Number.parseFloat(playerStyle.opacity) > 0.05,
      lyricsPlayerVisible: Number.parseFloat(lyricsPlayerStyle.opacity) > 0.05,
      viewportHeight: window.innerHeight,
      flightVisible: Number.parseFloat(flightStyle.opacity) > 0.05
    };
  });
}

async function readLyricsPlayerLayerState(page: Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('.lyrics-overlay');
    const mainPlayer = document.querySelector<HTMLElement>('.player-bar');
    const player = document.querySelector<HTMLElement>('.lyrics-player-bar');

    if (!overlay || !mainPlayer || !player) {
      throw new Error('Unable to inspect the lyrics player layer');
    }

    const playerStyle = getComputedStyle(player);
    const playerRect = player.getBoundingClientRect();
    const playerHit = document.elementFromPoint(
      playerRect.left + playerRect.width / 2,
      playerRect.top + playerRect.height / 2
    );

    return {
      playerZIndex: Number.parseInt(playerStyle.zIndex, 10),
      playerAnimationName: playerStyle.animationName,
      playerOpacity: Number.parseFloat(playerStyle.opacity),
      playerBackgroundImage: playerStyle.backgroundImage,
      playerBackdropFilter: playerStyle.backdropFilter,
      playerBottom: playerRect.bottom,
      playerFilter: playerStyle.filter,
      playerIsInsideOverlay: overlay.contains(player),
      playerLeft: playerRect.left,
      playerPointerEvents: playerStyle.pointerEvents,
      playerRight: playerRect.right,
      playerTransform: playerStyle.transform,
      playerHitLyricsPlayerBar: Boolean(playerHit?.closest('.lyrics-player-bar')),
      playerHitMainPlayer: Boolean(playerHit?.closest('.player-bar')),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
}

async function waitForMainContentTransition(page: Page) {
  const transitionStage = page.getByTestId('main-content-transition');
  const activeContent = transitionStage.locator(
    ':scope > .main-content-transition-layer-active > .main-content-transition-content'
  );
  await expect(transitionStage.locator(':scope > .main-content-transition-layer-outgoing')).toHaveCount(0, { timeout: 2_000 });
  await expect.poll(() => activeContent.evaluate((content) => {
    const style = getComputedStyle(content);
    return {
      filter: style.filter,
      opacity: style.opacity,
      transform: style.transform,
      willChange: style.willChange
    };
  })).toEqual({
    filter: 'none',
    opacity: '1',
    transform: 'none',
    willChange: 'auto'
  });
}

function readBackdropBlurPx(filter: string) {
  const match = filter.match(/blur\(([\d.]+)px\)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

async function expectAnchoredGlassPopover(popover: Locator, disallowedAncestorSelector: string, anchorSide: 'top' | 'bottom') {
  await expect(popover).toHaveAttribute('data-state', 'open');

  const popoverStyle = await popover.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      animationName: style.animationName,
      backdropFilter: style.backdropFilter,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      borderStyle: style.borderStyle,
      transformOrigin: style.transformOrigin
    };
  });

  const insideDisallowedAncestor = await popover.evaluate(
    (element, selector) => Boolean(element.closest(selector)),
    disallowedAncestorSelector
  );
  const [, originY = ''] = popoverStyle.transformOrigin.split(' ');

  expect(popoverStyle.animationName).toBe('anchoredPopoverIn');
  expect(popoverStyle.backdropFilter).toContain('blur');
  expect(readBackdropBlurPx(popoverStyle.backdropFilter)).toBe(24);
  expect(popoverStyle.backgroundImage).toContain('linear-gradient');
  expect(popoverStyle.borderRadius).toBe('8px');
  expect(popoverStyle.borderStyle).toBe('solid');
  expect(insideDisallowedAncestor).toBe(false);
  expect(popoverStyle.transformOrigin).not.toBe('50% 50%');

  if (anchorSide === 'top') {
    expect(originY).toBe('0px');
  } else {
    expect(Number.parseFloat(originY)).toBeGreaterThan(0);
  }
}

async function expectPopoverCenteredOverTrigger(popover: Locator, trigger: Locator) {
  const popoverBox = await popover.boundingBox();
  const triggerBox = await trigger.boundingBox();

  if (!popoverBox || !triggerBox) {
    throw new Error('Unable to inspect popover alignment');
  }

  const popoverCenterX = popoverBox.x + popoverBox.width / 2;
  const triggerCenterX = triggerBox.x + triggerBox.width / 2;

  expect(Math.abs(popoverCenterX - triggerCenterX)).toBeLessThanOrEqual(1.25);
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(triggerBox.y - 8);
}

async function readFloatingControlMaterial(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    const beforeStyle = getComputedStyle(element, '::before');

    return {
      animationName: style.animationName,
      backdropFilter: style.backdropFilter,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      transformOrigin: style.transformOrigin,
      beforeBackgroundImage: beforeStyle.backgroundImage,
      beforeContent: beforeStyle.content,
      beforeOpacity: Number.parseFloat(beforeStyle.opacity)
    };
  });
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
