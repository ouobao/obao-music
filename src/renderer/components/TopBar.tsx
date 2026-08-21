import { useEffect, useRef, useState } from 'react';import { useUiStore } from '../state/uiStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { useSearchHistoryStore } from '../state/searchHistoryStore';
import type { RemoteProviderId } from '../../shared/musicTypes';
import type { LoginStatus } from '../../shared/providerTypes';
import { setTheme } from '../hooks/useTheme';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';
import { BackIcon, ForwardIcon, SearchIcon, ThemeDarkIcon, ThemeLightIcon } from './icons';
import { ProviderSegmentedControl } from './ProviderSegmentedControl';
import { WindowControls } from './WindowControls';

interface TopBarProps {
  onSearch: (keyword: string) => void;
  onOpenLogin: () => void;
}

export function TopBar({ onSearch, onOpenLogin }: TopBarProps) {
  const canGoBack = useUiStore((s) => s.canGoBack);
  const canGoForward = useUiStore((s) => s.canGoForward);
  const goBack = useUiStore((s) => s.goBack);
  const goForward = useUiStore((s) => s.goForward);
  const activeProviderId = useProviderSessionStore((s) => s.activeProviderId);
  const setActiveProvider = useProviderSessionStore((s) => s.setActiveProvider);
  const statuses = useProviderSessionStore((s) => s.statuses);
  const searchHistory = useSearchHistoryStore((s) => s.entries);
  const recordSearch = useSearchHistoryStore((s) => s.record);
  const clearSearchHistory = useSearchHistoryStore((s) => s.clear);

  const [keyword, setKeyword] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hotSearches, setHotSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (activeProviderId === 'local') {
      setHotSearches([]);
      return;
    }
    window.musicPlayer.music
      .getSearchHotSearches(activeProviderId as RemoteProviderId)
      .then((result) => {
        if (result.ok) {
          setHotSearches(result.data.slice(0, 8).map((h) => h.keyword));
        }
      })
      .catch(() => {});
  }, [activeProviderId]);

  const handleInputChange = (value: string) => {
    setKeyword(value);
    setDropdownOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed || activeProviderId === 'local') {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      window.musicPlayer.music
        .getSearchSuggestions(activeProviderId as RemoteProviderId, trimmed)
        .then((result) => {
          if (result.ok) setSuggestions(result.data.slice(0, 6).map((s) => s.keyword));
        })
        .catch(() => {});
    }, 350);
  };

  const submitSearch = (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    recordSearch(trimmed);
    setDropdownOpen(false);
    setKeyword(trimmed);
    onSearch(trimmed);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="nav-history-controls">
          <button className="history-btn" title="后退" disabled={!canGoBack} onClick={goBack}>
            <BackIcon size={14} strokeWidth={2} />
          </button>
          <button className="history-btn" title="前进" disabled={!canGoForward} onClick={goForward}>
            <ForwardIcon size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="search-capsule">
          <div className="search-input-wrapper">
            <SearchIcon size={13} strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              placeholder="搜索歌曲、歌手、专辑..."
              value={keyword}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch(keyword);
              }}
            />
          </div>

          {dropdownOpen && (
            <div className="search-dropdown active">
              {hotSearches.length > 0 && (
                <>
                  <div className="dropdown-section-title">热门搜索</div>
                  <div className="tag-cloud">
                    {hotSearches.map((hot) => (
                      <span key={hot} className="tag-item" onMouseDown={(e) => { e.preventDefault(); submitSearch(hot); }}>
                        {hot}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {suggestions.length > 0 && (
                <>
                  <div className="dropdown-section-title">搜索建议</div>
                  <div className="tag-cloud">
                    {suggestions.map((s) => (
                      <span key={s} className="tag-item" onMouseDown={(e) => { e.preventDefault(); submitSearch(s); }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {searchHistory.length > 0 && (
                <>
                  <div className="dropdown-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>搜索历史</span>
                    <button
                      style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}
                      onClick={clearSearchHistory}
                    >
                      清空
                    </button>
                  </div>
                  <div className="tag-cloud">
                    {searchHistory.map((h) => (
                      <span key={h} className="tag-item" onMouseDown={(e) => { e.preventDefault(); submitSearch(h); }}>
                        {h}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <ProviderSegmentedControl<RemoteProviderId>
          options={[
            { id: 'netease', label: '网易云' },
            { id: 'qq', label: 'QQ 音乐' }
          ]}
          activeId={activeProviderId as RemoteProviderId}
          onChange={(providerId) => setActiveProvider(providerId)}
          ariaLabel="切换音乐平台"
        />

        <ThemeToggle />

        <UserBadge status={statuses[activeProviderId]} onClick={onOpenLogin} />

        <WindowControls />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [isLight, setIsLight] = useState(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) return theme === 'light';
    return (localStorage.getItem('obao-music-theme-preference') ?? 'dark') === 'light';
  });

  useEffect(() => {
    const sync = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) setIsLight(theme === 'light');
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <button
      className="topbar-action-btn"
      title="切换主题"
      aria-label="切换主题"
      onClick={() => {
        const theme = document.documentElement.getAttribute('data-theme');
        const next = theme ? theme !== 'light' : isLight ? false : true;
        setIsLight(next);
        setTheme(next ? 'light' : 'dark');
      }}
    >
      {isLight ? <ThemeDarkIcon size={15} strokeWidth={2} /> : <ThemeLightIcon size={15} strokeWidth={2} />}
    </button>
  );
}

function UserBadge({ status, onClick }: { status?: LoginStatus; onClick: () => void }) {
  const nickname = status?.nickname;
  return (
    <button
      className="user-profile-badge"
      onClick={onClick}
      title={nickname ? `已登录：${nickname}` : '登录音乐平台'}
      aria-label={nickname ? `用户：${nickname}` : '登录音乐平台'}
    >
      {status?.avatarUrl ? (
        <img className="user-avatar" ref={imageRevealRef} src={status.avatarUrl} alt="" onLoad={onImageReveal} onError={onImageReveal} />
      ) : (
        <div
          className="user-avatar user-avatar-placeholder"
        >
          {nickname ? nickname.slice(0, 1).toUpperCase() : '登'}
        </div>
      )}
      <span className="user-name">{nickname ?? '登录'}</span>
    </button>
  );
}
