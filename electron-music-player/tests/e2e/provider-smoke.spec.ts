import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const discoveryCoverDataUrls = {
  qq: readDiscoveryCovers('qq'),
  netease: readDiscoveryCovers('netease')
};

async function waitForMainContentTransition(page: Page) {
  const pageTransition = page.getByTestId('main-content-transition');
  await expect(pageTransition.locator(':scope > .main-content-transition-layer-outgoing')).toHaveCount(0, { timeout: 2_000 });
  await expect.poll(() => pageTransition.locator(':scope > .main-content-transition-layer-active').evaluate((layer) => (
    getComputedStyle(layer).filter
  ))).toBe('none');
}

async function expectNoNativeOutline(locator: Locator) {
  await locator.focus();
  const outline = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).toBe('none');
  expect(outline.width).toBe('0px');
}

function readDiscoveryCovers(providerId: 'qq' | 'netease'): string[] {
  return Array.from({ length: 8 }, (_, index) => {
    const filename = `${providerId}-${String(index + 1).padStart(2, '0')}.jpg`;
    const content = readFileSync(resolve(
      process.cwd(),
      'tests/e2e/fixtures/discovery-covers',
      filename
    ));
    return `data:image/jpeg;base64,${content.toString('base64')}`;
  });
}

async function expectDecodedCoverVariety(images: Locator, minimumUniqueSources: number) {
  await expect.poll(() => images.count()).toBeGreaterThanOrEqual(minimumUniqueSources);
  await expect.poll(() => images.evaluateAll((elements) => new Set(
    (elements as HTMLImageElement[])
      .filter((image) => image.complete && image.naturalWidth > 16 && image.naturalHeight > 16)
      .map((image) => image.currentSrc || image.src)
  ).size)).toBeGreaterThanOrEqual(minimumUniqueSources);
}

async function readDiscoveryCatalogRequestCounts(page: Page) {
  return page.evaluate(() => ({
    charts: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getCharts') ?? '0', 10),
    chartTracks: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getChartTracks') ?? '0', 10),
    discoveredPlaylists: Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getDiscoveredPlaylists') ?? '0',
      10
    )
  }));
}

async function readHomepageBlockRequestCounts(page: Page) {
  return page.evaluate(() => ({
    qq: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getHomepageBlocks:qq') ?? '0', 10),
    netease: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getHomepageBlocks:netease') ?? '0', 10)
  }));
}

async function readReleaseCatalogRequestCounts(page: Page) {
  return page.evaluate(() => ({
    qq: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getNewAlbums:qq') ?? '0', 10),
    netease: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getNewAlbums:netease') ?? '0', 10)
  }));
}

async function readRecommendationHistoryRequestCounts(page: Page) {
  return page.evaluate(() => ({
    dates: Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHistoryDates') ?? '0',
      10
    ),
    detail: Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHistory') ?? '0',
      10
    )
  }));
}

async function readArtistCatalogRequestCounts(page: Page) {
  return page.evaluate(() => ({
    qq: Number.parseInt(window.sessionStorage.getItem('provider-smoke:getArtistDetail:qq') ?? '0', 10),
    netease: Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getArtistDetail:netease') ?? '0',
      10
    )
  }));
}

interface LayoutBox {
  left: number;
  right: number;
  top: number;
  width: number;
}

function groupLayoutBoxesByRow(boxes: readonly LayoutBox[], tolerance = 2): LayoutBox[][] {
  const rows: LayoutBox[][] = [];

  for (const box of boxes) {
    const row = rows.find((candidate) => Math.abs(candidate[0].top - box.top) <= tolerance);
    if (row) {
      row.push(box);
    } else {
      rows.push([box]);
    }
  }

  return rows;
}

function hasNonZeroTransition(duration: string): boolean {
  return duration.split(',').some((value) => {
    const normalized = value.trim();
    const multiplier = normalized.endsWith('ms') ? 1 : 1_000;
    return Number.parseFloat(normalized) * multiplier > 0;
  });
}

async function expectMainContentProviderTabContract(tab: Locator) {
  await expect(tab).toHaveClass(/provider-segmented-option-active/);
  await expect.poll(() => tab.evaluate((element) => (
    getComputedStyle(element).color.replaceAll(' ', '')
  ))).toBe('rgb(255,255,255)');
  const beforeHover = await tab.evaluate((element) => {
    const style = getComputedStyle(element);
    const afterStyle = getComputedStyle(element, '::after');
    const box = element.getBoundingClientRect();
    return {
      color: style.color.replaceAll(' ', ''),
      backgroundColor: style.backgroundColor,
      width: box.width,
      height: box.height,
      afterContent: afterStyle.content
    };
  });
  expect(beforeHover.color).toBe('rgb(255,255,255)');
  expect(beforeHover.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(beforeHover.afterContent).toBe('none');

  await tab.hover();
  await expect.poll(() => tab.evaluate((element) => (
    getComputedStyle(element).color.replaceAll(' ', '')
  ))).toBe('rgb(255,255,255)');

  const afterHover = await tab.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      afterContent: getComputedStyle(element, '::after').content
    };
  });
  expect(afterHover.width).toBeCloseTo(beforeHover.width, 2);
  expect(afterHover.height).toBeCloseTo(beforeHover.height, 2);
  expect(afterHover.afterContent).toBe('none');
}

async function readMainContentControlGeometry(control: Locator) {
  return control.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    return {
      borderRadius: getComputedStyle(element).borderRadius,
      height: htmlElement.offsetHeight,
      width: htmlElement.offsetWidth
    };
  });
}

async function readResolvedThemeTokenColors(
  page: Page,
  tokenNames: readonly string[],
  scopeSelector = ':root'
) {
  return page.evaluate(({ tokens, selector }) => {
    const scope = document.querySelector<HTMLElement>(selector);
    if (!scope) {
      throw new Error(`Unable to inspect theme tokens in ${selector}.`);
    }

    const sample = (value: string) => {
      const probe = document.createElement('span');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      if (!context) {
        throw new Error('Unable to create a color sampling context.');
      }

      probe.style.backgroundColor = value;
      scope.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      canvas.width = 1;
      canvas.height = 1;
      context.fillStyle = resolved;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };

    return Object.fromEntries(tokens.map((token) => [token, sample(`var(${token})`)]));
  }, { tokens: [...tokenNames], selector: scopeSelector });
}

