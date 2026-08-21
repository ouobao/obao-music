import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ArtistReference, Playlist, ProviderId, Song } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { useUiStore } from '../state/uiStore';
import { useSongContextMenu } from '../hooks/useSongContextMenu';
import { formatDuration } from '../utils/format';
import { PopoverMenu } from './PopoverMenu';
import { HeartIcon, MoreIcon } from './icons';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';

export type SongOrigin =
  | { kind: 'playlist'; providerId: ProviderId; playlistId: string; ownership?: Playlist['ownership'] }
  | { kind: 'chart' | 'search' | 'home' | 'history' | 'artist' | 'album' | 'recommendation' | 'local'; providerId: ProviderId };

function queueSourceForOrigin(origin?: SongOrigin): string {
  if (!origin) return 'playlist';
  if (origin.kind === 'playlist' || origin.kind === 'chart' || origin.kind === 'home' || origin.kind === 'history') return 'playlist';
  if (origin.kind === 'search') return 'search';
  if (origin.kind === 'artist') return 'artist';
  if (origin.kind === 'album') return 'album';
  if (origin.kind === 'recommendation') return 'recommendation';
  if (origin.kind === 'local') return 'local';
  return 'playlist';
}

export interface SongRowData {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverTone: string;
  coverUrl?: string;
}

interface SongTableProps {
  songs: Song[];
  onPlay?: (song: Song) => void;
  onArtistClick?: (song: Song) => void;
  onAlbumClick?: (song: Song) => void;
  showAlbum?: boolean;
  origin?: SongOrigin;
}

export function SongTable({ songs, onPlay, onArtistClick, onAlbumClick, showAlbum = true, origin }: SongTableProps) {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const enqueueNextSong = usePlayerStore((s) => s.enqueueNextSong);
  const enqueueSong = usePlayerStore((s) => s.enqueueSong);
  const navigateToView = useUiStore((s) => s.navigateToView);

  const openArtist = (artist: ArtistReference) => {
    navigateToView('artist', { providerId: artist.providerId, artistId: artist.id, title: artist.name });
  };

  const handleArtistClick = (song: Song, artist: ArtistReference) => {
    if (onArtistClick) {
      onArtistClick(song);
      return;
    }
    openArtist(artist);
  };

  const openAlbum = (song: Song) => {
    if (onAlbumClick) {
      onAlbumClick(song);
      return;
    }
    const album = song.albumRef;
    if (!album) return;
    navigateToView('album', { providerId: album.providerId, albumId: album.id, title: album.title });
  };

  const handleRowClick = (song: Song) => {
    if (onPlay) {
      onPlay(song);
    } else {
      playSongsFromList(
        songs,
        songs.findIndex((candidate) => candidate.id === song.id && candidate.providerId === song.providerId)
      );
    }
  };

  const source = queueSourceForOrigin(origin);

  return (
    <div className={`song-table ${showAlbum ? '' : 'song-table-without-album'}`}>
      {songs.length > 0 && (
        <div className={`song-table-header ${showAlbum ? '' : 'song-table-header-without-album'}`}>
          <div>#</div>
          <div>标题</div>
          <div>歌手</div>
          {showAlbum && <div>专辑</div>}
          <div>时长</div>
          <div />
        </div>
      )}
      <SongTableBody
        songs={songs}
        currentSong={currentSong}
        showAlbum={showAlbum}
        origin={origin}
        source={source}
        handleRowClick={handleRowClick}
        onArtistClick={onArtistClick}
        onAlbumClick={onAlbumClick}
        handleArtistClick={handleArtistClick}
        openAlbum={openAlbum}
        enqueueNextSong={enqueueNextSong}
        enqueueSong={enqueueSong}
      />
      {songs.length === 0 && <div className="empty-state">暂无歌曲</div>}
    </div>
  );
}

/** 大列表增量渲染：仅挂载前 N 行，滚动接近末尾时按块追加，避免一次性渲染数千行导致卡顿 */
const SONG_CHUNK_SIZE = 120;

