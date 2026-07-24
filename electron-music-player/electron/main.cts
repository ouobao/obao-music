import electron = require('electron');
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path = require('node:path');
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_SOURCE_SCHEME,
  createAudioSourceRegistry,
  type AudioSourceRegistry,
  type RegisteredAudioSource
} from './audioSourceRegistry.cjs';
import {
  createAudioOutputSettings,
  readAudioOutputPreference,
  writeAudioOutputPreference,
  type AudioOutputSettings
} from './audioOutputPreferences.cjs';
import { createLocalProvider, type LocalMusicProvider } from './providers/localProvider.cjs';
import { createNeteaseProvider, NETEASE_LOGIN_PARTITION, NETEASE_LOGIN_URL } from './providers/neteaseProvider.cjs';
import { createQQProvider, QQ_LOGIN_PARTITION, QQ_LOGIN_URL } from './providers/qqProvider.cjs';
import { createProviderRegistry, type ProviderRegistry } from './providers/registry.cjs';
import type { ProviderId } from './providers/types.cjs';
import { createProcessDiagnostics, sanitizeDiagnosticUrl } from './processDiagnostics.cjs';
import { registerQqCoverImageCorsPolicy } from './qqCoverImageCors.cjs';
import { createFileCacheStore } from './storage/cacheStore.cjs';
import { createFileLocalLibraryStore } from './storage/localLibraryStore.cjs';
import { prepareRuntimePaths } from './runtimePaths.cjs';
import { createFullscreenTransitionController } from './windowFullscreenController.cjs';

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, screen, session, shell, Tray } = electron;
const APP_NAME = '欧包音乐';
const APP_ID = 'com.oubao.music';
const DEV_RESTART_EXIT_CODE = 75;
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const audioSourceRegistry = createAudioSourceRegistry();
const fullscreenTransitions = createFullscreenTransitionController();
let mainWindow: electron.BrowserWindow | null = null;
let tray: electron.Tray | null = null;
let isQuitting = false;
let rendererReadyMarkerWritten = false;
let rendererThemePreference: 'system' | 'light' | 'dark' = 'system';
let rendererDiagnosticWindowStartedAt = 0;
let rendererDiagnosticEventCount = 0;
let rendererDiagnosticRateLimitLogged = false;
type TrayPlaybackAction = 'previous' | 'toggle' | 'next';
type RendererDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
interface TrayPlaybackState {
  title: string;
  artist: string;
  hasSong: boolean;
  isPlaying: boolean;
}
const emptyTrayPlaybackState: TrayPlaybackState = {
  title: '',
  artist: '',
  hasSong: false,
  isPlaying: false
};
let trayPlaybackState = emptyTrayPlaybackState;
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};
const RENDERER_DIAGNOSTIC_LEVELS = new Set<RendererDiagnosticLevel>(['debug', 'info', 'warn', 'error']);
const RENDERER_DIAGNOSTIC_FIELDS = new Set([
  'level',
  'event',
  'area',
  'message',
  'stack',
  'route',
  'entityId',
  'timestamp'
]);
const RENDERER_DIAGNOSTIC_RATE_WINDOW_MS = 60_000;
const RENDERER_DIAGNOSTIC_RATE_LIMIT = 180;

let runtimePaths: ReturnType<typeof prepareRuntimePaths>;

try {
  runtimePaths = prepareRuntimePaths({ isPackaged: app.isPackaged });
  app.setPath('userData', runtimePaths.userDataPath);
  app.setPath('sessionData', runtimePaths.sessionDataPath);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('欧包音乐无法启动', `${message}\n\n请使用 --oubao-data-dir 指定一个可写的数据目录后重试。`);
  app.exit(1);
  throw error;
}

const diagnostics = createProcessDiagnostics({
  filePath: path.join(runtimePaths.logsPath, 'electron-main.jsonl')
});
const rendererReadyMarkerPath = isDev
  ? process.env.ELECTRON_RENDERER_READY_FILE?.trim() || null
  : null;

const audioOutputPreferencePath = path.join(runtimePaths.businessDataPath, 'audio-output-settings.json');
const startupAudioOutputPreference = readAudioOutputPreference(audioOutputPreferencePath);
let exclusiveModeEnabled = startupAudioOutputPreference.exclusiveModeEnabled;
const activeExclusiveMode = process.platform === 'win32' && exclusiveModeEnabled;

if (activeExclusiveMode) {
  app.commandLine.appendSwitch('enable-exclusive-audio');
}

