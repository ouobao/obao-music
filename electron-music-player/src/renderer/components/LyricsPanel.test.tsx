import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Program } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { neteaseFixtureSong } from '../test/fixtures/musicFixtures';
import { createLyricsRequestKey, useLyricsStore } from '../state/lyricsStore';
import { usePlayerStore } from '../state/playerStore';
import { useSearchStore } from '../state/searchStore';
import { useUiStore } from '../state/uiStore';
import {
  LyricsPanel,
  createAnchoredLyricScrollFrame,
  createCenterReturnPointer,
  getAnchoredLyricScrollTop,
  getAnchoredLyricScrollTopFromRects,
  getLyricAnchorSpaces,
  getLyricFlowRank
} from './LyricsPanel';

const program: Program = {
  id: 'netease:program:lyrics',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: 'lyrics',
  title: 'Program without lyrics',
  description: 'Program fixture',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)',
  podcast: {
    id: 'netease:podcast:lyrics',
    providerId: 'netease',
    platformPodcastId: 'lyrics',
    title: 'Program Podcast',
    description: 'Podcast fixture',
    author: 'Program Host',
    coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:lyrics',
    podcastTitle: 'Program Podcast'
  }
};

describe('LyricsPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.getState().resetForTest();
    useLyricsStore.getState().resetForTest();
    useSearchStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
    installMusicPlayerApiMock();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    usePlayerStore.getState().resetForTest();
    useLyricsStore.getState().resetForTest();
    useSearchStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
  });

  it('passes the current song artwork URL into the lyrics artwork surface', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const artwork = container.querySelector<HTMLElement>('.lyrics-art');

    expect(artwork?.style.getPropertyValue('--song-cover-image')).toContain('song.jpg');
  });

  it('does not request lyrics when the active media is a Program', async () => {
    const getLyrics = vi.spyOn(window.musicPlayer.music, 'getLyrics');
    usePlayerStore.setState({
      currentMedia: program,
      currentSong: null,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);
    await act(async () => Promise.resolve());

    expect(getLyrics).not.toHaveBeenCalled();
  });

  it('does not render lyrics owned by a different song while the current song loads', async () => {
    const staleSong = {
      ...neteaseFixtureSong,
      id: 'netease:stale-song',
      platformSongId: 'stale-song',
      title: 'Stale song'
    };
    const loadLyrics = vi.fn(async () => null);
    useLyricsStore.setState({
      songId: staleSong.id,
      songKey: createLyricsRequestKey(staleSong),
      lrc: '[00:00.00]stale lyric must stay hidden',
      tlyric: null,
      isLoading: false,
      errorMessage: null,
      loadLyrics
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    expect(screen.queryByText('stale lyric must stay hidden')).not.toBeInTheDocument();
    expect(screen.getByText('歌词加载中')).toBeInTheDocument();
    await waitFor(() => expect(loadLyrics).toHaveBeenCalledWith(neteaseFixtureSong));
  });

  it('contains rejected cursor IPC polls without leaving an unhandled rejection', async () => {
    const getCursorPosition = vi.fn().mockRejectedValue(new Error('cursor IPC unavailable'));
    window.musicPlayer.window.getCursorPosition = getCursorPosition;

    const { unmount } = render(<LyricsPanel />);
    await waitFor(() => expect(getCursorPosition).toHaveBeenCalled());
    unmount();
  });

  it('keeps the vignette below the lyrics drawer while the cover flight uses the body portal', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel transitionOrigin={{ left: 20, top: 720, width: 52, height: 52 }} />);

    const overlay = container.querySelector<HTMLElement>('.lyrics-overlay');
    const appVignette = document.body.querySelector<HTMLElement>('.lyrics-transition-app-vignette');
    const flight = document.body.querySelector<HTMLElement>('.lyrics-transition-flight');

    expect(appVignette).toBeInTheDocument();
    expect(flight).toBeInTheDocument();
    expect(overlay).toContainElement(appVignette);
    expect(overlay).not.toContainElement(flight);
    expect(flight).toContainElement(document.body.querySelector('.lyrics-transition-bob'));
    expect(flight).toContainElement(document.body.querySelector('.lyrics-transition-glow'));
    expect(flight).toContainElement(document.body.querySelector('.lyrics-transition-shadow'));
    expect(container.querySelector('.lyrics-transition-ripple')).toBeInTheDocument();
    expect(container.querySelector('#lyricsWaterRippleFilter')).toBeInTheDocument();
    expect(container.querySelector('#lyricsWaterRippleDisplacement')).toBeInTheDocument();
  });

  it('keeps the drawer background and visible ripple inside the moving lyrics panel', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel transitionOrigin={{ left: 20, top: 720, width: 52, height: 52 }} />);
    const overlay = container.querySelector<HTMLElement>('.lyrics-overlay') as HTMLElement;
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;

    expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
    expect(panel).toContainElement(container.querySelector('.lyrics-backdrop'));
    expect(panel).toContainElement(container.querySelector('.lyrics-transition-ripple'));
    expect(panel).toContainElement(container.querySelector('.lyrics-transition-filter-defs'));
  });

  it('uses the palette snapshot captured before the lyrics transition mounts', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const transitionPalette = {
      primary: '#123456',
      secondary: '#345678',
      shadow: '#234567',
      tone: 'linear-gradient(135deg, #123456, #345678)'
    };
    const { container } = render(<LyricsPanel transitionPalette={transitionPalette} />);

    expect(document.documentElement.style.getPropertyValue('--lyrics-title-glow')).toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--lyrics-cover-shadow')).toBe('#234567');
    expect(container.querySelector<HTMLElement>('.lyrics-art')?.style.getPropertyValue('--cover-tone')).toBe(
      transitionPalette.tone
    );
  });

  it('does not render the removed liquid-curtain controls or layers', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel transitionOrigin={{ left: 20, top: 720, width: 52, height: 52 }} />);
    expect(container.querySelector('.lyrics-toolbar .lyrics-transition-switch')).not.toBeInTheDocument();
    expect(container.querySelector('.lyrics-transition-toggle')).not.toBeInTheDocument();
    expect(document.body.querySelector('.lyrics-transition-cover')).not.toBeInTheDocument();
    expect(document.body.querySelector('.lyrics-transition-refraction')).not.toBeInTheDocument();
    expect(document.body.querySelector('.lyrics-transition-curtain')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('musicplayer.lyrics-transition')).toBeNull();
    expect(screen.getByRole('region', { name: '3D 播放舞台' })).toBeInTheDocument();
  });

  it('shows a lyrics status instead of an empty viewport when no song is playing', () => {
    render(<LyricsPanel />);

    expect(screen.getByText('播放歌曲后显示歌词')).toBeInTheDocument();
  });

  it('does not render mock disc layers over real lyrics artwork', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    expect(container.querySelector('.stage-disc-groove')).not.toBeInTheDocument();
    expect(container.querySelector('.stage-disc-label')).not.toBeInTheDocument();
  });

  it('samples the real song cover to drive the lyrics glow instead of the provider fallback tone', async () => {
    installCoverSamplerMock([
      180, 30, 40, 255,
      180, 30, 40, 255,
      180, 30, 40, 255,
      42, 78, 54, 255
    ]);
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--lyrics-title-glow')).toBe('#b41e28');
    });
    expect(document.documentElement.style.getPropertyValue('--lyrics-cover-tone')).toContain('#b41e28');
    expect(document.documentElement.style.getPropertyValue('--lyrics-cover-shadow')).toBe('#b41e28');
    expect(container.querySelector<HTMLElement>('.lyrics-art')?.style.getPropertyValue('--cover-tone')).toContain('#b41e28');
  });

  it('uses a theme-neutral lyrics cover shadow when artwork cannot be sampled', () => {
    usePlayerStore.setState({
      currentSong: { ...neteaseFixtureSong, coverUrl: undefined },
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    expect(document.documentElement.style.getPropertyValue('--lyrics-cover-shadow')).toBe('var(--qq-text)');
  });

  it('hides lyrics chrome after idle or pointer leave and restores it on pointer movement', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;

    expect(panel).toHaveAttribute('data-chrome-state', 'visible');
    expect(document.documentElement.dataset.lyricsChrome).toBe('visible');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(panel).toHaveAttribute('data-chrome-state', 'hidden');
    expect(document.documentElement.dataset.lyricsChrome).toBe('hidden');

    fireEvent.mouseMove(panel, { clientX: 640, clientY: 360 });

    expect(panel).toHaveAttribute('data-chrome-state', 'visible');
    expect(document.documentElement.dataset.lyricsChrome).toBe('visible');

    fireEvent.mouseLeave(panel);

    expect(panel).toHaveAttribute('data-chrome-state', 'visible');
    expect(document.documentElement.dataset.lyricsChrome).toBe('visible');
  });

  it('restores lyrics chrome on pointer movement with reduced effects while keeping depth locked', () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel reduceEffects />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;
    const initialAnimationFrameCalls = requestAnimationFrameSpy.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(panel).toHaveAttribute('data-chrome-state', 'hidden');
    expect(document.documentElement.dataset.lyricsChrome).toBe('hidden');

    fireEvent.mouseMove(panel, { clientX: 640, clientY: 360 });

    expect(panel).toHaveAttribute('data-chrome-state', 'visible');
    expect(document.documentElement.dataset.lyricsChrome).toBe('visible');
    expect(panel).toHaveAttribute('data-depth-mode', 'locked');
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0.5');
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(initialAnimationFrameCalls);
  });

  it('drives a wider but bounded 3D stage from pointer movement', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(panel, { clientX: 1440, clientY: 0 });

    expect(stage.style.getPropertyValue('--stage-tilt-x')).toBe('11deg');
    expect(stage.style.getPropertyValue('--stage-tilt-y')).toBe('13deg');
    expect(stage.style.getPropertyValue('--bg-shift-x')).toBe('-41px');
    expect(stage.style.getPropertyValue('--bg-shift-y')).toBe('34px');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('64px');
    expect(stage.style.getPropertyValue('--cover-shift-y')).toBe('-45px');
    expect(stage.style.getPropertyValue('--cover-tilt-y')).toBe('17deg');
    expect(stage.style.getPropertyValue('--cover-scale')).toBe('1.032');
  });

  it('keeps depth responsive when transparent panel layers do not receive the pointer target', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('64px');
  });

  it('keeps the last 3D depth stable while the pointer moves over lyrics toolbar buttons', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;
    const collapseButton = container.querySelector<HTMLButtonElement>('.lyrics-collapse') as HTMLButtonElement;

    fireEvent.mouseMove(collapseButton, { clientX: 1440, clientY: 0 });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0.5');
  });

  it('polls the Electron cursor bridge so the native drag lane can steer depth', async () => {
    vi.useFakeTimers();
    const getCursorPosition = vi.fn().mockResolvedValue({ x: 1440, y: 0, inside: true });
    (window.musicPlayer.window as Window['musicPlayer']['window'] & {
      getCursorPosition: typeof getCursorPosition;
    }).getCursorPosition = getCursorPosition;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    await act(async () => {
      vi.advanceTimersByTime(90);
      await Promise.resolve();
    });

    expect(getCursorPosition).toHaveBeenCalled();
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0');
  });

  it('settles lyrics depth when the pointer leaves the app window from any edge', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');

    fireEvent.mouseOut(window, { clientX: -1, clientY: 120, relatedTarget: null });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('0px');

    fireEvent.mouseMove(window, { clientX: 720, clientY: 900 });
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('1');

    fireEvent.mouseOut(window, { clientX: 720, clientY: 901, relatedTarget: null });
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0.5');
    expect(stage.style.getPropertyValue('--cover-shift-y')).toBe('0px');
  });

  it('resumes subtle automatic lyrics depth motion after chrome becomes idle', () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');

    act(() => {
      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(1200);
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalled();
    expect(stage.style.getPropertyValue('--pointer-x')).not.toBe('0.5');
    expect(stage.style.getPropertyValue('--cover-tilt-y')).not.toBe('0deg');

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');
  });

  it('keeps idle depth ownership while Electron reports an unchanged cursor position', async () => {
    vi.useFakeTimers();
    const getCursorPosition = vi.fn().mockResolvedValue({
      x: window.innerWidth * 0.75,
      y: window.innerHeight * 0.36,
      inside: true
    });
    (window.musicPlayer.window as Window['musicPlayer']['window'] & {
      getCursorPosition: typeof getCursorPosition;
    }).getCursorPosition = getCursorPosition;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    await act(async () => {
      vi.advanceTimersByTime(90);
      await Promise.resolve();
    });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.75');

    await act(async () => {
      vi.advanceTimersByTime(5000 + 900);
      await Promise.resolve();
    });

    expect(panel).toHaveAttribute('data-depth-mode', 'idle');
    expect(Number(stage.style.getPropertyValue('--pointer-x'))).toBeGreaterThanOrEqual(0.43);
    expect(Number(stage.style.getPropertyValue('--pointer-x'))).toBeLessThanOrEqual(0.57);

    await act(async () => {
      vi.advanceTimersByTime(99);
      await Promise.resolve();
    });

    expect(panel).toHaveAttribute('data-depth-mode', 'idle');
    expect(stage.style.getPropertyValue('--pointer-x')).not.toBe('0.75');
  });

  it('keeps pointer and idle depth work centered when reduced effects are active', () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel reduceEffects />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;
    const initialAnimationFrameCalls = requestAnimationFrameSpy.mock.calls.length;

    fireEvent.mouseMove(panel, { clientX: 1440, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(1200);
    });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0.5');
    expect(stage.style.getPropertyValue('--stage-tilt-x')).toBe('0deg');
    expect(stage.style.getPropertyValue('--stage-tilt-y')).toBe('0deg');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('0px');
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(initialAnimationFrameCalls);
  });

  it('stops active lyrics depth and resets the stage when reduced effects turn on', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container, rerender } = render(<LyricsPanel reduceEffects={false} />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');

    rerender(<LyricsPanel reduceEffects />);

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--stage-tilt-y')).toBe('0deg');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('0px');
  });

  it('uses a softened non-linear curve when returning lyrics depth to center', () => {
    const startPointer = { x: 1, y: 0 };

    const firstFrame = createCenterReturnPointer(startPointer, 16, 760);
    const halfway = createCenterReturnPointer(startPointer, 380, 760);
    const finished = createCenterReturnPointer(startPointer, 760, 760);

    expect(firstFrame.x).toBeGreaterThan(0.99);
    expect(firstFrame.y).toBeLessThan(0.01);
    expect(halfway.x).toBeGreaterThan(0.72);
    expect(halfway.x).toBeLessThan(0.78);
    expect(finished).toEqual({ x: 0.5, y: 0.5 });
  });

  it('keeps lyrics depth centered while the pointer remains outside the app window', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');

    fireEvent.mouseOut(window, { clientX: 1441, clientY: 120, relatedTarget: null });
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--cover-shift-x')).toBe('0px');
  });

  it('returns lyrics depth to center before immersive idle motion starts', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const stage = container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement;

    fireEvent.mouseMove(window, { clientX: 1440, clientY: 0 });

    expect(stage.style.getPropertyValue('--pointer-x')).toBe('1');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(panel).toHaveAttribute('data-chrome-state', 'hidden');
    expect(stage.style.getPropertyValue('--pointer-x')).toBe('0.5');
    expect(stage.style.getPropertyValue('--pointer-y')).toBe('0.5');
  });

  it('restores chrome for even a sub-threshold pointer movement after idle', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;

    fireEvent.mouseMove(panel, { clientX: 640, clientY: 360 });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(panel).toHaveAttribute('data-chrome-state', 'hidden');

    fireEvent.mouseMove(panel, { clientX: 641, clientY: 360 });

    expect(panel).toHaveAttribute('data-chrome-state', 'visible');
  });

  for (const [mode, reduceEffects] of [['standard', false], ['reduced', true]] as const) {
    it(`treats the app top and bottom bars as lyrics chrome activity zones in ${mode} effects mode`, () => {
      vi.useFakeTimers();
      usePlayerStore.setState({
        currentSong: neteaseFixtureSong,
        isLyricsOpen: true
      });

      const topBar = document.createElement('header');
      topBar.className = 'top-bar';
      const playerBar = document.createElement('section');
      playerBar.className = 'player-bar';
      document.body.append(topBar, playerBar);

      try {
        const { container } = render(<LyricsPanel reduceEffects={reduceEffects} />);
        const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;

        act(() => {
          vi.advanceTimersByTime(5000);
        });

        expect(panel).toHaveAttribute('data-chrome-state', 'hidden');

        fireEvent.mouseMove(playerBar, { clientX: 640, clientY: 740 });

        expect(panel).toHaveAttribute('data-chrome-state', 'visible');

        act(() => {
          vi.advanceTimersByTime(5000);
        });

        expect(panel).toHaveAttribute('data-chrome-state', 'hidden');

        fireEvent.mouseMove(topBar, { clientX: 640, clientY: 24 });

        expect(panel).toHaveAttribute('data-chrome-state', 'visible');

        act(() => {
          vi.advanceTimersByTime(5000);
        });

        expect(panel).toHaveAttribute('data-chrome-state', 'hidden');
      } finally {
        topBar.remove();
        playerBar.remove();
      }
    });
  }

  it('uses shared playback progress for the active lyric line', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[01:00.00]active lyric\n[01:10.00]next lyric'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 65000,
      playbackDurationMs: 269000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('active lyric');
    });
    const activeLine = container.querySelector<HTMLElement>('.lyric-active');

    expect(activeLine).toHaveTextContent('active lyric');
    expect(activeLine?.querySelector('.lyric-line-text')).toHaveTextContent('active lyric');
    expect(activeLine?.style.getPropertyValue('--lyric-line-progress')).toBe('50%');
    const lyricLines = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
    expect(lyricLines[0].style.getPropertyValue('--lyric-signed-distance')).toBe('-1');
    expect(lyricLines[0].style.getPropertyValue('--lyric-flow-rank')).toBe('1');
    expect(lyricLines[1].style.getPropertyValue('--lyric-signed-distance')).toBe('0');
    expect(lyricLines[2].style.getPropertyValue('--lyric-signed-distance')).toBe('1');
  });

  it('anchors the active lyric line at a stable upper-middle viewport position', () => {
    expect(
      getAnchoredLyricScrollTop({
        lineTop: 260,
        lineHeight: 40,
        viewportHeight: 300,
        scrollHeight: 900
      })
    ).toBe(148);

    expect(
      getAnchoredLyricScrollTop({
        lineTop: 20,
        lineHeight: 40,
        viewportHeight: 300,
        scrollHeight: 900
      })
    ).toBe(0);

    expect(getLyricAnchorSpaces(340)).toEqual({ head: 149.6, tail: 190.4 });

    expect(
      getAnchoredLyricScrollTopFromRects({
        lineViewportTop: 500,
        lineHeight: 40,
        viewportTop: 200,
        viewportHeight: 300,
        currentScrollTop: 400,
        scrollHeight: 1200
      })
    ).toBe(588);
  });

  it('renders translated lyrics and lets the user smoothly adjust lyric font size', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn\n[00:10.00]Next line',
        tlyric: '[00:00.00]因为我不在乎\n[00:10.00]下一句'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 1000,
      playbackDurationMs: 20000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle')).not.toBeDisabled();
    });
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const fontButton = container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement;

    expect(panel.style.getPropertyValue('--lyrics-font-scale')).toBe('1');
    expect(container.querySelector('.lyrics-translation-text')).not.toBeInTheDocument();

    const translationToggle = container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement;
    expect(translationToggle).toHaveAttribute('data-state', 'off');

    fireEvent.click(translationToggle);

    expect(translationToggle).toHaveAttribute('data-state', 'on');
    expect(translationToggle).toHaveAttribute('aria-pressed', 'true');

    expect(container.querySelector<HTMLElement>('.lyrics-translation-text')).toHaveTextContent('因为我不在乎');

    fireEvent.click(fontButton);

    const slider = screen.getByRole('slider', { name: '歌词字号' });
    fireEvent.change(slider, { target: { value: '1.18' } });

    expect(panel.style.getPropertyValue('--lyrics-font-scale')).toBe('1.18');

    fireEvent.click(translationToggle);

    expect(translationToggle).toHaveAttribute('data-state', 'off');
    expect(translationToggle).toHaveAttribute('aria-pressed', 'false');

    expect(container.querySelector('.lyrics-translation-text')).not.toBeInTheDocument();
  });

  it('resets the translation toggle after briefly showing the unavailable notice', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn\n[00:10.00]Next line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 1000,
      playbackDurationMs: 20000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle')).not.toBeDisabled();
    });

    vi.useFakeTimers();
    const translationToggle = container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement;

    fireEvent.click(translationToggle);

    expect(translationToggle).toHaveAttribute('data-state', 'on');
    expect(container.querySelector<HTMLElement>('.lyrics-translation-unavailable')).toHaveAttribute('data-state', 'open');

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(translationToggle).toHaveAttribute('data-state', 'off');
    expect(translationToggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector<HTMLElement>('.lyrics-translation-unavailable')).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(container.querySelector('.lyrics-translation-unavailable')).not.toBeInTheDocument();
  });

  it('shows non-Chinese translated lyrics from the translation toggle even when translated timestamps drift', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:20.00]When you nod your head yes\n[00:24.00]What do you mean',
        tlyric: '[00:00.00]translated nod line\n[00:04.00]translated mean line'
      }
    });
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        title: 'What Do You Mean?',
        artist: 'Justin Bieber'
      },
      isLyricsOpen: true,
      playbackPositionMs: 21000,
      playbackDurationMs: 205000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle')).not.toBeDisabled();
    });
    expect(container.querySelector('.lyrics-translation-text')).not.toBeInTheDocument();

    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement);

    expect(container.querySelector<HTMLElement>('.lyrics-translation-text')).toHaveTextContent('translated nod line');
  });

  it('shows translated lyrics from the translation toggle when provider translations have no timestamps', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:20.00]Is it too late now to say sorry\n[00:24.00]Cause I am missing more than just your body',
        tlyric: '现在说抱歉是否太迟\n因为我想念的不只是你的身体'
      }
    });
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        title: 'Sorry',
        artist: 'Justin Bieber'
      },
      isLyricsOpen: true,
      playbackPositionMs: 21000,
      playbackDurationMs: 200000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle')).not.toBeDisabled();
    });

    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement);

    expect(container.querySelector<HTMLElement>('.lyrics-translation-text')).toHaveTextContent('现在说抱歉是否太迟');
  });

  it('keeps the translation toggle interactive and animates feedback when provider has no translated lyrics', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:20.00]We do not talk anymore\n[00:24.00]Like we used to do'
      }
    });
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        title: 'We Do Not Talk Anymore',
        artist: 'Charlie Puth'
      },
      isLyricsOpen: true,
      playbackPositionMs: 21000,
      playbackDurationMs: 200000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('We do not talk anymore');
    });

    const translationToggle = container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement;
    expect(translationToggle).not.toBeDisabled();
    expect(translationToggle).toHaveAttribute('data-state', 'off');

    fireEvent.click(translationToggle);

    expect(translationToggle).toHaveAttribute('data-state', 'on');
    expect(container.querySelector<HTMLElement>('.lyrics-translation-unavailable')).toHaveTextContent('暂无译文');
    fireEvent.click(translationToggle);

    expect(translationToggle).toHaveAttribute('data-state', 'off');
    expect(container.querySelector<HTMLElement>('.lyrics-translation-unavailable')).toHaveAttribute('data-state', 'closed');

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-translation-unavailable')).not.toBeInTheDocument();
    });
  });

  it('matches translated lyrics when provider timestamps are slightly offset', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.08]Cause I do not give a damn\n[00:10.00]Next line',
        tlyric: '[00:00.00]translated first line\n[00:10.00]translated next line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 1000,
      playbackDurationMs: 20000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle')).not.toBeDisabled();
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-translation-toggle') as HTMLButtonElement);

    expect(container.querySelector<HTMLElement>('.lyrics-translation-text')).toHaveTextContent('translated first line');
  });

  it('closes the lyric font popover when clicking outside the side tools', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-font-button')).toBeInTheDocument();
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement);

    const openPopover = document.body.querySelector<HTMLElement>('.lyrics-font-popover');
    expect(openPopover).toBeInTheDocument();
    expect(openPopover).toHaveClass('glass-surface');
    expect(openPopover).toHaveAttribute('data-state', 'open');
    expect(openPopover?.parentElement).toBe(document.body);

    fireEvent.pointerDown(container.querySelector<HTMLElement>('.playback-stage-3d') as HTMLElement);

    expect(document.body.querySelector<HTMLElement>('.lyrics-font-popover')).toHaveAttribute('data-state', 'closed');
    await waitFor(() => expect(document.body.querySelector('.lyrics-font-popover')).not.toBeInTheDocument());
  });

  it('keeps the lyric font popover open while interacting with the slider', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-font-button')).toBeInTheDocument();
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement);

    const slider = screen.getByRole('slider', { name: '歌词字号' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '1.14' } });

    expect(document.body.querySelector('.lyrics-font-popover')).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('.lyrics-panel')?.style.getPropertyValue('--lyrics-font-scale')).toBe('1.14');
  });

  it('stretches and rebounds the lyric font surface when dragging beyond its maximum', async () => {
    window.localStorage.setItem('musicplayer.lyrics-font-scale', '1.24');
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-font-button')).toBeInTheDocument();
    });
    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement);

    const popover = document.body.querySelector<HTMLElement>('.lyrics-font-popover') as HTMLElement;
    const slider = popover.querySelector<HTMLInputElement>('.lyrics-font-slider') as HTMLInputElement;

    fireEvent.pointerDown(slider, { pointerId: 2, clientY: 64 });
    fireEvent.pointerMove(slider, { pointerId: 2, clientY: 36 });

    expect(popover).toHaveAttribute('data-edge-impulse', 'max');
    expect(popover).toHaveAttribute('data-edge-state', 'pulling');

    fireEvent.pointerUp(slider, { pointerId: 2, clientY: 36 });

    expect(popover).toHaveAttribute('data-edge-state', 'rebounding');
  });

  it('persists the lyric font scale and hydrates it when lyrics reopen', async () => {
    window.localStorage.setItem('musicplayer.lyrics-font-scale', '1.17');
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]Cause I do not give a damn'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container, unmount } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyrics-font-button')).toBeInTheDocument();
    });
    const panel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    expect(panel.style.getPropertyValue('--lyrics-font-scale')).toBe('1.17');

    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement);
    fireEvent.change(screen.getByRole('slider', { name: '歌词字号' }), { target: { value: '1.09' } });

    expect(window.localStorage.getItem('musicplayer.lyrics-font-scale')).toBe('1.09');

    unmount();

    const secondRender = render(<LyricsPanel />);
    const reopenedPanel = secondRender.container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;

    expect(reopenedPanel.style.getPropertyValue('--lyrics-font-scale')).toBe('1.09');
  });

  it('does not enter manual lyric scrolling while the lyric font size is adjusted', async () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = vi.fn();
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]active lyric\n[00:40.00]after line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 21000,
      playbackDurationMs: 60000
    });

    try {
      const { container } = render(<LyricsPanel />);

      await waitFor(() => {
        expect(container.querySelectorAll<HTMLElement>('.lyric-line')).toHaveLength(3);
      });
      const viewport = container.querySelector<HTMLElement>('.lyrics-lines') as HTMLElement;
      const fontButton = container.querySelector<HTMLButtonElement>('.lyrics-font-button') as HTMLButtonElement;

      expect(viewport).toHaveAttribute('data-scroll-state', 'settled');

      fireEvent.click(fontButton);
      const slider = screen.getByRole('slider', { name: '歌词字号' });
      fireEvent.pointerDown(slider);
      fireEvent.change(slider, { target: { value: '1.2' } });
      fireEvent.scroll(viewport);

      expect(viewport).toHaveAttribute('data-scroll-state', 'settled');
      expect(container.querySelector('.lyric-seek-cue')).not.toBeInTheDocument();
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('keeps a long lyrics page title constrained for ellipsis', () => {
    const longTitle = '十二月的奇迹 (Miracles in December) (Chinese Ver.)';
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        title: longTitle
      },
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const title = container.querySelector<HTMLHeadingElement>('.lyrics-song-title');

    expect(title).toHaveTextContent(longTitle);
    expect(title).toHaveAttribute('title', longTitle);
    expect(title).toHaveAttribute('data-title', longTitle);
  });

  it('uses fullscreen instead of normal maximize from the lyrics window chrome', () => {
    const toggleFullscreen = vi.fn();
    const toggleMaximize = vi.fn();
    (window.musicPlayer.window as unknown as { toggleFullscreen: () => void }).toggleFullscreen = toggleFullscreen;
    window.musicPlayer.window.toggleMaximize = toggleMaximize;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }));

    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(toggleMaximize).not.toHaveBeenCalled();
  });

  it('waits for one fullscreen restore before collapsing lyrics', async () => {
    const toggleFullscreen = vi.fn();
    let completeRestore!: (value: boolean) => void;
    const setFullscreen = vi.fn(() => new Promise<boolean>((resolve) => {
      completeRestore = resolve;
    }));
    (window.musicPlayer.window as unknown as { toggleFullscreen: () => void }).toggleFullscreen = toggleFullscreen;
    window.musicPlayer.window.setFullscreen = setFullscreen;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }));
    fireEvent.click(container.querySelector<HTMLButtonElement>('.lyrics-collapse') as HTMLButtonElement);

    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(setFullscreen).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: '歌词详情' })).toBeInTheDocument();

    await act(async () => {
      completeRestore(false);
      await Promise.resolve();
    });
    expect(usePlayerStore.getState().isLyricsOpen).toBe(false);
    expect(setFullscreen).toHaveBeenCalledTimes(1);
  });

  it('keeps lyrics open when fullscreen restoration fails and allows a retry', async () => {
    const setFullscreen = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    window.musicPlayer.window.setFullscreen = setFullscreen;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const overlay = container.querySelector<HTMLElement>('.lyrics-overlay') as HTMLElement;
    const collapseButton = container.querySelector<HTMLButtonElement>('.lyrics-collapse') as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(collapseButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(usePlayerStore.getState().isLyricsOpen).toBe(true);
    expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');

    await act(async () => {
      fireEvent.click(collapseButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setFullscreen).toHaveBeenCalledTimes(2);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(false);
  });

  it('keeps lyrics interactive when fullscreen restoration throws synchronously', async () => {
    const setFullscreen = vi.fn(() => {
      throw new Error('fullscreen restore threw');
    });
    window.musicPlayer.window.setFullscreen = setFullscreen;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const overlay = container.querySelector<HTMLElement>('.lyrics-overlay') as HTMLElement;
    const collapseButton = container.querySelector<HTMLButtonElement>('.lyrics-collapse') as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(collapseButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(true);
    expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
  });

  it('keeps lyrics interactive when fullscreen restoration rejects asynchronously', async () => {
    const setFullscreen = vi.fn().mockRejectedValue(new Error('fullscreen restore rejected'));
    window.musicPlayer.window.setFullscreen = setFullscreen;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container } = render(<LyricsPanel />);
    const overlay = container.querySelector<HTMLElement>('.lyrics-overlay') as HTMLElement;
    const collapseButton = container.querySelector<HTMLButtonElement>('.lyrics-collapse') as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(collapseButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(usePlayerStore.getState().isLyricsOpen).toBe(true);
    expect(overlay).toHaveAttribute('data-transition-phase', 'interactive');
  });

  it('restores the normal window mode when the lyrics panel is externally unmounted', async () => {
    const setFullscreen = vi.fn();
    window.musicPlayer.window.setFullscreen = setFullscreen;
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { unmount } = render(<LyricsPanel />);
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it('restores the external player cover visibility when the lyrics panel is unmounted', () => {
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    const { container, unmount } = render(<LyricsPanel />);
    const sourceCover = document.createElement('button');
    sourceCover.className = 'cover-thumb-button';
    sourceCover.style.opacity = '0';
    sourceCover.style.visibility = 'hidden';
    document.body.append(sourceCover);

    try {
      expect(container).not.toContainElement(sourceCover);

      unmount();

      expect(sourceCover.style.opacity).toBe('');
      expect(sourceCover.style.visibility).toBe('');
    } finally {
      sourceCover.remove();
    }
  });

  it('shows a clickable primary artist that opens search results', async () => {
    const setFullscreen = vi.fn();
    window.musicPlayer.window.setFullscreen = setFullscreen;
    const searchSpy = vi.spyOn(window.musicPlayer.music, 'searchEntities').mockResolvedValue({
      ok: true,
      data: {
        providerId: 'qq',
        keyword: 'EXO',
        sections: {
          songs: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
          artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
          albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
          playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
        }
      }
    });
    usePlayerStore.setState({
      currentSong: {
        ...neteaseFixtureSong,
        id: 'qq:exo-song',
        providerId: 'qq',
        title: 'Miracles in December',
        artist: 'EXO (Korean)'
      },
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    const artistButton = screen.getByRole('button', { name: 'Search artist EXO' });
    expect(artistButton).toHaveTextContent('EXO');
    expect(artistButton.querySelector('.lyrics-song-artist-text')).toHaveTextContent('EXO');

    await act(async () => {
      fireEvent.click(artistButton);
      await Promise.resolve();
    });

    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(useUiStore.getState().currentView).toEqual({ type: 'search' });
    expect(usePlayerStore.getState().isLyricsOpen).toBe(false);
    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalledWith('qq', 'EXO', { limit: 30, offset: 0 });
    });
    expect(useSearchStore.getState().keyword).toBe('EXO');
  });

  it('renders active lyrics as per-character shimmer segments driven by line progress', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]abcd\n[00:10.00]next'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 6250,
      playbackDurationMs: 20000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('abcd');
    });
    const activeLine = container.querySelector<HTMLElement>('.lyric-active') as HTMLElement;
    const lyricText = activeLine.querySelector<HTMLElement>('.lyric-line-text') as HTMLElement;

    expect(activeLine.style.getPropertyValue('--lyric-line-progress')).toBe('62.5%');
    expect(lyricText).toHaveTextContent('abcd');
    expect(lyricText).not.toHaveAttribute('data-lyric-text');
    const lyricChars = Array.from(activeLine.querySelectorAll<HTMLElement>('.lyric-char'));
    expect(lyricChars).toHaveLength(4);
    expect(lyricChars.map((char) => char.textContent).join('')).toBe('abcd');
    expect(lyricChars[0].style.getPropertyValue('--lyric-char-progress')).toBe('1');
    expect(lyricChars[1].style.getPropertyValue('--lyric-char-progress')).toBe('1');
    expect(lyricChars[2].style.getPropertyValue('--lyric-char-progress')).toBe('0.5');
    expect(lyricChars[3].style.getPropertyValue('--lyric-char-progress')).toBe('0');
    expect(lyricChars.map((char) => char.classList.contains('lyric-char-filled'))).toEqual([true, true, true, false]);
    expect(lyricChars.map((char) => char.classList.contains('lyric-char-in-progress'))).toEqual([false, false, true, false]);
  });

  it.each([true, false])('uses the native media clock to continuously fill the active character (%s)', async (reduceEffects) => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frames.delete(frameId);
    });

    let currentTime = 6.25;
    let paused = false;
    const media = document.createElement('audio');
    media.src = 'https://example.test/lyric-clock.mp3';
    Object.defineProperties(media, {
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
        }
      },
      paused: { configurable: true, get: () => paused },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false }
    });
    document.body.append(media);

    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]abcd\n[00:10.00]next'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      currentPlaybackUrl: 'https://example.test/lyric-clock.mp3',
      isLyricsOpen: true,
      playbackPositionMs: 6250,
      playbackDurationMs: 20000
    });

    try {
      const { container } = render(<LyricsPanel reduceEffects={reduceEffects} mediaRef={{ current: media }} />);

      await waitFor(() => {
        expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('abcd');
        expect(container.querySelector<HTMLElement>('.lyrics-lines')).toHaveAttribute('data-lyric-media-clock', 'active');
      });

      const runNextFrame = (time: number) => {
        const nextFrame = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
        if (!nextFrame) {
          throw new Error('Expected a pending media clock animation frame');
        }

        const [frameId, callback] = nextFrame;
        frames.delete(frameId);
        callback(time);
      };
      const lyricChars = Array.from(container.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));

      currentTime = 6.5;
      act(() => runNextFrame(16));
      expect(lyricChars[2].style.getPropertyValue('--lyric-char-progress')).toBe('0.6');
      expect(usePlayerStore.getState().playbackPositionMs).toBe(6250);

      currentTime = 6.75;
      act(() => runNextFrame(32));
      expect(lyricChars[2].style.getPropertyValue('--lyric-char-progress')).toBe('0.7');

      paused = true;
      fireEvent.pause(media);
      await waitFor(() => {
        expect(container.querySelector<HTMLElement>('.lyrics-lines')).toHaveAttribute('data-lyric-media-clock', 'fallback');
      });
      expect(frames.size).toBe(0);
    } finally {
      media.remove();
    }
  });

  it('keeps at most one lyric character in progress at fill boundaries', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]abcd\n[00:10.00]next'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 0,
      playbackDurationMs: 20_000
    });

    const { container } = render(<LyricsPanel />);
    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('abcd');
    });

    for (const positionMs of [2_400, 2_500, 2_600, 4_900, 5_000, 5_100]) {
      act(() => {
        usePlayerStore.getState().setPlaybackProgress(positionMs, 20_000);
      });

      const chars = Array.from(container.querySelectorAll<HTMLElement>('.lyric-active .lyric-char'));
      const progresses = chars.map((char) => Number(char.style.getPropertyValue('--lyric-char-progress')));
      const fractionalIndexes = progresses
        .map((progress, index) => ({ index, progress }))
        .filter(({ progress }) => progress > 0 && progress < 1)
        .map(({ index }) => index);
      const inProgressIndexes = chars
        .map((char, index) => ({ index, isCurrent: char.classList.contains('lyric-char-in-progress') }))
        .filter(({ isCurrent }) => isCurrent)
        .map(({ index }) => index);
      const filledIndexes = chars
        .map((char, index) => ({ index, isFilled: char.classList.contains('lyric-char-filled') }))
        .filter(({ isFilled }) => isFilled)
        .map(({ index }) => index);

      expect(fractionalIndexes.length).toBeLessThanOrEqual(1);
      expect(inProgressIndexes).toEqual(fractionalIndexes);
      expect(filledIndexes).toEqual(Array.from({ length: filledIndexes.length }, (_, index) => index));
      progresses.forEach((progress, index) => {
        const isFilled = chars[index].classList.contains('lyric-char-filled');
        const isCurrent = chars[index].classList.contains('lyric-char-in-progress');
        if (progress === 1) {
          expect(isFilled).toBe(true);
          expect(isCurrent).toBe(false);
        } else if (progress > 0) {
          expect(isFilled).toBe(true);
          expect(isCurrent).toBe(true);
        } else {
          expect(isFilled).toBe(false);
          expect(isCurrent).toBe(false);
        }
      });
    }
  });

  it('uses smooth glow flow only for continuous same-song playback updates', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]abcd\n[00:10.00]next'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 5_000,
      playbackDurationMs: 20_000
    });

    const { container } = render(<LyricsPanel />);
    const viewport = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.lyrics-lines');
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });

    expect(viewport).toHaveAttribute('data-lyric-glow-transition', 'flowing');

    act(() => {
      usePlayerStore.getState().setPlaybackProgress(5_100, 20_000);
    });
    expect(viewport).toHaveAttribute('data-lyric-glow-transition', 'flowing');

    act(() => {
      usePlayerStore.getState().seekPlayback(7_500, 20_000);
    });
    expect(viewport).toHaveAttribute('data-lyric-glow-transition', 'instant');

    act(() => {
      usePlayerStore.getState().setPlaybackProgress(7_600, 20_000);
    });
    expect(viewport).toHaveAttribute('data-lyric-glow-transition', 'flowing');

    const previousTransitionModes: string[] = [];
    const transitionObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.oldValue) {
          previousTransitionModes.push(record.oldValue);
        }
      });
    });
    transitionObserver.observe(viewport, {
      attributeFilter: ['data-lyric-glow-transition'],
      attributeOldValue: true,
      attributes: true
    });

    act(() => {
      usePlayerStore.setState({
        currentSong: { ...neteaseFixtureSong, id: 'netease:replacement-song' },
        playbackPositionMs: 0
      });
    });
    await waitFor(() => {
      expect(
        viewport.dataset.lyricGlowTransition === 'instant' || previousTransitionModes.includes('instant')
      ).toBe(true);
    });
    transitionObserver.disconnect();
  });

  it('keeps lyric blur settled when automatic centering emits a lyric viewport scroll event', async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = function scrollToMock(this: HTMLElement) {
      this.dispatchEvent(new Event('scroll', { bubbles: true }));
    };
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]first verse\n[00:40.00]second verse\n[01:00.00]target line\n[01:20.00]after line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 61000,
      playbackDurationMs: 269000
    });

    try {
      const { container } = render(<LyricsPanel />);

      await waitFor(() => {
        expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('target line');
      });
      const linesViewport = container.querySelector<HTMLElement>('.lyrics-lines') as HTMLElement;

      expect(linesViewport).toHaveAttribute('data-scroll-state', 'settled');
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('removes lyric distance blur while scrolling and recenters the active line after scroll idle', async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = scrollTo;
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]first verse\n[00:40.00]second verse\n[01:00.00]target line\n[01:20.00]after line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 61000,
      playbackDurationMs: 269000
    });

    try {
      const { container } = render(<LyricsPanel />);

      await waitFor(() => {
        expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('target line');
      });
      const linesViewport = container.querySelector<HTMLElement>('.lyrics-lines') as HTMLElement;
      const lyricLines = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
      scrollIntoView.mockClear();
      vi.useFakeTimers();

      expect(linesViewport).toHaveAttribute('data-scroll-state', 'settled');
      expect(lyricLines[0].style.getPropertyValue('--lyric-distance')).toBe('3');
      expect(lyricLines[0].style.getPropertyValue('--lyric-signed-distance')).toBe('-3');
      expect(lyricLines[0].style.getPropertyValue('--lyric-flow-rank')).toBe('3');
      expect(lyricLines[3].style.getPropertyValue('--lyric-distance')).toBe('0');
      expect(lyricLines[3].style.getPropertyValue('--lyric-signed-distance')).toBe('0');
      expect(lyricLines[3].style.getPropertyValue('--lyric-flow-rank')).toBe('0');
      expect(lyricLines[4].style.getPropertyValue('--lyric-distance')).toBe('1');
      expect(lyricLines[4].style.getPropertyValue('--lyric-signed-distance')).toBe('1');
      expect(lyricLines[4].style.getPropertyValue('--lyric-flow-rank')).toBe('1');

      fireEvent.scroll(linesViewport);

      expect(linesViewport).toHaveAttribute('data-scroll-state', 'scrolling');
      expect(scrollIntoView).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(linesViewport).toHaveAttribute('data-scroll-state', 'settled');
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: 'auto'
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('staggers lyric row movement from the previous active line before the new active line settles', () => {
    expect(getLyricFlowRank(1, 2, 1)).toBe(0);
    expect(getLyricFlowRank(2, 2, 1)).toBe(1);
    expect(getLyricFlowRank(3, 2, 1)).toBe(2);
    expect(getLyricFlowRank(0, 2, 1)).toBe(1);
    expect(getLyricFlowRank(7, 2, 1)).toBe(5);
  });

  it('keeps the previous lyric as the stagger origin while the new active line continues playing', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:10.00]previous line\n[00:20.00]active line\n[00:30.00]next line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 11000,
      playbackDurationMs: 40000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('previous line');
    });

    act(() => {
      usePlayerStore.setState({ playbackPositionMs: 21000 });
    });

    let lyricLines = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
    expect(lyricLines[1].style.getPropertyValue('--lyric-flow-rank')).toBe('0');
    expect(lyricLines[2].style.getPropertyValue('--lyric-flow-rank')).toBe('1');
    expect(lyricLines[3].style.getPropertyValue('--lyric-flow-rank')).toBe('2');

    act(() => {
      usePlayerStore.setState({ playbackPositionMs: 22000 });
    });

    lyricLines = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));
    expect(lyricLines[1].style.getPropertyValue('--lyric-flow-rank')).toBe('0');
    expect(lyricLines[2].style.getPropertyValue('--lyric-flow-rank')).toBe('1');
    expect(lyricLines[3].style.getPropertyValue('--lyric-flow-rank')).toBe('2');
  });

  it('uses a non-linear anchored lyric scroll frame instead of native linear motion', () => {
    expect(createAnchoredLyricScrollFrame(0, 300, 0, 720)).toBe(0);
    expect(createAnchoredLyricScrollFrame(0, 300, 120, 720)).toBeLessThan(24);
    expect(createAnchoredLyricScrollFrame(0, 300, 360, 720)).toBe(150);
    expect(createAnchoredLyricScrollFrame(0, 300, 600, 720)).toBeGreaterThan(276);
    expect(createAnchoredLyricScrollFrame(0, 300, 720, 720)).toBe(300);
  });

  it('plays a lyric viewport rebound when the wheel pushes past the top or bottom edge', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]first verse\n[00:40.00]second verse'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 1000,
      playbackDurationMs: 60000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(container.querySelectorAll<HTMLElement>('.lyric-line')).toHaveLength(3);
    });
    vi.useFakeTimers();
    const viewport = container.querySelector<HTMLElement>('.lyrics-lines') as HTMLElement;
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 0 });

    fireEvent.wheel(viewport, { deltaY: -48 });

    expect(viewport).toHaveAttribute('data-boundary-bounce', 'top');

    act(() => {
      vi.advanceTimersByTime(720);
    });

    expect(viewport).toHaveAttribute('data-boundary-bounce', 'none');

    viewport.scrollTop = 200;
    fireEvent.wheel(viewport, { deltaY: 48 });

    expect(viewport).toHaveAttribute('data-boundary-bounce', 'bottom');
  });

  it('shows a fixed lyric seek cue while manually scrolling and jumps playback to that line', async () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = vi.fn();
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]seek target\n[00:40.00]after line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 1000,
      playbackDurationMs: 60000
    });

    try {
      const { container } = render(<LyricsPanel />);

      await waitFor(() => {
        expect(container.querySelectorAll<HTMLElement>('.lyric-line')).toHaveLength(3);
      });
      const viewport = container.querySelector<HTMLElement>('.lyrics-lines') as HTMLElement;
      const lyricLines = Array.from(container.querySelectorAll<HTMLElement>('.lyric-line'));

      Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 80 });
      Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 80 });
      lyricLines.forEach((line, index) => {
        Object.defineProperty(line, 'offsetTop', { configurable: true, value: index * 100 });
        Object.defineProperty(line, 'offsetHeight', { configurable: true, value: 40 });
      });

      fireEvent.scroll(viewport);

      const cue = await screen.findByRole('button', { name: '跳转到 0:20' });
      expect(cue).toHaveTextContent('0:20');
      expect(cue.closest('.lyrics-lines')).not.toBe(viewport);
      expect(lyricLines[1]).toHaveClass('lyric-seek-target');

      fireEvent.click(cue);

      expect(usePlayerStore.getState().playbackPositionMs).toBe(20000);
      expect(usePlayerStore.getState().playbackSeekRevision).toBe(1);
      expect(container.querySelector<HTMLElement>('.lyric-active')).toHaveTextContent('seek target');
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('renders plain provider lyrics instead of leaving the lyrics viewport empty', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: 'plain lyric line\nsecond plain lyric'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    expect(await screen.findByText('plain lyric line')).toBeInTheDocument();
    expect(screen.getByText('second plain lyric')).toBeInTheDocument();
  });

  it('hides QQ no-lyrics placeholders returned as successful lyrics', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00:00]此歌曲为没有填词的口白，请您欣赏'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    expect(await screen.findByText('当前歌曲暂无歌词')).toBeInTheDocument();
    expect(screen.queryByText('此歌曲为没有填词的口白，请您欣赏')).not.toBeInTheDocument();
  });

  it('renders timestamped provider lyrics with common netease metadata lines', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.000] 作词 : 周杰伦\n[00:01.000] 作曲 : 周杰伦\n[00:28.950]故事的小黄花'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 29000,
      playbackDurationMs: 269000
    });

    const { container } = render(<LyricsPanel />);

    await waitFor(() => {
      expect(findLyricLineText(container, '故事的小黄花')).toBeInTheDocument();
    });
  });

  it('scrolls only the lyric viewport when centering the active lyric line', async () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    Element.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = scrollTo;
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: '[00:00.00]intro\n[00:20.00]first verse\n[00:40.00]second verse\n[01:00.00]target line'
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 61000,
      playbackDurationMs: 269000
    });

    try {
      render(<LyricsPanel />);

      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalledWith({
          top: expect.any(Number),
          behavior: 'auto'
        });
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it('does not show demo lyrics when a real provider song has no lyrics', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: false,
        providerId: currentSong.providerId,
        reason: {
          category: 'url_unavailable',
          message: 'No lyrics',
          action: 'none'
        }
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true
    });

    render(<LyricsPanel />);

    expect(await screen.findByText('No lyrics')).toBeInTheDocument();
    expect(screen.queryByText(/\u9713\u8679/)).not.toBeInTheDocument();
  });

  it('keeps a 1000-line lyrics document windowed with bounded character DOM', async () => {
    const lrc = Array.from({ length: 1000 }, (_, index) => {
      const minutes = String(Math.floor(index / 60)).padStart(2, '0');
      const seconds = String(index % 60).padStart(2, '0');
      return `[${minutes}:${seconds}.00]performance lyric ${index}`;
    }).join('\n');
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 500_100,
      playbackDurationMs: 1_100_000
    });

    const { container } = render(<LyricsPanel />);
    await waitFor(() => {
      expect(container.querySelector('.lyric-active')).toHaveTextContent('performance lyric 500');
    });

    const viewport = container.querySelector<HTMLElement>('.lyrics-lines');
    const renderedLines = container.querySelectorAll('.lyric-line');
    const activeCharacters = container.querySelectorAll('.lyric-char');
    expect(viewport).toHaveAttribute('data-virtualized', 'true');
    expect(renderedLines.length).toBeLessThan(45);
    expect(activeCharacters.length).toBe('performance lyric 500'.length);
    expect(viewport?.querySelector('.lyrics-virtual-space')).toBeInTheDocument();
  });

  it('renders a 10000-character active line as glow chunks plus one stable character window', async () => {
    const longLine = 'a'.repeat(10_000);
    window.musicPlayer.music.getLyrics = async (_providerId, currentSong) => ({
      ok: true,
      data: {
        ok: true,
        providerId: currentSong.providerId,
        lrc: `[00:00.00]${longLine}\n[00:20.00]next`
      }
    });
    usePlayerStore.setState({
      currentSong: neteaseFixtureSong,
      isLyricsOpen: true,
      playbackPositionMs: 10_000,
      playbackDurationMs: 30_000
    });

    const { container } = render(<LyricsPanel />);
    const activeLine = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.lyric-active');
      expect(element).toHaveClass('lyric-long-line');
      return element as HTMLElement;
    });
    const initialCharacters = Array.from(activeLine.querySelectorAll<HTMLElement>('.lyric-char'));
    const chunkCount = activeLine.querySelectorAll('.lyric-char-chunk').length;
    expect(activeLine.textContent).toBe(longLine);
    expect(initialCharacters.length).toBeLessThanOrEqual(48);
    expect(chunkCount).toBeLessThan(220);
    expect(activeLine.querySelectorAll('.lyric-char-chunk-filled').length).toBeGreaterThan(0);

    act(() => {
      usePlayerStore.getState().setPlaybackProgress(10_020, 30_000);
    });

    expect(activeLine.querySelector('.lyric-char')).toBe(initialCharacters[0]);
    expect(activeLine.querySelectorAll('.lyric-char').length).toBe(initialCharacters.length);
  });
});

function installCoverSamplerMock(data: number[]) {
  class MockImage {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 2;
    height = 2;

    set src(_value: string) {
      window.setTimeout(() => this.onload?.(), 0);
    }
  }

  vi.stubGlobal('Image', MockImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({
      data: new Uint8ClampedArray(data)
    })
  } as unknown as CanvasRenderingContext2D);
}

function findLyricLineText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('.lyric-line-text')).find((line) => line.textContent === text);
}