test.describe('provider smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((catalogImages) => {
      const coverAt = (providerId: keyof typeof catalogImages, index = 0) => {
        const covers = catalogImages[providerId];
        return covers[index % covers.length];
      };
      window.localStorage.setItem('musicplayer.defaultProviderId', 'qq');
      window.localStorage.setItem('musicplayer.activeProviderId', 'qq');
      const qqArtistRef = {
        id: 'qq:artist:provider-smoke',
        providerId: 'qq',
        platformArtistId: 'provider-smoke',
        name: 'Smoke Artist'
      };
      const qqAlbumRef = {
        id: 'qq:album:provider-smoke',
        providerId: 'qq',
        platformAlbumId: 'provider-smoke',
        title: 'Smoke Album'
      };
      const neteaseArtistRef = {
        id: 'netease:artist:provider-smoke',
        providerId: 'netease',
        platformArtistId: 'provider-smoke',
        name: 'Netease Smoke Artist'
      };
      const neteaseAlbumRef = {
        id: 'netease:album:provider-smoke',
        providerId: 'netease',
        platformAlbumId: 'provider-smoke',
        title: 'Netease Smoke Album'
      };
      const smokeSong = {
        id: 'qq:provider-smoke',
        providerId: 'qq',
        platformSongId: 'provider-smoke',
        title: 'Provider Smoke Song',
        artist: 'Smoke Artist',
        album: 'Smoke Album',
        artists: [qqArtistRef],
        albumRef: qqAlbumRef,
        durationMs: 181000,
        coverTone: 'linear-gradient(135deg, #cf3434, #417a6b)',
        coverUrl: coverAt('qq', 0)
      };
      const neteaseSmokeSong = {
        ...smokeSong,
        id: 'netease:provider-smoke',
        providerId: 'netease',
        platformSongId: 'provider-smoke',
        title: 'Netease Chart Smoke Song',
        artist: 'Netease Smoke Artist',
        album: 'Netease Smoke Album',
        artists: [neteaseArtistRef],
        albumRef: neteaseAlbumRef,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: coverAt('netease', 0)
      };
      const catalogAlbums = {
        qq: Array.from({ length: 8 }, (_, index) => ({
          id: index === 0 ? qqAlbumRef.id : `qq:album:provider-smoke-${index + 1}`,
          providerId: 'qq',
          platformAlbumId: index === 0 ? qqAlbumRef.platformAlbumId : `provider-smoke-${index + 1}`,
          title: index === 0 ? qqAlbumRef.title : `Smoke Album ${index + 1}`,
          artistName: qqArtistRef.name,
          coverTone: `linear-gradient(135deg, hsl(${135 + index * 9} 48% 46%), hsl(${205 + index * 5} 34% 34%))`,
          coverUrl: coverAt('qq', index),
          releaseDate: `202${index % 6}-07-12`,
          trackCount: 10 + index,
          albumType: index % 2 === 0 ? '专辑' : 'EP',
          sourceLabel: 'QQ音乐'
        })),
        netease: Array.from({ length: 8 }, (_, index) => ({
          id: index === 0 ? neteaseAlbumRef.id : `netease:album:provider-smoke-${index + 1}`,
          providerId: 'netease',
          platformAlbumId: index === 0 ? neteaseAlbumRef.platformAlbumId : `provider-smoke-${index + 1}`,
          title: index === 0 ? neteaseAlbumRef.title : `Netease Smoke Album ${index + 1}`,
          artistName: neteaseArtistRef.name,
          coverTone: `linear-gradient(135deg, hsl(${350 - index * 8} 54% 52%), hsl(${205 + index * 6} 18% 28%))`,
          coverUrl: coverAt('netease', index),
          releaseDate: `202${index % 6}-07-12`,
          trackCount: 9 + index,
          albumType: index % 2 === 0 ? '专辑' : 'EP',
          sourceLabel: '网易云'
        }))
      };
      const frequentArtistAlbums = {
        qq: {
          id: 'qq:album:frequent-artist-latest',
          providerId: 'qq',
          platformAlbumId: 'frequent-artist-latest',
          title: 'QQ 常听歌手新专',
          artistName: qqArtistRef.name,
          coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
          coverUrl: coverAt('qq', 6),
          releaseDate: '2026-07-10',
          trackCount: 11,
          albumType: '专辑',
          sourceLabel: 'QQ音乐'
        },
        netease: {
          id: 'netease:album:frequent-artist-latest',
          providerId: 'netease',
          platformAlbumId: 'frequent-artist-latest',
          title: '网易常听歌手新专',
          artistName: neteaseArtistRef.name,
          coverTone: 'linear-gradient(135deg, #9c4655, #31536f)',
          coverUrl: coverAt('netease', 6),
          releaseDate: '2026-07-11',
          trackCount: 10,
          albumType: '专辑',
          sourceLabel: '网易云'
        }
      };
      const catalogArtistDetails = {
        qq: {
          ...qqArtistRef,
          aliases: ['Smoke Alias'],
          description: 'QQ artist catalog fixture',
          coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
          imageUrl: coverAt('qq', 0),
          sourceLabel: 'QQ音乐',
          songCount: 50,
          albumCount: catalogAlbums.qq.length + 1,
          topSongs: [smokeSong],
          albums: [frequentArtistAlbums.qq, ...catalogAlbums.qq]
        },
        netease: {
          ...neteaseArtistRef,
          aliases: ['Netease Smoke Alias'],
          description: 'Netease artist catalog fixture',
          coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
          imageUrl: coverAt('netease', 0),
          sourceLabel: '网易云',
          songCount: 50,
          albumCount: catalogAlbums.netease.length + 1,
          topSongs: [neteaseSmokeSong],
          albums: [frequentArtistAlbums.netease, ...catalogAlbums.netease]
        }
      };
      const catalogAlbumDetails = {
        qq: {
          ...catalogAlbums.qq[0],
          description: 'QQ album catalog fixture',
          artists: [qqArtistRef],
          tracks: [smokeSong]
        },
        netease: {
          ...catalogAlbums.netease[0],
          description: 'Netease album catalog fixture',
          artists: [neteaseArtistRef],
          tracks: [neteaseSmokeSong]
        }
      };
      const frequentArtistAlbumDetails = {
        qq: {
          ...frequentArtistAlbums.qq,
          description: 'QQ frequent artist album fixture',
          artists: [qqArtistRef],
          tracks: [smokeSong]
        },
        netease: {
          ...frequentArtistAlbums.netease,
          description: 'Netease frequent artist album fixture',
          artists: [neteaseArtistRef],
          tracks: [neteaseSmokeSong]
        }
      };
      window.localStorage.setItem('musicplayer.listening-history:v1', JSON.stringify({
        version: 1,
        entries: [
          { song: smokeSong, qualifiedPlayCount: 8, lastPlayedAt: Date.now() - 24 * 60 * 60 * 1_000 },
          { song: neteaseSmokeSong, qualifiedPlayCount: 7, lastPlayedAt: Date.now() - 2 * 24 * 60 * 60 * 1_000 }
        ]
      }));
      const chartProviders = {
        qq: Array.from({ length: 8 }, (_, index) => ({
          id: `qq:chart:${index + 1}`,
          providerId: 'qq',
          platformChartId: String(index + 1),
          title: index === 0 ? 'QQ Smoke Chart' : index === 1 ? 'QQ 新歌榜' : `QQ Chart ${index + 1}`,
          description: 'QQ chart directory fixture',
          songIds: [],
          coverTone: `linear-gradient(135deg, hsl(${140 + index * 9} 48% 48%), hsl(${205 + index * 7} 38% 36%))`,
          coverUrl: coverAt('qq', index),
          sourceLabel: 'QQ音乐',
          updateLabel: '每日更新'
        })),
        netease: Array.from({ length: 8 }, (_, index) => ({
          id: `netease:chart:${19723756 + index}`,
          providerId: 'netease',
          platformChartId: String(19723756 + index),
          title: index === 0 ? 'Netease Smoke Chart' : `Netease Chart ${index + 1}`,
          description: 'Netease chart directory fixture',
          songIds: [],
          coverTone: `linear-gradient(135deg, hsl(${350 - index * 8} 54% 52%), hsl(${205 + index * 6} 18% 28%))`,
          coverUrl: coverAt('netease', index),
          sourceLabel: '网易云',
          updateLabel: '每天更新'
        }))
      };
      const discoveryCategories = {
        qq: [
          { id: 'all', providerId: 'qq', name: '全部' },
          ...Array.from({ length: 27 }, (_, index) => ({
            id: String(100 + index),
            providerId: 'qq',
            name: index === 0 ? '流行' : `QQ 分类 ${index + 1}`,
            group: index < 8 ? '热门' : '场景',
            hot: index < 8
          }))
        ],
        netease: [
          { id: 'all', providerId: 'netease', name: '全部' },
          ...Array.from({ length: 27 }, (_, index) => ({
            id: index === 0 ? '学习' : `网易云分类${index + 1}`,
            providerId: 'netease',
            name: index === 0 ? '学习' : `网易云分类 ${index + 1}`,
            group: index < 8 ? '场景' : '风格',
            hot: index < 8
          }))
        ]
      };
      const discoveryPlaylists = {
        qq: Array.from({ length: 24 }, (_, index) => ({
          id: `qq:${8800 + index}`,
          providerId: 'qq',
          platformPlaylistId: String(8800 + index),
          title: index === 0 ? 'QQ Discovery Smoke' : `QQ 歌单 ${index + 1}`,
          description: 'QQ 公开歌单目录夹具',
          songIds: [],
          coverTone: `linear-gradient(135deg, hsl(${132 + index * 11} 48% 46%), hsl(${205 + index * 5} 34% 34%))`,
          coverUrl: coverAt('qq', index),
          sourceLabel: 'QQ音乐',
          creatorName: `QQ 创作者 ${index + 1}`,
          playCount: 56000 + index * 9731,
          trackCount: 24 + index
        })),
        netease: Array.from({ length: 24 }, (_, index) => ({
          id: `netease:${9900 + index}`,
          providerId: 'netease',
          platformPlaylistId: String(9900 + index),
          title: index === 0 ? 'Netease Discovery Smoke' : index === 2 ? '夜晚治愈精选' : `网易云歌单 ${index + 1}`,
          description: '网易云公开歌单目录夹具',
          songIds: [],
          coverTone: `linear-gradient(135deg, hsl(${350 - index * 9} 56% 52%), hsl(${175 + index * 7} 28% 34%))`,
          coverUrl: coverAt('netease', index),
          sourceLabel: '网易云',
          creatorName: `网易云创作者 ${index + 1}`,
          playCount: 76000 + index * 12873,
          trackCount: 30 + index
        }))
      };
      const dailyRecommendationSongs = [
        {
          ...neteaseSmokeSong,
          id: 'netease:daily-wasted',
          platformSongId: 'daily-wasted',
          title: 'Wasted (Nightcore) [Bass Boosted]',
          artist: 'murkish / Huken / harmony haven',
          album: 'Wasted',
          artists: [{
            id: 'netease:artist:daily-wasted',
            providerId: 'netease',
            platformArtistId: 'daily-wasted',
            name: 'murkish / Huken / harmony haven'
          }],
          albumRef: {
            id: 'netease:album:daily-wasted',
            providerId: 'netease',
            platformAlbumId: 'daily-wasted',
            title: 'Wasted'
          },
          durationMs: 180000,
          coverUrl: coverAt('netease', 0)
        },
        {
          ...neteaseSmokeSong,
          id: 'netease:daily-spotlight',
          platformSongId: 'daily-spotlight',
          title: 'Spotlight',
          artist: '蔡徐坤',
          album: 'Spotlight',
          artists: [{
            id: 'netease:artist:daily-spotlight',
            providerId: 'netease',
            platformArtistId: 'daily-spotlight',
            name: '蔡徐坤'
          }],
          albumRef: {
            id: 'netease:album:daily-spotlight',
            providerId: 'netease',
            platformAlbumId: 'daily-spotlight',
            title: 'Spotlight'
          },
          durationMs: 202000,
          coverUrl: coverAt('netease', 1)
        },
        {
          ...neteaseSmokeSong,
          id: 'netease:daily-sweet-guitar',
          platformSongId: 'daily-sweet-guitar',
          title: '你 (吉他甜蜜版)',
          artist: '林依晨 / 恶作剧2吻',
          album: '你 (吉他甜蜜版)',
          artists: [{
            id: 'netease:artist:daily-sweet-guitar',
            providerId: 'netease',
            platformArtistId: 'daily-sweet-guitar',
            name: '林依晨 / 恶作剧2吻'
          }],
          albumRef: {
            id: 'netease:album:daily-sweet-guitar',
            providerId: 'netease',
            platformAlbumId: 'daily-sweet-guitar',
            title: '你 (吉他甜蜜版)'
          },
          durationMs: 282000,
          coverUrl: coverAt('netease', 2)
        }
      ].map((song) => ({
        ...song,
        sourceContext: {
          type: 'recommendation' as const,
          providerId: 'netease' as const,
          playlistTitle: '每日推荐'
        }
      }));
      const qqRecommendationSongs = Array.from({ length: 12 }, (_, index) => ({
        ...smokeSong,
        id: `qq:new-smoke-${index + 1}`,
        platformSongId: `new-smoke-${index + 1}`,
        title: `QQ New Song ${index + 1}`,
        coverUrl: coverAt('qq', index + 1),
        sourceContext: {
          type: 'recommendation',
          providerId: 'qq',
          playlistTitle: '新歌推荐'
        }
      }));
      const newRecommendationSongs = Array.from({ length: 12 }, (_, index) => ({
        ...neteaseSmokeSong,
        id: `netease:latest-smoke-${index + 1}`,
        platformSongId: `latest-smoke-${index + 1}`,
        title: `Netease Latest Song ${index + 1}`,
        coverUrl: coverAt('netease', index + 1),
        sourceContext: {
          type: 'recommendation',
          providerId: 'netease',
          playlistTitle: '最新音乐'
        }
      }));
      const similarRecommendationSongs = Array.from({ length: 5 }, (_, index) => ({
        ...neteaseSmokeSong,
        id: `netease:similar-smoke-${index + 1}`,
        platformSongId: `similar-smoke-${index + 1}`,
        title: `Netease Similar Song ${index + 1}`,
        artist: `Similar Artist ${index + 1}`,
        album: `Similar Album ${index + 1}`,
        coverUrl: coverAt('netease', index + 3),
        sourceContext: {
          type: 'recommendation',
          providerId: 'netease',
          playlistTitle: '相似推荐'
        }
      }));
      const homepageBlockSongs = Array.from({ length: 2 }, (_, index) => ({
        ...neteaseSmokeSong,
        id: `netease:homepage-block-smoke-${index + 1}`,
        platformSongId: `homepage-block-smoke-${index + 1}`,
        title: `Homepage Block Smoke Song ${index + 1}`,
        album: 'Homepage Block Smoke Album',
        coverUrl: coverAt('netease', index + 5),
        sourceContext: {
          type: 'recommendation',
          providerId: 'netease',
          playlistTitle: 'Homepage Block Smoke'
        }
      }));
      const recommendationHistoryDates = ['2026-07-17', '2026-07-16', '2026-07-15'];
      const recommendationHistorySongs = Object.fromEntries(recommendationHistoryDates.map((date, dateIndex) => [
        date,
        Array.from({ length: dateIndex === 0 ? 12 : 4 }, (_, index) => ({
          ...neteaseSmokeSong,
          id: `netease:history-${dateIndex + 1}-${index + 1}`,
          platformSongId: `history-${dateIndex + 1}-${index + 1}`,
          title: `Netease History ${dateIndex + 1} Song ${index + 1}`,
          artist: `History Artist ${index + 1}`,
          album: `History Album ${index + 1}`,
          coverUrl: coverAt('netease', index + dateIndex + 2),
          sourceContext: {
            type: 'recommendation',
            providerId: 'netease',
            playlistTitle: '历史日推'
          }
        }))
      ]));

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
            data: { providerId, loggedIn: true, playbackReady: true }
          }),
          login: async (providerId) => ({
            ok: true,
            data: { providerId, loggedIn: false, playbackReady: false }
          }),
          logout: async () => ({ ok: true, data: undefined }),
          search: async (providerId) => ({
            ok: true,
            data: [providerId === 'netease' ? neteaseSmokeSong : smokeSong]
          }),
          getSearchSuggestions: async (providerId, keyword) => ({
            ok: true,
            data: [{
              id: `${providerId}:suggestion:${String(keyword).toLowerCase()}`,
              providerId,
              keyword: String(keyword),
              title: String(keyword),
              kind: 'song',
              subtitle: providerId === 'netease' ? neteaseSmokeSong.artist : smokeSong.artist
            }]
          }),
          getSearchHotSearches: async (providerId) => ({
            ok: true,
            data: [{
              id: `${providerId}:hot:provider-smoke`,
              providerId,
              keyword: 'provider smoke',
              title: 'Provider smoke',
              rank: 1
            }]
          }),
          searchEntities: async (providerId, keyword) => {
            const song = providerId === 'netease' ? neteaseSmokeSong : smokeSong;
            return {
              ok: true,
              data: {
                providerId,
                keyword: String(keyword),
                sections: {
                  songs: { available: true, items: [song], total: 1, hasMore: false, errorMessage: null },
                  artists: providerId === 'netease'
                    ? { available: true, items: [catalogArtistDetails.netease], total: 1, hasMore: false, errorMessage: null }
                    : { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
                  albums: {
                    available: true,
                    items: [providerId === 'netease' ? catalogAlbums.netease[0] : catalogAlbums.qq[0]],
                    total: 1,
                    hasMore: false,
                    errorMessage: null
                  },
                  playlists: providerId === 'netease'
                    ? { available: true, items: [discoveryPlaylists.netease[0]], total: 1, hasMore: false, errorMessage: null }
                    : { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
                }
              }
            };
          },
          getUserPlaylists: async () => ({ ok: true, data: [] }),
          getPlaylistTracks: async (providerId, playlistId) => ({
            ok: true,
            data: playlistId === 'qq:8800'
              ? [{
                  ...smokeSong,
                  title: 'QQ Discovery Detail Song',
                  sourceContext: {
                    type: 'playlist',
                    providerId,
                    playlistId,
                    playlistTitle: 'QQ Discovery Smoke'
                  }
                }]
              : playlistId === 'netease:9900'
              ? [{
                  ...neteaseSmokeSong,
                  title: 'Netease Discovery Detail Song',
                  sourceContext: {
                    type: 'playlist',
                    providerId,
                    playlistId,
                    playlistTitle: 'Netease Discovery Smoke'
                  }
                }]
              : []
          }),
          getCharts: async (providerId) => {
            const totalRequestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getCharts') ?? '0',
              10
            );
            window.sessionStorage.setItem('provider-smoke:getCharts', String(totalRequestCount + 1));
            if (window.sessionStorage.getItem(`provider-smoke:fail-charts:${providerId}`) === 'true') {
              return {
                ok: false,
                error: {
                  code: 'provider_failed',
                  providerId,
                  message: `${providerId === 'qq' ? 'QQ' : '网易云'} 排行榜区块加载失败`
                }
              };
            }

            return {
              ok: true,
              data: chartProviders[providerId] ?? []
            };
          },
          getChartTracks: async (providerId, chartId) => {
            const totalRequestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getChartTracks') ?? '0',
              10
            );
            window.sessionStorage.setItem('provider-smoke:getChartTracks', String(totalRequestCount + 1));
            const requestCountKey = `provider-smoke:chart-track-requests:${providerId}:${chartId}`;
            const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
            window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));
            if (
              providerId === 'qq'
              && window.sessionStorage.getItem('provider-smoke:defer-qq-chart') === 'true'
            ) {
              while (window.sessionStorage.getItem('provider-smoke:release-qq-chart') !== 'true') {
                await new Promise((resolve) => window.setTimeout(resolve, 10));
              }
            }

            return {
              ok: true,
              data: providerId === 'qq' && chartId === 'qq:chart:1'
                ? [{
                    ...smokeSong,
                    sourceContext: {
                      type: 'playlist',
                      providerId: 'qq',
                      playlistId: chartId,
                      playlistTitle: 'QQ Smoke Chart'
                    }
                  }]
                : providerId === 'netease'
                  ? Array.from({ length: 3 }, (_, index) => ({
                      ...neteaseSmokeSong,
                      id: index === 0 && chartId === 'netease:chart:19723756'
                        ? neteaseSmokeSong.id
                        : `netease:${chartId}:${index + 1}`,
                      platformSongId: `${chartId}:${index + 1}`,
                      title: index === 0 && chartId === 'netease:chart:19723756'
                        ? neteaseSmokeSong.title
                        : `Netease Digest Song ${index + 1}`,
                      artist: `Digest Artist ${index + 1}`,
                      sourceContext: {
                        type: 'playlist',
                        providerId: 'netease',
                        playlistId: chartId,
                        playlistTitle: chartProviders.netease.find((chart) => chart.id === chartId)?.title ?? 'Netease Chart'
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
            const totalRequestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getDiscoveredPlaylists') ?? '0',
              10
            );
            window.sessionStorage.setItem(
              'provider-smoke:getDiscoveredPlaylists',
              String(totalRequestCount + 1)
            );
            const providerPlaylists = discoveryPlaylists[providerId] ?? [];
            const offset = query.offset ?? 0;
            const playlists = providerPlaylists.slice(offset, offset + 12);
            return {
              ok: true,
              data: {
                providerId,
                categoryId: query.categoryId,
                playlists,
                offset,
                limit: query.limit ?? 30,
                total: providerPlaylists.length,
                hasMore: offset + playlists.length < providerPlaylists.length
              }
            };
          },
          getRecommendationHome: async (providerId) => {
            const requestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getRecommendationHome') ?? '0',
              10
            );
            window.sessionStorage.setItem('provider-smoke:getRecommendationHome', String(requestCount + 1));
            const failDailyOnce = providerId === 'netease'
              && window.sessionStorage.getItem('provider-smoke:failDailyOnce') === 'true';
            if (failDailyOnce) {
              window.sessionStorage.removeItem('provider-smoke:failDailyOnce');
            }

            return {
              ok: true,
              data: {
                providerId,
                loggedIn: true,
                dailySongs: providerId === 'netease' && !failDailyOnce
                  ? dailyRecommendationSongs
                  : [],
                newSongs: providerId === 'netease' ? newRecommendationSongs : qqRecommendationSongs,
                moduleResults: {
                  daily: {
                    status: providerId !== 'netease'
                      ? 'skipped'
                      : failDailyOnce
                        ? 'rejected'
                        : 'fulfilled',
                    errorMessage: failDailyOnce ? '网易云每日推荐加载失败' : null
                  },
                  new: { status: 'fulfilled', errorMessage: null }
                }
              }
            };
          },
          getNewAlbums: async (providerId) => {
            const requestCountKey = `provider-smoke:getNewAlbums:${providerId}`;
            const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
            window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));
            return { ok: true, data: catalogAlbums[providerId] ?? [] };
          },
          getHomepageBlocks: async (providerId) => {
            const requestCountKey = `provider-smoke:getHomepageBlocks:${providerId}`;
            const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
            window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));

            return providerId === 'netease'
              ? {
                  ok: true,
                  data: {
                    providerId,
                    blocks: [{
                      kind: 'song',
                      id: 'homepage-block-smoke',
                      title: 'Homepage Block Smoke',
                      songs: homepageBlockSongs
                    }]
                  }
                }
              : {
                  ok: false,
                  error: {
                    code: 'provider_unsupported',
                    providerId,
                    message: 'Homepage blocks are only available for Netease in this fixture.'
                  }
                };
          },
          getRecommendationHistoryDates: async (providerId) => {
            const requestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getRecommendationHistoryDates') ?? '0',
              10
            );
            window.sessionStorage.setItem(
              'provider-smoke:getRecommendationHistoryDates',
              String(requestCount + 1)
            );
            return providerId === 'netease'
              ? { ok: true, data: recommendationHistoryDates }
              : {
                  ok: false,
                  error: {
                    code: 'provider_unsupported',
                    providerId,
                    message: '历史日推仅支持网易云音乐'
                  }
                };
          },
          getRecommendationHistory: async (providerId, date) => {
            const requestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getRecommendationHistory') ?? '0',
              10
            );
            window.sessionStorage.setItem(
              'provider-smoke:getRecommendationHistory',
              String(requestCount + 1)
            );
            return providerId === 'netease'
              ? {
                  ok: true,
                  data: {
                    providerId,
                    date,
                    songs: recommendationHistorySongs[date] ?? []
                  }
                }
              : {
                  ok: false,
                  error: {
                    code: 'provider_unsupported',
                    providerId,
                    message: '历史日推仅支持网易云音乐'
                  }
                };
          },
          getSimilarSongs: async (providerId) => {
            const requestCount = Number.parseInt(
              window.sessionStorage.getItem('provider-smoke:getSimilarSongs') ?? '0',
              10
            );
            window.sessionStorage.setItem('provider-smoke:getSimilarSongs', String(requestCount + 1));

            return providerId === 'netease'
              ? { ok: true, data: similarRecommendationSongs }
              : {
                  ok: false,
                  error: {
                    code: 'provider_unsupported',
                    providerId,
                    message: '当前来源不支持相似推荐'
                  }
                };
          },
          getArtistDetail: async (providerId) => {
            const requestCountKey = `provider-smoke:getArtistDetail:${providerId}`;
            const requestCount = Number.parseInt(window.sessionStorage.getItem(requestCountKey) ?? '0', 10);
            window.sessionStorage.setItem(requestCountKey, String(requestCount + 1));
            return {
              ok: true,
              data: catalogArtistDetails[providerId]
            };
          },
          getAlbumDetail: async (providerId, albumId) => ({
            ok: true,
            data: albumId === frequentArtistAlbums[providerId].id
              ? frequentArtistAlbumDetails[providerId]
              : catalogAlbumDetails[providerId]
          }),
          getSongUrl: async (_providerId, song, quality) => ({
            ok: true,
            data: {
              ok: true,
              providerId: song.providerId,
              quality,
              url: 'https://example.test/provider-smoke.mp3'
            }
          }),
          getLyrics: async (_providerId, song) => ({
            ok: true,
            data: {
              ok: true,
              providerId: song.providerId,
              lrc: '[00:01.00]Provider smoke lyric'
            }
          }),
          importLocalFiles: async () => ({ ok: true, data: [] })
        }
      };
    }, discoveryCoverDataUrls);

    await page.goto('/');
  });

  test('blocks Tab focus traversal and native focus outlines', async ({ page }) => {
    const searchInput = page.getByRole('combobox', { name: '搜索音乐' });
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    await page.keyboard.press('Tab');

    await expect(searchInput).toBeFocused();
    await expectNoNativeOutline(searchInput);
  });

  test('covers provider paths and both differentiated discovery homes', async ({ page }, testInfo) => {
    const sidebar = page.getByRole('navigation', { name: '主导航' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('.brand-name')).toHaveText('欧包音乐');
    await expect.poll(() => page.evaluate(() => (
      Array.from(document.fonts).find((font) => font.family === 'OuBao Wordmark')?.status
    ))).toBe('loaded');
    await expect(sidebar.getByRole('button', { name: '发现音乐', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '排行榜', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '歌单广场', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: '本地音乐', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '私人漫游', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '播客电台', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '我的音乐', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '下载管理', exact: true })).toHaveCount(0);
    await expect(page.locator('.nav-playlist-item')).toHaveCount(0);

    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    const sourceControl = discoveryHome.getByRole('group', { name: '发现音乐来源' });
    const qqProviderTab = sourceControl.getByRole('button', { name: 'QQ 音乐' });
    const neteaseProviderTab = sourceControl.getByRole('button', { name: '网易云音乐' });
    await expectMainContentProviderTabContract(qqProviderTab);
    await qqProviderTab.focus();
    const providerFocusStyle = await qqProviderTab.evaluate((button) => {
      const style = getComputedStyle(button);
      return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
    });
    expect(providerFocusStyle.outlineStyle).toBe('none');
    expect(providerFocusStyle.boxShadow).not.toBe('none');
    await expect(discoveryHome.locator('.qq-discovery-home')).toBeVisible();
    await expect(discoveryHome.locator('.netease-discovery-home')).toHaveCount(0);
    await expect(discoveryHome.locator('.qq-discovery-quick-start > article')).toHaveCount(1);
    await expect(discoveryHome.locator('.qq-discovery-primary-card')).toHaveCount(1);
    await expect(discoveryHome.locator('.qq-discovery-service-card')).toHaveCount(0);
    await expect(discoveryHome.getByRole('button', { name: '打开新歌推荐' })).toBeEnabled();
    await expect(discoveryHome.getByRole('button', { name: '播放新歌推荐' })).toBeEnabled();
    await expect(discoveryHome.locator('.qq-discovery-new-songs .qq-discovery-new-song-row')).toHaveCount(12);
    await expect(discoveryHome.locator('.qq-discovery-new-songs').getByText('QQ New Song 1', { exact: true })).toBeVisible();
    await expect(discoveryHome.getByRole('heading', { name: '新碟速递' })).toBeVisible();
    await expect(discoveryHome.locator('.discovery-new-albums .discovery-album-item')).toHaveCount(8);
    const qqFrequentAlbumsSection = discoveryHome
      .getByRole('heading', { name: '常听歌手专辑' })
      .locator('xpath=ancestor::section[1]');
    await expect(qqFrequentAlbumsSection).toContainText('欧包音乐 · 基于本地收听记录生成');
    await expect(qqFrequentAlbumsSection.locator('.discovery-album-item')).toHaveCount(1);
    await expect(qqFrequentAlbumsSection.getByText('QQ 常听歌手新专', { exact: true })).toBeVisible();
    const firstQQAlbum = discoveryHome.getByRole('button', { name: '打开专辑：Smoke Album', exact: true });
    await expect(firstQQAlbum).toBeEnabled();
    await expectNoNativeOutline(firstQQAlbum);
    const albumBeforeHover = await firstQQAlbum.evaluate((button) => {
      const cover = button.querySelector<HTMLElement>('.discovery-album-cover');
      if (!cover) throw new Error('Discovery album cover did not render');
      return {
        buttonTransitionDuration: getComputedStyle(button).transitionDuration,
        coverTransitionDuration: getComputedStyle(cover).transitionDuration,
        buttonBackground: getComputedStyle(button).backgroundColor,
        buttonShadow: getComputedStyle(button).boxShadow
      };
    });
    expect(hasNonZeroTransition(albumBeforeHover.buttonTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(albumBeforeHover.coverTransitionDuration)).toBe(true);
    expect(albumBeforeHover.buttonBackground).toBe('rgba(0, 0, 0, 0)');
    expect(albumBeforeHover.buttonShadow).toBe('none');
    await firstQQAlbum.hover({ position: { x: 20, y: 20 } });
    await expect.poll(() => firstQQAlbum.evaluate((button) => {
      const cover = button.querySelector<HTMLElement>('.discovery-album-cover');
      return Number.parseFloat(cover?.style.getPropertyValue('--playlist-card-rotate-y') ?? '0');
    })).not.toBe(0);
    await expect.poll(() => firstQQAlbum.evaluate((button) => {
      const sheen = button.querySelector<HTMLElement>('.playlist-discovery-card-sheen');
      return Number.parseFloat(sheen ? getComputedStyle(sheen).opacity : '0');
    })).toBeGreaterThan(0.7);
    const albumAfterHover = await firstQQAlbum.evaluate((button) => {
      const cover = button.querySelector<HTMLElement>('.discovery-album-cover');
      if (!cover) throw new Error('Discovery album cover did not render');
      const image = cover.querySelector<HTMLElement>('.playlist-discovery-card-image');
      const sheen = cover.querySelector<HTMLElement>('.playlist-discovery-card-sheen');
      if (!image || !sheen) throw new Error('Discovery album depth layers did not render');
      const imageTransform = getComputedStyle(image).transform;
      return {
        imageScale: imageTransform === 'none' ? 1 : new DOMMatrixReadOnly(imageTransform).a,
        coverShadow: getComputedStyle(cover).boxShadow,
        sheenOpacity: Number.parseFloat(getComputedStyle(sheen).opacity),
        buttonBackground: getComputedStyle(button).backgroundColor,
        buttonShadow: getComputedStyle(button).boxShadow
      };
    });
    expect(albumAfterHover.imageScale).toBeGreaterThan(1.04);
    expect(albumAfterHover.coverShadow).not.toBe('none');
    expect(albumAfterHover.sheenOpacity).toBeGreaterThan(0.7);
    expect(albumAfterHover.buttonBackground).toBe('rgba(0, 0, 0, 0)');
    expect(albumAfterHover.buttonShadow).toBe('none');
    await expect(discoveryHome.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
    await expect(discoveryHome.locator('.qq-discovery-playlist-card')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-playlist-card')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-chart-card')).toHaveCount(0);
    await expect(discoveryHome.getByText(/歌单补给站|榜单精选|推荐歌单|为你推荐的歌单/)).toHaveCount(0);
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
    expect(await readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 0 });
    expect(await readReleaseCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    expect(await readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 0, detail: 0 });
    await expect.poll(() => readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    await qqFrequentAlbumsSection.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-qq-frequent-artist-albums-${testInfo.project.name}.png`
    });
    await waitForMainContentTransition(page);
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-qq-${testInfo.project.name}.png`
    });

    await discoveryHome.getByRole('button', { name: '打开专辑：Smoke Album', exact: true }).click();
    const discoveryAlbumDetail = page.getByRole('region', { name: '专辑详情' });
    await expect(discoveryAlbumDetail.getByRole('heading', { name: 'Smoke Album', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: '后退' }).click();
    await expect(discoveryHome.locator('.qq-discovery-home')).toBeVisible();
    await waitForMainContentTransition(page);
    await discoveryHome.getByRole('button', { name: '打开专辑：QQ 常听歌手新专', exact: true }).click();
    await expect(discoveryAlbumDetail.getByRole('heading', { name: 'QQ 常听歌手新专', level: 1 }))
      .toBeVisible();
    await page.getByRole('button', { name: '后退' }).click();
    await expect(discoveryHome.locator('.qq-discovery-home')).toBeVisible();
    await waitForMainContentTransition(page);
    expect(await readReleaseCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    expect(await readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });

    const qqNewSongRows = discoveryHome.locator('.qq-discovery-new-songs .qq-discovery-new-song-row');
    const qqNewSongBoxes = await qqNewSongRows.evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, width: box.width };
    }));
    const qqNewSongLayoutRows = groupLayoutBoxesByRow(qqNewSongBoxes);
    const expectedQQColumnCount = testInfo.project.name === 'desktop' ? 4 : 3;
    expect(qqNewSongLayoutRows.map((row) => row.length)).toEqual(
      Array.from({ length: 12 / expectedQQColumnCount }, () => expectedQQColumnCount)
    );
    const firstQQNewSong = qqNewSongRows.first().locator('.qq-discovery-new-song-open');
    const qqNewSongBeforeHover = await firstQQNewSong.evaluate((button) => {
      const artwork = button.querySelector<HTMLElement>('.qq-discovery-new-song-artwork');
      const play = button.querySelector<HTMLElement>('.qq-discovery-new-song-play');
      if (!artwork || !play) {
        throw new Error('QQ new-song interaction content did not render');
      }
      return {
        borderWidth: getComputedStyle(button).borderTopWidth,
        surfaceOpacity: Number.parseFloat(getComputedStyle(button, '::before').opacity),
        playOpacity: Number.parseFloat(getComputedStyle(play).opacity),
        buttonTransitionDuration: getComputedStyle(button).transitionDuration,
        artworkTransitionDuration: getComputedStyle(artwork).transitionDuration,
        playTransitionDuration: getComputedStyle(play).transitionDuration
      };
    });
    expect(qqNewSongBeforeHover.borderWidth).toBe('0px');
    expect(qqNewSongBeforeHover.surfaceOpacity).toBeLessThan(0.1);
    expect(qqNewSongBeforeHover.playOpacity).toBeLessThan(0.1);
    expect(hasNonZeroTransition(qqNewSongBeforeHover.buttonTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(qqNewSongBeforeHover.artworkTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(qqNewSongBeforeHover.playTransitionDuration)).toBe(true);
    await firstQQNewSong.hover();
    await expect.poll(() => firstQQNewSong.locator('.qq-discovery-new-song-play').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeGreaterThan(0.95);
    await expect.poll(() => firstQQNewSong.evaluate((button) => (
      Number.parseFloat(getComputedStyle(button, '::before').opacity)
    ))).toBeGreaterThan(0.8);
    const qqNewSongAfterHover = await firstQQNewSong.evaluate((button) => {
      const artwork = button.querySelector<HTMLElement>('.qq-discovery-new-song-artwork');
      const transform = artwork ? getComputedStyle(artwork).transform : 'none';
      return {
        artworkScale: transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a,
        boxShadow: getComputedStyle(button).boxShadow,
        surfaceOpacity: Number.parseFloat(getComputedStyle(button, '::before').opacity)
      };
    });
    expect(qqNewSongAfterHover.artworkScale).toBeGreaterThan(1.01);
    expect(qqNewSongAfterHover.boxShadow).not.toBe('none');
    expect(qqNewSongAfterHover.surfaceOpacity).toBeGreaterThan(0.8);
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-qq-new-song-hover-${testInfo.project.name}.png`
    });

    await neteaseProviderTab.click();
    await expect(discoveryHome.locator('.netease-discovery-home')).toBeVisible();
    await waitForMainContentTransition(page);
    await expectMainContentProviderTabContract(neteaseProviderTab);
    await expect(discoveryHome.locator('.qq-discovery-home')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-feature-card')).toHaveCount(1);
    const neteasePrimaryPreview = discoveryHome.locator('.netease-discovery-primary-preview');
    await expect(neteasePrimaryPreview.getByText('Wasted (Nightcore) [Bass Boosted]', { exact: true }))
      .toBeVisible();
    const neteasePrimaryGeometry = await neteasePrimaryPreview.evaluate((preview) => {
      const grid = preview.closest<HTMLElement>('.netease-discovery-feature-grid');
      const card = grid?.querySelector<HTMLElement>('.netease-discovery-feature-card');
      const action = card?.querySelector<HTMLElement>('.netease-discovery-feature-action');
      const open = card?.querySelector<HTMLElement>('.netease-discovery-feature-open');
      const copies = Array.from(preview.querySelectorAll<HTMLElement>('.netease-discovery-song-copy'));
      if (!grid || !card || !action || !open || copies.length === 0) {
        throw new Error('Netease primary recommendation geometry did not render');
      }
      const cardBox = card.getBoundingClientRect();
      const previewBox = preview.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      return {
        cardBackground: cardStyle.backgroundColor,
        actionBackground: getComputedStyle(action).backgroundColor,
        cardOverflow: cardStyle.overflow,
        actionOverflow: getComputedStyle(action).overflow,
        openOverflow: getComputedStyle(open).overflow,
        bottomDelta: Math.abs(cardBox.bottom - previewBox.bottom),
        topDelta: Math.abs(cardBox.top - previewBox.top),
        minimumCopyWidth: Math.min(...copies.map((copy) => copy.getBoundingClientRect().width))
      };
    });
    expect(neteasePrimaryGeometry.cardBackground).toBe('rgba(0, 0, 0, 0)');
    expect(neteasePrimaryGeometry.actionBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(neteasePrimaryGeometry.cardOverflow).toBe('visible');
    expect(neteasePrimaryGeometry.actionOverflow).toBe('hidden');
    expect(neteasePrimaryGeometry.openOverflow).toBe('visible');
    // The preview keeps an 8px paint margin so row hover shadows are not clipped.
    expect(neteasePrimaryGeometry.topDelta).toBeGreaterThanOrEqual(7);
    expect(neteasePrimaryGeometry.topDelta).toBeLessThanOrEqual(9);
    expect(neteasePrimaryGeometry.bottomDelta).toBeGreaterThanOrEqual(7);
    expect(neteasePrimaryGeometry.bottomDelta).toBeLessThanOrEqual(9);
    expect(neteasePrimaryGeometry.minimumCopyWidth).toBeGreaterThan(90);
    expect(await neteasePrimaryPreview.locator('.netease-discovery-song-row').evaluateAll((rows) => (
      rows.every((row) => {
        const rowBox = row.getBoundingClientRect();
        const parentBox = row.parentElement?.getBoundingClientRect();
        return Boolean(parentBox && rowBox.width > parentBox.width * 0.4);
      })
    ))).toBe(true);
    await expect(discoveryHome.getByText('Homepage Block Smoke Song 1', { exact: true })).toBeVisible();
    await expect(discoveryHome.locator('.netease-discovery-song-row')).toHaveCount(32);
    await expect(discoveryHome.locator('.netease-discovery-daily-songs .netease-discovery-song-row')).toHaveCount(3);
    await expect(
      discoveryHome.locator('.netease-discovery-history-songs .netease-discovery-song-row')
    ).toHaveCount(12);
    await expect(
      discoveryHome.locator('.netease-discovery-homepage-block-songs .netease-discovery-song-row')
    ).toHaveCount(2);
    await expect(discoveryHome.locator('.netease-discovery-new-songs .netease-discovery-song-row')).toHaveCount(12);
    await expect(discoveryHome.locator('.netease-discovery-playlist-card')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-editorial-card')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-chart-card')).toHaveCount(0);
    await expect(discoveryHome.getByRole('heading', { name: '每日推荐' })).toBeVisible();
    await expect(discoveryHome.getByRole('heading', { name: '历史日推' })).toBeVisible();
    await expect(discoveryHome.getByRole('heading', { name: '最新音乐' })).toBeVisible();
    await expect(discoveryHome.getByRole('combobox', { name: '历史日推日期' })).toContainText('2026年7月17日');
    await expect(discoveryHome.getByText('Netease History 1 Song 1', { exact: true })).toBeVisible();
    await expect(discoveryHome.getByRole('button', { name: '播放每日推荐' })).toBeEnabled();
    await expect(discoveryHome.getByRole('button', { name: /暂不可用/ })).toHaveCount(0);
    await expect(discoveryHome.getByText('Netease Latest Song 1', { exact: true })).toBeVisible();
    await expect(discoveryHome.getByRole('button', { name: '打开专辑：Netease Smoke Album', exact: true })).toBeEnabled();
    await expect(discoveryHome.locator('.discovery-new-albums .discovery-album-item')).toHaveCount(8);
    const neteaseFrequentAlbumsSection = discoveryHome
      .getByRole('heading', { name: '常听歌手专辑' })
      .locator('xpath=ancestor::section[1]');
    await expect(neteaseFrequentAlbumsSection).toContainText('欧包音乐 · 基于本地收听记录生成');
    await expect(neteaseFrequentAlbumsSection.locator('.discovery-album-item')).toHaveCount(1);
    await expect(neteaseFrequentAlbumsSection.getByText('网易常听歌手新专', { exact: true })).toBeVisible();
    await expect(discoveryHome.getByText(/歌单补给站|榜单精选|推荐歌单|为你推荐的歌单/)).toHaveCount(0);
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
    await expect.poll(() => readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 1 });
    await expect.poll(() => readReleaseCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 1 });
    await expect.poll(() => readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 1 });
    await expect.poll(() => readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 1, detail: 1 });
    const historySection = discoveryHome.locator('.netease-discovery-history-songs');
    await historySection.evaluate((section) => section.scrollIntoView({ block: 'start' }));
    const historyDateControl = historySection.getByRole('combobox', { name: '历史日推日期' });
    await expectNoNativeOutline(historyDateControl);
    const historyDateControlStyle = await historyDateControl.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        transitionDuration: style.transitionDuration
      };
    });
    expect(historyDateControlStyle.width).toBeCloseTo(156, 1);
    expect(historyDateControlStyle.height).toBeCloseTo(32, 1);
    expect(hasNonZeroTransition(historyDateControlStyle.transitionDuration)).toBe(true);
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-netease-history-${testInfo.project.name}.png`
    });
    await historyDateControl.click();
    await page.getByRole('option', { name: '2026年7月16日' }).click();
    await expect(historySection.getByText('Netease History 2 Song 1', { exact: true })).toBeVisible();
    await expect(historySection.locator('.netease-discovery-song-row')).toHaveCount(4);
    await expect.poll(() => readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 1, detail: 2 });
    await discoveryHome.getByRole('heading', { name: '最新音乐' }).scrollIntoViewIfNeeded();
    await expectDecodedCoverVariety(discoveryHome.locator('.netease-discovery-home img'), 6);
    expect(await discoveryHome.locator('.netease-discovery-feature-card').evaluateAll((cards) => (
      cards.every((card) => getComputedStyle(card).backgroundColor !== 'rgb(236, 65, 65)')
    ))).toBe(true);

    const featureGrid = discoveryHome.locator('.netease-discovery-feature-grid');
    await featureGrid.scrollIntoViewIfNeeded();
    const featureBoxes = await discoveryHome.locator('.netease-discovery-feature-card').evaluateAll((cards) => (
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width };
      })
    ));
    const featureRows = groupLayoutBoxesByRow(featureBoxes);
    expect(featureRows.map((row) => row.length)).toEqual([1]);

    const dailyFeatureCard = discoveryHome.locator('.netease-discovery-feature-card-interactive').first();
    const dailyPreviewSongs = dailyFeatureCard.locator('.netease-discovery-feature-preview-song > span');
    await page.mouse.move(2, 2);
    await page.waitForTimeout(260);
    await expect(dailyPreviewSongs).toHaveText([
      'Wasted (Nightcore) [Bass Boosted]',
      'Spotlight',
      '你 (吉他甜蜜版)'
    ]);
    await expect.poll(() => dailyFeatureCard.evaluate((card) => {
      const style = getComputedStyle(card);
      return Boolean(
        style.getPropertyValue('--netease-feature-primary').trim()
        && style.getPropertyValue('--netease-feature-secondary').trim()
      );
    })).toBe(true);
    const dailyFeatureBeforeHover = await dailyFeatureCard.evaluate((card) => {
      const cardStyle = getComputedStyle(card);
      const artworkImage = card.querySelector<HTMLElement>('.netease-discovery-feature-artwork > img');
      const palette = card.querySelector<HTMLElement>('.netease-discovery-feature-palette');
      const reveal = card.querySelector<HTMLElement>('.netease-discovery-feature-reveal');
      const previewList = card.querySelector<HTMLElement>('.netease-discovery-feature-preview-list');
      if (!artworkImage || !palette || !reveal || !previewList) {
        throw new Error('Interactive daily feature card did not render');
      }
      const cardTransform = cardStyle.transform;
      const artworkTransform = getComputedStyle(artworkImage).transform;
      const revealTransform = getComputedStyle(reveal).transform;
      const cardMatrix = cardTransform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(cardTransform);
      const artworkMatrix = artworkTransform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(artworkTransform);
      const revealMatrix = revealTransform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(revealTransform);
      return {
        cardY: cardMatrix.m42,
        artworkScale: artworkMatrix.a,
        revealY: revealMatrix.m42,
        paletteOpacity: Number.parseFloat(getComputedStyle(palette).opacity),
        previewOpacity: Number.parseFloat(getComputedStyle(previewList).opacity),
        cardTransitionDuration: cardStyle.transitionDuration,
        artworkTransitionDuration: getComputedStyle(artworkImage).transitionDuration,
        revealTransitionDuration: getComputedStyle(reveal).transitionDuration,
        paletteBackground: getComputedStyle(palette).backgroundImage
      };
    });
    expect(dailyFeatureBeforeHover.revealY).toBeGreaterThan(1);
    expect(dailyFeatureBeforeHover.previewOpacity).toBeLessThan(0.1);
    expect(dailyFeatureBeforeHover.paletteBackground).not.toBe('none');
    expect(hasNonZeroTransition(dailyFeatureBeforeHover.cardTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(dailyFeatureBeforeHover.artworkTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(dailyFeatureBeforeHover.revealTransitionDuration)).toBe(true);

    await dailyFeatureCard.hover();
    await expect.poll(() => dailyFeatureCard.locator('.netease-discovery-feature-preview-list').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeGreaterThan(0.95);
    await expect.poll(() => dailyFeatureCard.locator('.netease-discovery-feature-reveal').evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return Math.abs(transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
    })).toBeLessThanOrEqual(0.1);
    const dailyFeatureAfterHover = await dailyFeatureCard.evaluate((card) => {
      const artworkImage = card.querySelector<HTMLElement>('.netease-discovery-feature-artwork > img');
      const palette = card.querySelector<HTMLElement>('.netease-discovery-feature-palette');
      const reveal = card.querySelector<HTMLElement>('.netease-discovery-feature-reveal');
      if (!artworkImage || !palette || !reveal) {
        throw new Error('Interactive daily feature card hover content did not render');
      }
      const cardTransform = getComputedStyle(card).transform;
      const artworkTransform = getComputedStyle(artworkImage).transform;
      const revealTransform = getComputedStyle(reveal).transform;
      return {
        cardY: cardTransform === 'none' ? 0 : new DOMMatrixReadOnly(cardTransform).m42,
        artworkScale: artworkTransform === 'none' ? 1 : new DOMMatrixReadOnly(artworkTransform).a,
        revealY: revealTransform === 'none' ? 0 : new DOMMatrixReadOnly(revealTransform).m42,
        paletteOpacity: Number.parseFloat(getComputedStyle(palette).opacity)
      };
    });
    expect(dailyFeatureAfterHover.cardY).toBeLessThan(-2);
    expect(dailyFeatureAfterHover.artworkScale).toBeGreaterThan(1.02);
    expect(Math.abs(dailyFeatureAfterHover.revealY)).toBeLessThanOrEqual(0.5);
    expect(dailyFeatureAfterHover.paletteOpacity).toBeGreaterThan(dailyFeatureBeforeHover.paletteOpacity);
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-netease-daily-hover-${testInfo.project.name}.png`
    });
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-netease-${testInfo.project.name}.png`
    });
    await neteaseFrequentAlbumsSection.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-netease-frequent-artist-albums-${testInfo.project.name}.png`
    });
    await neteaseFrequentAlbumsSection
      .getByRole('button', { name: '打开专辑：网易常听歌手新专', exact: true })
      .click();
    await expect(discoveryAlbumDetail.getByRole('heading', { name: '网易常听歌手新专', level: 1 }))
      .toBeVisible();
    await page.getByRole('button', { name: '后退' }).click();
    await expect(discoveryHome.locator('.netease-discovery-home')).toBeVisible();
    await waitForMainContentTransition(page);

    await discoveryHome.getByRole('heading', { name: '最新音乐' }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
    await expect(discoveryHome.locator('.netease-discovery-new-songs')).toBeVisible();

    const latestSongGrid = discoveryHome.locator('.netease-discovery-new-songs .netease-discovery-song-grid');
    const latestSongRows = latestSongGrid.locator('.netease-discovery-song-row');
    const latestSongBoxes = await latestSongRows.evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, width: box.width };
    }));
    const songLayoutRows = groupLayoutBoxesByRow(latestSongBoxes);
    const expectedSongColumnCount = testInfo.project.name === 'desktop' ? 3 : 2;
    expect(songLayoutRows.map((row) => row.length)).toEqual(
      Array.from({ length: 12 / expectedSongColumnCount }, () => expectedSongColumnCount)
    );
    const latestSongWidths = latestSongBoxes.map((box) => box.width);
    expect(Math.max(...latestSongWidths) - Math.min(...latestSongWidths)).toBeLessThanOrEqual(1);
    for (const row of songLayoutRows.slice(1)) {
      row.forEach((box, index) => {
        expect(Math.abs(box.left - songLayoutRows[0][index].left)).toBeLessThanOrEqual(1);
      });
    }

    const firstLatestSong = latestSongRows.first().locator('.netease-discovery-song-open');
    await expectNoNativeOutline(firstLatestSong);
    await page.mouse.move(1, 1);
    await expect.poll(() => firstLatestSong.evaluate((button) => (
      Number.parseFloat(getComputedStyle(button, '::before').opacity)
    ))).toBeLessThan(0.05);
    await expect.poll(() => firstLatestSong.evaluate((button) => (
      getComputedStyle(button).boxShadow
    ))).toBe('none');
    const latestSongBeforeHover = await firstLatestSong.evaluate((button) => {
      const style = getComputedStyle(button);
      const surface = getComputedStyle(button, '::before');
      const artwork = button.querySelector<HTMLElement>('.netease-discovery-song-artwork');
      const indicator = button.querySelector<HTMLElement>('.netease-discovery-song-play-indicator');
      if (!artwork || !indicator) {
        throw new Error('Discovery song hover affordances did not render');
      }
      return {
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        boxShadow: style.boxShadow,
        surfaceOpacity: Number.parseFloat(surface.opacity),
        surfaceBackground: surface.backgroundImage,
        indicatorOpacity: Number.parseFloat(getComputedStyle(indicator).opacity),
        buttonTransitionDuration: style.transitionDuration,
        surfaceTransitionDuration: surface.transitionDuration,
        artworkTransitionDuration: getComputedStyle(artwork).transitionDuration,
        indicatorTransitionDuration: getComputedStyle(indicator).transitionDuration
      };
    });
    expect(latestSongBeforeHover.borderWidths).toEqual(['0px', '0px', '0px', '0px']);
    expect(latestSongBeforeHover.boxShadow).toBe('none');
    expect(latestSongBeforeHover.surfaceOpacity).toBeLessThan(0.1);
    expect(latestSongBeforeHover.surfaceBackground).not.toBe('none');
    expect(latestSongBeforeHover.indicatorOpacity).toBeLessThan(0.1);
    expect(hasNonZeroTransition(latestSongBeforeHover.buttonTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(latestSongBeforeHover.surfaceTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(latestSongBeforeHover.artworkTransitionDuration)).toBe(true);
    expect(hasNonZeroTransition(latestSongBeforeHover.indicatorTransitionDuration)).toBe(true);

    await firstLatestSong.hover();
    await expect.poll(() => firstLatestSong.locator('.netease-discovery-song-play-indicator').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeGreaterThan(0.95);
    await expect.poll(() => firstLatestSong.evaluate((button) => (
      Number.parseFloat(getComputedStyle(button, '::before').opacity)
    ))).toBeGreaterThan(0.8);
    const latestSongAfterHover = await firstLatestSong.evaluate((button) => {
      const style = getComputedStyle(button);
      const surface = getComputedStyle(button, '::before');
      const artwork = button.querySelector<HTMLElement>('.netease-discovery-song-artwork');
      const indicator = button.querySelector<HTMLElement>('.netease-discovery-song-play-indicator');
      const title = button.querySelector<HTMLElement>('.netease-discovery-song-copy strong');
      if (!artwork || !indicator || !title) {
        throw new Error('Discovery song hover content did not render');
      }
      const transform = style.transform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(style.transform);
      const artworkTransform = getComputedStyle(artwork).transform;
      const artworkMatrix = artworkTransform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(artworkTransform);
      return {
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
        titleColor: getComputedStyle(title).color,
        buttonY: transform.m42,
        artworkScale: artworkMatrix.a,
        boxShadow: style.boxShadow,
        surfaceOpacity: Number.parseFloat(surface.opacity),
        indicatorOpacity: Number.parseFloat(getComputedStyle(indicator).opacity)
      };
    });
    expect(latestSongAfterHover.borderWidths).toEqual(['0px', '0px', '0px', '0px']);
    expect(latestSongAfterHover.borderColors).not.toContain('rgb(236, 65, 65)');
    expect(latestSongAfterHover.titleColor).not.toBe('rgb(236, 65, 65)');
    expect(latestSongAfterHover.buttonY).toBeCloseTo(0, 2);
    expect(latestSongAfterHover.artworkScale).toBeGreaterThan(1.01);
    expect(latestSongAfterHover.boxShadow).not.toBe('none');
    expect(latestSongAfterHover.surfaceOpacity).toBeGreaterThan(0.8);
    expect(latestSongAfterHover.indicatorOpacity).toBeGreaterThan(0.95);
    await page.screenshot({
      path: `artifacts/ui-checks/discovery-home-netease-song-hover-${testInfo.project.name}.png`
    });

    if (testInfo.project.name === 'desktop') {
      await page.getByRole('button', { name: '主题设置' }).click();
      await page.getByRole('button', { name: '使用黑色显示模式' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '主题设置面板' })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('black');
      await neteaseFrequentAlbumsSection.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-frequent-artist-albums-obsidian-desktop.png'
      });
      await historySection.evaluate((section) => section.scrollIntoView({ block: 'start' }));
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-history-obsidian-desktop.png'
      });
      await neteaseProviderTab.scrollIntoViewIfNeeded();
      await expectMainContentProviderTabContract(neteaseProviderTab);
      await dailyFeatureCard.hover();
      await expect.poll(() => dailyFeatureCard.locator('.netease-discovery-feature-preview-list').evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).opacity)
      ))).toBeGreaterThan(0.95);
      await expect.poll(() => dailyFeatureCard.locator('.netease-discovery-feature-palette').evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).opacity)
      ))).toBeGreaterThan(0.95);
      const darkFeatureState = await dailyFeatureCard.evaluate((card) => {
        const palette = card.querySelector<HTMLElement>('.netease-discovery-feature-palette');
        const reveal = card.querySelector<HTMLElement>('.netease-discovery-feature-reveal');
        if (!palette || !reveal) {
          throw new Error('Dark discovery feature hover content did not render');
        }
        return {
          paletteOpacity: Number.parseFloat(getComputedStyle(palette).opacity),
          paletteBackground: getComputedStyle(palette).backgroundImage,
          revealColor: getComputedStyle(reveal).color.replaceAll(' ', '')
        };
      });
      expect(darkFeatureState.paletteOpacity).toBeGreaterThan(0.95);
      expect(darkFeatureState.paletteBackground).not.toBe('none');
      expect(darkFeatureState.revealColor).toBe('rgb(255,255,255)');
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-obsidian-daily-hover-desktop.png'
      });

      await page.getByRole('button', { name: '设置', exact: true }).click();
      const settings = page.getByRole('dialog', { name: '设置面板' });
      await settings.getByText('减少动态与特效', { exact: true }).click();
      await expect(settings.getByRole('switch', { name: '减少动态与特效' })).toBeChecked();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await expect(settings).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceEffects)).toBe('true');
      await page.mouse.move(900, 28);
      const readReducedFeatureState = () => dailyFeatureCard.evaluate((card) => {
        const cardStyle = getComputedStyle(card);
        const artworkImage = card.querySelector<HTMLElement>('.netease-discovery-feature-artwork > img');
        const reveal = card.querySelector<HTMLElement>('.netease-discovery-feature-reveal');
        const previewList = card.querySelector<HTMLElement>('.netease-discovery-feature-preview-list');
        if (!artworkImage || !reveal || !previewList) {
          throw new Error('Reduced-effects discovery feature content did not render');
        }
        const readTransform = (element: HTMLElement) => {
          const transform = getComputedStyle(element).transform;
          const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
          return { scale: matrix.a, y: matrix.m42 };
        };

        return {
          cardY: readTransform(card).y,
          artworkScale: readTransform(artworkImage).scale,
          reveal: readTransform(reveal),
          preview: {
            ...readTransform(previewList),
            opacity: Number.parseFloat(getComputedStyle(previewList).opacity),
            transitionDuration: getComputedStyle(previewList).transitionDuration
          },
          previewOpacity: Number.parseFloat(getComputedStyle(previewList).opacity),
          cardTransitionDuration: cardStyle.transitionDuration,
          artworkTransitionDuration: getComputedStyle(artworkImage).transitionDuration,
          revealTransitionDuration: getComputedStyle(reveal).transitionDuration
        };
      });

      const reducedFeatureIdleState = await readReducedFeatureState();
      expect(Math.abs(reducedFeatureIdleState.cardY)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureIdleState.artworkScale).toBeCloseTo(1, 3);
      expect(Math.abs(reducedFeatureIdleState.reveal.y)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureIdleState.reveal.scale).toBeCloseTo(1, 3);
      expect(Math.abs(reducedFeatureIdleState.preview.y)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureIdleState.preview.scale).toBeCloseTo(1, 3);
      expect(reducedFeatureIdleState.preview.opacity).toBeLessThan(0.05);

      await dailyFeatureCard.hover();
      await expect.poll(() => dailyFeatureCard.locator('.netease-discovery-feature-preview-list').evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).opacity)
      ))).toBeGreaterThan(0.95);
      const reducedFeatureState = await readReducedFeatureState();
      expect(Math.abs(reducedFeatureState.cardY)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureState.artworkScale).toBeCloseTo(1, 3);
      expect(Math.abs(reducedFeatureState.reveal.y)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureState.reveal.scale).toBeCloseTo(1, 3);
      expect(Math.abs(reducedFeatureState.preview.y)).toBeLessThanOrEqual(0.01);
      expect(reducedFeatureState.preview.scale).toBeCloseTo(1, 3);
      expect(reducedFeatureState.previewOpacity).toBeGreaterThan(0.95);
      expect(hasNonZeroTransition(reducedFeatureState.cardTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedFeatureState.artworkTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedFeatureState.revealTransitionDuration)).toBe(true);
      expect(hasNonZeroTransition(reducedFeatureState.preview.transitionDuration)).toBe(true);
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-reduced-effects-daily-hover-desktop.png'
      });
      await historySection.evaluate((section) => section.scrollIntoView({ block: 'start' }));
      const reducedHistoryDateState = await historyDateControl.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          transitionDuration: style.transitionDuration
        };
      });
      expect(reducedHistoryDateState.width).toBeCloseTo(156, 1);
      expect(reducedHistoryDateState.height).toBeCloseTo(32, 1);
      expect(hasNonZeroTransition(reducedHistoryDateState.transitionDuration)).toBe(false);
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-history-reduced-effects-desktop.png'
      });

      await firstLatestSong.hover();
      await expect.poll(() => firstLatestSong.evaluate((button) => (
        Number.parseFloat(getComputedStyle(button, '::before').opacity)
      ))).toBeGreaterThan(0.8);
      await expect.poll(() => firstLatestSong.locator('.netease-discovery-song-play-indicator').evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).opacity)
      ))).toBeGreaterThan(0.95);
      const reducedSongState = await firstLatestSong.evaluate((button) => {
        const style = getComputedStyle(button);
        const surface = getComputedStyle(button, '::before');
        const artwork = button.querySelector<HTMLElement>('.netease-discovery-song-artwork');
        const indicator = button.querySelector<HTMLElement>('.netease-discovery-song-play-indicator');
        if (!artwork || !indicator) {
          throw new Error('Reduced-effects song feedback did not render');
        }
        const buttonTransform = style.transform;
        const artworkTransform = getComputedStyle(artwork).transform;
        return {
          buttonY: buttonTransform === 'none' ? 0 : new DOMMatrixReadOnly(buttonTransform).m42,
          artworkScale: artworkTransform === 'none' ? 1 : new DOMMatrixReadOnly(artworkTransform).a,
          surfaceOpacity: Number.parseFloat(surface.opacity),
          indicatorOpacity: Number.parseFloat(getComputedStyle(indicator).opacity),
          boxShadow: style.boxShadow,
          buttonTransitionDuration: style.transitionDuration,
          artworkTransitionDuration: getComputedStyle(artwork).transitionDuration,
          indicatorTransitionDuration: getComputedStyle(indicator).transitionDuration
        };
      });
      expect(Math.abs(reducedSongState.buttonY)).toBeLessThanOrEqual(0.01);
      expect(reducedSongState.artworkScale).toBeCloseTo(1, 3);
      expect(reducedSongState.surfaceOpacity).toBeGreaterThan(0.8);
      expect(reducedSongState.indicatorOpacity).toBeGreaterThan(0.95);
      expect(reducedSongState.boxShadow).not.toBe('none');
      expect(hasNonZeroTransition(reducedSongState.buttonTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedSongState.artworkTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedSongState.indicatorTransitionDuration)).toBe(true);
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-netease-reduced-effects-song-hover-desktop.png'
      });

      await qqProviderTab.click();
      await expect(discoveryHome.locator('.qq-discovery-home')).toBeVisible();
      await waitForMainContentTransition(page);
      const reducedQQSong = discoveryHome.locator('.qq-discovery-new-song-open').first();
      await reducedQQSong.hover();
      await expect.poll(() => reducedQQSong.locator('.qq-discovery-new-song-play').evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).opacity)
      ))).toBeGreaterThan(0.95);
      const reducedQQSongState = await reducedQQSong.evaluate((button) => {
        const style = getComputedStyle(button);
        const artwork = button.querySelector<HTMLElement>('.qq-discovery-new-song-artwork');
        const play = button.querySelector<HTMLElement>('.qq-discovery-new-song-play');
        if (!artwork || !play) {
          throw new Error('Reduced-effects QQ new-song feedback did not render');
        }
        const buttonTransform = style.transform;
        const artworkTransform = getComputedStyle(artwork).transform;
        const playTransform = getComputedStyle(play).transform;
        return {
          buttonY: buttonTransform === 'none' ? 0 : new DOMMatrixReadOnly(buttonTransform).m42,
          artworkScale: artworkTransform === 'none' ? 1 : new DOMMatrixReadOnly(artworkTransform).a,
          playScale: playTransform === 'none' ? 1 : new DOMMatrixReadOnly(playTransform).a,
          surfaceOpacity: Number.parseFloat(getComputedStyle(button, '::before').opacity),
          playOpacity: Number.parseFloat(getComputedStyle(play).opacity),
          boxShadow: style.boxShadow,
          buttonTransitionDuration: style.transitionDuration,
          artworkTransitionDuration: getComputedStyle(artwork).transitionDuration,
          playTransitionDuration: getComputedStyle(play).transitionDuration
        };
      });
      expect(Math.abs(reducedQQSongState.buttonY)).toBeLessThanOrEqual(0.01);
      expect(reducedQQSongState.artworkScale).toBeCloseTo(1, 3);
      expect(reducedQQSongState.playScale).toBeCloseTo(1, 3);
      expect(reducedQQSongState.surfaceOpacity).toBeGreaterThan(0.8);
      expect(reducedQQSongState.playOpacity).toBeGreaterThan(0.95);
      expect(reducedQQSongState.boxShadow).not.toBe('none');
      expect(hasNonZeroTransition(reducedQQSongState.buttonTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedQQSongState.artworkTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedQQSongState.playTransitionDuration)).toBe(true);
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-qq-reduced-effects-new-song-hover-desktop.png'
      });

      const reducedQQAlbum = discoveryHome.getByRole('button', {
        name: '打开专辑：QQ 常听歌手新专',
        exact: true
      });
      await reducedQQAlbum.scrollIntoViewIfNeeded();
      await reducedQQAlbum.hover();
      const reducedAlbumState = await reducedQQAlbum.evaluate((button) => {
        const style = getComputedStyle(button);
        const cover = button.querySelector<HTMLElement>('.discovery-album-cover');
        if (!cover) throw new Error('Reduced-effects discovery album cover did not render');
        const image = cover.querySelector<HTMLElement>('.playlist-discovery-card-image');
        const sheen = cover.querySelector<HTMLElement>('.playlist-discovery-card-sheen');
        if (!image || !sheen) throw new Error('Reduced-effects album depth layers did not render');
        const buttonTransform = style.transform;
        const coverTransform = getComputedStyle(cover).transform;
        const imageTransform = getComputedStyle(image).transform;
        return {
          buttonY: buttonTransform === 'none' ? 0 : new DOMMatrixReadOnly(buttonTransform).m42,
          coverScale: coverTransform === 'none' ? 1 : new DOMMatrixReadOnly(coverTransform).a,
          imageScale: imageTransform === 'none' ? 1 : new DOMMatrixReadOnly(imageTransform).a,
          sheenDisplay: getComputedStyle(sheen).display,
          boxShadow: style.boxShadow,
          backgroundColor: style.backgroundColor,
          buttonTransitionDuration: style.transitionDuration,
          coverTransitionDuration: getComputedStyle(cover).transitionDuration
        };
      });
      expect(Math.abs(reducedAlbumState.buttonY)).toBeLessThanOrEqual(0.01);
      expect(reducedAlbumState.coverScale).toBeCloseTo(1, 3);
      expect(reducedAlbumState.imageScale).toBeCloseTo(1, 3);
      expect(reducedAlbumState.sheenDisplay).toBe('none');
      expect(reducedAlbumState.boxShadow).toBe('none');
      expect(reducedAlbumState.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(hasNonZeroTransition(reducedAlbumState.buttonTransitionDuration)).toBe(false);
      expect(hasNonZeroTransition(reducedAlbumState.coverTransitionDuration)).toBe(false);
      await page.screenshot({
        path: 'artifacts/ui-checks/discovery-home-qq-reduced-effects-frequent-artist-album-hover-desktop.png'
      });
    }

    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.getByRole('complementary', { name: '播放队列' });
    await expect(queuePanel).toBeVisible();
    await expect(page.getByText('播放队列为空')).toBeVisible();
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveCount(0, { timeout: 1_000 });

    await neteaseProviderTab.click();
    await expect(discoveryHome.locator('.netease-discovery-home')).toBeVisible();
    await waitForMainContentTransition(page);
    await discoveryHome
      .locator('.netease-discovery-homepage-block-songs .netease-discovery-song-open')
      .first()
      .dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Homepage Block Smoke Song 1');
    await page.locator('.queue-toggle-button').click();
    const populatedQueuePanel = page.locator('.queue-panel');
    await expect(populatedQueuePanel.locator('.queue-row')).toHaveCount(2);
    await expect(populatedQueuePanel).not.toContainText('播放队列为空');
    await expect(populatedQueuePanel.getByText('Homepage Block Smoke Song 1')).toBeVisible();
    await populatedQueuePanel.locator('.queue-heading-actions .icon-button').click();
    await expect(populatedQueuePanel).toHaveCount(0, { timeout: 1_000 });

    await page.getByRole('combobox', { name: '搜索音乐' }).fill('provider smoke');
    await page.getByRole('combobox', { name: '搜索音乐' }).press('Enter');

    await expect(page.getByRole('region', { name: '搜索结果', exact: true })).toBeVisible();
    const smokeResult = page.locator('.search-result-row').filter({ hasText: 'Provider Smoke Song' }).first();
    await expect(smokeResult).toBeVisible();
    await smokeResult.dblclick({ position: { x: 72, y: 20 } });
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Provider Smoke Song');

    await page.getByRole('button', { name: /打开歌词页：/ }).click();
    await expect(page.getByRole('dialog', { name: '歌词详情' })).toBeVisible();
    await expect(page.getByText('Provider smoke lyric')).toBeVisible();
    await page.getByRole('button', { name: '收起歌词页' }).click();
    await expect(page.getByRole('dialog', { name: '歌词详情' })).toHaveCount(0);
  });

  test('keeps the 1210px song layouts on complete aligned rows', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The intermediate viewport is covered once.');
    await page.setViewportSize({ width: 1210, height: 840 });
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });

    await expect(discoveryHome.locator('.qq-discovery-new-songs').getByText('QQ New Song 1', { exact: true })).toBeVisible();
    const qqBoxes = await discoveryHome
      .locator('.qq-discovery-new-songs .qq-discovery-new-song-row')
      .evaluateAll((rows) => (
      rows.map((row) => {
        const box = row.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width };
      })
    ));
    expect(groupLayoutBoxesByRow(qqBoxes).map((row) => row.length)).toEqual([3, 3, 3, 3]);

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await expect(discoveryHome.getByText('Netease Latest Song 1', { exact: true })).toBeVisible();
    const neteaseFeatureGeometry = await discoveryHome.locator('.netease-discovery-feature-grid').evaluate((grid) => {
      const card = grid.querySelector<HTMLElement>('.netease-discovery-feature-card');
      const preview = grid.querySelector<HTMLElement>('.netease-discovery-primary-preview');
      if (!card || !preview) throw new Error('Netease primary recommendation layout did not render');
      return {
        gridWidth: grid.getBoundingClientRect().width,
        cardWidth: card.getBoundingClientRect().width,
        previewWidth: preview.getBoundingClientRect().width,
        cardTop: card.getBoundingClientRect().top,
        previewTop: preview.getBoundingClientRect().top
      };
    });
    expect(neteaseFeatureGeometry.cardWidth).toBeLessThan(neteaseFeatureGeometry.gridWidth * 0.48);
    expect(neteaseFeatureGeometry.previewWidth).toBeGreaterThan(neteaseFeatureGeometry.cardWidth);
    expect(Math.abs(neteaseFeatureGeometry.cardTop - neteaseFeatureGeometry.previewTop)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: 'artifacts/ui-checks/discovery-home-netease-primary-1210.png'
    });
    await discoveryHome.getByRole('heading', { name: '常听歌手专辑' }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
    await expect(discoveryHome.locator('.discovery-frequent-artist-albums .discovery-album-item'))
      .toHaveCount(1);
    await page.screenshot({
      path: 'artifacts/ui-checks/discovery-home-netease-frequent-artist-albums-1210.png'
    });
    await discoveryHome.getByRole('heading', { name: '历史日推' }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
    const historyBoxes = await discoveryHome
      .locator('.netease-discovery-history-songs .netease-discovery-song-row')
      .evaluateAll((rows) => rows.map((row) => {
        const box = row.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width };
      }));
    expect(groupLayoutBoxesByRow(historyBoxes).map((row) => row.length)).toEqual([2, 2, 2, 2, 2, 2]);
    await page.screenshot({
      path: 'artifacts/ui-checks/discovery-home-netease-history-1210.png'
    });
    await discoveryHome.getByRole('heading', { name: '最新音乐' }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
    const neteaseBoxes = await discoveryHome
      .locator('.netease-discovery-new-songs .netease-discovery-song-row')
      .evaluateAll((rows) => rows.map((row) => {
        const box = row.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width };
      }));
    const neteaseRows = groupLayoutBoxesByRow(neteaseBoxes);
    expect(neteaseRows.map((row) => row.length)).toEqual([2, 2, 2, 2, 2, 2]);
    for (const row of neteaseRows.slice(1)) {
      expect(Math.abs(row[0].left - neteaseRows[0][0].left)).toBeLessThanOrEqual(1);
      expect(Math.abs(row[1].left - neteaseRows[0][1].left)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({
      path: 'artifacts/ui-checks/discovery-home-netease-latest-1210.png'
    });
  });

  test('refreshes only the selected provider without bypassing artist cache or requesting discovery catalogs', async ({ page }) => {
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    await expect(discoveryHome.locator('.qq-discovery-new-songs').getByText('QQ New Song 1', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHome') ?? '0',
      10
    ))).toBe(1);
    expect(await readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 0 });
    expect(await readReleaseCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    await expect.poll(() => readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    await discoveryHome.getByRole('button', { name: '刷新发现音乐' }).click();
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHome') ?? '0',
      10
    ))).toBe(2);
    await expect.poll(() => readReleaseCatalogRequestCounts(page)).toEqual({ qq: 2, netease: 0 });
    expect(await readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 0 });
    expect(await readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 0 });
    expect(await readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 0, detail: 0 });

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await expect(discoveryHome.getByText('Netease Latest Song 1', { exact: true })).toBeVisible();
    await expect(discoveryHome.getByText('Homepage Block Smoke Song 1', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHome') ?? '0',
      10
    ))).toBe(3);
    await expect.poll(() => readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 1 });
    await expect.poll(() => readReleaseCatalogRequestCounts(page)).toEqual({ qq: 2, netease: 1 });
    await expect.poll(() => readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 1 });
    await expect.poll(() => readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 1, detail: 1 });

    await discoveryHome.getByRole('button', { name: '刷新发现音乐' }).click();
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getRecommendationHome') ?? '0',
      10
    ))).toBe(4);
    await expect.poll(() => readHomepageBlockRequestCounts(page)).toEqual({ qq: 0, netease: 2 });
    await expect.poll(() => readReleaseCatalogRequestCounts(page)).toEqual({ qq: 2, netease: 2 });
    expect(await readArtistCatalogRequestCounts(page)).toEqual({ qq: 1, netease: 1 });
    await expect.poll(() => readRecommendationHistoryRequestCounts(page)).toEqual({ dates: 2, detail: 2 });
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
    await expect(discoveryHome.locator('.netease-discovery-playlist-card')).toHaveCount(0);
    await expect(discoveryHome.locator('.netease-discovery-chart-card')).toHaveCount(0);
  });

  test('keeps history loading and date switching queue-stable until an explicit song double-click', async ({ page }) => {
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    await discoveryHome.getByRole('button', {
      name: '播放歌曲：QQ New Song 1 - Smoke Artist',
      exact: true
    }).dblclick();
    const queueToggle = page.getByRole('button', { name: '展开播放队列' });
    await queueToggle.click();
    const queuePanel = page.getByRole('complementary', { name: '播放队列' });
    await expect(queuePanel.locator('.queue-row')).toHaveCount(12);
    const queueBeforeHistory = await queuePanel.locator('.queue-row').allTextContents();
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await waitForMainContentTransition(page);
    const historySection = discoveryHome.locator('.netease-discovery-history-songs');
    await expect(historySection.getByText('Netease History 1 Song 1', { exact: true })).toBeVisible();
    await queueToggle.click();
    expect(await queuePanel.locator('.queue-row').allTextContents()).toEqual(queueBeforeHistory);
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();

    await historySection.getByRole('combobox', { name: '历史日推日期' }).click();
    await page.getByRole('option', { name: '2026年7月16日' }).click();
    await expect(historySection.getByText('Netease History 2 Song 1', { exact: true })).toBeVisible();
    await queueToggle.click();
    expect(await queuePanel.locator('.queue-row').allTextContents()).toEqual(queueBeforeHistory);
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();

    await historySection.getByRole('button', {
      name: '播放歌曲：Netease History 2 Song 1 - History Artist 1'
    }).dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease History 2 Song 1');
    await queueToggle.click();
    await expect(queuePanel.locator('.queue-row')).toHaveCount(4);
    await expect(queuePanel.locator('.queue-row').first()).toContainText('Netease History 2 Song 1');
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
  });

  test('retries only a failed Netease daily section without mutating the queue', async ({ page }) => {
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    await discoveryHome.getByRole('button', {
      name: '播放歌曲：QQ New Song 1 - Smoke Artist',
      exact: true
    }).dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'QQ New Song 1');

    const queueToggle = page.getByRole('button', { name: '展开播放队列' });
    await queueToggle.click();
    const queuePanel = page.getByRole('complementary', { name: '播放队列' });
    await expect(queuePanel.locator('.queue-row')).toHaveCount(12);
    const queueSnapshot = await queuePanel.locator('.queue-row').allTextContents();
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await waitForMainContentTransition(page);
    const dailySection = discoveryHome.locator('.netease-discovery-daily-songs');
    const newSection = discoveryHome.locator('.netease-discovery-new-songs');
    await expect(dailySection.getByText('Wasted (Nightcore) [Bass Boosted]', { exact: true })).toBeVisible();
    await expect(newSection.getByText('Netease Latest Song 1', { exact: true })).toBeVisible();

    await page.evaluate(() => {
      window.sessionStorage.setItem('provider-smoke:failDailyOnce', 'true');
    });
    await dailySection.getByRole('button', { name: '刷新每日推荐' }).click();

    await expect(dailySection.getByRole('alert')).toHaveText('网易云每日推荐加载失败');
    await expect(dailySection.getByText('Wasted (Nightcore) [Bass Boosted]', { exact: true })).toBeVisible();
    await expect(dailySection.getByRole('button', { name: '重试每日推荐' })).toBeEnabled();
    await expect(newSection.getByText('Netease Latest Song 1', { exact: true })).toBeVisible();
    await expect(newSection.getByRole('alert')).toHaveCount(0);
    await expect(newSection.getByRole('button', { name: '刷新最新音乐' })).toBeEnabled();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'QQ New Song 1');

    await dailySection.getByRole('button', { name: '重试每日推荐' }).click();
    await expect(dailySection.getByRole('alert')).toHaveCount(0);
    await expect(dailySection.getByRole('button', { name: '刷新每日推荐' })).toBeEnabled();
    await expect(dailySection.getByText('Wasted (Nightcore) [Bass Boosted]', { exact: true })).toBeVisible();

    await queueToggle.click();
    const reopenedQueue = page.getByRole('complementary', { name: '播放队列' });
    await expect.poll(() => reopenedQueue.locator('.queue-row').allTextContents()).toEqual(queueSnapshot);
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
  });

  test('keeps unavailable service entries removed and starts both providers song playback', async ({ page }) => {
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    await expect(discoveryHome.locator('.qq-discovery-service-card')).toHaveCount(0);
    await expect(discoveryHome.getByRole('button', { name: /暂不可用/ })).toHaveCount(0);
    const qqSong = discoveryHome.getByRole('button', {
      name: '播放歌曲：QQ New Song 1 - Smoke Artist',
      exact: true
    });
    const nowPlayingTitle = page.locator('.now-playing strong');
    const titleBeforeQQSongClick = await nowPlayingTitle.getAttribute('title');
    await qqSong.click();
    await expect.poll(() => nowPlayingTitle.getAttribute('title')).toBe(titleBeforeQQSongClick);
    await qqSong.dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'QQ New Song 1');

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await waitForMainContentTransition(page);
    await discoveryHome.getByRole('button', { name: '播放每日推荐' }).click();
    await expect(page.locator('.now-playing strong')).toHaveAttribute(
      'title',
      'Wasted (Nightcore) [Bass Boosted]'
    );

    const neteaseSong = discoveryHome.getByRole('button', {
      name: '播放歌曲：Netease Latest Song 1 - Netease Smoke Artist'
    });
    await neteaseSong.click();
    await expect(page.locator('.now-playing strong')).toHaveAttribute(
      'title',
      'Wasted (Nightcore) [Bass Boosted]'
    );
    await neteaseSong.dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Latest Song 1');
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
  });

  test('separates recommendation open and play actions and applies cover ambience across detail views', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Detail ambience is covered once at desktop size.');
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });

    await discoveryHome.getByRole('button', { name: '播放新歌推荐' }).click();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'QQ New Song 1');
    const queueToggle = page.getByRole('button', { name: '展开播放队列' });
    await queueToggle.click();
    const queue = page.getByRole('complementary', { name: '播放队列' });
    await expect(queue.locator('.queue-row')).toHaveCount(12);
    const queueSnapshot = await queue.locator('.queue-row').allTextContents();
    await queue.getByRole('button', { name: '收起播放队列' }).click();

    await discoveryHome.getByRole('button', { name: '打开新歌推荐' }).click();
    await expect(page.getByRole('region', { name: '推荐集合详情' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新歌推荐', level: 1 })).toBeVisible();
    await waitForMainContentTransition(page);
    await queueToggle.click();
    expect(await queue.locator('.queue-row').allTextContents()).toEqual(queueSnapshot);
    await queue.getByRole('button', { name: '收起播放队列' }).click();

    const shell = page.locator('.desktop-shell');
    const contentFrame = shell.locator('.content-frame');
    await expect(shell).toHaveAttribute('data-detail-ambient', 'true');
    await expect(shell.locator(':scope > .detail-ambient-backdrop')).toHaveCount(2);
    await expect(shell.locator('.detail-ambient-backdrop-active')).toHaveCount(1);
    await expect.poll(() => shell.locator('.detail-ambient-backdrop-active').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeGreaterThan(0.95);

    await page.getByRole('button', { name: '歌单广场', exact: true }).click();
    const discoveryView = page.getByRole('region', { name: '歌单广场' });
    await discoveryView.getByRole('button', { name: '打开歌单：QQ Discovery Smoke' }).click();
    await expect(page.getByRole('region', { name: '歌单详情' })).toBeVisible();
    await waitForMainContentTransition(page);
    await expect(shell).toHaveAttribute('data-detail-ambient', 'true');
    await expect(shell.locator('.detail-ambient-backdrop-active')).toHaveCount(1);
    await expect.poll(() => shell.locator('.detail-ambient-backdrop-active').evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).opacity)
    ))).toBeGreaterThan(0.95);
    const ambientStyle = await shell.locator('.detail-ambient-backdrop-active').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        opacity: style.opacity,
        parentClass: element.parentElement?.className
      };
    });
    expect(ambientStyle.backgroundImage).toContain('linear-gradient');
    expect(Number.parseFloat(ambientStyle.opacity)).toBeGreaterThan(0.95);
    expect(ambientStyle.parentClass).toContain('desktop-shell');
    await expect(page.locator('.playlist-detail-song-row')).toHaveCount(1);

    const ambientTokenColors = await readResolvedThemeTokenColors(page, [
      '--qq-hover',
      '--qq-nav-hover',
      '--qq-nav-active',
      '--qq-song-hover',
      '--qq-primary-action',
      '--app-scrollbar-track'
    ]);
    expect(ambientTokenColors['--qq-hover']).not.toEqual([245, 222, 222, 255]);
    expect(ambientTokenColors['--qq-primary-action']).not.toEqual([207, 52, 52, 255]);
    expect(new Set(Object.values(ambientTokenColors).map((color) => color.join(','))).size).toBeGreaterThan(3);

    const themeTrigger = page.locator('.theme-trigger');
    const ambientRow = page.locator('.playlist-detail-song-row');
    const ambientPlayButton = page.locator('.playlist-detail-play-button');
    const ambientScrollbar = page.locator('.song-list-visual-scrollbar');
    await themeTrigger.hover();
    await expect.poll(() => themeTrigger.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
    await ambientRow.hover();
    await expect.poll(() => ambientRow.evaluate((element) => getComputedStyle(element, '::before').backgroundImage)).toContain('linear-gradient');
    await page.screenshot({
      path: 'artifacts/ui-checks/playlist-detail-ambient-row-hover-desktop.png'
    });
    await ambientPlayButton.hover();
    await expect.poll(() => ambientPlayButton.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
    expect(await ambientScrollbar.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

    await themeTrigger.click();
    const themePopover = page.locator('.theme-popover');
    await expect(themePopover).toBeVisible();
    const portalTokenColors = await readResolvedThemeTokenColors(
      page,
      ['--qq-hover', '--qq-primary-action'],
      '.theme-popover'
    );
    expect(portalTokenColors).toEqual({
      '--qq-hover': ambientTokenColors['--qq-hover'],
      '--qq-primary-action': ambientTokenColors['--qq-primary-action']
    });
    await page.keyboard.press('Escape');
    await expect(themePopover).toHaveCount(0);

    await page.screenshot({
      path: 'artifacts/ui-checks/playlist-detail-content-ambient-desktop.png'
    });
    const ambientChrome = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ambient surface: ${selector}`);
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backdropFilter: style.backdropFilter
        };
      };

      return {
        sidebar: read('.desktop-shell > .sidebar'),
        content: read('.desktop-shell > .content-frame'),
        player: read('.desktop-shell > .player-bar'),
        topBar: read('.top-bar'),
        hero: read('.playlist-detail-hero-shell')
      };
    });
    expect(new Set([
      ambientChrome.sidebar.backgroundImage,
      ambientChrome.content.backgroundImage,
      ambientChrome.player.backgroundImage
    ]).size).toBe(1);
    expect(ambientChrome.sidebar.backdropFilter).toContain('blur(24px)');
    expect(ambientChrome.content.backdropFilter).toContain('blur(24px)');
    expect(ambientChrome.player.backdropFilter).toContain('blur(24px)');
    expect(ambientChrome.topBar.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(ambientChrome.topBar.backgroundImage).toBe('none');
    expect(ambientChrome.topBar.backdropFilter).toBe('none');
    expect(ambientChrome.hero.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(ambientChrome.hero.backgroundImage).toBe('none');

    await queueToggle.click();
    await expect(queue).toBeVisible();
    await expect.poll(() => queue.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
    const queueMaterial = await queue.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backdropFilter: style.backdropFilter
      };
    });
    expect(queueMaterial.backgroundImage).toContain('linear-gradient');
    expect(queueMaterial.backdropFilter).toContain('blur(24px)');
    await page.screenshot({
      path: 'artifacts/ui-checks/playlist-detail-ambient-queue-desktop.png'
    });
    await queue.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queue).toHaveCount(0);

    await page.getByRole('button', { name: '主题设置' }).click();
    await page.getByRole('button', { name: '使用黑色显示模式' }).click();
    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-detail-ambient', 'true');
    await expect(shell.locator('.detail-ambient-backdrop-active')).toHaveCount(1);
  });

  test('loads current Netease song recommendations lazily without mutating the queue', async ({ page }, testInfo) => {
    const discoveryHome = page.getByRole('region', { name: '发现音乐' });
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getSimilarSongs') ?? '0',
      10
    ))).toBe(0);

    await discoveryHome.getByRole('button', { name: '网易云音乐' }).click();
    await waitForMainContentTransition(page);
    await discoveryHome.getByRole('button', {
      name: '播放歌曲：Netease Latest Song 1 - Netease Smoke Artist'
    }).dblclick();
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Latest Song 1');

    const queueToggle = page.getByRole('button', { name: '展开播放队列' });
    await queueToggle.click();
    const queuePanel = page.getByRole('complementary', { name: '播放队列' });
    await expect(queuePanel).toBeVisible();
    const queueSnapshot = await queuePanel.locator('.queue-row').allTextContents();
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveCount(0, { timeout: 1_000 });

    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getSimilarSongs') ?? '0',
      10
    ))).toBe(0);
    await page.getByRole('button', {
      name: '打开当前歌曲相似推荐：Netease Latest Song 1'
    }).click();

    const similarPanel = page.getByRole('complementary', { name: '当前歌曲相似推荐' });
    await expect(similarPanel).toBeVisible();
    await expect(similarPanel.getByText('Netease Similar Song 1', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Number.parseInt(
      window.sessionStorage.getItem('provider-smoke:getSimilarSongs') ?? '0',
      10
    ))).toBe(1);
    await expect.poll(() => similarPanel.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Latest Song 1');
    expect(await readDiscoveryCatalogRequestCounts(page)).toEqual({
      charts: 0,
      chartTracks: 0,
      discoveredPlaylists: 0
    });
    await page.screenshot({
      path: `artifacts/ui-checks/current-song-similar-${testInfo.project.name}.png`
    });

    await queueToggle.click();
    await expect(similarPanel).toHaveAttribute('data-state', 'closed');
    const reopenedQueue = page.getByRole('complementary', { name: '播放队列' });
    await expect(reopenedQueue).toBeVisible();
    await expect.poll(() => reopenedQueue.locator('.queue-row').allTextContents()).toEqual(queueSnapshot);
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Latest Song 1');
  });

  test('browses both chart providers through detail playback and history', async ({ page }, testInfo) => {
    const discoverySourceTab = page
      .getByRole('region', { name: '发现音乐' })
      .getByRole('button', { name: 'QQ 音乐' });
    await expect(discoverySourceTab).toBeVisible();
    const discoverySourceGeometry = await readMainContentControlGeometry(discoverySourceTab);
    await page.getByRole('button', { name: '排行榜', exact: true }).click();
    const chartsView = page.getByRole('region', { name: '排行榜', exact: true });
    await expect(chartsView).toBeVisible();
    await expect(chartsView.getByRole('button', { name: '打开榜单：QQ Smoke Chart' })).toBeVisible();
    await expect(chartsView.locator('.chart-card')).toHaveCount(8);
    await waitForMainContentTransition(page);
    const chartsSourceTab = chartsView.getByRole('button', { name: 'QQ 音乐' });
    await expectMainContentProviderTabContract(chartsSourceTab);
    expect(await readMainContentControlGeometry(chartsSourceTab)).toEqual(discoverySourceGeometry);

    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.main-content');
      const header = document.querySelector<HTMLElement>('.provider-page-header');
      const firstCover = document.querySelector<HTMLElement>('.chart-card-cover');
      const lastCard = document.querySelector<HTMLElement>('.chart-card:last-child');
      const player = document.querySelector<HTMLElement>('.player-bar');
      if (!main || !header || !firstCover || !lastCard || !player) {
        throw new Error('Charts layout did not render');
      }

      const headerBox = header.getBoundingClientRect();
      const coverBox = firstCover.getBoundingClientRect();
      const lastCardBox = lastCard.getBoundingClientRect();
      const playerBox = player.getBoundingClientRect();
      return {
        horizontalOverflow: main.scrollWidth - main.clientWidth,
        headerBottom: headerBox.bottom,
        firstCoverTop: coverBox.top,
        coverWidth: coverBox.width,
        coverHeight: coverBox.height,
        lastCardBottom: lastCardBox.bottom,
        playerTop: playerBox.top
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(chartsView.locator('.catalog-sticky-chrome')).toHaveCount(0);
    expect(layout.firstCoverTop).toBeGreaterThan(layout.headerBottom);
    expect(layout.coverWidth).toBeGreaterThan(100);
    expect(Math.abs(layout.coverWidth - layout.coverHeight)).toBeLessThanOrEqual(1);
    expect(layout.lastCardBottom).toBeLessThanOrEqual(layout.playerTop);

    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.locator('.queue-panel');
    await expect(queuePanel).toBeVisible();
    const persistentChrome = await page.evaluate(() => {
      const selectors = ['.player-bar', '.queue-panel'];
      return selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          throw new Error(`Missing persistent chrome surface: ${selector}`);
        }

        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backdropFilter: style.backdropFilter
        };
      });
    });
    expect(new Set(persistentChrome.map((surface) => surface.backgroundColor)).size).toBe(1);
    for (const surface of persistentChrome) {
      expect(surface.backgroundImage).toContain('linear-gradient');
      expect(surface.backdropFilter).toContain('blur(24px)');
    }
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveCount(0);

    await page.screenshot({
      path: `artifacts/ui-checks/charts-${testInfo.project.name}.png`
    });

    await chartsView.getByRole('button', { name: '网易云音乐' }).click();
    await expect(chartsView.getByRole('button', { name: '打开榜单：Netease Smoke Chart' })).toBeVisible();
    await chartsView.getByRole('button', { name: '打开榜单：Netease Smoke Chart' }).click();

    const detail = page.getByRole('region', { name: '排行榜详情' });
    await expect(detail).toBeVisible();
    const detailSong = detail.locator('.playlist-detail-song-row').filter({ hasText: 'Netease Chart Smoke Song' });
    await expect(detailSong).toBeVisible();
    await detailSong.dblclick({ position: { x: 72, y: 20 } });
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Chart Smoke Song');

    await page.getByRole('button', { name: '后退' }).click();
    await expect(chartsView).toBeVisible();
    await expect(chartsView.getByRole('button', { name: '网易云音乐' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps one active page while preserving lightweight page motion', async ({ page }) => {
    await page.getByRole('button', { name: '排行榜', exact: true }).click();
    const chartsView = page.getByRole('region', { name: '排行榜', exact: true });
    await expect(chartsView.locator('.chart-card')).toHaveCount(8);
    await waitForMainContentTransition(page);

    const samples = await page.getByRole('button', { name: '发现音乐', exact: true }).evaluate(async (button) => {
      const frames: Array<{
        activeBottom: number;
        activeFilter: string;
        activeHasCharts: boolean;
        activeHasHome: boolean;
        activeOpacity: number;
        activeTransform: string;
        layerCount: number;
        outgoingExists: boolean;
        stageBottom: number;
      }> = [];
      const startedAt = performance.now();

      (button as HTMLButtonElement).click();
      while (performance.now() - startedAt < 650) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const stage = document.querySelector<HTMLElement>('[data-testid="main-content-transition"]');
        if (!stage || stage.dataset.transitionKey !== 'home') {
          continue;
        }

        const active = stage.querySelector<HTMLElement>(':scope > .main-content-transition-layer-active');
        const outgoing = stage.querySelector<HTMLElement>(':scope > .main-content-transition-layer-outgoing');
        const activeContent = active?.querySelector<HTMLElement>(':scope > .main-content-transition-content');
        if (!active || !activeContent) {
          continue;
        }

        const stageBox = stage.getBoundingClientRect();
        const activeBox = active.getBoundingClientRect();
        const activeStyle = getComputedStyle(activeContent);
        frames.push({
          activeBottom: activeBox.bottom,
          activeFilter: activeStyle.filter,
          activeHasCharts: Boolean(active.querySelector('.charts-view')),
          activeHasHome: Boolean(active.querySelector('.discovery-home')),
          activeOpacity: Number.parseFloat(activeStyle.opacity),
          activeTransform: activeStyle.transform,
          layerCount: stage.querySelectorAll(':scope > .main-content-transition-layer').length,
          outgoingExists: Boolean(outgoing),
          stageBottom: stageBox.bottom
        });
      }

      return frames;
    });

    expect(samples.length).toBeGreaterThan(8);
    expect(samples.every((sample) => sample.activeHasHome && !sample.activeHasCharts)).toBe(true);
    expect(samples.every((sample) => sample.layerCount === 1 && !sample.outgoingExists)).toBe(true);
    expect(samples.every((sample) => sample.activeFilter === 'none')).toBe(true);
    for (const sample of samples) {
      expect(sample.activeBottom).toBeGreaterThanOrEqual(sample.stageBottom - 1);
    }
    expect(new Set(samples.map((sample) => sample.activeOpacity.toFixed(2))).size).toBeGreaterThan(2);
    expect(samples.some((sample) => sample.activeTransform !== 'none')).toBe(true);
    await expect(page.getByRole('main', { name: '首页内容' })).toBeVisible();
  });

  test('browses playlist categories, paginates, and opens provider-bound details', async ({ page }, testInfo) => {
    const discoverySourceTab = page
      .getByRole('region', { name: '发现音乐' })
      .getByRole('button', { name: 'QQ 音乐' });
    await expect(discoverySourceTab).toBeVisible();
    const discoverySourceGeometry = await readMainContentControlGeometry(discoverySourceTab);
    const discoveryRefresh = page.locator('.discovery-home-header .provider-page-refresh');
    await expect(discoveryRefresh).toBeVisible();
    const discoveryRefreshGeometry = await readMainContentControlGeometry(discoveryRefresh);
    expect(discoveryRefreshGeometry).toEqual({
      borderRadius: discoverySourceGeometry.borderRadius,
      height: 34,
      width: 34
    });
    await discoveryRefresh.hover();
    expect(await readMainContentControlGeometry(discoveryRefresh)).toEqual(discoveryRefreshGeometry);
    await page.getByRole('button', { name: '歌单广场', exact: true }).click();
    const discoveryView = page.getByRole('region', { name: '歌单广场' });
    await expect(discoveryView).toBeVisible();
    await expect(discoveryView.getByRole('button', { name: '打开歌单：QQ Discovery Smoke' })).toBeVisible();
    await expect(discoveryView.locator('.playlist-discovery-card')).toHaveCount(12);
    await waitForMainContentTransition(page);
    const playlistSourceTab = discoveryView.getByRole('button', { name: 'QQ 音乐' });
    expect(await readMainContentControlGeometry(playlistSourceTab)).toEqual(discoverySourceGeometry);
    const providerRefresh = discoveryView.locator('.provider-page-refresh');
    const providerRefreshGeometry = await readMainContentControlGeometry(providerRefresh);
    expect(providerRefreshGeometry).toEqual({
      borderRadius: discoverySourceGeometry.borderRadius,
      height: 34,
      width: 34
    });
    await providerRefresh.hover();
    expect(await readMainContentControlGeometry(providerRefresh)).toEqual(providerRefreshGeometry);

    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.main-content-playlist-discovery');
      const header = document.querySelector<HTMLElement>('.provider-page-header');
      const categorySwitcher = document.querySelector<HTMLElement>('.playlist-discovery-category-switcher');
      const firstCover = document.querySelector<HTMLElement>('.playlist-discovery-card-cover');
      const firstCard = document.querySelector<HTMLElement>('.playlist-discovery-card');
      const player = document.querySelector<HTMLElement>('.player-bar');
      if (!main || !header || !categorySwitcher || !firstCover || !firstCard || !player) {
        throw new Error('Playlist discovery layout did not render');
      }

      const headerBox = header.getBoundingClientRect();
      const categorySwitcherBox = categorySwitcher.getBoundingClientRect();
      const coverBox = firstCover.getBoundingClientRect();
      const cardBox = firstCard.getBoundingClientRect();
      const playerBox = player.getBoundingClientRect();
      return {
        horizontalOverflow: main.scrollWidth - main.clientWidth,
        categoryHeight: categorySwitcherBox.height,
        headerBottom: headerBox.bottom,
        categoryTop: categorySwitcherBox.top,
        categoryBottom: categorySwitcherBox.bottom,
        coverTop: coverBox.top,
        coverWidth: coverBox.width,
        coverHeight: coverBox.height,
        firstCardBottom: cardBox.bottom,
        playerTop: playerBox.top
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(discoveryView.locator('.catalog-sticky-chrome')).toHaveCount(0);
    expect(layout.categoryHeight).toBeGreaterThan(0);
    expect(layout.categoryTop).toBeGreaterThanOrEqual(layout.headerBottom);
    expect(layout.coverTop).toBeGreaterThan(layout.categoryBottom);
    expect(layout.coverWidth).toBeGreaterThan(120);
    expect(Math.abs(layout.coverWidth - layout.coverHeight)).toBeLessThanOrEqual(1);
    expect(layout.firstCardBottom).toBeLessThanOrEqual(layout.playerTop);
    const shortcuts = discoveryView.getByRole('group', { name: '常用歌单分类' });
    await expect(shortcuts).toBeVisible();
    const allCategory = shortcuts.getByRole('button', { name: '全部' });
    await expect(allCategory).toBeVisible();
    expect((await readMainContentControlGeometry(allCategory)).borderRadius)
      .toBe(discoverySourceGeometry.borderRadius);
    await discoveryView.getByRole('button', { name: '全部分类' }).click();
    const categoryMenu = discoveryView.getByRole('dialog', { name: '全部歌单分类' });
    await expect(categoryMenu).toBeVisible();
    await expect(categoryMenu.getByRole('group', { name: '精选' })).toBeVisible();
    await expect(categoryMenu.getByRole('group', { name: '热门' })).toBeVisible();
    await categoryMenu.evaluate(async (menu) => {
      await Promise.all(menu.getAnimations().map((animation) => animation.finished));
    });
    const categoryMenuGeometry = await categoryMenu.evaluate((menu) => {
      const options = menu.querySelectorAll<HTMLElement>('.playlist-discovery-category-menu-option');
      const menuRect = menu.getBoundingClientRect();
      const firstRect = options.item(0).getBoundingClientRect();
      const lastRect = options.item(options.length - 1).getBoundingClientRect();
      return {
        borderRadius: getComputedStyle(menu).borderRadius,
        firstTop: firstRect.top,
        lastBottom: lastRect.bottom,
        menuBottom: menuRect.bottom,
        menuTop: menuRect.top,
        overflow: menu.scrollHeight - menu.clientHeight
      };
    });
    expect(categoryMenuGeometry.borderRadius).toBe('8px');
    expect(categoryMenuGeometry.overflow).toBeLessThanOrEqual(1);
    expect(categoryMenuGeometry.firstTop).toBeGreaterThanOrEqual(categoryMenuGeometry.menuTop);
    expect(categoryMenuGeometry.lastBottom).toBeLessThanOrEqual(categoryMenuGeometry.menuBottom);
    await page.screenshot({
      path: `artifacts/ui-checks/playlist-discovery-menu-${testInfo.project.name}.png`
    });
    await page.keyboard.press('Escape');
    await expect(categoryMenu).toHaveCount(0);
    await expect(discoveryView.locator('.playlist-discovery-category-menu')).toHaveCount(0);

    const firstScene = discoveryView.locator('.playlist-discovery-card-scene').first();
    const firstSceneBox = await firstScene.boundingBox();
    if (!firstSceneBox) {
      throw new Error('Playlist discovery depth scene did not render');
    }
    await page.mouse.move(firstSceneBox.x + firstSceneBox.width - 12, firstSceneBox.y + 18);
    await expect.poll(() => firstScene.evaluate((scene) => (
      (scene as HTMLElement).style.getPropertyValue('--playlist-card-rotate-y')
    ))).not.toBe('0deg');
    const hoverMaterial = await firstScene.evaluate((scene) => {
      const shell = scene.closest<HTMLElement>('.playlist-discovery-grid-shell');
      const localTransitionStage = shell?.closest<HTMLElement>('.main-content-transition-stage');
      const mainTransitionStage = document.querySelector<HTMLElement>(
        '.main-content-playlist-discovery > .main-content-transition-stage'
      );
      return {
        rotateX: (scene as HTMLElement).style.getPropertyValue('--playlist-card-rotate-x'),
        rotateY: (scene as HTMLElement).style.getPropertyValue('--playlist-card-rotate-y'),
        shadow: getComputedStyle(scene).boxShadow,
        shellOverflow: shell ? getComputedStyle(shell).overflow : '',
        localTransitionContain: localTransitionStage ? getComputedStyle(localTransitionStage).contain : '',
        mainTransitionContain: mainTransitionStage ? getComputedStyle(mainTransitionStage).contain : ''
      };
    });
    expect(hoverMaterial.rotateX).not.toBe('0deg');
    expect(hoverMaterial.rotateY).not.toBe('0deg');
    expect(hoverMaterial.shadow).not.toBe('none');
    expect(hoverMaterial.shellOverflow).toBe('visible');
    expect(hoverMaterial.localTransitionContain).not.toContain('paint');
    expect(hoverMaterial.mainTransitionContain).not.toContain('paint');

    await page.screenshot({
      path: `artifacts/ui-checks/playlist-discovery-hover-${testInfo.project.name}.png`
    });

    const stableCardOffsets = await discoveryView.locator('.playlist-discovery-card').evaluateAll((cards) => (
      cards.map((card) => ({ left: (card as HTMLElement).offsetLeft, top: (card as HTMLElement).offsetTop }))
    ));

    const loadMore = discoveryView.getByRole('button', { name: '加载更多歌单' });
    await loadMore.scrollIntoViewIfNeeded();
    await loadMore.click();
    await expect(discoveryView.locator('.playlist-discovery-card')).toHaveCount(24);
    const appendedCardOffsets = await discoveryView.locator('.playlist-discovery-card').evaluateAll((cards) => (
      cards.slice(0, 12).map((card) => ({
        left: (card as HTMLElement).offsetLeft,
        top: (card as HTMLElement).offsetTop
      }))
    ));
    expect(appendedCardOffsets).toEqual(stableCardOffsets);

    const discoveryChromeMarker = `${testInfo.project.name}-discovery-chrome`;
    const providerSwitchScrollTop = await page.evaluate((marker) => {
      const main = document.querySelector<HTMLElement>('.main-content-playlist-discovery');
      const header = document.querySelector<HTMLElement>('.provider-page-header');
      if (!main || !header) {
        throw new Error('Playlist discovery chrome is unavailable');
      }

      header.dataset.stabilityMarker = marker;
      main.scrollTop = Math.min(260, main.scrollHeight - main.clientHeight);
      return main.scrollTop;
    }, discoveryChromeMarker);
    expect(providerSwitchScrollTop).toBeGreaterThan(0);

    await discoveryView.getByRole('button', { name: '网易云音乐' }).dispatchEvent('click');
    await expect(discoveryView.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(discoveryView.getByRole('button', { name: '打开歌单：Netease Discovery Smoke' })).toBeVisible();
    await expect.poll(() => page.locator('.main-content-playlist-discovery').evaluate((main) => main.scrollTop)).toBe(0);
    await expect(discoveryView.getByRole('group', { name: '常用歌单分类' }).getByRole('button', { name: '全部' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(discoveryView.locator('.provider-page-header')).toHaveAttribute(
      'data-stability-marker',
      discoveryChromeMarker
    );

    const categorySwitchScrollTop = await page.evaluate((marker) => {
      const main = document.querySelector<HTMLElement>('.main-content-playlist-discovery');
      const categorySwitcher = document.querySelector<HTMLElement>('.playlist-discovery-category-switcher');
      if (!main || !categorySwitcher) {
        throw new Error('Playlist discovery category chrome is unavailable');
      }

      categorySwitcher.dataset.stabilityMarker = marker;
      main.scrollTop = Math.min(220, main.scrollHeight - main.clientHeight);
      return main.scrollTop;
    }, discoveryChromeMarker);
    expect(categorySwitchScrollTop).toBeGreaterThan(0);

    await discoveryView.getByRole('button', { name: '全部分类' }).click();
    const neteaseCategoryMenu = discoveryView.getByRole('dialog', { name: '全部歌单分类' });
    await neteaseCategoryMenu.getByRole('button', { name: '学习' }).click();
    await expect(neteaseCategoryMenu).toHaveCount(0);
    await expect(discoveryView.locator('.playlist-discovery-category-menu')).toHaveCount(0);
    const categoryLayer = discoveryView.locator('.playlist-discovery-results .main-content-transition-layer-active');
    const categoryLayerOpacities = await categoryLayer.evaluate(async (layer) => {
      const opacities: number[] = [];
      for (let index = 0; index < 8; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        opacities.push(Number.parseFloat(getComputedStyle(layer).opacity));
      }
      return opacities;
    });
    expect(categoryLayerOpacities.every((opacity) => opacity === 1)).toBe(true);
    await expect(discoveryView.getByText('当前分类暂无歌单')).toHaveCount(0);
    await expect(discoveryView.getByRole('button', { name: '学习' })).toHaveAttribute('aria-pressed', 'true');
    await expect(discoveryView.locator('.playlist-discovery-results')).toHaveAttribute('data-collection-key', 'netease:学习');
    await expect.poll(() => page.locator('.main-content-playlist-discovery').evaluate((main) => main.scrollTop)).toBe(0);
    await expect(discoveryView.locator('.provider-page-header')).toHaveAttribute(
      'data-stability-marker',
      discoveryChromeMarker
    );
    await expect(discoveryView.locator('.playlist-discovery-category-switcher')).toHaveAttribute(
      'data-stability-marker',
      discoveryChromeMarker
    );

    await page.screenshot({
      path: `artifacts/ui-checks/playlist-discovery-${testInfo.project.name}.png`
    });

    await discoveryView.getByRole('button', { name: '打开歌单：Netease Discovery Smoke' }).click();
    const detail = page.getByRole('region', { name: '歌单详情' });
    await expect(detail).toBeVisible();
    const detailSong = detail.locator('.playlist-detail-song-row').filter({ hasText: 'Netease Discovery Detail Song' });
    await expect(detailSong).toBeVisible();
    const detailLayout = await detail.evaluate((element) => {
      const heroShell = element.querySelector<HTMLElement>('.playlist-detail-hero-shell');
      const songList = element.querySelector<HTMLElement>('.playlist-detail-song-list');
      const main = element.closest<HTMLElement>('.main-content-playlist');
      if (!heroShell || !songList || !main) {
        throw new Error('Playlist detail spacing is unavailable');
      }
      return {
        heroPaddingRight: Number.parseFloat(getComputedStyle(heroShell).paddingRight),
        songListRightGap: main.getBoundingClientRect().right - songList.getBoundingClientRect().right
      };
    });
    expect(detailLayout.heroPaddingRight).toBeCloseTo(testInfo.project.name === 'desktop' ? 52 : 41.6, 1);
    expect(detailLayout.songListRightGap).toBeLessThanOrEqual(12);
    await detailSong.dblclick({ position: { x: 72, y: 20 } });
    await expect(page.locator('.now-playing strong')).toHaveAttribute('title', 'Netease Discovery Detail Song');

    await page.getByRole('button', { name: /打开歌词页：/ }).click();
    const lyricsDialog = page.getByRole('dialog', { name: '歌词详情' });
    await expect(lyricsDialog).toBeVisible();
    await expect(page.getByText('Provider smoke lyric')).toBeVisible();
    await expect.poll(() => lyricsDialog.locator('.lyrics-cover-enter').evaluate((element) => {
      const target = element as HTMLElement;
      return !target.style.transform
        && !target.style.translate
        && !target.style.scale
        && !target.style.opacity
        && !target.style.visibility;
    })).toBe(true);
    await page.getByRole('button', { name: '收起歌词页' }).click();
    await expect(lyricsDialog).toHaveCount(0);

    await page.getByRole('button', { name: '后退' }).click();
    await expect(discoveryView).toBeVisible();
    await expect(discoveryView.getByRole('button', { name: '网易云音乐' })).toHaveAttribute('aria-pressed', 'true');
    await expect(discoveryView.getByRole('button', { name: '学习' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('navigates provider-bound artists and albums without accidental queue writes', async ({ page }, testInfo) => {
    const searchBox = page.getByRole('combobox', { name: '搜索音乐' });
    await searchBox.fill('catalog smoke');
    await searchBox.press('Enter');

    const searchView = page.getByRole('region', { name: '搜索结果', exact: true });
    const qqResult = searchView.locator('.search-result-row').filter({ hasText: 'Provider Smoke Song' });
    await expect(qqResult).toBeVisible();
    const artistLink = qqResult.locator('.song-entity-link').filter({ hasText: 'Smoke Artist' });
    const underlineBeforeHover = await artistLink.evaluate((link) => {
      const style = getComputedStyle(link, '::after');
      return {
        opacity: style.opacity,
        scaleX: new DOMMatrixReadOnly(style.transform).a,
        transitionProperty: style.transitionProperty
      };
    });
    expect(underlineBeforeHover.opacity).toBe('0');
    expect(underlineBeforeHover.scaleX).toBeCloseTo(0.35, 2);
    expect(underlineBeforeHover.transitionProperty).toContain('transform');
    await artistLink.hover();
    await expect.poll(() => artistLink.evaluate((link) => {
      const style = getComputedStyle(link, '::after');
      return {
        opacity: Number(style.opacity),
        scaleX: new DOMMatrixReadOnly(style.transform).a
      };
    })).toEqual({ opacity: 1, scaleX: 1 });
    await qqResult.getByRole('button', { name: '打开歌手：Smoke Artist' }).click();

    const artistDetail = page.getByRole('region', { name: '歌手详情' });
    await expect(artistDetail).toBeVisible();
    await expect(artistDetail).toHaveAttribute('data-playlist-kind', 'artist');
    await expect(artistDetail.getByRole('heading', { name: 'Smoke Artist', level: 1 })).toBeVisible();
    await expect(artistDetail.getByRole('list', { name: 'Smoke Artist 歌曲列表' })).toBeVisible();
    await expect(artistDetail.locator('.artist-detail-tab[aria-selected="true"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(artistDetail.locator('.playlist-detail-hero-shell')).toHaveCSS(
      'padding-right',
      testInfo.project.name === 'desktop' ? '52px' : '41.6px'
    );
    await artistDetail.getByRole('tab', { name: '专辑' }).click();
    await expect(artistDetail.locator('.artist-detail-tab[aria-selected="true"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(artistDetail.getByRole('region', { name: 'Smoke Artist的专辑' }).getByRole('listitem')).toHaveCount(9);
    const artistAlbums = artistDetail.locator('.artist-album-gallery');
    await expect(artistAlbums).toHaveCSS('overflow-x', 'visible');
    const artistAlbumHeroGap = await artistDetail.evaluate((element) => {
      const main = element.closest<HTMLElement>('.main-content-playlist');
      const hero = element.querySelector<HTMLElement>('.playlist-detail-hero-shell');
      if (!main || !hero) {
        throw new Error('Artist album spacing is unavailable');
      }
      return main.getBoundingClientRect().right - hero.getBoundingClientRect().right;
    });
    expect(artistAlbumHeroGap).toBeCloseTo(40, 1);
    const artistScrollTop = await page.locator('.main-content-playlist').evaluate((main) => {
      main.scrollTop = Math.min(main.scrollHeight - main.clientHeight, 360);
      return main.scrollTop;
    });
    expect(artistScrollTop).toBeGreaterThan(0);
    await artistDetail.getByRole('tab', { name: '歌曲' }).click();
    await expect(artistDetail.getByRole('list', { name: 'Smoke Artist 歌曲列表' })).toBeVisible();
    await waitForMainContentTransition(page);
    const artistTrackLayout = await artistDetail.evaluate((element) => {
      const main = element.closest<HTMLElement>('.main-content-playlist');
      const hero = element.querySelector<HTMLElement>('.playlist-detail-hero-shell');
      const songList = element.querySelector<HTMLElement>('.playlist-detail-song-list');
      if (!main || !hero || !songList) {
        throw new Error('Artist track spacing is unavailable');
      }
      return {
        heroPaddingRight: Number.parseFloat(getComputedStyle(hero).paddingRight),
        songListRightGap: main.getBoundingClientRect().right - songList.getBoundingClientRect().right
      };
    });
    expect(artistTrackLayout.heroPaddingRight).toBeCloseTo(
      testInfo.project.name === 'desktop' ? 52 : 41.6,
      1
    );
    expect(artistTrackLayout.songListRightGap).toBeLessThanOrEqual(12);

    await page.getByRole('button', { name: '展开播放队列' }).click();
    const queuePanel = page.getByRole('complementary', { name: '播放队列' });
    await expect(queuePanel.getByText('播放队列为空')).toBeVisible();
    await queuePanel.getByRole('button', { name: '收起播放队列' }).click();
    await expect(queuePanel).toHaveCount(0, { timeout: 1_000 });

    const artistLayout = await artistDetail.evaluate((detail) => {
      const main = document.querySelector<HTMLElement>('.main-content');
      const cover = detail.querySelector<HTMLElement>('.playlist-detail-cover');
      const songList = detail.querySelector<HTMLElement>('.song-list-scroll-shell');
      const trackHeading = Array.from(detail.querySelectorAll<HTMLElement>('.section-heading')).find((heading) => (
        heading.querySelector('h2')?.textContent?.trim() === '热门歌曲'
      ));
      if (!main || !cover || !songList || !trackHeading) {
        throw new Error('Artist detail layout did not render');
      }

      const coverRect = cover.getBoundingClientRect();
      return {
        mainHorizontalOverflow: main.scrollWidth - main.clientWidth,
        songListHeight: songList.getBoundingClientRect().height,
        coverWidth: coverRect.width,
        coverHeight: coverRect.height,
        coverRadius: getComputedStyle(cover).borderRadius,
        coverBackground: getComputedStyle(cover).backgroundImage
      };
    });
    expect(artistLayout.mainHorizontalOverflow).toBeLessThanOrEqual(1);
    expect(artistLayout.songListHeight).toBeGreaterThan(80);
    expect(Math.abs(artistLayout.coverWidth - artistLayout.coverHeight)).toBeLessThanOrEqual(1);
    expect(artistLayout.coverRadius).toBe('50%');
    expect(artistLayout.coverBackground).toMatch(/data:image\/(?:jpeg|png|webp)/);

    await page.screenshot({
      path: `artifacts/ui-checks/artist-catalog-${testInfo.project.name}.png`
    });

    await artistDetail.getByRole('tab', { name: '专辑' }).click();
    await artistDetail
      .getByRole('region', { name: 'Smoke Artist的专辑' })
      .getByRole('button', { name: '打开专辑：Smoke Album', exact: true })
      .click();
    const albumDetail = page.getByRole('region', { name: '专辑详情' });
    await expect(albumDetail).toBeVisible();
    await expect(albumDetail).toHaveAttribute('data-playlist-kind', 'album');
    await expect(albumDetail.getByRole('heading', { name: 'Smoke Album', level: 1 })).toBeVisible();
    const albumSong = albumDetail.locator('.playlist-detail-song-row').filter({ hasText: 'Provider Smoke Song' });
    await expect(albumSong).toBeVisible();
    await waitForMainContentTransition(page);

    const albumCover = albumDetail.locator('.playlist-detail-cover');
    await expect(albumCover).toHaveCSS('background-image', /data:image\/(?:jpeg|png|webp)/);
    await expect(albumCover).not.toHaveCSS('border-radius', '50%');
    await page.screenshot({
      path: `artifacts/ui-checks/album-catalog-${testInfo.project.name}.png`
    });

    await albumSong.getByRole('button', { name: '打开歌手：Smoke Artist' }).click();
    await expect(page.getByRole('region', { name: '歌手详情' })).toBeVisible();
    await page.getByRole('button', { name: '后退' }).click();
    await expect(page.getByRole('region', { name: '专辑详情' })).toBeVisible();
    await page.getByRole('button', { name: '后退' }).click();
    await expect(page.getByRole('region', { name: '歌手详情' })).toBeVisible();
    await page.getByRole('button', { name: '前进' }).click();
    await expect(page.getByRole('region', { name: '专辑详情' })).toBeVisible();
    await waitForMainContentTransition(page);
    expect(await page.getByTestId('main-content-transition').locator(':scope > .main-content-transition-layer-active').evaluate((layer) => (
      layer.hasAttribute('inert')
    ))).toBe(false);
    await page.getByRole('button', { name: '刷新专辑详情' }).click();
    await expect(page.getByRole('heading', { name: 'Smoke Album', level: 1 })).toBeVisible();

    await searchBox.fill('netease catalog smoke');
    await searchBox.press('Enter');
    await expect(searchView).toBeVisible();
    await searchView.getByRole('button', { name: '网易云音乐' }).click();
    const neteaseResult = searchView.locator('.search-result-row').filter({ hasText: 'Netease Chart Smoke Song' });
    await expect(neteaseResult).toBeVisible();
    await neteaseResult.getByRole('button', { name: '打开歌手：Netease Smoke Artist' }).click();

    const neteaseArtist = page.getByRole('region', { name: '歌手详情' });
    await expect(neteaseArtist.getByRole('heading', { name: 'Netease Smoke Artist', level: 1 })).toBeVisible();
    await neteaseArtist.getByRole('tab', { name: '专辑' }).click();
    await neteaseArtist
      .getByRole('region', { name: 'Netease Smoke Artist的专辑' })
      .getByRole('button', { name: '打开专辑：Netease Smoke Album', exact: true })
      .click();
    const neteaseAlbum = page.getByRole('region', { name: '专辑详情' });
    await expect(neteaseAlbum.getByRole('heading', { name: 'Netease Smoke Album', level: 1 })).toBeVisible();
    await expect(neteaseAlbum.locator('.playlist-detail-song-row').filter({ hasText: 'Netease Chart Smoke Song' })).toBeVisible();
  });

  test('keeps the catalog hierarchy and collapsed navigation geometry crisp at 1220px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1220, height: 780 });
    await page.getByRole('button', { name: '歌单广场', exact: true }).click();
    const discoveryView = page.getByRole('region', { name: '歌单广场' });
    await expect(discoveryView.getByRole('button', { name: '打开歌单：QQ Discovery Smoke' })).toBeVisible();
    await waitForMainContentTransition(page);

    await page.screenshot({
      path: `artifacts/ui-checks/catalog-navigation-1220-expanded-${testInfo.project.name}.png`
    });

    await page.getByRole('button', { name: '收起菜单' }).click();
    const sidebar = page.getByRole('navigation', { name: '主导航' });
    await expect(sidebar).toHaveClass(/sidebar-collapsed/);
    await expect.poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(80);

    const geometry = await sidebar.getByRole('button', { name: '歌单广场', exact: true }).evaluate((button) => {
      const iconShell = button.querySelector<HTMLElement>('.nav-item-icon');
      const icon = iconShell?.querySelector<SVGElement>('svg');
      const indicator = iconShell?.querySelector<HTMLElement>('.nav-item-indicator');
      if (!iconShell || !icon || !indicator) {
        throw new Error('Collapsed navigation geometry is unavailable');
      }

      const buttonRect = button.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const indicatorRect = indicator.getBoundingClientRect();
      const iconStyle = getComputedStyle(icon);
      return {
        buttonCenterY: buttonRect.top + buttonRect.height / 2,
        iconCenterY: iconRect.top + iconRect.height / 2,
        indicatorCenterY: indicatorRect.top + indicatorRect.height / 2,
        iconWidth: iconRect.width,
        iconHeight: iconRect.height,
        indicatorRight: indicatorRect.right,
        iconLeft: iconRect.left,
        strokeWidth: iconStyle.strokeWidth,
        transform: iconStyle.transform
      };
    });

    expect(Math.abs(geometry.buttonCenterY - geometry.iconCenterY)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(geometry.indicatorCenterY - geometry.iconCenterY)).toBeLessThanOrEqual(0.5);
    expect(geometry.iconWidth).toBe(20);
    expect(geometry.iconHeight).toBe(20);
    expect(geometry.indicatorRight).toBeLessThan(geometry.iconLeft);
    expect(geometry.strokeWidth).toBe('2px');
    expect(geometry.transform).toBe('none');

    await page.screenshot({
      path: `artifacts/ui-checks/catalog-navigation-1220-collapsed-${testInfo.project.name}.png`
    });
  });
});
