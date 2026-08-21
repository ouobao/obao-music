import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { RemoteProviderId, Song, ChartSummary, DiscoveredPlaylist, ArtistSummary } from '../../../shared/musicTypes';
import type { SearchHotSearch } from '../../../shared/providerTypes';
import { useHomeFeedStore } from '../../state/homeFeedStore';
import { useHomeExtraStore } from '../../state/homeExtraStore';
import { useDiscoveryFeedStore, type AlbumRow } from '../../state/discoveryFeedStore';
import { useRecommendationHistoryStore } from '../../state/recommendationHistoryStore';
import { useProviderSessionStore } from '../../state/providerSessionStore';
import { usePlayerStore } from '../../state/playerStore';
import { useChartsStore } from '../../state/chartsStore';
import { useArtistCatalogStore } from '../../state/artistCatalogStore';
import { SectionHeader, MediaCardGrid, type MediaCardData, EmptyState } from '../../components/MediaCards';
import { SongTable } from '../../components/SongTable';
import { SkeletonCardGrid, SkeletonPills, SkeletonSongRow, SkeletonBlock } from '../../components/Skeleton';
import { formatDateLabel } from '../../utils/format';
import { chartUpdateLabel } from '../../utils/providerDisplay';
import { useUiStore } from '../../state/uiStore';
import { PlayBadgeIcon, SimilarIcon } from '../../components/icons';
import { onImageReveal, imageRevealRef } from '../../utils/imageReveal';

const EMPTY_ARRAY: Song[] = [];
const EMPTY_ALBUM_ARRAY: AlbumRow[] = [];
const EMPTY_SEARCHES: SearchHotSearch[] = [];
const EMPTY_PLAYLISTS: DiscoveredPlaylist[] = [];
const EMPTY_ARTISTS: ArtistSummary[] = [];

interface HomeViewProps {
  providerId: RemoteProviderId;
}

