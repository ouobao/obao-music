import type {
  AlbumReference,
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistReference,
  ProviderId,
  RemoteProviderId,
  Song,
  SourceContext
} from '../../shared/musicTypes';
import type {
  ProviderErrorCode,
  ProviderIpcError,
  ProviderIpcResult
} from '../../shared/providerTypes';

export function decodeArtistDetailResult(
  value: unknown,
  expectedProviderId: RemoteProviderId,
  expectedArtistId: string
): ProviderIpcResult<ArtistDetail> | null {
  if (!isObjectRecord(value) || typeof value.ok !== 'boolean') {
    return null;
  }

  if (!value.ok) {
    const error = decodeProviderError(value.error, expectedProviderId);
    if (!error) {
      return null;
    }

    return {
      ok: false,
      error
    };
  }

  const artist = decodeArtistDetail(value.data, expectedProviderId, expectedArtistId);
  return artist ? { ok: true, data: artist } : null;
}

export function decodeAlbumDetailResult(
  value: unknown,
  expectedProviderId: RemoteProviderId,
  expectedAlbumId: string
): ProviderIpcResult<AlbumDetail> | null {
  if (!isObjectRecord(value) || typeof value.ok !== 'boolean') {
    return null;
  }

  if (!value.ok) {
    const error = decodeProviderError(value.error, expectedProviderId);
    return error ? { ok: false, error } : null;
  }

  const album = decodeAlbumDetail(value.data, expectedProviderId, expectedAlbumId);
  return album ? { ok: true, data: album } : null;
}

export function decodeArtistDetail(
  value: unknown,
  expectedProviderId: RemoteProviderId,
  expectedArtistId: string
): ArtistDetail | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    value.id !== expectedArtistId
    || value.providerId !== expectedProviderId
    || !isNonEmptyString(value.platformArtistId)
    || expectedArtistId !== `${expectedProviderId}:artist:${value.platformArtistId}`
    || !isNonEmptyString(value.name)
    || !Array.isArray(value.aliases)
    || !value.aliases.every((alias) => typeof alias === 'string')
    || typeof value.description !== 'string'
    || !isNonEmptyString(value.coverTone)
    || !isOptionalString(value.imageUrl)
    || !isOptionalString(value.sourceLabel)
    || !isOptionalString(value.area)
    || !isOptionalString(value.genre)
    || !isOptionalNonNegativeNumber(value.songCount)
    || !isOptionalNonNegativeNumber(value.albumCount)
    || !Array.isArray(value.topSongs)
    || !value.topSongs.every((song) => isSong(song, expectedProviderId))
    || !Array.isArray(value.albums)
    || !value.albums.every((album) => isAlbumSummary(album, expectedProviderId))
  ) {
    return null;
  }

  return value as unknown as ArtistDetail;
}

export function decodeAlbumDetail(
  value: unknown,
  expectedProviderId: RemoteProviderId,
  expectedAlbumId: string
): AlbumDetail | null {
  if (
    !isAlbumSummary(value, expectedProviderId)
    || value.id !== expectedAlbumId
    || expectedAlbumId !== `${expectedProviderId}:album:${value.platformAlbumId}`
    || typeof value.description !== 'string'
    || !Array.isArray(value.artists)
    || !value.artists.every((artist) => isArtistReference(artist, expectedProviderId))
    || !Array.isArray(value.tracks)
    || !value.tracks.every((song) => isSong(song, expectedProviderId))
  ) {
    return null;
  }

  return value as unknown as AlbumDetail;
}

