import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSummary } from '../../shared/musicTypes';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { ChartsView } from './ChartsView';

const charts: ChartSummary[] = [
  {
    id: 'qq:chart:62',
    providerId: 'qq',
    platformChartId: '62',
    title: '飙升榜',
    description: '站内播放热度上升最快的歌曲',
    songIds: [],
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
    coverUrl: 'https://example.test/chart.jpg',
    sourceLabel: 'QQ音乐',
    updatedAt: '2026-07-11',
    updateLabel: '每日更新'
  }
];

describe('ChartsView', () => {
  beforeEach(() => {
    useAppNotificationStore.getState().resetForTest();
  });

  it('renders a provider-scoped chart directory with only the source switcher in its chrome', () => {
    const handleProviderChange = vi.fn();
    const handleSelectChart = vi.fn();
    const { container } = render(
      <ChartsView
        providerId="qq"
        charts={charts}
        isLoading={false}
        errorMessage={null}
        onProviderChange={handleProviderChange}
        onSelectChart={handleSelectChart}
      />
    );

    const view = screen.getByRole('region', { name: '排行榜' });
    expect(within(view).getByRole('heading', { name: '排行榜' })).toBeInTheDocument();
    expect(within(view).getByRole('button', { name: '当前来源暂无可刷新内容' })).toBeDisabled();
    expect(within(view).getByText('每日更新 · 2026-07-11')).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('.chart-card-cover')?.style.getPropertyValue('--chart-cover-image')).toContain('chart.jpg');

    fireEvent.click(within(view).getByRole('button', { name: '网易云音乐' }));
    fireEvent.click(within(view).getByRole('button', { name: '打开榜单：飙升榜' }));

    expect(handleProviderChange).toHaveBeenCalledWith('netease');
    expect(handleSelectChart).toHaveBeenCalledWith('qq', 'qq:chart:62');
  });

  it('keeps the source switcher in normal document flow', () => {
    const { container } = render(
      <main className="main-content main-content-charts">
        <ChartsView providerId="qq" charts={charts} isLoading={false} errorMessage={null} />
      </main>
    );

    expect(container.querySelector('.catalog-sticky-chrome')).not.toBeInTheDocument();
    expect(container.querySelector('.provider-page-header')).toBeInTheDocument();
  });

  it('renders loading and empty states without placeholder cards', () => {
    const { rerender } = render(
      <ChartsView providerId="qq" charts={[]} isLoading errorMessage={null} />
    );

    expect(screen.getByRole('region', { name: '排行榜' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在加载排行榜');
    expect(within(screen.getByRole('status')).getByTestId('charts-initial-loader')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开榜单/ })).not.toBeInTheDocument();

    rerender(<ChartsView providerId="qq" charts={[]} isLoading={false} errorMessage={null} />);
    expect(screen.getByText('当前来源暂无排行榜')).toBeInTheDocument();
  });

  it('publishes the active provider error without synthetic content', () => {
    render(
      <ChartsView providerId="netease" charts={[]} isLoading={false} errorMessage="网易云排行榜加载失败" />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('网易云排行榜加载失败')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'charts:netease',
      message: '网易云排行榜加载失败',
      tone: 'error'
    });
    expect(screen.queryByRole('button', { name: /打开榜单/ })).not.toBeInTheDocument();
  });

  it('formats provider ISO update timestamps as readable dates', () => {
    render(
      <ChartsView
        providerId="netease"
        charts={[{
          ...charts[0],
          id: 'netease:chart:19723756',
          providerId: 'netease',
          platformChartId: '19723756',
          updateLabel: '每天更新',
          updatedAt: '2026-07-11T06:30:00.000Z'
        }]}
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(screen.getByText('每天更新 · 2026-07-11')).toBeInTheDocument();
    expect(screen.queryByText(/T06:30/)).not.toBeInTheDocument();
  });
});
