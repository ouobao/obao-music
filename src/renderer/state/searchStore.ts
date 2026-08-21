import { create } from 'zustand';
import type { ProviderId, Song } from '../../shared/musicTypes';
import type { SearchEntityResults } from '../../shared/providerTypes';
import { REMOTE_PROVIDER_IDS } from './providerSessionStore';

export type SearchResultView = 'overview' | 'song' | 'artist' | 'album' | 'playlist';

export interface SearchState {
  keyword: string;
  providerId: ProviderId;
  songs: Song[];
  entityResults: SearchEntityResults | null;
  activeResultView: SearchResultView;
  isLoading: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  entityErrorMessage: string | null;
  currentPage: number;
  hasMoreSongs: boolean;

  search(providerId: ProviderId, keyword: string): Promise<void>;
  setActiveResultView(view: SearchResultView): void;
  loadMore(): Promise<void>;
  clearSearch(): void;
}

const PAGE_SIZE = 30;
let searchRevision = 0;
let loadMoreRevision = 0;

export const useSearchStore = create<SearchState>((set, get) => ({
  keyword: '',
  providerId: 'netease',
  songs: [],
  entityResults: null,
  activeResultView: 'overview',
  isLoading: false,
  isLoadingMore: false,
  errorMessage: null,
  entityErrorMessage: null,
  currentPage: 0,
  hasMoreSongs: false,

  async search(providerId, keyword) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      get().clearSearch();
      return;
    }

    const revision = ++searchRevision;
    loadMoreRevision++;
    set({
      keyword: trimmed,
      providerId,
      songs: [],
      entityResults: null,
      activeResultView: 'overview',
      isLoading: true,
      isLoadingMore: false,
      errorMessage: null,
      entityErrorMessage: null,
      currentPage: 0,
      hasMoreSongs: false
    });

    const songsPromise = window.musicPlayer.music.search(providerId, trimmed, { limit: PAGE_SIZE, offset: 0 });
    const entitiesPromise = isRemoteProviderId(providerId)
      ? window.musicPlayer.music.searchEntities(providerId, trimmed, { limit: PAGE_SIZE, offset: 0 })
      : Promise.resolve(null);
    const [songsSettled, entitiesSettled] = await Promise.allSettled([songsPromise, entitiesPromise]);

    const state = get();
    if (revision !== searchRevision || state.keyword !== trimmed || state.providerId !== providerId) return;

    const songsResult = songsSettled.status === 'fulfilled' ? songsSettled.value : null;
    const entitiesResult = entitiesSettled.status === 'fulfilled' ? entitiesSettled.value : null;
    const primarySongs = songsResult?.ok ? songsResult.data : [];
    const entitySongs = entitiesResult?.ok && entitiesResult.data.sections.songs.available
      ? entitiesResult.data.sections.songs.items
      : [];
    const songs = mergeSongs(primarySongs, entitySongs);

    const songsError = songsSettled.status === 'rejected'
      ? errorMessageFrom(songsSettled.reason)
      : songsResult && !songsResult.ok
        ? songsResult.error.message
        : null;
    const entitiesError = entitiesSettled.status === 'rejected'
      ? errorMessageFrom(entitiesSettled.reason)
      : entitiesResult && !entitiesResult.ok
        ? entitiesResult.error.message
        : null;
    const anyRequestSucceeded = Boolean(songsResult?.ok || entitiesResult?.ok);

    set({
      songs,
      entityResults: entitiesResult?.ok ? entitiesResult.data : null,
      isLoading: false,
      errorMessage: anyRequestSucceeded ? null : songsError ?? entitiesError ?? '搜索请求失败',
      entityErrorMessage: entitiesError,
      currentPage: 1,
      hasMoreSongs: Boolean(songsResult?.ok && songsResult.data.length === PAGE_SIZE)
    });
  },

  setActiveResultView(view) {
    set({ activeResultView: view });
  },

  async loadMore() {
    const state = get();
    const { providerId, keyword, currentPage, isLoadingMore, entityResults, hasMoreSongs } = state;
    if (isLoadingMore || !keyword || currentPage < 1) return;

    const canLoadEntities = isRemoteProviderId(providerId) && Boolean(
      entityResults && Object.values(entityResults.sections).some((section) => section.available && section.hasMore)
    );
    if (!hasMoreSongs && !canLoadEntities) return;

    const revision = searchRevision;
    const requestRevision = ++loadMoreRevision;
    const offset = currentPage * PAGE_SIZE;
    set({ isLoadingMore: true });

    const songsPromise = hasMoreSongs
      ? window.musicPlayer.music.search(providerId, keyword, { limit: PAGE_SIZE, offset })
      : Promise.resolve(null);
    const entitiesPromise = canLoadEntities && isRemoteProviderId(providerId)
      ? window.musicPlayer.music.searchEntities(providerId, keyword, { limit: PAGE_SIZE, offset })
      : Promise.resolve(null);
    const [songsSettled, entitiesSettled] = await Promise.allSettled([songsPromise, entitiesPromise]);

    const latest = get();
    if (
      revision !== searchRevision ||
      requestRevision !== loadMoreRevision ||
      latest.keyword !== keyword ||
      latest.providerId !== providerId
    ) {
      if (requestRevision === loadMoreRevision) set({ isLoadingMore: false });
      return;
    }

    const songsResult = songsSettled.status === 'fulfilled' ? songsSettled.value : null;
    const entitiesResult = entitiesSettled.status === 'fulfilled' ? entitiesSettled.value : null;
    let songs = latest.songs;
    if (songsResult?.ok) songs = mergeSongs(songs, songsResult.data);
    if (entitiesResult?.ok && entitiesResult.data.sections.songs.available) {
      songs = mergeSongs(songs, entitiesResult.data.sections.songs.items);
    }

    const entityErrorMessage = entitiesSettled.status === 'rejected'
      ? errorMessageFrom(entitiesSettled.reason)
      : entitiesResult && !entitiesResult.ok
        ? entitiesResult.error.message
        : entitiesResult?.ok
          ? null
          : latest.entityErrorMessage;
    const songsAttemptSucceeded = !hasMoreSongs || Boolean(songsResult?.ok);
    const entitiesAttemptSucceeded = !canLoadEntities || Boolean(entitiesResult?.ok);

    set({
      songs,
      entityResults: entitiesResult?.ok
        ? mergeEntityResults(latest.entityResults, entitiesResult.data)
        : latest.entityResults,
      isLoadingMore: false,
      entityErrorMessage,
      hasMoreSongs: songsResult?.ok ? songsResult.data.length === PAGE_SIZE : latest.hasMoreSongs,
      currentPage: songsAttemptSucceeded && entitiesAttemptSucceeded ? currentPage + 1 : currentPage
    });
  },

  clearSearch() {
    searchRevision++;
    loadMoreRevision++;
    set({
      keyword: '',
      songs: [],
      entityResults: null,
      activeResultView: 'overview',
      isLoading: false,
      isLoadingMore: false,
      errorMessage: null,
      entityErrorMessage: null,
      currentPage: 0,
      hasMoreSongs: false
    });
  }
}));

