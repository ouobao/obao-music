import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_NOTIFICATION_EXIT_MS,
  APP_NOTIFICATION_VISIBLE_MS,
  showAppNotification,
  useAppNotificationStore
} from '../state/appNotificationStore';
import { usePlayerStore } from '../state/playerStore';
import { AppNotificationHost } from './AppNotificationHost';

const originalRetryPlayback = usePlayerStore.getState().retryPlayback;

describe('AppNotificationHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppNotificationStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
    usePlayerStore.setState({ retryPlayback: originalRetryPlayback });
  });

  afterEach(() => {
    useAppNotificationStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
    usePlayerStore.setState({ retryPlayback: originalRetryPlayback });
    vi.useRealTimers();
  });

  it('auto-dismisses login restrictions and clears the player restriction', () => {
    usePlayerStore.setState({
      playbackRestriction: {
        category: 'login_required',
        message: '请登录后播放',
        action: 'login'
      }
    });

    render(<AppNotificationHost />);

    expect(screen.getByRole('alert')).toHaveTextContent('当前歌曲需要登录后播放');
    expect(screen.getByRole('button', { name: '重新登录' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(APP_NOTIFICATION_VISIBLE_MS);
    });

    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'closed');
    expect(usePlayerStore.getState().playbackRestriction).toBeNull();

    act(() => {
      vi.advanceTimersByTime(APP_NOTIFICATION_EXIT_MS);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens login through the host prop and dismisses the notification', () => {
    const onLoginClick = vi.fn();
    usePlayerStore.setState({
      playbackRestriction: {
        category: 'playback_auth_incomplete',
        message: '需要播放授权',
        action: 'login'
      }
    });

    render(<AppNotificationHost onLoginClick={onLoginClick} />);
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }));

    expect(onLoginClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'closed');
    expect(usePlayerStore.getState().playbackRestriction).toBeNull();
  });

  it('delegates retry actions to the player store', () => {
    const retryPlayback = vi.fn();
    usePlayerStore.setState({
      retryPlayback,
      playbackRestriction: {
        category: 'url_unavailable',
        message: '音频源不可播放，请重试',
        action: 'retry'
      }
    });

    render(<AppNotificationHost />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(retryPlayback).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().playbackRestriction).toBeNull();
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'closed');
  });

  it('renders global feedback without exposing a manual close button', () => {
    showAppNotification({
      key: 'playback-started',
      message: '已开始播放',
      tone: 'success'
    });

    render(<AppNotificationHost />);

    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByRole('status').querySelector('.app-notification-close')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(APP_NOTIFICATION_VISIBLE_MS);
    });

    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'closed');
  });

  it('keeps a newer player restriction when the previous notice is replaced', () => {
    const firstRestriction = {
      category: 'url_unavailable' as const,
      message: '第一次失败',
      action: 'retry' as const
    };
    const secondRestriction = {
      category: 'provider_risk' as const,
      message: '网络环境风险，请稍后重试',
      action: 'retry' as const
    };
    usePlayerStore.setState({ playbackRestriction: firstRestriction });
    const { rerender } = render(<AppNotificationHost />);

    act(() => {
      usePlayerStore.setState({ playbackRestriction: secondRestriction });
    });
    rerender(<AppNotificationHost />);

    expect(screen.getByRole('alert')).toHaveTextContent(secondRestriction.message);
    expect(usePlayerStore.getState().playbackRestriction).toBe(secondRestriction);
  });
});
