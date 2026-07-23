import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, ProviderId, Song } from '../../shared/musicTypes';
import type { SearchEntityResults } from '../../shared/providerTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { qqSearchSongs } from '../test/fixtures/musicFixtures';
import { usePlayerStore } from '../state/playerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { SearchResultsView } from './SearchResultsView';

describe('SearchResultsView', () => {
  beforeEach(() => {
    installMusicPlayerApiMock({
      getLoginStatus: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true, playbackReady: true } }),
      login: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true, playbackReady: true } })
    });
    usePlayerStore.getState().resetForTest();
    useLibraryStore.getState().resetForTest();
    useAppNotificationStore.getState().resetForTest();
  });

  it('renders the QQ-style song search surface and starts playback from its action bar', async () => {
    const handleProviderChange = vi.fn<(providerId: Extract<ProviderId, 'netease' | 'qq'>) => void>();
    render(
      <SearchResultsView
        keyword="baby"
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
        onProviderChange={handleProviderChange}
      />
    );

    expect(screen.getByRole('heading', { name: /\u641c\u7d22/ })).toBeInTheDocument();

    const providerSelector = screen.getByRole('group', { name: /\u641c\u7d22\u6765\u6e90/ });
    const providerButtons = within(providerSelector).getAllByRole('button');
    expect(providerButtons).toHaveLength(2);
    expect(providerButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(providerButtons[1]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(providerButtons[1]);
    expect(handleProviderChange).toHaveBeenCalledWith('netease');

    expect(screen.queryByRole('tablist', { name: /\u641c\u7d22\u5206\u7c7b/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\u4e0b\u8f7d\u641c\u7d22\u7ed3\u679c/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\u6279\u91cf\u9009\u62e9\u641c\u7d22\u7ed3\u679c/ })).not.toBeInTheDocument();

    expect(screen.getByText('2 首')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /\u6b4c\u540d/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /\u64cd\u4f5c/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /\u6765\u6e90/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /\u4e13\u8f91/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /\u65f6\u957f/ })).toBeInTheDocument();

    const firstResult = screen.getByRole('button', { name: `加入队列：${qqSearchSongs[0].title}` });
    const mainColumn = firstResult.querySelector<HTMLElement>('.qq-search-song-main');
    const sourceColumn = firstResult.querySelector<HTMLElement>('.qq-search-source');
    expect(mainColumn).not.toBeNull();
    expect(sourceColumn).not.toBeNull();
    expect(within(mainColumn as HTMLElement).queryByText(/QQ/)).not.toBeInTheDocument();
    expect(within(sourceColumn as HTMLElement).getByText(/QQ/)).toBeInTheDocument();
    expect(within(firstResult).queryByText('VIP')).not.toBeInTheDocument();
    expect(within(firstResult).queryByText('SQ')).not.toBeInTheDocument();
    expect(within(firstResult).getByText('3:33')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '播放全部搜索结果' }));

    expect(usePlayerStore.getState().queue.map((item) => item.songId)).toEqual(qqSearchSongs.map((song) => song.id));
    expect(usePlayerStore.getState().currentSong?.id).toBe('qq:visual-song-1');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('replaces the queue with the search result context when a result is double clicked', () => {
    render(
      <SearchResultsView
        keyword="baby"
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: `加入队列：${qqSearchSongs[1].title}` }));

    const state = usePlayerStore.getState();
    expect(state.queue.map((item) => item.songId)).toEqual(qqSearchSongs.map((song) => song.id));
    expect(state.currentSong?.id).toBe(qqSearchSongs[1].id);
    expect(state.queue[1].sourceContext).toMatchObject({
      type: 'search',
      providerId: 'qq',
      searchKeyword: 'baby'
    });
  });

  it('adds a clicked search result to the queue without starting playback', () => {
    render(
      <SearchResultsView
        keyword="baby"
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: `加入队列：${qqSearchSongs[1].title}` }));

    const state = usePlayerStore.getState();
    expect(state.currentSong).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.queue.map((item) => item.songId)).toEqual([qqSearchSongs[1].id]);
    expect(state.queue[0].sourceContext).toMatchObject({
      type: 'search',
      providerId: 'qq',
      searchKeyword: 'baby'
    });
  });

  it('opens structured artist and album references without enqueueing the song row', () => {
    const structuredSong: Song = {
      ...qqSearchSongs[0],
      artists: [{
        id: 'qq:artist:0025NhlN2yWrP4',
        providerId: 'qq',
        platformArtistId: '0025NhlN2yWrP4',
        name: '周杰伦'
      }],
      albumRef: {
        id: 'qq:album:000MkMni19ClKG',
        providerId: 'qq',
        platformAlbumId: '000MkMni19ClKG',
        title: '叶惠美'
      }
    };
    const onSelectArtist = vi.fn();
    const onSelectAlbum = vi.fn();
    render(
      <SearchResultsView
        keyword="晴天"
        providerId="qq"
        results={[structuredSong]}
        isLoading={false}
        errorMessage={null}
        onSelectArtist={onSelectArtist}
        onSelectAlbum={onSelectAlbum}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: '打开歌手：周杰伦' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '打开专辑：叶惠美' }));

    expect(onSelectArtist).toHaveBeenCalledWith(structuredSong.artists?.[0]);
    expect(onSelectAlbum).toHaveBeenCalledWith(structuredSong.albumRef);
    expect(usePlayerStore.getState().queue).toEqual([]);
  });

  it('highlights the currently playing search result when it is visible', () => {
    usePlayerStore.getState().playSongsFromList(
      qqSearchSongs,
      1,
      () => ({
        type: 'search',
        providerId: 'qq',
        searchKeyword: 'baby'
      })
    );

    render(
      <SearchResultsView
        keyword="baby"
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    const currentResult = screen.getByRole('button', { name: `加入队列：${qqSearchSongs[1].title}` });

    expect(currentResult).toHaveClass('song-row-current');
    expect(currentResult).toHaveAttribute('data-current', 'true');
  });

  it('uses remote song actions for search rows without locally deleting results', async () => {
    const likedPlaylist: Playlist = {
      id: 'qq:201',
      providerId: 'qq',
      title: 'Liked Songs',
      description: '',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      ownership: 'liked',
      isLiked: true
    };
    const ownedPlaylist: Playlist = {
      id: 'qq:owned',
      providerId: 'qq',
      title: 'Owned Playlist',
      description: '',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      ownership: 'created'
    };
    let likedTracks: Song[] = [];
    const setSongLiked = vi.fn(async (_providerId: ProviderId, song: Song, liked: boolean) => {
      likedTracks = liked ? [song] : [];
      return { ok: true as const, data: { providerId: 'qq' as const, operation: liked ? 'like' as const : 'unlike' as const } };
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [likedPlaylist, ownedPlaylist] });
    window.musicPlayer.music.getPlaylistTracks = async (_providerId, playlistId) => ({ ok: true, data: playlistId === likedPlaylist.id ? likedTracks : [] });
    window.musicPlayer.music.setSongLiked = setSongLiked;

    render(
      <SearchResultsView
        keyword="baby"
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    const firstResult = screen.getByRole('button', { name: `加入队列：${qqSearchSongs[0].title}` });

    expect(firstResult.querySelector('.qq-search-song-index')).not.toBeInTheDocument();
    expect(firstResult.querySelector('.song-row-actions')).toBeInTheDocument();
    const favoriteButton = within(firstResult).getByRole('button', { name: /\u6dfb\u52a0\u5230\u559c\u6b22/ });
    await waitFor(() => expect(favoriteButton).toBeEnabled());
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');
    expect(within(firstResult).queryByRole('button', { name: /\u4e0b\u8f7d/ })).not.toBeInTheDocument();

    fireEvent.click(favoriteButton);
    await waitFor(() => expect(favoriteButton).toHaveAttribute('aria-pressed', 'true'));
    expect(setSongLiked).toHaveBeenCalledWith('qq', qqSearchSongs[0], true);

    fireEvent.contextMenu(firstResult, { clientX: 240, clientY: 160 });

    const menu = screen.getByRole('menu', { name: new RegExp(qqSearchSongs[0].title) });
    expect(within(menu).getByRole('menuitem', { name: '\u64ad\u653e' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u4e0b\u4e00\u9996\u64ad\u653e' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u53d6\u6d88\u559c\u6b22' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u6dfb\u52a0\u5230' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: '\u5220\u9664' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u590d\u5236\u6b4c\u66f2\u4fe1\u606f' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /\u4e0b\u8f7d/ })).not.toBeInTheDocument();
  });

  it('uses a provider artist image for the singer spotlight instead of the first song cover', () => {
    const artistSongs: Array<Song & { artistImageUrl: string }> = [
      {
        ...qqSearchSongs[0],
        id: 'qq:eason-1',
        title: '好久不见',
        artist: '陈奕迅',
        coverUrl: 'https://example.test/covers/song-cover.jpg',
        artistImageUrl: 'https://example.test/artists/eason.jpg'
      },
      {
        ...qqSearchSongs[1],
        id: 'qq:eason-2',
        title: '最佳损友',
        artist: '陈奕迅',
        coverUrl: 'https://example.test/covers/other-song-cover.jpg',
        artistImageUrl: 'https://example.test/artists/eason.jpg'
      }
    ];

    const { container } = render(
      <SearchResultsView
        keyword="陈"
        providerId="qq"
        results={artistSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    const artistAvatar = container.querySelector<HTMLElement>('.qq-search-artist-avatar');
    expect(artistAvatar?.style.getPropertyValue('--song-cover-image')).toContain('artists/eason.jpg');
    expect(artistAvatar?.style.getPropertyValue('--song-cover-image')).not.toContain('song-cover.jpg');
  });

  it('keeps a long search keyword available while rendering it in the compact query slot', () => {
    const keyword = '左转灯 (1000 Times +1) - 派伟俊 / mac ova seas · 左转灯特别加长搜索版本';
    const { container } = render(
      <SearchResultsView
        keyword={keyword}
        providerId="qq"
        results={qqSearchSongs}
        isLoading={false}
        errorMessage={null}
      />
    );

    const query = container.querySelector('.qq-search-query');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('搜索结果');
    expect(heading).toHaveTextContent(keyword);
    expect(query).toHaveAttribute('title', keyword);
    expect(query).toHaveTextContent(keyword);
  });

  it('renders remote entity sections, supports category navigation, and opens a searched playlist', () => {
    const onSelectPlaylist = vi.fn();
    const onLoadMore = vi.fn();
    const onResultViewChange = vi.fn();
    const entityResults: SearchEntityResults = {
      providerId: 'netease',
      keyword: '晴天',
      sections: {
        songs: {
          available: true,
          items: [{ ...qqSearchSongs[0], id: 'netease:search-song', providerId: 'netease', title: '搜索歌曲' }],
          total: 31,
          hasMore: true,
          errorMessage: null
        },
        artists: {
          available: true,
          items: [{
            id: 'netease:artist:1',
            providerId: 'netease',
            platformArtistId: '1',
            name: '搜索歌手',
            coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
          }],
          total: 8,
          hasMore: true,
          errorMessage: null
        },
        albums: {
          available: true,
          items: [{
            id: 'netease:album:1',
            providerId: 'netease',
            platformAlbumId: '1',
            title: '搜索专辑',
            artistName: '搜索歌手',
            coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
          }],
          total: 1,
          hasMore: false,
          errorMessage: null
        },
        playlists: {
          available: true,
          items: [{
            id: 'netease:playlist:1',
            providerId: 'netease',
            platformPlaylistId: '1',
            title: '搜索歌单',
            description: '搜索歌单描述',
            songIds: [],
            coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
            creatorName: '创建者'
          }],
          total: 1,
          hasMore: false,
          errorMessage: null
        }
      }
    };
    const { rerender } = render(
      <SearchResultsView
        keyword="晴天"
        providerId="netease"
        results={entityResults.sections.songs.items}
        entityResults={entityResults}
        isLoading={false}
        errorMessage={null}
        onSelectPlaylist={onSelectPlaylist}
        onLoadMore={onLoadMore}
        onResultViewChange={onResultViewChange}
      />
    );

    expect(screen.getByRole('tablist', { name: '搜索分类' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '歌曲' })).toHaveTextContent('歌曲31');
    expect(screen.getByRole('tab', { name: '歌手' })).toHaveTextContent('歌手8');
    fireEvent.click(screen.getByRole('button', { name: '查看全部8项歌手' }));
    expect(onResultViewChange).toHaveBeenCalledWith('artist');
    expect(within(screen.getByRole('tabpanel', { name: '歌手搜索结果' })).getByRole('button', { name: /搜索歌手/ })).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: '专辑搜索结果' })).getByRole('button', { name: /搜索专辑/ })).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: '歌单搜索结果' })).getByRole('button', { name: /搜索歌单/ })).toBeInTheDocument();

    rerender(
      <SearchResultsView
        keyword="晴天"
        providerId="netease"
        results={entityResults.sections.songs.items}
        entityResults={entityResults}
        activeResultView="playlist"
        isLoading={false}
        errorMessage={null}
        onSelectPlaylist={onSelectPlaylist}
        onLoadMore={onLoadMore}
      />
    );
    fireEvent.click(within(screen.getByRole('tabpanel', { name: '歌单搜索结果' })).getByRole('button', { name: /搜索歌单/ }));
    expect(onSelectPlaylist).toHaveBeenCalledWith(entityResults.sections.playlists.items[0]);

    rerender(
      <SearchResultsView
        keyword="晴天"
        providerId="netease"
        results={entityResults.sections.songs.items}
        entityResults={entityResults}
        activeResultView="song"
        isLoading={false}
        errorMessage={null}
        onSelectPlaylist={onSelectPlaylist}
        onLoadMore={onLoadMore}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(onLoadMore).toHaveBeenCalledWith('song');
  });

  it('publishes a remote song segment failure without inserting it into the result container', () => {
    const entityResults: SearchEntityResults = {
      providerId: 'qq',
      keyword: '错误',
      sections: {
        songs: { available: true, items: [], total: 0, hasMore: false, errorMessage: '歌曲搜索暂时不可用' },
        artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
        albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
        playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
      }
    };

    render(
      <SearchResultsView
        keyword="错误"
        providerId="qq"
        results={[]}
        entityResults={entityResults}
        activeResultView="song"
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      message: '歌曲搜索暂时不可用',
      tone: 'error'
    });
    expect(screen.getByRole('tab', { name: '歌曲' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '专辑' })).toBeInTheDocument();
  });

  it('keeps the 600-song overview bounded to its six-item summary', () => {
    const songs = createSearchSongs(600);
    const entityResults = createSongOnlyEntityResults(songs);
    const onResultViewChange = vi.fn();
    const { container } = render(
      <SearchResultsView
        keyword="批量结果"
        providerId="qq"
        results={songs}
        entityResults={entityResults}
        activeResultView="overview"
        isLoading={false}
        errorMessage={null}
        onResultViewChange={onResultViewChange}
      />
    );

    expect(container.querySelectorAll('.qq-search-song-row')).toHaveLength(6);
    expect(screen.getByRole('button', { name: '加入队列：搜索歌曲 6' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '加入队列：搜索歌曲 7' })).not.toBeInTheDocument();
    expect(screen.getByText('600 首')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看全部600首歌曲' }));
    expect(onResultViewChange).toHaveBeenCalledWith('song');
  });

  it('keeps the spotlight artist stable across pagination and opens its exact reference', () => {
    const artist = {
      id: 'qq:artist:jay',
      providerId: 'qq' as const,
      platformArtistId: 'jay',
      name: '周杰伦'
    };
    const firstPage = createSpotlightSongs(2, artist, '周杰伦');
    const secondPage = createSpotlightSongs(3, {
      ...artist,
      id: 'qq:artist:zhou',
      platformArtistId: 'zhou',
      name: '周杰'
    }, '周杰');
    const onSelectArtist = vi.fn();
    const { rerender } = render(
      <SearchResultsView
        keyword="周"
        providerId="qq"
        results={firstPage}
        isLoading={false}
        errorMessage={null}
        onSelectArtist={onSelectArtist}
      />
    );

    expect(screen.getAllByRole('button', { name: '打开歌手：周杰伦' })[0]).toBeInTheDocument();
    rerender(
      <SearchResultsView
        keyword="周"
        providerId="qq"
        results={[...firstPage, ...secondPage]}
        isLoading={false}
        errorMessage={null}
        onSelectArtist={onSelectArtist}
      />
    );

    expect(screen.getAllByRole('button', { name: '打开歌手：周杰伦' })[0]).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '打开歌手：周杰伦' })[0]);
    expect(onSelectArtist).toHaveBeenCalledWith(artist);
  });
  it('virtualizes 1000 songs and preserves the global index for the last row menu', async () => {
    const songs = createSearchSongs(1000);
    const entityResults = createSongOnlyEntityResults(songs);
    const { container } = render(
      <SearchResultsView
        keyword="海量结果"
        providerId="qq"
        results={songs}
        entityResults={entityResults}
        activeResultView="song"
        isLoading={false}
        errorMessage={null}
      />
    );

    const list = screen.getByRole('list', { name: '搜索结果：海量结果' });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 520 });
    expect(container.querySelectorAll('.qq-search-song-row').length).toBeLessThan(40);
    expect(container.querySelector('.qq-search-song-list-virtual-space')).toHaveStyle('height: 50000px');

    list.scrollTop = 1000 * 50 - 520;
    fireEvent.scroll(list);

    const lastSong = songs.at(-1) as Song;
    const lastRow = await screen.findByRole('button', { name: `加入队列：${lastSong.title}` });
    expect(container.querySelectorAll('.qq-search-song-row').length).toBeLessThan(40);

    fireEvent.contextMenu(lastRow, { clientX: 260, clientY: 180 });
    const menu = await screen.findByRole('menu', { name: new RegExp(lastSong.title) });
    fireEvent.click(within(menu).getByRole('menuitem', { name: '播放' }));

    expect(usePlayerStore.getState().currentSong?.id).toBe(lastSong.id);
    expect(usePlayerStore.getState().queue).toHaveLength(1000);
  });
});

function createSpotlightSongs(count: number, artist: { id: string; providerId: 'qq'; platformArtistId: string; name: string }, artistName: string): Song[] {
  return Array.from({ length: count }, (_, index) => ({
    ...qqSearchSongs[0],
    id: `qq:spotlight-${artist.platformArtistId}-${index + 1}`,
    platformSongId: `spotlight-${artist.platformArtistId}-${index + 1}`,
    title: `${artistName}歌曲 ${index + 1}`,
    artist: artistName,
    artists: [artist],
    album: `${artistName}专辑 ${index + 1}`
  }));
}


function createSearchSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, index) => ({
    ...qqSearchSongs[index % qqSearchSongs.length],
    id: `qq:search-virtual-${index + 1}`,
    platformSongId: `search-virtual-${index + 1}`,
    title: `搜索歌曲 ${index + 1}`
  }));
}

function createSongOnlyEntityResults(songs: Song[]): SearchEntityResults {
  return {
    providerId: 'qq',
    keyword: '批量结果',
    sections: {
      songs: { available: true, items: songs, total: songs.length, hasMore: false, errorMessage: null },
      artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
      albums: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
      playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
    }
  };
}
