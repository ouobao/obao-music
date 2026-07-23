import { create } from 'zustand';
import type { Playlist, ProviderId, Song } from '../../shared/musicTypes';
import type { ProviderFetchOptions, ProviderIpcResult, SongMutationResult } from '../../shared/providerTypes';

interface LibraryState {
  providerPlaylists: Partial<Record<ProviderId, Playlist[]>>;
  playlistTracks: Record<string, Song[]>;
  playlistTracksLoadingByKey: Record<string, boolean>;
  playlistTracksErrorByKey: Record<string, string | null>;
  selectedProviderId: ProviderId | null;
  selectedPlaylistId: string | null;
  selectedPlaylistTracks: Song[];
  likedSongIdsByProvider: Partial<Record<ProviderId, Set<string>>>;
  likedSongIdsLoaded: Partial<Record<ProviderId, boolean>>;
  isLoading: boolean;
  errorMessage: string | null;
  loadProviderPlaylists: (providerId: ProviderId, options?: ProviderFetchOptions) => Promise<Playlist[]>;
  loadLoggedInProviderPlaylists: (providerIds: ProviderId[], options?: ProviderFetchOptions) => Promise<Partial<Record<ProviderId, Playlist[]>>>;
  ensurePlaylistTracks: (providerId: ProviderId, playlistId: string, options?: ProviderFetchOptions) => Promise<Song[]>;
  loadPlaylistTracks: (providerId: ProviderId, playlistId: string, options?: ProviderFetchOptions) => Promise<Song[]>;
  refreshProviderLibrary: (providerId: ProviderId, playlistId?: string | null) => Promise<Playlist[]>;
  clearProviderLibrary: (providerId: ProviderId) => void;
  selectProviderPlaylist: (providerId: ProviderId, playlistId: string, options?: ProviderFetchOptions) => Promise<Song[]>;
  ensureLikedSongIds: (providerId: ProviderId) => Promise<Set<string>>;
  getWritablePlaylists: (providerId: ProviderId) => Playlist[];
  setSongLiked: (song: Song, liked: boolean) => Promise<ProviderIpcResult<SongMutationResult>>;
  addSongToPlaylist: (song: Song, playlist: Playlist) => Promise<ProviderIpcResult<SongMutationResult>>;
  removeSongFromPlaylist: (song: Song, playlist: Playlist) => Promise<ProviderIpcResult<SongMutationResult>>;
  resetForTest: () => void;
}

const initialState = {
  providerPlaylists: {},
  playlistTracks: {},
  playlistTracksLoadingByKey: {},
  playlistTracksErrorByKey: {},
  selectedProviderId: null,
  selectedPlaylistId: null,
  selectedPlaylistTracks: [],
  likedSongIdsByProvider: {},
  likedSongIdsLoaded: {},
  isLoading: false,
  errorMessage: null
};

interface PendingPlaylistTracksRequest {
  revision: number;
  request: Promise<ProviderIpcResult<Song[]>>;
}

let playlistTracksRequestSequence = 0;
const latestPlaylistTracksRequestRevisionByKey = new Map<string, number>();
const pendingPlaylistTracksRequests = new Map<string, PendingPlaylistTracksRequest>();
const playlistTrackLastAccessByKey = new Map<string, number>();
const likedSongIdsRequests = new Map<ProviderId, Promise<Set<string>>>();
const MAX_CACHED_PLAYLIST_TRACKS = 12;
const MUTATION_VERIFICATION_DELAYS_MS = [0, 250, 750] as const;
let playlistTrackAccessSequence = 0;

