import electron = require('electron');

const { contextBridge, ipcRenderer } = electron;
type TrayPlaybackAction = 'previous' | 'toggle' | 'next';
interface AudioOutputSettings {
  supported: boolean;
  exclusiveModeEnabled: boolean;
  activeExclusiveMode: boolean;
  restartRequired: boolean;
}
interface RendererDiagnosticEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  area?: string;
  message?: string;
  stack?: string;
  route?: string;
  entityId?: string;
  timestamp?: number;
}

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
    setWindowTheme: (theme: {
      preference: 'system' | 'light' | 'dark';
      resolvedThemeId: 'white' | 'black';
    }) => ipcRenderer.invoke('app:set-window-theme', theme) as Promise<void>
  },
  diagnostics: {
    markReady: () => ipcRenderer.send('diagnostics:renderer-ready'),
    report: (event: RendererDiagnosticEvent) => ipcRenderer.send('diagnostics:renderer-event', event)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<void>,
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen') as Promise<boolean>,
    setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen) as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>,
    getCursorPosition: () => ipcRenderer.invoke('window:get-cursor-position') as Promise<{
      x: number;
      y: number;
      inside: boolean;
    } | null>
  },
  audio: {
    getOutputSettings: () =>
      ipcRenderer.invoke('audio:get-output-settings') as Promise<AudioOutputSettings>,
    setExclusiveMode: (enabled: boolean) =>
      ipcRenderer.invoke('audio:set-exclusive-mode', enabled) as Promise<AudioOutputSettings>,
    restart: () => ipcRenderer.invoke('audio:restart') as Promise<void>
  },
  tray: {
    updatePlaybackState: (state: {
      title: string;
      artist: string;
      hasSong: boolean;
      isPlaying: boolean;
    }) => ipcRenderer.send('tray:update-playback-state', state),
    onPlaybackAction: (listener: (action: TrayPlaybackAction) => void) => {
      const handlePlaybackAction = (_event: electron.IpcRendererEvent, action: unknown) => {
        if (isTrayPlaybackAction(action)) {
          listener(action);
        }
      };

      ipcRenderer.on('tray:playback-action', handlePlaybackAction);
      return () => ipcRenderer.removeListener('tray:playback-action', handlePlaybackAction);
    }
  },
  music: {
    getLoginStatus: (providerId: string) => ipcRenderer.invoke('music:get-login-status', providerId) as Promise<unknown>,
    login: (providerId: string) => ipcRenderer.invoke('music:login', providerId) as Promise<unknown>,
    logout: (providerId: string) => ipcRenderer.invoke('music:logout', providerId) as Promise<unknown>,
    search: (providerId: string, keyword: string, options?: unknown) =>
      ipcRenderer.invoke('music:search', providerId, keyword, options) as Promise<unknown>,
    getSearchSuggestions: (providerId: string, keyword: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-search-suggestions', providerId, keyword, options) as Promise<unknown>,
    getSearchHotSearches: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-search-hot-searches', providerId, options) as Promise<unknown>,
    searchEntities: (providerId: string, keyword: string, options?: unknown) =>
      ipcRenderer.invoke('music:search-entities', providerId, keyword, options) as Promise<unknown>,
    getUserPlaylists: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-user-playlists', providerId, options) as Promise<unknown>,
    getPlaylistTracks: (providerId: string, playlistId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-playlist-tracks', providerId, playlistId, options) as Promise<unknown>,
    getCharts: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-charts', providerId, options) as Promise<unknown>,
    getChartTracks: (providerId: string, chartId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-chart-tracks', providerId, chartId, options) as Promise<unknown>,
    getPlaylistCategories: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-playlist-categories', providerId, options) as Promise<unknown>,
    getDiscoveredPlaylists: (providerId: string, query: unknown, options?: unknown) =>
      ipcRenderer.invoke('music:get-discovered-playlists', providerId, query, options) as Promise<unknown>,
    getArtistDetail: (providerId: string, artistId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-artist-detail', providerId, artistId, options) as Promise<unknown>,
    getAlbumDetail: (providerId: string, albumId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-album-detail', providerId, albumId, options) as Promise<unknown>,
    getRecommendationHome: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-recommendation-home', providerId, options) as Promise<unknown>,
    getNewAlbums: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-new-albums', providerId, options) as Promise<unknown>,
    getHomepageBlocks: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-homepage-blocks', providerId, options) as Promise<unknown>,
    getSimilarSongs: (providerId: string, song: unknown, options?: unknown) =>
      ipcRenderer.invoke('music:get-similar-songs', providerId, song, options) as Promise<unknown>,
    getRecommendationHistoryDates: (providerId: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-recommendation-history-dates', providerId, options) as Promise<unknown>,
    getRecommendationHistory: (providerId: string, date: string, options?: unknown) =>
      ipcRenderer.invoke('music:get-recommendation-history', providerId, date, options) as Promise<unknown>,
    getProgramPlayback: (providerId: string, program: unknown) =>
      ipcRenderer.invoke('music:get-program-playback', providerId, program) as Promise<unknown>,
    startRadioSession: (providerId: string) =>
      ipcRenderer.invoke('music:start-radio-session', providerId) as Promise<unknown>,
    refillRadioSession: (session: unknown) =>
      ipcRenderer.invoke('music:refill-radio-session', session) as Promise<unknown>,
    skipRadioSessionItem: (session: unknown, item: unknown) =>
      ipcRenderer.invoke('music:skip-radio-session-item', session, item) as Promise<unknown>,
    submitRadioNegativeFeedback: (session: unknown, item: unknown) =>
      ipcRenderer.invoke('music:submit-radio-negative-feedback', session, item) as Promise<unknown>,
    getSongUrl: (providerId: string, song: unknown, quality: string) =>
      ipcRenderer.invoke('music:get-song-url', providerId, song, quality) as Promise<unknown>,
    getLyrics: (providerId: string, song: unknown) =>
      ipcRenderer.invoke('music:get-lyrics', providerId, song) as Promise<unknown>,
    setSongLiked: (providerId: string, song: unknown, liked: boolean) =>
      ipcRenderer.invoke('music:set-song-liked', providerId, song, liked) as Promise<unknown>,
    addSongToPlaylist: (providerId: string, song: unknown, playlistId: string) =>
      ipcRenderer.invoke('music:add-song-to-playlist', providerId, song, playlistId) as Promise<unknown>,
    removeSongFromPlaylist: (providerId: string, song: unknown, playlistId: string) =>
      ipcRenderer.invoke('music:remove-song-from-playlist', providerId, song, playlistId) as Promise<unknown>,
    importLocalFiles: () => ipcRenderer.invoke('music:import-local-files') as Promise<unknown>
  }
};

function isTrayPlaybackAction(value: unknown): value is TrayPlaybackAction {
  return value === 'previous' || value === 'toggle' || value === 'next';
}

contextBridge.exposeInMainWorld('musicPlayer', api);

export type MusicPlayerApi = typeof api;