registerProcessDiagnostics();
diagnostics.log('process-start', {
  parentPid: process.ppid,
  isDev,
  isPackaged: app.isPackaged,
  storageMode: runtimePaths.mode,
  storagePathSource: runtimePaths.source,
  sessionDataConfigured: true,
  activeExclusiveMode,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: AUDIO_SOURCE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function registerProcessDiagnostics(): void {
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    diagnostics.logError('uncaught-exception', error, { origin });
  });
  process.on('unhandledRejection', (reason) => {
    diagnostics.logError('unhandled-rejection', reason);
  });
  process.on('exit', (exitCode) => {
    diagnostics.log('process-exit', {
      exitCode,
      shutdownReason: diagnostics.getShutdownReason()
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    diagnostics.log('web-contents-created', getWebContentsDiagnosticDetails(contents));
    registerWebContentsDiagnostics(contents);
  });
  app.on('render-process-gone', (_event, contents, details) => {
    const processGoneDetails = {
      ...getWebContentsDiagnosticDetails(contents),
      ...details
    };
    diagnostics.log('render-process-gone', processGoneDetails);
    if (isMainWindowContents(contents)) {
      invalidateRendererReadyMarker('render-process-gone', processGoneDetails);
    }
  });
  app.on('child-process-gone', (_event, details) => {
    diagnostics.log('child-process-gone', { ...details });
  });
  app.on('will-quit', () => {
    diagnostics.log('app-will-quit', { shutdownReason: diagnostics.getShutdownReason() });
  });
  app.on('quit', (_event, exitCode) => {
    diagnostics.log('app-quit', {
      exitCode,
      shutdownReason: diagnostics.getShutdownReason()
    });
  });
}

function registerWebContentsDiagnostics(contents: electron.WebContents): void {
  contents.on('did-start-loading', () => {
    const loadDetails = getWebContentsDiagnosticDetails(contents);
    diagnostics.log('load-did-start', loadDetails);
    if (rendererReadyMarkerWritten && isMainWindowContents(contents)) {
      invalidateRendererReadyMarker('did-start-loading', loadDetails);
    }
  });
  contents.on('dom-ready', () => {
    diagnostics.log('load-dom-ready', getWebContentsDiagnosticDetails(contents));
  });
  contents.on('did-finish-load', () => {
    diagnostics.log('load-did-finish', getWebContentsDiagnosticDetails(contents));
  });
  contents.on('did-stop-loading', () => {
    diagnostics.log('load-did-stop', getWebContentsDiagnosticDetails(contents));
  });
  contents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame, frameProcessId, frameRoutingId) => {
      const loadFailureDetails = {
        ...getWebContentsDiagnosticDetails(contents),
        errorCode,
        errorDescription,
        validatedUrl: sanitizeDiagnosticUrl(validatedURL),
        isMainFrame,
        frameProcessId,
        frameRoutingId
      };
      diagnostics.log('did-fail-load', loadFailureDetails);
      if (isMainFrame && isMainWindowContents(contents)) {
        invalidateRendererReadyMarker('did-fail-load', loadFailureDetails);
      }
    }
  );
  contents.on('preload-error', (_event, preloadPath, error) => {
    diagnostics.logError('preload-error', error, {
      ...getWebContentsDiagnosticDetails(contents),
      preload: path.basename(preloadPath)
    });
  });
  contents.on('unresponsive', () => {
    diagnostics.log('renderer-unresponsive', getWebContentsDiagnosticDetails(contents));
  });
  contents.on('responsive', () => {
    diagnostics.log('renderer-responsive', getWebContentsDiagnosticDetails(contents));
  });
}

function isMainWindowContents(contents: electron.WebContents): boolean {
  if (!mainWindow) {
    return false;
  }

  try {
    return !mainWindow.isDestroyed() && mainWindow.webContents === contents;
  } catch {
    return false;
  }
}

function invalidateRendererReadyMarker(reason: string, details: Record<string, unknown> = {}): void {
  rendererReadyMarkerWritten = false;
  if (!rendererReadyMarkerPath) {
    return;
  }

  diagnostics.invalidateRendererReadyMarker(rendererReadyMarkerPath, reason, details);
}

function getWebContentsDiagnosticDetails(contents: electron.WebContents): Record<string, unknown> {
  try {
    const currentUrl = contents.getURL();
    return {
      webContentsId: contents.id,
      webContentsType: contents.getType(),
      url: currentUrl ? sanitizeDiagnosticUrl(currentUrl) : 'empty'
    };
  } catch {
    return {
      webContentsId: contents.id,
      state: 'destroyed'
    };
  }
}