export function HomeView({ providerId }: HomeViewProps) {
  const feed = useHomeFeedStore((s) => s.feedByProvider[providerId]);
  const feedStatus = useHomeFeedStore((s) => s.statusByProvider[providerId]);
  const loading = useHomeFeedStore((s) => s.loadingByProvider[providerId]);
  const loadFeed = useHomeFeedStore((s) => s.load);
  const refreshFeed = useHomeFeedStore((s) => s.refresh);
  const loadAllDiscovery = useDiscoveryFeedStore((s) => s.loadAll);
  const refreshAllDiscovery = useDiscoveryFeedStore((s) => s.refreshAll);
  const discoveryLoading = useDiscoveryFeedStore((s) => s.loading[providerId]);
  const continueExploringMap = useDiscoveryFeedStore((s) => s.continueExploringByProvider);
  const notListenedMap = useDiscoveryFeedStore((s) => s.notListenedByProvider);
  const newAlbumsMap = useDiscoveryFeedStore((s) => s.newAlbumsByProvider);
  const frequentAlbumsMap = useDiscoveryFeedStore((s) => s.frequentAlbumsByProvider);
  const homepageSongsMap = useDiscoveryFeedStore((s) => s.homepageSongsByProvider);
  const moduleStatus = useDiscoveryFeedStore((s) => s.statusByModule);
  const chartsLoading = useChartsStore((s) => s.isLoadingByProvider[providerId]);
  const loadCharts = useChartsStore((s) => s.loadCharts);
  const chartsMap = useChartsStore((s) => s.chartsByProvider);
  const charts = chartsMap[providerId] ?? EMPTY_ARRAY;
  const navigateToView = useUiStore((s) => s.navigateToView);
  const nickname = useProviderSessionStore((s) => s.statuses[providerId]?.nickname);

  const extraHotSearches = useHomeExtraStore((s) => s.hotSearchesByProvider[providerId]) ?? EMPTY_SEARCHES;
  const extraPlaylists = useHomeExtraStore((s) => s.featuredPlaylistsByProvider[providerId]) ?? EMPTY_PLAYLISTS;
  const extraArtists = useHomeExtraStore((s) => s.recommendedArtistsByProvider[providerId]) ?? EMPTY_ARTISTS;
  const extraRadioSongs = useHomeExtraStore((s) => s.radioSongsByProvider[providerId]) ?? EMPTY_ARRAY;
  const extraStatus = useHomeExtraStore((s) => s.statusByModule);
  const extraLoading = useHomeExtraStore((s) => s.loading[providerId]);
  const loadExtraAll = useHomeExtraStore((s) => s.loadAll);
  const refreshExtraAll = useHomeExtraStore((s) => s.refreshAll);

  const continueExploring = continueExploringMap[providerId] ?? EMPTY_ARRAY;
  const notListened = notListenedMap[providerId] ?? EMPTY_ARRAY;
  const newAlbums = newAlbumsMap[providerId] ?? EMPTY_ALBUM_ARRAY;
  const frequentAlbums = frequentAlbumsMap[providerId] ?? EMPTY_ALBUM_ARRAY;
  const homepageSongs = homepageSongsMap[providerId] ?? EMPTY_ARRAY;

  useEffect(() => {
    loadFeed(providerId);
    loadAllDiscovery(providerId);
    loadCharts(providerId);
    loadExtraAll(providerId);
  }, [providerId, loadFeed, loadAllDiscovery, loadCharts, loadExtraAll]);

  const homeSongs = useMemo(() => {
    const seen = new Set<string>();
    const result: Song[] = [];
    for (const song of [...(feed?.dailySongs ?? []), ...(feed?.newSongs ?? []), ...continueExploring, ...notListened]) {
      if (!seen.has(song.id)) {
        seen.add(song.id);
        result.push(song);
      }
    }
    return result;
  }, [feed, continueExploring, notListened, providerId, feedStatus]);

  const allSettled = !loading && !discoveryLoading && !chartsLoading && !extraLoading;
  const feedError = useHomeFeedStore((s) => s.errorByProvider[providerId]);
  const moduleError = useDiscoveryFeedStore((s) => s.statusByModule[`${providerId}:all`]) === 'error'
    || useDiscoveryFeedStore((s) => s.statusByModule[`${providerId}:new-albums`]) === 'error'
    || useDiscoveryFeedStore((s) => s.statusByModule[`${providerId}:continue-exploring`]) === 'error';

  const showErrorBanner = allSettled && homeSongs.length === 0 && Boolean(feedError || moduleError);

  return (
    <div className="home-page" aria-busy={Boolean(loading || discoveryLoading || chartsLoading || extraLoading)}>
      <div className="section-header" data-reveal data-reveal-order={0}>
        <div className="section-title-group">
          <h1 className="section-main-title">
            {nickname ? `${nickname}，` : ''}推荐
          </h1>
          <span className="section-sub-title">
            {providerId === 'netease' ? '网易云音乐' : 'QQ 音乐'}
          </span>
        </div>
      </div>

      {providerId === 'netease' && <HistoryDailySection />}

      {showErrorBanner && (
        <div className="home-error-banner" data-reveal data-reveal-order={1}>
          <span className="home-error-banner-text">
            {feedError ? `推荐内容加载失败：${feedError}` : '部分推荐内容加载失败'}
          </span>
          <button
            className="section-action-btn"
            onClick={() => {
              refreshFeed(providerId);
              refreshAllDiscovery(providerId);
              refreshExtraAll(providerId);
            }}
          >
            重试
          </button>
        </div>
      )}

      {allSettled && homeSongs.length === 0 && (
        <div className="empty-state" style={{ padding: '28px 0', marginBottom: 12 }} data-reveal data-reveal-order={1}>
          <div className="empty-state-title">暂无推荐内容</div>
          <div className="empty-state-desc">
            {feedError || moduleError
              ? '推荐内容请求失败了，请检查网络或稍后重试'
              : '请先在右上角登录音乐平台账号，或开始播放歌曲，稍后会自动为您生成个性化推荐'}
          </div>
          <button className="btn-secondary-action" onClick={() => { refreshFeed(providerId); refreshAllDiscovery(providerId); refreshExtraAll(providerId); }}>
            刷新推荐
          </button>
        </div>
      )}

      <div className="home-section" data-reveal data-reveal-order={2}>
        {feedStatus === 'loading' && !feed && <SkeletonSongRow rows={4} />}
        {feed && feed.dailySongs.length > 0 && (
          <>
            <SectionHeader title="每日推荐" subtitle="根据您的口味量身定制" />
            <SongTable songs={feed.dailySongs} origin={{ kind: 'home', providerId }} />
          </>
        )}
      </div>

      <div className="home-section" data-reveal data-reveal-order={3}>
        {feedStatus === 'loading' && !feed && <SkeletonSongRow rows={8} />}
        {feed && feed.newSongs.length > 0 && (
          <>
            <SectionHeader
              title="新歌速递"
              subtitle="今日最新上线"
              action={<>播放全部</>}
              onAction={() => usePlayerStore.getState().playSongsFromList(feed.newSongs, 0)}
            />
            <SongTable songs={feed.newSongs.slice(0, 8)} origin={{ kind: 'home', providerId }} />
          </>
        )}
      </div>

      <div className="home-section" data-reveal data-reveal-order={4}>
        {moduleStatus[`${providerId}:homepage`] === 'loading' && homepageSongs.length === 0 && <SkeletonSongRow rows={8} />}
        {providerId === 'netease' && homepageSongs.length > 0 && (
          <>
            <SectionHeader
              title="多元旋律之旅"
              subtitle="网易云音乐编辑精选"
              action={<>播放全部</>}
              onAction={() => usePlayerStore.getState().playSongsFromList(homepageSongs, 0)}
            />
            <SongTable songs={homepageSongs} origin={{ kind: 'home', providerId }} />
          </>
        )}
      </div>

      <div className="home-section" data-reveal data-reveal-order={5}>
        {moduleStatus[`${providerId}:continue-exploring`] === 'loading' && continueExploring.length === 0 && <SkeletonSongRow rows={12} />}
        {continueExploring.length > 0 && (
          <>
            <SectionHeader
              title="继续探索"
              subtitle="基于您的听歌偏好推荐"
              action={<>播放全部</>}
              onAction={() => usePlayerStore.getState().playSongsFromList(continueExploring, 0)}
            />
            <SongTable songs={continueExploring} origin={{ kind: 'home', providerId }} />
          </>
        )}
      </div>

      <div className="home-section" data-reveal data-reveal-order={6}>
        {moduleStatus[`${providerId}:not-listened`] === 'loading' && notListened.length === 0 && <SkeletonSongRow rows={12} />}
        {notListened.length > 0 && (
          <>
            <SectionHeader
              title="久未收听"
              subtitle="30 天以上未听的歌曲"
              action={<>播放全部</>}
              onAction={() => usePlayerStore.getState().playSongsFromList(notListened, 0)}
            />
            <SongTable songs={notListened} origin={{ kind: 'home', providerId }} />
          </>
        )}
      </div>

      <div className="home-section" data-reveal data-reveal-order={7}>
        {moduleStatus[`${providerId}:new-albums`] === 'loading' && newAlbums.length === 0 && <SkeletonCardGrid count={6} />}
        <AlbumSection
          title="新碟速递"
          albums={newAlbums}
          providerId={providerId}
          onOpenAlbum={(album) => navigateToView('album', { providerId, albumId: album.id, title: album.title })}
        />
      </div>

      <div className="home-section" data-reveal data-reveal-order={8}>
        {moduleStatus[`${providerId}:frequent-albums`] === 'loading' && frequentAlbums.length === 0 && <SkeletonCardGrid count={4} />}
        <AlbumSection
          title="常听歌手新专辑"
          albums={frequentAlbums}
          providerId={providerId}
          onOpenAlbum={(album) => navigateToView('album', { providerId, albumId: album.id, title: album.title })}
        />
      </div>

      <SmartRadioSection
        providerId={providerId}
        radioSongs={extraRadioSongs}
        status={extraStatus[`${providerId}:radio-songs`]}
      />

      <HotSearchesSection
        providerId={providerId}
        searches={extraHotSearches}
        status={extraStatus[`${providerId}:hot-searches`]}
      />

      <FeaturedPlaylistsSection
        providerId={providerId}
        playlists={extraPlaylists}
        status={extraStatus[`${providerId}:featured-playlists`]}
      />

      <ChartPreviewSection
        providerId={providerId}
        charts={charts}
      />

      <RecommendedArtistsSection
        providerId={providerId}
        artists={extraArtists}
        status={extraStatus[`${providerId}:recommended-artists`]}
      />
    </div>
  );
}

