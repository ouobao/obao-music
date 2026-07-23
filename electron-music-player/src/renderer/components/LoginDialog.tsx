import { Cloud, LogIn, LogOut, Music2, RefreshCw, Star, X, type LucideIcon } from 'lucide-react';
import { type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopoverStyle } from '../hooks/useAnchoredPopoverStyle';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { showAppNotification } from '../state/appNotificationStore';
import { useLibraryStore } from '../state/libraryStore';
import { useProviderSessionStore, type SessionProviderId } from '../state/providerSessionStore';

interface LoginDialogProps {
  anchorRef: RefObject<HTMLButtonElement>;
  open: boolean;
  onClose: () => void;
}

const loginProviders: Array<{
  id: SessionProviderId;
  label: string;
  detail: string;
  Icon: LucideIcon;
}> = [
  { id: 'netease', label: '网易云音乐', detail: '网易云账号', Icon: Cloud },
  { id: 'qq', label: 'QQ 音乐', detail: 'QQ 音乐账号', Icon: Music2 }
];

export function LoginDialog({ anchorRef, open, onClose }: LoginDialogProps) {
  const presence = useAnimatedPresence(open);
  const popoverStyle = useAnchoredPopoverStyle({
    anchorRef,
    gap: 10,
    open: presence.isMounted,
    placement: 'bottom-end',
    width: 360
  });
  const statuses = useProviderSessionStore((state) => state.statuses);
  const defaultProviderId = useProviderSessionStore((state) => state.defaultProviderId);
  const login = useProviderSessionStore((state) => state.login);
  const logout = useProviderSessionStore((state) => state.logout);
  const refreshStatus = useProviderSessionStore((state) => state.refreshStatus);
  const setDefaultProvider = useProviderSessionStore((state) => state.setDefaultProvider);
  const loadProviderPlaylists = useLibraryStore((state) => state.loadProviderPlaylists);
  const clearProviderLibrary = useLibraryStore((state) => state.clearProviderLibrary);

  if (!presence.isMounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <section
      className="login-popover login-dialog glass-surface"
      role="dialog"
      aria-label="账号中心"
      data-top-popover-owner="account"
      data-state={presence.state}
      style={popoverStyle}
    >
      <div className="login-dialog-heading">
        <div>
          <h2>账号中心</h2>
        </div>
        <button className="icon-button" type="button" aria-label="关闭账号中心" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="login-provider-list">
        {loginProviders.map((provider) => {
          const status = statuses[provider.id];
          const Icon = provider.Icon;
          const isDefaultProvider = defaultProviderId === provider.id && status.loggedIn;

          return (
            <div className="login-provider-row" role="group" aria-label={provider.label} key={provider.id}>
              <span className="login-provider-icon">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="login-provider-main">
                <strong>{provider.label}</strong>
                <small>{status.loggedIn ? status.nickname?.trim() || provider.detail : provider.detail}</small>
              </span>
              <span className="login-provider-meta">
                <span className={getStatusClassName(status.playbackReady, status.loggedIn)}>{formatStatus(status)}</span>
                {isDefaultProvider ? <span className="login-provider-default-badge">默认</span> : null}
              </span>
              <span className="login-provider-actions">
                {status.loggedIn ? (
                  <>
                    {!isDefaultProvider ? (
                      <button
                        className="login-provider-action-button"
                        type="button"
                        aria-label={`设为默认 ${provider.label}`}
                        title="设为默认"
                        onClick={() => handleSetDefault(provider.id, provider.label)}
                      >
                        <Star aria-hidden="true" size={14} />
                        <span>设为默认</span>
                      </button>
                    ) : null}
                    <button
                      className="login-provider-action-button"
                      type="button"
                      aria-label={`刷新 ${provider.label}`}
                      title="刷新"
                      onClick={() => void handleRefresh(provider.id, provider.label)}
                    >
                      <RefreshCw aria-hidden="true" size={14} />
                      <span>刷新</span>
                    </button>
                    <button
                      className="login-provider-action-button login-provider-action-button-danger"
                      type="button"
                      aria-label={`退出 ${provider.label}`}
                      title="退出"
                      onClick={() => void handleLogout(provider.id, provider.label)}
                    >
                      <LogOut aria-hidden="true" size={14} />
                      <span>退出</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="login-provider-action-button"
                    type="button"
                    aria-label={`登录 ${provider.label}`}
                    title="登录"
                    onClick={() => void handleLogin(provider.id, provider.label)}
                  >
                    <LogIn aria-hidden="true" size={14} />
                    <span>登录</span>
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>,
    document.body
  );

  async function handleLogin(providerId: SessionProviderId, providerLabel: string) {
    notifyAccountFeedback(providerId, `${providerLabel} 登录中...`, 'info');
    try {
      const result = await login(providerId);

      if (!result.ok) {
        notifyAccountFeedback(providerId, result.error.message, 'error');
        return;
      }

      if (!result.data.loggedIn) {
        notifyAccountFeedback(providerId, `未获取到 ${providerLabel} 登录信息`, 'warning');
        return;
      }

      await loadProviderPlaylists(providerId);
      const libraryError = useLibraryStore.getState().errorMessage;
      if (libraryError) {
        notifyAccountFeedback(providerId, libraryError, 'error');
        return;
      }

      notifyAccountFeedback(providerId, `${providerLabel} 已登录并同步歌单`, 'success');
    } catch (error) {
      notifyAccountFeedback(providerId, getAccountErrorMessage(error), 'error');
    }
  }

  async function handleRefresh(providerId: SessionProviderId, providerLabel: string) {
    notifyAccountFeedback(providerId, `${providerLabel} 刷新中...`, 'info');
    try {
      const result = await refreshStatus(providerId);

      if (!result.ok) {
        notifyAccountFeedback(providerId, result.error.message, 'error');
        return;
      }

      if (!result.data.loggedIn) {
        clearProviderLibrary(providerId);
        notifyAccountFeedback(providerId, `未获取到 ${providerLabel} 登录信息`, 'warning');
        return;
      }

      await loadProviderPlaylists(providerId, { forceRefresh: true });
      const libraryError = useLibraryStore.getState().errorMessage;
      if (libraryError) {
        notifyAccountFeedback(providerId, libraryError, 'error');
        return;
      }

      notifyAccountFeedback(providerId, `${providerLabel} 已刷新`, 'success');
    } catch (error) {
      notifyAccountFeedback(providerId, getAccountErrorMessage(error), 'error');
    }
  }

  async function handleLogout(providerId: SessionProviderId, providerLabel: string) {
    notifyAccountFeedback(providerId, `${providerLabel} 退出中...`, 'info');
    try {
      const result = await logout(providerId);

      if (!result.ok) {
        notifyAccountFeedback(providerId, result.error.message, 'error');
        return;
      }

      clearProviderLibrary(providerId);
      notifyAccountFeedback(providerId, `已退出 ${providerLabel}`, 'success');
    } catch (error) {
      notifyAccountFeedback(providerId, getAccountErrorMessage(error), 'error');
    }
  }

  function handleSetDefault(providerId: SessionProviderId, providerLabel: string) {
    setDefaultProvider(providerId);
    notifyAccountFeedback(providerId, `已设为默认：${providerLabel}`, 'success');
  }
}

function notifyAccountFeedback(
  providerId: SessionProviderId,
  message: string,
  tone: 'info' | 'success' | 'warning' | 'error'
) {
  showAppNotification({
    key: `account-feedback:${providerId}`,
    message,
    tone
  });
}

function getAccountErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '账号操作失败';
}

function formatStatus(status: { loggedIn: boolean; playbackReady?: boolean; message?: string }): string {
  if (status.message && !status.loggedIn) {
    return status.message;
  }

  if (!status.loggedIn) {
    return '未登录';
  }

  if (status.playbackReady === false) {
    return '播放授权不完整';
  }

  return '已登录';
}

function getStatusClassName(playbackReady: boolean | undefined, loggedIn: boolean): string {
  if (!loggedIn) {
    return 'login-provider-status';
  }

  return playbackReady === false ? 'login-provider-status login-provider-status-warning' : 'login-provider-status login-provider-status-ready';
}
