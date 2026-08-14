import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AudioEngine } from './components/AudioEngine';
import { AppNotificationHost } from './components/AppNotificationHost';
import { ChartsView } from './components/ChartsView';
import { HomeView } from './components/HomeView';
import {
  MainContentTransition,
  createMainContentMotionKey,
  createMainContentTransitionKey
} from './components/MainContentTransition';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistDetailView } from './components/PlaylistDetailView';
import { PlaylistDiscoveryView } from './components/PlaylistDiscoveryView';
import { RendererErrorBoundary } from './components/RendererErrorBoundary';
import { SearchResultsView } from './components/SearchResultsView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { VisualBackdrop } from './components/VisualBackdrop';
import { LyricsPanel } from './components/LyricsPanel';
import { useAnimatedPresence } from './hooks/useAnimatedPresence';
import { useCoverPalette } from './hooks/useCoverPalette';
import { useReducedEffects } from './hooks/useReducedEffects';
import { useAppNotificationValue } from './hooks/useAppNotificationValue';
import { showAppNotification } from './state/appNotificationStore';
import { useArtistCatalogStore } from './state/artistCatalogStore';
import { useChartsStore } from './state/chartsStore';
import { useDiscoveryHomeStore } from './state/discoveryHomeStore';
import { getPlaylistTracksKey, useLibraryStore } from './state/libraryStore';
import { usePlayerStore } from './state/playerStore';
import {
  EMPTY_PLAYLIST_DISCOVERY_COLLECTION,
  getPlaylistDiscoveryCollectionKey,
  usePlaylistDiscoveryStore
} from './state/playlistDiscoveryStore';
import { getLoggedInProviderIds, useProviderSessionStore } from './state/providerSessionStore';
import { useSearchHistoryStore } from './state/searchHistoryStore';
import { useSearchStore } from './state/searchStore';
import { useUiStore, type AppView } from './state/uiStore';
import { useRecommendationHistoryStore } from './state/recommendationHistoryStore';
import type { LyricsTransitionOrigin } from './lyrics/lyricsTransition';
import type { CoverPalette } from './utils/coverPalette';
import { resolveRecommendationCollection } from './utils/recommendationCollection';
import type {
  AlbumDetail,
  AlbumReference,
  ArtistDetail,
  ArtistReference,
  DiscoveredPlaylist,
  Playlist,
  ProviderId,
  RemoteProviderId,
  Song,
  SourceContext
} from '../shared/musicTypes';
import './styles/app.css';

const DEFAULT_REMOTE_PROVIDER_ID: RemoteProviderId = 'qq';
const SIDEBAR_TRANSITION_MS = 320;
const EMPTY_RECOMMENDATION_SONGS: Song[] = [];
const EMPTY_PLAYLIST_TRACKS: Song[] = [];
const QueuePanel = lazy(() => import('./components/QueuePanel').then((module) => ({ default: module.QueuePanel })));
const SimilarSongsPanel = lazy(() => import('./components/SimilarSongsPanel').then((module) => ({ default: module.SimilarSongsPanel })));

interface SimilarSongsSession {
  seedSong: Song;
  songs: Song[];
  isLoading: boolean;
  errorMessage: string | null;
}

