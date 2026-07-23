import { useEffect } from 'react';
import {
  dismissAppNotification,
  showAppNotification,
  type AppNotificationTone
} from '../state/appNotificationStore';

interface AppNotificationValueOptions {
  key: string;
  message: string | null | undefined;
  tone?: AppNotificationTone;
  actionLabel?: string;
  onAction?: () => void;
}

export function useAppNotificationValue({
  key,
  message,
  tone = 'error',
  actionLabel,
  onAction
}: AppNotificationValueOptions): void {
  useEffect(() => {
    if (!message) {
      dismissAppNotification(key);
      return;
    }

    showAppNotification({
      key,
      message,
      tone,
      ...(actionLabel && onAction
        ? { action: { label: actionLabel, onClick: onAction } }
        : {})
    });
  }, [actionLabel, key, message, onAction, tone]);
}