export function getPlaylistTracksKey(providerId: ProviderId, playlistId: string): string {
  return `${providerId}:${playlistId}`;
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  const requestPlaylistTracks = async (
    providerId: ProviderId,
    playlistId: string,
    options?: ProviderFetchOptions
  ): Promise<ProviderIpcResult<Song[]>> => {
    const requestKey = getPlaylistTracksKey(providerId, playlistId);
    const forceRefresh = options?.forceRefresh === true;
    const currentState = get();
    if (!forceRefresh && Object.prototype.hasOwnProperty.call(currentState.playlistTracks, requestKey)) {
      const cachedTracks = currentState.playlistTracks[requestKey];
      touchPlaylistTrackCache(requestKey);
      return { ok: true, data: cachedTracks };
    }

    const refreshPendingKey = getPendingPlaylistTracksRequestKey(requestKey, true);
    const pendingKey = getPendingPlaylistTracksRequestKey(requestKey, forceRefresh);
    const pendingRequestEntry = forceRefresh
      ? undefined
      : pendingPlaylistTracksRequests.get(refreshPendingKey) ?? pendingPlaylistTracksRequests.get(pendingKey);
    if (
      pendingRequestEntry
      && latestPlaylistTracksRequestRevisionByKey.get(requestKey) === pendingRequestEntry.revision
    ) {
      return pendingRequestEntry.request;
    }

    const revision = ++playlistTracksRequestSequence;
    latestPlaylistTracksRequestRevisionByKey.set(requestKey, revision);
    set((state) => ({
      playlistTracksLoadingByKey: {
        ...state.playlistTracksLoadingByKey,
        [requestKey]: true
      },
      playlistTracksErrorByKey: {
        ...state.playlistTracksErrorByKey,
        [requestKey]: null
      }
    }));

    const request = (async (): Promise<ProviderIpcResult<Song[]>> => {
      let result: ProviderIpcResult<Song[]>;
      try {
        result = options
          ? await window.musicPlayer.music.getPlaylistTracks(providerId, playlistId, options)
          : await window.musicPlayer.music.getPlaylistTracks(providerId, playlistId);
      } catch (error) {
        result = {
          ok: false,
          error: {
            code: 'provider_failed',
            providerId,
            message: error instanceof Error ? error.message : '歌单曲目加载失败'
          }
        };
      }

      if (latestPlaylistTracksRequestRevisionByKey.get(requestKey) !== revision) {
        return result;
      }

      latestPlaylistTracksRequestRevisionByKey.delete(requestKey);
      if (!result.ok) {
        const errorMessage = result.error.message;
        set((state) => {
          const isCurrentSelection = state.selectedProviderId === providerId && state.selectedPlaylistId === playlistId;
          return {
            playlistTracksLoadingByKey: {
              ...state.playlistTracksLoadingByKey,
              [requestKey]: false
            },
            playlistTracksErrorByKey: {
              ...state.playlistTracksErrorByKey,
              [requestKey]: errorMessage
            },
            ...(isCurrentSelection ? {
              selectedPlaylistTracks: [],
              isLoading: false,
              errorMessage
            } : {})
          };
        });
        return result;
      }

      const tracks = result.data;
      touchPlaylistTrackCache(requestKey);
      set((state) => {
        const isCurrentSelection = state.selectedProviderId === providerId && state.selectedPlaylistId === playlistId;
        const protectedRequestKey = state.selectedProviderId && state.selectedPlaylistId
          ? getPlaylistTracksKey(state.selectedProviderId, state.selectedPlaylistId)
          : null;
        return {
          providerPlaylists: hydratePlaylistCoverFromTracks(state.providerPlaylists, providerId, playlistId, tracks),
          playlistTracks: retainRecentPlaylistTracks({
            ...state.playlistTracks,
            [requestKey]: tracks
          }, protectedRequestKey),
          playlistTracksLoadingByKey: {
            ...state.playlistTracksLoadingByKey,
            [requestKey]: false
          },
          playlistTracksErrorByKey: {
            ...state.playlistTracksErrorByKey,
            [requestKey]: null
          },
          ...(isCurrentSelection ? {
            selectedPlaylistTracks: tracks,
            isLoading: false,
            errorMessage: null
          } : {})
        };
      });
      return result;
    })();

    pendingPlaylistTracksRequests.set(pendingKey, { revision, request });
    try {
      return await request;
    } finally {
      if (pendingPlaylistTracksRequests.get(pendingKey)?.request === request) {
        pendingPlaylistTracksRequests.delete(pendingKey);
      }
    }
  };

  const ensurePlaylistTracks = async (
    providerId: ProviderId,
    playlistId: string,
    options?: ProviderFetchOptions
  ): Promise<Song[]> => {
    const result = await requestPlaylistTracks(providerId, playlistId, options);
    return result.ok ? result.data : [];
  };

  const verifyPlaylistSongMembership = async (
    providerId: ProviderId,
    playlistId: string,
    songId: string,
    expectedMembership: boolean
  ): Promise<ProviderIpcResult<Song[]>> => {
    let lastErrorMessage: string | null = null;

    for (const delayMs of MUTATION_VERIFICATION_DELAYS_MS) {
      if (delayMs > 0) {
        await wait(delayMs);
      }

      const refreshResult = await requestPlaylistTracks(providerId, playlistId, { forceRefresh: true });
      if (!refreshResult.ok) {
        lastErrorMessage = refreshResult.error.message;
        continue;
      }

      const hasSong = refreshResult.data.some((track) => track.id === songId);
      if (hasSong === expectedMembership) {
        return refreshResult;
      }

      lastErrorMessage = expectedMembership
        ? '远程歌单中尚未找到该歌曲'
        : '远程歌单中仍然存在该歌曲';
    }

    return createProviderError<Song[]>(
      providerId,
      `在线歌单同步确认失败：${lastErrorMessage ?? '无法读取最新歌单'}`
    );
  };

  const refreshMutatedPlaylistSummary = async (
    providerId: ProviderId,
    playlistId: string,
    verifiedTracks: Song[]
  ): Promise<void> => {
    let result: ProviderIpcResult<Playlist[]>;
    try {
      result = await window.musicPlayer.music.getUserPlaylists(providerId, { forceRefresh: true });
    } catch {
      return;
    }

    if (!result.ok) {
      return;
    }

    const refreshedPlaylist = result.data.find((playlist) => playlist.id === playlistId);
    if (!refreshedPlaylist) {
      return;
    }

    const hydratedPlaylist = hydratePlaylistCover(refreshedPlaylist, verifiedTracks);
    set((state) => {
      const currentPlaylists = state.providerPlaylists[providerId];
      if (!currentPlaylists?.some((playlist) => playlist.id === playlistId)) {
        return state;
      }

      return {
        providerPlaylists: {
          ...state.providerPlaylists,
          [providerId]: currentPlaylists.map((playlist) => (
            playlist.id === playlistId ? hydratedPlaylist : playlist
          ))
        }
      };
    });
  };

  return {
    ...initialState,

  loadProviderPlaylists: async (providerId, options) => {
    set({ isLoading: true, errorMessage: null });
    const result = options
      ? await window.musicPlayer.music.getUserPlaylists(providerId, options)
      : await window.musicPlayer.music.getUserPlaylists(providerId);

    if (!result.ok) {
      set((state) => ({
        providerPlaylists: {
          ...state.providerPlaylists,
          [providerId]: []
        },
        isLoading: false,
        errorMessage: result.error.message
      }));
      return [];
    }

    set((state) => ({
      providerPlaylists: {
        ...state.providerPlaylists,
        [providerId]: result.data
      },
      isLoading: false,
      errorMessage: null
    }));
    return result.data;
  },

  loadLoggedInProviderPlaylists: async (providerIds, options) => {
    const entries = await Promise.all(
      providerIds.map(async (providerId) => [providerId, await get().loadProviderPlaylists(providerId, options)] as const)
    );

    return entries.reduce<Partial<Record<ProviderId, Playlist[]>>>((playlistsByProvider, [providerId, playlists]) => {
      playlistsByProvider[providerId] = playlists;
      return playlistsByProvider;
    }, {});
  },

  ensurePlaylistTracks,

  loadPlaylistTracks: ensurePlaylistTracks,

  refreshProviderLibrary: async (providerId, playlistId = null) => {
    const playlists = await get().loadProviderPlaylists(providerId, { forceRefresh: true });
    const state = get();
    if (playlistId && state.selectedProviderId === providerId && state.selectedPlaylistId === playlistId) {
      await get().selectProviderPlaylist(providerId, playlistId, { forceRefresh: true });
    }

    return playlists;
  },

  clearProviderLibrary: (providerId) => {
    invalidateProviderPlaylistTrackRequests(providerId);
    set((state) => {
      const { [providerId]: _removedPlaylists, ...providerPlaylists } = state.providerPlaylists;
      const requestKeyPrefix = `${providerId}:`;
      const playlistTracks = Object.fromEntries(
        Object.entries(state.playlistTracks).filter(([requestKey]) => !requestKey.startsWith(requestKeyPrefix))
      );
      for (const requestKey of playlistTrackLastAccessByKey.keys()) {
        if (requestKey.startsWith(requestKeyPrefix)) {
          playlistTrackLastAccessByKey.delete(requestKey);
        }
      }
      const { [providerId]: _removedLikedSongIds, ...likedSongIdsByProvider } = state.likedSongIdsByProvider;
      const { [providerId]: _removedLikedSongIdsLoaded, ...likedSongIdsLoaded } = state.likedSongIdsLoaded;
      const playlistTracksLoadingByKey = omitProviderPlaylistTrackState(state.playlistTracksLoadingByKey, providerId);
      const playlistTracksErrorByKey = omitProviderPlaylistTrackState(state.playlistTracksErrorByKey, providerId);
      const isSelectedProvider = state.selectedProviderId === providerId;

      return {
        providerPlaylists,
        playlistTracks,
        playlistTracksLoadingByKey,
        playlistTracksErrorByKey,
        likedSongIdsByProvider,
        likedSongIdsLoaded,
        selectedProviderId: isSelectedProvider ? null : state.selectedProviderId,
        selectedPlaylistId: isSelectedProvider ? null : state.selectedPlaylistId,
        selectedPlaylistTracks: isSelectedProvider ? [] : state.selectedPlaylistTracks
      };
    });
  },

  selectProviderPlaylist: async (providerId, playlistId, options) => {
    const state = get();
    const requestKey = getPlaylistTracksKey(providerId, playlistId);
    const hasCachedTracks = Object.prototype.hasOwnProperty.call(state.playlistTracks, requestKey);
    if (!options?.forceRefresh && hasCachedTracks) {
      const cachedTracks = state.playlistTracks[requestKey];
      const isRequestPending = state.playlistTracksLoadingByKey[requestKey] === true;
      touchPlaylistTrackCache(requestKey);
      set((current) => ({
        selectedProviderId: providerId,
        selectedPlaylistId: playlistId,
        selectedPlaylistTracks: cachedTracks,
        playlistTracksErrorByKey: {
          ...current.playlistTracksErrorByKey,
          ...(isRequestPending ? {} : { [requestKey]: null })
        },
        isLoading: isRequestPending,
        errorMessage: null
      }));
      return cachedTracks;
    }

    set({
      selectedProviderId: providerId,
      selectedPlaylistId: playlistId,
      selectedPlaylistTracks: [],
      isLoading: true,
      errorMessage: null
    });
    const result = await requestPlaylistTracks(providerId, playlistId, options);
    return result.ok ? result.data : [];
  },

  ensureLikedSongIds: async (providerId) => {
    const currentState = get();
    if (currentState.likedSongIdsLoaded[providerId]) {
      return currentState.likedSongIdsByProvider[providerId] ?? new Set<string>();
    }

    const existingRequest = likedSongIdsRequests.get(providerId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const playlists = currentState.providerPlaylists[providerId] ?? await get().loadProviderPlaylists(providerId);
      const likedPlaylist = findLikedPlaylist(playlists);
      if (!likedPlaylist) {
        const emptySongIds = new Set<string>();
        set((state) => ({
          likedSongIdsByProvider: {
            ...state.likedSongIdsByProvider,
            [providerId]: emptySongIds
          },
          likedSongIdsLoaded: {
            ...state.likedSongIdsLoaded,
            [providerId]: true
          }
        }));
        return emptySongIds;
      }

      const result = await requestPlaylistTracks(providerId, likedPlaylist.id);
      if (!result.ok) {
        return new Set<string>();
      }

      const likedSongIds = createSongIdSet(result.data);
      set((state) => ({
        likedSongIdsByProvider: {
          ...state.likedSongIdsByProvider,
          [providerId]: likedSongIds
        },
        likedSongIdsLoaded: {
          ...state.likedSongIdsLoaded,
          [providerId]: true
        }
      }));
      return likedSongIds;
    })();

    likedSongIdsRequests.set(providerId, request);
    try {
      return await request;
    } finally {
      if (likedSongIdsRequests.get(providerId) === request) {
        likedSongIdsRequests.delete(providerId);
      }
    }
  },

  getWritablePlaylists: (providerId) => {
    return (get().providerPlaylists[providerId] ?? []).filter((playlist) => playlist.providerId === providerId && playlist.ownership === 'created');
  },

  setSongLiked: async (song, liked) => {
    set({ errorMessage: null });
    const result = await window.musicPlayer.music.setSongLiked(song.providerId, song, liked);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return result;
    }

    let likedPlaylist = findLikedPlaylist(get().providerPlaylists[song.providerId] ?? []);
    if (!likedPlaylist) {
      const refreshedPlaylists = await get().loadProviderPlaylists(song.providerId, { forceRefresh: true });
      likedPlaylist = findLikedPlaylist(refreshedPlaylists);
    }
    if (!likedPlaylist) {
      const verificationError = createProviderError<SongMutationResult>(song.providerId, '无法找到在线“我喜欢”歌单，未能确认同步结果');
      set({ errorMessage: verificationError.error.message });
      return verificationError;
    }

    const verificationResult = await verifyPlaylistSongMembership(song.providerId, likedPlaylist.id, song.id, liked);
    if (!verificationResult.ok) {
      set({ errorMessage: verificationResult.error.message });
      return createProviderError<SongMutationResult>(song.providerId, verificationResult.error.message);
    }

    await refreshMutatedPlaylistSummary(song.providerId, likedPlaylist.id, verificationResult.data);

    set((state) => ({
      likedSongIdsByProvider: {
        ...state.likedSongIdsByProvider,
        [song.providerId]: createSongIdSet(verificationResult.data)
      },
      likedSongIdsLoaded: {
        ...state.likedSongIdsLoaded,
        [song.providerId]: true
      },
      errorMessage: null
    }));

    return result;
  },

  addSongToPlaylist: async (song, playlist) => {
    if (playlist.providerId !== song.providerId || playlist.ownership !== 'created') {
      return createProviderError<SongMutationResult>(song.providerId, '只能添加到同平台的自建歌单');
    }

    set({ errorMessage: null });
    const result = await window.musicPlayer.music.addSongToPlaylist(song.providerId, song, playlist.id);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return result;
    }

    const verificationResult = await verifyPlaylistSongMembership(song.providerId, playlist.id, song.id, true);
    if (!verificationResult.ok) {
      set({ errorMessage: verificationResult.error.message });
      return createProviderError<SongMutationResult>(song.providerId, verificationResult.error.message);
    }

    await refreshMutatedPlaylistSummary(song.providerId, playlist.id, verificationResult.data);

    set({ errorMessage: null });
    return result;
  },

  removeSongFromPlaylist: async (song, playlist) => {
    if (playlist.providerId !== song.providerId) {
      return createProviderError<SongMutationResult>(song.providerId, '歌曲与歌单来源不一致');
    }

    if (playlist.isLiked) {
      return get().setSongLiked(song, false);
    }

    if (playlist.ownership !== 'created') {
      return createProviderError<SongMutationResult>(song.providerId, '订阅歌单不支持移除歌曲');
    }

    set({ errorMessage: null });
    const result = await window.musicPlayer.music.removeSongFromPlaylist(song.providerId, song, playlist.id);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return result;
    }

    const verificationResult = await verifyPlaylistSongMembership(song.providerId, playlist.id, song.id, false);
    if (!verificationResult.ok) {
      set({ errorMessage: verificationResult.error.message });
      return createProviderError<SongMutationResult>(song.providerId, verificationResult.error.message);
    }

    await refreshMutatedPlaylistSummary(song.providerId, playlist.id, verificationResult.data);

    set({ errorMessage: null });
    return result;
  },

  resetForTest: () => {
    latestPlaylistTracksRequestRevisionByKey.clear();
    pendingPlaylistTracksRequests.clear();
    playlistTrackLastAccessByKey.clear();
    likedSongIdsRequests.clear();
    playlistTracksRequestSequence = 0;
    playlistTrackAccessSequence = 0;
    set(initialState);
  }
  };
});