export function App() {
  const [isLoginDialogOpen, setLoginDialogOpen] = useState(false);
  const [isSidebarTransitioning, setSidebarTransitioning] = useState(false);
  const [isSimilarSongsOpen, setSimilarSongsOpen] = useState(false);
  const [similarSongsSession, setSimilarSongsSession] = useState<SimilarSongsSession | null>(null);
  const [openedDiscoveredPlaylists, setOpenedDiscoveredPlaylists] = useState<Record<string, DiscoveredPlaylist>>({});
  const openLoginDialog = useCallback(() => setLoginDialogOpen(true), []);
  const sidebarTransitionTimeoutRef = useRef<number | null>(null);
  const similarSongsRequestRevisionRef = useRef(0);
  const lyricsMediaRef = useRef<HTMLAudioElement | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const previousMainContentKeyRef = useRef<string | null>(null);
  const isLyricsOpen = usePlayerStore((state) => state.isLyricsOpen);
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const storedCurrentSong = usePlayerStore((state) => state.currentSong);
  const currentSong: Song | null = currentMedia?.mediaType === 'program'
    ? null
    : currentMedia ?? storedCurrentSong;
  const setLyricsOpen = usePlayerStore((state) => state.setLyricsOpen);
  const currentView = useUiStore((state) => state.currentView);
  const activePlaylistTracksKey = currentView.type === 'playlist'
    ? getPlaylistTracksKey(currentView.providerId, currentView.playlistId)
    : null;
  const [lyricsTransitionSession, setLyricsTransitionSession] = useState<{
    origin: LyricsTransitionOrigin;
    palette: CoverPalette;
  } | null>(null);

  useEffect(() => {
    const preventTabFocusNavigation = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', preventTabFocusNavigation, { capture: true });
    return () => window.removeEventListener('keydown', preventTabFocusNavigation, { capture: true });
  }, []);

  const providerStatuses = useProviderSessionStore((state) => state.statuses);
  const defaultProviderId = useProviderSessionStore((state) => state.defaultProviderId);
  const hydrateProviderStatuses = useProviderSessionStore((state) => state.hydrateStatuses);
  const selectedArtist = useArtistCatalogStore((state) => (
    currentView.type === 'artist' ? state.artistDetailsById[currentView.artistId] ?? null : null
  ));
  const artistDetailIsLoading = useArtistCatalogStore((state) => (
    currentView.type === 'artist' ? state.artistLoadingById[currentView.artistId] ?? false : false
  ));
  const artistDetailErrorMessage = useArtistCatalogStore((state) => (
    currentView.type === 'artist' ? state.artistErrorById[currentView.artistId] ?? null : null
  ));
  const selectedAlbum = useArtistCatalogStore((state) => (
    currentView.type === 'album' ? state.albumDetailsById[currentView.albumId] ?? null : null
  ));
  const albumDetailIsLoading = useArtistCatalogStore((state) => (
    currentView.type === 'album' ? state.albumLoadingById[currentView.albumId] ?? false : false
  ));
  const albumDetailErrorMessage = useArtistCatalogStore((state) => (
    currentView.type === 'album' ? state.albumErrorById[currentView.albumId] ?? null : null
  ));
  const loadArtistDetail = useArtistCatalogStore((state) => state.loadArtistDetail);
  const invalidateArtistDetail = useArtistCatalogStore((state) => state.invalidateArtistDetail);
  const loadAlbumDetail = useArtistCatalogStore((state) => state.loadAlbumDetail);
  const chartsByProvider = useChartsStore((state) => state.chartsByProvider);
  const chartTracksById = useChartsStore((state) => state.chartTracksById);
  const chartsLoadingByProvider = useChartsStore((state) => state.isLoadingByProvider);
  const chartsErrorByProvider = useChartsStore((state) => state.errorMessageByProvider);
  const chartTracksLoadingById = useChartsStore((state) => state.isLoadingByChartId);
  const chartTracksErrorById = useChartsStore((state) => state.errorMessageByChartId);
  const lastChartsProviderId = useChartsStore((state) => state.lastProviderId);
  const loadCharts = useChartsStore((state) => state.loadCharts);
  const loadChartTracks = useChartsStore((state) => state.loadChartTracks);
  const setLastChartsProviderId = useChartsStore((state) => state.setLastProviderId);
  const discoveryCategoriesByProvider = usePlaylistDiscoveryStore((state) => state.categoriesByProvider);
  const discoveryCategoriesLoadingByProvider = usePlaylistDiscoveryStore((state) => state.categoriesLoadingByProvider);
  const discoveryCategoriesErrorByProvider = usePlaylistDiscoveryStore((state) => state.categoriesErrorByProvider);
  const discoveryCollectionsByKey = usePlaylistDiscoveryStore((state) => state.collectionsByKey);
  const lastDiscoveryProviderId = usePlaylistDiscoveryStore((state) => state.lastProviderId);
  const loadDiscoveryCategories = usePlaylistDiscoveryStore((state) => state.loadCategories);
  const loadDiscoveredPlaylists = usePlaylistDiscoveryStore((state) => state.loadPlaylists);
  const setLastDiscoveryProviderId = usePlaylistDiscoveryStore((state) => state.setLastProviderId);
  const activeRecommendationState = useDiscoveryHomeStore((state) => (
    currentView.type === 'recommendationCollection'
      && (currentView.collectionId === 'daily' || currentView.collectionId === 'new')
      ? state.recommendationsByProvider[currentView.providerId]
      : null
  ));
  const activeHomepageBlockState = useDiscoveryHomeStore((state) => (
    currentView.type === 'recommendationCollection'
      && currentView.providerId === 'netease'
      && currentView.collectionId.startsWith('homepage:')
      ? state.homepageBlocks
      : null
  ));
  const recommendationHistorySongs = useRecommendationHistoryStore((state) => (
    currentView.type === 'recommendationCollection'
      && currentView.providerId === 'netease'
      && currentView.collectionId === 'history'
      ? state.songs
      : EMPTY_RECOMMENDATION_SONGS
  ));
  const recommendationHistoryLoading = useRecommendationHistoryStore((state) => (
    currentView.type === 'recommendationCollection'
      && currentView.providerId === 'netease'
      && currentView.collectionId === 'history'
      ? state.isLoading
      : false
  ));
  const recommendationHistoryErrorMessage = useRecommendationHistoryStore((state) => (
    currentView.type === 'recommendationCollection'
      && currentView.providerId === 'netease'
      && currentView.collectionId === 'history'
      ? state.errorMessage
      : null
  ));
  const activeProviderPlaylist = useLibraryStore((state) => (
    currentView.type === 'playlist'
      ? state.providerPlaylists[currentView.providerId]?.find(
          (playlist) => playlist.id === currentView.playlistId
        ) ?? null
      : null
  ));
  const visiblePlaylistTracks = useLibraryStore((state) => (
    activePlaylistTracksKey
      ? state.playlistTracks[activePlaylistTracksKey] ?? EMPTY_PLAYLIST_TRACKS
      : EMPTY_PLAYLIST_TRACKS
  ));
  const activePlaylistIsLoading = useLibraryStore((state) => (
    activePlaylistTracksKey
      ? state.playlistTracksLoadingByKey[activePlaylistTracksKey] ?? false
      : false
  ));
  const activePlaylistErrorMessage = useLibraryStore((state) => (
    activePlaylistTracksKey
      ? state.playlistTracksErrorByKey[activePlaylistTracksKey] ?? null
      : null
  ));
  const loadLoggedInProviderPlaylists = useLibraryStore((state) => state.loadLoggedInProviderPlaylists);
  const loadPlaylistTracks = useLibraryStore((state) => state.loadPlaylistTracks);
  const refreshProviderLibrary = useLibraryStore((state) => state.refreshProviderLibrary);
  const selectProviderPlaylist = useLibraryStore((state) => state.selectProviderPlaylist);
  const searchKeyword = useSearchStore((state) => state.keyword);
  const searchProviderId = useSearchStore((state) => state.providerId);
  const searchResults = useSearchStore((state) => state.results);
  const searchEntityResults = useSearchStore((state) => state.entityResults);
  const searchActiveResultView = useSearchStore((state) => state.activeResultView);
  const searchIsLoading = useSearchStore((state) => state.isLoading);
  const searchIsLoadingMore = useSearchStore((state) => state.isLoadingMore);
  const searchErrorMessage = useSearchStore((state) => state.errorMessage);
  const search = useSearchStore((state) => state.search);
  const setSearchActiveResultView = useSearchStore((state) => state.setActiveResultView);
  const loadMoreSearchResults = useSearchStore((state) => state.loadMore);
  const clearSearch = useSearchStore((state) => state.clearSearch);
  const searchHistory = useSearchHistoryStore((state) => state.entries);
  const hydrateSearchHistory = useSearchHistoryStore((state) => state.hydrate);
  const recordSearchHistory = useSearchHistoryStore((state) => state.record);
  const clearSearchHistory = useSearchHistoryStore((state) => state.clear);
  const isQueueOpen = useUiStore((state) => state.isQueueOpen);
  const setQueueOpen = useUiStore((state) => state.setQueueOpen);
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const navigateToView = useUiStore((state) => state.navigateToView);
  const goBack = useUiStore((state) => state.goBack);
  const goForward = useUiStore((state) => state.goForward);
  const canGoBack = useUiStore((state) => state.canGoBack);
  const canGoForward = useUiStore((state) => state.canGoForward);
  const contentTransitionStyle = useUiStore((state) => state.contentTransitionStyle);
  const navigationDirection = useUiStore((state) => state.navigationDirection);
  const { reduceEffects } = useReducedEffects();
  const queuePresence = useAnimatedPresence(isQueueOpen);
  const similarSongsPresence = useAnimatedPresence(isSimilarSongsOpen);
  const loggedInProviderIds = useMemo(() => getLoggedInProviderIds(providerStatuses), [providerStatuses]);
  const defaultProviderLoggedIn = defaultProviderId ? providerStatuses[defaultProviderId].loggedIn : false;
  const resolvedSearchProviderId = searchProviderId === 'qq' || searchProviderId === 'netease'
    ? searchProviderId
    : resolveSearchProviderId(defaultProviderId, defaultProviderLoggedIn);
  const hasSearchView = currentView.type === 'search' && searchKeyword.length > 0;
  const hasChartsView = currentView.type === 'charts';
  const hasChartDetailView = currentView.type === 'chart';
  const hasPlaylistDiscoveryView = currentView.type === 'playlistDiscovery';
  const hasRecommendationCollectionView = currentView.type === 'recommendationCollection';
  const hasArtistDetailView = currentView.type === 'artist';
  const hasAlbumDetailView = currentView.type === 'album';
  const hasCatalogDetailView = hasArtistDetailView || hasAlbumDetailView;
  const activeChartsProviderId = currentView.type === 'charts' || currentView.type === 'chart'
    ? currentView.providerId
    : null;
  const activeCharts = activeChartsProviderId ? chartsByProvider[activeChartsProviderId] : [];
  const selectedChart = currentView.type === 'chart'
    ? chartsByProvider[currentView.providerId].find((chart) => chart.id === currentView.chartId) ?? null
    : null;
  const selectedChartTracks = currentView.type === 'chart' ? chartTracksById[currentView.chartId] ?? [] : [];
  const chartDetailIsLoading = currentView.type === 'chart' ? chartTracksLoadingById[currentView.chartId] ?? false : false;
  const chartDetailErrorMessage = currentView.type === 'chart' ? chartTracksErrorById[currentView.chartId] ?? null : null;
  const activeDiscoveryProviderId = currentView.type === 'playlistDiscovery' ? currentView.providerId : null;
  const activeDiscoveryCategoryId = currentView.type === 'playlistDiscovery' ? currentView.categoryId : 'all';
  const activeDiscoveryCollectionKey = activeDiscoveryProviderId
    ? getPlaylistDiscoveryCollectionKey(activeDiscoveryProviderId, activeDiscoveryCategoryId)
    : null;
  const activeDiscoveryCollection = activeDiscoveryCollectionKey
    ? discoveryCollectionsByKey[activeDiscoveryCollectionKey] ?? EMPTY_PLAYLIST_DISCOVERY_COLLECTION
    : EMPTY_PLAYLIST_DISCOVERY_COLLECTION;
  const selectedArtistPlaylist = useMemo(
    () => selectedArtist ? createArtistDetailPlaylist(selectedArtist) : null,
    [selectedArtist]
  );
  const selectedArtistMetaItems = useMemo(
    () => selectedArtist ? createArtistMetaItems(selectedArtist) : [],
    [selectedArtist]
  );
  const selectedAlbumPlaylist = useMemo(
    () => selectedAlbum ? createAlbumDetailPlaylist(selectedAlbum) : null,
    [selectedAlbum]
  );
  const selectedAlbumMetaItems = useMemo(
    () => selectedAlbum ? createAlbumMetaItems(selectedAlbum) : [],
    [selectedAlbum]
  );
  const selectedRecommendationCollection = useMemo(() => (
    currentView.type === 'recommendationCollection'
      ? resolveRecommendationCollection(currentView.providerId, currentView.collectionId, {
          recommendationFeed: activeRecommendationState?.feed ?? null,
          homepageBlockFeed: activeHomepageBlockState?.feed ?? null,
          historySongs: currentView.providerId === 'netease' ? recommendationHistorySongs : []
        })
      : null
  ), [activeHomepageBlockState, activeRecommendationState, currentView, recommendationHistorySongs]);
  const discoveredPlaylists = useMemo(
    () => Object.values(discoveryCollectionsByKey).flatMap((collection) => collection.playlists),
    [discoveryCollectionsByKey]
  );
  const selectedPlaylist = useMemo(() => {
    if (currentView.type !== 'playlist') {
      return null;
    }

    return activeProviderPlaylist
      ?? discoveredPlaylists.find(
        (playlist) => playlist.providerId === currentView.providerId && playlist.id === currentView.playlistId
      )
      ?? openedDiscoveredPlaylists[createDiscoveredPlaylistCacheKey(currentView.providerId, currentView.playlistId)]
      ?? null;
  }, [activeProviderPlaylist, currentView, discoveredPlaylists, openedDiscoveredPlaylists]);
  const hasPlaylistView = currentView.type === 'playlist' && selectedPlaylist !== null;
  const detailAmbientSource = hasRecommendationCollectionView
    ? selectedRecommendationCollection?.playlist ?? null
    : hasArtistDetailView
      ? selectedArtistPlaylist
      : hasAlbumDetailView
        ? selectedAlbumPlaylist
        : hasChartDetailView
          ? selectedChart
          : hasPlaylistView
            ? selectedPlaylist
            : null;
  const detailCoverPalette = useCoverPalette(
    detailAmbientSource?.coverTone ?? 'linear-gradient(135deg, #d84848, #2f6f90)',
    detailAmbientSource?.coverUrl
  );
  const hasDetailAmbient = Boolean(detailAmbientSource?.coverUrl);
  const detailAmbientKey = hasDetailAmbient && detailAmbientSource
    ? `${detailAmbientSource.providerId}:${detailAmbientSource.id}:${detailCoverPalette.primary}:${detailCoverPalette.secondary}`
    : null;
  const [detailAmbientLayers, setDetailAmbientLayers] = useState<DetailAmbientLayerState>(() => ({
    activeSlot: null,
    layers: [null, null]
  }));
  const mainContentTransitionKey = createMainContentTransitionKey(currentView, searchKeyword, searchProviderId);
  const mainContentMotionKey = createMainContentMotionKey(currentView, searchKeyword, searchProviderId);

  useLayoutEffect(() => {
    setDetailAmbientLayers((current) => {
      if (!detailAmbientKey) {
        return current.activeSlot === null ? current : { ...current, activeSlot: null };
      }
      const activeLayer = current.activeSlot === null ? null : current.layers[current.activeSlot];
      if (activeLayer?.key === detailAmbientKey) {
        return current;
      }

      const nextSlot: DetailAmbientSlot = current.activeSlot === 0 ? 1 : 0;
      const layers: DetailAmbientLayerState['layers'] = [...current.layers];
      layers[nextSlot] = {
        key: detailAmbientKey,
        primary: detailCoverPalette.primary,
        secondary: detailCoverPalette.secondary
      };
      return { activeSlot: nextSlot, layers };
    });
  }, [detailAmbientKey, detailCoverPalette.primary, detailCoverPalette.secondary]);

  useLayoutEffect(() => {
    const root = document.documentElement;

    if (!hasDetailAmbient) {
      delete root.dataset.detailAmbient;
      root.style.removeProperty('--detail-ambient-primary');
      root.style.removeProperty('--detail-ambient-secondary');
      return;
    }

    root.dataset.detailAmbient = 'true';
    root.style.setProperty('--detail-ambient-primary', detailCoverPalette.primary);
    root.style.setProperty('--detail-ambient-secondary', detailCoverPalette.secondary);
  }, [detailCoverPalette.primary, detailCoverPalette.secondary, hasDetailAmbient]);

  useEffect(() => () => {
    const root = document.documentElement;
    delete root.dataset.detailAmbient;
    root.style.removeProperty('--detail-ambient-primary');
    root.style.removeProperty('--detail-ambient-secondary');
  }, []);

  useLayoutEffect(() => {
    const previousKey = previousMainContentKeyRef.current;
    previousMainContentKeyRef.current = mainContentTransitionKey;

    if (previousKey === null || previousKey === mainContentTransitionKey) {
      return;
    }

    const mainContent = mainContentRef.current;
    if (!mainContent) {
      return;
    }

    mainContent.scrollTop = 0;
    mainContent.scrollLeft = 0;
  }, [mainContentTransitionKey]);

  useEffect(() => {
    void hydrateProviderStatuses();
  }, [hydrateProviderStatuses]);

  useEffect(() => {
    hydrateSearchHistory();
  }, [hydrateSearchHistory]);

  useEffect(() => () => {
    similarSongsRequestRevisionRef.current += 1;
    if (sidebarTransitionTimeoutRef.current !== null) {
      window.clearTimeout(sidebarTransitionTimeoutRef.current);
    }

  }, []);

  useEffect(() => {
    if (loggedInProviderIds.length === 0) {
      return;
    }

    void loadLoggedInProviderPlaylists(loggedInProviderIds);
  }, [loadLoggedInProviderPlaylists, loggedInProviderIds]);

  useEffect(() => {
    if (currentView.type !== 'charts' && currentView.type !== 'chart') {
      return;
    }

    setLastChartsProviderId(currentView.providerId);
    void loadCharts(currentView.providerId);
    if (currentView.type === 'chart') {
      void loadChartTracks(currentView.providerId, currentView.chartId);
    }
  }, [currentView, loadChartTracks, loadCharts, setLastChartsProviderId]);

  useEffect(() => {
    if (currentView.type !== 'playlistDiscovery') {
      return;
    }

    setLastDiscoveryProviderId(currentView.providerId);
    void loadDiscoveryCategories(currentView.providerId);
    void loadDiscoveredPlaylists(currentView.providerId, currentView.categoryId);
  }, [
    currentView,
    loadDiscoveredPlaylists,
    loadDiscoveryCategories,
    setLastDiscoveryProviderId
  ]);

  useEffect(() => {
    if (currentView.type === 'artist') {
      void loadArtistDetail(currentView.providerId, currentView.artistId);
      return;
    }

    if (currentView.type === 'album') {
      void loadAlbumDetail(currentView.providerId, currentView.albumId);
    }
  }, [currentView, loadAlbumDetail, loadArtistDetail]);

  useEffect(() => {
    if (!isQueueOpen) {
      return;
    }

    const handleQueueOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest('.queue-panel, .queue-toggle-button')) {
        return;
      }

      setQueueOpen(false);
    };

    document.addEventListener('pointerdown', handleQueueOutsidePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleQueueOutsidePointerDown, true);
    };
  }, [isQueueOpen, setQueueOpen]);

  const handleSearchSubmit = useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      clearSearch();
      return;
    }

    const providerId = resolvedSearchProviderId;
    recordSearchHistory(normalizedKeyword);
    void search(providerId, normalizedKeyword);
    // search() synchronously commits its identity before the route changes. This keeps
    // a submit to one page transition instead of briefly mounting an empty search page.
    navigateToView({ type: 'search' });
  }, [clearSearch, navigateToView, recordSearchHistory, resolvedSearchProviderId, search]);

  const handleSearchSuggestions = useCallback(
    async (providerId: RemoteProviderId, keyword: string) => {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) {
        return [];
      }

      try {
        const result = await window.musicPlayer.music.getSearchSuggestions(providerId, normalizedKeyword, { limit: 8 });
        return result.ok ? result.data : [];
      } catch {
        return [];
      }
    },
    []
  );

  const handleSearchHotSearches = useCallback(
    async (providerId: RemoteProviderId) => {
      try {
        const result = await window.musicPlayer.music.getSearchHotSearches(providerId, { limit: 10 });
        return result.ok ? result.data : [];
      } catch {
        return [];
      }
    },
    []
  );

  const handleSearchProviderChange = (providerId: RemoteProviderId) => {
    if (!searchKeyword) {
      return;
    }

    navigateToView({ type: 'search' });
    void search(providerId, searchKeyword);
  };

  const handleNavigateHome = () => {
    navigateToView({ type: 'home' });
  };

  const handleNavigateCharts = () => {
    const providerId = lastChartsProviderId ?? resolveRemoteProviderId(defaultProviderId, defaultProviderLoggedIn);
    navigateToView({ type: 'charts', providerId });
  };

  const handleChartsProviderChange = (providerId: RemoteProviderId) => {
    setLastChartsProviderId(providerId);
    navigateToView({ type: 'charts', providerId });
  };

  const handleNavigatePlaylistDiscovery = () => {
    const providerId = lastDiscoveryProviderId ?? resolveRemoteProviderId(defaultProviderId, defaultProviderLoggedIn);
    navigateToView({ type: 'playlistDiscovery', providerId, categoryId: 'all' });
  };

  const handleDiscoveryProviderChange = (providerId: RemoteProviderId) => {
    setLastDiscoveryProviderId(providerId);
    navigateToView({ type: 'playlistDiscovery', providerId, categoryId: 'all' });
  };

  const handleNavigateDiscoveryCategory = (providerId: RemoteProviderId, categoryId: string) => {
    setLastDiscoveryProviderId(providerId);
    navigateToView({ type: 'playlistDiscovery', providerId, categoryId });
  };

  const handleDiscoveryCategoryChange = (categoryId: string) => {
    if (currentView.type !== 'playlistDiscovery') {
      return;
    }

    navigateToView({
      type: 'playlistDiscovery',
      providerId: currentView.providerId,
      categoryId
    });
  };

  const handleSelectDiscoveredPlaylist = (playlist: DiscoveredPlaylist) => {
    setOpenedDiscoveredPlaylists((current) => ({
      ...current,
      [createDiscoveredPlaylistCacheKey(playlist.providerId, playlist.id)]: playlist
    }));
    navigateToView({ type: 'playlist', providerId: playlist.providerId, playlistId: playlist.id });
    void selectProviderPlaylist(playlist.providerId, playlist.id);
  };

  const handlePlayDiscoveredPlaylist = async (playlist: DiscoveredPlaylist) => {
    const tracks = await loadPlaylistTracks(playlist.providerId, playlist.id);
    if (tracks.length === 0) {
      showPlaybackFeedback('这个歌单暂时无法播放');
      return;
    }
    const startedItem = usePlayerStore.getState().playSongsFromList(
      tracks,
      0,
      (song) => song.sourceContext ?? {
        type: 'playlist',
        providerId: playlist.providerId,
        playlistId: playlist.id,
        playlistTitle: playlist.title
      }
    );
    if (startedItem) {
      showPlaybackFeedback(`已开始播放${playlist.title}`);
    }
  };

  const handleOpenRecommendationCollection = (providerId: RemoteProviderId, collectionId: string) => {
    navigateToView({ type: 'recommendationCollection', providerId, collectionId });
  };

  const handleRefreshPlaylistDiscovery = () => {
    if (currentView.type !== 'playlistDiscovery') {
      return;
    }

    void Promise.all([
      loadDiscoveryCategories(currentView.providerId, { forceRefresh: true }),
      loadDiscoveredPlaylists(currentView.providerId, currentView.categoryId, { forceRefresh: true })
    ]);
  };

  const handleLoadMoreDiscoveredPlaylists = () => {
    if (currentView.type !== 'playlistDiscovery') {
      return;
    }

    void loadDiscoveredPlaylists(currentView.providerId, currentView.categoryId, { append: true });
  };

  const handleSelectChart = (providerId: RemoteProviderId, chartId: string) => {
    navigateToView({ type: 'chart', providerId, chartId });
  };

  const handleSelectArtist = useCallback((artist: ArtistReference) => {
    navigateToView({ type: 'artist', providerId: artist.providerId, artistId: artist.id });
  }, [navigateToView]);

  const handleSelectAlbum = useCallback((album: AlbumReference) => {
    navigateToView({ type: 'album', providerId: album.providerId, albumId: album.id });
  }, [navigateToView]);

  const handleRefreshArtistDetail = useCallback(() => {
    if (currentView.type === 'artist') {
      void loadArtistDetail(currentView.providerId, currentView.artistId, { forceRefresh: true });
    }
  }, [currentView, loadArtistDetail]);

  const handleRetryArtistDetail = useCallback((resetBoundary: () => void) => {
    if (currentView.type !== 'artist') {
      return;
    }

    invalidateArtistDetail(currentView.providerId, currentView.artistId);
    resetBoundary();
    void loadArtistDetail(currentView.providerId, currentView.artistId, { forceRefresh: true });
  }, [currentView, invalidateArtistDetail, loadArtistDetail]);

  const handleRefreshAlbumDetail = useCallback(() => {
    if (currentView.type === 'album') {
      void loadAlbumDetail(currentView.providerId, currentView.albumId, { forceRefresh: true });
    }
  }, [currentView, loadAlbumDetail]);

  const handleLyricsBoundaryError = useCallback(() => {
    setLyricsOpen(false);
    showAppNotification({
      key: 'lyrics-render-error',
      message: '歌词页面发生异常，已安全关闭',
      tone: 'error'
    });
  }, [setLyricsOpen]);

  const handleRefreshCharts = () => {
    if (currentView.type !== 'charts') {
      return;
    }

    void loadCharts(currentView.providerId, { forceRefresh: true });
  };

  const handleSelectProviderPlaylist = useCallback((providerId: ProviderId, playlistId: string) => {
    navigateToView({ type: 'playlist', providerId, playlistId });
    void selectProviderPlaylist(providerId, playlistId);
  }, [navigateToView, selectProviderPlaylist]);

  const handleRefreshProviderLibrary = () => {
    if (loggedInProviderIds.length === 0) {
      return;
    }

    const { selectedPlaylistId, selectedProviderId } = useLibraryStore.getState();
    void Promise.all(
      loggedInProviderIds.map((providerId) => {
        const playlistId = selectedProviderId === providerId ? selectedPlaylistId : null;
        return refreshProviderLibrary(providerId, playlistId);
      })
    );
  };

  const handleRefreshSidebarContent = () => {
    if (currentView.type === 'charts') {
      handleRefreshCharts();
      return;
    }

    if (currentView.type === 'playlistDiscovery') {
      handleRefreshPlaylistDiscovery();
      return;
    }

    if (currentView.type === 'chart') {
      void Promise.all([
        loadCharts(currentView.providerId, { forceRefresh: true }),
        loadChartTracks(currentView.providerId, currentView.chartId, { forceRefresh: true })
      ]);
      return;
    }

    handleRefreshProviderLibrary();
  };

  const canRefreshSidebarContent = hasChartsView
    || hasPlaylistDiscoveryView
    || hasChartDetailView
    || loggedInProviderIds.length > 0;
  const isSidebarContentRefreshing = (hasChartsView && activeChartsProviderId
    ? chartsLoadingByProvider[activeChartsProviderId]
    : false)
    || (hasPlaylistDiscoveryView && activeDiscoveryProviderId
      ? discoveryCategoriesLoadingByProvider[activeDiscoveryProviderId] || activeDiscoveryCollection.isLoading
      : false)
    || (hasChartDetailView && currentView.type === 'chart'
      ? chartTracksLoadingById[currentView.chartId] ?? false
      : false)
    || (!(hasChartsView || hasPlaylistDiscoveryView || hasChartDetailView) && activePlaylistIsLoading);

  const handleToggleSidebarCollapsed = useCallback(() => {
    setSidebarTransitioning(true);
    if (sidebarTransitionTimeoutRef.current !== null) {
      window.clearTimeout(sidebarTransitionTimeoutRef.current);
    }

    sidebarTransitionTimeoutRef.current = window.setTimeout(() => {
      sidebarTransitionTimeoutRef.current = null;
      setSidebarTransitioning(false);
    }, SIDEBAR_TRANSITION_MS);
    toggleSidebarCollapsed();
  }, [toggleSidebarCollapsed]);

  const handleLyricsOpen = useCallback((origin: LyricsTransitionOrigin, palette: CoverPalette) => {
    if (!currentSong) {
      return;
    }

    setLyricsTransitionSession({ origin, palette });
    setLyricsOpen(true);
  }, [currentSong, setLyricsOpen]);

  const showPlaybackFeedback = useCallback((message: string) => {
    showAppNotification({
      key: 'playback-feedback',
      message,
      tone: getPlaybackFeedbackTone(message)
    });
  }, []);

  const closeSimilarSongs = useCallback(() => {
    similarSongsRequestRevisionRef.current += 1;
    setSimilarSongsOpen(false);
  }, []);

  const requestSimilarSongs = useCallback((song: Song, forceRefresh = false) => {
    const activeSong = getCurrentSongForSongOnlyActions();
    if (song.providerId !== 'netease' || !hasSameSongIdentity(activeSong, song)) {
      return;
    }

    const requestRevision = ++similarSongsRequestRevisionRef.current;
    setQueueOpen(false);
    setSimilarSongsOpen(true);
    setSimilarSongsSession({
      seedSong: song,
      songs: [],
      isLoading: true,
      errorMessage: null
    });

    const musicApi = window.musicPlayer?.music;
    if (!musicApi?.getSimilarSongs) {
      setSimilarSongsSession({
        seedSong: song,
        songs: [],
        isLoading: false,
        errorMessage: '当前版本暂不支持相似推荐'
      });
      return;
    }

    const request = forceRefresh
      ? musicApi.getSimilarSongs('netease', song, { forceRefresh: true })
      : musicApi.getSimilarSongs('netease', song);

    void request.then((result) => {
      if (
        similarSongsRequestRevisionRef.current !== requestRevision
        || !hasSameSongIdentity(getCurrentSongForSongOnlyActions(), song)
      ) {
        return;
      }

      setSimilarSongsSession({
        seedSong: song,
        songs: result.ok ? result.data : [],
        isLoading: false,
        errorMessage: result.ok ? null : result.error.message
      });
    }).catch((error: unknown) => {
      if (
        similarSongsRequestRevisionRef.current !== requestRevision
        || !hasSameSongIdentity(getCurrentSongForSongOnlyActions(), song)
      ) {
        return;
      }

      setSimilarSongsSession({
        seedSong: song,
        songs: [],
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '相似推荐加载失败'
      });
    });
  }, [setQueueOpen]);

  const toggleSimilarSongs = useCallback((song: Song) => {
    if (
      isSimilarSongsOpen
      && similarSongsSession
      && hasSameSongIdentity(similarSongsSession.seedSong, song)
    ) {
      closeSimilarSongs();
      return;
    }

    requestSimilarSongs(song);
  }, [closeSimilarSongs, isSimilarSongsOpen, requestSimilarSongs, similarSongsSession]);

  const refreshSimilarSongs = useCallback(() => {
    if (!similarSongsSession) {
      return;
    }

    requestSimilarSongs(similarSongsSession.seedSong, true);
  }, [requestSimilarSongs, similarSongsSession]);

  const playAllSimilarSongs = useCallback(() => {
    if (!similarSongsSession || similarSongsSession.songs.length === 0) {
      return;
    }

    const startedItem = usePlayerStore.getState().playSongsFromList(
      similarSongsSession.songs,
      0,
      createSimilarSongsSourceContext
    );
    if (startedItem) {
      showPlaybackFeedback('已开始播放相似推荐');
    }
  }, [showPlaybackFeedback, similarSongsSession]);

  const playSimilarSong = useCallback((song: Song, index: number) => {
    if (!similarSongsSession || similarSongsSession.songs[index] !== song) {
      return;
    }

    const startedItem = usePlayerStore.getState().playSongsFromList(
      similarSongsSession.songs,
      index,
      createSimilarSongsSourceContext
    );
    if (startedItem) {
      showPlaybackFeedback('已开始播放相似推荐');
    }
  }, [showPlaybackFeedback, similarSongsSession]);

  const playSimilarSongNext = useCallback((song: Song) => {
    if (!similarSongsSession?.songs.includes(song)) {
      return;
    }

    usePlayerStore.getState().enqueueNextSong(song, createSimilarSongsSourceContext());
    showPlaybackFeedback('已添加到下一首播放');
  }, [showPlaybackFeedback, similarSongsSession]);

  useEffect(() => {
    if (!similarSongsSession || hasSameSongIdentity(currentSong, similarSongsSession.seedSong)) {
      return;
    }

    similarSongsRequestRevisionRef.current += 1;
    setSimilarSongsOpen(false);
    setSimilarSongsSession(null);
  }, [currentSong, similarSongsSession]);

  useEffect(() => {
    if (currentMedia?.mediaType !== 'program') {
      return;
    }

    if (isLyricsOpen) {
      setLyricsOpen(false);
    }
    if (isSimilarSongsOpen) {
      closeSimilarSongs();
    }
  }, [closeSimilarSongs, currentMedia?.mediaType, isLyricsOpen, isSimilarSongsOpen, setLyricsOpen]);

  useEffect(() => {
    if ((isQueueOpen || isLyricsOpen) && isSimilarSongsOpen) {
      closeSimilarSongs();
    }
  }, [closeSimilarSongs, isLyricsOpen, isQueueOpen, isSimilarSongsOpen]);

  useEffect(() => {
    if (!isSimilarSongsOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest('.similar-songs-panel, .similar-songs-toggle-button')) {
        return;
      }

      closeSimilarSongs();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSimilarSongs();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSimilarSongs, isSimilarSongsOpen]);

  const shellClassName = [
    'desktop-shell',
    isQueueOpen ? 'queue-open' : 'queue-closed',
    isSimilarSongsOpen ? 'similar-songs-open' : 'similar-songs-closed',
    isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded',
    isSidebarTransitioning ? 'sidebar-transitioning' : ''
  ].filter(Boolean).join(' ');
  const detailAmbientStyle = hasDetailAmbient ? {
    '--detail-ambient-primary': detailCoverPalette.primary,
    '--detail-ambient-secondary': detailCoverPalette.secondary
  } as CSSProperties : undefined;
  const playbackFeedbackLayer = (
    <div className="playback-feedback-layer">
      <AppNotificationHost onLoginClick={openLoginDialog} />
    </div>
  );
  return (
    <>
      <div
        className={shellClassName}
        data-detail-ambient={hasDetailAmbient ? 'true' : undefined}
        style={detailAmbientStyle}
      >
      {detailAmbientLayers.layers.map((layer, slot) => (
        <span
          className={[
            'detail-ambient-backdrop',
            detailAmbientLayers.activeSlot === slot ? 'detail-ambient-backdrop-active' : ''
          ].filter(Boolean).join(' ')}
          data-ambient-slot={slot}
          style={layer ? {
            '--detail-ambient-primary': layer.primary,
            '--detail-ambient-secondary': layer.secondary
          } as CSSProperties : undefined}
          aria-hidden="true"
          key={slot}
        />
      ))}
      <VisualBackdrop />
      <Sidebar
        currentView={currentView}
        canRefreshProviderLibrary={canRefreshSidebarContent}
        isCollapsed={isSidebarCollapsed}
        isProviderLibraryRefreshing={isSidebarContentRefreshing}
        contentTransitionStyle={contentTransitionStyle}
        navigationDirection={navigationDirection}
        reduceEffects={reduceEffects}
        onNavigateHome={handleNavigateHome}
        onNavigateCharts={handleNavigateCharts}
        onNavigatePlaylistDiscovery={handleNavigatePlaylistDiscovery}
        onRefreshProviderLibrary={handleRefreshSidebarContent}
        onSelectProviderPlaylist={handleSelectProviderPlaylist}
        onToggleSidebarCollapsed={handleToggleSidebarCollapsed}
      />
      <section className="content-frame">
        <TopBar
          isLoginOpen={isLoginDialogOpen}
          onLoginOpenChange={setLoginDialogOpen}
          onSearchSubmit={handleSearchSubmit}
          searchProviderId={resolvedSearchProviderId}
          onSearchSuggestions={handleSearchSuggestions}
          onSearchHotSearches={handleSearchHotSearches}
          searchHistory={searchHistory}
          onClearSearchHistory={clearSearchHistory}
          onBack={goBack}
          onForward={goForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
        <main
          className={
            hasSearchView
              ? 'main-content main-content-search'
              : hasPlaylistView || hasChartDetailView || hasCatalogDetailView || hasRecommendationCollectionView
                ? 'main-content main-content-playlist'
                : hasPlaylistDiscoveryView
                  ? 'main-content main-content-playlist-discovery'
                  : hasChartsView
                    ? 'main-content main-content-charts'
                  : 'main-content'
          }
          aria-label={
            hasSearchView
              ? '搜索结果内容'
              : hasChartsView
                ? '排行榜内容'
                : hasPlaylistDiscoveryView
                  ? '歌单广场内容'
                : hasArtistDetailView
                  ? '歌手详情内容'
                : hasAlbumDetailView
                  ? '专辑详情内容'
                : hasRecommendationCollectionView
                  ? '推荐集合详情内容'
                : hasChartDetailView
                  ? '排行榜详情内容'
                  : hasPlaylistView
                    ? '歌单详情内容'
                    : '首页内容'
          }
          ref={mainContentRef}
        >
          <MainContentTransition
            transitionKey={mainContentTransitionKey}
            motionKey={mainContentMotionKey}
            style={contentTransitionStyle}
            direction={navigationDirection}
            reduceEffects={reduceEffects}
            retainOutgoing
          >
          {hasSearchView ? (
            <SearchResultsView
              keyword={searchKeyword}
              providerId={searchProviderId}
              results={searchResults}
              entityResults={searchEntityResults}
              activeResultView={searchActiveResultView}
              isLoading={searchIsLoading}
              isLoadingMore={searchIsLoadingMore}
              errorMessage={searchErrorMessage}
              onProviderChange={handleSearchProviderChange}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              onSelectPlaylist={handleSelectDiscoveredPlaylist}
              onResultViewChange={setSearchActiveResultView}
              onLoadMore={loadMoreSearchResults}
              onPlaybackStarted={showPlaybackFeedback}
            />
          ) : hasChartsView && activeChartsProviderId ? (
            <ChartsView
              providerId={activeChartsProviderId}
              charts={activeCharts}
              isLoading={chartsLoadingByProvider[activeChartsProviderId]}
              errorMessage={chartsErrorByProvider[activeChartsProviderId]}
              onRefresh={handleRefreshCharts}
              onProviderChange={handleChartsProviderChange}
              onSelectChart={handleSelectChart}
            />
          ) : hasPlaylistDiscoveryView && activeDiscoveryProviderId ? (
            <PlaylistDiscoveryView
              providerId={activeDiscoveryProviderId}
              categoryId={activeDiscoveryCategoryId}
              categories={discoveryCategoriesByProvider[activeDiscoveryProviderId]}
              playlists={activeDiscoveryCollection.playlists}
              isLoading={
                discoveryCategoriesLoadingByProvider[activeDiscoveryProviderId]
                || activeDiscoveryCollection.isLoading
                || (
                  !activeDiscoveryCollection.loaded
                  && activeDiscoveryCollection.errorMessage === null
                )
              }
              loadingKind={activeDiscoveryCollection.loadingKind}
              errorMessage={
                activeDiscoveryCollection.errorMessage
                ?? discoveryCategoriesErrorByProvider[activeDiscoveryProviderId]
              }
              hasMore={activeDiscoveryCollection.hasMore}
              onProviderChange={handleDiscoveryProviderChange}
              onRefresh={handleRefreshPlaylistDiscovery}
              onCategoryChange={handleDiscoveryCategoryChange}
              onSelectPlaylist={handleSelectDiscoveredPlaylist}
              onPlayPlaylist={(playlist) => void handlePlayDiscoveredPlaylist(playlist)}
              onLoadMore={handleLoadMoreDiscoveredPlaylists}
              transitionStyle={contentTransitionStyle}
              navigationDirection={navigationDirection}
              reduceEffects={reduceEffects}
            />
          ) : hasRecommendationCollectionView && selectedRecommendationCollection ? (
            <PlaylistDetailView
              playlist={selectedRecommendationCollection.playlist}
              tracks={selectedRecommendationCollection.songs}
              isLoading={getRecommendationCollectionLoading(
                currentView,
                activeRecommendationState,
                activeHomepageBlockState?.isLoading ?? false,
                recommendationHistoryLoading
              )}
              errorMessage={getRecommendationCollectionError(
                currentView,
                activeRecommendationState,
                activeHomepageBlockState?.errorMessage ?? null,
                recommendationHistoryErrorMessage
              )}
              contentKind="recommendation"
              coverPalette={detailCoverPalette}
              reduceEffects={reduceEffects}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              onPlaybackStarted={showPlaybackFeedback}
            />
          ) : hasRecommendationCollectionView ? (
            <CatalogDetailFallback
              detailLabel="推荐集合详情"
              isLoading={false}
              errorMessage="这个推荐集合已经不可用"
            />
          ) : hasArtistDetailView ? (
            <RendererErrorBoundary
              area="artist-detail"
              entityId={currentView.type === 'artist'
                ? currentView.artistId
                : undefined}
              resetKey={mainContentTransitionKey}
              fallback={({ reset }) => (
                <CatalogDetailFallback
                  detailLabel="歌手详情"
                  isLoading={false}
                  errorMessage="歌手详情显示异常"
                  onRetry={() => handleRetryArtistDetail(reset)}
                />
              )}
            >
              {selectedArtist && selectedArtistPlaylist ? (
                <PlaylistDetailView
                  playlist={selectedArtistPlaylist}
                  tracks={selectedArtist.topSongs}
                  isLoading={artistDetailIsLoading}
                  errorMessage={artistDetailErrorMessage}
                  transitionStyle={contentTransitionStyle}
                  navigationDirection={navigationDirection}
                  reduceEffects={reduceEffects}
                  contentKind="artist"
                  coverPalette={detailCoverPalette}
                  metaItems={selectedArtistMetaItems}
                  albums={selectedArtist.albums}
                  onSelectArtist={handleSelectArtist}
                  onSelectAlbum={handleSelectAlbum}
                  onRefresh={handleRefreshArtistDetail}
                  onPlaybackStarted={showPlaybackFeedback}
                />
              ) : (
                <CatalogDetailFallback
                  detailLabel="歌手详情"
                  isLoading={artistDetailIsLoading}
                  errorMessage={artistDetailErrorMessage}
                  onRetry={handleRefreshArtistDetail}
                />
              )}
            </RendererErrorBoundary>
          ) : hasAlbumDetailView && selectedAlbum && selectedAlbumPlaylist ? (
            <PlaylistDetailView
              playlist={selectedAlbumPlaylist}
              tracks={selectedAlbum.tracks}
              isLoading={albumDetailIsLoading}
              errorMessage={albumDetailErrorMessage}
              reduceEffects={reduceEffects}
              contentKind="album"
              coverPalette={detailCoverPalette}
              metaItems={selectedAlbumMetaItems}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              onRefresh={handleRefreshAlbumDetail}
              onPlaybackStarted={showPlaybackFeedback}
            />
          ) : hasAlbumDetailView ? (
            <CatalogDetailFallback
              detailLabel="专辑详情"
              isLoading={albumDetailIsLoading}
              errorMessage={albumDetailErrorMessage}
              onRetry={handleRefreshAlbumDetail}
            />
          ) : hasChartDetailView && selectedChart ? (
            <PlaylistDetailView
              playlist={selectedChart}
              tracks={selectedChartTracks}
              isLoading={chartDetailIsLoading}
              errorMessage={chartDetailErrorMessage}
              reduceEffects={reduceEffects}
              contentKind="chart"
              coverPalette={detailCoverPalette}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              onPlaybackStarted={showPlaybackFeedback}
            />
          ) : hasChartDetailView ? (
            <CatalogDetailFallback
              detailLabel="排行榜详情"
              isLoading={activeChartsProviderId ? chartsLoadingByProvider[activeChartsProviderId] : false}
              errorMessage={activeChartsProviderId
                ? chartsErrorByProvider[activeChartsProviderId] ?? '未找到这个榜单'
                : '未找到这个榜单'}
              onRetry={handleRefreshSidebarContent}
            />
          ) : hasPlaylistView ? (
            <PlaylistDetailView
              playlist={selectedPlaylist}
              tracks={visiblePlaylistTracks}
              isLoading={activePlaylistIsLoading}
              errorMessage={activePlaylistErrorMessage}
              reduceEffects={reduceEffects}
              coverPalette={detailCoverPalette}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              onPlaybackStarted={showPlaybackFeedback}
            />
          ) : (
            <HomeView
              transitionStyle={contentTransitionStyle}
              navigationDirection={navigationDirection}
              reduceEffects={reduceEffects}
              onPlaybackStarted={showPlaybackFeedback}
              onActionFeedback={showPlaybackFeedback}
              onOpenCollection={handleOpenRecommendationCollection}
              onSelectAlbum={handleSelectAlbum}
              onLoginRequested={openLoginDialog}
            />
          )}
          </MainContentTransition>
        </main>
      </section>
      <RendererErrorBoundary
        area="queue-panel"
        resetKey={queuePresence.isMounted ? queuePresence.state : 'unmounted'}
        fallback={<QueuePanelErrorFallback presenceState={queuePresence.state} />}
      >
        <Suspense fallback={null}>
          {queuePresence.isMounted ? <QueuePanel presenceState={queuePresence.state} /> : null}
        </Suspense>
      </RendererErrorBoundary>
      <RendererErrorBoundary
        area="similar-songs-panel"
        entityId={similarSongsSession?.seedSong.id}
        resetKey={similarSongsPresence.isMounted
          ? `${similarSongsPresence.state}:${similarSongsSession?.seedSong.id ?? 'empty'}`
          : 'unmounted'}
        fallback={<SimilarSongsPanelErrorFallback presenceState={similarSongsPresence.state} />}
      >
        <Suspense fallback={null}>
          {similarSongsPresence.isMounted && similarSongsSession ? (
            <SimilarSongsPanel
              seedSong={similarSongsSession.seedSong}
              songs={similarSongsSession.songs}
              isLoading={similarSongsSession.isLoading}
              errorMessage={similarSongsSession.errorMessage}
              presenceState={similarSongsPresence.state}
              onClose={closeSimilarSongs}
              onRefresh={refreshSimilarSongs}
              onPlayAll={playAllSimilarSongs}
              onPlaySong={playSimilarSong}
              onPlayNext={playSimilarSongNext}
            />
          ) : null}
        </Suspense>
      </RendererErrorBoundary>
      <AudioEngine mediaRef={lyricsMediaRef} />
      <PlayerBar
        isSimilarSongsOpen={isSimilarSongsOpen}
        reduceEffects={reduceEffects}
        onLoginClick={openLoginDialog}
        onLyricsOpen={handleLyricsOpen}
        onSimilarSongsToggle={toggleSimilarSongs}
      />
      <RendererErrorBoundary
        area="lyrics-panel"
        entityId={currentSong?.id}
        resetKey={isLyricsOpen && currentSong ? `${currentSong.providerId}:${currentSong.id}` : 'closed'}
        fallback={null}
        onError={handleLyricsBoundaryError}
      >
        {isLyricsOpen && currentSong ? (
          <LyricsPanel
            transitionOrigin={lyricsTransitionSession?.origin ?? null}
            transitionPalette={lyricsTransitionSession?.palette ?? null}
            reduceEffects={reduceEffects}
            mediaRef={lyricsMediaRef}
          />
        ) : null}
      </RendererErrorBoundary>
      </div>
      {typeof document !== 'undefined' ? createPortal(playbackFeedbackLayer, document.body) : playbackFeedbackLayer}
    </>
  );
}