function createMusicProviderRegistry() {
  const providerCache = createFileCacheStore(path.join(runtimePaths.businessDataPath, 'provider-cache.json'));
  const localLibraryStore = createFileLocalLibraryStore(path.join(runtimePaths.businessDataPath, 'local-library.json'));
  const localProvider = createLocalProvider(localLibraryStore);

  return createProviderRegistry([
    createNeteaseProvider(undefined, providerCache),
    createQQProvider(undefined, providerCache),
    localProvider
  ]);
}

function getBrandAssetPath(fileName: 'oubao-logo.ico' | 'oubao-logo.png' | 'oubao-tray.png'): string {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  return path.join(resourceRoot, 'assets', 'branding', fileName);
}

function configureWindowsAppIdentity(window: electron.BrowserWindow): void {
  if (process.platform !== 'win32') {
    return;
  }

  window.setAppDetails({
    appId: APP_ID,
    appIconPath: getBrandAssetPath('oubao-logo.ico'),
    appIconIndex: 0,
    relaunchCommand: getWindowsRelaunchCommand(),
    relaunchDisplayName: APP_NAME
  });
}

function getWindowsRelaunchCommand(): string {
  const executable = `"${process.execPath}"`;
  return app.isPackaged ? executable : `${executable} "${app.getAppPath()}"`;
}

function createMainWindow(): electron.BrowserWindow {
  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1040,
    minHeight: 680,
    title: APP_NAME,
    icon: getBrandAssetPath('oubao-logo.png'),
    frame: process.platform === 'win32',
    autoHideMenuBar: true,
    backgroundColor: getWindowBackgroundColor(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = window;
  configureWindowsAppIdentity(window);
  diagnostics.log('main-window-created', {
    windowId: window.id,
    width: 1220,
    height: 780
  });

  window.on('close', (event) => {
    diagnostics.log('main-window-close-requested', {
      windowId: window.id,
      isQuitting
    });
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();
    window.setSkipTaskbar(true);
  });

  window.on('closed', () => {
    diagnostics.log('main-window-closed', { windowId: window.id });
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    diagnostics.log('external-open-requested', { url: sanitizeDiagnosticUrl(url) });
    void shell.openExternal(url).catch((error) => {
      diagnostics.logError('external-open-rejected', error, { url: sanitizeDiagnosticUrl(url) });
    });
    return { action: 'deny' };
  });

  loadMainWindow(window);

  return window;
}

function loadMainWindow(window: electron.BrowserWindow): void {
  const loadKind = isDev && process.env.VITE_DEV_SERVER_URL ? 'url' : 'file';
  const target = loadKind === 'url' && process.env.VITE_DEV_SERVER_URL
    ? sanitizeDiagnosticUrl(process.env.VITE_DEV_SERVER_URL)
    : 'file:///[app-renderer]';
  diagnostics.log('main-window-load-requested', {
    windowId: window.id,
    loadKind,
    target
  });

  let loadPromise: Promise<void>;
  try {
    loadPromise = loadKind === 'url' && process.env.VITE_DEV_SERVER_URL
      ? window.loadURL(process.env.VITE_DEV_SERVER_URL)
      : window.loadFile(path.join(__dirname, '../dist/index.html'));
  } catch (error) {
    diagnostics.logError('main-window-load-threw', error, { windowId: window.id, loadKind, target });
    return;
  }

  void loadPromise
    .then(() => {
      diagnostics.log('main-window-load-resolved', { windowId: window.id, loadKind, target });
    })
    .catch((error) => {
      diagnostics.logError('main-window-load-rejected', error, { windowId: window.id, loadKind, target });
    });
}

function getWindowBackgroundColor(resolvedThemeId?: 'white' | 'black'): string {
  const useDarkBackground = resolvedThemeId
    ? resolvedThemeId === 'black'
    : nativeTheme.shouldUseDarkColors;
  return useDarkBackground ? '#07171a' : '#f7f4f4';
}

function applyWindowBackground(resolvedThemeId?: 'white' | 'black'): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setBackgroundColor(getWindowBackgroundColor(resolvedThemeId));
}

