import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodcastSourceContext, Program, Song, SourceContext } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { QueuePanel } from './QueuePanel';

const songs: Song[] = Array.from({ length: 9 }, (_, index) => ({
  id: `qq:queue-${index + 1}`,
  providerId: 'qq',
  title: `Queue Song ${index + 1}`,
  artist: 'Queue Artist',
  album: 'Queue Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
}));

const sourceContext: SourceContext = {
  type: 'playlist',
  providerId: 'qq',
  playlistId: 'qq:queue',
  playlistTitle: 'Queue Playlist'
};

const largeQueueSongs: Song[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `qq:large-queue-${index + 1}`,
  providerId: 'qq',
  title: `Large Queue Song ${index + 1}`,
  artist: 'Queue Artist',
  album: 'Queue Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
}));

const programSourceContext: PodcastSourceContext = {
  type: 'podcast',
  providerId: 'netease',
  podcastId: 'netease:podcast:100',
  podcastTitle: '声音慢慢来'
};

const program: Program = {
  id: 'netease:program:100',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: '100',
  title: '第一期：晨间散步',
  description: '节目描述',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)',
  podcast: {
    id: programSourceContext.podcastId,
    providerId: 'netease',
    platformPodcastId: '100',
    title: programSourceContext.podcastTitle,
    description: '播客描述',
    author: '主播远山',
    coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)'
  },
  sourceContext: programSourceContext
};

describe('QueuePanel', () => {
  beforeEach(() => {
    usePlayerStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-centers the current queue item without scrolling outer containers', () => {
    usePlayerStore.getState().playSongsFromList(songs, 6, () => sourceContext);
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });

    const { container, rerender } = render(<QueuePanel presenceState="closed" />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<QueuePanel presenceState="open" />);

    expect(container.querySelector<HTMLElement>('.queue-list')?.scrollTop).toBe(74);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('renders a bounded window for oversized playback queues', () => {
    usePlayerStore.getState().playSongsFromList(largeQueueSongs, 650, () => sourceContext);

    const { container } = render(<QueuePanel presenceState="open" />);

    const renderedRows = container.querySelectorAll('.queue-row');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(80);
    expect(screen.getByRole('button', { name: /Large Queue Song 651/ })).toHaveClass('queue-row-active');
    expect(screen.queryByRole('button', { name: /Large Queue Song 1/ })).not.toBeInTheDocument();
  });

  it('renders a Program queue item with podcast context and a neutral queue position', () => {
    const queueItem = usePlayerStore.getState().playProgramFromList(program);

    render(<QueuePanel presenceState="open" />);

    const row = screen.getByRole('button', { name: `双击播放队列第 1 项：${program.title}` });
    expect(row).toHaveClass('queue-row-active');
    expect(row).toHaveTextContent(program.podcast.author);
    expect(row).toHaveTextContent(program.podcast.title);
    expect(row).toHaveTextContent('网易云 · 播客');
    expect(row).not.toHaveAttribute('aria-label', expect.stringContaining('首'));

    fireEvent.doubleClick(row);
    expect(usePlayerStore.getState().currentQueueItemId).toBe(queueItem.id);
    expect(usePlayerStore.getState().currentMedia).toMatchObject({ id: program.id, mediaType: 'program' });
    expect(usePlayerStore.getState().currentSong).toBeNull();
  });

  it('coalesces oversized queue scroll rendering into an animation frame', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    usePlayerStore.getState().playSongsFromList(largeQueueSongs, 650, () => sourceContext);

    const { container } = render(<QueuePanel presenceState="open" />);
    const queueList = container.querySelector<HTMLElement>('.queue-list');
    if (!queueList) {
      throw new Error('Queue list did not render');
    }

    Object.defineProperty(queueList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(queueList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0
    });
    fireEvent.scroll(queueList);

    expect(screen.getByRole('button', { name: /Large Queue Song 651/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Large Queue Song 1/ })).not.toBeInTheDocument();

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(16));
    });

    expect(screen.getByRole('button', { name: /第 1 首：Large Queue Song 1$/ })).toBeInTheDocument();
  });
});
