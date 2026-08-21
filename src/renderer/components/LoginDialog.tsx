import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { ProviderId, RemoteProviderId } from '../../shared/musicTypes';
import type { LoginQrSession } from '../../shared/providerTypes';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { useNotificationStore } from '../state/notificationStore';
import { useLibraryStore } from '../state/libraryStore';
import { ProviderSegmentedControl } from './ProviderSegmentedControl';
import { providerLabel } from '../utils/providerDisplay';

interface LoginDialogProps {
  open: boolean;
  preferredProviderId?: RemoteProviderId;
  onClose: () => void;
}

export function LoginDialog({ open, preferredProviderId, onClose }: LoginDialogProps) {
  const statuses = useProviderSessionStore((s) => s.statuses);
  const hydrateStatuses = useProviderSessionStore((s) => s.hydrateStatuses);
  const refreshStatus = useProviderSessionStore((s) => s.refreshStatus);
  const login = useProviderSessionStore((s) => s.login);
  const logout = useProviderSessionStore((s) => s.logout);
  const defaultProviderId = useProviderSessionStore((s) => s.defaultProviderId);
  const setDefaultProvider = useProviderSessionStore((s) => s.setDefaultProvider);
  const loadProviderPlaylists = useLibraryStore((s) => s.loadProviderPlaylists);
  const [activeTab, setActiveTab] = useState<RemoteProviderId>('netease');

  useEffect(() => {
    if (open) {
      setActiveTab(preferredProviderId ?? 'netease');
      hydrateStatuses();
    }
  }, [open, preferredProviderId, hydrateStatuses]);

  const status = statuses[activeTab];

  return (
    <div className={`modal-backdrop ${open ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>登录欧包音乐</h3>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)' }}>✕</button>
        </div>

        <ProviderSegmentedControl<RemoteProviderId>
          className="login-provider-toggle"
          options={[
            { id: 'netease', label: providerLabel('netease') },
            { id: 'qq', label: providerLabel('qq') }
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
          ariaLabel="选择登录平台"
        />

        <LoginTabTransition tab={activeTab}>
          {status?.loggedIn ? (
            <LoggedInPanel
              providerId={activeTab}
              nickname={status.nickname}
              avatarUrl={status.avatarUrl}
              vipLabel={status.vipLabel}
              playbackReady={status.playbackReady}
              isDefault={defaultProviderId === activeTab}
              onSetDefault={() => setDefaultProvider(activeTab)}
              onLogout={async () => {
                await logout(activeTab);
                useLibraryStore.getState().clearProviderLibrary(activeTab);
                useNotificationStore.getState().showNotification({
                  key: 'logout-ok',
                  message: `已退出${providerLabel(activeTab)}`,
                  tone: 'success'
                });
              }}
            />
          ) : (
            <QrLoginPanel
              providerId={activeTab}
              onLoggedIn={async () => {
                await refreshStatus(activeTab);
                loadProviderPlaylists(activeTab);
                useNotificationStore.getState().showNotification({
                  key: 'login-ok',
                  message: `登录${providerLabel(activeTab)}成功`,
                  tone: 'success'
                });
              }}
              onFallbackLogin={() => login(activeTab)}
            />
          )}
        </LoginTabTransition>
      </div>
    </div>
  );
}

/**
 * 登录弹窗的 Tab 内容过渡容器：
 * 切换平台时新内容淡入上移，同时容器高度平滑过渡到新内容高度，
 * 避免“QQ/网易云两页高度不一致导致的跳变”。
 */
function LoginTabTransition({ tab, children }: { tab: string; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => setHeight(inner.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [tab]);

  return (
    <div className="login-tab-transition" style={height != null ? { height } : undefined}>
      <div key={tab} ref={innerRef} className="login-tab-panel">
        {children}
      </div>
    </div>
  );
}

function QrLoginPanel({ providerId, onLoggedIn, onFallbackLogin }: { providerId: RemoteProviderId; onLoggedIn: () => void; onFallbackLogin: () => void }) {
  const [session, setSession] = useState<LoginQrSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [state, setState] = useState<'creating' | 'waiting' | 'scanned' | 'expired' | 'success' | 'failed'>('creating');
  const [message, setMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);
  const sessionRef = useRef<LoginQrSession | null>(null);

  const createSession = useCallback(async () => {
    // 手动刷新/重试时先停掉上一轮轮询，避免旧会话残留结果覆盖新二维码状态
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    activeRef.current = true;
    setState('creating');
    setMessage('');
    setQrDataUrl(null);
    const result = await window.musicPlayer.music.loginQrCreate(providerId);
    if (!activeRef.current) return;
    if (result.ok) {
      sessionRef.current = result.data;
      setSession(result.data);
      if (result.data.qrImageDataUrl) {
        setQrDataUrl(result.data.qrImageDataUrl);
        setState('waiting');
        startPolling(result.data.key);
      } else {
        const canvas = canvasRef.current;
        if (canvas && result.data.qrText) {
          QRCode.toCanvas(canvas, result.data.qrText, { width: 150, margin: 1 })
            .then(() => {
              setState('waiting');
              startPolling(result.data.key);
            })
            .catch(() => setState('failed'));
        } else {
          setState('failed');
        }
      }
    } else {
      setState('failed');
      const message = result.error.message;
      setMessage(message || '二维码创建失败，请稍后重试');
      // 二维码创建失败时提示尝试浏览器登录
      if (/登录|升级|版本|切换|网络|失败/i.test(message)) {
        setMessage(`${message}（可尝试使用浏览器登录）`);
      }
    }
  }, [providerId]);

  const startPolling = (key: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    // 对瞬时网络错误自动重试，避免一次抖动就判死。
    // 扫码确认阶段偶发的超时/网络抖动不会被当成“登录失败”，连续失败上限放宽到 8 次
    let consecutiveFailures = 0;
    let lastState = '';
    const pollOnce = async () => {
      if (!activeRef.current) return;
      try {
        const poll = await window.musicPlayer.music.loginQrPoll(providerId, key);
        if (!activeRef.current) return;
        if (!poll.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures > 8) {
            setState('failed');
            setMessage(poll.error?.message || '扫码登录失败');
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          }
          return;
        }
        consecutiveFailures = 0;
        const result = poll.data;
        // 仅当状态真正变化或有终态时才更新 UI，减少无谓重渲染
        if (result.state !== lastState) {
          lastState = result.state;
          setState(result.state);
          if (result.message) setMessage(result.message);
        }
        if (result.state === 'success') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          onLoggedIn();
        } else if (result.state === 'expired') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        } else if (result.state === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setMessage(result.message || '扫码登录失败');
        }
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures > 8) {
          setState('failed');
          setMessage(error instanceof Error ? error.message : String(error));
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      }
    };
    pollTimerRef.current = setInterval(pollOnce, 2000);
    void pollOnce();
  };

  useEffect(() => {
    activeRef.current = true;
    createSession();
    return () => {
      activeRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (sessionRef.current) {
        window.musicPlayer.music.loginQrCancel(providerId, sessionRef.current.key).catch(() => {});
      }
    };
  }, [providerId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '6px 0' }}>
      <div
        style={{
          width: 160,
          height: 160,
          background: '#fff',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code" style={{ width: '100%', height: '100%' }} />
        ) : (
          <canvas ref={canvasRef} />
        )}
        {(state === 'expired' || state === 'failed') && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.72)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 12,
              textAlign: 'center'
            }}
          >
            <span style={{ color: '#fff', fontSize: 13 }}>
              {state === 'expired' ? '二维码已过期' : (message || '扫码登录失败')}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="section-action-btn" onClick={createSession}>刷新二维码</button>
              {state === 'failed' && (
                <button className="section-action-btn" onClick={onFallbackLogin}>使用浏览器登录</button>
              )}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
        {state === 'creating' && '正在生成二维码...'}
        {state === 'waiting' && `使用${providerLabel(providerId)}手机客户端扫码登录`}
        {state === 'scanned' && '已扫码，请在手机上确认登录...'}
        {state === 'success' && '登录成功！'}
        {message && state !== 'failed' && state !== 'expired' && (
          <div style={{ marginTop: 4, color: 'var(--accent-primary)' }}>{message}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {state !== 'success' && (
          <button
            className="section-action-btn"
            onClick={createSession}
            disabled={state === 'creating'}
            title="重新生成二维码"
          >
            刷新二维码
          </button>
        )}
        <button className="section-action-btn" onClick={onFallbackLogin}>
          使用浏览器登录
        </button>
      </div>
    </div>
  );
}

function LoggedInPanel({
  providerId,
  nickname,
  avatarUrl,
  vipLabel,
  playbackReady,
  isDefault,
  onSetDefault,
  onLogout
}: {
  providerId: ProviderId;
  nickname?: string;
  avatarUrl?: string;
  vipLabel?: string;
  playbackReady?: boolean;
  isDefault: boolean;
  onSetDefault: () => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 26,
            fontWeight: 700
          }}
        >
          {(nickname ?? '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{nickname ?? '已登录'}</div>
        {vipLabel && <div style={{ fontSize: 11.5, color: 'var(--accent-primary)', marginTop: 2 }}>{vipLabel}</div>}
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {playbackReady ? '播放授权完整' : '播放授权不完整，可能无法播放部分歌曲'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {!isDefault && (
          <button className="btn-secondary-action" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onSetDefault}>
            设为默认平台
          </button>
        )}
        <button className="btn-secondary-action" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onLogout}>
          退出登录
        </button>
      </div>
    </div>
  );
}