function registerDiagnosticIpcHandlers(): void {
  ipcMain.on('diagnostics:renderer-ready', (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      diagnostics.log('renderer-ready-rejected', { senderId: event.sender.id });
      return;
    }

    diagnostics.log('renderer-ready', getWebContentsDiagnosticDetails(event.sender));
    if (!rendererReadyMarkerPath || rendererReadyMarkerWritten) {
      return;
    }

    rendererReadyMarkerWritten = diagnostics.writeRendererReadyMarker(rendererReadyMarkerPath, {
      source: 'react-root-mounted',
      ...getWebContentsDiagnosticDetails(event.sender)
    });
  });

  ipcMain.on('diagnostics:renderer-event', (event, value: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      diagnostics.log('renderer-event-rejected', { reason: 'invalid-sender', senderId: event.sender.id });
      return;
    }

    if (!consumeRendererDiagnosticRateLimit()) {
      if (!rendererDiagnosticRateLimitLogged) {
        rendererDiagnosticRateLimitLogged = true;
        diagnostics.log('renderer-event-rate-limited', { limit: RENDERER_DIAGNOSTIC_RATE_LIMIT });
      }
      return;
    }

    const rendererEvent = parseRendererDiagnosticEvent(value);
    if (!rendererEvent) {
      diagnostics.log('renderer-event-rejected', { reason: 'invalid-payload' });
      return;
    }

    diagnostics.log('renderer-event', rendererEvent);
  });
}

function parseRendererDiagnosticEvent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !RENDERER_DIAGNOSTIC_FIELDS.has(key))) {
    return null;
  }
  if (typeof candidate.level !== 'string' || !RENDERER_DIAGNOSTIC_LEVELS.has(candidate.level as RendererDiagnosticLevel)) {
    return null;
  }
  if (typeof candidate.event !== 'string') {
    return null;
  }

  const eventName = candidate.event.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/i.test(eventName)) {
    return null;
  }
  for (const field of ['area', 'message', 'stack', 'route', 'entityId'] as const) {
    if (candidate[field] !== undefined && typeof candidate[field] !== 'string') {
      return null;
    }
  }
  if (candidate.timestamp !== undefined && (
    typeof candidate.timestamp !== 'number'
    || !Number.isSafeInteger(candidate.timestamp)
    || candidate.timestamp < 0
  )) {
    return null;
  }

  const route = normalizeRendererDiagnosticText(candidate.route, 256)?.split(/[?#]/, 1)[0];
  return {
    level: candidate.level,
    event: eventName,
    ...optionalDiagnosticField('area', normalizeRendererDiagnosticText(candidate.area, 64)),
    ...optionalDiagnosticField('message', normalizeRendererDiagnosticText(candidate.message, 512)),
    ...optionalDiagnosticField('stack', normalizeRendererDiagnosticText(candidate.stack, 2_048)),
    ...optionalDiagnosticField('route', route),
    ...optionalDiagnosticField('entityId', normalizeRendererDiagnosticText(candidate.entityId, 128)),
    ...(candidate.timestamp === undefined ? {} : { rendererTimestamp: Math.trunc(candidate.timestamp) })
  };
}

function normalizeRendererDiagnosticText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function optionalDiagnosticField(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

function consumeRendererDiagnosticRateLimit(): boolean {
  const now = Date.now();
  if (now - rendererDiagnosticWindowStartedAt >= RENDERER_DIAGNOSTIC_RATE_WINDOW_MS) {
    rendererDiagnosticWindowStartedAt = now;
    rendererDiagnosticEventCount = 0;
    rendererDiagnosticRateLimitLogged = false;
  }

  rendererDiagnosticEventCount += 1;
  return rendererDiagnosticEventCount <= RENDERER_DIAGNOSTIC_RATE_LIMIT;
}

function registerThemeHandlers(): void {
  ipcMain.handle('app:set-window-theme', (event, value: unknown) => {
    assertMainWindowSender(event);
    if (!value || typeof value !== 'object') {
      return;
    }

    const theme = value as Record<string, unknown>;
    if (
      (theme.preference !== 'system' && theme.preference !== 'light' && theme.preference !== 'dark')
      || (theme.resolvedThemeId !== 'white' && theme.resolvedThemeId !== 'black')
    ) {
      return;
    }

    rendererThemePreference = theme.preference;
    applyWindowBackground(theme.resolvedThemeId);
  });

  nativeTheme.on('updated', () => {
    if (rendererThemePreference === 'system') {
      applyWindowBackground();
    }
  });
}

function restoreMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) {
    return;
  }

  tray = new Tray(getBrandAssetPath('oubao-tray.png'));
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on('click', restoreMainWindow);
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      id: 'current-song',
      label: getTraySongLabel(trayPlaybackState),
      enabled: false
    },
    { type: 'separator' },
    {
      id: 'previous-track',
      label: '上一首',
      enabled: trayPlaybackState.hasSong,
      click: () => sendTrayPlaybackAction('previous')
    },
    {
      id: 'toggle-playback',
      label: trayPlaybackState.isPlaying ? '暂停' : '播放',
      enabled: trayPlaybackState.hasSong,
      click: () => sendTrayPlaybackAction('toggle')
    },
    {
      id: 'next-track',
      label: '下一首',
      enabled: trayPlaybackState.hasSong,
      click: () => sendTrayPlaybackAction('next')
    },
    { type: 'separator' },
    {
      label: `显示${APP_NAME}`,
      click: restoreMainWindow
    },
    { type: 'separator' },
    {
      label: `退出${APP_NAME}`,
      click: () => {
        diagnostics.markShutdownReason('tray-quit');
        app.quit();
      }
    }
  ]));
}

