import { useCallback, useEffect, useMemo } from 'react';
import type { AlbumReference, Song, SourceContext } from '../../shared/musicTypes';
import { useContinueExplorationStore } from '../state/continueExplorationStore';
import { useArtistCatalogStore } from '../state/artistCatalogStore';
import {
  resolveDiscoveryHomeProviderId,
  useDiscoveryHomeStore
} from '../state/discoveryHomeStore';
import { useFrequentArtistAlbumsStore } from '../state/frequentArtistAlbumsStore';
import { usePlayerStore } from '../state/playerStore';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';
import { selectLongTimeNoListenSongs } from '../state/longTimeNoListen';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { useReleaseCatalogStore } from '../state/releaseCatalogStore';
import { useRecommendationHistoryStore } from '../state/recommendationHistoryStore';
import { scheduleIdleTask } from '../utils/asyncScheduling';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';
import type { ContentTransitionStyle, NavigationDirection } from '../state/uiStore';
import { MainContentTransition } from './MainContentTransition';
import { ProviderPageHeader } from './ProviderPageHeader';
import { NeteaseDiscoveryHome } from './discovery/NeteaseDiscoveryHome';
import { QQDiscoveryHome } from './discovery/QQDiscoveryHome';

interface HomeViewProps {
  onPlaybackStarted?: (message: string) => void;
  onActionFeedback?: (message: string) => void;
  onOpenCollection?: (providerId: 'qq' | 'netease', collectionId: string) => void;
  onSelectAlbum?: (album: AlbumReference) => void;
  onLoginRequested?: () => void;
  transitionStyle?: ContentTransitionStyle;
  navigationDirection?: NavigationDirection;
  reduceEffects?: boolean;
}

