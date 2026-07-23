import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ChartSummary,
  HomepageBlockFeed,
  Playlist,
  PlaylistCategory,
  PlaylistDiscoveryPage,
  RadioSessionPage,
  RecommendationHistoryPage,
  RecommendationHomeFeed,
  Song
} from '../../../shared/musicTypes';
import type {
  LoginStatus,
  LyricsResult,
  ProgramPlaybackResult,
  ProviderIpcResult,
  Quality,
  SearchEntityResults,
  SearchHotSearch,
  SearchSuggestion,
  SongMutationResult,
  SongUrlResult
} from '../../../shared/providerTypes';

type MusicApi = Window['musicPlayer']['music'];

function ok<T>(data: T): ProviderIpcResult<T> {
  return { ok: true, data };
}

function unsupported<T>(providerId: LoginStatus['providerId'], capability: string): ProviderIpcResult<T> {
  return {
    ok: false,
    error: {
      code: 'provider_unsupported',
      providerId,
      message: `Fixture does not implement ${capability}`
    }
  };
}

export function createLoggedOutStatus(providerId: LoginStatus['providerId']): LoginStatus {
  return {
    providerId,
    loggedIn: false,
    playbackReady: false
  };
}

export function createLoggedInStatus(providerId: LoginStatus['providerId'], nickname = 'QQ 用户'): LoginStatus {
  return {
    providerId,
    loggedIn: true,
    nickname,
    playbackReady: providerId !== 'qq',
    message: providerId === 'qq' ? '播放授权不完整' : undefined
  };
}

export function createMusicPlayerApi(overrides: Partial<MusicApi> = {}): Window['musicPlayer'] {
  const music: MusicApi = {
    getLoginStatus: async (providerId) => ok(createLoggedOutStatus(providerId)),
    login: async (providerId) => ok(createLoggedInStatus(providerId, providerId === 'netease' ? '网易云用户' : 'QQ 用户')),
    logout: async () => ok(undefined),
    search: async () => ok<Song[]>([]),
    getSearchSuggestions: async () => ok<SearchSuggestion[]>([]),
    getSearchHotSearches: async () => ok<SearchHotSearch[]>([]),
    searchEntities: async (providerId, keyword) => ok<SearchEntityResults>({
      providerId,
      keyword,
      sections: {
        songs: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
        artists: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
        albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
        playlists: { available: true, items: [], total: 0, hasMore: false, errorMessage: null }
      }
    }),
    getUserPlaylists: async () => ok<Playlist[]>([]),
    getPlaylistTracks: async () => ok<Song[]>([]),
    getCharts: async () => ok<ChartSummary[]>([]),
    getChartTracks: async () => ok<Song[]>([]),
    getPlaylistCategories: async () => ok<PlaylistCategory[]>([]),
    getDiscoveredPlaylists: async (providerId, query) => ok<PlaylistDiscoveryPage>({
      providerId,
      categoryId: query.categoryId,
      playlists: [],
      offset: query.offset ?? 0,
      limit: query.limit ?? 30,
      total: 0,
      hasMore: false
    }),
    getArtistDetail: async (providerId, artistId) => ok<ArtistDetail>({
      id: artistId,
      providerId,
      platformArtistId: artistId.split(':').at(-1) ?? artistId,
      name: '测试歌手',
      aliases: [],
      description: '',
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: providerId === 'qq' ? 'QQ音乐' : '网易云',
      topSongs: [],
      albums: []
    }),
    getAlbumDetail: async (providerId, albumId) => ok<AlbumDetail>({
      id: albumId,
      providerId,
      platformAlbumId: albumId.split(':').at(-1) ?? albumId,
      title: '测试专辑',
      artistName: '测试歌手',
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: providerId === 'qq' ? 'QQ音乐' : '网易云',
      description: '',
      artists: [],
      tracks: []
    }),
    getRecommendationHome: async (providerId) => ok<RecommendationHomeFeed>({
      providerId,
      loggedIn: false,
      dailySongs: [],
      newSongs: [],
      moduleResults: {
        daily: { status: 'skipped', errorMessage: null },
        new: { status: 'fulfilled', errorMessage: null }
      }
    }),
    getNewAlbums: async () => ok<AlbumSummary[]>([]),
    getHomepageBlocks: async () => ok<HomepageBlockFeed>({
      providerId: 'netease',
      blocks: []
    }),
    getSimilarSongs: async () => ok<Song[]>([]),
    getRecommendationHistoryDates: async (providerId) => (
      providerId === 'netease'
        ? ok<string[]>([])
        : unsupported<string[]>(providerId, 'recommendation history')
    ),
    getRecommendationHistory: async (providerId, date) => (
      providerId === 'netease'
        ? ok<RecommendationHistoryPage>({ providerId, date, songs: [] })
        : unsupported<RecommendationHistoryPage>(providerId, 'recommendation history')
    ),
    getProgramPlayback: async (providerId) => unsupported<ProgramPlaybackResult>(providerId, 'program playback'),
    startRadioSession: async (providerId) => unsupported<RadioSessionPage>(providerId, 'radio session'),
    refillRadioSession: async (session) => unsupported<RadioSessionPage>(session.providerId, 'radio session'),
    skipRadioSessionItem: async (session) => unsupported<RadioSessionPage>(session.providerId, 'radio session'),
    submitRadioNegativeFeedback: async (session) => unsupported<RadioSessionPage>(session.providerId, 'radio session'),
    getSongUrl: async (providerId, song, quality: Quality) =>
      ok<SongUrlResult>({
        ok: true,
        providerId,
        quality,
        url: `https://example.test/audio/${song.platformSongId ?? song.id}.mp3`
      }),
    getLyrics: async (providerId) =>
      ok<LyricsResult>({
        ok: true,
        providerId,
        lrc: '[00:01.00]第一句歌词'
      }),
    setSongLiked: async (providerId, _song, liked) =>
      ok<SongMutationResult>({ providerId, operation: liked ? 'like' : 'unlike' }),
    addSongToPlaylist: async (providerId) =>
      ok<SongMutationResult>({ providerId, operation: 'add_to_playlist' }),
    removeSongFromPlaylist: async (providerId) =>
      ok<SongMutationResult>({ providerId, operation: 'remove_from_playlist' }),
    importLocalFiles: async () => ok<Song[]>([]),
    ...overrides
  };

  return {
    app: {
      getVersion: async () => '0.1.0'
    },
    window: {
      minimize: () => undefined,
      toggleMaximize: () => undefined,
      toggleFullscreen: () => undefined,
      close: () => undefined
    },
    audio: {
      getOutputSettings: async () => ({
        supported: true,
        exclusiveModeEnabled: false,
        activeExclusiveMode: false,
        restartRequired: false
      }),
      setExclusiveMode: async (enabled) => ({
        supported: true,
        exclusiveModeEnabled: enabled,
        activeExclusiveMode: false,
        restartRequired: enabled
      }),
      restart: async () => undefined
    },
    tray: {
      updatePlaybackState: () => undefined,
      onPlaybackAction: () => () => undefined
    },
    music
  };
}

export function installMusicPlayerApiMock(overrides: Partial<MusicApi> = {}): Window['musicPlayer'] {
  window.musicPlayer = createMusicPlayerApi(overrides);

  return window.musicPlayer;
}
