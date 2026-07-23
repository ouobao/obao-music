import { useEffect, useRef } from 'react';
import type { PlaybackRestriction } from '../../shared/providerTypes';
import {
  activateAppNotificationAction,
  dismissAppNotification,
  showAppNotification,
  useAppNotificationStore,
  type AppNotificationTone,
  type NotificationAction
} from '../state/appNotificationStore';
import { usePlayerStore } from '../state/playerStore';

export interface AppNotificationHostProps {
  onLoginClick?: () => void;
}

export const PLAYBACK_RESTRICTION_NOTIFICATION_KEY = 'playback-restriction';

export function AppNotificationHost({ onLoginClick }: AppNotificationHostProps) {
  const notification = useAppNotificationStore((state) => state.notification);
  const presence = useAppNotificationStore((state) => state.presence);
  const playbackRestriction = usePlayerStore((state) => state.playbackRestriction);
  const retryPlayback = usePlayerStore((state) => state.retryPlayback);
  const dismissPlaybackRestriction = usePlayerStore((state) => state.dismissPlaybackRestriction);
  const onLoginClickRef = useRef(onLoginClick);

  onLoginClickRef.current = onLoginClick;

  useEffect(() => {
    if (!playbackRestriction) {
      dismissAppNotification(PLAYBACK_RESTRICTION_NOTIFICATION_KEY);
      return;
    }

    const restriction = playbackRestriction;
    showAppNotification({
      key: PLAYBACK_RESTRICTION_NOTIFICATION_KEY,
      message: formatPlaybackRestrictionMessage(restriction),
      tone: getPlaybackRestrictionTone(restriction),
      action: createPlaybackRestrictionAction(restriction, {
        onLoginClick: () => onLoginClickRef.current?.(),
        retryPlayback
      }),
      onDismiss: () => {
        if (usePlayerStore.getState().playbackRestriction === restriction) {
          dismissPlaybackRestriction();
        }
      }
    });
  }, [dismissPlaybackRestriction, playbackRestriction, retryPlayback]);

  if (!notification) {
    return null;
  }

  const role = notification.tone === 'error' || notification.tone === 'warning' ? 'alert' : 'status';

  return (
    <aside
      className="app-notification playback-notice glass-surface"
      role={role}
      aria-atomic="true"
      aria-live="polite"
      data-notification-key={notification.key}
      data-state={presence}
      data-tone={notification.tone}
    >
      <div className="app-notification-copy playback-notice-copy">
        <strong>{notification.message}</strong>
      </div>
      {notification.action ? (
        <button
          className="app-notification-action playback-notice-action liquid-glass-button"
          type="button"
          onClick={() => activateAppNotificationAction(notification.key)}
        >
          {notification.action.label}
        </button>
      ) : null}
    </aside>
  );
}

export function formatPlaybackRestrictionMessage(restriction: PlaybackRestriction): string {
  switch (restriction.category) {
    case 'login_required':
      return '当前歌曲需要登录后播放';
    case 'vip_required':
      return '当前歌曲需要会员权限，无法获取播放地址';
    case 'paid_required':
      return '当前歌曲需要购买后播放';
    case 'copyright_unavailable':
      return '当前歌曲受版权限制，无法获取播放地址';
    case 'region_unavailable':
      return '当前歌曲受地区限制，无法获取播放地址';
    case 'provider_risk':
      return restriction.message || '音乐平台检测到网络环境风险，这不是会员限制，请稍后重试';
    case 'playback_auth_incomplete':
      return '当前歌曲需要 QQ 音乐播放授权';
    case 'url_unavailable':
      return restriction.message || '当前歌曲暂时无法获取播放地址';
  }
}

function createPlaybackRestrictionAction(
  restriction: PlaybackRestriction,
  handlers: { onLoginClick: () => void; retryPlayback: () => void }
): NotificationAction | undefined {
  switch (restriction.action) {
    case 'login':
      return { label: '重新登录', onClick: handlers.onLoginClick };
    case 'retry':
      return { label: '重试', onClick: handlers.retryPlayback };
    default:
      return undefined;
  }
}

function getPlaybackRestrictionTone(restriction: PlaybackRestriction): AppNotificationTone {
  switch (restriction.category) {
    case 'login_required':
    case 'vip_required':
    case 'paid_required':
    case 'playback_auth_incomplete':
      return 'warning';
    default:
      return 'error';
  }
}