function getPendingPlaylistTracksRequestKey(requestKey: string, forceRefresh: boolean): string {
  return `${forceRefresh ? 'refresh' : 'default'}:${requestKey}`;
}

function invalidateProviderPlaylistTrackRequests(providerId: ProviderId) {
  const requestKeyPrefix = `${providerId}:`;
  for (const requestKey of latestPlaylistTracksRequestRevisionByKey.keys()) {
    if (requestKey.startsWith(requestKeyPrefix)) {
      latestPlaylistTracksRequestRevisionByKey.delete(requestKey);
    }
  }

  for (const pendingKey of pendingPlaylistTracksRequests.keys()) {
    if (pendingKey.startsWith(`default:${requestKeyPrefix}`) || pendingKey.startsWith(`refresh:${requestKeyPrefix}`)) {
      pendingPlaylistTracksRequests.delete(pendingKey);
    }
  }
}

function omitProviderPlaylistTrackState<T>(state: Record<string, T>, providerId: ProviderId): Record<string, T> {
  const requestKeyPrefix = `${providerId}:`;
  return Object.fromEntries(
    Object.entries(state).filter(([requestKey]) => !requestKey.startsWith(requestKeyPrefix))
  );
}

function createSongIdSet(songs: Song[]): Set<string> {
  const songIds = new Set<string>();
  for (const song of songs) {
    songIds.add(song.id);
  }
  return songIds;
}

