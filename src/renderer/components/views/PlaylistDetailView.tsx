import { useEffect, useRef, useState } from 'react';
import type { RemoteProviderId, Song } from '../../../shared/musicTypes';
import { useLibraryStore } from '../../state/libraryStore';
import { useChartsStore } from '../../state/chartsStore';
import { useArtistCatalogStore } from '../../state/artistCatalogStore';
import { usePlaylistDetailStore, toPlaylistDetail } from '../../state/playlistDetailStore';
import { useSearchStore } from '../../state/searchStore';
import { usePlaylistDiscoveryStore } from '../../state/playlistDiscoveryStore';
import { usePlayerStore } from '../../state/playerStore';
import { SongTable, type SongOrigin } from '../../components/SongTable';
import { MediaCardGrid, type MediaCardData, EmptyState } from '../../components/MediaCards';
import { SkeletonBlock, SkeletonPills, SkeletonSongRow } from '../../components/Skeleton';
import { CoverImage } from '../../components/CoverImage';
import { PlayIcon } from '../../components/icons';
import { useUiStore } from '../../state/uiStore';

export type DetailKind = 'playlist' | 'chart' | 'artist' | 'album' | 'recommendation';

const EMPTY_CHARTS: never[] = [];

interface PlaylistDetailViewProps {
  providerId: RemoteProviderId;
  playlistId?: string;
  chartId?: string;
  artistId?: string;
  albumId?: string;
  title?: string;
  kind: DetailKind;
}

export function PlaylistDetailView({ providerId, playlistId, chartId, artistId, albumId, title, kind }: PlaylistDetailViewProps) {
  const navigateToView = useUiStore((s) => s.navigateToView);

  if (kind === 'artist' && artistId) {
    return <ArtistDetail providerId={providerId} artistId={artistId} />;
  }
  if (kind === 'album' && albumId) {
    return <AlbumDetail providerId={providerId} albumId={albumId} />;
  }
  if (kind === 'chart' && chartId) {
    return <ChartDetail providerId={providerId} chartId={chartId} />;
  }
  if (kind === 'playlist' && playlistId) {
    return <PlaylistDetail providerId={providerId} playlistId={playlistId} title={title} />;
  }
  if (kind === 'recommendation' && playlistId) {
    return <RecommendationCollectionDetail providerId={providerId} collectionId={playlistId} title={title} />;
  }
  return <EmptyState title="未知内容" />;
}

function seedPlaylistFromStores(providerId: RemoteProviderId, playlistId: string) {
  // 从侧边栏“我的歌单”进入时，直接使用本地库已有的歌单元数据（含封面）作为种子
  const library = useLibraryStore.getState().providerPlaylists[providerId];
  const foundInLibrary = library?.find((p) => p.id === playlistId);
  if (foundInLibrary) {
    return {
      providerId: foundInLibrary.providerId,
      playlist: {
        id: foundInLibrary.id,
        providerId: foundInLibrary.providerId,
        title: foundInLibrary.title,
        description: foundInLibrary.description,
        songIds: foundInLibrary.songIds,
        coverTone: foundInLibrary.coverTone,
        ...(foundInLibrary.coverUrl ? { coverUrl: foundInLibrary.coverUrl } : {}),
        ...(foundInLibrary.sourceLabel ? { sourceLabel: foundInLibrary.sourceLabel } : {})
      },
      tracks: []
    };
  }
  const discovery = usePlaylistDiscoveryStore.getState().playlistsByKey;
  for (const list of Object.values(discovery)) {
    const found = list.find((p) => p.id === playlistId && p.providerId === providerId);
    if (found) return toPlaylistDetail(found);
  }
  const search = useSearchStore.getState().entityResults;
  if (search?.providerId === providerId) {
    const found = search.sections.playlists.items.find((p) => p.id === playlistId);
    if (found) return toPlaylistDetail(found);
  }
  return null;
}

