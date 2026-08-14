import { LoaderCircle } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ChartSummary, RemoteProviderId } from '../../shared/musicTypes';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';
import { ProviderPageHeader } from './ProviderPageHeader';

interface ChartsViewProps {
  providerId: RemoteProviderId;
  charts: ChartSummary[];
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh?: () => void;
  onProviderChange?: (providerId: RemoteProviderId) => void;
  onSelectChart?: (providerId: RemoteProviderId, chartId: string) => void;
}

export function ChartsView({
  providerId,
  charts,
  isLoading,
  errorMessage,
  onRefresh,
  onProviderChange,
  onSelectChart
}: ChartsViewProps) {
  useAppNotificationValue({
    key: `charts:${providerId}`,
    message: errorMessage,
    actionLabel: '重试',
    onAction: onRefresh
  });

  return (
    <section className="charts-view" aria-label="排行榜" aria-busy={isLoading || undefined}>
      <ProviderPageHeader
        title="排行榜"
        providerId={providerId}
        sourceAriaLabel="排行榜来源"
        isRefreshing={isLoading}
        onProviderChange={onProviderChange}
        onRefresh={onRefresh}
      />

      {isLoading && charts.length === 0 ? (
        <p className="charts-message" role="status">
          <LoaderCircle
            className="charts-initial-loader"
            data-testid="charts-initial-loader"
            aria-hidden="true"
            size={18}
          />
          <span>正在加载排行榜</span>
        </p>
      ) : null}
      {charts.length > 0 ? (
        <div className="charts-grid">
          {charts.map((chart) => {
            const updateText = formatChartUpdate(chart);
            return (
              <article className="chart-card" key={chart.id}>
                <button
                  className="chart-card-open"
                  type="button"
                  aria-label={`打开榜单：${chart.title}`}
                  onClick={() => onSelectChart?.(chart.providerId, chart.id)}
                >
                  <span
                    className="chart-card-cover"
                    style={
                      {
                        '--cover-tone': chart.coverTone,
                        '--chart-cover-image': chart.coverUrl
                          ? `url("${chart.coverUrl}")`
                          : 'linear-gradient(135deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                  <span className="chart-card-copy">
                    <strong>{chart.title}</strong>
                    {updateText ? <small>{updateText}</small> : null}
                    {chart.description ? <span>{chart.description}</span> : null}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      {!isLoading && !errorMessage && charts.length === 0 ? (
        <p className="charts-message">当前来源暂无排行榜</p>
      ) : null}
    </section>
  );
}

function formatChartUpdate(chart: ChartSummary): string {
  const updatedAt = chart.updatedAt?.trim();
  const displayUpdatedAt = updatedAt && /^\d{4}-\d{2}-\d{2}T/.test(updatedAt)
    ? updatedAt.slice(0, 10)
    : updatedAt;

  return [chart.updateLabel, displayUpdatedAt]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(' · ');
}