function findLikedPlaylist(playlists: Playlist[]): Playlist | undefined {
  return playlists.find((playlist) => playlist.isLiked);
}

function createProviderError<T>(
  providerId: ProviderId,
  message: string
): Extract<ProviderIpcResult<T>, { ok: false }> {
  return {
    ok: false,
    error: {
      code: 'provider_failed',
      providerId,
      message
    }
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function hydratePlaylistCoverFromTracks(
  providerPlaylists: Partial<Record<ProviderId, Playlist[]>>,
  providerId: ProviderId,
  playlistId: string,
  tracks: Song[]
): Partial<Record<ProviderId, Playlist[]>> {
  const playlists = providerPlaylists[providerId];
  if (!playlists) {
    return providerPlaylists;
  }

  let changed = false;
  const nextPlaylists = playlists.map((playlist) => {
    if (playlist.id !== playlistId) {
      return playlist;
    }

    const hydratedPlaylist = hydratePlaylistCover(playlist, tracks);
    changed = hydratedPlaylist !== playlist;
    return hydratedPlaylist;
  });

  return changed
    ? {
        ...providerPlaylists,
        [providerId]: nextPlaylists
      }
    : providerPlaylists;
}

function hydratePlaylistCover(playlist: Playlist, tracks: Song[]): Playlist {
  if (playlist.coverUrl?.trim()) {
    return playlist;
  }

  const coverUrl = tracks.find((song) => song.coverUrl?.trim())?.coverUrl?.trim();
  return coverUrl
    ? {
        ...playlist,
        coverUrl
      }
    : playlist;
}

function touchPlaylistTrackCache(requestKey: string) {
  playlistTrackAccessSequence += 1;
  playlistTrackLastAccessByKey.set(requestKey, playlistTrackAccessSequence);
}

function retainRecentPlaylistTracks(
  playlistTracks: Record<string, Song[]>,
  protectedRequestKey: string | null
): Record<string, Song[]> {
  const cacheKeys = Object.keys(playlistTracks);
  if (cacheKeys.length <= MAX_CACHED_PLAYLIST_TRACKS) {
    return playlistTracks;
  }

  const removableKeys = cacheKeys
    .filter((requestKey) => requestKey !== protectedRequestKey)
    .sort((left, right) => (
      (playlistTrackLastAccessByKey.get(left) ?? 0) - (playlistTrackLastAccessByKey.get(right) ?? 0)
    ));
  const expiredKeys = new Set(removableKeys.slice(0, Math.max(0, cacheKeys.length - MAX_CACHED_PLAYLIST_TRACKS)));
  if (expiredKeys.size === 0) {
    return playlistTracks;
  }

  expiredKeys.forEach((requestKey) => playlistTrackLastAccessByKey.delete(requestKey));
  return Object.fromEntries(
    Object.entries(playlistTracks).filter(([requestKey]) => !expiredKeys.has(requestKey))
  );
}