function getTraySongLabel(state: TrayPlaybackState): string {
  if (!state.hasSong) {
    return '暂无正在播放的歌曲';
  }

  return [state.title, state.artist].filter(Boolean).join(' - ') || '未知歌曲';
}

function sendTrayPlaybackAction(action: TrayPlaybackAction): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('tray:playback-action', action);
}

function registerTrayPlaybackHandlers(): void {
  ipcMain.on('tray:update-playback-state', (event, value: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return;
    }

    const nextState = parseTrayPlaybackState(value);
    if (!nextState) {
      return;
    }

    trayPlaybackState = nextState;
    updateTrayMenu();
  });
}

function parseTrayPlaybackState(value: unknown): TrayPlaybackState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const state = value as Record<string, unknown>;
  if (typeof state.hasSong !== 'boolean' || typeof state.isPlaying !== 'boolean') {
    return null;
  }

  return {
    title: normalizeTrayText(state.title),
    artist: normalizeTrayText(state.artist),
    hasSong: state.hasSong,
    isPlaying: state.hasSong && state.isPlaying
  };
}

function normalizeTrayText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function registerWindowControlHandlers() {
  ipcMain.handle('window:minimize', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }

    if (targetWindow.isFullScreen() || fullscreenTransitions.hasPendingTransition(targetWindow)) {
      const fullscreenState = await setWindowFullscreen(targetWindow, false);
      if (fullscreenState) {
        return;
      }
    }
    if (!targetWindow.isDestroyed()) {
      targetWindow.minimize();
    }
  });

  ipcMain.handle('window:toggle-maximize', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }

    if (targetWindow.isFullScreen() || fullscreenTransitions.hasPendingTransition(targetWindow)) {
      await setWindowFullscreen(targetWindow, false);
      return;
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
      return;
    }

    targetWindow.maximize();
  });

  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }

    return setWindowFullscreen(targetWindow, !fullscreenTransitions.getDesiredState(targetWindow));
  });

  ipcMain.handle('window:set-fullscreen', (event, fullscreen: boolean) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return false;
    }

    return setWindowFullscreen(targetWindow, Boolean(fullscreen));
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:get-cursor-position', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return null;
    }

    const cursor = screen.getCursorScreenPoint();
    const contentBounds = targetWindow.getContentBounds();
    const x = cursor.x - contentBounds.x;
    const y = cursor.y - contentBounds.y;

    return {
      x,
      y,
      inside: x >= 0 && y >= 0 && x <= contentBounds.width && y <= contentBounds.height
    };
  });
}

function registerAudioOutputHandlers(): void {
  ipcMain.handle('audio:get-output-settings', (event) => {
    assertMainWindowSender(event);
    return getAudioOutputSettings();
  });

  ipcMain.handle('audio:set-exclusive-mode', (event, enabled: unknown) => {
    assertMainWindowSender(event);
    if (typeof enabled !== 'boolean') {
      throw new TypeError('独占模式设置必须是布尔值');
    }

    writeAudioOutputPreference(audioOutputPreferencePath, { exclusiveModeEnabled: enabled });
    exclusiveModeEnabled = enabled;
    return getAudioOutputSettings();
  });

  ipcMain.handle('audio:restart', (event) => {
    assertMainWindowSender(event);
    setImmediate(() => {
      diagnostics.markShutdownReason('audio-restart', { isDev });
      if (isDev) {
        app.exit(DEV_RESTART_EXIT_CODE);
        return;
      }
      app.relaunch();
      app.quit();
    });
  });
}

