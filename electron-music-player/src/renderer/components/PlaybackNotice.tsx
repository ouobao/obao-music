import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { usePlayerStore } from '../state/playerStore';
import type { PlaybackRestriction } from '../../shared/providerTypes';

interface PlaybackNoticeProps {
  onLoginClick?: () => void;
}

const noticeAutoDismissMs = 3500;
const noticeExitMs = 200;

export function PlaybackNotice({ onLoginClick }: PlaybackNoticeProps) {
  const playbackRestriction = usePlayerStore((state) => state.playbackRestriction);
  const retryPlayback = usePlayerStore((state) => state.retryPlayback);
  const dismissPlaybackRestriction = usePlayerStore((state) => state.dismissPlaybackRestriction);
  const [isOpen, setOpen] = useState(Boolean(playbackRestriction));
  const presence = useAnimatedPresence(Boolean(playbackRestriction) && isOpen, noticeExitMs);
  const shouldPersist = playbackRestriction ? isPersistentPlaybackRestriction(playbackRestriction) : false;

  useEffect(() => {
    if (!playbackRestriction) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [playbackRestriction]);

  useEffect(() => {
    if (!playbackRestriction || !isOpen || shouldPersist) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setOpen(false);
    }, noticeAutoDismissMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, playbackRestriction, shouldPersist]);

  useEffect(() => {
    if (!playbackRestriction || isOpen) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      dismissPlaybackRestriction();
    }, noticeExitMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dismissPlaybackRestriction, isOpen, playbackRestriction]);

  if (!playbackRestriction || !presence.isMounted) {
    return null;
  }

  const message = formatPlaybackRestrictionMessage(playbackRestriction);
  const actionLabel = getPlaybackActionLabel(playbackRestriction.action);

  function handleActionClick() {
    if (playbackRestriction?.action === 'login') {
      onLoginClick?.();
      setOpen(false);
      return;
    }

    if (playbackRestriction?.action === 'retry') {
      retryPlayback();
    }
  }

  return (
    <aside
      className="playback-notice glass-surface"
      role="alert"
      aria-live="polite"
      data-persistent={shouldPersist ? 'true' : 'false'}
      data-state={presence.state}
    >
      <div className="playback-notice-copy">
        <strong>{message}</strong>
      </div>
      {actionLabel ? (
        <button className="playback-notice-action liquid-glass-button" type="button" onClick={handleActionClick}>
          {actionLabel}
        </button>
      ) : null}
      <button className="playback-notice-close icon-button" type="button" aria-label="关闭播放提示" onClick={() => setOpen(false)}>
        <X aria-hidden="true" size={15} />
      </button>
    </aside>
  );
}

function isPersistentPlaybackRestriction(restriction: PlaybackRestriction): boolean {
  return restriction.action === 'login'
    || restriction.category === 'login_required'
    || restriction.category === 'playback_auth_incomplete';
}

function formatPlaybackRestrictionMessage(restriction: PlaybackRestriction): string {
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

function getPlaybackActionLabel(action: PlaybackRestriction['action']): string | null {
  switch (action) {
    case 'login':
      return '重新登录';
    case 'retry':
      return '重试';
    default:
      return null;
  }
}
