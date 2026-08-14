import { create } from 'zustand';

export const APP_NOTIFICATION_VISIBLE_MS = 3500;
export const APP_NOTIFICATION_EXIT_MS = 180;

export type AppNotificationTone = 'info' | 'success' | 'warning' | 'error';
export type AppNotificationPresence = 'open' | 'closed';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface AppNotification {
  key: string;
  message: string;
  tone: AppNotificationTone;
  action?: NotificationAction;
  onDismiss?: () => void;
}

interface AppNotificationState {
  notification: AppNotification | null;
  presence: AppNotificationPresence;
  showNotification: (notification: AppNotification) => void;
  dismissNotification: (key?: string) => void;
  activateNotificationAction: (key?: string) => void;
  resetForTest: () => void;
}

export const useAppNotificationStore = create<AppNotificationState>((set, get) => {
  let lifecycle = 0;
  let autoDismissTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let removalTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const clearAutoDismissTimer = () => {
    if (autoDismissTimer === null) {
      return;
    }

    globalThis.clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  };

  const clearRemovalTimer = () => {
    if (removalTimer === null) {
      return;
    }

    globalThis.clearTimeout(removalTimer);
    removalTimer = null;
  };

  const dismissCurrentNotification = (key?: string) => {
    const state = get();
    const notification = state.notification;
    if (!notification || state.presence === 'closed' || (key && notification.key !== key)) {
      return;
    }

    const dismissalLifecycle = ++lifecycle;
    clearAutoDismissTimer();
    clearRemovalTimer();
    set({ presence: 'closed' });

    removalTimer = globalThis.setTimeout(() => {
      if (lifecycle !== dismissalLifecycle) {
        return;
      }

      removalTimer = null;
      set({ notification: null, presence: 'closed' });
    }, APP_NOTIFICATION_EXIT_MS);

    notification.onDismiss?.();
  };

  const scheduleAutoDismiss = (notificationLifecycle: number) => {
    autoDismissTimer = globalThis.setTimeout(() => {
      if (lifecycle !== notificationLifecycle) {
        return;
      }

      autoDismissTimer = null;
      dismissCurrentNotification();
    }, APP_NOTIFICATION_VISIBLE_MS);
  };

  return {
    notification: null,
    presence: 'closed',
    showNotification: (notification) => {
      const state = get();
      const previousNotification = state.notification;

      if (
        previousNotification
        && state.presence === 'open'
        && hasSameNotificationContent(previousNotification, notification)
      ) {
        if (
          previousNotification.action?.onClick !== notification.action?.onClick
          || previousNotification.onDismiss !== notification.onDismiss
        ) {
          set({ notification });
        }
        return;
      }

      const previousOnDismiss = state.presence === 'open' ? previousNotification?.onDismiss : undefined;
      const notificationLifecycle = ++lifecycle;
      clearAutoDismissTimer();
      clearRemovalTimer();
      set({ notification, presence: 'open' });
      scheduleAutoDismiss(notificationLifecycle);
      previousOnDismiss?.();
    },
    dismissNotification: dismissCurrentNotification,
    activateNotificationAction: (key) => {
      const state = get();
      const notification = state.notification;
      if (
        !notification?.action
        || state.presence !== 'open'
        || (key && notification.key !== key)
      ) {
        return;
      }

      const actionLifecycle = lifecycle;
      try {
        notification.action.onClick();
      } finally {
        if (lifecycle === actionLifecycle) {
          dismissCurrentNotification(notification.key);
        }
      }
    },
    resetForTest: () => {
      lifecycle += 1;
      clearAutoDismissTimer();
      clearRemovalTimer();
      set({ notification: null, presence: 'closed' });
    }
  };
});

export function showAppNotification(notification: AppNotification): void {
  useAppNotificationStore.getState().showNotification(notification);
}

export function dismissAppNotification(key?: string): void {
  useAppNotificationStore.getState().dismissNotification(key);
}

export function activateAppNotificationAction(key?: string): void {
  useAppNotificationStore.getState().activateNotificationAction(key);
}

function hasSameNotificationContent(left: AppNotification, right: AppNotification): boolean {
  return left.key === right.key
    && left.message === right.message
    && left.tone === right.tone
    && left.action?.label === right.action?.label;
}
