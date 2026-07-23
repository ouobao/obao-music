import { create } from 'zustand';
import type { AlbumDetail, ArtistDetail, RemoteProviderId } from '../../shared/musicTypes';
import type { ProviderFetchOptions } from '../../shared/providerTypes';
import {
  decodeAlbumDetailResult,
  decodeArtistDetailResult
} from '../utils/artistDetailDecoder';

interface ArtistCatalogState {
  artistDetailsById: Record<string, ArtistDetail>;
  artistLoadingById: Record<string, boolean>;
  artistErrorById: Record<string, string | null>;
  albumDetailsById: Record<string, AlbumDetail>;
  albumLoadingById: Record<string, boolean>;
  albumErrorById: Record<string, string | null>;
  loadArtistDetail: (
    providerId: RemoteProviderId,
    artistId: string,
    options?: ProviderFetchOptions
  ) => Promise<ArtistDetail | null>;
  invalidateArtistDetail: (providerId: RemoteProviderId, artistId: string) => void;
  loadAlbumDetail: (
    providerId: RemoteProviderId,
    albumId: string,
    options?: ProviderFetchOptions
  ) => Promise<AlbumDetail | null>;
  resetForTest: () => void;
}

interface PendingArtistRequest {
  revision: number;
  request: Promise<ArtistDetail | null>;
}

interface PendingAlbumRequest {
  revision: number;
  request: Promise<AlbumDetail | null>;
}

const invalidArtistDetailMessage = '歌手详情数据无效，请重试';
const artistDetailLoadFailedMessage = '歌手详情加载失败';
const invalidAlbumDetailMessage = '专辑详情数据无效，请重试';
const albumDetailLoadFailedMessage = '专辑详情加载失败';