function HistoryDailySection() {
  const dates = useRecommendationHistoryStore((s) => s.dates);
  const activeDate = useRecommendationHistoryStore((s) => s.activeDate);
  const songs = useRecommendationHistoryStore((s) => s.songs);
  const isLoading = useRecommendationHistoryStore((s) => s.isLoading);
  const isLoadingDates = useRecommendationHistoryStore((s) => s.isLoadingDates);
  const loadDates = useRecommendationHistoryStore((s) => s.loadDates);
  const loadSongs = useRecommendationHistoryStore((s) => s.loadSongs);

  useEffect(() => {
    loadDates('netease');
  }, [loadDates]);

  const showSkeleton = isLoadingDates || (isLoading && dates.length === 0);
  if (showSkeleton) {
    return (
      <div className="home-section">
        <SkeletonPills count={7} />
        <SkeletonSongRow rows={3} />
      </div>
    );
  }
  if (dates.length === 0) return null;

  return (
    <div className="home-section" data-reveal data-reveal-order={1}>
      <SectionHeader title="历史日推" subtitle="往日推荐回顾" />
      <div className="filter-pills-bar">
        {dates.map((date) => (
          <div
            key={date}
            className={`pill-item ${activeDate === date ? 'active' : ''}`}
            style={activeDate === date ? { background: 'var(--btn-solid-bg)', color: 'var(--btn-solid-text)', fontWeight: 600 } : undefined}
            onClick={() => loadSongs('netease', date)}
          >
            {formatDateLabel(date)}
          </div>
        ))}
      </div>
      {isLoading ? <SkeletonSongRow rows={3} /> : songs.length > 0 && <SongTable songs={toSongs(songs)} origin={{ kind: 'home', providerId: 'netease' }} />}
    </div>
  );
}