function SongTableBody({
  songs,
  currentSong,
  showAlbum,
  origin,
  source,
  handleRowClick,
  onArtistClick,
  onAlbumClick,
  handleArtistClick,
  openAlbum,
  enqueueNextSong,
  enqueueSong
}: {
  songs: Song[];
  currentSong: Song | null;
  showAlbum: boolean;
  origin?: SongOrigin;
  source: string;
  handleRowClick: (song: Song) => void;
  onArtistClick?: (song: Song) => void;
  onAlbumClick?: (song: Song) => void;
  handleArtistClick: (song: Song, artist: ArtistReference) => void;
  openAlbum: (song: Song) => void;
  enqueueNextSong: (song: Song, source: string) => void;
  enqueueSong: (song: Song, source: string) => void;
}) {
  const [renderCount, setRenderCount] = useState(SONG_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenderCount(Math.min(SONG_CHUNK_SIZE, songs.length));
  }, [songs.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const container = el.closest<HTMLElement>('.main-content');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setRenderCount((count) => Math.min(songs.length, count + SONG_CHUNK_SIZE));
      },
      { root: container ?? null, rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [songs.length]);

  const visibleSongs = renderCount >= songs.length ? songs : songs.slice(0, renderCount);

  return (
    <>
      {visibleSongs.map((song, idx) => {
        const isPlaying = song.id === currentSong?.id && song.providerId === currentSong?.providerId;
        return (
          <SongRow
            key={`${song.providerId}:${song.id}`}
            song={song}
            songs={songs}
            index={idx}
            isPlaying={isPlaying}
            showAlbum={showAlbum}
            origin={origin}
            source={source}
            onClick={() => handleRowClick(song)}
            onArtistClick={song.artists?.length ? (artist) => handleArtistClick(song, artist) : undefined}
            onAlbumClick={onAlbumClick || song.albumRef ? () => openAlbum(song) : undefined}
            onPlayNow={() => handleRowClick(song)}
            onPlayNext={() => enqueueNextSong(song, source)}
            onEnqueue={() => enqueueSong(song, source)}
          />
        );
      })}
      {renderCount < songs.length && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
    </>
  );
}

interface SongRowProps {
  song: Song;
  songs: Song[];
  index: number;
  isPlaying: boolean;
  showAlbum: boolean;
  origin?: SongOrigin;
  source: string;
  onClick: () => void;
  onArtistClick?: (artist: ArtistReference) => void;
  onAlbumClick?: () => void;
  onPlayNow: () => void;
  onPlayNext: () => void;
  onEnqueue: () => void;
}

function SongRow({
  song,
  songs,
  index,
  isPlaying,
  showAlbum,
  origin,
  source,
  onClick,
  onArtistClick,
  onAlbumClick,
  onPlayNow,
  onPlayNext,
  onEnqueue
}: SongRowProps) {
  const { menuItems, liked, pendingAction, toggleLiked } = useSongContextMenu(song, {
    source,
    origin,
    onPlayNow,
    onPlayNext,
    onEnqueue
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cursorAnchored: boolean } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.popover-menu')) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, cursorAnchored: true });
  };

  // 歌手名：多歌手逐个渲染为独立可点击链接，点击跳转到对应歌手而非固定第一个
  const renderArtistLinks = () => {
    if (!song.artists?.length) return song.artist;
    return song.artists.map((artist, index) => (
      <span key={artist.id}>
        {index > 0 && <span className="song-artist-sep"> / </span>}
        {onArtistClick ? (
          <button
            type="button"
            className="song-row-artist-link"
            title="打开歌手页"
            onClick={(e) => {
              e.stopPropagation();
              onArtistClick(artist);
            }}
          >
            {artist.name}
          </button>
        ) : (
          artist.name
        )}
      </span>
    ));
  };

  return (
    <div
      className={`song-row ${isPlaying ? 'playing' : ''} ${showAlbum ? '' : 'song-row-without-album'}`}
      data-song-provider={song.providerId}
      data-song-id={song.id}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
      onClick={onClick}
      onContextMenu={openContextMenu}
    >
      <div className="song-index-col">
        {isPlaying ? (
          <div className="playing-wave">
            <span />
            <span />
            <span />
          </div>
        ) : (
          String(index + 1).padStart(2, '0')
        )}
      </div>
      <div className="song-title-col">
        {song.coverUrl ? (
          <img className="song-row-cover" ref={imageRevealRef} src={song.coverUrl} alt="" loading="lazy" onLoad={onImageReveal} onError={onImageReveal} />
        ) : (
          <div className="song-row-cover" style={{ background: song.coverTone || 'var(--bg-card)' }} />
        )}
        <div className="song-row-meta">
          <span className="song-row-title">{song.title}</span>
          <span className="song-row-artist">{renderArtistLinks()}</span>
        </div>
      </div>
      <div className="song-artist-col">{renderArtistLinks()}</div>
      {showAlbum && (
        <div
          className="song-album-col"
          onClick={onAlbumClick ? (event) => { event.stopPropagation(); onAlbumClick(); } : undefined}
          style={onAlbumClick ? { cursor: 'pointer' } : undefined}
          title={onAlbumClick ? '打开专辑页' : undefined}
        >
          {song.albumRef?.title || song.album}
        </div>
      )}
      <div className="song-duration-col">{formatDuration(song.durationMs)}</div>
      <div className="song-actions-col">
        {song.providerId !== 'local' && (
          <button
            className={`song-action-like ${liked ? 'liked' : ''}`}
            title={liked ? '取消喜欢' : '喜欢'}
            aria-label={liked ? '取消喜欢' : '喜欢'}
            disabled={pendingAction === 'like'}
            onClick={(event) => {
              event.stopPropagation();
              toggleLiked();
            }}
          >
            {pendingAction === 'like' ? (
              <span className="mini-spinner" aria-hidden="true" />
            ) : (
              <HeartIcon size={15} strokeWidth={2} filled={liked} />
            )}
          </button>
        )}
        <div
          style={{ position: 'relative', display: 'inline-flex' }}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setContextMenu({ x: rect.right, y: rect.bottom + 6, cursorAnchored: false });
          }}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <button
            className="song-action-more"
            title="更多操作"
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={Boolean(contextMenu)}
          >
            <MoreIcon size={15} strokeWidth={0} filled />
          </button>
        </div>
      </div>
      {contextMenu && (
        <PopoverMenu
          open={Boolean(contextMenu)}
          onClose={() => setContextMenu(null)}
          fixedPosition={contextMenu}
          cursorAnchored={contextMenu.cursorAnchored}
          position="bottom"
          align="right"
          ariaLabel="歌曲操作"
          items={menuItems}
        />
      )}
    </div>
  );
}