export const useArtistCatalogStore = create<ArtistCatalogState>((set, get) => {
  const artistRequests = new Map<string, PendingArtistRequest>();
  const latestArtistRequestRevisionByKey = new Map<string, number>();
  const albumRequests = new Map<string, PendingAlbumRequest>();
  const latestAlbumRequestRevisionByKey = new Map<string, number>();
  let artistRequestSequence = 0;
  let albumRequestSequence = 0;

  const loadArtistDetail: ArtistCatalogState['loadArtistDetail'] = async (
    providerId,
    artistId,
    options
  ) => {
      const requestKey = createArtistRequestKey(providerId, artistId);
      const forceRefresh = options?.forceRefresh === true;
      const currentState = get();
      const cachedArtist = currentState.artistDetailsById[artistId];
      if (!forceRefresh && cachedArtist) {
        return cachedArtist;
      }

      const pendingKey = createPendingArtistRequestKey(requestKey, forceRefresh);
      const refreshPendingKey = createPendingArtistRequestKey(requestKey, true);
      const activeRequest = forceRefresh
        ? artistRequests.get(pendingKey)
        : artistRequests.get(refreshPendingKey) ?? artistRequests.get(pendingKey);
      if (
        activeRequest
        && latestArtistRequestRevisionByKey.get(requestKey) === activeRequest.revision
      ) {
        return activeRequest.request;
      }

      const revision = ++artistRequestSequence;
      latestArtistRequestRevisionByKey.set(requestKey, revision);

      set((state) => ({
        artistLoadingById: {
          ...state.artistLoadingById,
          [artistId]: true
        },
        artistErrorById: {
          ...state.artistErrorById,
          [artistId]: null
        }
      }));

      const request = (async () => {
        let nextArtist: ArtistDetail | null = null;
        let shouldCommitArtist = false;
        let errorMessage: string | null = null;

        try {
          let rawResult: unknown = await requestArtistDetail(providerId, artistId, options);
          if (latestArtistRequestRevisionByKey.get(requestKey) !== revision) {
            return get().artistDetailsById[artistId] ?? cachedArtist ?? null;
          }

          let result = decodeArtistDetailResult(rawResult, providerId, artistId);
          if (!result && !forceRefresh) {
            rawResult = await requestArtistDetail(providerId, artistId, {
              ...options,
              forceRefresh: true
            });
            if (latestArtistRequestRevisionByKey.get(requestKey) !== revision) {
              return get().artistDetailsById[artistId] ?? cachedArtist ?? null;
            }
            result = decodeArtistDetailResult(rawResult, providerId, artistId);
          }

          if (!result) {
            errorMessage = invalidArtistDetailMessage;
          } else if (!result.ok) {
            errorMessage = result.error.message;
          } else {
            nextArtist = result.data;
            shouldCommitArtist = true;
          }
        } catch (error) {
          errorMessage = getArtistDetailErrorMessage(error);
        } finally {
          if (latestArtistRequestRevisionByKey.get(requestKey) === revision) {
            const committedArtist = shouldCommitArtist ? nextArtist : null;
            latestArtistRequestRevisionByKey.delete(requestKey);
            set((state) => ({
              ...(committedArtist ? {
                artistDetailsById: {
                  ...state.artistDetailsById,
                  [artistId]: committedArtist
                }
              } : {}),
              artistLoadingById: {
                ...state.artistLoadingById,
                [artistId]: false
              },
              artistErrorById: {
                ...state.artistErrorById,
                [artistId]: errorMessage
              }
            }));
          }
        }

        return shouldCommitArtist && nextArtist
          ? nextArtist
          : get().artistDetailsById[artistId] ?? cachedArtist ?? null;
      })();
      artistRequests.set(pendingKey, { revision, request });
      try {
        return await request;
      } finally {
        if (artistRequests.get(pendingKey)?.request === request) {
          artistRequests.delete(pendingKey);
        }
      }
  };

  const invalidateArtistDetail: ArtistCatalogState['invalidateArtistDetail'] = (
    providerId,
    artistId
  ) => {
      const requestKey = createArtistRequestKey(providerId, artistId);
      const revision = ++artistRequestSequence;
      latestArtistRequestRevisionByKey.set(requestKey, revision);
      artistRequests.delete(createPendingArtistRequestKey(requestKey, false));
      artistRequests.delete(createPendingArtistRequestKey(requestKey, true));

      set((state) => {
        const {
          [artistId]: _invalidArtist,
          ...artistDetailsById
        } = state.artistDetailsById;

        return {
          artistDetailsById,
          artistLoadingById: {
            ...state.artistLoadingById,
            [artistId]: false
          },
          artistErrorById: {
            ...state.artistErrorById,
            [artistId]: null
          }
        };
      });
  };

  const loadAlbumDetail: ArtistCatalogState['loadAlbumDetail'] = async (
    providerId,
    albumId,
    options
  ) => {
      const requestKey = createAlbumRequestKey(providerId, albumId);
      const forceRefresh = options?.forceRefresh === true;
      const currentState = get();
      const cachedAlbum = currentState.albumDetailsById[albumId];
      if (!forceRefresh && cachedAlbum) {
        return cachedAlbum;
      }

      const pendingKey = createPendingAlbumRequestKey(requestKey, forceRefresh);
      const refreshPendingKey = createPendingAlbumRequestKey(requestKey, true);
      const activeRequest = forceRefresh
        ? albumRequests.get(pendingKey)
        : albumRequests.get(refreshPendingKey) ?? albumRequests.get(pendingKey);
      if (
        activeRequest
        && latestAlbumRequestRevisionByKey.get(requestKey) === activeRequest.revision
      ) {
        return activeRequest.request;
      }

      const revision = ++albumRequestSequence;
      latestAlbumRequestRevisionByKey.set(requestKey, revision);

      set((state) => ({
        albumLoadingById: {
          ...state.albumLoadingById,
          [albumId]: true
        },
        albumErrorById: {
          ...state.albumErrorById,
          [albumId]: null
        }
      }));

      let request: Promise<AlbumDetail | null>;
      request = (async () => {
        let nextAlbum: AlbumDetail | null = null;
        let shouldCommitAlbum = false;
        let errorMessage: string | null = null;

        try {
          const rawResult: unknown = options
            ? await window.musicPlayer.music.getAlbumDetail(providerId, albumId, options)
            : await window.musicPlayer.music.getAlbumDetail(providerId, albumId);
          if (latestAlbumRequestRevisionByKey.get(requestKey) !== revision) {
            return get().albumDetailsById[albumId] ?? cachedAlbum ?? null;
          }

          const result = decodeAlbumDetailResult(rawResult, providerId, albumId);

          if (!result) {
            errorMessage = invalidAlbumDetailMessage;
          } else if (!result.ok) {
            errorMessage = result.error.message;
          } else {
            nextAlbum = result.data;
            shouldCommitAlbum = true;
          }
        } catch (error) {
          errorMessage = getAlbumDetailErrorMessage(error);
        } finally {
          if (latestAlbumRequestRevisionByKey.get(requestKey) === revision) {
            const committedAlbum = shouldCommitAlbum ? nextAlbum : null;
            latestAlbumRequestRevisionByKey.delete(requestKey);
            set((state) => ({
              ...(committedAlbum ? {
                albumDetailsById: {
                  ...state.albumDetailsById,
                  [albumId]: committedAlbum
                }
              } : {}),
              albumLoadingById: {
                ...state.albumLoadingById,
                [albumId]: false
              },
              albumErrorById: {
                ...state.albumErrorById,
                [albumId]: errorMessage
              }
            }));
          }
        }

        return shouldCommitAlbum && nextAlbum
          ? nextAlbum
          : get().albumDetailsById[albumId] ?? cachedAlbum ?? null;
      })();
      albumRequests.set(pendingKey, { revision, request });
      try {
        return await request;
      } finally {
        if (albumRequests.get(pendingKey)?.request === request) {
          albumRequests.delete(pendingKey);
        }
      }
  };

  const resetForTest: ArtistCatalogState['resetForTest'] = () => {
    artistRequests.clear();
    latestArtistRequestRevisionByKey.clear();
    albumRequests.clear();
    latestAlbumRequestRevisionByKey.clear();
    set({
      ...createArtistCatalogState(),
      loadArtistDetail,
      invalidateArtistDetail,
      loadAlbumDetail,
      resetForTest
    });
  };

  return {
    ...createArtistCatalogState(),
    loadArtistDetail,
    invalidateArtistDetail,
    loadAlbumDetail,
    resetForTest
  };
});

