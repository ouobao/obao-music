import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron main window chrome', () => {
  const mainProcessSource = readFileSync(resolve(process.cwd(), 'electron/main.cts'), 'utf8');
  const preloadSource = readFileSync(resolve(process.cwd(), 'electron/preload.cts'), 'utf8');
  const rendererMainSource = readFileSync(resolve(process.cwd(), 'src/renderer/main.tsx'), 'utf8');
  const identityRegistrationSource = readFileSync(
    resolve(process.cwd(), 'scripts/register-windows-identity.cjs'),
    'utf8'
  );

  it('keeps Windows native frame behavior while exposing window control IPC channels', () => {
    expect(mainProcessSource).toContain("frame: process.platform === 'win32'");
    expect(mainProcessSource).toContain("titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'");
    expect(mainProcessSource).toContain('window:minimize');
    expect(mainProcessSource).toContain('window:toggle-maximize');
    expect(mainProcessSource).toContain('window:toggle-fullscreen');
    expect(mainProcessSource).toContain('window:set-fullscreen');
    expect(mainProcessSource).toContain('window:close');
  });

  it('uses the Ou Bao identity and a packaged-aware brand icon without changing the application name', () => {
    expect(mainProcessSource).toContain("const APP_NAME = '欧包音乐'");
    expect(mainProcessSource).toContain("const APP_ID = 'com.oubao.music'");
    expect(mainProcessSource).toContain("app.setAppUserModelId(APP_ID)");
    expect(mainProcessSource).toContain("app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')");
    expect(mainProcessSource).toContain("function getBrandAssetPath(fileName: 'oubao-logo.ico' | 'oubao-logo.png' | 'oubao-tray.png')");
    expect(mainProcessSource).toContain("path.join(resourceRoot, 'assets', 'branding', fileName)");
    expect(mainProcessSource).toContain('title: APP_NAME');
    expect(mainProcessSource).toContain("icon: getBrandAssetPath('oubao-logo.png')");
    expect(mainProcessSource).toContain('backgroundColor: getWindowBackgroundColor()');
    expect(mainProcessSource).toContain("return useDarkBackground ? '#07171a' : '#f7f4f4'");
    expect(mainProcessSource).not.toContain('app.setName(');
  });

  it('provides Windows with branded taskbar identity details in development and packaged builds', () => {
    expect(mainProcessSource).toContain('configureWindowsAppIdentity(window)');
    expect(mainProcessSource).toContain("if (process.platform !== 'win32')");
    expect(mainProcessSource).toContain('window.setAppDetails({');
    expect(mainProcessSource).toContain('appId: APP_ID');
    expect(mainProcessSource).toContain("appIconPath: getBrandAssetPath('oubao-logo.ico')");
    expect(mainProcessSource).toContain('appIconIndex: 0');
    expect(mainProcessSource).toContain('relaunchCommand: getWindowsRelaunchCommand()');
    expect(mainProcessSource).toContain('relaunchDisplayName: APP_NAME');
    expect(mainProcessSource).toContain('app.isPackaged ? executable : `${executable} "${app.getAppPath()}"`');
  });

  it('provides an explicit Windows shortcut registration path for the media-session identity', () => {
    expect(identityRegistrationSource).toContain('const APP_ID = "com.oubao.music"');
    expect(identityRegistrationSource).toContain('const APP_NAME = "欧包音乐"');
    expect(identityRegistrationSource).toContain('shell.writeShortcutLink');
    expect(identityRegistrationSource).toContain('appUserModelId: APP_ID');
    expect(identityRegistrationSource).toContain('"oubao-logo.ico"');
    expect(identityRegistrationSource).toContain('"Start Menu"');
  });

  it('preserves the existing user data directory across the package rename', () => {
    const userDataOverride = "app.setPath('userData', path.join(app.getPath('appData'), 'electron-music-player'))";

    expect(mainProcessSource).toContain(userDataOverride);
    expect(mainProcessSource.indexOf(userDataOverride)).toBeLessThan(
      mainProcessSource.indexOf("app.getPath('userData')")
    );
  });

  it('keeps close requests in the tray and restores the same main window', () => {
    expect(mainProcessSource).toContain('let mainWindow: electron.BrowserWindow | null = null');
    expect(mainProcessSource).toContain('let tray: electron.Tray | null = null');
    expect(mainProcessSource).toContain('let isQuitting = false');
    expect(mainProcessSource).toMatch(/window\.on\('close',[\s\S]*?if \(isQuitting\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?window\.hide\(\)[\s\S]*?window\.setSkipTaskbar\(true\)/);
    expect(mainProcessSource).toMatch(/function restoreMainWindow[\s\S]*?mainWindow\.setSkipTaskbar\(false\)[\s\S]*?mainWindow\.restore\(\)[\s\S]*?mainWindow\.show\(\)[\s\S]*?mainWindow\.focus\(\)/);
    expect(mainProcessSource).not.toContain("app.on('window-all-closed'");
  });

  it('creates a branded tray menu with playback controls and an explicit quit', () => {
    expect(mainProcessSource).toContain("new Tray(getBrandAssetPath('oubao-tray.png'))");
    expect(mainProcessSource).toContain('tray.setToolTip(APP_NAME)');
    expect(mainProcessSource).toContain('Menu.buildFromTemplate');
    expect(mainProcessSource).toContain("id: 'previous-track'");
    expect(mainProcessSource).toContain("id: 'toggle-playback'");
    expect(mainProcessSource).toContain("label: trayPlaybackState.isPlaying ? '暂停' : '播放'");
    expect(mainProcessSource).toContain("id: 'next-track'");
    expect(mainProcessSource).toContain("mainWindow.webContents.send('tray:playback-action', action)");
    expect(mainProcessSource).toContain("ipcMain.on('tray:update-playback-state'");
    expect(mainProcessSource).toContain('event.sender !== mainWindow.webContents');
    expect(mainProcessSource).toContain('label: `显示${APP_NAME}`');
    expect(mainProcessSource).toContain('label: `退出${APP_NAME}`');
    expect(mainProcessSource).toContain("tray.on('click', restoreMainWindow)");
    expect(mainProcessSource).toMatch(/app\.on\('before-quit',[\s\S]*?isQuitting = true/);

    expect(preloadSource).toContain("ipcRenderer.send('tray:update-playback-state', state)");
    expect(preloadSource).toContain("ipcRenderer.on('tray:playback-action', handlePlaybackAction)");
    expect(preloadSource).toContain("ipcRenderer.removeListener('tray:playback-action', handlePlaybackAction)");
  });

  it('uses a process-level single-instance lock and restores the hidden window on relaunch', () => {
    expect(mainProcessSource).toContain('app.requestSingleInstanceLock()');
    expect(mainProcessSource).toMatch(/if \(!hasSingleInstanceLock\)[\s\S]*?app\.quit\(\)/);
    expect(mainProcessSource).toMatch(/app\.on\('second-instance',[\s\S]*?restoreMainWindow\(\)/);
  });

  it('uses a dedicated fullscreen IPC channel for lyrics page maximize behavior', () => {
    expect(mainProcessSource).toContain('window:toggle-fullscreen');
    expect(mainProcessSource).toContain('setWindowFullscreen(targetWindow, !fullscreenTransitions.getDesiredState(targetWindow))');
    expect(mainProcessSource).toContain('window:set-fullscreen');
    expect(mainProcessSource).toContain('return setWindowFullscreen(targetWindow, Boolean(fullscreen))');
    expect(preloadSource).toContain('toggleFullscreen');
    expect(preloadSource).toContain("ipcRenderer.invoke('window:toggle-fullscreen')");
    expect(preloadSource).toContain('setFullscreen');
    expect(preloadSource).toContain("ipcRenderer.invoke('window:set-fullscreen', fullscreen)");
  });

  it('leaves fullscreen before normal maximize and minimize window actions', () => {
    const maximizeHandler = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('window:toggle-maximize'"),
      mainProcessSource.indexOf("ipcMain.handle('window:toggle-fullscreen'")
    );
    const minimizeHandler = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('window:minimize'"),
      mainProcessSource.indexOf("ipcMain.handle('window:toggle-maximize'")
    );
    expect(maximizeHandler).toMatch(/isFullScreen\(\)[\s\S]*?await setWindowFullscreen\(targetWindow, false\)[\s\S]*?return;/);
    expect(maximizeHandler.indexOf('isFullScreen()')).toBeLessThan(maximizeHandler.indexOf('isMaximized()'));
    expect(minimizeHandler).toContain('const fullscreenState = await setWindowFullscreen(targetWindow, false)');
    expect(minimizeHandler).toContain('if (fullscreenState)');
    expect(minimizeHandler.indexOf('setWindowFullscreen')).toBeLessThan(minimizeHandler.indexOf('targetWindow.minimize()'));
    expect(mainProcessSource).toContain("import { createFullscreenTransitionController } from './windowFullscreenController.cjs'");
    expect(mainProcessSource).toContain('fullscreenTransitions.hasPendingTransition(targetWindow)');
    expect(mainProcessSource).toContain('!fullscreenTransitions.getDesiredState(targetWindow)');
  });

  it('exposes cursor coordinates from the main process for native drag-region depth', () => {
    expect(mainProcessSource).toContain('screen.getCursorScreenPoint()');
    expect(mainProcessSource).toContain("ipcMain.handle('window:get-cursor-position'");
    expect(mainProcessSource).toContain('getContentBounds()');
    expect(preloadSource).toContain('getCursorPosition');
    expect(preloadSource).toContain("ipcRenderer.invoke('window:get-cursor-position')");
  });

  it('does not expose renderer-driven window capture IPC for popover styling', () => {
    expect(mainProcessSource).not.toContain("ipcMain.handle('visual:capture-popover-backdrop'");
    expect(mainProcessSource).not.toContain('capturePage');
    expect(preloadSource).not.toContain('capturePopoverBackdrop');
    expect(preloadSource).not.toContain("ipcRenderer.invoke('visual:capture-popover-backdrop'");
  });

  it('registers the scoped QQ cover image CORS policy before creating the main window', () => {
    expect(mainProcessSource).toContain("import { registerQqCoverImageCorsPolicy } from './qqCoverImageCors.cjs'");
    const readyBlock = mainProcessSource.slice(mainProcessSource.indexOf('app.whenReady().then'));

    expect(readyBlock.indexOf('registerQqCoverImageCorsPolicy(session.defaultSession)')).toBeGreaterThanOrEqual(0);
    expect(readyBlock.indexOf('registerQqCoverImageCorsPolicy(session.defaultSession)')).toBeLessThan(
      readyBlock.indexOf('createMainWindow()')
    );
    expect(preloadSource).not.toContain("ipcRenderer.invoke('visual:get-cover");
  });

  it('registers provider IPC channels behind the music namespace', () => {
    expect(mainProcessSource).toContain('music:get-login-status');
    expect(mainProcessSource).toContain('music:login');
    expect(mainProcessSource).toContain('music:logout');
    expect(mainProcessSource).toContain('music:get-user-playlists');
    expect(mainProcessSource).toContain('music:get-playlist-tracks');
    expect(mainProcessSource).toContain('music:get-charts');
    expect(mainProcessSource).toContain('music:get-chart-tracks');
    expect(mainProcessSource).toContain('music:get-playlist-categories');
    expect(mainProcessSource).toContain('music:get-discovered-playlists');
    expect(mainProcessSource).toContain('music:get-artist-detail');
    expect(mainProcessSource).toContain('music:get-album-detail');
    expect(mainProcessSource).toContain('music:get-recommendation-home');
    expect(mainProcessSource).toContain('music:get-new-albums');
    expect(mainProcessSource).toContain('music:get-homepage-blocks');
    expect(mainProcessSource).toContain('music:get-similar-songs');
    expect(mainProcessSource).toContain('music:get-program-playback');
    expect(mainProcessSource).toContain('music:start-radio-session');
    expect(mainProcessSource).toContain('music:refill-radio-session');
    expect(mainProcessSource).toContain('music:skip-radio-session-item');
    expect(mainProcessSource).toContain('music:submit-radio-negative-feedback');
    expect(mainProcessSource).toContain('music:get-song-url');
    expect(mainProcessSource).toContain('music:search');
    expect(mainProcessSource).toContain('music:get-search-suggestions');
    expect(mainProcessSource).toContain('music:get-search-hot-searches');
    expect(mainProcessSource).toContain('music:search-entities');
    expect(mainProcessSource).toContain('music:get-lyrics');
    expect(mainProcessSource).toContain('music:set-song-liked');
    expect(mainProcessSource).toContain('music:add-song-to-playlist');
    expect(mainProcessSource).toContain('music:remove-song-from-playlist');
    expect(mainProcessSource).toContain('music:import-local-files');
    expect(mainProcessSource).toContain('localProvider');
    expect(mainProcessSource).toContain('createFileCacheStore');
    expect(mainProcessSource).toContain('createFileLocalLibraryStore');
    expect(mainProcessSource).toContain("app.getPath('userData')");
    expect(mainProcessSource).toContain('provider-cache.json');
    expect(mainProcessSource).toContain('local-library.json');
    expect(mainProcessSource).toContain('未发现支持的本地音频文件');
    expect(mainProcessSource).toContain('createNeteaseProvider');
    expect(mainProcessSource).toContain('createQQProvider');

    expect(preloadSource).toContain('getLoginStatus');
    expect(preloadSource).toContain('getUserPlaylists');
    expect(preloadSource).toContain('getPlaylistTracks');
    expect(preloadSource).toContain('getCharts');
    expect(preloadSource).toContain('getChartTracks');
    expect(preloadSource).toContain('getPlaylistCategories');
    expect(preloadSource).toContain('getDiscoveredPlaylists');
    expect(preloadSource).toContain('getArtistDetail');
    expect(preloadSource).toContain('getAlbumDetail');
    expect(preloadSource).toContain('getRecommendationHome');
    expect(preloadSource).toContain('getNewAlbums');
    expect(preloadSource).toContain('getHomepageBlocks');
    expect(preloadSource).toContain('getSimilarSongs');
    expect(preloadSource).toContain('getProgramPlayback');
    expect(preloadSource).toContain('startRadioSession');
    expect(preloadSource).toContain('refillRadioSession');
    expect(preloadSource).toContain('skipRadioSessionItem');
    expect(preloadSource).toContain('submitRadioNegativeFeedback');
    expect(preloadSource).toContain('getSongUrl');
    expect(preloadSource).toContain('search');
    expect(preloadSource).toContain('getSearchSuggestions');
    expect(preloadSource).toContain('getSearchHotSearches');
    expect(preloadSource).toContain('searchEntities');
    expect(preloadSource).toContain('getLyrics');
    expect(preloadSource).toContain('setSongLiked');
    expect(preloadSource).toContain('addSongToPlaylist');
    expect(preloadSource).toContain('removeSongFromPlaylist');
    expect(preloadSource).toContain('importLocalFiles');
  });

  it('routes current-song similar requests through a dedicated provider capability', () => {
    expect(mainProcessSource).toContain("ipcMain.handle('music:get-similar-songs'");
    expect(mainProcessSource).toContain("providerRegistry.runCapability(providerId, 'similarSongs'");
    expect(mainProcessSource).toContain('capability.getSimilarSongs(song, options)');
    expect(preloadSource).toContain(
      "ipcRenderer.invoke('music:get-similar-songs', providerId, song, options)"
    );
  });

  it('routes homepage block requests through a dedicated provider capability', () => {
    expect(mainProcessSource).toContain("ipcMain.handle('music:get-homepage-blocks'");
    expect(mainProcessSource).toContain("providerRegistry.runCapability(providerId, 'homepageBlocks'");
    expect(mainProcessSource).toContain('capability.getHomepageBlocks(options)');
    expect(preloadSource).toContain(
      "ipcRenderer.invoke('music:get-homepage-blocks', providerId, options)"
    );
  });

  it('routes release catalogs through a dedicated capability', () => {
    expect(mainProcessSource).toContain("ipcMain.handle('music:get-new-albums'");
    expect(mainProcessSource).toContain("providerRegistry.runCapability(providerId, 'releaseCatalog'");
    expect(mainProcessSource).toContain('capability.getNewAlbums(options)');
    expect(preloadSource).toContain("ipcRenderer.invoke('music:get-new-albums', providerId, options)");
  });

  it('routes program playback through a dedicated capability and hides its provider URL', () => {
    expect(mainProcessSource).toContain("ipcMain.handle('music:get-program-playback'");
    expect(mainProcessSource).toContain("providerRegistry.runCapability(providerId, 'programPlayback'");
    expect(mainProcessSource).toContain('capability.getProgramPlayback(program)');
    expect(mainProcessSource).toMatch(/music:get-program-playback[\s\S]*?audioSourceRegistry\.register\(\{[\s\S]*?providerId: result\.data\.providerId[\s\S]*?url: result\.data\.url/);
    expect(preloadSource).toContain(
      "ipcRenderer.invoke('music:get-program-playback', providerId, program)"
    );
  });

  it('routes radio session commands through a dedicated capability without feed or URL fallback', () => {
    expect(mainProcessSource).toContain("ipcMain.handle('music:start-radio-session'");
    expect(mainProcessSource).toContain("providerRegistry.runCapability(providerId, 'radioSession'");
    expect(mainProcessSource).toContain('capability.startRadioSession()');
    expect(mainProcessSource).toContain("ipcMain.handle('music:refill-radio-session'");
    expect(mainProcessSource).toContain('capability.refillRadioSession(session)');
    expect(mainProcessSource).toContain("ipcMain.handle('music:skip-radio-session-item'");
    expect(mainProcessSource).toContain('capability.skipRadioSessionItem(session, item)');
    expect(mainProcessSource).toContain("ipcMain.handle('music:submit-radio-negative-feedback'");
    expect(mainProcessSource).toContain('capability.submitRadioNegativeFeedback(session, item)');
    expect(mainProcessSource).toContain("providerRegistry.runCapability(session.providerId, 'radioSession'");
    expect(preloadSource).toContain("ipcRenderer.invoke('music:start-radio-session', providerId)");
    expect(preloadSource).toContain("ipcRenderer.invoke('music:refill-radio-session', session)");
    expect(preloadSource).toContain("ipcRenderer.invoke('music:skip-radio-session-item', session, item)");
    expect(preloadSource).toContain("ipcRenderer.invoke('music:submit-radio-negative-feedback', session, item)");

    const radioHandlers = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('music:start-radio-session'"),
      mainProcessSource.indexOf("ipcMain.handle('music:get-program-playback'")
    );
    expect(radioHandlers).not.toContain('getRecommendationHome');
    expect(radioHandlers).not.toContain('getCharts');
    expect(radioHandlers).not.toContain('getPlaylistTracks');
    expect(radioHandlers).not.toContain('audioSourceRegistry.register');
  });

  it('hides provider playback URLs behind the main-process audio source protocol', () => {
    expect(mainProcessSource).toContain('registerSchemesAsPrivileged');
    expect(mainProcessSource).toContain('registerAudioSourceProtocol');
    expect(mainProcessSource).toContain('createAudioSourceRegistry');
    expect(mainProcessSource).toContain('audioSourceRegistry.register');
    expect(mainProcessSource).toContain('AUDIO_SOURCE_SCHEME');
    expect(mainProcessSource).toContain('sourceSession.fetch(source.url');
    expect(mainProcessSource).toContain("credentials: 'include'");
    expect(mainProcessSource).toContain('referrer: getAudioRequestReferer(source.providerId)');
    expect(mainProcessSource).toContain('session.fromPartition(QQ_LOGIN_PARTITION)');
    expect(mainProcessSource).toContain('session.fromPartition(NETEASE_LOGIN_PARTITION)');
    expect(mainProcessSource).not.toContain('createPartitionCookieHeader');
    expect(mainProcessSource).not.toContain('headers.Cookie');
    expect(mainProcessSource).not.toContain('headers.Referer');
  });

  it('normalizes proxied audio response headers for media element playback', () => {
    expect(mainProcessSource).toContain('createRemoteAudioResponse');
    expect(mainProcessSource).toContain('normalizeAudioResponseHeaders');
    expect(mainProcessSource).toContain('getAudioContentTypeFromUrl');
    expect(mainProcessSource).toContain("request.headers.get('range')");
    expect(mainProcessSource).not.toContain("normalizedHeaders.set('Accept-Ranges', 'bytes')");
    expect(mainProcessSource).toContain("console.info('[QQAudioProxy]'");
  });

  it('loads and applies the Windows exclusive audio preference before Electron becomes ready', () => {
    const preferenceRead = 'const startupAudioOutputPreference = readAudioOutputPreference(audioOutputPreferencePath)';
    const switchAppend = "app.commandLine.appendSwitch('enable-exclusive-audio')";
    const ready = 'app.whenReady().then';

    expect(mainProcessSource).toContain("from './audioOutputPreferences.cjs'");
    expect(mainProcessSource).toContain("path.join(app.getPath('userData'), 'audio-output-settings.json')");
    expect(mainProcessSource).toContain("process.platform === 'win32' && exclusiveModeEnabled");
    expect(mainProcessSource).toContain(preferenceRead);
    expect(mainProcessSource).toContain(switchAppend);
    expect(mainProcessSource.indexOf(preferenceRead)).toBeLessThan(mainProcessSource.indexOf(ready));
    expect(mainProcessSource.indexOf(switchAppend)).toBeLessThan(mainProcessSource.indexOf(ready));
  });

  it('exposes secured audio output settings IPC and persists boolean exclusive mode changes', () => {
    const setHandler = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('audio:set-exclusive-mode'"),
      mainProcessSource.indexOf("ipcMain.handle('audio:restart'")
    );

    expect(mainProcessSource).toContain("ipcMain.handle('audio:get-output-settings'");
    expect(mainProcessSource).toContain("ipcMain.handle('audio:set-exclusive-mode'");
    expect(mainProcessSource).toContain('event.sender !== mainWindow.webContents');
    expect(setHandler).toContain('assertMainWindowSender(event)');
    expect(setHandler).toContain("typeof enabled !== 'boolean'");
    expect(setHandler).toContain('writeAudioOutputPreference(audioOutputPreferencePath, { exclusiveModeEnabled: enabled })');
    expect(setHandler).toContain('return getAudioOutputSettings()');
    expect(preloadSource).toContain("ipcRenderer.invoke('audio:get-output-settings')");
    expect(preloadSource).toContain("ipcRenderer.invoke('audio:set-exclusive-mode', enabled)");
    expect(preloadSource).toContain("ipcRenderer.invoke('audio:restart')");
  });

  it('relaunches the application asynchronously through the audio restart IPC', () => {
    const restartHandler = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('audio:restart'"),
      mainProcessSource.indexOf('function getAudioOutputSettings')
    );

    expect(restartHandler).toContain('assertMainWindowSender(event)');
    expect(restartHandler).toMatch(/setImmediate\(\(\) => \{[\s\S]*?app\.relaunch\(\)[\s\S]*?app\.quit\(\)/);
  });

  it('records Electron process failures, loading stages, and explicit shutdown reasons', () => {
    expect(mainProcessSource).toContain("from './processDiagnostics.cjs'");
    expect(mainProcessSource).toContain(
      'const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);'
    );
    expect(mainProcessSource).toContain("app.on('render-process-gone'");
    expect(mainProcessSource).toContain("invalidateRendererReadyMarker('render-process-gone'");
    expect(mainProcessSource).toContain("app.on('child-process-gone'");
    expect(mainProcessSource).toContain("contents.on('unresponsive'");
    expect(mainProcessSource).toContain("contents.on('responsive'");
    expect(mainProcessSource).toContain("invalidateRendererReadyMarker('did-start-loading'");
    expect(mainProcessSource).toContain('rendererReadyMarkerWritten && isMainWindowContents(contents)');
    expect(mainProcessSource).toContain("'did-fail-load'");
    expect(mainProcessSource).toContain("invalidateRendererReadyMarker('did-fail-load'");
    expect(mainProcessSource).toContain('isMainFrame && isMainWindowContents(contents)');
    expect(mainProcessSource).toContain('diagnostics.invalidateRendererReadyMarker');
    expect(mainProcessSource).toContain("contents.on('preload-error'");
    expect(mainProcessSource).toContain("process.on('uncaughtExceptionMonitor'");
    expect(mainProcessSource).toContain("process.on('unhandledRejection'");
    expect(mainProcessSource).toContain("diagnostics.logError('main-window-load-rejected'");
    expect(mainProcessSource).toContain("diagnostics.markShutdownReason('tray-quit')");
    expect(mainProcessSource).toContain("diagnostics.markShutdownReason('audio-restart'");
  });

  it('accepts bounded renderer diagnostics through a validated preload channel', () => {
    expect(preloadSource).toContain("ipcRenderer.send('diagnostics:renderer-ready')");
    expect(preloadSource).toContain("ipcRenderer.send('diagnostics:renderer-event', event)");
    expect(preloadSource).toContain("level: 'debug' | 'info' | 'warn' | 'error'");
    expect(mainProcessSource).toContain("ipcMain.on('diagnostics:renderer-event'");
    expect(mainProcessSource).toContain('parseRendererDiagnosticEvent(value)');
    expect(mainProcessSource).toContain('RENDERER_DIAGNOSTIC_RATE_LIMIT');
  });

  it('reports renderer readiness even when the root error boundary renders its fallback', () => {
    const renderTree = rendererMainSource.slice(
      rendererMainSource.indexOf('ReactDOM.createRoot'),
      rendererMainSource.indexOf('function RendererReadyReporter')
    );

    expect(renderTree.indexOf('<RendererReadyReporter>')).toBeLessThan(
      renderTree.indexOf('<RendererErrorBoundary')
    );
    expect(renderTree.indexOf('</RendererErrorBoundary>')).toBeLessThan(
      renderTree.indexOf('</RendererReadyReporter>')
    );
  });

  it('keeps Vite alive while the development supervisor restarts Electron', () => {
    const restartHandler = mainProcessSource.slice(
      mainProcessSource.indexOf("ipcMain.handle('audio:restart'"),
      mainProcessSource.indexOf('function getAudioOutputSettings')
    );

    expect(restartHandler).toContain('if (isDev)');
    expect(restartHandler).toContain('app.exit(DEV_RESTART_EXIT_CODE)');
    expect(restartHandler.indexOf('app.exit(DEV_RESTART_EXIT_CODE)')).toBeLessThan(
      restartHandler.indexOf('app.relaunch()')
    );
  });
});
