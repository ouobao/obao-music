import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { ProviderId } from '../../../shared/musicTypes';
import { useChartsStore } from '../../state/chartsStore';
import { useProviderSessionStore } from '../../state/providerSessionStore';
import { EmptyState } from '../../components/MediaCards';
import { SkeletonCardGrid } from '../../components/Skeleton';
import { CoverImage } from '../../components/CoverImage';
import { chartUpdateLabel } from '../../utils/providerDisplay';
import { useUiStore } from '../../state/uiStore';
import { PlayBadgeIcon } from '../../components/icons';

const EMPTY_ARRAY: never[] = [];

/**
 * 排行榜：海报式卡片墙。
 * 每张榜单纯粹以"封面 + 底部渐变压暗 + 榜名"呈现，
 * 左上角是更新标记，hover 浮出渐变播放钮 —— 一眼即是"榜单"而非普通歌单。
 */
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

  let content;
  if (isLoading && charts.length === 0) {
    content = <SkeletonCardGrid count={6} minColWidth={230} />;
  } else if (charts.length > 0) {
    content = (
      <>
        {isLoading && <div className="inline-progress" aria-hidden="true" />}
        <div className="chart-grid">
          {charts.map((chart, index) => {
            const meta = chart.updateLabel || chartUpdateLabel(chart.updatedAt);
            const open = () => navigateToView('chart', { providerId: remoteProviderId, chartId: chart.id, title: chart.title });
            return (
              <div
                key={chart.id}
                className="chart-card"
                style={{ '--i': Math.min(index, 6) } as CSSProperties}
                role="button"
                tabIndex={0}
                title={chart.title}
                onClick={open}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                  }
                }}
              >
                <div className="chart-card-cover">
                  <CoverImage
                    className="chart-card-img"
                    src={chart.coverUrl}
                    tone={chart.coverTone}
                    size={280}
                    fallbackIconSize={28}
                  />
                  <span className="chart-card-rank">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="chart-card-body">
                  <h3 className="chart-card-name">{chart.title}</h3>
                  {meta ? <span className="chart-card-meta">{meta}</span> : null}
                  {chart.description ? <p className="chart-card-desc">{chart.description}</p> : null}
                </div>
                <span className="chart-card-play" aria-hidden="true">
                  <PlayBadgeIcon size={18} strokeWidth={2} filled />
                </span>
              </div>
            );
          })}
        </div>
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
    content = <SkeletonCardGrid count={6} minColWidth={230} />;
  }

  return (
    <div className="charts-view" aria-busy={Boolean(isLoading)} data-reveal data-reveal-order={0}>
      <div className="page-header">
        <div className="page-header-main">
          <span className="page-kicker">{remoteProviderId === 'qq' ? 'QQ 音乐' : '网易云音乐'}</span>
          <h1 className="detail-title">官方排行榜</h1>
          <span className="page-subtitle">权威呈现平台热度趋势，实时更新</span>
        </div>
      </div>
      {content}
    </div>
  );
}
