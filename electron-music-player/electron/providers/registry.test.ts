import { describe, expect, it } from 'vitest';
import { createProviderRegistry } from './registry.cts';
import type {
  ChartSummary,
  AlbumSummary,
  DiscoveredPlaylist,
  HomepageBlockFeed,
  MusicProvider,
  PlaylistCategory,
  Program,
  RadioSession,
  RadioSessionItem,
  RadioSessionPage,
  RecommendationHistoryPage,
  RecommendationHomeFeed,
  Song
} from './types.cjs';

const qqChart: ChartSummary = {
  id: 'qq:chart:62',
  providerId: 'qq',
  platformChartId: '62',
  title: 'QQ 热歌榜',
  description: '',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

const qqCategory: PlaylistCategory = {
  id: 'all',
  providerId: 'qq',
  name: '全部'
};

const qqDiscoveredPlaylist: DiscoveredPlaylist = {
  id: 'qq:playlist:8800',
  providerId: 'qq',
  platformPlaylistId: '8800',
  title: 'QQ 热门歌单',
  description: '',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

const qqRecommendationFeed: RecommendationHomeFeed = {
  providerId: 'qq',
  loggedIn: true,
  dailySongs: [],
  newSongs: [],
  moduleResults: {
    daily: { status: 'skipped', errorMessage: null },
    new: { status: 'fulfilled', errorMessage: null }
  }
};

const qqReleaseAlbum: AlbumSummary = {
  id: 'qq:album:release',
  providerId: 'qq',
  platformAlbumId: 'release',
  title: 'Release Album',
  artistName: 'Release Artist',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

const neteaseHomepageBlockFeed: HomepageBlockFeed = {
  providerId: 'netease',
  blocks: []
};

const neteaseRecommendationHistoryPage: RecommendationHistoryPage = {
  providerId: 'netease',
  date: '2026-07-17',
  songs: []
};

const neteaseSimilarSeed: Song = {
  id: 'netease:100',
  providerId: 'netease',
  platformSongId: '100',
  title: 'Seed Song',
  artist: 'Seed Artist',
  album: 'Seed Album',
  durationMs: 180_000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
};

const neteaseSimilarSong: Song = {
  ...neteaseSimilarSeed,
  id: 'netease:101',
  platformSongId: '101',
  title: 'Similar Song'
};

const neteaseProgram: Program = {
  id: 'netease:program:100',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: '100',
  title: 'Program Episode',
  description: 'Program description',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  podcast: {
    id: 'netease:podcast:42',
    providerId: 'netease',
    platformPodcastId: '42',
    title: 'Podcast Title',
    description: 'Podcast description',
    author: 'Podcast Author',
    coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:42',
    podcastTitle: 'Podcast Title'
  }
};

const neteaseRadioSession: RadioSession = {
  id: 'netease:radio-session:1',
  providerId: 'netease',
  cursor: 'cursor-1'
};

const neteaseRadioItem: RadioSessionItem = {
  id: 'netease:radio-item:1',
  song: {
    ...neteaseSimilarSong,
    id: 'netease:radio-song:1',
    platformSongId: 'radio-song-1',
    title: 'Radio Song',
    sourceContext: {
      type: 'radio',
      providerId: 'netease',
      radioSessionId: neteaseRadioSession.id,
      radioItemId: 'netease:radio-item:1'
    }
  },
  sourceContext: {
    type: 'radio',
    providerId: 'netease',
    radioSessionId: neteaseRadioSession.id,
    radioItemId: 'netease:radio-item:1'
  }
};

const neteaseRadioPage: RadioSessionPage = {
  session: neteaseRadioSession,
  items: [neteaseRadioItem],
  hasMore: true
};

const qqArtistDetail = {
  id: 'qq:artist:000GDDuQ3sGQiT',
  providerId: 'qq' as const,
  platformArtistId: '000GDDuQ3sGQiT',
  name: '王菲',
  aliases: [],
  description: '',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  topSongs: [],
  albums: []
};

const qqAlbumDetail = {
  id: 'qq:album:001uZ5Gj0JrA4o',
  providerId: 'qq' as const,
  platformAlbumId: '001uZ5Gj0JrA4o',
  title: '唱游',
  artistName: '王菲',
  description: '',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  artists: [],
  tracks: []
};

const qqProvider: MusicProvider = {
  id: 'qq',
  async getLoginStatus() {
    return { providerId: 'qq', loggedIn: false, playbackReady: false };
  },
  async login() {
    return { providerId: 'qq', loggedIn: true, playbackReady: true };
  },
  async logout() {
    return undefined;
  },
  async search() {
    return [];
  },
  async getUserPlaylists() {
    return [];
  },
  async getPlaylistTracks() {
    return [];
  },
  async getSongUrl(song, quality) {
    return { ok: true, providerId: song.providerId, quality, url: 'https://example.test/song.mp3' };
  },
  async getLyrics(song) {
    return { ok: true, providerId: song.providerId, lrc: '[00:00.00]line' };
  },
  async setSongLiked(song, liked) {
    return { providerId: song.providerId, operation: liked ? 'like' : 'unlike' };
  },
  async addSongToPlaylist(song) {
    return { providerId: song.providerId, operation: 'add_to_playlist' };
  },
  async removeSongFromPlaylist(song) {
    return { providerId: song.providerId, operation: 'remove_from_playlist' };
  }
};

describe('provider registry', () => {
  it('exposes a dedicated capability execution boundary', () => {
    const registry = createProviderRegistry([qqProvider]);

    expect(registry).toHaveProperty('runCapability');
    expect((registry as unknown as { runCapability?: unknown }).runCapability).toBeTypeOf('function');
  });

  it('runs an explicitly registered provider capability', async () => {
    const provider = {
      ...qqProvider,
      capabilities: {
        charts: {
          getCharts: async () => [qqChart],
          getChartTracks: async () => []
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    const result = await registry.runCapability('qq', 'charts', (capability) => capability.getCharts());

    expect(result).toEqual({ ok: true, data: [qqChart] });
  });

  it('runs the optional recommendation home capability', async () => {
    const provider = {
      ...qqProvider,
      capabilities: {
        recommendations: {
          getRecommendationHome: async () => qqRecommendationFeed
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    const result = await registry.runCapability('qq', 'recommendations', (capability) =>
      capability.getRecommendationHome()
    );

    expect(result).toEqual({ ok: true, data: qqRecommendationFeed });
  });

  it('runs release catalogs through an independent capability', async () => {
    const provider = {
      ...qqProvider,
      capabilities: {
        releaseCatalog: { getNewAlbums: async () => [qqReleaseAlbum] }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    await expect(registry.runCapability('qq', 'releaseCatalog', (capability) => capability.getNewAlbums()))
      .resolves.toEqual({ ok: true, data: [qqReleaseAlbum] });
  });

  it('names unsupported release catalog capabilities', async () => {
    const registry = createProviderRegistry([qqProvider]);

    await expect(registry.runCapability('qq', 'releaseCatalog', async () => []))
      .resolves.toMatchObject({ ok: false, error: { message: 'QQ 音乐暂不支持新碟速递能力' } });
  });

  it('keeps recommendations unsupported for QQ without a verified provider implementation', async () => {
    const registry = createProviderRegistry([qqProvider]);

    const result = await registry.runCapability('qq', 'recommendations', async () => qqRecommendationFeed);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_unsupported',
        providerId: 'qq',
        message: 'QQ 音乐暂不支持个性化推荐能力'
      }
    });
  });

  it('runs homepage blocks independently and keeps them unsupported for QQ', async () => {
    const neteaseProvider = {
      ...qqProvider,
      id: 'netease' as const,
      capabilities: {
        homepageBlocks: {
          getHomepageBlocks: async () => neteaseHomepageBlockFeed
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([qqProvider, neteaseProvider]);

    await expect(registry.runCapability('netease', 'homepageBlocks', (capability) => (
      capability.getHomepageBlocks()
    ))).resolves.toEqual({ ok: true, data: neteaseHomepageBlockFeed });
    await expect(registry.runCapability('qq', 'homepageBlocks', async () => neteaseHomepageBlockFeed))
      .resolves.toEqual({
        ok: false,
        error: {
          code: 'provider_unsupported',
          providerId: 'qq',
          message: 'QQ 音乐暂不支持首页专题歌曲能力'
        }
      });
  });

  it('runs the optional current-song similar capability independently from recommendation home', async () => {
    const provider = {
      ...qqProvider,
      id: 'netease' as const,
      capabilities: {
        similarSongs: {
          getSimilarSongs: async () => [neteaseSimilarSong]
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    const result = await registry.runCapability('netease', 'similarSongs', (capability) =>
      capability.getSimilarSongs(neteaseSimilarSeed, { forceRefresh: true })
    );

    expect(result).toEqual({ ok: true, data: [neteaseSimilarSong] });
  });

  it('keeps current-song similar recommendations unsupported for QQ', async () => {
    const registry = createProviderRegistry([qqProvider]);

    const result = await registry.runCapability('qq', 'similarSongs', async () => []);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_unsupported',
        providerId: 'qq',
        message: 'QQ 音乐暂不支持相似歌曲能力'
      }
    });
  });

  it('keeps recommendation history provider-specific', async () => {
    const provider = {
      ...qqProvider,
      id: 'netease' as const,
      capabilities: {
        recommendationHistory: {
          getRecentDates: async () => [neteaseRecommendationHistoryPage.date],
          getHistory: async () => neteaseRecommendationHistoryPage
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([qqProvider, provider]);

    await expect(registry.runCapability('netease', 'recommendationHistory', (capability) => (
      capability.getHistory(neteaseRecommendationHistoryPage.date)
    ))).resolves.toEqual({ ok: true, data: neteaseRecommendationHistoryPage });
    await expect(registry.runCapability('qq', 'recommendationHistory', async () => neteaseRecommendationHistoryPage))
      .resolves.toEqual({
        ok: false,
        error: {
          code: 'provider_unsupported',
          providerId: 'qq',
          message: 'QQ 音乐暂不支持历史日推能力'
        }
      });
  });

  it('runs program playback through its own optional capability', async () => {
    const provider = {
      ...qqProvider,
      id: 'netease' as const,
      capabilities: {
        programPlayback: {
          getProgramPlayback: async () => ({
            ok: true,
            providerId: 'netease' as const,
            url: 'https://example.test/program.mp3'
          })
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    await expect(registry.runCapability('netease', 'programPlayback', (capability) => (
      capability.getProgramPlayback(neteaseProgram)
    ))).resolves.toEqual({
      ok: true,
      data: {
        ok: true,
        providerId: 'netease',
        url: 'https://example.test/program.mp3'
      }
    });
  });

  it('keeps program playback unsupported until a provider explicitly implements it', async () => {
    const registry = createProviderRegistry([qqProvider]);

    await expect(registry.runCapability('qq', 'programPlayback', async () => ({
      ok: true,
      providerId: 'qq' as const,
      url: 'https://example.test/program.mp3'
    }))).resolves.toEqual({
      ok: false,
      error: {
        code: 'provider_unsupported',
        providerId: 'qq',
        message: 'QQ 音乐暂不支持播客节目播放能力'
      }
    });
  });

  it('runs radio session commands through their own optional capability', async () => {
    const updatedPage: RadioSessionPage = {
      ...neteaseRadioPage,
      session: {
        ...neteaseRadioSession,
        cursor: 'cursor-2'
      },
      items: []
    };
    const provider = {
      ...qqProvider,
      id: 'netease' as const,
      capabilities: {
        radioSession: {
          startRadioSession: async () => neteaseRadioPage,
          refillRadioSession: async () => updatedPage,
          skipRadioSessionItem: async () => updatedPage,
          submitRadioNegativeFeedback: async () => updatedPage
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    await expect(registry.runCapability('netease', 'radioSession', (capability) => (
      capability.startRadioSession()
    ))).resolves.toEqual({ ok: true, data: neteaseRadioPage });
    await expect(registry.runCapability('netease', 'radioSession', (capability) => (
      capability.refillRadioSession(neteaseRadioSession)
    ))).resolves.toEqual({ ok: true, data: updatedPage });
    await expect(registry.runCapability('netease', 'radioSession', (capability) => (
      capability.skipRadioSessionItem(neteaseRadioSession, neteaseRadioItem)
    ))).resolves.toEqual({ ok: true, data: updatedPage });
    await expect(registry.runCapability('netease', 'radioSession', (capability) => (
      capability.submitRadioNegativeFeedback(neteaseRadioSession, neteaseRadioItem)
    ))).resolves.toEqual({ ok: true, data: updatedPage });
  });

  it('keeps radio sessions unsupported until a provider explicitly implements them', async () => {
    const registry = createProviderRegistry([qqProvider]);

    await expect(registry.runCapability('qq', 'radioSession', async () => neteaseRadioPage))
      .resolves.toEqual({
        ok: false,
        error: {
          code: 'provider_unsupported',
          providerId: 'qq',
          message: 'QQ 音乐暂不支持电台会话能力'
        }
      });
  });

  it('runs the optional playlist discovery capability', async () => {
    const provider = {
      ...qqProvider,
      capabilities: {
        playlistDiscovery: {
          getPlaylistCategories: async () => [qqCategory],
          getDiscoveredPlaylists: async () => ({
            providerId: 'qq' as const,
            categoryId: 'all',
            playlists: [qqDiscoveredPlaylist],
            offset: 0,
            limit: 30,
            total: 1,
            hasMore: false
          })
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    const categoriesResult = await registry.runCapability('qq', 'playlistDiscovery', (capability) =>
      capability.getPlaylistCategories()
    );
    const pageResult = await registry.runCapability('qq', 'playlistDiscovery', (capability) =>
      capability.getDiscoveredPlaylists({ categoryId: 'all', limit: 30, offset: 0 })
    );

    expect(categoriesResult).toEqual({ ok: true, data: [qqCategory] });
    expect(pageResult).toEqual({
      ok: true,
      data: {
        providerId: 'qq',
        categoryId: 'all',
        playlists: [qqDiscoveredPlaylist],
        offset: 0,
        limit: 30,
        total: 1,
        hasMore: false
      }
    });
  });

  it('runs the optional artist catalog capability', async () => {
    const provider = {
      ...qqProvider,
      capabilities: {
        artistCatalog: {
          getArtistDetail: async () => qqArtistDetail,
          getAlbumDetail: async () => qqAlbumDetail
        }
      }
    } satisfies MusicProvider;
    const registry = createProviderRegistry([provider]);

    const artistResult = await registry.runCapability('qq', 'artistCatalog', (capability) =>
      capability.getArtistDetail(qqArtistDetail.id)
    );
    const albumResult = await registry.runCapability('qq', 'artistCatalog', (capability) =>
      capability.getAlbumDetail(qqAlbumDetail.id)
    );

    expect(artistResult).toEqual({ ok: true, data: qqArtistDetail });
    expect(albumResult).toEqual({ ok: true, data: qqAlbumDetail });
  });

  it('names an unsupported artist catalog capability in the structured error', async () => {
    const registry = createProviderRegistry([qqProvider]);

    const result = await registry.runCapability('qq', 'artistCatalog', async () => qqArtistDetail);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_unsupported',
        providerId: 'qq',
        message: 'QQ 音乐暂不支持歌手与专辑能力'
      }
    });
  });

  it('returns provider_unsupported when a registered provider lacks a capability', async () => {
    const registry = createProviderRegistry([qqProvider]);

    const result = await registry.runCapability('qq', 'charts', async () => []);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_unsupported',
        providerId: 'qq',
        message: 'QQ 音乐暂不支持排行榜能力'
      }
    });
  });

  it('returns structured provider_not_ready errors for unregistered providers', async () => {
    const registry = createProviderRegistry([qqProvider]);

    const result = await registry.run('netease', (provider) => provider.getUserPlaylists());

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_not_ready',
        providerId: 'netease',
        message: '网易云音乐 Provider 尚未接入'
      }
    });
  });

  it('normalizes raw thrown provider errors into stable IPC errors', async () => {
    const abortError = new Error('operation aborted by runtime');
    abortError.name = 'AbortError';
    const provider: MusicProvider = {
      ...qqProvider,
      search: async () => {
        throw abortError;
      }
    };
    const registry = createProviderRegistry([provider]);

    const result = await registry.run('qq', (targetProvider) => targetProvider.search('x'));

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'qq',
        message: 'Provider 调用失败'
      }
    });
  });
});
