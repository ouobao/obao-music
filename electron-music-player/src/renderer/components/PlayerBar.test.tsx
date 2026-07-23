import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Program, Song } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { LyricsPlayerBar, PlayerBar } from './PlayerBar';

const song: Song = {
  id: 'qq:compact-row',
  providerId: 'qq',
  platformSongId: 'compact-row',
  title: 'Compact Row',
  artist: 'Layout Artist',
  album: 'Layout Album',
  durationMs: 240000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000ALBUMMID.jpg'
};

const neteaseSong: Song = {
  ...song,
  id: 'netease:compact-row',
  providerId: 'netease',
  platformSongId: 'compact-row',
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
};

const neteaseProgram: Program = {
  id: 'netease:program:compact-row',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: 'compact-row',
  title: 'Program Episode',
  description: 'Program description',
  durationMs: 240000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://music.163.com/program-cover.jpg',
  podcast: {
    id: 'netease:podcast:compact-row',
    providerId: 'netease',
    platformPodcastId: 'podcast-compact-row',
    title: 'Program Podcast',
    description: 'Podcast description',
    author: 'Program Host',
    coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:compact-row',
    podcastTitle: 'Program Podcast'
  }
};

describe('PlayerBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
  });

  afterEach(() => {
    usePlayerStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
  });

  it('renders an independent lyrics player surface without reusing the home cover trigger', () => {
    usePlayerStore.setState({ currentSong: song, isPlaying: true });

    const { container } = render(
      <>
        <PlayerBar />
        <LyricsPlayerBar />
      </>
    );
    const mainPlayer = container.querySelector('.player-bar');
    const lyricsPlayer = container.querySelector('.lyrics-player-bar');

    expect(mainPlayer).not.toBe(lyricsPlayer);
    expect(mainPlayer).toHaveAttribute('data-player-surface', 'main');
    expect(lyricsPlayer).toHaveAttribute('data-player-surface', 'lyrics');
    expect(mainPlayer?.querySelector('.cover-thumb-button')).toBeInTheDocument();
    expect(lyricsPlayer?.querySelector('.cover-thumb-button')).not.toBeInTheDocument();
    expect(lyricsPlayer?.querySelector('.lyrics-player-cover')).toBeInTheDocument();
  });

  it('exposes the similar-song trigger only for a Netease song on the main surface', () => {
    const onSimilarSongsToggle = vi.fn();
    usePlayerStore.setState({ currentSong: song });
    const { container } = render(
      <>
        <PlayerBar onSimilarSongsToggle={onSimilarSongsToggle} />
        <LyricsPlayerBar />
      </>
    );

    expect(screen.queryByRole('button', { name: /当前歌曲相似推荐/ })).not.toBeInTheDocument();

    act(() => usePlayerStore.setState({ currentSong: neteaseSong }));
    const mainPlayer = container.querySelector<HTMLElement>('.player-bar') as HTMLElement;
    const lyricsPlayer = container.querySelector<HTMLElement>('.lyrics-player-bar') as HTMLElement;
    const trigger = within(mainPlayer).getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    });

    expect(within(lyricsPlayer).queryByRole('button', { name: /当前歌曲相似推荐/ })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-pressed', 'false');
    expect(trigger).toHaveAttribute('title', '相似推荐');

    fireEvent.click(trigger);
    expect(onSimilarSongsToggle).toHaveBeenCalledTimes(1);
    expect(onSimilarSongsToggle).toHaveBeenCalledWith(neteaseSong);
  });

  it('renders a program without song-only player entry points', () => {
    const onLyricsOpen = vi.fn();
    const onSimilarSongsToggle = vi.fn();
    usePlayerStore.setState({
      currentMedia: neteaseProgram,
      currentSong: null,
      playbackDurationMs: neteaseProgram.durationMs
    });

    const { container } = render(
      <PlayerBar onLyricsOpen={onLyricsOpen} onSimilarSongsToggle={onSimilarSongsToggle} />
    );
    const playerBar = container.querySelector<HTMLElement>('.player-bar') as HTMLElement;
    const cover = playerBar.querySelector<HTMLElement>('.cover-thumb');

    expect(playerBar.querySelector('.now-playing-title')).toHaveAttribute('title', neteaseProgram.title);
    expect(within(playerBar).getByText('Program Podcast · Program Host')).toBeInTheDocument();
    expect(cover).toHaveClass('cover-thumb-program');
    expect(cover).not.toHaveClass('cover-thumb-button');
    expect(within(playerBar).queryByRole('button', { name: /打开歌词页/ })).not.toBeInTheDocument();
    expect(within(playerBar).queryByRole('button', { name: /当前歌曲相似推荐/ })).not.toBeInTheDocument();
    expect(within(playerBar).queryByRole('button', { name: /音质调节/ })).not.toBeInTheDocument();
    expect(onLyricsOpen).not.toHaveBeenCalled();
    expect(onSimilarSongsToggle).not.toHaveBeenCalled();
  });

  it('keeps the active similar-song trigger mounted with a stable pressed state', () => {
    usePlayerStore.setState({ currentSong: neteaseSong });
    const { rerender } = render(<PlayerBar isSimilarSongsOpen onSimilarSongsToggle={vi.fn()} />);
    const activeTrigger = screen.getByRole('button', {
      name: `收起当前歌曲相似推荐：${neteaseSong.title}`
    });

    expect(activeTrigger).toHaveAttribute('aria-pressed', 'true');
    rerender(<PlayerBar onSimilarSongsToggle={vi.fn()} />);
    expect(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    })).toBe(activeTrigger);
  });

  it('keeps playback restriction copy out of the bottom player metadata', () => {
    usePlayerStore.setState({
      currentSong: song,
      playbackRestriction: {
        category: 'url_unavailable',
        message: 'Current track needs provider authorization',
        action: 'retry'
      },
      isPlaying: false
    });

    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);
    const metadata = container.querySelector('.now-playing-meta');
    const restrictionRow = container.querySelector('.playback-restriction');

    expect(restrictionRow).not.toBeInTheDocument();
    expect(metadata).toHaveTextContent('Compact Row');
    expect(metadata).toHaveTextContent('Layout Artist');
    expect(metadata).not.toHaveTextContent('Current track needs provider authorization');
  });

  it('passes the current song artwork URL into the bottom cover surface', () => {
    usePlayerStore.setState({
      currentSong: song,
      isPlaying: false
    });

    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);
    const cover = container.querySelector<HTMLElement>('.cover-thumb');

    expect(cover?.style.getPropertyValue('--song-cover-image')).toContain('ALBUMMID.jpg');
  });

  it('captures the current cover palette before opening the lyrics transition', () => {
    const onLyricsOpen = vi.fn();
    usePlayerStore.setState({
      currentSong: song,
      isPlaying: false
    });

    render(<PlayerBar onLoginClick={vi.fn()} onLyricsOpen={onLyricsOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /Compact Row/ }));

    expect(onLyricsOpen).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
      expect.objectContaining({
        primary: '#31c27c',
        secondary: '#2f6f90',
        shadow: 'var(--qq-text)'
      })
    );
  });

  it('uses a scrolling title track for long bottom-player song names', () => {
    const longTitle = '十二月的奇迹 (Miracles in December) (Chinese Ver.)';
    usePlayerStore.setState({
      currentSong: {
        ...song,
        title: longTitle
      },
      isPlaying: false
    });

    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);
    const title = container.querySelector<HTMLElement>('.now-playing-title');
    const track = container.querySelector<HTMLElement>('.now-playing-title-track');

    expect(title).toHaveClass('now-playing-title-scroll');
    expect(title).toHaveAttribute('title', longTitle);
    expect(track).toHaveTextContent(longTitle);
  });

  it('renders progress from shared audio playback position', () => {
    usePlayerStore.setState({
      currentSong: song,
      isPlaying: true,
      playbackPositionMs: 76000,
      playbackDurationMs: 240000
    } as Partial<ReturnType<typeof usePlayerStore.getState>>);

    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);
    const progress = container.querySelector('.progress-line');
    const labels = progress?.querySelectorAll('span');
    const fill = progress?.querySelector<HTMLElement>('i');

    expect(labels?.[0]?.textContent).toBe('1:16');
    expect(labels?.[1]?.textContent).toBe('4:00');
    expect(fill?.style.width).toBe('31.67%');
  });

  it('seeks shared playback progress from the bottom progress slider', () => {
    usePlayerStore.setState({
      currentSong: song,
      isPlaying: true,
      playbackPositionMs: 30000,
      playbackDurationMs: 240000
    } as Partial<ReturnType<typeof usePlayerStore.getState>>);

    render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.change(screen.getByRole('slider', { name: '播放进度' }), { target: { value: '90000' } });

    expect(usePlayerStore.getState().playbackPositionMs).toBe(90000);
    expect(usePlayerStore.getState().playbackDurationMs).toBe(240000);
    expect(usePlayerStore.getState().playbackSeekRevision).toBe(1);
  });

  it('opens quality options and updates the shared playback quality', () => {
    render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '打开音质调节' }));
    fireEvent.click(screen.getByRole('button', { name: '无损' }));

    expect(usePlayerStore.getState().playbackQuality).toBe('lossless');
  });

  it('updates the shared output volume from the volume slider', () => {
    render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '打开音量调节' }));
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), { target: { value: '24' } });

    expect(usePlayerStore.getState().volume).toBe(24);
  });

  it('stretches and rebounds the volume surface when dragging beyond its maximum', () => {
    usePlayerStore.setState({ volume: 100 });
    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(container.querySelector<HTMLButtonElement>('.volume-trigger') as HTMLButtonElement);
    const popover = document.body.querySelector<HTMLElement>('.volume-popover') as HTMLElement;
    const slider = popover.querySelector<HTMLInputElement>('.volume-slider') as HTMLInputElement;

    fireEvent.pointerDown(slider, { pointerId: 1, clientY: 60 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 34 });

    expect(popover).toHaveAttribute('data-edge-impulse', 'max');
    expect(popover).toHaveAttribute('data-edge-state', 'pulling');

    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 34 });

    expect(popover).toHaveAttribute('data-edge-state', 'rebounding');
  });

  it('opens the QQ-style playback mode menu and updates the trigger state', async () => {
    render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '打开播放模式菜单：顺序播放' }));

    expect(screen.getByRole('dialog', { name: '播放模式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '顺序播放' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '单曲循环' }));

    expect(usePlayerStore.getState().playbackMode).toBe('singleLoop');
    expect(screen.getByRole('button', { name: '收起播放模式菜单：单曲循环' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开播放模式菜单：单曲循环' })).toBeInTheDocument();
    });
  });

  it('slides one shared selection indicator and marks first and last option impacts', () => {
    usePlayerStore.setState({ playbackMode: 'sequence', playbackQuality: 'higher' });
    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(container.querySelector<HTMLButtonElement>('.playback-mode-trigger') as HTMLButtonElement);
    const playbackPopover = document.body.querySelector<HTMLElement>('.playback-mode-popover') as HTMLElement;
    const playbackIndicator = playbackPopover.querySelector<HTMLElement>('.elastic-option-indicator') as HTMLElement;
    const playbackOptions = playbackPopover.querySelectorAll<HTMLButtonElement>('.playback-mode-option');

    expect(playbackIndicator).toBeInTheDocument();
    fireEvent.click(playbackOptions[playbackOptions.length - 1] as HTMLButtonElement);

    expect(usePlayerStore.getState().playbackMode).toBe('listLoop');
    expect(playbackPopover).toHaveAttribute('data-edge-impulse', 'max');
    expect(playbackIndicator).toHaveAttribute('data-motion-state', 'impact');

    fireEvent.click(container.querySelector<HTMLButtonElement>('.quality-trigger') as HTMLButtonElement);
    const qualityPopover = document.body.querySelector<HTMLElement>('.quality-popover') as HTMLElement;
    const qualityIndicator = qualityPopover.querySelector<HTMLElement>('.elastic-option-indicator') as HTMLElement;
    const qualityOptions = qualityPopover.querySelectorAll<HTMLButtonElement>('.quality-option');

    expect(qualityIndicator).toBeInTheDocument();
    fireEvent.click(qualityOptions[0] as HTMLButtonElement);

    expect(usePlayerStore.getState().playbackQuality).toBe('standard');
    expect(qualityPopover).toHaveAttribute('data-edge-impulse', 'min');
    expect(qualityIndicator).toHaveAttribute('data-motion-state', 'impact');
  });

  it('runs and then settles the same layered cover swap motion on the main and lyrics surfaces', () => {
    const secondSong: Song = {
      ...song,
      id: 'qq:cover-swap',
      platformSongId: 'cover-swap',
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
      coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000NEXTALBUM.jpg'
    };
    vi.useFakeTimers();
    try {
      usePlayerStore.setState({ currentSong: song });
      const { container } = render(
        <>
          <PlayerBar />
          <LyricsPlayerBar />
        </>
      );
      const initialMainCover = container.querySelector('.cover-thumb-button');

      act(() => usePlayerStore.setState({ currentSong: secondSong }));
      const mainCover = container.querySelector<HTMLElement>('.cover-thumb-button');
      const lyricsCover = container.querySelector<HTMLElement>('.lyrics-player-cover');
      const mainFront = mainCover?.querySelector<HTMLElement>('.cover-thumb-artwork-front');
      const mainBack = mainCover?.querySelector<HTMLElement>('.cover-thumb-artwork-back');
      const lyricsBack = lyricsCover?.querySelector<HTMLElement>('.cover-thumb-artwork-back');

      expect(mainCover).toBe(initialMainCover);
      expect(mainCover).toHaveAttribute('data-song-transition', 'switching');
      expect(lyricsCover).toHaveAttribute('data-song-transition', 'switching');
      expect(mainCover).toHaveClass('cover-thumb-song-switching');
      expect(lyricsCover).toHaveClass('cover-thumb-song-switching');
      expect(mainCover?.querySelectorAll('.cover-thumb-artwork')).toHaveLength(2);
      expect(lyricsCover?.querySelectorAll('.cover-thumb-artwork')).toHaveLength(2);
      expect(mainFront?.style.getPropertyValue('--cover-tone')).toBe(song.coverTone);
      expect(mainFront?.style.getPropertyValue('--song-cover-image')).toContain('ALBUMMID.jpg');
      expect(mainBack?.style.getPropertyValue('--cover-tone')).toBe(secondSong.coverTone);
      expect(mainBack?.style.getPropertyValue('--song-cover-image')).toContain('NEXTALBUM.jpg');

      fireEvent.animationEnd(mainBack as HTMLElement, { animationName: 'playerCoverSongSwapBack' });
      fireEvent.animationEnd(lyricsBack as HTMLElement, { animationName: 'playerCoverSongSwapBack' });
      expect(mainCover).not.toHaveAttribute('data-song-transition');
      expect(lyricsCover).not.toHaveAttribute('data-song-transition');
      expect(mainCover).not.toHaveClass('cover-thumb-song-switching');
      expect(lyricsCover).not.toHaveClass('cover-thumb-song-switching');
      expect(mainCover?.querySelector<HTMLElement>('.cover-thumb-artwork-front')?.style.getPropertyValue('--cover-tone'))
        .toBe(secondSong.coverTone);
      expect(mainCover?.querySelector<HTMLElement>('.cover-thumb-artwork-back')?.style.getPropertyValue('--cover-tone'))
        .toBe(secondSong.coverTone);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts an active cover swap from the latest logical song and keeps the timeout as a fallback', () => {
    const secondSong: Song = {
      ...song,
      id: 'qq:cover-swap-second',
      platformSongId: 'cover-swap-second',
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
    };
    const thirdSong: Song = {
      ...song,
      id: 'qq:cover-swap-third',
      platformSongId: 'cover-swap-third',
      coverTone: 'linear-gradient(135deg, #7bb8f3, #31c27c)'
    };
    vi.useFakeTimers();
    try {
      usePlayerStore.setState({ currentSong: song });
      const { container } = render(<PlayerBar />);

      act(() => usePlayerStore.setState({ currentSong: secondSong }));
      act(() => usePlayerStore.setState({ currentSong: thirdSong }));
      const cover = container.querySelector<HTMLElement>('.cover-thumb-button');

      expect(cover?.querySelector<HTMLElement>('.cover-thumb-artwork-front')?.style.getPropertyValue('--cover-tone'))
        .toBe(secondSong.coverTone);
      expect(cover?.querySelector<HTMLElement>('.cover-thumb-artwork-back')?.style.getPropertyValue('--cover-tone'))
        .toBe(thirdSong.coverTone);

      act(() => vi.advanceTimersByTime(561));
      expect(cover).not.toHaveAttribute('data-song-transition');
      expect(cover?.querySelector<HTMLElement>('.cover-thumb-artwork-front')?.style.getPropertyValue('--cover-tone'))
        .toBe(thirdSong.coverTone);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a cover swap while reduced effects are active', () => {
    const secondSong: Song = {
      ...song,
      id: 'qq:reduced-cover-swap',
      platformSongId: 'reduced-cover-swap',
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
    };
    usePlayerStore.setState({ currentSong: song });
    const { container } = render(
      <>
        <PlayerBar reduceEffects />
        <LyricsPlayerBar reduceEffects />
      </>
    );

    act(() => usePlayerStore.setState({ currentSong: secondSong }));

    expect(container.querySelector('.cover-thumb-button')).not.toHaveAttribute('data-song-transition');
    expect(container.querySelector('.lyrics-player-cover')).not.toHaveAttribute('data-song-transition');
    expect(container.querySelector<HTMLElement>('.cover-thumb-button .cover-thumb-artwork-front')
      ?.style.getPropertyValue('--cover-tone')).toBe(secondSong.coverTone);
  });

  it('uses previous and next controls to navigate the current queue', () => {
    const firstQueueItem = {
      id: 'queue-1-qq-compact-row',
      mediaId: song.id,
      mediaType: 'song' as const,
      songId: song.id,
      source: 'playlist' as const,
      sourceContext: song.sourceContext
    };
    const secondSong: Song = {
      ...song,
      id: 'qq:compact-row-2',
      platformSongId: 'compact-row-2',
      title: 'Compact Row 2'
    };
    const secondQueueItem = {
      id: 'queue-2-qq-compact-row-2',
      mediaId: secondSong.id,
      mediaType: 'song' as const,
      songId: secondSong.id,
      source: 'playlist' as const,
      sourceContext: secondSong.sourceContext
    };
    usePlayerStore.setState({
      queue: [firstQueueItem, secondQueueItem],
      queueSongs: {
        [song.id]: song,
        [secondSong.id]: secondSong
      },
      currentQueueItemId: firstQueueItem.id,
      currentSong: song,
      isPlaying: false
    });

    render(<PlayerBar onLoginClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '下一首' }));
    expect(usePlayerStore.getState().currentQueueItemId).toBe(secondQueueItem.id);
    expect(usePlayerStore.getState().currentSong?.id).toBe(secondSong.id);

    fireEvent.click(screen.getByRole('button', { name: '上一首' }));
    expect(usePlayerStore.getState().currentQueueItemId).toBe(firstQueueItem.id);
    expect(usePlayerStore.getState().currentSong?.id).toBe(song.id);
  });

  it('places volume in the center transport controls and removes it from right actions', () => {
    const { container } = render(<PlayerBar onLoginClick={vi.fn()} />);
    const transportButtons = container.querySelector<HTMLElement>('.transport-buttons');
    const playerActions = container.querySelector<HTMLElement>('.player-actions');
    const volumeTrigger = screen.getByRole('button', { name: '打开音量调节' });

    expect(transportButtons).toContainElement(volumeTrigger);
    expect(playerActions).not.toContainElement(volumeTrigger);
  });
});
