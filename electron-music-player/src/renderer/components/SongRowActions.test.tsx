import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '../../shared/musicTypes';
import { getBoundedSongMenuPosition, SongRowActions } from './SongRowActions';

const song: Song = {
  id: 'qq:test-song',
  providerId: 'qq',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

describe('SongRowActions', () => {
  it('positions menus above the player-safe bottom edge when there is not enough space below', () => {
    expect(
      getBoundedSongMenuPosition(
        { x: 640, y: 720 },
        { width: 168, height: 214 },
        { width: 1000, height: 800, reservedBottom: 760 }
      )
    ).toEqual({ x: 640, y: 498 });
  });

  it('keeps menus inside the top and right viewport edges', () => {
    expect(
      getBoundedSongMenuPosition(
        { x: 900, y: -20 },
        { width: 168, height: 214 },
        { width: 1000, height: 800 }
      )
    ).toEqual({ x: 824, y: 8 });
  });

  it('plays an unlike animation when the liked state changes to false', () => {
    vi.useFakeTimers();

    const { container, rerender } = renderSongActions(true);
    expect(getLikeButton(container)).toHaveClass('song-row-action-button-liked');

    rerender(createSongActions(false));

    expect(getLikeButton(container)).toHaveClass('song-row-action-button-like-out');
    expect(getLikeButton(container)).not.toHaveClass('song-row-action-button-liked');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(getLikeButton(container)).not.toHaveClass('song-row-action-button-like-out');
    vi.useRealTimers();
  });

  it('selects a writable playlist from the add-to submenu', () => {
    const playlist: Playlist = {
      id: 'qq:owned',
      providerId: 'qq',
      title: 'Owned playlist',
      description: '',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      coverUrl: 'https://example.test/covers/owned-playlist.jpg',
      ownership: 'created'
    };
    const onAddToPlaylist = vi.fn();

    render(
      <SongRowActions
        song={song}
        canLike
        isLiked={false}
        isLikedStatusReady
        menuOpen
        menuPosition={{ x: 24, y: 24 }}
        addTargets={[playlist]}
        canRemove={false}
        onToggleLike={noop}
        onPlay={noop}
        onPlayNext={noop}
        onAddToPlaylist={onAddToPlaylist}
        onDelete={noop}
        onOpenMenu={noop}
        onCloseMenu={noop}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: '添加到' }));
    expect(screen.getByRole('menu', { name: '添加到歌单' })).toBeVisible();

    const backButton = screen.getByRole('menuitem', { name: '返回' });
    expect(backButton.querySelector('svg.lucide-chevron-left')).toBeInTheDocument();

    const targetButton = screen.getByRole('menuitem', { name: 'Owned playlist' });
    const playlistCover = targetButton.querySelector<HTMLElement>('.song-context-menu-playlist-cover');
    expect(playlistCover?.style.getPropertyValue('--playlist-cover-image')).toContain('owned-playlist.jpg');
    expect(targetButton.querySelector('svg.lucide-plus')).not.toBeInTheDocument();

    fireEvent.click(targetButton);
    expect(onAddToPlaylist).toHaveBeenCalledWith(playlist);
  });
});

function renderSongActions(isLiked: boolean) {
  return render(createSongActions(isLiked));
}

function createSongActions(isLiked: boolean) {
  return (
    <SongRowActions
      song={song}
      canLike
      isLiked={isLiked}
      menuOpen={false}
      menuPosition={null}
      onToggleLike={noop}
      onPlay={noop}
      onPlayNext={noop}
      onAddTo={noop}
      onDelete={noop}
      onOpenMenu={noop}
      onCloseMenu={noop}
    />
  );
}

function getLikeButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>('[aria-pressed]');

  if (!button) {
    throw new Error('Like button did not render');
  }

  return button;
}

function noop() {}
