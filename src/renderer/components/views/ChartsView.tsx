import { useEffect } from 'react';
import type { ProviderId } from '../../../shared/musicTypes';
import { useChartsStore } from '../../state/chartsStore';
import { useProviderSessionStore } from '../../state/providerSessionStore';
import { MediaCardGrid, type MediaCardData, EmptyState } from '../../components/MediaCards';
import { SkeletonCardGrid } from '../../components/Skeleton';
import { chartUpdateLabel } from '../../utils/providerDisplay';
import { useUiStore } from '../../state/uiStore';

const EMPTY_ARRAY: never[] = [];

export function ChartsView() {
  const providerId = useProviderSessionStore((s) => s.activeProviderId) as ProviderId;
  const chartsMap = useChartsStore((s) => s.chartsByProvider);
  const charts = chartsMap[providerId] ?? EMPTY_ARRAY;
  const isLoading = useChartsStore((s) => s.isLoadingByProvider[providerId]);
  const error = useChartsStore((s) => s.errorByProvider[providerId]);
  const loadCharts = useChartsStore((s) => s.loadCharts);
  const navigateToView = useUiStore((s) => s.navigateToView);

  useEffect(() => {
    if (providerId !== 'local') {
      loadCharts(providerId as 'netease' | 'qq');
    }
  }, [providerId, loadCharts]);

  if (providerId === 'local') {
    return <div className="empty-state">本地音乐不支持排行榜</div>;
  }

  const remoteProviderId = providerId as 'netease' | 'qq';

  const cards: MediaCardData[] = charts.map((chart) => ({
    id: chart.id,
    title: chart.title,
    subtitle: chart.description || chartUpdateLabel(chart.updatedAt),
    coverUrl: chart.coverUrl,
    coverTone: chart.coverTone,
    badge: chart.updateLabel || chartUpdateLabel(chart.updatedAt) || undefined,
    onOpen: () => navigateToView('chart', { providerId: remoteProviderId, chartId: chart.id, title: chart.title }),
    onPlay: () => navigateToView('chart', { providerId: remoteProviderId, chartId: chart.id, title: chart.title })
  }));

  let content;
  if (isLoading && charts.length === 0) {
    content = <SkeletonCardGrid count={6} />;
  } else if (charts.length > 0) {
    content = (
      <>
        {isLoading && <div className="inline-progress" aria-hidden="true" />}
        <MediaCardGrid cards={cards} />
      </>
    );
  } else if (!isLoading && error) {
    content = (
      <EmptyState
        title="排行榜加载失败"
        desc={error}
        actionLabel="重试"
        onAction={() => loadCharts(remoteProviderId)}
      />
    );
  } else if (!isLoading && !error) {
    content = <EmptyState title="暂无排行榜数据" />;
  } else {
    content = <SkeletonCardGrid count={6} />;
  }

  return (
    <div className="charts-view" aria-busy={Boolean(isLoading)} data-reveal data-reveal-order={0}>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div className="section-title-group">
          <h1 className="detail-title" style={{ fontSize: 22 }}>官方排行榜</h1>
          <span className="section-sub-title">权威呈现平台热度趋势</span>
        </div>
      </div>
      {content}
    </div>
  );
}