function createSimilarSongsSourceContext(): SourceContext {
  return {
    type: 'recommendation',
    providerId: 'netease',
    playlistTitle: '相似推荐'
  };
}

function getPlaybackFeedbackTone(message: string): 'info' | 'success' | 'warning' | 'error' {
  if (/失败|无法|不可用/.test(message)) {
    return 'error';
  }
  if (/需要|登录|授权/.test(message)) {
    return 'warning';
  }
  if (/已开始|已添加|已刷新|成功/.test(message)) {
    return 'success';
  }
  return 'info';
}

function hasSameSongIdentity(first: Song | null | undefined, second: Song | null | undefined): boolean {
  if (!first || !second) {
    return false;
  }

  return first.providerId === second.providerId
    && (first.platformSongId ?? first.id) === (second.platformSongId ?? second.id);
}

function getCurrentSongForSongOnlyActions(): Song | null {
  const state = usePlayerStore.getState();
  const currentMedia = state.currentMedia ?? state.currentSong;

  return currentMedia?.mediaType === 'program' ? null : currentMedia ?? null;
}

function createArtistDetailPlaylist(artist: ArtistDetail): Playlist {
  return {
    id: artist.id,
    providerId: artist.providerId,
    title: artist.name,
    description: artist.description,
    songIds: artist.topSongs.map((song) => song.id),
    coverTone: artist.coverTone,
    ...(artist.imageUrl ? { coverUrl: artist.imageUrl } : {}),
    ...(artist.sourceLabel ? { sourceLabel: artist.sourceLabel } : {})
  };
}