function usePlaylistDetail(providerId: RemoteProviderId, playlistId: string) {
  const key = `${providerId}:${playlistId}`;
  const detail = usePlaylistDetailStore((s) => s.detailsByKey[key]);
  const status = usePlaylistDetailStore((s) => s.statusByKey[key]);
  const error = usePlaylistDetailStore((s) => s.errorByKey[key]);
  const load = usePlaylistDetailStore((s) => s.load);
  const seed = usePlaylistDetailStore((s) => s.seed);
  const libraryTracks = useLibraryStore((s) => s.playlistTracks[key]);
  const seedPlaylistTracks = useLibraryStore((s) => s.seedPlaylistTracks);

  useEffect(() => {
    const seeded = seedPlaylistFromStores(providerId, playlistId);
    if (seeded) seed(providerId, playlistId, seeded);
    load(providerId, playlistId);
  }, [providerId, playlistId, load, seed]);

  // 手机端操作歌单后切回桌面应用：窗口重新可见时强制刷新歌单详情，
  // 保证本地展示与云端一致（配合主进程 1 分钟缓存 TTL，非焦点切换也能在 1 分钟内更新）
  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        void load(providerId, playlistId, { force: true });
      }
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    window.addEventListener('focus', refreshOnVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnVisible);
      window.removeEventListener('focus', refreshOnVisible);
    };
  }, [providerId, playlistId, load]);

  // 把详情曲目同步进 libraryStore：这样“从歌单移除/添加到歌单/取消喜欢”等
  // mutation 更新 playlistTracks 后，详情页能立即响应，无需切走再刷新
  useEffect(() => {
    if (detail?.tracks?.length) {
      seedPlaylistTracks(providerId, playlistId, detail.tracks);
    }
  }, [detail, providerId, playlistId, seedPlaylistTracks]);

  const tracks = libraryTracks && libraryTracks.length > 0 ? libraryTracks : (detail?.tracks ?? []);

  return { detail, status, error, tracks };
}

function PlaylistDetail({ providerId, playlistId, title }: { providerId: RemoteProviderId; playlistId: string; title?: string }) {
  const { detail, status, error, tracks } = usePlaylistDetail(providerId, playlistId);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const ownership = useLibraryStore((s) => s.providerPlaylists[providerId]?.find((p) => p.id === playlistId)?.ownership);
  const origin: SongOrigin = { kind: 'playlist', providerId, playlistId, ownership };
  const titleText = detail?.playlist.title ?? title ?? '歌单';

  return (
    <div aria-busy={status === 'loading' || status === 'refreshing'} data-reveal data-reveal-order={0}>
      {detail ? (
        <DetailHero
          coverUrl={detail.playlist.coverUrl}
          coverTone={detail.playlist.coverTone}
          kicker={ownership === 'liked' || detail.playlist.isLiked ? '我喜欢的歌单' : '歌单'}
          title={titleText}
          desc={detail.playlist.description}
          stats={[
            ...(detail.trackCount != null ? [`${detail.trackCount} 首歌曲`] : detail.playlist.songIds.length > 0 ? [`${detail.playlist.songIds.length} 首歌曲`] : tracks.length > 0 ? [`${tracks.length} 首歌曲`] : []),
            ...(detail.creatorName ? [`创建者：${detail.creatorName}`] : []),
            ...(detail.playCount != null ? [`播放 ${detail.playCount} 次`] : [])
          ]}
          onPlayAll={tracks.length > 0 ? () => playSongsFromList(tracks, 0) : undefined}
          queueAllSongs={tracks}
        />
      ) : (
        <DetailHeroSkeleton />
      )}

      {(status === 'loading' || status === 'refreshing') && !detail && <SkeletonSongRow rows={8} />}
      {status === 'error' && !detail && <EmptyState title="歌单加载失败" desc={error ?? undefined} />}
      {(status === 'success' || status === 'success-empty') && detail && (
        <SongTable songs={tracks} origin={origin} onPlay={(song) => playSongsFromList(tracks, tracks.findIndex((s) => s.id === song.id && s.providerId === song.providerId))} />
      )}
    </div>
  );
}

