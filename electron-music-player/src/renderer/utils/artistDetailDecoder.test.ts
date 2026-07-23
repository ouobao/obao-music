import { describe, expect, it } from 'vitest';
import type { AlbumDetail, ArtistDetail, Song } from '../../shared/musicTypes';
import {
  decodeAlbumDetail,
  decodeAlbumDetailResult,
  decodeArtistDetail,
  decodeArtistDetailResult
} from './artistDetailDecoder';

const song: Song = {
  id: 'qq:0010BrWk2SucQr',
  providerId: 'qq',
  platformSongId: '0010BrWk2SucQr',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  durationMs: 180_000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  artists: [{
    id: 'qq:artist:0025NhlN2yWrP4',
    providerId: 'qq',
    platformArtistId: '0025NhlN2yWrP4',
    name: 'Artist'
  }],
  albumRef: {
    id: 'qq:album:000MkMni19ClKG',
    providerId: 'qq',
    platformAlbumId: '000MkMni19ClKG',
    title: 'Album'
  }
};

const artist: ArtistDetail = {
  id: 'qq:artist:0025NhlN2yWrP4',
  providerId: 'qq',
  platformArtistId: '0025NhlN2yWrP4',
  name: 'Artist',
  aliases: ['Alias'],
  description: 'Description',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  topSongs: [song],
  albums: [{
    id: 'qq:album:000MkMni19ClKG',
    providerId: 'qq',
    platformAlbumId: '000MkMni19ClKG',
    title: 'Album',
    artistName: 'Artist',
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
    trackCount: 1
  }]
};

const album: AlbumDetail = {
  id: 'qq:album:000MkMni19ClKG',
  providerId: 'qq',
  platformAlbumId: '000MkMni19ClKG',
  title: 'Album',
  artistName: 'Artist',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  description: 'Description',
  artists: [{
    id: 'qq:artist:0025NhlN2yWrP4',
    providerId: 'qq',
    platformArtistId: '0025NhlN2yWrP4',
    name: 'Artist'
  }],
  tracks: [song]
};

describe('artist detail decoder', () => {
  it('accepts a complete artist matching the requested identity', () => {
    expect(decodeArtistDetail(artist, 'qq', artist.id)).toBe(artist);
    expect(decodeArtistDetailResult({ ok: true, data: artist }, 'qq', artist.id)).toEqual({
      ok: true,
      data: artist
    });
  });

  it('rejects mismatched provider and artist identities', () => {
    expect(decodeArtistDetail(artist, 'netease', artist.id)).toBeNull();
    expect(decodeArtistDetail({ ...artist, id: 'qq:artist:other' }, 'qq', artist.id)).toBeNull();
  });

  it.each([
    ['aliases', null],
    ['topSongs', null],
    ['albums', null]
  ] as const)('rejects a non-array %s field', (field, value) => {
    expect(decodeArtistDetail({ ...artist, [field]: value }, 'qq', artist.id)).toBeNull();
  });

  it('rejects malformed nested songs and albums', () => {
    expect(decodeArtistDetail({
      ...artist,
      topSongs: [{ ...song, durationMs: '180000' }]
    }, 'qq', artist.id)).toBeNull();
    expect(decodeArtistDetail({
      ...artist,
      albums: [{ ...artist.albums[0], providerId: 'netease' }]
    }, 'qq', artist.id)).toBeNull();
  });

  it('accepts only well-formed provider error envelopes for the requested provider', () => {
    const error = {
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'qq',
        message: 'Artist load failed'
      }
    };

    expect(decodeArtistDetailResult(error, 'qq', artist.id)).toEqual(error);
    expect(decodeArtistDetailResult({
      ...error,
      error: { ...error.error, providerId: 'netease' }
    }, 'qq', artist.id)).toBeNull();
  });

  it('accepts a complete album matching the requested identity', () => {
    expect(decodeAlbumDetail(album, 'qq', album.id)).toBe(album);
    expect(decodeAlbumDetailResult({ ok: true, data: album }, 'qq', album.id)).toEqual({
      ok: true,
      data: album
    });
  });

  it('rejects mismatched album identities and malformed nested tracks', () => {
    expect(decodeAlbumDetail(album, 'netease', album.id)).toBeNull();
    expect(decodeAlbumDetail({ ...album, id: 'qq:album:other' }, 'qq', album.id)).toBeNull();
    expect(decodeAlbumDetail({ ...album, tracks: [{ ...song, providerId: 'netease' }] }, 'qq', album.id)).toBeNull();
    expect(decodeAlbumDetailResult({ ok: true, data: { ...album, artists: null } }, 'qq', album.id)).toBeNull();
  });
});