function getAudioOutputSettings(): AudioOutputSettings {
  return createAudioOutputSettings(process.platform, exclusiveModeEnabled, activeExclusiveMode);
}

function assertMainWindowSender(event: electron.IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('无权访问音频输出设置');
  }
}

function setWindowFullscreen(targetWindow: electron.BrowserWindow, fullscreen: boolean): Promise<boolean> {
  return fullscreenTransitions.setFullscreen(targetWindow, fullscreen);
}

function registerMusicProviderHandlers(providerRegistry: ProviderRegistry, audioSourceRegistry: AudioSourceRegistry) {
  ipcMain.handle('music:get-login-status', (_event, providerId) =>
    providerRegistry.run(providerId, (provider) => provider.getLoginStatus())
  );

  ipcMain.handle('music:login', (_event, providerId) =>
    providerRegistry.run(providerId, (provider) => provider.login())
  );

  ipcMain.handle('music:logout', (_event, providerId) =>
    providerRegistry.run(providerId, (provider) => provider.logout())
  );

  ipcMain.handle('music:search', (_event, providerId, keyword, options) =>
    providerRegistry.run(providerId, (provider) => provider.search(keyword, options))
  );

  ipcMain.handle('music:get-search-suggestions', (_event, providerId, keyword, options) =>
    providerRegistry.runCapability(providerId, 'searchExperience', (capability) =>
      capability.getSuggestions(keyword, options)
    )
  );

  ipcMain.handle('music:get-search-hot-searches', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'searchExperience', (capability) => capability.getHotSearches(options))
  );

  ipcMain.handle('music:search-entities', (_event, providerId, keyword, options) =>
    providerRegistry.runCapability(providerId, 'searchExperience', (capability) =>
      capability.searchEntities(keyword, options)
    )
  );

  ipcMain.handle('music:get-user-playlists', (_event, providerId, options) =>
    providerRegistry.run(providerId, (provider) => provider.getUserPlaylists(options))
  );

  ipcMain.handle('music:get-playlist-tracks', (_event, providerId, playlistId, options) =>
    providerRegistry.run(providerId, (provider) => provider.getPlaylistTracks(playlistId, options))
  );

  ipcMain.handle('music:get-charts', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'charts', (capability) => capability.getCharts(options))
  );

  ipcMain.handle('music:get-chart-tracks', (_event, providerId, chartId, options) =>
    providerRegistry.runCapability(providerId, 'charts', (capability) => capability.getChartTracks(chartId, options))
  );

  ipcMain.handle('music:get-playlist-categories', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'playlistDiscovery', (capability) =>
      capability.getPlaylistCategories(options)
    )
  );

  ipcMain.handle('music:get-discovered-playlists', (_event, providerId, query, options) =>
    providerRegistry.runCapability(providerId, 'playlistDiscovery', (capability) =>
      capability.getDiscoveredPlaylists(query, options)
    )
  );

  ipcMain.handle('music:get-artist-detail', (_event, providerId, artistId, options) =>
    providerRegistry.runCapability(providerId, 'artistCatalog', (capability) =>
      capability.getArtistDetail(artistId, options)
    )
  );

  ipcMain.handle('music:get-album-detail', (_event, providerId, albumId, options) =>
    providerRegistry.runCapability(providerId, 'artistCatalog', (capability) =>
      capability.getAlbumDetail(albumId, options)
    )
  );

  ipcMain.handle('music:get-recommendation-home', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'recommendations', (capability) =>
      capability.getRecommendationHome(options)
    )
  );

  ipcMain.handle('music:get-new-albums', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'releaseCatalog', (capability) =>
      capability.getNewAlbums(options)
    )
  );

  ipcMain.handle('music:get-homepage-blocks', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'homepageBlocks', (capability) =>
      capability.getHomepageBlocks(options)
    )
  );

  ipcMain.handle('music:get-similar-songs', (_event, providerId, song, options) =>
    providerRegistry.runCapability(providerId, 'similarSongs', (capability) =>
      capability.getSimilarSongs(song, options)
    )
  );

  ipcMain.handle('music:get-recommendation-history-dates', (_event, providerId, options) =>
    providerRegistry.runCapability(providerId, 'recommendationHistory', (capability) =>
      capability.getRecentDates(options)
    )
  );

  ipcMain.handle('music:get-recommendation-history', (_event, providerId, date, options) =>
    providerRegistry.runCapability(providerId, 'recommendationHistory', (capability) =>
      capability.getHistory(date, options)
    )
  );

  ipcMain.handle('music:start-radio-session', (_event, providerId) =>
    providerRegistry.runCapability(providerId, 'radioSession', (capability) =>
      capability.startRadioSession()
    )
  );

  ipcMain.handle('music:refill-radio-session', (_event, session) =>
    providerRegistry.runCapability(session.providerId, 'radioSession', (capability) =>
      capability.refillRadioSession(session)
    )
  );

  ipcMain.handle('music:skip-radio-session-item', (_event, session, item) =>
    providerRegistry.runCapability(session.providerId, 'radioSession', (capability) =>
      capability.skipRadioSessionItem(session, item)
    )
  );

  ipcMain.handle('music:submit-radio-negative-feedback', (_event, session, item) =>
    providerRegistry.runCapability(session.providerId, 'radioSession', (capability) =>
      capability.submitRadioNegativeFeedback(session, item)
    )
  );

  ipcMain.handle('music:get-program-playback', async (_event, providerId, program) => {
    const result = await providerRegistry.runCapability(providerId, 'programPlayback', (capability) =>
      capability.getProgramPlayback(program)
    );
    if (!result.ok || !result.data.ok || !result.data.url) {
      return result;
    }

    return {
      ok: true,
      data: {
        ...result.data,
        url: audioSourceRegistry.register({
          providerId: result.data.providerId,
          url: result.data.url
        })
      }
    };
  });

  ipcMain.handle('music:get-song-url', async (_event, providerId, song, quality) => {
    const result = await providerRegistry.run(providerId, (provider) => provider.getSongUrl(song, quality));
    if (!result.ok || !result.data.ok || !result.data.url) {
      return result;
    }

    return {
      ok: true,
      data: {
        ...result.data,
        url: audioSourceRegistry.register({
          providerId: result.data.providerId,
          url: result.data.url
        })
      }
    };
  });

  ipcMain.handle('music:get-lyrics', (_event, providerId, song) =>
    providerRegistry.run(providerId, (provider) => provider.getLyrics(song))
  );

  ipcMain.handle('music:set-song-liked', (_event, providerId, song, liked) =>
    providerRegistry.run(providerId, (provider) => provider.setSongLiked(song, liked))
  );

  ipcMain.handle('music:add-song-to-playlist', (_event, providerId, song, playlistId) =>
    providerRegistry.run(providerId, (provider) => provider.addSongToPlaylist(song, playlistId))
  );

  ipcMain.handle('music:remove-song-from-playlist', (_event, providerId, song, playlistId) =>
    providerRegistry.run(providerId, (provider) => provider.removeSongFromPlaylist(song, playlistId))
  );

  ipcMain.handle('music:import-local-files', async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: '导入本地音乐',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        {
          name: 'Audio Files',
          extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg']
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled) {
      return { ok: true, data: [] };
    }

    const importResult = await providerRegistry.run('local', async (provider) =>
      (provider as LocalMusicProvider).importFiles(result.filePaths)
    );

    if (importResult.ok && importResult.data.length === 0) {
      return {
        ok: false,
        error: {
          code: 'provider_failed',
          providerId: 'local',
          message: '未发现支持的本地音频文件'
        }
      };
    }

    return importResult;
  });
}

