import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary } from '../../../shared/musicTypes';
import { useAppNotificationStore } from '../../state/appNotificationStore';
import { DiscoveryAlbumSection } from './DiscoveryAlbumSection';

const album: AlbumSummary = {
  id: 'qq:album:release-1',
  providerId: 'qq',
  platformAlbumId: 'release-1',
  title: 'Release Album',
  artistName: 'Release Artist',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://example.test/release.jpg',
  releaseDate: '2026-07-17',
  trackCount: 12,
  albumType: 'Album'
};

describe('DiscoveryAlbumSection', () => {
  beforeEach(() => {
    useAppNotificationStore.getState().resetForTest();
  });

  it('reuses playlist cover depth and isolates open from play actions', () => {
    const onSelectAlbum = vi.fn();
    const onPlayAlbum = vi.fn();
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(16);
      return 1;
    });
    const { container } = render(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[album]}
        status={{ isLoading: false, errorMessage: null }}
        onSelectAlbum={onSelectAlbum}
        onPlayAlbum={onPlayAlbum}
      />
    );
    const scene = container.querySelector<HTMLElement>('.discovery-album-cover');
    if (!scene) {
      throw new Error('Discovery album depth scene did not render');
    }
    vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      x: 100,
      y: 100,
      toJSON: () => ({})
    });

    expect(scene).toHaveClass('playlist-discovery-card-scene');
    expect(scene.querySelector('.playlist-discovery-card-image')).toBeInTheDocument();
    expect(scene.querySelector('.playlist-discovery-card-sheen')).toBeInTheDocument();
    act(() => {
      fireEvent.pointerMove(scene, { clientX: 280, clientY: 120 });
    });
    expect(scene.style.getPropertyValue('--playlist-card-rotate-x')).not.toBe('0deg');
    expect(scene.style.getPropertyValue('--playlist-card-rotate-y')).not.toBe('0deg');
    fireEvent.pointerLeave(scene);
    expect(scene.style.getPropertyValue('--playlist-card-rotate-x')).toBe('0deg');

    fireEvent.click(screen.getByRole('button', { name: `播放专辑：${album.title}` }));
    expect(onPlayAlbum).toHaveBeenCalledWith(album);
    expect(onSelectAlbum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `打开专辑：${album.title}` }));
    expect(onSelectAlbum).toHaveBeenCalledWith(album);
    expect(onPlayAlbum).toHaveBeenCalledTimes(1);
    animationFrame.mockRestore();
  });

  it('opens a selected album without exposing playlist or chart affordances', () => {
    const onSelectAlbum = vi.fn();
    render(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[album]}
        status={{ isLoading: false, errorMessage: null }}
        onSelectAlbum={onSelectAlbum}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: `打开专辑：${album.title}` }));

    expect(onSelectAlbum).toHaveBeenCalledWith(album);
    expect(screen.queryByText(/歌单|排行榜/)).not.toBeInTheDocument();
  });

  it('keeps stale albums visible while publishing a refresh error', () => {
    render(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[album]}
        status={{ isLoading: false, errorMessage: '新碟刷新失败' }}
      />
    );

    expect(screen.getByText(album.title)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('新碟刷新失败')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'discovery-section:正在加载新碟速递',
      message: '新碟刷新失败',
      tone: 'error'
    });
  });

  it('renders distinct loading and empty states', () => {
    const { rerender } = render(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[]}
        status={{ isLoading: true, errorMessage: null }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('正在加载新碟速递');

    rerender(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[]}
        status={{ isLoading: false, errorMessage: null }}
      />
    );
    expect(screen.getByText('当前暂无可用的新碟')).toBeInTheDocument();
  });

  it('renders a failed initial request without album controls', () => {
    render(
      <DiscoveryAlbumSection
        headingId="release-heading"
        albums={[]}
        status={{ isLoading: false, errorMessage: '新碟加载失败' }}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('新碟加载失败')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'discovery-section:正在加载新碟速递',
      message: '新碟加载失败',
      tone: 'error'
    });
    expect(screen.queryByRole('button', { name: /打开专辑/ })).not.toBeInTheDocument();
  });
});