function ChartDetail({ providerId, chartId }: { providerId: RemoteProviderId; chartId: string }) {
  const key = `${providerId}:${chartId}`;
  const tracks = useChartsStore((s) => s.chartTracksByKey[key]);
  const status = useChartsStore((s) => s.statusByKey[key]);
  const chartsMap = useChartsStore((s) => s.chartsByProvider);
  const charts = chartsMap[providerId] ?? EMPTY_CHARTS;
  const loadChartTracks = useChartsStore((s) => s.loadChartTracks);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);

  useEffect(() => {
    loadChartTracks(providerId, chartId);
  }, [providerId, chartId, loadChartTracks]);

  const chart = charts.find((c) => c.id === chartId);
  const origin: SongOrigin = { kind: 'chart', providerId };

  return (
    <div aria-busy={status === 'loading' || status === 'refreshing'} data-reveal data-reveal-order={0}>
      {chart ? (
        <DetailHero
          coverUrl={chart.coverUrl}
          coverTone={chart.coverTone}
          kicker="榜单"
          title={chart.title}
          desc={chart.description}
          stats={chart.updateLabel ? [`${chart.updateLabel}`] : []}
          onPlayAll={tracks && tracks.length > 0 ? () => playSongsFromList(tracks, 0) : undefined}
          queueAllSongs={tracks ?? undefined}
        />
      ) : (
        <DetailHeroSkeleton />
      )}
      {(status === 'loading' || status === 'refreshing') && !tracks && <SkeletonSongRow rows={8} />}
      {status === 'error' && !tracks && <EmptyState title="榜单加载失败" desc="加载失败，请稍后重试" />}
      {tracks && <SongTable songs={tracks} origin={origin} onPlay={(song) => playSongsFromList(tracks, tracks.findIndex((s) => s.id === song.id && s.providerId === song.providerId))} />}
    </div>
  );
}

function ArtistDetail({ providerId, artistId }: { providerId: RemoteProviderId; artistId: string }) {
  const detail = useArtistCatalogStore((s) => s.artistsByKey[`${providerId}:${artistId}`]);
  const loading = useArtistCatalogStore((s) => s.loadingArtist[`${providerId}:${artistId}`]);
  const loadingMore = useArtistCatalogStore((s) => s.loadingMoreSongs[`${providerId}:${artistId}`]);
  const error = useArtistCatalogStore((s) => s.errorArtist[`${providerId}:${artistId}`]);
  const loadArtist = useArtistCatalogStore((s) => s.loadArtist);
  const loadMoreArtistSongs = useArtistCatalogStore((s) => s.loadMoreArtistSongs);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>('songs');
  const [loadedSongs, setLoadedSongs] = useState<Song[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadArtist(providerId, artistId);
  }, [providerId, artistId, loadArtist]);

  // 详情就绪时初始化可显示歌曲列表（热门单曲），并计算是否还有更多
  useEffect(() => {
    if (detail) {
      setLoadedSongs(detail.topSongs);
      setNextOffset(detail.topSongs.length);
      setHasMore(detail.songCount != null && detail.topSongs.length < detail.songCount);
    }
  }, [detail]);

  // 滚动到底部自动加载更多单曲
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  const nextOffsetRef = useRef(nextOffset);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { nextOffsetRef.current = nextOffset; }, [nextOffset]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || activeTab !== 'songs') return;
    const container = el.closest<HTMLElement>('.main-content') ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!hasMoreRef.current || loadingMoreRef.current) return;
        loadMoreArtistSongs(providerId, artistId, nextOffsetRef.current).then((page) => {
          if (!page || page.length === 0) return;
          setLoadedSongs((prev) => {
            const seen = new Set(prev.map((s) => s.id));
            const merged = [...prev];
            for (const song of page) {
              if (!seen.has(song.id)) {
                seen.add(song.id);
                merged.push(song);
              }
            }
            return merged;
          });
          setNextOffset((offset) => offset + page.length);
        });
      },
      { root: container, rootMargin: '400px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [providerId, artistId, activeTab, loadMoreArtistSongs]);

  if (loading && !detail) return <ArtistDetailSkeleton />;
  if (!detail) return <EmptyState title="歌手信息加载失败" desc={error ?? undefined} />;

  const albumCards: MediaCardData[] = detail.albums.map((album) => ({
    id: album.id,
    title: album.title,
    subtitle: `${album.releaseDate?.slice(0, 4) ?? ''} · ${album.trackCount ?? 0} 首`,
    coverUrl: album.coverUrl,
    coverTone: album.coverTone,
    onOpen: () => navigateToView('album', { providerId, albumId: album.id, title: album.title })
  }));

  const metaLine = [detail.aliases?.join(' / '), detail.area, detail.songCount != null ? `${detail.songCount} 首单曲` : null, detail.albumCount != null ? `${detail.albumCount} 张专辑` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div data-reveal data-reveal-order={0}>
      <DetailHero
        round
        coverUrl={detail.imageUrl}
        coverTone={detail.coverTone}
        kicker="歌手"
        title={detail.name}
        desc={detail.description}
        subtitle={metaLine}
        onPlayAll={loadedSongs.length > 0 ? () => playSongsFromList(loadedSongs, 0) : undefined}
        playAllLabel="播放全部歌曲"
        queueAllSongs={loadedSongs}
      />

      {/* 用专用类而不是内联 marginTop：.filter-pills-bar 自带 -6px 上边距与
          -4px 左右负边距，内联覆盖后会与表格边缘错开 4px */}
      <div className="filter-pills-bar artist-detail-tabs">
        <div
          className={`pill-item ${activeTab === 'songs' ? 'active' : ''}`}
          onClick={() => setActiveTab('songs')}
        >
          热门单曲{detail.songCount != null ? ` (${detail.songCount})` : ''}
        </div>
        <div
          className={`pill-item ${activeTab === 'albums' ? 'active' : ''}`}
          onClick={() => setActiveTab('albums')}
        >
          所有专辑
        </div>
      </div>

      <div key={activeTab} className="tab-panel-enter">
        {activeTab === 'songs' ? (
          <div>
            <SongTable songs={loadedSongs} origin={{ kind: 'artist', providerId }} onPlay={(song) => playSongsFromList(loadedSongs, loadedSongs.findIndex((s) => s.id === song.id && s.providerId === song.providerId))} />
            {loadingMore && <SkeletonSongRow rows={4} />}
            <div ref={loadMoreRef} style={{ height: 1 }} aria-hidden="true" />
            {!hasMore && loadedSongs.length > 0 && (
              <div className="list-end-note">
                已加载全部 {loadedSongs.length} 首单曲
              </div>
            )}
          </div>
        ) : (
          <MediaCardGrid cards={albumCards} />
        )}
      </div>
    </div>
  );
}