function SmartRadioSection({ providerId, radioSongs, status }: { providerId: RemoteProviderId; radioSongs: Song[]; status: string | undefined }) {
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);

  if (status === 'loading' || status === 'refreshing') {
    return (
      <div className="home-section" data-reveal data-reveal-order={9}>
        <SectionHeader title="智能电台" subtitle="基于您的口味自动生成" />
        <div className="smart-radio-card">
          <SkeletonBlock height={140} radius="var(--radius-xl)" />
        </div>
      </div>
    );
  }
  if (radioSongs.length === 0) return null;

  const shuffled = [...radioSongs].sort(() => Math.random() - 0.5);

  return (
    <div className="home-section" data-reveal data-reveal-order={9}>
      <SectionHeader
        title="智能电台"
        subtitle="根据您的听歌偏好自动生成"
        action={<>播放全部</>}
        onAction={() => playSongsFromList(shuffled, 0)}
      />
      <div className="smart-radio-card">
        <div className="smart-radio-bg" />
        <div className="smart-radio-content">
          <div className="smart-radio-icon">
            <SimilarIcon size={24} strokeWidth={1.5} />
          </div>
          <div className="smart-radio-info">
            <div className="smart-radio-title">为你推荐 · 智能电台</div>
            <div className="smart-radio-desc">共 {radioSongs.length} 首歌曲，基于您的听歌历史生成</div>
          </div>
          <button
            className="smart-radio-play-btn"
            onClick={() => playSongsFromList(shuffled, 0)}
          >
            <PlayBadgeIcon size={18} strokeWidth={2} filled />
            开始播放
          </button>
        </div>
      </div>
      <SongTable songs={radioSongs.slice(0, 6)} origin={{ kind: 'home', providerId }} />
    </div>
  );
}