function createAlbumDetailPlaylist(album: AlbumDetail): Playlist {
  return {
    id: album.id,
    providerId: album.providerId,
    title: album.title,
    description: album.description,
    songIds: album.tracks.map((song) => song.id),
    coverTone: album.coverTone,
    ...(album.coverUrl ? { coverUrl: album.coverUrl } : {}),
    ...(album.sourceLabel ? { sourceLabel: album.sourceLabel } : {})
  };
}

function createArtistMetaItems(artist: ArtistDetail): string[] {
  return [
    artist.aliases.length > 0 ? `别名：${artist.aliases.join(' / ')}` : '',
    artist.songCount !== undefined ? `${artist.songCount} 首歌曲` : '',
    artist.albumCount !== undefined ? `${artist.albumCount} 张专辑` : ''
  ].filter(Boolean);
}

function createAlbumMetaItems(album: AlbumDetail): string[] {
  return [
    album.artistName,
    album.releaseDate ?? '',
    album.trackCount !== undefined ? `${album.trackCount} 首歌曲` : '',
    album.albumType ?? ''
  ].filter(Boolean);
}

type RecommendationState = ReturnType<typeof useDiscoveryHomeStore.getState>['recommendationsByProvider']['qq'];

type DetailAmbientSlot = 0 | 1;