function isSong(value: unknown, expectedProviderId: RemoteProviderId): value is Song {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isProviderScopedId(value.id, expectedProviderId)
    && value.providerId === expectedProviderId
    && (value.mediaType === undefined || value.mediaType === 'song')
    && isOptionalString(value.platformSongId)
    && isOptionalFiniteNumber(value.platformNumericSongId)
    && isOptionalFiniteNumber(value.platformSongType)
    && isOptionalString(value.platformMediaId)
    && isNonEmptyString(value.title)
    && typeof value.artist === 'string'
    && typeof value.album === 'string'
    && typeof value.durationMs === 'number'
    && Number.isFinite(value.durationMs)
    && value.durationMs >= 0
    && isNonEmptyString(value.coverTone)
    && isOptionalString(value.coverUrl)
    && isOptionalString(value.artistImageUrl)
    && (value.artists === undefined || (
      Array.isArray(value.artists)
      && value.artists.every((artist) => isArtistReference(artist, expectedProviderId))
    ))
    && (value.albumRef === undefined || isAlbumReference(value.albumRef, expectedProviderId))
    && (value.sourceContext === undefined || isSourceContext(value.sourceContext, expectedProviderId));
}

function isArtistReference(
  value: unknown,
  expectedProviderId: RemoteProviderId
): value is ArtistReference {
  return isObjectRecord(value)
    && value.providerId === expectedProviderId
    && isNonEmptyString(value.platformArtistId)
    && value.id === `${expectedProviderId}:artist:${value.platformArtistId}`
    && isNonEmptyString(value.name);
}

function isAlbumReference(
  value: unknown,
  expectedProviderId: RemoteProviderId
): value is AlbumReference & Record<string, unknown> {
  return isObjectRecord(value)
    && value.providerId === expectedProviderId
    && isNonEmptyString(value.platformAlbumId)
    && value.id === `${expectedProviderId}:album:${value.platformAlbumId}`
    && isNonEmptyString(value.title);
}

function isAlbumSummary(
  value: unknown,
  expectedProviderId: RemoteProviderId
): value is AlbumSummary & Record<string, unknown> {
  return isAlbumReference(value, expectedProviderId)
    && typeof value.artistName === 'string'
    && isNonEmptyString(value.coverTone)
    && isOptionalString(value.coverUrl)
    && isOptionalString(value.releaseDate)
    && isOptionalNonNegativeNumber(value.trackCount)
    && isOptionalString(value.albumType)
    && isOptionalString(value.sourceLabel);
}

function isSourceContext(
  value: unknown,
  expectedProviderId: RemoteProviderId
): value is SourceContext {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isSourceContextType(value.type)
    && value.providerId === expectedProviderId
    && isOptionalString(value.playlistId)
    && isOptionalString(value.playlistTitle)
    && isOptionalString(value.searchKeyword)
    && isOptionalString(value.artistId)
    && isOptionalString(value.artistName)
    && isOptionalString(value.albumId)
    && isOptionalString(value.albumTitle)
    && isOptionalString(value.podcastId)
    && isOptionalString(value.podcastTitle)
    && isOptionalString(value.radioSessionId)
    && isOptionalString(value.radioItemId);
}

function isSourceContextType(value: unknown): boolean {
  return value === 'playlist'
    || value === 'search'
    || value === 'local'
    || value === 'artist'
    || value === 'album'
    || value === 'podcast'
    || value === 'radio'
    || value === 'recommendation';
}

function isProviderErrorCode(value: unknown): value is ProviderErrorCode {
  return value === 'provider_not_ready'
    || value === 'provider_unsupported'
    || value === 'provider_failed';
}

function decodeProviderError(
  value: unknown,
  expectedProviderId: RemoteProviderId
): ProviderIpcError | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const { code, providerId, message } = value;
  if (
    !isProviderErrorCode(code)
    || providerId !== expectedProviderId
    || typeof message !== 'string'
    || message.trim().length === 0
  ) {
    return null;
  }

  return {
    code,
    providerId: expectedProviderId,
    message
  };
}

function isProviderScopedId(value: unknown, providerId: ProviderId): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const prefix = `${providerId}:`;
  return value.startsWith(prefix) && value.length > prefix.length;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined
    || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
