import { create } from 'zustand';
import type { ProviderId, RemoteProviderId, Song } from '../../shared/musicTypes';
import type { SearchEntityResults, SearchEntityType } from '../../shared/providerTypes';

export type SearchResultView = 'overview' | SearchEntityType;

interface SearchState {
  keyword: string;
  providerId: ProviderId | null;
  results: Song[];
  entityResults: SearchEntityResults | null;
  activeResultView: SearchResultView;
  isLoading: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  search: (providerId: ProviderId, keyword: string) => Promise<Song[]>;
  setActiveResultView: (view: SearchResultView) => void;
  loadMore: (entityType: SearchEntityType) => Promise<void>;
  clearSearch: () => void;
  resetForTest: () => void;
}

const SEARCH_RESULT_LIMIT = 30;

const initialState = {
  keyword: '',
  providerId: null,
  results: [] as Song[],
  entityResults: null as SearchEntityResults | null,
  activeResultView: 'overview' as SearchResultView,
  isLoading: false,
  isLoadingMore: false,
  errorMessage: null
};

let requestRevision = 0;

const sectionKeyByEntityType = {
  song: 'songs',
  artist: 'artists',
  album: 'albums',
  playlist: 'playlists'
} as const;

export const useSearchStore = create<SearchState>((set, get) => ({
  ...initialState,

  search: async (providerId, keyword) => {
    const normalizedKeyword = keyword.trim();
    const requestId = ++requestRevision;
    if (!normalizedKeyword) {
      set({ ...initialState });
      return [];
    }

    set({
      keyword: normalizedKeyword,
      providerId,
      results: [],
      entityResults: null,
      activeResultView: 'overview',
      isLoading: true,
      isLoadingMore: false,
      errorMessage: null
    });

    if (providerId === 'local') {
      return loadSongOnlySearch(providerId, normalizedKeyword, requestId, set);
    }

    try {
      const result = await window.musicPlayer.music.searchEntities(providerId, normalizedKeyword, {
        limit: SEARCH_RESULT_LIMIT,
        offset: 0
      });
      if (requestId !== requestRevision) {
        return get().results;
      }

      if (!result.ok) {
        set({
          keyword: normalizedKeyword,
          providerId,
          results: [],
          entityResults: null,
          isLoading: false,
          errorMessage: result.error.message
        });
        return [];
      }

      set({
        keyword: normalizedKeyword,
        providerId,
        results: result.data.sections.songs.items,
        entityResults: result.data,
        isLoading: false,
        isLoadingMore: false,
        errorMessage: null
      });
      return result.data.sections.songs.items;
    } catch (error) {
      if (requestId === requestRevision) {
        set({
          keyword: normalizedKeyword,
          providerId,
          results: [],
          entityResults: null,
          isLoading: false,
          isLoadingMore: false,
          errorMessage: getSearchRequestErrorMessage(error)
        });
      }
      return [];
    }
  },

  setActiveResultView: (activeResultView) => set({ activeResultView }),

  loadMore: async (entityType) => {
    const state = get();
    if (
      state.providerId !== 'qq'
      && state.providerId !== 'netease'
      || !state.entityResults
      || state.isLoadingMore
      || state.isLoading
    ) {
      return;
    }

    const sectionKey = sectionKeyByEntityType[entityType];
    const currentSection = state.entityResults.sections[sectionKey];
    if (!currentSection.available || !currentSection.hasMore) {
      return;
    }

    const requestId = requestRevision;
    set({ isLoadingMore: true });
    try {
      const result = await window.musicPlayer.music.searchEntities(state.providerId, state.keyword, {
        entityTypes: [entityType],
        limit: SEARCH_RESULT_LIMIT,
        offset: currentSection.items.length
      });

      if (requestId !== requestRevision || get().providerId !== state.providerId || get().keyword !== state.keyword) {
        return;
      }

      if (!result.ok) {
        setSearchLoadMoreError(set, sectionKey, result.error.message);
        return;
      }

      const nextSection = result.data.sections[sectionKey];
      set((current) => {
        if (!current.entityResults) {
          return { isLoadingMore: false };
        }

        const sections = {
          ...current.entityResults.sections,
          [sectionKey]: {
            ...nextSection,
            items: [...current.entityResults.sections[sectionKey].items, ...nextSection.items]
          }
        } as SearchEntityResults['sections'];
        const entityResults = {
          ...current.entityResults,
          sections
        };

        return {
          entityResults,
          results: entityResults.sections.songs.items,
          isLoadingMore: false
        };
      });
    } catch (error) {
      if (requestId === requestRevision && get().providerId === state.providerId && get().keyword === state.keyword) {
        setSearchLoadMoreError(set, sectionKey, getSearchRequestErrorMessage(error));
      }
    }
  },

  clearSearch: () => {
    requestRevision += 1;
    set(initialState);
  },
  resetForTest: () => {
    requestRevision += 1;
    set(initialState);
  }
}));

async function loadSongOnlySearch(
  providerId: ProviderId,
  keyword: string,
  requestId: number,
  set: (partial: Partial<SearchState>) => void
): Promise<Song[]> {
  try {
    const result = await window.musicPlayer.music.search(providerId, keyword, {
      limit: SEARCH_RESULT_LIMIT,
      offset: 0
    });
    if (requestId !== requestRevision) {
      return [];
    }

    if (!result.ok) {
      set({
        keyword,
        providerId,
        results: [],
        entityResults: null,
        isLoading: false,
        errorMessage: result.error.message
      });
      return [];
    }

    set({
      keyword,
      providerId,
      results: result.data,
      entityResults: null,
      isLoading: false,
      errorMessage: null
    });
    return result.data;
  } catch (error) {
    if (requestId === requestRevision) {
      set({
        keyword,
        providerId,
        results: [],
        entityResults: null,
        isLoading: false,
        errorMessage: getSearchRequestErrorMessage(error)
      });
    }
    return [];
  }
}

function setSearchLoadMoreError(
  set: (partial: Partial<SearchState> | ((state: SearchState) => Partial<SearchState>)) => void,
  sectionKey: keyof SearchEntityResults['sections'],
  errorMessage: string
): void {
  set((current) => {
    if (!current.entityResults) {
      return { isLoadingMore: false };
    }

    return {
      entityResults: {
        ...current.entityResults,
        sections: {
          ...current.entityResults.sections,
          [sectionKey]: {
            ...current.entityResults.sections[sectionKey],
            errorMessage
          }
        } as SearchEntityResults['sections']
      },
      isLoadingMore: false
    };
  });
}

function getSearchRequestErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '搜索服务暂时不可用，请稍后重试';
}

export function isRemoteSearchProvider(providerId: ProviderId | null): providerId is RemoteProviderId {
  return providerId === 'qq' || providerId === 'netease';
}