function registerAudioSourceProtocol(audioSourceRegistry: AudioSourceRegistry) {
  protocol.handle(AUDIO_SOURCE_SCHEME, async (request) => {
    const source = audioSourceRegistry.resolve(request.url);
    if (!source) {
      return new Response('Audio source expired', { status: 404 });
    }

    try {
      if (source.url.startsWith('file:')) {
        return createFileAudioResponse(source.url, request.headers.get('range'));
      }

      return createRemoteAudioResponse(source, request);
    } catch {
      return new Response('Audio source unavailable', { status: 502 });
    }
  });
}

async function createRemoteAudioResponse(source: RegisteredAudioSource, request: Request): Promise<Response> {
  const sourceSession = getAudioSourceSession(source.providerId);
  const range = request.headers.get('range');
  const response = await sourceSession.fetch(source.url, {
    credentials: 'include',
    referrer: getAudioRequestReferer(source.providerId),
    headers: createAudioRequestHeaders(source.providerId, request),
    redirect: 'follow'
  });

  if (!response.ok && response.status !== 206) {
    return new Response('Audio source unavailable', { status: response.status || 502 });
  }

  if (isDev && source.providerId === 'qq') {
    console.info('[QQAudioProxy]', {
      hasRangeRequest: Boolean(range),
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';')[0] ?? '',
      hasContentRange: response.headers.has('content-range'),
      acceptRanges: response.headers.get('accept-ranges') ?? ''
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeAudioResponseHeaders(response.headers, source.url)
  });
}

