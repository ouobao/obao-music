import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Maximize2,
  Minus,
  RotateCcw,
  Search,
  Settings,
  UserRound,
  X
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react';
import { createPortal } from 'react-dom';
import type { RemoteProviderId, Song } from '../../shared/musicTypes';
import type { LoginStatus, SearchHotSearch, SearchSuggestion } from '../../shared/providerTypes';
import { LoginDialog } from './LoginDialog';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useAnchoredPopoverStyle } from '../hooks/useAnchoredPopoverStyle';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { useAudioOutputStore } from '../state/audioOutputStore';
import { getLoggedInProviderIds, useProviderSessionStore, type SessionProviderId } from '../state/providerSessionStore';
import {
  contentTransitionStyles,
  useUiStore,
  type ContentTransitionStyle
} from '../state/uiStore';
import styles from './TopBar.module.css';

export interface TopBarProps {
  isLoginOpen: boolean;
  onLoginOpenChange: (open: boolean) => void;
  onSearchSubmit: (keyword: string) => void;
  /** Preferred remote search suggestions. `onSearchSuggest` remains as the old song-only fallback. */
  onSearchSuggestions?: (providerId: RemoteProviderId, keyword: string) => Promise<SearchSuggestion[]>;
  onSearchHotSearches?: (providerId: RemoteProviderId) => Promise<SearchHotSearch[]>;
  searchProviderId?: RemoteProviderId;
  searchHistory?: string[];
  onClearSearchHistory?: () => void;
  onSearchSuggest?: (keyword: string) => Promise<Song[]>;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

const SEARCH_SUGGESTION_DEBOUNCE_MS = 350;
const MIN_LATIN_SEARCH_SUGGESTION_LENGTH = 2;
const SEARCH_SUGGESTION_LIMIT = 5;
const HOT_SEARCH_LIMIT = 10;

type SearchDropdownItemKind = 'direct' | 'suggestion' | 'legacy' | 'history' | 'hot';

interface SearchDropdownItem {
  id: string;
  kind: SearchDropdownItemKind;
  keyword: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

interface SearchDropdownGroup {
  id: string;
  label: string;
  items: SearchDropdownItem[];
}

const providerLabels: Record<SessionProviderId, string> = {
  netease: '网易云音乐',
  qq: 'QQ 音乐'
};

const contentTransitionStyleLabels: Record<ContentTransitionStyle, string> = {
  soft: '柔和',
  directional: '滑移',
  layered: '分层'
};

type TopBarSessionStatuses = Record<SessionProviderId, LoginStatus>;
export type ActiveTopPopover = 'search' | 'theme' | 'account' | 'settings' | null;

function resolveRemoteSearchProviderId(providerId: SessionProviderId | null): RemoteProviderId {
  return providerId === 'netease' ? 'netease' : 'qq';
}

export const TopBar = memo(function TopBar({
  isLoginOpen,
  onLoginOpenChange,
  onSearchSubmit,
  onSearchSuggestions,
  onSearchHotSearches,
  searchProviderId,
  searchHistory = [],
  onClearSearchHistory,
  onSearchSuggest,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false
}: TopBarProps) {
  const [activeTopPopover, setActiveTopPopover] = useState<ActiveTopPopover>(
    isLoginOpen ? 'account' : null
  );
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [legacySuggestions, setLegacySuggestions] = useState<Song[]>([]);
  const [hotSearches, setHotSearches] = useState<SearchHotSearch[]>([]);
  const [hotSearchProviderId, setHotSearchProviderId] = useState<RemoteProviderId | null>(null);
  const [isSuggestionLoading, setSuggestionLoading] = useState(false);
  const [isHotSearchLoading, setHotSearchLoading] = useState(false);
  const [isComposing, setComposing] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const searchBoxRef = useRef<HTMLFormElement | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const hotSearchRequestIdRef = useRef(0);
  const hotSearchInFlightProviderRef = useRef<RemoteProviderId | null>(null);
  const hotSearchCacheRef = useRef<Partial<Record<RemoteProviderId, SearchHotSearch[]>>>({});
  const isComposingRef = useRef(false);
  const submittedKeywordRef = useRef('');
  const loginButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const statuses = useProviderSessionStore((state) => state.statuses);
  const defaultProviderId = useProviderSessionStore((state) => state.defaultProviderId);
  const defaultStatus = defaultProviderId ? statuses[defaultProviderId] : null;
  const loginLabel = formatAccountSummaryLabel(statuses, defaultProviderId);
  const resolvedSearchProviderId = searchProviderId ?? resolveRemoteSearchProviderId(defaultProviderId);
  const searchListboxId = `${useId()}-search-listbox`;
  const normalizedSearchInput = searchInput.trim();
  const isSearchPopoverOpen = activeTopPopover === 'search'
    && (Boolean(onSearchHotSearches) || searchHistory.length > 0 || normalizedSearchInput.length > 0);

  const searchDropdownGroups = useMemo(() => createSearchDropdownGroups({
    keyword: normalizedSearchInput,
    suggestions,
    legacySuggestions,
    hotSearches: hotSearchProviderId === resolvedSearchProviderId ? hotSearches : [],
    searchHistory
  }), [hotSearchProviderId, hotSearches, legacySuggestions, normalizedSearchInput, resolvedSearchProviderId, searchHistory, suggestions]);
  const searchDropdownItems = useMemo(
    () => searchDropdownGroups.flatMap((group) => group.items),
    [searchDropdownGroups]
  );
  const searchDropdownItemSignature = useMemo(
    () => searchDropdownItems.map((item) => `${item.id}\u0000${item.keyword}`).join('\u0001'),
    [searchDropdownItems]
  );

  const openTopPopover = useCallback((nextPopover: ActiveTopPopover) => {
    setActiveTopPopover(nextPopover);
    if (nextPopover !== 'search') {
      setActiveOptionIndex(-1);
    }
    onLoginOpenChange(nextPopover === 'account');
  }, [onLoginOpenChange]);

  const closeSearchPopover = useCallback(() => {
    setActiveTopPopover((currentPopover) => (
      currentPopover === 'search' ? null : currentPopover
    ));
    setActiveOptionIndex(-1);
  }, []);

  useEffect(() => {
    setActiveTopPopover((currentPopover) => {
      if (isLoginOpen) {
        return 'account';
      }
      return currentPopover === 'account' ? null : currentPopover;
    });
  }, [isLoginOpen]);

  useEffect(() => {
    if (activeTopPopover === null) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element
        && target.closest(`[data-top-popover-owner="${activeTopPopover}"]`)
      ) {
        return;
      }
      openTopPopover(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        openTopPopover(null);
      }
    }

    function handleWindowBlur() {
      openTopPopover(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [activeTopPopover, openTopPopover]);

  const loadHotSearches = useCallback(() => {
    if (!onSearchHotSearches) {
      return;
    }

    const cachedHotSearches = hotSearchCacheRef.current[resolvedSearchProviderId];
    if (cachedHotSearches) {
      setHotSearches(cachedHotSearches);
      setHotSearchProviderId(resolvedSearchProviderId);
      return;
    }

    if (hotSearchInFlightProviderRef.current === resolvedSearchProviderId) {
      return;
    }

    const requestId = hotSearchRequestIdRef.current + 1;
    hotSearchRequestIdRef.current = requestId;
    hotSearchInFlightProviderRef.current = resolvedSearchProviderId;
    setHotSearchLoading(true);

    void onSearchHotSearches(resolvedSearchProviderId)
      .then((nextHotSearches) => {
        if (hotSearchRequestIdRef.current !== requestId) {
          return;
        }

        const limitedHotSearches = nextHotSearches.slice(0, HOT_SEARCH_LIMIT);
        hotSearchCacheRef.current[resolvedSearchProviderId] = limitedHotSearches;
        setHotSearches(limitedHotSearches);
        setHotSearchProviderId(resolvedSearchProviderId);
      })
      .catch(() => {
        if (hotSearchRequestIdRef.current === requestId) {
          setHotSearches([]);
          setHotSearchProviderId(resolvedSearchProviderId);
        }
      })
      .finally(() => {
        if (hotSearchRequestIdRef.current === requestId) {
          hotSearchInFlightProviderRef.current = null;
          setHotSearchLoading(false);
        }
      });
  }, [onSearchHotSearches, resolvedSearchProviderId]);

  useEffect(() => {
    if (activeTopPopover === 'search') {
      loadHotSearches();
    }
  }, [activeTopPopover, loadHotSearches]);

  useEffect(() => {
    const keyword = normalizedSearchInput;
    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;

    if (
      isComposing
      || !shouldRequestSearchSuggestion(keyword)
      || keyword === submittedKeywordRef.current
      || (!onSearchSuggestions && !onSearchSuggest)
    ) {
      setSuggestions([]);
      setLegacySuggestions([]);
      setSuggestionLoading(false);
      return undefined;
    }

    let isCancelled = false;
    setSuggestionLoading(true);
    const timeoutId = window.setTimeout(() => {
      const request = onSearchSuggestions
        ? onSearchSuggestions(resolvedSearchProviderId, keyword)
        : onSearchSuggest!(keyword);

      void request
        .then((nextSuggestions) => {
          if (isCancelled || suggestionRequestIdRef.current !== requestId) {
            return;
          }

          if (onSearchSuggestions) {
            setSuggestions((nextSuggestions as SearchSuggestion[]).slice(0, SEARCH_SUGGESTION_LIMIT));
            setLegacySuggestions([]);
          } else {
            setLegacySuggestions((nextSuggestions as Song[]).slice(0, SEARCH_SUGGESTION_LIMIT));
            setSuggestions([]);
          }
        })
        .catch(() => {
          if (isCancelled || suggestionRequestIdRef.current !== requestId) {
            return;
          }

          setSuggestions([]);
          setLegacySuggestions([]);
        })
        .finally(() => {
          if (!isCancelled && suggestionRequestIdRef.current === requestId) {
            setSuggestionLoading(false);
          }
        });
    }, SEARCH_SUGGESTION_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isComposing, normalizedSearchInput, onSearchSuggest, onSearchSuggestions, resolvedSearchProviderId]);

  useEffect(() => {
    setActiveOptionIndex(-1);
  }, [searchDropdownItemSignature]);

  useEffect(() => {
    setActiveOptionIndex(-1);
  }, [resolvedSearchProviderId]);

  return (
    <header className="top-bar" data-top-popover={activeTopPopover ?? undefined}>
      <div className="top-bar-drag-surface" aria-hidden="true" />
      <div className="history-actions">
        <button className="icon-button" type="button" aria-label="后退" disabled={!canGoBack} onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={19} />
        </button>
        <button className="icon-button" type="button" aria-label="前进" disabled={!canGoForward} onClick={onForward}>
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      </div>

      <form
        className={`search-box ${styles.searchBox}`}
        role="search"
        ref={searchBoxRef}
        data-top-popover-owner="search"
        onSubmit={handleSearchSubmit}
      >
        <Search aria-hidden="true" size={17} />
        <input
          className={styles.searchInput}
          name="keyword"
          aria-activedescendant={activeOptionIndex >= 0 ? getSearchOptionId(searchListboxId, activeOptionIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={searchListboxId}
          aria-expanded={isSearchPopoverOpen}
          aria-label="搜索音乐"
          type="search"
          role="combobox"
          placeholder="搜索音乐、歌手、歌单"
          value={searchInput}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue.trim() !== submittedKeywordRef.current) {
              submittedKeywordRef.current = '';
            }
            setActiveOptionIndex(-1);
            setSearchInput(nextValue);
          }}
          onFocus={() => {
            openTopPopover('search');
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false;
            setComposing(false);
            setActiveOptionIndex(-1);
            setSearchInput(event.currentTarget.value);
          }}
          onKeyDown={handleSearchKeyDown}
        />
      </form>
      <SearchExperiencePopover
        anchorRef={searchBoxRef}
        listboxId={searchListboxId}
        open={isSearchPopoverOpen}
        groups={searchDropdownGroups}
        activeOptionIndex={activeOptionIndex}
        isHotSearchLoading={isHotSearchLoading}
        isSuggestionLoading={isSuggestionLoading}
        keyword={normalizedSearchInput}
        onClearHistory={onClearSearchHistory}
        onSelectItem={(item) => submitSearch(item.keyword)}
      />

      <div className="top-drag-space" aria-hidden="true" />

      <div className="top-actions">
        <ThemeSwitcher
          open={activeTopPopover === 'theme'}
          onOpenChange={(open) => openTopPopover(open ? 'theme' : null)}
        />
        <button
          className="login-button"
          type="button"
          aria-expanded={activeTopPopover === 'account'}
          data-top-popover-owner="account"
          ref={loginButtonRef}
          onClick={toggleLoginPanel}
        >
          <UserRound aria-hidden="true" size={17} />
          <span>{loginLabel}</span>
        </button>
        <LoginDialog
          anchorRef={loginButtonRef}
          open={activeTopPopover === 'account'}
          onClose={() => openTopPopover(null)}
        />
        {defaultStatus?.loggedIn && defaultStatus.playbackReady === false ? (
          <span className="top-provider-warning">播放授权不完整</span>
        ) : null}
        <button
          className="icon-button"
          type="button"
          aria-label="设置"
          aria-expanded={activeTopPopover === 'settings'}
          data-top-popover-owner="settings"
          ref={settingsButtonRef}
          onClick={toggleSettingsPanel}
        >
          <Settings aria-hidden="true" size={17} />
        </button>
        <SettingsPopover anchorRef={settingsButtonRef} open={activeTopPopover === 'settings'} />
      </div>

      <div className="window-controls" aria-label="窗口控制">
        <button className="window-control-button" type="button" aria-label="最小化窗口" onClick={minimizeWindow}>
          <Minus aria-hidden="true" size={16} />
        </button>
        <button className="window-control-button" type="button" aria-label="最大化窗口" onClick={toggleMaximizeWindow}>
          <Maximize2 aria-hidden="true" size={15} />
        </button>
        <button className="window-control-button window-close-button" type="button" aria-label="关闭窗口" onClick={closeWindow}>
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </header>
  );

  function toggleLoginPanel() {
    openTopPopover(activeTopPopover === 'account' ? null : 'account');
  }

  function toggleSettingsPanel() {
    openTopPopover(activeTopPopover === 'settings' ? null : 'settings');
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposingRef.current) {
      return;
    }

    const selectedItem = searchDropdownItems[activeOptionIndex];
    if (selectedItem) {
      submitSearch(selectedItem.keyword);
      return;
    }

    submitSearch(searchInput);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (isComposingRef.current || event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPopover();
      return;
    }

    if (searchDropdownItems.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveOptionIndex((currentIndex) => (
        currentIndex < searchDropdownItems.length - 1 ? currentIndex + 1 : 0
      ));
      openTopPopover('search');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveOptionIndex((currentIndex) => (
        currentIndex > 0 ? currentIndex - 1 : searchDropdownItems.length - 1
      ));
      openTopPopover('search');
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveOptionIndex(0);
      openTopPopover('search');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveOptionIndex(searchDropdownItems.length - 1);
      openTopPopover('search');
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = searchDropdownItems[activeOptionIndex];
      submitSearch(selectedItem?.keyword ?? searchInput);
    }
  }

  function submitSearch(keyword: string) {
    const normalizedKeyword = keyword.trim();

    if (!normalizedKeyword) {
      return;
    }

    suggestionRequestIdRef.current += 1;
    submittedKeywordRef.current = normalizedKeyword;
    setSearchInput(normalizedKeyword);
    setSuggestions([]);
    setLegacySuggestions([]);
    setActiveOptionIndex(-1);
    closeSearchPopover();
    onSearchSubmit(normalizedKeyword);
  }
});

interface SettingsPopoverProps {
  anchorRef: RefObject<HTMLButtonElement>;
  open: boolean;
}

function SettingsPopover({ anchorRef, open }: SettingsPopoverProps) {
  const presence = useAnimatedPresence(open);
  const audioOutputSettings = useAudioOutputStore((state) => state.settings);
  const isAudioOutputSaving = useAudioOutputStore((state) => state.isSaving);
  const isAudioOutputRestarting = useAudioOutputStore((state) => state.isRestarting);
  const audioOutputErrorMessage = useAudioOutputStore((state) => state.errorMessage);
  const loadAudioOutputSettings = useAudioOutputStore((state) => state.loadSettings);
  const setExclusiveMode = useAudioOutputStore((state) => state.setExclusiveMode);
  const restartApplication = useAudioOutputStore((state) => state.restart);
  const contentTransitionStyle = useUiStore((state) => state.contentTransitionStyle);
  const reduceEffects = useUiStore((state) => state.reduceEffects);
  const setContentTransitionStyle = useUiStore((state) => state.setContentTransitionStyle);
  const setReduceEffects = useUiStore((state) => state.setReduceEffects);
  const popoverStyle = useAnchoredPopoverStyle({
    anchorRef,
    gap: 10,
    open: presence.isMounted,
    placement: 'bottom-end',
    width: 320
  });

  useEffect(() => {
    if (open) {
      void loadAudioOutputSettings();
    }
  }, [loadAudioOutputSettings, open]);

  if (!presence.isMounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="settings-popover glass-surface"
      role="dialog"
      aria-label="设置面板"
      data-top-popover-owner="settings"
      data-state={presence.state}
      style={popoverStyle}
    >
      <div className="settings-popover-section">
        <span className="settings-popover-title">动效</span>
        <div className="settings-motion-control">
          <span className="settings-control-label">页面切换</span>
          <div className="settings-motion-segments" role="radiogroup" aria-label="页面切换">
            {contentTransitionStyles.map((transitionStyle) => (
              <button
                className={
                  transitionStyle === contentTransitionStyle
                    ? 'settings-motion-option settings-motion-option-active'
                    : 'settings-motion-option'
                }
                type="button"
                role="radio"
                aria-checked={transitionStyle === contentTransitionStyle}
                key={transitionStyle}
                onClick={() => setContentTransitionStyle(transitionStyle)}
              >
                {contentTransitionStyleLabels[transitionStyle]}
              </button>
            ))}
          </div>
        </div>
        <label className="settings-switch-control settings-reduce-effects-control">
          <span>减少动态与特效</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="减少动态与特效"
            checked={reduceEffects}
            onChange={(event) => setReduceEffects(event.currentTarget.checked)}
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </label>
      </div>
      {audioOutputSettings?.supported || audioOutputErrorMessage ? (
        <div className="settings-popover-section settings-audio-output-section">
          <span className="settings-popover-title">音频输出</span>
          {audioOutputSettings?.supported ? (
            <label className="settings-switch-control settings-audio-output-control">
              <span>独占模式</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="独占模式"
                checked={audioOutputSettings.exclusiveModeEnabled}
                disabled={isAudioOutputSaving || isAudioOutputRestarting}
                onChange={(event) => void setExclusiveMode(event.currentTarget.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true" />
            </label>
          ) : null}
          {audioOutputSettings?.restartRequired ? (
            <div className="settings-audio-restart-row">
              <span className="settings-audio-restart-status" role="status">重启后生效</span>
              <button
                className="settings-audio-restart-button"
                type="button"
                disabled={isAudioOutputSaving || isAudioOutputRestarting}
                onClick={() => void restartApplication()}
              >
                <RotateCcw aria-hidden="true" size={14} />
                <span>{isAudioOutputRestarting ? '正在重启' : '重启'}</span>
              </button>
            </div>
          ) : null}
          {audioOutputErrorMessage ? (
            <span className="settings-audio-output-error" role="alert">{audioOutputErrorMessage}</span>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

interface SearchExperiencePopoverProps {
  anchorRef: RefObject<HTMLFormElement>;
  listboxId: string;
  open: boolean;
  groups: SearchDropdownGroup[];
  activeOptionIndex: number;
  isHotSearchLoading: boolean;
  isSuggestionLoading: boolean;
  keyword: string;
  onClearHistory?: () => void;
  onSelectItem: (item: SearchDropdownItem) => void;
}

function SearchExperiencePopover({
  anchorRef,
  listboxId,
  open,
  groups,
  activeOptionIndex,
  isHotSearchLoading,
  isSuggestionLoading,
  keyword,
  onClearHistory,
  onSelectItem
}: SearchExperiencePopoverProps) {
  const presence = useAnimatedPresence(open);
  const popoverStyle = useAnchoredPopoverStyle({
    anchorRef,
    gap: 8,
    open: presence.isMounted,
    placement: 'bottom-end',
    width: 380
  });
  const hasItems = groups.some((group) => group.items.length > 0);

  if (!presence.isMounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={`search-suggestion-popover glass-surface ${styles.popover}`}
      role="dialog"
      aria-label="搜索提示"
      aria-hidden={presence.state === 'closed'}
      data-top-popover-owner="search"
      data-state={presence.state}
      style={popoverStyle}
    >
      <div id={listboxId} role="listbox" aria-label="搜索提示">
        {groups.map((group, groupIndex) => {
          const itemOffset = groups
            .slice(0, groupIndex)
            .reduce((total, previousGroup) => total + previousGroup.items.length, 0);

          return (
            <div className={styles.section} role="group" aria-label={group.label} key={group.id}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{group.label}</span>
                {group.id === 'history' && group.items.length > 0 && onClearHistory ? (
                  <button
                    className={styles.clearHistoryButton}
                    type="button"
                    aria-label="清空搜索历史"
                    title="清空搜索历史"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onClearHistory}
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                ) : null}
              </div>
              {group.items.map((item, itemIndex) => {
                const optionIndex = itemOffset + itemIndex;
                const isActive = optionIndex === activeOptionIndex;

                return (
                  <button
                    className={`search-suggestion-option ${styles.option} ${isActive ? styles.optionActive : ''}`}
                    type="button"
                    role="option"
                    id={getSearchOptionId(listboxId, optionIndex)}
                    aria-selected={isActive}
                    key={item.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectItem(item)}
                  >
                    <span className={styles.optionLeading}>
                      <span className={styles.optionIcon} aria-hidden="true">{getSearchDropdownIcon(item.kind)}</span>
                      <span className={styles.optionText}>
                        <strong className={styles.optionTitle}>{item.title}</strong>
                        {item.subtitle ? <small className={styles.optionSubtitle}>{item.subtitle}</small> : null}
                      </span>
                    </span>
                    {item.meta ? <span className={styles.optionMeta}>{item.meta}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
        {isSuggestionLoading && keyword ? (
          <div className={styles.pending} role="status">正在查询...</div>
        ) : null}
        {isHotSearchLoading && !keyword ? (
          <div className={styles.pending} role="status">正在更新热搜...</div>
        ) : null}
        {!hasItems && !isSuggestionLoading && !isHotSearchLoading ? (
          <div className={styles.emptyState} role="status">
            {keyword ? `搜索“${keyword}”` : '暂无热门搜索'}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function formatAccountSummaryLabel(statuses: TopBarSessionStatuses, defaultProviderId: SessionProviderId | null): string {
  const loggedInProviderIds = getLoggedInProviderIds(statuses);

  if (loggedInProviderIds.length === 0) {
    return '登录';
  }

  if (loggedInProviderIds.length > 1) {
    return `${loggedInProviderIds.length} 个平台`;
  }

  const providerId = defaultProviderId ?? loggedInProviderIds[0];
  const status = statuses[providerId];
  return status.nickname?.trim() || providerLabels[providerId];
}

function minimizeWindow() {
  void window.musicPlayer?.window.minimize();
}

function toggleMaximizeWindow() {
  void window.musicPlayer?.window.toggleMaximize();
}

function closeWindow() {
  void window.musicPlayer?.window.close();
}

function createSearchDropdownGroups({
  keyword,
  suggestions,
  legacySuggestions,
  hotSearches,
  searchHistory
}: {
  keyword: string;
  suggestions: SearchSuggestion[];
  legacySuggestions: Song[];
  hotSearches: SearchHotSearch[];
  searchHistory: string[];
}): SearchDropdownGroup[] {
  if (keyword) {
    const suggestionItems = suggestions.map((suggestion) => ({
      id: `suggestion:${suggestion.providerId}:${suggestion.id}`,
      kind: 'suggestion' as const,
      keyword: suggestion.keyword.trim() || suggestion.title,
      title: suggestion.title,
      subtitle: suggestion.subtitle || `${getSearchEntityKindLabel(suggestion.kind)} · ${getRemoteProviderLabel(suggestion.providerId)}`
    }));
    const legacySuggestionItems = legacySuggestions.map((suggestion) => ({
      id: `legacy:${suggestion.id}`,
      kind: 'legacy' as const,
      keyword: suggestion.title,
      title: suggestion.title,
      subtitle: suggestion.artist ? `${suggestion.artist} / ${suggestion.album}` : suggestion.album
    }));
    const remoteItems = suggestionItems.length > 0 ? suggestionItems : legacySuggestionItems;
    const directItem: SearchDropdownItem = {
      id: `direct:${normalizeSearchIdentity(keyword)}`,
      kind: 'direct',
      keyword,
      title: `搜索“${keyword}”`
    };
    const normalizedKeyword = normalizeSearchIdentity(keyword);
    const occupiedIdentities = new Set([
      normalizedKeyword,
      ...remoteItems.flatMap((item) => [
        normalizeSearchIdentity(item.keyword),
        normalizeSearchIdentity(item.title)
      ])
    ]);
    const matchedHistoryItems = searchHistory
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => normalizeSearchIdentity(entry).includes(normalizedKeyword))
      .filter((entry) => {
        const identity = normalizeSearchIdentity(entry);
        if (occupiedIdentities.has(identity)) {
          return false;
        }

        occupiedIdentities.add(identity);
        return true;
      })
      .slice(0, 3)
      .map((entry) => ({
        id: `history:${normalizeSearchIdentity(entry)}`,
        kind: 'history' as const,
        keyword: entry,
        title: entry
      }));
    const groups: SearchDropdownGroup[] = [
      { id: 'suggestions', label: '搜索建议', items: [directItem, ...remoteItems] }
    ];

    if (matchedHistoryItems.length > 0) {
      groups.push({ id: 'history', label: '搜索历史', items: matchedHistoryItems });
    }

    return groups;
  }

  const historyItems = searchHistory
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({
      id: `history:${entry.toLocaleLowerCase()}`,
      kind: 'history' as const,
      keyword: entry,
      title: entry
    }));
  const hotSearchItems = hotSearches.map((hotSearch) => ({
    id: `hot:${hotSearch.providerId}:${hotSearch.id}`,
    kind: 'hot' as const,
    keyword: hotSearch.keyword.trim() || hotSearch.title,
    title: hotSearch.title,
    subtitle: getRemoteProviderLabel(hotSearch.providerId),
    meta: hotSearch.rank ? `#${hotSearch.rank}` : undefined
  }));
  const groups: SearchDropdownGroup[] = [];

  if (historyItems.length > 0) {
    groups.push({ id: 'history', label: '搜索历史', items: historyItems });
  }
  if (hotSearchItems.length > 0) {
    groups.push({ id: 'hot', label: '热搜', items: hotSearchItems });
  }

  return groups;
}

function getSearchDropdownIcon(kind: SearchDropdownItemKind) {
  if (kind === 'history') {
    return <Clock3 size={15} />;
  }

  if (kind === 'hot') {
    return <Flame size={15} />;
  }

  return <Search size={15} />;
}

function normalizeSearchIdentity(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getSearchEntityKindLabel(kind: SearchSuggestion['kind']): string {
  const labels: Record<SearchSuggestion['kind'], string> = {
    song: '歌曲',
    artist: '歌手',
    album: '专辑',
    playlist: '歌单'
  };

  return labels[kind];
}

function getRemoteProviderLabel(providerId: RemoteProviderId): string {
  return providerId === 'netease' ? '网易云音乐' : 'QQ 音乐';
}

function getSearchOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

function shouldRequestSearchSuggestion(keyword: string) {
  return containsCjkCharacter(keyword) || keyword.length >= MIN_LATIN_SEARCH_SUGGESTION_LENGTH;
}

function containsCjkCharacter(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(value);
}
