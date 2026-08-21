import { useEffect, useState } from 'react';
import { useNotificationStore, type NotificationTone } from '../state/notificationStore';
import { CloseIcon, ToastErrorIcon, ToastInfoIcon, ToastSuccessIcon, ToastWarningIcon } from './icons';

const TONE_ICONS: Record<NotificationTone, (props: { size?: number; strokeWidth?: number; className?: string }) => React.ReactElement> = {
  success: ToastSuccessIcon,
  warning: ToastWarningIcon,
  error: ToastErrorIcon,
  info: ToastInfoIcon
};

export function Toast() {
  const notification = useNotificationStore((s) => s.notification);
  const presence = useNotificationStore((s) => s.presence);
  const dismiss = useNotificationStore((s) => s.dismissNotification);
  const pause = useNotificationStore((s) => s.pause);
  const resume = useNotificationStore((s) => s.resume);
  const activate = useNotificationStore((s) => s.activateNotificationAction);

  // 进入动画：元素挂载时 opacity:0，下一帧再切到 data-open='true' 触发平滑淡入
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!notification) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [notification?.key]);

  if (!notification) return null;

  const tone = notification.tone;
  const ToneIcon = TONE_ICONS[tone];
  const isAlert = tone === 'warning' || tone === 'error';
  // 退出时 presence 为 'closed' 但 notification 仍保留 320ms → data-open='false' 触发淡出
  const isOpen = presence === 'open' && entered;

  return (
    <div
      className="toast"
      data-tone={tone}
      data-open={isOpen}
      role={isAlert ? 'alert' : 'status'}
      aria-atomic="true"
      aria-live={isAlert ? 'assertive' : 'polite'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <ToneIcon size={15} strokeWidth={2} className="toast-icon" />
      <span className="toast-message">{notification.message}</span>
      {notification.actionLabel && (
        <button className="toast-action" onClick={activate}>
          {notification.actionLabel}
        </button>
      )}
      <button className="toast-close" aria-label="关闭通知" onClick={dismiss}>
        <CloseIcon size={12} strokeWidth={2} />
      </button>
    </div>
  );
}