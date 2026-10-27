import { create } from 'zustand';

export type ViewName =
  | 'home'
  | 'search'
  | 'charts'
  | 'playlistDiscovery'
  | 'playlist'
  | 'chart'
  | 'artist'
  | 'album'
  | 'recommendationCollection'
  | 'listeningHistory'
  | 'musicDna';

export interface ViewParams {
  providerId?: string;
  playlistId?: string;
  chartId?: string;
  artistId?: string;
  albumId?: string;
  collectionId?: string;
  categoryId?: string;
  keyword?: string;
  title?: string;
}

export interface ViewState {
  name: ViewName;
  params: ViewParams;
}

const UI_STATE_KEY = 'musicplayer.ui-state';

interface PersistedUiState {
  contentTransitionStyle: 'soft' | 'directional' | 'layered';
  reduceEffects: boolean;
}

function loadUiState(): PersistedUiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return { contentTransitionStyle: 'soft', reduceEffects: false };
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    return {
      contentTransitionStyle: parsed.contentTransitionStyle ?? 'soft',
      reduceEffects: Boolean(parsed.reduceEffects)
    };
  } catch {
    return { contentTransitionStyle: 'soft', reduceEffects: false };
  }
}

function persistUiState(state: PersistedUiState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface UiState {
  currentView: ViewState;
  backStack: ViewState[];
  forwardStack: ViewState[];
  canGoBack: boolean;
  canGoForward: boolean;
  isQueueOpen: boolean;
  isSimilarOpen: boolean;
  contentTransitionStyle: 'soft' | 'directional' | 'layered';
  reduceEffects: boolean;
  navigationDirection: 'forward' | 'backward';

  navigateToView(name: ViewName, params?: ViewParams): void;
  goBack(): void;
  goForward(): void;
  setQueueOpen(open: boolean): void;
  toggleQueue(): void;
  setSimilarOpen(open: boolean): void;
  toggleSimilar(): void;
  setContentTransitionStyle(style: 'soft' | 'directional' | 'layered'): void;
  setReduceEffects(reduce: boolean): void;
}

export const useUiStore = create<UiState>((set, get) => {
  const persisted = loadUiState();

  return {
    currentView: { name: 'home', params: {} },
    backStack: [],
    forwardStack: [],
    canGoBack: false,
    canGoForward: false,
    isQueueOpen: false,
    isSimilarOpen: false,
    contentTransitionStyle: persisted.contentTransitionStyle,
    reduceEffects: persisted.reduceEffects,
    navigationDirection: 'forward',

    navigateToView(name, params = {}) {
      const { currentView, backStack } = get();
      if (currentView.name === name && JSON.stringify(currentView.params) === JSON.stringify(params)) return;
      set({
        currentView: { name, params },
        backStack: [...backStack, currentView].slice(-50),
        forwardStack: [],
        canGoBack: true,
        canGoForward: false,
        navigationDirection: 'forward'
      });
    },

    goBack() {
      const { backStack, currentView } = get();
      if (backStack.length === 0) return;
      const previous = backStack[backStack.length - 1];
      set({
        currentView: previous,
        backStack: backStack.slice(0, -1),
        forwardStack: [currentView, ...get().forwardStack].slice(0, 50),
        canGoBack: backStack.length - 1 > 0,
        canGoForward: true,
        navigationDirection: 'backward'
      });
    },

    goForward() {
      const { forwardStack, currentView } = get();
      if (forwardStack.length === 0) return;
      const next = forwardStack[0];
      set({
        currentView: next,
        forwardStack: forwardStack.slice(1),
        backStack: [...get().backStack, currentView].slice(-50),
        canGoBack: true,
        canGoForward: forwardStack.length - 1 > 0,
        navigationDirection: 'forward'
      });
    },

    setQueueOpen(open) {
      set({ isQueueOpen: open });
    },

    toggleQueue() {
      set({ isQueueOpen: !get().isQueueOpen, isSimilarOpen: false });
    },

    setSimilarOpen(open) {
      set({ isSimilarOpen: open });
    },

    toggleSimilar() {
      set({ isSimilarOpen: !get().isSimilarOpen, isQueueOpen: false });
    },

    setContentTransitionStyle(style) {
      set({ contentTransitionStyle: style });
      persistUiState({
        contentTransitionStyle: style,
        reduceEffects: get().reduceEffects
      });
    },

    setReduceEffects(reduce) {
      set({ reduceEffects: reduce });
      persistUiState({
        contentTransitionStyle: get().contentTransitionStyle,
        reduceEffects: reduce
      });
    }
  };
});