function AlbumDetail({ providerId, albumId }: { providerId: RemoteProviderId; albumId: string }) {
  const key = `${providerId}:${albumId}`;
  const album = useArtistCatalogStore((s) => s.albumsByKey[key]);
  const loading = useArtistCatalogStore((s) => s.loadingAlbum[key]);
  const loadAlbum = useArtistCatalogStore((s) => s.loadAlbum);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);

  useEffect(() => {
    loadAlbum(providerId, albumId);
  }, [providerId, albumId, loadAlbum]);

  if (loading && !album) return <DetailHeroSkeleton />;
  if (!album) return <EmptyState title="专辑信息加载失败" />;

  return (
    <div data-reveal data-reveal-order={0}>
      <DetailHero
        coverUrl={album.coverUrl}
        coverTone={album.coverTone}
        kicker="专辑"
        title={album.title}
        desc={album.description || `${album.artistName} 的音乐专辑`}
        subtitle={album.artistName}
        stats={[
          album.releaseDate?.slice(0, 4) ? `发行于 ${album.releaseDate.slice(0, 4)}` : null,
          `${album.trackCount ?? album.tracks.length} 首歌曲`
        ].filter(Boolean) as string[]}
        onPlayAll={album.tracks.length > 0 ? () => playSongsFromList(album.tracks, 0) : undefined}
        queueAllSongs={album.tracks}
      />
      <SongTable songs={album.tracks} showAlbum={false} origin={{ kind: 'album', providerId }} onPlay={(song) => playSongsFromList(album.tracks, album.tracks.findIndex((s) => s.id === song.id && s.providerId === song.providerId))} />
    </div>
  );
}

