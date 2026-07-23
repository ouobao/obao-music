import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../state/playerStore';
import { PlaybackNotice } from './PlaybackNotice';

describe('PlaybackNotice', () => {
  afterEach(() => {
    vi.useRealTimers();
    usePlayerStore.getState().resetForTest();
  });

  it('auto-dismisses playback errors after the toast exit animation', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      playbackRestriction: {
        category: 'url_unavailable',
        message: '音频源不可播放，请重试或切换音质',
        action: 'retry'
      }
    });

    render(<PlaybackNotice />);

    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'open');

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(usePlayerStore.getState().playbackRestriction).toBeNull();
  });

  it('explains that a provider network-risk response is not a membership restriction and can be retried', () => {
    usePlayerStore.setState({
      playbackRestriction: {
        category: 'provider_risk',
        message: '检测到您的网络环境存在风险，请稍后再试；这不是会员限制',
        action: 'retry'
      }
    });

    render(<PlaybackNotice />);

    expect(screen.getByRole('alert')).toHaveTextContent('这不是会员限制');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('keeps login and playback-authorization notices open until the user acts on them', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      playbackRestriction: {
        category: 'login_required',
        message: '请登录后播放',
        action: 'login'
      }
    });

    render(<PlaybackNotice />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: '重新登录' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭播放提示' }));
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(usePlayerStore.getState().playbackRestriction).toBeNull();
  });
});