function HotSearchesSection({ providerId, searches, status }: { providerId: RemoteProviderId; searches: SearchHotSearch[]; status: string | undefined }) {
  const navigateToView = useUiStore((s) => s.navigateToView);

  if (status === 'loading' || status === 'refreshing') {
    return (
      <div className="home-section" data-reveal data-reveal-order={10}>
        <SectionHeader title="热搜榜" subtitle="平台热门搜索" />
        <SkeletonPills count={12} />
      </div>
    );
  }
  if (searches.length === 0) return null;

  return (
    <div className="home-section" data-reveal data-reveal-order={10}>
      <SectionHeader
        title="热搜榜"
        subtitle="平台热门搜索"
        action={<>查看全部</>}
        onAction={() => navigateToView('search', { providerId, keyword: searches[0]?.keyword ?? '' })}
      />
      <div className="hot-searches-row">
        {searches.slice(0, 20).map((item, index) => (
          <div
            key={item.id}
            className={`hot-search-item ${index < 3 ? 'hot-search-top' : ''}`}
            style={{ '--i': Math.min(index, 10) } as CSSProperties}
            onClick={() => navigateToView('search', { keyword: item.keyword })}
            title={item.keyword}
          >
            <span className={`hot-search-rank ${index < 3 ? 'hot-search-rank-top' : ''}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="hot-search-keyword">{item.keyword}</span>
            {index < 3 && <span className="hot-search-badge">热</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedPlaylistsSection({ providerId, playlists, status }: { providerId: RemoteProviderId; playlists: DiscoveredPlaylist[]; status: string | undefined }) {
  const navigateToView = useUiStore((s) => s.navigateToView);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);

  if (status === 'loading' || status === 'refreshing') {
    return (
      <div className="home-section" data-reveal data-reveal-order={11}>
        <SectionHeader title="推荐歌单" subtitle="精选热门歌单" />
        <SkeletonCardGrid count={6} />
      </div>
    );
  }
  if (playlists.length === 0) return null;

  const cards: MediaCardData[] = playlists.slice(0, 12).map((pl) => ({
    id: pl.id,
    title: pl.title,
    subtitle: pl.creatorName ?? pl.sourceLabel ?? '',
    coverUrl: pl.coverUrl,
    coverTone: pl.coverTone,
    playCount: pl.playCount,
    badge: pl.trackCount ? `${pl.trackCount} 首` : undefined,
    onOpen: () => navigateToView('playlist', { providerId, playlistId: pl.id, title: pl.title }),
    onPlay: () => {
      window.musicPlayer.music.getPlaylistTracks(providerId, pl.id).then((result) => {
        if (result.ok && result.data.length > 0) {
          playSongsFromList(result.data, 0);
        }
      });
    }
  }));

  return (
    <div className="home-section" data-reveal data-reveal-order={11}>
      <SectionHeader
        title="推荐歌单"
        subtitle="精选热门歌单"
        action={<>查看更多</>}
        onAction={() => navigateToView('playlistDiscovery', { providerId })}
      />
      <MediaCardGrid cards={cards} />
    </div>
  );
}

function ChartPreviewSection({ providerId, charts }: { providerId: RemoteProviderId; charts: ChartSummary[] }) {
  const navigateToView = useUiStore((s) => s.navigateToView);

  if (charts.length === 0) return null;

  const preview = charts.slice(0, 4);

  return (
    <div className="home-section" data-reveal data-reveal-order={12}>
      <SectionHeader
        title="热门排行榜"
        subtitle="平台官方榜单"
        action={<>查看更多</>}
        onAction={() => navigateToView('charts', { providerId })}
      />
      <div className="chart-preview-grid">
        {preview.map((chart, index) => (
          <div
            key={chart.id}
            className="chart-preview-card"
            style={{ '--i': Math.min(index, 10) } as CSSProperties}
            onClick={() => navigateToView('chart', { providerId, chartId: chart.id, title: chart.title })}
          >
            <div className="chart-preview-cover">
              {chart.coverUrl ? (
                <img src={chart.coverUrl} alt={chart.title} className="chart-preview-img" loading="lazy" ref={imageRevealRef} onLoad={onImageReveal} onError={onImageReveal} />
              ) : (
                <div className="chart-preview-img" style={{ background: chart.coverTone || 'var(--bg-card)' }} />
              )}
              <div className="chart-preview-overlay">
                <PlayBadgeIcon size={20} strokeWidth={2} filled />
              </div>
            </div>
            <div className="chart-preview-info">
              <div className="chart-preview-name">{chart.title}</div>
              <div className="chart-preview-update">{chart.updateLabel || chartUpdateLabel(chart.updatedAt) || ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendedArtistsSection({ providerId, artists, status }: { providerId: RemoteProviderId; artists: ArtistSummary[]; status: string | undefined }) {
  const navigateToView = useUiStore((s) => s.navigateToView);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const loadArtist = useArtistCatalogStore((s) => s.loadArtist);

  if (status === 'loading' || status === 'refreshing') {
    return (
      <div className="home-section" data-reveal data-reveal-order={13}>
        <SectionHeader title="常听歌手" subtitle="根据您的播放记录推荐" />
        <SkeletonCardGrid count={4} minColWidth={160} />
      </div>
    );
  }
  if (artists.length === 0) return null;

  const cards: MediaCardData[] = artists.map((artist) => ({
    id: artist.id,
    title: artist.name,
    subtitle: artist.aliases?.join(' / ') ?? artist.sourceLabel ?? (artist.albumCount ? `${artist.albumCount} 张专辑` : ''),
    coverUrl: artist.imageUrl,
    coverTone: artist.coverTone,
    onOpen: () => navigateToView('artist', { providerId, artistId: artist.id, title: artist.name }),
    onPlay: async () => {
      const detail = await loadArtist(providerId, artist.id);
      if (detail && detail.topSongs.length > 0) {
        playSongsFromList(detail.topSongs, 0);
      }
    }
  }));

  return (
    <div className="home-section" data-reveal data-reveal-order={13}>
      <SectionHeader title="常听歌手" subtitle="根据您的播放记录推荐" />
      <MediaCardGrid cards={cards} />
    </div>
  );
}

function toSongs(rows: { id: string; title: string; artist: string; album: string; durationMs: number; coverTone: string; coverUrl?: string; providerId: RemoteProviderId }[]): Song[] {
  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    title: r.title,
    artist: r.artist,
    album: r.album,
    durationMs: r.durationMs,
    coverTone: r.coverTone,
    coverUrl: r.coverUrl
  }));
}

function AlbumSection({ title, albums, providerId, onOpenAlbum }: { title: string; albums: AlbumRow[]; providerId: RemoteProviderId; onOpenAlbum: (album: AlbumRow) => void }) {
  const loadAlbum = useArtistCatalogStore((s) => s.loadAlbum);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  if (albums.length === 0) return null;

  const cards: MediaCardData[] = albums.map((album) => ({
    id: album.id,
    title: album.title,
    subtitle: album.artistName,
    coverUrl: album.coverUrl,
    coverTone: album.coverTone,
    badge: album.trackCount ? `${album.trackCount} 首` : undefined,
    onOpen: () => onOpenAlbum(album),
    onPlay: () => {
      loadAlbum(providerId, album.id).then((detail) => {
        if (detail && detail.tracks.length > 0) {
          playSongsFromList(detail.tracks, 0);
        }
      });
    }
  }));
  return (
    <>
      <SectionHeader title={title} />
      <MediaCardGrid cards={cards} />
    </>
  );
}