interface DetailAmbientLayer {
  key: string;
  primary: string;
  secondary: string;
}

interface DetailAmbientLayerState {
  activeSlot: DetailAmbientSlot | null;
  layers: [DetailAmbientLayer | null, DetailAmbientLayer | null];
}

function getRecommendationCollectionLoading(
  view: AppView,
  recommendation: RecommendationState | null,
  homepageLoading: boolean,
  historyLoading: boolean
): boolean {
  if (view.type !== 'recommendationCollection') return false;
  if (view.collectionId === 'daily') return recommendation?.modules.daily.isLoading ?? false;
  if (view.collectionId === 'new') return recommendation?.modules.new.isLoading ?? false;
  if (view.collectionId === 'history') return historyLoading;
  return view.collectionId.startsWith('homepage:') ? homepageLoading : false;
}

function getRecommendationCollectionError(
  view: AppView,
  recommendation: RecommendationState | null,
  homepageError: string | null,
  historyError: string | null
): string | null {
  if (view.type !== 'recommendationCollection') return null;
  if (view.collectionId === 'daily') return recommendation?.modules.daily.errorMessage ?? null;
  if (view.collectionId === 'new') return recommendation?.modules.new.errorMessage ?? null;
  if (view.collectionId === 'history') return historyError;
  return view.collectionId.startsWith('homepage:') ? homepageError : null;
}

