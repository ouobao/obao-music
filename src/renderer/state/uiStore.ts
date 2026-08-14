import { create } from 'zustand';
import type { ProviderId, RemoteProviderId } from '../../shared/musicTypes';

export type AppView =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'playlist'; providerId: ProviderId; playlistId: string }
  | { type: 'recommendationCollection'; providerId: RemoteProviderId; collectionId: string }
  | { type: 'charts'; providerId: RemoteProviderId }
  | { type: 'chart'; providerId: RemoteProviderId; chartId: string }
  | { type: 'playlistDiscovery'; providerId: RemoteProviderId; categoryId: string }
  | { type: 'artist'; providerId: RemoteProviderId; artistId: string }
  | { type: 'album'; providerId: RemoteProviderId; albumId: string };

export const contentTransitionStyles = ['soft', 'directional', 'layered'] as const;

export type ContentTransitionStyle = (typeof contentTransitionStyles)[number];
export type NavigationDirection = 'forward' | 'backward';

interface UiState {
  isQueueOpen: boolean;
  isSidebarCollapsed: boolean;
  contentTransitionStyle: ContentTransitionStyle;
  reduceEffects: boolean;
  navigationDirection: NavigationDirection;
  currentView: AppView;
  canGoBack: boolean;
  canGoForward: boolean;
  backStack: AppView[];
  forwardStack: AppView[];
  setQueueOpen: (open: boolean) => void;
  toggleQueue: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setContentTransitionStyle: (style: ContentTransitionStyle) => void;
  setReduceEffects: (reduceEffects: boolean) => void;
  navigateToView: (view: AppView) => void;
  goBack: () => void;
  goForward: () => void;
  resetForTest: () => void;
}

const homeView: AppView = { type: 'home' };
const UI_STATE_STORAGE_KEY = 'musicplayer.ui-state';

type StoredUiPreferences = Pick<UiState, 'isQueueOpen' | 'contentTransitionStyle' | 'reduceEffects'>;

const initialState = createInitialState();

function createDefaultUiState() {
  return {
    isQueueOpen: false,
    isSidebarCollapsed: false,
    contentTransitionStyle: 'soft' as ContentTransitionStyle,
    reduceEffects: false,
    navigationDirection: 'forward' as NavigationDirection,
    currentView: homeView,
    canGoBack: false,
    canGoForward: false,
    backStack: [] as AppView[],
    forwardStack: [] as AppView[]
  };
}

function createInitialState() {
  return {
    ...createDefaultUiState(),
    ...readStoredUiPreferences()
  };
}

export const useUiStore = create<UiState>((set, get) => ({
  ...initialState,
  setQueueOpen: (isQueueOpen) => {
    set({ isQueueOpen });
    writeStoredUiPreferences(get());
  },
  toggleQueue: () => {
    const isQueueOpen = !get().isQueueOpen;
    set({ isQueueOpen });
    writeStoredUiPreferences(get());
  },
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setContentTransitionStyle: (contentTransitionStyle) => {
    set({ contentTransitionStyle });
    writeStoredUiPreferences(get());
  },
  setReduceEffects: (reduceEffects) => {
    set({ reduceEffects });
    writeStoredUiPreferences(get());
  },
  navigateToView: (view) =>
    set((state) => {
      if (isSameView(state.currentView, view)) {
        return { navigationDirection: 'forward' };
      }

      const backStack = [...state.backStack, state.currentView];
      return {
        currentView: view,
        backStack,
        forwardStack: [],
        canGoBack: backStack.length > 0,
        canGoForward: false,
        navigationDirection: 'forward'
      };
    }),
  goBack: () =>
    set((state) => {
      const previousView = state.backStack.at(-1);
      if (!previousView) {
        return {};
      }

      const backStack = state.backStack.slice(0, -1);
      const forwardStack = [state.currentView, ...state.forwardStack];
      return {
        currentView: previousView,
        backStack,
        forwardStack,
        canGoBack: backStack.length > 0,
        canGoForward: forwardStack.length > 0,
        navigationDirection: 'backward'
      };
    }),
  goForward: () =>
    set((state) => {
      const nextView = state.forwardStack[0];
      if (!nextView) {
        return {};
      }

      const backStack = [...state.backStack, state.currentView];
      const forwardStack = state.forwardStack.slice(1);
      return {
        currentView: nextView,
        backStack,
        forwardStack,
        canGoBack: backStack.length > 0,
        canGoForward: forwardStack.length > 0,
        navigationDirection: 'forward'
      };
    }),
  resetForTest: () => set(createDefaultUiState())
}));

function readStoredUiPreferences(): StoredUiPreferences {
  const defaults: StoredUiPreferences = {
    isQueueOpen: false,
    contentTransitionStyle: 'soft',
    reduceEffects: false
  };

  if (typeof localStorage === 'undefined') {
    return defaults;
  }

  try {
    const rawState = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!rawState) {
      return defaults;
    }

    const parsed = JSON.parse(rawState) as Record<string, unknown>;
    return {
      isQueueOpen: typeof parsed.isQueueOpen === 'boolean' ? parsed.isQueueOpen : defaults.isQueueOpen,
      contentTransitionStyle: isContentTransitionStyle(parsed.contentTransitionStyle)
        ? parsed.contentTransitionStyle
        : defaults.contentTransitionStyle,
      reduceEffects: typeof parsed.reduceEffects === 'boolean' ? parsed.reduceEffects : defaults.reduceEffects
    };
  } catch {
    return defaults;
  }
}

function writeStoredUiPreferences(state: StoredUiPreferences) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
      isQueueOpen: state.isQueueOpen,
      contentTransitionStyle: state.contentTransitionStyle,
      reduceEffects: state.reduceEffects
    }));
  } catch {
    // UI preferences remain usable in memory when local storage is unavailable.
  }
}

function isContentTransitionStyle(value: unknown): value is ContentTransitionStyle {
  return contentTransitionStyles.includes(value as ContentTransitionStyle);
}

function isSameView(left: AppView, right: AppView): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === 'playlist' && right.type === 'playlist') {
    return left.providerId === right.providerId && left.playlistId === right.playlistId;
  }

  if (left.type === 'recommendationCollection' && right.type === 'recommendationCollection') {
    return left.providerId === right.providerId && left.collectionId === right.collectionId;
  }

  if (left.type === 'charts' && right.type === 'charts') {
    return left.providerId === right.providerId;
  }

  if (left.type === 'chart' && right.type === 'chart') {
    return left.providerId === right.providerId && left.chartId === right.chartId;
  }

  if (left.type === 'playlistDiscovery' && right.type === 'playlistDiscovery') {
    return left.providerId === right.providerId && left.categoryId === right.categoryId;
  }

  if (left.type === 'artist' && right.type === 'artist') {
    return left.providerId === right.providerId && left.artistId === right.artistId;
  }

  if (left.type === 'album' && right.type === 'album') {
    return left.providerId === right.providerId && left.albumId === right.albumId;
  }

  return true;
}
