import { create } from 'zustand';

export type NotificationTone = 'success' | 'warning' | 'error' | 'info';

export interface AppNotification {
  key: string;
  message: string;
  tone: NotificationTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface NotificationState {
  notification: AppNotification | null;
  presence: 'open' | 'closed';
  paused: boolean;

  showNotification(notification: AppNotification): void;
  dismissNotification(): void;
  activateNotificationAction(): void;
  pause(): void;
  resume(): void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let remainingMs = 0;
let dismissAt = 0;

function clearTimer() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notification: null,
  presence: 'closed',
  paused: false,

  showNotification(notification) {
    clearTimer();
    set({ notification, presence: 'open', paused: false });
    if (notification.durationMs !== 0) {
      remainingMs = notification.durationMs ?? 3500;
      dismissAt = Date.now() + remainingMs;
      dismissTimer = setTimeout(() => get().dismissNotification(), remainingMs);
    }
  },

  dismissNotification() {
    clearTimer();
    set({ presence: 'closed', paused: false });
    setTimeout(() => {
      set((state) => (state.presence === 'closed' ? { notification: null } : state));
    }, 320);
  },

  activateNotificationAction() {
    const { notification } = get();
    if (!notification?.onAction) return;
    const action = notification.onAction;
    get().dismissNotification();
    action();
  },

  pause() {
    const { notification, paused } = get();
    if (!notification || paused) return;
    if (dismissTimer) {
      clearTimer();
      remainingMs = Math.max(0, dismissAt - Date.now());
    }
    set({ paused: true });
  },

  resume() {
    const { notification, paused } = get();
    if (!notification || !paused) return;
    if (remainingMs <= 0) {
      get().dismissNotification();
      return;
    }
    dismissAt = Date.now() + remainingMs;
    dismissTimer = setTimeout(() => get().dismissNotification(), remainingMs);
    set({ paused: false });
  }
}));

export function showNotification(message: string, tone: NotificationTone = 'info', options: Partial<AppNotification> = {}) {
  useNotificationStore.getState().showNotification({ key: options.key ?? `${Date.now()}`, message, tone, ...options });
}

export function showAppNotification(notification: Omit<AppNotification, 'presence'>) {
  useNotificationStore.getState().showNotification(notification);
}

export function inferTone(message: string): NotificationTone {
  const text = message.toLowerCase();
  if (text.includes('失败') || text.includes('error') || text.includes('exception')) return 'error';
  if (text.includes('限制') || text.includes('需要登录') || text.includes('vip') || text.includes('无法')) return 'warning';
  if (text.includes('成功') || text.includes('已添加') || text.includes('已收藏') || text.includes('开始播放')) return 'success';
  return 'info';
}