function RecommendationCollectionDetail({ providerId, collectionId, title }: { providerId: RemoteProviderId; collectionId: string; title?: string }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [heroTitle, setHeroTitle] = useState(title ?? '推荐合集');
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const playSongsFromList = usePlayerStore((s) => s.playSongsFromList);
  const revisionRef = useRef(0);

  useEffect(() => {
    const revision = ++revisionRef.current;
    const load = async () => {
      setStatus('loading');
      setErrorMessage(null);
      try {
        if (collectionId === 'daily') {
          const result = await window.musicPlayer.music.getRecommendationHome(providerId);
          if (revision !== revisionRef.current) return;
          if (result.ok) {
            setSongs(result.data.dailySongs);
            setHeroTitle('每日推荐');
            setStatus('success');
          } else {
            setStatus('error');
            setErrorMessage(result.error.message);
          }
        } else if (collectionId === 'new') {
          const result = await window.musicPlayer.music.getRecommendationHome(providerId);
          if (revision !== revisionRef.current) return;
          if (result.ok) {
            setSongs(result.data.newSongs);
            setHeroTitle('新歌速递');
            setStatus('success');
          } else {
            setStatus('error');
            setErrorMessage(result.error.message);
          }
        } else if (collectionId === 'history') {
          const result = await window.musicPlayer.music.getRecommendationHistoryDates(providerId);
          if (revision !== revisionRef.current) return;
          if (result.ok && result.data.length > 0) {
            const history = await window.musicPlayer.music.getRecommendationHistory(providerId, result.data[0]);
            if (revision !== revisionRef.current) return;
            if (history.ok) {
              setSongs(history.data.songs);
              setHeroTitle('历史日推');
              setStatus('success');
            } else {
              setStatus('error');
              setErrorMessage(history.error.message);
            }
          } else {
            setStatus('error');
            setErrorMessage(result.ok ? '暂无历史日推记录' : result.error.message);
          }
        } else if (collectionId.startsWith('homepage:')) {
          const result = await window.musicPlayer.music.getHomepageBlocks(providerId);
          if (revision !== revisionRef.current) return;
          if (result.ok) {
            const blockId = collectionId.slice('homepage:'.length);
            const block = result.data.blocks.find((b) => b.kind === 'song' && b.id === blockId);
            if (block && block.kind === 'song') {
              setSongs(block.songs);
              setHeroTitle(block.title);
              setStatus('success');
            } else {
              setStatus('error');
              setErrorMessage('该推荐板块暂无内容');
            }
          } else {
            setStatus('error');
            setErrorMessage(result.error.message);
          }
        } else {
          setStatus('error');
          setErrorMessage('未知的推荐集合');
        }
      } catch (error) {
        if (revision !== revisionRef.current) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    };
    load();
    return () => {
      revisionRef.current += 1;
    };
  }, [providerId, collectionId]);

  return (
    <div data-reveal data-reveal-order={0}>
      {status === 'loading' ? (
        <DetailHeroSkeleton />
      ) : (
        <DetailHero
          kicker="推荐"
          title={heroTitle}
          desc="根据您的收听习惯智能生成的精选推荐"
          stats={songs && songs.length > 0 ? [`${songs.length} 首歌曲`] : []}
          onPlayAll={songs && songs.length > 0 ? () => playSongsFromList(songs, 0) : undefined}
          queueAllSongs={songs ?? undefined}
        />
      )}
      {status === 'loading' && <SkeletonSongRow rows={8} />}
      {status === 'error' && <EmptyState title="推荐集合加载失败" desc={errorMessage ?? undefined} />}
      {status === 'success' && songs && (
        <SongTable songs={songs} origin={{ kind: 'recommendation', providerId }} onPlay={(song) => playSongsFromList(songs, songs.findIndex((s) => s.id === song.id && s.providerId === song.providerId))} />
      )}
    </div>
  );
}

function ClampedText({ text, lineClamp = 2 }: { text?: string; lineClamp?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const collapsedHeight = lineClamp * 22.4 + 2;
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  // 收起时延迟恢复 WebkitLineClamp，让 max-height 过渡先走完
  const [clampEnabled, setClampEnabled] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !text) return;
    if (el.scrollHeight > el.clientHeight + 2) {
      setOverflowing(true);
    }
  }, [text, expanded]);

  useEffect(() => {
    const el = ref.current;
    if (expanded && el && fullHeight === null && el.scrollHeight > 0) {
      setFullHeight(el.scrollHeight);
    }
  }, [expanded, fullHeight]);

  if (!text) return null;

  const handleToggle = () => {
    if (expanded) {
      // 收起：先关掉 clamp，让 max-height 过渡先走完
      setClampEnabled(false);
      setExpanded(false);
    } else {
      // 展开：立即禁用 clamp，max-height 过渡飞到完整高度
      setClampEnabled(false);
      setExpanded(true);
    }
  };

  const handleTransitionEnd = () => {
    // 过渡结束后，如果处于收起状态才启用 clamp
    if (!expanded) {
      setClampEnabled(true);
    }
  };

  return (
    <>
      <p
        ref={ref}
        className="hero-desc"
        onTransitionEnd={handleTransitionEnd}
        style={{
          maxHeight: expanded ? (fullHeight ?? 320) : collapsedHeight,
          WebkitLineClamp: clampEnabled && !expanded ? lineClamp : 'none'
        }}
      >
        {text}
      </p>
      {overflowing && (
        <button
          className="hero-desc-toggle"
          onClick={handleToggle}
          aria-expanded={expanded}
        >
          {expanded ? '收起' : '展开简介'}
        </button>
      )}
    </>
  );
}