function QueuePanelErrorFallback({ presenceState }: { presenceState: 'open' | 'closed' }) {
  return (
    <aside className="queue-panel" aria-label="播放队列" data-state={presenceState}>
      <p className="playlist-detail-message" role="alert">播放队列暂不可用</p>
    </aside>
  );
}

function SimilarSongsPanelErrorFallback({ presenceState }: { presenceState: 'open' | 'closed' }) {
  return (
    <aside className="similar-songs-panel" aria-label="当前歌曲相似推荐" data-state={presenceState}>
      <p className="similar-songs-message similar-songs-message-error" role="alert">
        相似推荐暂不可用
      </p>
    </aside>
  );
}

function CatalogDetailFallback({
  detailLabel,
  isLoading,
  errorMessage,
  onRetry
}: {
  detailLabel: '歌手详情' | '专辑详情' | '推荐集合详情' | '排行榜详情';
  isLoading: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
}) {
  useAppNotificationValue({
    key: `catalog-detail:${detailLabel}`,
    message: errorMessage,
    actionLabel: '重试',
    onAction: onRetry
  });

  return (
    <section className="catalog-detail-fallback" aria-label={`${detailLabel}加载状态`}>
      {isLoading ? <p role="status">正在加载{detailLabel}</p> : null}
    </section>
  );
}

function resolveSearchProviderId(providerId: ProviderId | null, isLoggedIn: boolean): RemoteProviderId {
  return resolveRemoteProviderId(providerId, isLoggedIn);
}

function createDiscoveredPlaylistCacheKey(providerId: ProviderId, playlistId: string): string {
  return `${providerId}:${playlistId}`;
}

function resolveRemoteProviderId(providerId: ProviderId | null, isLoggedIn: boolean): RemoteProviderId {
  if (isLoggedIn && (providerId === 'netease' || providerId === 'qq')) {
    return providerId;
  }

  return DEFAULT_REMOTE_PROVIDER_ID;
}