function createArtistRequestKey(providerId: RemoteProviderId, artistId: string): string {
  return `${providerId}\u0000${artistId}`;
}

function createAlbumRequestKey(providerId: RemoteProviderId, albumId: string): string {
  return `${providerId}\u0000${albumId}`;
}

function createPendingArtistRequestKey(requestKey: string, forceRefresh: boolean): string {
  return `${forceRefresh ? 'refresh' : 'default'}\u0000${requestKey}`;
}

function createPendingAlbumRequestKey(requestKey: string, forceRefresh: boolean): string {
  return `${forceRefresh ? 'refresh' : 'default'}\u0000${requestKey}`;
}

function requestArtistDetail(
  providerId: RemoteProviderId,
  artistId: string,
  options?: ProviderFetchOptions
): Promise<unknown> {
  return options
    ? window.musicPlayer.music.getArtistDetail(providerId, artistId, options)
    : window.musicPlayer.music.getArtistDetail(providerId, artistId);
}

function getArtistDetailErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : artistDetailLoadFailedMessage;
}

function getAlbumDetailErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : albumDetailLoadFailedMessage;
}

function createArtistCatalogState() {
  return {
    artistDetailsById: {} as Record<string, ArtistDetail>,
    artistLoadingById: {} as Record<string, boolean>,
    artistErrorById: {} as Record<string, string | null>,
    albumDetailsById: {} as Record<string, AlbumDetail>,
    albumLoadingById: {} as Record<string, boolean>,
    albumErrorById: {} as Record<string, string | null>
  };
}
