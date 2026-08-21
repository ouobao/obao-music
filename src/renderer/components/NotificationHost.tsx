import type { RemoteProviderId } from '../../shared/musicTypes';
import { Toast } from './Toast';
import { usePlayerStore } from '../state/playerStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { CloseIcon } from './icons';

export function AppNotificationHost() {
  return <Toast />;
}

export function PlaybackNotice({ onOpenLogin }: { onOpenLogin: (providerId?: RemoteProviderId) => void }) {
  const restriction = usePlayerStore((s) => s.playbackRestriction);
  const dismiss = usePlayerStore((s) => s.dismissPlaybackRestriction);
  const retry = usePlayerStore((s) => s.retryPlayback);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);

  if (!restriction || isLyricsOpen) return null;

  const actionLabel =
    restriction.action === 'login' ? '去登录' :
    restriction.action === 'retry' ? '重试' :
    restriction.action === 'switch_source' ? '切换来源' :
    null;

  const handleAction = () => {
    if (restriction.action === 'retry') {
      retry();
    } else if (restriction.action === 'login') {
      dismiss();
      const providerId = usePlayerStore.getState().currentSong?.providerId;
      onOpenLogin(providerId === 'netease' || providerId === 'qq' ? providerId : undefined);
    } else if (restriction.action === 'switch_source') {
      const current = useProviderSessionStore.getState().activeProviderId;
      const next = current === 'netease' ? 'qq' : 'netease';
      useProviderSessionStore.getState().setActiveProvider(next);
      dismiss();
    } else {
      dismiss();
    }
  };

  return (
    <div
      className="playback-restriction-banner"
      style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, margin: 0, maxWidth: 'min(720px, calc(100vw - 48px))' }}
    >
      <div style={{ minWidth: 0 }}>
        <strong className="playback-restriction-title">{restriction.category === 'login_required' ? '需要登录' : '播放受限'}</strong>
        <span style={{ marginLeft: 8 }}>{restriction.message}</span>
      </div>
      <div className="playback-restriction-actions">
        {actionLabel && (
          <button className="btn-secondary-action" style={{ padding: '6px 14px', fontSize: 12 }} onClick={handleAction}>
            {actionLabel}
          </button>
        )}
        <button className="section-action-btn" style={{ padding: '6px 10px' }} onClick={dismiss} aria-label="关闭播放限制提示">
          <CloseIcon size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
