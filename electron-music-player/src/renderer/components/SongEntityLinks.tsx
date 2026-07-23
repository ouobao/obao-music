import { Fragment, type MouseEvent } from 'react';
import type { AlbumReference, ArtistReference, Song } from '../../shared/musicTypes';

interface SongArtistLinksProps {
  song: Song;
  onSelectArtist?: (artist: ArtistReference) => void;
}

interface SongAlbumLinkProps {
  song: Song;
  onSelectAlbum?: (album: AlbumReference) => void;
}

export function SongArtistLinks({ song, onSelectArtist }: SongArtistLinksProps) {
  if (!onSelectArtist || !song.artists?.length) {
    return <>{song.artist}</>;
  }

  return (
    <>
      {song.artists.map((artist, index) => (
        <Fragment key={artist.id}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          <button
            className="song-entity-link"
            type="button"
            aria-label={`打开歌手：${artist.name}`}
            onClick={(event) => selectEntity(event, () => onSelectArtist(artist))}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {artist.name}
          </button>
        </Fragment>
      ))}
    </>
  );
}

export function SongAlbumLink({ song, onSelectAlbum }: SongAlbumLinkProps) {
  if (!onSelectAlbum || !song.albumRef) {
    return <>{song.album}</>;
  }

  return (
    <button
      className="song-entity-link"
      type="button"
      aria-label={`打开专辑：${song.albumRef.title}`}
      onClick={(event) => selectEntity(event, () => onSelectAlbum(song.albumRef!))}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {song.albumRef.title}
    </button>
  );
}

function selectEntity(event: MouseEvent<HTMLButtonElement>, select: () => void): void {
  event.stopPropagation();
  select();
}