function DetailHero({
  coverUrl,
  coverTone,
  round = false,
  kicker,
  title,
  subtitle,
  desc,
  stats,
  onPlayAll,
  playAllLabel = '播放全部',
  queueAllSongs
}: {
  coverUrl?: string;
  coverTone?: string;
  round?: boolean;
  kicker?: string;
  title: string;
  subtitle?: string;
  desc?: string;
  stats?: string[];
  onPlayAll?: () => void;
  playAllLabel?: string;
  queueAllSongs?: Song[];
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  const enqueueSong = usePlayerStore((s) => s.enqueueSong);

  useEffect(() => {
    setCoverBroken(false);
  }, [coverUrl]);

  const showArt = Boolean(coverUrl) && !coverBroken;
  const canQueue = Boolean(queueAllSongs && queueAllSongs.length > 0);

  return (
    <section
      className="hero-billboard"
      data-tone-only={showArt ? undefined : 'true'}
      style={
        {
          '--hero-art': showArt ? `url("${(coverUrl ?? '').replace(/"/g, '%22')}")` : 'none',
          '--hero-tone': coverTone || 'var(--accent-gradient)'
        } as React.CSSProperties
      }
    >
      <div className="hero-backdrop" aria-hidden="true" />
      <div className="hero-scrim" aria-hidden="true" />

      <div className={`hero-cover${round ? ' hero-cover--round' : ''}`}>
        <CoverImage
          className="hero-cover-img"
          src={coverUrl}
          tone={coverTone}
          alt={title}
          size={560}
          fallbackIconSize={44}
        />
        {onPlayAll && (
          <button className="hero-play-fab" type="button" title={playAllLabel} aria-label={playAllLabel} onClick={onPlayAll}>
            <PlayIcon size={20} strokeWidth={0} filled />
          </button>
        )}
      </div>

      <div className="hero-copy">
        {kicker && <span className="hero-kicker">{kicker}</span>}
        <h1 className="hero-title">{title}</h1>
        {subtitle && <p className="hero-meta">{subtitle}</p>}
        <ClampedText text={desc} />
        {stats && stats.length > 0 && (
          <div className="hero-chips">
            {stats.map((s) => (
              <span key={s} className="stat-chip">{s}</span>
            ))}
          </div>
        )}
        {(onPlayAll || canQueue) && (
          <div className="hero-actions">
            {onPlayAll && (
              <button className="btn-primary" onClick={onPlayAll}>
                <PlayIcon size={17} strokeWidth={0} filled />
                {playAllLabel}
              </button>
            )}
            {canQueue && (
              <button
                className="btn-secondary"
                onClick={() => {
                  for (const song of queueAllSongs ?? []) {
                    enqueueSong(song, 'recommendation');
                  }
                }}
              >
                加入播放队列
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DetailHeroSkeleton() {
  return (
    <div className="detail-hero-skeleton" aria-hidden="true">
      <SkeletonBlock width={136} height={136} radius="var(--radius-xl)" />
      <div className="detail-hero-skeleton-info">
        <div className="detail-hero-skeleton-row"><SkeletonBlock width={220} height={22} radius="var(--radius-sm)" /></div>
        <div className="detail-hero-skeleton-row"><SkeletonBlock width={340} height={13} radius="var(--radius-xs)" /></div>
        <div className="detail-hero-skeleton-row"><SkeletonBlock width={132} height={32} radius="var(--radius-pill)" /></div>
      </div>
    </div>
  );
}

function ArtistDetailSkeleton() {
  return (
    <div>
      <div className="detail-hero-skeleton" aria-hidden="true">
        <SkeletonBlock width={128} height={128} radius="50%" />
        <div className="detail-hero-skeleton-info">
          <div className="detail-hero-skeleton-row"><SkeletonBlock width={190} height={22} radius="var(--radius-sm)" /></div>
          <div className="detail-hero-skeleton-row"><SkeletonBlock width={280} height={13} radius="var(--radius-xs)" /></div>
          <div className="detail-hero-skeleton-row"><SkeletonBlock width={150} height={32} radius="var(--radius-pill)" /></div>
        </div>
      </div>
      <SkeletonPills count={2} />
      <SkeletonSongRow rows={8} />
    </div>
  );
}