export function HomeView({
  onPlaybackStarted,
  onActionFeedback,
  onOpenCollection,
  onSelectAlbum,
  onLoginRequested,
  transitionStyle = 'soft',
  navigationDirection = 'forward',
  reduceEffects = false
}: HomeViewProps) {
  const lastProviderId = useDiscoveryHomeStore((state) => state.lastProviderId);
  const setLastProviderId = useDiscoveryHomeStore((state) => state.setLastProviderId);
  const recommendationsByProvider = useDiscoveryHomeStore(
    (state) => state.recommendationsByProvider
  );
  const loadRecommendationHome = useDiscoveryHomeStore((state) => state.loadRecommendationHome);
  const refreshRecommendationModule = useDiscoveryHomeStore(
    (state) => state.refreshRecommendationModule
  );
  const homepageBlocks = useDiscoveryHomeStore((state) => state.homepageBlocks);
  const loadHomepageBlocks = useDiscoveryHomeStore((state) => state.loadHomepageBlocks);
  const defaultProviderId = useProviderSessionStore((state) => state.defaultProviderId);
  const providerStatuses = useProviderSessionStore((state) => state.statuses);
  const isProviderSessionHydrating = useProviderSessionStore((state) => state.isHydrating);
  const defaultProviderLoggedIn = defaultProviderId
    ? providerStatuses[defaultProviderId].loggedIn
    : false;
  const providerId = resolveDiscoveryHomeProviderId(
    lastProviderId,
    defaultProviderId,
    defaultProviderLoggedIn
  );
  const recommendations = recommendationsByProvider[providerId];
  const playSongsFromList = usePlayerStore((state) => state.playSongsFromList);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentSongId = currentSong?.id;
  const listeningHistoryEntries = useListeningHistoryStore((state) => state.entries);
  const continueExploration = useContinueExplorationStore(
    (state) => state.byProvider[providerId]
  );
  const loadContinueExploration = useContinueExplorationStore((state) => state.load);
  const releaseCatalog = useReleaseCatalogStore((state) => state.byProvider[providerId]);
  const loadReleaseCatalog = useReleaseCatalogStore((state) => state.load);
  const frequentArtistAlbums = useFrequentArtistAlbumsStore(
    (state) => state.byProvider[providerId]
  );
  const loadFrequentArtistAlbums = useFrequentArtistAlbumsStore((state) => state.load);
  const albumLoadingById = useArtistCatalogStore((state) => state.albumLoadingById);
  const loadAlbumDetail = useArtistCatalogStore((state) => state.loadAlbumDetail);
  const recommendationHistory = useRecommendationHistoryStore();
  const loadRecommendationHistory = useRecommendationHistoryStore((state) => state.load);
  const selectRecommendationHistoryDate = useRecommendationHistoryStore((state) => state.selectDate);
  const clearRecommendationHistory = useRecommendationHistoryStore((state) => state.clear);
  const dailyRecommendationStatus = recommendations.modules.daily;
  const newRecommendationStatus = recommendations.modules.new;
  const dailyRecommendationInitialLoading = !dailyRecommendationStatus.loaded
    && !dailyRecommendationStatus.errorMessage;
  const newRecommendationInitialLoading = !newRecommendationStatus.loaded
    && !newRecommendationStatus.errorMessage;
  const homepageBlocksInitialLoading = !homepageBlocks.loaded
    && !homepageBlocks.errorMessage;
  const releaseCatalogInitialLoading = !releaseCatalog.loaded
    && !releaseCatalog.errorMessage;
  const isRefreshing = dailyRecommendationStatus.isLoading
    || newRecommendationStatus.isLoading
    || releaseCatalog.isLoading
    || frequentArtistAlbums.isLoading
    || (providerId === 'netease' && (
      homepageBlocks.isLoading
      || (providerStatuses.netease.loggedIn && recommendationHistory.isLoading)
    ));
  const officialRecommendationSongs = useMemo(() => [
    ...(recommendations.feed?.dailySongs ?? []),
    ...(recommendations.feed?.newSongs ?? []),
    ...(
      providerId === 'netease'
        ? (homepageBlocks.feed?.blocks ?? []).flatMap((block) => block.kind === 'song' ? block.songs : [])
        : []
    )
  ], [homepageBlocks.feed, providerId, recommendations.feed]);
  const recommendationHistorySongs = useMemo(() => excludeSongs(
    recommendationHistory.songs,
    officialRecommendationSongs
  ), [officialRecommendationSongs, recommendationHistory.songs]);
  const excludedExplorationSongs = useMemo(() => [
    ...officialRecommendationSongs,
    ...recommendationHistorySongs
  ], [officialRecommendationSongs, recommendationHistorySongs]);
  const longTimeNoListenSongs = useMemo(() => selectLongTimeNoListenSongs(
    providerId,
    listeningHistoryEntries,
    [...excludedExplorationSongs, ...continueExploration.songs]
  ), [continueExploration.songs, excludedExplorationSongs, listeningHistoryEntries, providerId]);

  useEffect(() => {
    if (isProviderSessionHydrating) {
      return undefined;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || useProviderSessionStore.getState().isHydrating) {
        return;
      }
      void loadRecommendationHome(providerId);
    });

    return () => {
      cancelled = true;
    };
  }, [isProviderSessionHydrating, loadRecommendationHome, providerId]);

  useEffect(() => {
    if (isProviderSessionHydrating || providerId !== 'netease') {
      return undefined;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || useProviderSessionStore.getState().isHydrating) {
        return;
      }
      void loadHomepageBlocks();
    });

    return () => {
      cancelled = true;
    };
  }, [isProviderSessionHydrating, loadHomepageBlocks, providerId]);

  useEffect(() => {
    if (isProviderSessionHydrating || providerId !== 'netease') {
      return undefined;
    }
    if (!providerStatuses.netease.loggedIn) {
      clearRecommendationHistory();
      return undefined;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || useProviderSessionStore.getState().isHydrating) {
        return;
      }
      void loadRecommendationHistory();
    });

    return () => {
      cancelled = true;
    };
  }, [
    clearRecommendationHistory,
    isProviderSessionHydrating,
    loadRecommendationHistory,
    providerId,
    providerStatuses.netease.loggedIn
  ]);

  useEffect(() => {
    if (isProviderSessionHydrating) {
      return undefined;
    }

    return scheduleIdleTask(() => {
      void loadContinueExploration(providerId, excludedExplorationSongs, currentSong);
    });
  }, [
    currentSong,
    excludedExplorationSongs,
    isProviderSessionHydrating,
    listeningHistoryEntries,
    loadContinueExploration,
    providerId
  ]);

  useEffect(() => {
    if (isProviderSessionHydrating) {
      return undefined;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || useProviderSessionStore.getState().isHydrating) {
        return;
      }
      void loadReleaseCatalog(providerId);
    });

    return () => {
      cancelled = true;
    };
  }, [isProviderSessionHydrating, loadReleaseCatalog, providerId]);

  useEffect(() => {
    if (
      isProviderSessionHydrating
      || (!releaseCatalog.loaded && !releaseCatalog.errorMessage)
    ) {
      return undefined;
    }

    return scheduleIdleTask(() => {
      void loadFrequentArtistAlbums(providerId, releaseCatalog.albums);
    });
  }, [
    isProviderSessionHydrating,
    listeningHistoryEntries,
    loadFrequentArtistAlbums,
    providerId,
    releaseCatalog.albums,
    releaseCatalog.errorMessage,
    releaseCatalog.loaded
  ]);

  const refreshCurrentProvider = useCallback(async () => {
    await Promise.all([
      loadRecommendationHome(providerId, { forceRefresh: true }),
      loadReleaseCatalog(providerId, { forceRefresh: true }),
      ...(providerId === 'netease' ? [loadHomepageBlocks({ forceRefresh: true })] : []),
      ...(providerId === 'netease' && providerStatuses.netease.loggedIn
        ? [loadRecommendationHistory({ forceRefresh: true })]
        : [])
    ]);
    await loadFrequentArtistAlbums(
      providerId,
      useReleaseCatalogStore.getState().byProvider[providerId].albums,
      { forceRefresh: true }
    );
    const latestRecommendations = useDiscoveryHomeStore.getState().recommendationsByProvider[providerId].feed;
    const latestHomepageBlocks = providerId === 'netease'
      ? useDiscoveryHomeStore.getState().homepageBlocks.feed?.blocks ?? []
      : [];
    const latestHistorySongs = providerId === 'netease'
      ? useRecommendationHistoryStore.getState().songs
      : [];
    const latestExcludedSongs = [
      ...(latestRecommendations?.dailySongs ?? []),
      ...(latestRecommendations?.newSongs ?? []),
      ...latestHomepageBlocks.flatMap((block) => block.kind === 'song' ? block.songs : []),
      ...latestHistorySongs
    ];
    await loadContinueExploration(providerId, latestExcludedSongs, currentSong, { forceRefresh: true });
    onActionFeedback?.('发现音乐已刷新');
  }, [
    currentSong,
    loadFrequentArtistAlbums,
    loadHomepageBlocks,
    loadContinueExploration,
    loadRecommendationHome,
    loadRecommendationHistory,
    loadReleaseCatalog,
    onActionFeedback,
    providerId,
    providerStatuses.netease.loggedIn
  ]);

  const refreshDailyRecommendations = useCallback(async () => {
    const before = getSongListFingerprint(
      useDiscoveryHomeStore.getState().recommendationsByProvider.netease.feed?.dailySongs ?? []
    );
    await refreshRecommendationModule('netease', 'daily');
    const state = useDiscoveryHomeStore.getState().recommendationsByProvider.netease;
    if (state.modules.daily.errorMessage) {
      onActionFeedback?.('每日推荐刷新失败');
      return;
    }
    const after = getSongListFingerprint(state.feed?.dailySongs ?? []);
    onActionFeedback?.(before === after ? '每日推荐暂无变化' : '每日推荐已刷新');
  }, [onActionFeedback, refreshRecommendationModule]);

  const refreshNewRecommendations = useCallback(async () => {
    const before = getSongListFingerprint(
      useDiscoveryHomeStore.getState().recommendationsByProvider[providerId].feed?.newSongs ?? []
    );
    await refreshRecommendationModule(providerId, 'new');
    const state = useDiscoveryHomeStore.getState().recommendationsByProvider[providerId];
    if (state.modules.new.errorMessage) {
      onActionFeedback?.(`${providerId === 'qq' ? '新歌推荐' : '最新音乐'}刷新失败`);
      return;
    }
    const title = providerId === 'qq' ? '新歌推荐' : '最新音乐';
    const after = getSongListFingerprint(state.feed?.newSongs ?? []);
    onActionFeedback?.(before === after ? `${title}暂无变化` : `${title}已刷新`);
  }, [onActionFeedback, providerId, refreshRecommendationModule]);

  const playRecommendationSongs = useCallback((
    songs: readonly Song[],
    sourceTitle: string
  ) => {
    const playableSongs = [...songs];
    const sourceProviderId = playableSongs[0]?.providerId ?? providerId;
    const startedQueueItem = playSongsFromList(
      playableSongs,
      getListStartIndex(playableSongs.length, playbackMode),
      () => createRecommendationSourceContext(sourceTitle, sourceProviderId)
    );
    if (startedQueueItem) {
      onPlaybackStarted?.(`已开始播放${sourceTitle}`);
    }
  }, [onPlaybackStarted, playbackMode, playSongsFromList, providerId]);

  const playRecommendationSong = useCallback((
    song: Song,
    songs: readonly Song[],
    sourceTitle: string
  ) => {
    const playableSongs = [...songs];
    const startIndex = playableSongs.findIndex((candidate) => (
      getSongIdentity(candidate) === getSongIdentity(song)
    ));
    if (startIndex < 0) {
      return;
    }

    const startedQueueItem = playSongsFromList(
      playableSongs,
      startIndex,
      () => createRecommendationSourceContext(sourceTitle, song.providerId)
    );
    if (startedQueueItem) {
      onPlaybackStarted?.(`已开始播放${sourceTitle}`);
    }
  }, [onPlaybackStarted, playSongsFromList]);

  const playAlbum = useCallback(async (album: AlbumReference) => {
    const detail = await loadAlbumDetail(album.providerId, album.id);
    if (!detail || detail.tracks.length === 0) {
      onActionFeedback?.('这张专辑暂时无法播放');
      return;
    }
    const startedQueueItem = playSongsFromList(
      detail.tracks,
      getListStartIndex(detail.tracks.length, playbackMode),
      (song) => song.sourceContext ?? {
        type: 'album',
        providerId: album.providerId,
        albumId: album.id,
        albumTitle: album.title
      }
    );
    if (startedQueueItem) {
      onPlaybackStarted?.(`已开始播放${album.title}`);
    }
  }, [loadAlbumDetail, onActionFeedback, onPlaybackStarted, playbackMode, playSongsFromList]);

  const refreshHistory = useCallback(() => {
    void loadRecommendationHistory({ forceRefresh: true });
  }, [loadRecommendationHistory]);

  useAppNotificationValue({
    key: 'discovery:netease:login',
    message: providerId === 'netease'
      && !isProviderSessionHydrating
      && !providerStatuses.netease.loggedIn
      && !dailyRecommendationStatus.isLoading
      && !dailyRecommendationStatus.errorMessage
      && recommendations.feed?.loggedIn === false
      ? '登录网易云音乐后获取每日推荐歌曲'
      : null,
    tone: 'warning',
    actionLabel: '登录',
    onAction: onLoginRequested
  });

  return (
    <section className="home-view discovery-home" data-provider={providerId} aria-label="发现音乐">
      <ProviderPageHeader
        title="发现音乐"
        providerId={providerId}
        sourceAriaLabel="发现音乐来源"
        isRefreshing={isRefreshing}
        className="discovery-home-header"
        onProviderChange={setLastProviderId}
        onRefresh={() => void refreshCurrentProvider()}
      />
      <MainContentTransition
        transitionKey={`discovery-home:${providerId}`}
        motionKey={`discovery-home:${providerId}`}
        scope="section"
        style={transitionStyle}
        direction={navigationDirection}
        reduceEffects={reduceEffects}
      >
        {providerId === 'qq' ? (
          <QQDiscoveryHome
            nickname={providerStatuses.qq.nickname}
            isLoggedIn={providerStatuses.qq.loggedIn}
            recommendationFeed={recommendations.feed}
            currentSongId={currentSongId}
            recommendationStatus={{
              isLoading: newRecommendationStatus.isLoading || newRecommendationInitialLoading,
              errorMessage: newRecommendationStatus.errorMessage
            }}
            continueSongs={continueExploration.songs}
            continueStatus={{
              isLoading: continueExploration.isLoading,
              errorMessage: continueExploration.errorMessage
            }}
            longTimeNoListenSongs={longTimeNoListenSongs}
            newAlbums={releaseCatalog.albums}
            releaseStatus={{
              isLoading: releaseCatalog.isLoading || releaseCatalogInitialLoading,
              errorMessage: releaseCatalog.errorMessage
            }}
            frequentArtistAlbums={frequentArtistAlbums.albums}
            frequentArtistAlbumsStatus={{
              isLoading: frequentArtistAlbums.isLoading,
              errorMessage: null
            }}
            onPlaySongs={playRecommendationSongs}
            onPlaySong={playRecommendationSong}
            onOpenCollection={(collectionId) => onOpenCollection?.('qq', collectionId)}
            onSelectAlbum={onSelectAlbum}
            onPlayAlbum={(album) => void playAlbum(album)}
            albumLoadingById={albumLoadingById}
          />
        ) : (
          <NeteaseDiscoveryHome
            recommendationFeed={recommendations.feed}
            homepageBlockFeed={homepageBlocks.feed}
            recommendationHistoryDates={recommendationHistory.dates}
            recommendationHistoryDate={recommendationHistory.activeDate}
            recommendationHistorySongs={recommendationHistorySongs}
            currentSongId={currentSongId}
            dailyStatus={{
              isLoading: dailyRecommendationStatus.isLoading || dailyRecommendationInitialLoading,
              errorMessage: dailyRecommendationStatus.errorMessage
            }}
            newStatus={{
              isLoading: newRecommendationStatus.isLoading || newRecommendationInitialLoading,
              errorMessage: newRecommendationStatus.errorMessage
            }}
            homepageBlockStatus={{
              isLoading: homepageBlocks.isLoading || homepageBlocksInitialLoading,
              errorMessage: homepageBlocks.errorMessage
            }}
            recommendationHistoryStatus={{
              isLoading: recommendationHistory.isLoading || (
                providerStatuses.netease.loggedIn
                && !recommendationHistory.loaded
                && !recommendationHistory.errorMessage
              ),
              errorMessage: recommendationHistory.errorMessage
            }}
            continueSongs={continueExploration.songs}
            continueStatus={{
              isLoading: continueExploration.isLoading,
              errorMessage: continueExploration.errorMessage
            }}
            longTimeNoListenSongs={longTimeNoListenSongs}
            newAlbums={releaseCatalog.albums}
            releaseStatus={{
              isLoading: releaseCatalog.isLoading || releaseCatalogInitialLoading,
              errorMessage: releaseCatalog.errorMessage
            }}
            frequentArtistAlbums={frequentArtistAlbums.albums}
            frequentArtistAlbumsStatus={{
              isLoading: frequentArtistAlbums.isLoading,
              errorMessage: null
            }}
            onPlaySongs={playRecommendationSongs}
            onPlaySong={playRecommendationSong}
            onOpenCollection={(collectionId) => onOpenCollection?.('netease', collectionId)}
            onSelectAlbum={onSelectAlbum}
            onPlayAlbum={(album) => void playAlbum(album)}
            albumLoadingById={albumLoadingById}
            onRefreshDaily={refreshDailyRecommendations}
            onRefreshNew={refreshNewRecommendations}
            onRefreshHistory={refreshHistory}
            onSelectHistoryDate={(date) => void selectRecommendationHistoryDate(date)}
          />
        )}
      </MainContentTransition>
    </section>
  );
}

function createRecommendationSourceContext(
  sourceTitle: string,
  providerId: Song['providerId']
): SourceContext {
  return {
    type: 'recommendation',
    providerId,
    playlistTitle: sourceTitle
  };
}

function getSongIdentity(song: Song): string {
  return `${song.providerId}:${song.platformSongId ?? song.id}`;
}

function excludeSongs(songs: readonly Song[], excludedSongs: readonly Song[]): Song[] {
  const excluded = new Set(excludedSongs.map(getSongIdentity));
  const seen = new Set<string>();
  return songs.filter((song) => {
    const identity = getSongIdentity(song);
    if (excluded.has(identity) || seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function getListStartIndex(itemCount: number, playbackMode: string): number {
  if (itemCount <= 0 || playbackMode !== 'shuffle') {
    return 0;
  }
  return Math.min(itemCount - 1, Math.floor(Math.random() * itemCount));
}

function getSongListFingerprint(songs: readonly Song[]): string {
  return songs.map(getSongIdentity).join('|');
}
