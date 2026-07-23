import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_NOTIFICATION_EXIT_MS,
  APP_NOTIFICATION_VISIBLE_MS,
  activateAppNotificationAction,
  dismissAppNotification,
  showAppNotification,
  useAppNotificationStore
} from './appNotificationStore';

describe('appNotificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppNotificationStore.getState().resetForTest();
  });

  afterEach(() => {
    useAppNotificationStore.getState().resetForTest();
    vi.useRealTimers();
  });

  it('keeps only the newest notification and completes the replaced lifecycle', () => {
    const firstDismiss = vi.fn();
    showAppNotification({
      key: 'first',
      message: '第一条通知',
      tone: 'info',
      onDismiss: firstDismiss
    });

    showAppNotification({
      key: 'second',
      message: '第二条通知',
      tone: 'success'
    });

    expect(firstDismiss).toHaveBeenCalledOnce();
    expect(useAppNotificationStore.getState()).toMatchObject({
      notification: { key: 'second', message: '第二条通知' },
      presence: 'open'
    });
  });

  it('deduplicates the same content without restarting its visible duration', () => {
    const firstDismiss = vi.fn();
    const latestDismiss = vi.fn();
    showAppNotification({
      key: 'sync-error',
      message: '同步失败',
      tone: 'error',
      onDismiss: firstDismiss
    });

    vi.advanceTimersByTime(3000);
    showAppNotification({
      key: 'sync-error',
      message: '同步失败',
      tone: 'error',
      onDismiss: latestDismiss
    });
    vi.advanceTimersByTime(APP_NOTIFICATION_VISIBLE_MS - 3000);

    expect(useAppNotificationStore.getState().presence).toBe('closed');
    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).toHaveBeenCalledOnce();
  });

  it('replaces changed content under the same key and starts a fresh duration', () => {
    const firstDismiss = vi.fn();
    showAppNotification({
      key: 'request',
      message: '请求失败',
      tone: 'error',
      onDismiss: firstDismiss
    });

    vi.advanceTimersByTime(3000);
    showAppNotification({
      key: 'request',
      message: '登录后重试',
      tone: 'warning'
    });
    vi.advanceTimersByTime(1000);

    expect(firstDismiss).toHaveBeenCalledOnce();
    expect(useAppNotificationStore.getState()).toMatchObject({
      notification: { message: '登录后重试' },
      presence: 'open'
    });
  });

  it('retains a dismissed notification for the 180ms exit presence', () => {
    showAppNotification({ key: 'saved', message: '已保存', tone: 'success' });

    vi.advanceTimersByTime(APP_NOTIFICATION_VISIBLE_MS);
    expect(useAppNotificationStore.getState()).toMatchObject({
      notification: { key: 'saved' },
      presence: 'closed'
    });

    vi.advanceTimersByTime(APP_NOTIFICATION_EXIT_MS - 1);
    expect(useAppNotificationStore.getState().notification).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(useAppNotificationStore.getState().notification).toBeNull();
  });

  it('runs an action once and dismisses the active notification', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    showAppNotification({
      key: 'retry',
      message: '请重试',
      tone: 'warning',
      action: { label: '重试', onClick },
      onDismiss
    });

    activateAppNotificationAction('retry');

    expect(onClick).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(useAppNotificationStore.getState().presence).toBe('closed');
  });

  it('supports manual dismissal without affecting a newer keyed notification', () => {
    showAppNotification({ key: 'newer', message: '新的通知', tone: 'info' });

    dismissAppNotification('stale');
    expect(useAppNotificationStore.getState().presence).toBe('open');

    dismissAppNotification('newer');
    expect(useAppNotificationStore.getState().presence).toBe('closed');
  });
});