function mergeSongs(current: Song[], next: Song[]): Song[] {
  const songs = [...current];
  const seen = new Set(current.map((song) => `${song.providerId}:${song.id}`));
  for (const song of next) {
    const key = `${song.providerId}:${song.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      songs.push(song);
    }
  }
  return songs;
}

function mergeEntityResults(current: SearchEntityResults | null, next: SearchEntityResults): SearchEntityResults {
  if (!current || current.providerId !== next.providerId || current.keyword !== next.keyword) return next;
  return {
    providerId: next.providerId,
    keyword: next.keyword,
    sections: {
      songs: mergeSection(current.sections.songs, next.sections.songs),
      artists: mergeSection(current.sections.artists, next.sections.artists),
      albums: mergeSection(current.sections.albums, next.sections.albums),
      playlists: mergeSection(current.sections.playlists, next.sections.playlists)
    }
  };
}

function mergeSection<T>(
  current: { items: T[]; hasMore: boolean; available: boolean; total: number; errorMessage: string | null },
  next: { items: T[]; hasMore: boolean; available: boolean; total: number; errorMessage: string | null }
): { items: T[]; hasMore: boolean; available: boolean; total: number; errorMessage: string | null } {
  const items = [...current.items];
  const seen = new Set(current.items.map(entityIdentity));
  for (const item of next.items) {
    const key = entityIdentity(item);
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return {
    items,
    hasMore: next.hasMore,
    available: next.available,
    total: next.total || current.total || items.length,
    errorMessage: next.errorMessage
  };
}

function entityIdentity(item: unknown): string {
  if (item && typeof item === 'object' && 'id' in item) {
    const value = item as { id: unknown; providerId?: unknown };
    return `${String(value.providerId ?? '')}:${String(value.id)}`;
  }
  return JSON.stringify(item);
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRemoteProviderId(providerId: ProviderId): providerId is 'netease' | 'qq' {
  return REMOTE_PROVIDER_IDS.includes(providerId as 'netease' | 'qq');
}
