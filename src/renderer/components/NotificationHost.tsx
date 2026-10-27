import { useCallback, useEffect, useState } from 'react';
import type { RemoteProviderId } from '../../shared/musicTypes';
import { Toast } from './Toast';
import { usePlayerStore } from '../state/playerStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { CrownIcon, LockIcon, ToastWarningIcon, UserIcon, CloseIcon } from './icons';

export function AppNotificationHost() {
  return <Toast />;
}

/** 播放限制类别 → 标题 / 图标语义（与统一弹窗的设计语言保持一致） */
const RESTRICTION_PRESENTATION: Record<
  string,
  { title: string; icon: 'user' | 'lock' | 'warning' | 'crown' }
> = {
  login_required: { title: '需要登录', icon: 'user' },
  playback_auth_incomplete: { title: '播放授权不完整', icon: 'lock' },
  vip_required: { title: '会员专属', icon: 'crown' },
  paid_required: { title: '数字专辑', icon: 'crown' },
  copyright_unavailable: { title: '暂无版权', icon: 'warning' },
  region_unavailable: { title: '地区限制', icon: 'warning' },
  provider_risk: { title: '播放受限', icon: 'warning' },
  url_unavailable: { title: '暂不可播放', icon: 'warning' }
};

const ACTION_LABELS: Record<string, string | null> = {
  login: '去登录',
  retry: '重试',
  switch_source: '切换来源',
  upgrade: '了解会员',
  purchase: '前往购买',
  none: null
};

export function PlaybackNotice({ onOpenLogin }: { onOpenLogin: (providerId?: RemoteProviderId) => void }) {
  const restriction = usePlayerStore((s) => s.playbackRestriction);
  const dismiss = usePlayerStore((s) => s.dismissPlaybackRestriction);
  const retry = usePlayerStore((s) => s.retryPlayback);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);
  /** 两段式显隐：先挂载（closed）再下一帧加 open，保证出入场都有过渡动画 */
  const [visible, setVisible] = useState(false);

  const requestClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => dismiss(), 240);
  }, [dismiss]);

  useEffect(() => {
    if (!restriction || isLyricsOpen) {
      setVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [restriction, isLyricsOpen]);

  // ESC 关闭播放提示（与登录弹窗一致）
  useEffect(() => {
    if (!restriction || isLyricsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [restriction, isLyricsOpen, requestClose]);

  if (!restriction || isLyricsOpen) return null;

  const presentation = RESTRICTION_PRESENTATION[restriction.category] ?? { title: '播放受限', icon: 'warning' as const };
  const actionLabel = ACTION_LABELS[restriction.action] ?? null;

  const handleAction = () => {
    if (restriction.action === 'retry') {
      retry();
    } else if (restriction.action === 'login') {
      requestClose();
      const providerId = usePlayerStore.getState().currentSong?.providerId;
      onOpenLogin(providerId === 'netease' || providerId === 'qq' ? providerId : undefined);
    } else if (restriction.action === 'switch_source') {
      const current = useProviderSessionStore.getState().activeProviderId;
      const next = current === 'netease' ? 'qq' : 'netease';
      useProviderSessionStore.getState().setActiveProvider(next);
      requestClose();
    } else {
      requestClose();
    }
  };

  const Icon = presentation.icon === 'user'
    ? UserIcon
    : presentation.icon === 'lock'
      ? LockIcon
      : presentation.icon === 'crown'
        ? CrownIcon
        : ToastWarningIcon;

  const iconTone = presentation.icon === 'user'
    ? 'dialog-icon--info'
    : presentation.icon === 'crown'
      ? 'dialog-icon--warning'
      : presentation.icon === 'lock'
        ? 'dialog-icon--info'
        : 'dialog-icon--warning';

  return (
    <div
      className={`modal-backdrop ${visible ? 'open' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        className="modal-card modal-card--sm"
        role="alertdialog"
        aria-modal="true"
        aria-label={presentation.title}
      >
        <div className="dialog-header">
          <span className={`dialog-icon ${iconTone}`} aria-hidden="true">
            <Icon size={21} strokeWidth={2.1} />
          </span>
          <div className="dialog-heading">
            <div className="dialog-title">{presentation.title}</div>
            <div className="dialog-subtitle">{restriction.message}</div>
          </div>
          <button className="dialog-close-btn" onClick={requestClose} aria-label="关闭提示">
            <CloseIcon size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="dialog-actions">
          <button className="btn-ghost" onClick={requestClose}>
            暂不处理
          </button>
          {actionLabel && (
            <button className="btn-primary" onClick={handleAction}>
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
