import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../shared/musicTypes';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { SimilarSongsPanel } from './SimilarSongsPanel';

const seedSong: Song = {
  id: 'netease:seed',
  providerId: 'netease',
  platformSongId: 'seed',
  title: 'Seed Song',
  artist: 'Seed Artist',
  album: 'Seed Album',
  durationMs: 200_000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
};

const similarSongs: Song[] = Array.from({ length: 3 }, (_, index) => ({
  ...seedSong,
  id: `netease:similar-${index + 1}`,
  platformSongId: `similar-${index + 1}`,
  title: `Similar Song ${index + 1}`,
  durationMs: 180_000 + index * 1_000
}));

describe('SimilarSongsPanel', () => {
  beforeEach(() => {
    useAppNotificationStore.getState().resetForTest();
  });

  it('renders loading, empty, and failure states without song actions', () => {
    const props = createProps();
    const { rerender } = render(<SimilarSongsPanel {...props} isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载相似推荐');
    expect(screen.queryByRole('button', { name: /播放相似歌曲/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新相似推荐' })).toBeDisabled();

    rerender(<SimilarSongsPanel {...props} />);
    expect(screen.getByText('当前歌曲暂无相似推荐')).toBeInTheDocument();

    rerender(<SimilarSongsPanel {...props} errorMessage="相似推荐暂不可用" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('相似推荐暂不可用')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'similar-songs:netease:netease:seed',
      message: '相似推荐暂不可用',
      tone: 'error',
      action: { label: '重试' }
    });
    expect(screen.getByRole('button', { name: '刷新相似推荐' })).toBeEnabled();
  });

  it('exposes only explicit play, play-next, play-all, refresh, and close controls', () => {
    const onClose = vi.fn();
    const onRefresh = vi.fn();
    const onPlayAll = vi.fn();
    const onPlaySong = vi.fn();
    const onPlayNext = vi.fn();
    const { container } = render(
      <SimilarSongsPanel
        {...createProps()}
        songs={similarSongs}
        onClose={onClose}
        onRefresh={onRefresh}
        onPlayAll={onPlayAll}
        onPlaySong={onPlaySong}
        onPlayNext={onPlayNext}
      />
    );

    expect(screen.getByRole('list', { name: '与 Seed Song 相似的歌曲' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelector('.remote-song-row-actions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /喜欢|添加到/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '播放全部' }));
    fireEvent.click(screen.getByRole('button', { name: '播放相似歌曲：Similar Song 2' }));
    fireEvent.click(screen.getByRole('button', { name: '下一首播放：Similar Song 3' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新相似推荐' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭相似推荐' }));

    expect(onPlayAll).toHaveBeenCalledTimes(1);
    expect(onPlaySong).toHaveBeenCalledWith(similarSongs[1], 1);
    expect(onPlayNext).toHaveBeenCalledWith(similarSongs[2]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps its mounted dimensions stable during the close transition', () => {
    const { rerender } = render(
      <SimilarSongsPanel {...createProps()} songs={similarSongs} presenceState="open" />
    );
    const panel = screen.getByRole('complementary', { name: '当前歌曲相似推荐' });
    const rowCount = screen.getAllByRole('listitem').length;

    rerender(<SimilarSongsPanel {...createProps()} songs={similarSongs} presenceState="closed" />);

    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(screen.getAllByRole('listitem')).toHaveLength(rowCount);
  });
});

function createProps() {
  return {
    seedSong,
    songs: [] as Song[],
    isLoading: false,
    errorMessage: null as string | null,
    onClose: vi.fn(),
    onRefresh: vi.fn(),
    onPlayAll: vi.fn(),
    onPlaySong: vi.fn(),
    onPlayNext: vi.fn()
  };
}
