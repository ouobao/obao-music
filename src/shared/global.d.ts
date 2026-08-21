import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ChartSummary,
  HomepageBlockFeed,
  Playlist,
  PlaylistCategory,
  PlaylistDetail,
  PlaylistDiscoveryPage,
  Program,
  ProviderId,
  RadioSession,
  RadioSessionItem,
  RadioSessionPage,
  RecommendationHistoryPage,
  RecommendationHomeFeed,
  RemoteProviderId,
  Song
} from './musicTypes';
import type {
  LoginQrPollResult,
  LoginQrSession,
  LoginStatus,
  LyricsResult,
  PlaylistDiscoveryQuery,
  ProviderFetchOptions,
  ProviderIpcResult,
  ProgramPlaybackResult,
  Quality,
  SearchEntityOptions,
  SearchEntityResults,
  SearchHotSearch,
  SearchOptions,
  SearchSuggestion,
  SearchSuggestionOptions,
  SongMutationResult,
  SongUrlResult
} from './providerTypes';

export type TrayPlaybackAction = 'previous' | 'toggle' | 'next';

export interface TrayPlaybackState {
  title: string;
  artist: string;
  hasSong: boolean;
  isPlaying: boolean;
}

export interface AudioOutputSettings {
  supported: boolean;
  exclusiveModeEnabled: boolean;
  activeExclusiveMode: boolean;
  restartRequired: boolean;
}

declare global {
  interface Window {
    musicPlayer: {
      app: {
        getVersion: () => Promise<string>;
        setWindowTheme?: (theme: {
          preference: 'system' | 'light' | 'dark';
          resolvedThemeId: 'white' | 'black';
        }) => Promise<void>;
      };
      window: {
        minimize: () => void | Promise<void>;
        toggleMaximize: () => void | Promise<void>;
        toggleFullscreen: () => boolean | void | Promise<boolean | void>;
        setFullscreen?: (fullscreen: boolean) => boolean | Promise<boolean>;
        close: () => void | Promise<void>;
        getCursorPosition?: () => Promise<{ x: number; y: number; inside: boolean } | null>;
      };
      audio?: {
        getOutputSettings: () => Promise<AudioOutputSettings>;
        setExclusiveMode: (enabled: boolean) => Promise<AudioOutputSettings>;
        restart: () => Promise<void>;
      };
      tray?: {
        updatePlaybackState: (state: TrayPlaybackState) => void;
        onPlaybackAction: (listener: (action: TrayPlaybackAction) => void) => () => void;
      };
      diagnostics?: {
        markReady: () => void;
        report: (event: {
          level: 'debug' | 'info' | 'warn' | 'error';
          event: string;
          area?: string;
          message?: string;
          stack?: string;
          route?: string;
          entityId?: string;
          timestamp: number;
        }) => void;
      };
      music: {
        getLoginStatus: (providerId: ProviderId) => Promise<ProviderIpcResult<LoginStatus>>;
        login: (providerId: ProviderId) => Promise<ProviderIpcResult<LoginStatus>>;
        loginQrCreate: (providerId: ProviderId) => Promise<ProviderIpcResult<LoginQrSession>>;
        loginQrPoll: (providerId: ProviderId, key: string) => Promise<ProviderIpcResult<LoginQrPollResult>>;
        loginQrCancel: (providerId: ProviderId, key: string) => Promise<ProviderIpcResult<void>>;
        logout: (providerId: ProviderId) => Promise<ProviderIpcResult<void>>;
        search: (providerId: ProviderId, keyword: string, options?: SearchOptions) => Promise<ProviderIpcResult<Song[]>>;
        getSearchSuggestions: (providerId: RemoteProviderId, keyword: string, options?: SearchSuggestionOptions) => Promise<ProviderIpcResult<SearchSuggestion[]>>;
        getSearchHotSearches: (providerId: RemoteProviderId, options?: SearchSuggestionOptions) => Promise<ProviderIpcResult<SearchHotSearch[]>>;
        searchEntities: (providerId: RemoteProviderId, keyword: string, options?: SearchEntityOptions) => Promise<ProviderIpcResult<SearchEntityResults>>;
        getUserPlaylists: (providerId: ProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<Playlist[]>>;
        getPlaylistTracks: (providerId: ProviderId, playlistId: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<Song[]>>;
        getPlaylistDetail: (providerId: ProviderId, playlistId: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<PlaylistDetail>>;
        getCharts: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<ChartSummary[]>>;
        getChartTracks: (providerId: RemoteProviderId, chartId: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<Song[]>>;
        getPlaylistCategories: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<PlaylistCategory[]>>;
        getDiscoveredPlaylists: (providerId: RemoteProviderId, query: PlaylistDiscoveryQuery, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<PlaylistDiscoveryPage>>;
        getArtistDetail: (providerId: RemoteProviderId, artistId: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<ArtistDetail>>;
        getArtistSongsPage: (providerId: RemoteProviderId, artistId: string, offset: number, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<ArtistSongsPage>>;
        getAlbumDetail: (providerId: RemoteProviderId, albumId: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<AlbumDetail>>;
        getRecommendationHome: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<RecommendationHomeFeed>>;
        getNewAlbums: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<AlbumSummary[]>>;
        getHomepageBlocks: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<HomepageBlockFeed>>;
        getSimilarSongs: (providerId: RemoteProviderId, song: Song, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<Song[]>>;
        getRecommendationHistoryDates: (providerId: RemoteProviderId, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<string[]>>;
        getRecommendationHistory: (providerId: RemoteProviderId, date: string, options?: ProviderFetchOptions) => Promise<ProviderIpcResult<RecommendationHistoryPage>>;
        getProgramPlayback: (providerId: RemoteProviderId, program: Program) => Promise<ProviderIpcResult<ProgramPlaybackResult>>;
        startRadioSession: (providerId: RemoteProviderId) => Promise<ProviderIpcResult<RadioSessionPage>>;
        refillRadioSession: (session: RadioSession) => Promise<ProviderIpcResult<RadioSessionPage>>;
        skipRadioSessionItem: (session: RadioSession, item: RadioSessionItem) => Promise<ProviderIpcResult<RadioSessionPage>>;
        submitRadioNegativeFeedback: (session: RadioSession, item: RadioSessionItem) => Promise<ProviderIpcResult<RadioSessionPage>>;
        getSongUrl: (providerId: ProviderId, song: Song, quality: Quality) => Promise<ProviderIpcResult<SongUrlResult>>;
        getLyrics: (providerId: ProviderId, song: Song) => Promise<ProviderIpcResult<LyricsResult>>;
        setSongLiked: (providerId: ProviderId, song: Song, liked: boolean) => Promise<ProviderIpcResult<SongMutationResult>>;
        addSongToPlaylist: (providerId: ProviderId, song: Song, playlistId: string) => Promise<ProviderIpcResult<SongMutationResult>>;
        removeSongFromPlaylist: (providerId: ProviderId, song: Song, playlistId: string) => Promise<ProviderIpcResult<SongMutationResult>>;
        importLocalFiles: () => Promise<ProviderIpcResult<Song[]>>;
      };
    };
  }
}

export {};
