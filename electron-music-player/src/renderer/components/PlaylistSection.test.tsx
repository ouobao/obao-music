import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../../shared/musicTypes';
import { PlaylistSection } from './PlaylistSection';

const playlist: Playlist = {
  id: 'qq:playlist',
  providerId: 'qq',
  title: 'QQ Playlist',
  description: 'Provider playlist',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000003DFRzD192KKD.jpg',
  sourceLabel: 'QQ'
};

describe('PlaylistSection', () => {
  it('passes provider playlist artwork URLs into playlist cards', () => {
    const { container } = render(<PlaylistSection playlists={[playlist]} />);

    expect(container.querySelector<HTMLElement>('.playlist-cover')?.style.getPropertyValue('--playlist-cover-image')).toContain(
      '003DFRzD192KKD.jpg'
    );
  });

  it('does not point empty-state users to the removed local music entry', () => {
    render(<PlaylistSection playlists={[]} />);

    expect(screen.getByText('暂无歌单')).toBeInTheDocument();
    expect(screen.queryByText(/登录音乐平台/)).not.toBeInTheDocument();
    expect(screen.queryByText(/导入本地音乐/)).not.toBeInTheDocument();
  });

  it('opens a real provider playlist from its account-library card', () => {
    const onSelectPlaylist = vi.fn();
    const props = { playlists: [playlist], onSelectPlaylist };

    render(<PlaylistSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: `打开歌单：${playlist.title}` }));

    expect(onSelectPlaylist).toHaveBeenCalledWith(playlist.providerId, playlist.id);
  });
});