function normalizeAudioResponseHeaders(headers: Headers, sourceUrl: string): Headers {
  const normalizedHeaders = new Headers(headers);
  const contentType = normalizedHeaders.get('Content-Type')?.split(';')[0]?.trim().toLocaleLowerCase() ?? '';

  if (!contentType || contentType === 'application/octet-stream' || contentType === 'binary/octet-stream') {
    normalizedHeaders.set('Content-Type', getAudioContentTypeFromUrl(sourceUrl));
  }

  return normalizedHeaders;
}

function getAudioSourceSession(providerId: ProviderId): electron.Session {
  if (providerId === 'qq') {
    return session.fromPartition(QQ_LOGIN_PARTITION);
  }

  if (providerId === 'netease') {
    return session.fromPartition(NETEASE_LOGIN_PARTITION);
  }

  return session.defaultSession;
}

function createAudioRequestHeaders(providerId: ProviderId, request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'audio/*,*/*;q=0.8'
  };
  const range = request.headers.get('range');
  if (range) {
    headers.Range = range;
  }

  return headers;
}

function getAudioRequestReferer(providerId: ProviderId): string {
  if (providerId === 'qq') {
    return QQ_LOGIN_URL;
  }

  if (providerId === 'netease') {
    return NETEASE_LOGIN_URL;
  }

  return '';
}

async function createFileAudioResponse(fileUrl: string, rangeHeader: string | null): Promise<Response> {
  const filePath = fileURLToPath(fileUrl);
  const fileStat = await stat(filePath);
  const range = parseRangeHeader(rangeHeader, fileStat.size);
  const streamOptions = range ? { start: range.start, end: range.end } : undefined;
  const stream = Readable.toWeb(createReadStream(filePath, streamOptions)) as BodyInit;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': getAudioContentType(filePath),
    'Content-Length': String(range ? range.end - range.start + 1 : fileStat.size)
  });

  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`);
  }

  return new Response(stream, {
    status: range ? 206 : 200,
    headers
  });
}

function parseRangeHeader(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  const start = rawStart ? Number(rawStart) : 0;
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= size) {
    return null;
  }

  return { start, end };
}

function getAudioContentType(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase();

  return AUDIO_CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

function getAudioContentTypeFromUrl(sourceUrl: string): string {
  try {
    const extension = path.extname(new URL(sourceUrl).pathname).toLocaleLowerCase();
    return AUDIO_CONTENT_TYPES[extension] ?? 'audio/mpeg';
  } catch {
    return 'audio/mpeg';
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
diagnostics.log('single-instance-lock', { acquired: hasSingleInstanceLock });

if (!hasSingleInstanceLock) {
  diagnostics.markShutdownReason('single-instance-lock-denied');
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    diagnostics.log('second-instance');
    restoreMainWindow();
  });

  app.on('before-quit', () => {
    if (diagnostics.getShutdownReason() === 'running') {
      diagnostics.markShutdownReason('app-quit');
    }
    diagnostics.log('app-before-quit', { shutdownReason: diagnostics.getShutdownReason() });
    isQuitting = true;
  });

  app.whenReady().then(() => {
    diagnostics.log('app-ready', { gpuFeatureStatus: app.getGPUFeatureStatus() });
    const providerRegistry = createMusicProviderRegistry();

    ipcMain.handle('app:get-version', () => app.getVersion());
    registerDiagnosticIpcHandlers();
    registerThemeHandlers();
    registerAudioSourceProtocol(audioSourceRegistry);
    registerAudioOutputHandlers();
    registerWindowControlHandlers();
    registerTrayPlaybackHandlers();
    registerMusicProviderHandlers(providerRegistry, audioSourceRegistry);
    registerQqCoverImageCorsPolicy(session.defaultSession);
    createMainWindow();
    createTray();

    app.on('activate', () => {
      diagnostics.log('app-activate');
      restoreMainWindow();
    });
  }).catch((error) => {
    diagnostics.markShutdownReason('startup-failure');
    diagnostics.logError('app-ready-rejected', error);
    app.exit(1);
  });
}
