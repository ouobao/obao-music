import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '../../shared/musicTypes';
import type { SearchHotSearch, SearchSuggestion } from '../../shared/providerTypes';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { useAudioOutputStore, type AudioOutputSettings } from '../state/audioOutputStore';
import { useLibraryStore } from '../state/libraryStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { useUiStore } from '../state/uiStore';
import { TopBar } from './TopBar';

const suggestionSong: Song = {
  id: 'qq:neon-single',
  providerId: 'qq',
  platformSongId: 'neon-single',
  title: 'neon single',
  artist: 'Search Artist',
  album: 'Search Album',
  durationMs: 188000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

const remoteSuggestion: SearchSuggestion = {
  id: 'qq:suggestion-1',
  providerId: 'qq',
  keyword: 'neon rain',
  title: 'Neon Rain',
  kind: 'song',
  subtitle: 'Search Artist · Search Album'
};

const hotSearch: SearchHotSearch = {
  id: 'netease:hot-1',
  providerId: 'netease',
  keyword: '夏夜入梦前',
  title: '夏夜入梦前',
  rank: 1
};

const qqPlaylist: Playlist = {
  id: 'qq:created-1',
  providerId: 'qq',
  title: 'QQ Created',
  description: 'QQ songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ Music',
  ownership: 'created'
};

const neteasePlaylist: Playlist = {
  id: 'netease:created-1',
  providerId: 'netease',
  title: 'Netease Created',
  description: 'Netease songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceLabel: 'Netease',
  ownership: 'created'
};

describe('TopBar', () => {
  beforeEach(() => {
    useAudioOutputStore.getState().resetForTest();
    useAppNotificationStore.getState().resetForTest();
    useProviderSessionStore.getState().resetForTest();
    useLibraryStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    useAppNotificationStore.getState().resetForTest();
    Reflect.deleteProperty(window, 'musicPlayer');
  });

  it('uses the static glass material for the theme popover without sampling the window', () => {
    const capturePopoverBackdrop = vi.fn(async () => 'data:image/png;base64,theme-edge');
    window.musicPlayer = {
      visual: { capturePopoverBackdrop }
    } as unknown as Window['musicPlayer'];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getMockRect(this: HTMLElement) {
      if ((this as HTMLElement).classList.contains('theme-popover')) {
        return createRect(764, 60, 360, 351);
      }

      return createRect(1070, 16, 52, 36);
    });

    const { container } = render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(container.querySelector<HTMLButtonElement>('.theme-trigger') as HTMLButtonElement);

    expect(capturePopoverBackdrop).not.toHaveBeenCalled();
    expect(document.body.querySelector('.theme-popover')).not.toHaveAttribute('data-sampled-backdrop');
    expect(document.body.querySelector('.popover-sampled-edge')).not.toBeInTheDocument();
  });

  it('controls the complete main-content motion policy from Settings', () => {
    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    const settings = screen.getByRole('dialog', { name: '设置面板' });
    const transitionStyles = within(settings).getByRole('radiogroup', { name: '页面切换' });
    const soft = within(transitionStyles).getByRole('radio', { name: '柔和' });
    const layered = within(transitionStyles).getByRole('radio', { name: '分层' });
    const reduceEffects = within(settings).getByRole('switch', { name: '减少动态与特效' });

    expect(soft).toHaveAttribute('aria-checked', 'true');
    expect(layered).toHaveAttribute('aria-checked', 'false');
    expect(reduceEffects).not.toBeChecked();

    fireEvent.click(layered);
    fireEvent.click(reduceEffects);

    expect(useUiStore.getState().contentTransitionStyle).toBe('layered');
    expect(useUiStore.getState().reduceEffects).toBe(true);
    expect(layered).toHaveAttribute('aria-checked', 'true');
    expect(reduceEffects).toBeChecked();
  });

  it('loads and displays supported audio output settings', async () => {
    const getOutputSettings = vi.fn(async () => createAudioOutputSettings());
    installAudioApiMock({ getOutputSettings });

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    const exclusiveMode = await screen.findByRole('switch', { name: '独占模式' });
    expect(getOutputSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('音频输出')).toBeInTheDocument();
    expect(exclusiveMode).not.toBeChecked();
  });

  it('hides audio output controls when exclusive mode is unsupported', async () => {
    const getOutputSettings = vi.fn(async () => createAudioOutputSettings({ supported: false }));
    installAudioApiMock({ getOutputSettings });

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    await waitFor(() => expect(getOutputSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('switch', { name: '独占模式' })).not.toBeInTheDocument();
    expect(screen.queryByText('音频输出')).not.toBeInTheDocument();
  });

  it('shows audio output loading failures without exposing an unusable switch', async () => {
    installAudioApiMock({
      getOutputSettings: vi.fn(async () => {
        throw new Error('音频输出设置加载失败');
      })
    });

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('音频输出设置加载失败');
    expect(screen.getByText('音频输出')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '独占模式' })).not.toBeInTheDocument();
  });

  it('saves exclusive mode and restarts when the new setting requires it', async () => {
    const setExclusiveMode = vi.fn(async (enabled: boolean) => createAudioOutputSettings({
      exclusiveModeEnabled: enabled,
      restartRequired: enabled
    }));
    const restart = vi.fn(async () => undefined);
    installAudioApiMock({ setExclusiveMode, restart });

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const exclusiveMode = await screen.findByRole('switch', { name: '独占模式' });

    fireEvent.click(exclusiveMode);

    await waitFor(() => expect(setExclusiveMode).toHaveBeenCalledWith(true));
    expect(exclusiveMode).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('重启后生效');

    fireEvent.click(screen.getByRole('button', { name: '重启' }));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '正在重启' })).toBeDisabled();
  });

  it('keeps the exclusive switch stable and reports save failures', async () => {
    installAudioApiMock({
      setExclusiveMode: vi.fn(async () => {
        throw new Error('无法保存独占模式');
      })
    });

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const exclusiveMode = await screen.findByRole('switch', { name: '独占模式' });

    fireEvent.click(exclusiveMode);

    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存独占模式');
    expect(exclusiveMode).not.toBeChecked();
  });

  it('does not repeat application branding at the bottom of Settings', () => {
    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    const settings = screen.getByRole('dialog', { name: '设置面板' });
    expect(within(settings).queryByText('应用')).not.toBeInTheDocument();
    expect(within(settings).queryByText('欧包音乐')).not.toBeInTheDocument();
    expect(settings.querySelector('.settings-app-row')).not.toBeInTheDocument();
  });

  it('switches top popovers through one active owner', () => {
    const { container } = render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );
    const topBar = container.querySelector<HTMLElement>('.top-bar') as HTMLElement;
    const themeTrigger = screen.getByRole('button', { name: '主题设置' });
    const settingsTrigger = screen.getByRole('button', { name: '设置' });

    fireEvent.click(themeTrigger);

    expect(topBar).toHaveAttribute('data-top-popover', 'theme');
    expect(themeTrigger).toHaveAttribute('data-top-popover-owner', 'theme');
    expect(screen.getByRole('dialog', { name: '主题设置面板' }))
      .toHaveAttribute('data-top-popover-owner', 'theme');

    fireEvent.click(settingsTrigger);

    expect(topBar).toHaveAttribute('data-top-popover', 'settings');
    expect(themeTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(settingsTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: '设置面板' }))
      .toHaveAttribute('data-top-popover-owner', 'settings');
    expect(document.body.querySelectorAll('[data-top-popover-owner][data-state="open"]')).toHaveLength(1);
  });

  it('provides a drag surface beneath the interactive top bar controls', () => {
    const { container } = render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );
    const topBar = container.querySelector<HTMLElement>('.top-bar');
    const dragSurface = container.querySelector<HTMLElement>('.top-bar-drag-surface');

    expect(dragSurface).toBeInTheDocument();
    expect(dragSurface?.parentElement).toBe(topBar);
    expect(dragSurface?.nextElementSibling).toHaveClass('history-actions');
  });

  it('closes the active popover from app chrome boundaries but preserves inside interaction', () => {
    const { container } = render(
      <>
        <TopBar
          isLoginOpen={false}
          onLoginOpenChange={noop}
          onSearchSubmit={noop}
          onSearchSuggest={async () => []}
        />
        <main data-testid="top-popover-outside" />
      </>
    );
    const themeTrigger = screen.getByRole('button', { name: '主题设置' });
    const settingsTrigger = screen.getByRole('button', { name: '设置' });

    fireEvent.click(themeTrigger);
    fireEvent.pointerDown(screen.getByRole('dialog', { name: '主题设置面板' }));
    expect(themeTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(container.querySelector('.top-drag-space') as HTMLElement);
    expect(themeTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(settingsTrigger);
    fireEvent.pointerDown(screen.getByTestId('top-popover-outside'));
    expect(settingsTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(themeTrigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(themeTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(settingsTrigger);
    fireEvent(window, new Event('blur'));
    expect(settingsTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('debounces search suggestions and submits a selected suggestion', async () => {
    vi.useFakeTimers();
    const handleSearchSubmit = vi.fn();
    const handleSearchSuggest = vi.fn(async (keyword: string) => [
      {
        ...suggestionSong,
        id: `qq:${keyword}`,
        title: `${keyword} single`
      }
    ]);

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchSuggest={handleSearchSuggest}
      />
    );

    const searchbox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(searchbox);

    fireEvent.change(searchbox, { target: { value: 'n' } });
    fireEvent.change(searchbox, { target: { value: 'ne' } });
    fireEvent.change(searchbox, { target: { value: 'neo' } });

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(handleSearchSuggest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(handleSearchSuggest).toHaveBeenCalledTimes(1);
    expect(handleSearchSuggest).toHaveBeenCalledWith('neo');

    const suggestions = screen.getByRole('listbox', { name: '搜索提示' });
    const option = within(suggestions).getByRole('option', { name: /neo single/ });

    fireEvent.click(option);

    expect(handleSearchSubmit).toHaveBeenCalledWith('neo single');
    expect(screen.queryByRole('listbox', { name: '搜索提示' })).not.toBeInTheDocument();
  });

  it('ignores a pending suggestion response after the search is submitted', async () => {
    vi.useFakeTimers();
    const handleSearchSubmit = vi.fn();
    let resolveSuggestions: (songs: Song[]) => void = () => undefined;
    const handleSearchSuggest = vi.fn(() => new Promise<Song[]>((resolve) => {
      resolveSuggestions = resolve;
    }));

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchSuggest={handleSearchSuggest}
      />
    );

    const searchbox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(searchbox);
    fireEvent.change(searchbox, { target: { value: 'visual runtime' } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(handleSearchSuggest).toHaveBeenCalledWith('visual runtime');
    fireEvent.submit(searchbox.closest('form') as HTMLFormElement);
    expect(handleSearchSubmit).toHaveBeenCalledWith('visual runtime');

    await act(async () => {
      resolveSuggestions([suggestionSong]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('listbox', { name: '搜索提示' })).not.toBeInTheDocument();
  });

  it('requests suggestions for one CJK character while ignoring one latin character', async () => {
    vi.useFakeTimers();
    const handleSearchSuggest = vi.fn(async (keyword: string) => [
      {
        ...suggestionSong,
        id: `qq:${keyword}`,
        title: `${keyword} single`
      }
    ]);

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={handleSearchSuggest}
        searchHistory={['Jazz Classics', 'Z Journey', 'Other']}
      />
    );

    const searchbox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(searchbox);

    fireEvent.change(searchbox, { target: { value: 'z' } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(handleSearchSuggest).not.toHaveBeenCalled();
    const latinOptions = within(screen.getByRole('listbox', { name: '搜索提示' })).getAllByRole('option');
    expect(latinOptions).toHaveLength(3);
    expect(latinOptions[0]).toHaveTextContent('搜索“z”');
    expect(latinOptions[1]).toHaveTextContent('Jazz Classics');
    expect(latinOptions[2]).toHaveTextContent('Z Journey');

    fireEvent.change(searchbox, { target: { value: '张' } });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(handleSearchSuggest).toHaveBeenCalledTimes(1);
    expect(handleSearchSuggest).toHaveBeenCalledWith('张');
    expect(screen.getByRole('listbox', { name: '搜索提示' })).toBeInTheDocument();
  });
  it('loads real hot search and history when the combobox receives focus', async () => {
    const handleSearchSubmit = vi.fn();
    const handleHotSearches = vi.fn(async () => [hotSearch]);
    const clearHistory = vi.fn();

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchHotSearches={handleHotSearches}
        searchHistory={['旧搜索']}
        searchProviderId="netease"
        onClearSearchHistory={clearHistory}
      />
    );

    const combobox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(combobox);

    const listbox = await screen.findByRole('listbox', { name: '搜索提示' });
    expect(handleHotSearches).toHaveBeenCalledWith('netease');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(within(listbox).getByRole('option', { name: /旧搜索/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /夏夜入梦前/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清空搜索历史' }));
    expect(clearHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(within(listbox).getByRole('option', { name: /夏夜入梦前/ }));
    expect(handleSearchSubmit).toHaveBeenCalledWith('夏夜入梦前');
  });

  it('uses remote suggestions with combobox keyboard selection', async () => {
    vi.useFakeTimers();
    const handleSearchSubmit = vi.fn();
    const handleSuggestions = vi.fn(async () => [remoteSuggestion]);

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchSuggestions={handleSuggestions}
        searchProviderId="qq"
        searchHistory={['Neon Rain', 'Neon Archive', 'NE Mix', 'ne live', 'ne overflow', 'Other']}
      />
    );

    const combobox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: 'ne' } });

    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
    });

    expect(handleSuggestions).toHaveBeenCalledWith('qq', 'ne');
    const listbox = screen.getByRole('listbox', { name: '搜索提示' });
    const options = within(listbox).getAllByRole('option');
    const option = within(listbox).getByRole('option', { name: /Neon Rain/ });
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveTextContent('搜索“ne”');
    expect(options[1]).toHaveTextContent('Neon Rain');
    expect(options[2]).toHaveTextContent('Neon Archive');
    expect(options[3]).toHaveTextContent('NE Mix');
    expect(options[4]).toHaveTextContent('ne live');
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(combobox).toHaveAttribute('aria-activedescendant', option.id);

    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(handleSearchSubmit).toHaveBeenCalledWith('neon rain');
  });

  it('clears a stale suggestion selection when the query or popover changes', async () => {
    vi.useFakeTimers();
    const handleSearchSubmit = vi.fn();
    const handleSuggestions = vi.fn(async (_providerId: 'qq' | 'netease', keyword: string) => [
      { ...remoteSuggestion, id: `${keyword}:one`, keyword: `${keyword} one`, title: `${keyword} one` },
      { ...remoteSuggestion, id: `${keyword}:two`, keyword: `${keyword} two`, title: `${keyword} two` }
    ]);

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchSuggestions={handleSuggestions}
        searchProviderId="qq"
      />
    );

    const combobox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: 'first' } });
    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
    });

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox).toHaveAttribute('aria-activedescendant');

    fireEvent.pointerDown(document.body);
    expect(combobox).not.toHaveAttribute('aria-activedescendant');

    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.change(combobox, { target: { value: 'second' } });
    expect(combobox).not.toHaveAttribute('aria-activedescendant');

    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
    });
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(handleSearchSubmit).toHaveBeenCalledWith('second');
  });

  it('clears the active option when same-sized history contents are replaced', () => {
    const props = {
      isLoginOpen: false,
      onLoginOpenChange: noop,
      onSearchSubmit: vi.fn(),
      onSearchSuggest: async () => []
    };
    const { rerender } = render(<TopBar {...props} searchHistory={['old history']} />);
    const combobox = screen.getByRole('combobox', { name: '搜索音乐' });

    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox).toHaveAttribute('aria-activedescendant');

    rerender(<TopBar {...props} searchHistory={['new history']} />);
    expect(combobox).not.toHaveAttribute('aria-activedescendant');
  });

  it('waits for IME composition to end before requesting remote suggestions', async () => {
    vi.useFakeTimers();
    const handleSearchSubmit = vi.fn();
    const handleSuggestions = vi.fn(async () => [remoteSuggestion]);

    render(
      <TopBar
        isLoginOpen={false}
        onLoginOpenChange={noop}
        onSearchSubmit={handleSearchSubmit}
        onSearchSuggestions={handleSuggestions}
      />
    );

    const combobox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(combobox);
    fireEvent.compositionStart(combobox);
    fireEvent.change(combobox, { target: { value: '周' } });

    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
    });
    fireEvent.keyDown(combobox, { key: 'Enter', isComposing: true });

    expect(handleSuggestions).not.toHaveBeenCalled();
    expect(handleSearchSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(combobox, { data: '周' });
    await act(async () => {
      vi.advanceTimersByTime(351);
      await Promise.resolve();
    });

    expect(handleSuggestions).toHaveBeenCalledWith('qq', '周');
  });

  it('summarizes multiple logged-in platforms and exposes account center state', () => {
    useProviderSessionStore.setState({
      statuses: {
        netease: { providerId: 'netease', loggedIn: true, nickname: 'Netease Nick', playbackReady: true },
        qq: { providerId: 'qq', loggedIn: true, nickname: 'QQ Nick', playbackReady: true }
      },
      defaultProviderId: 'qq',
      activeProviderId: 'qq',
      isHydrating: false
    });

    render(
      <TopBar
        isLoginOpen
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    expect(screen.getByRole('button', { name: /2 个平台/ })).toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: /账号中心/ });
    const qqGroup = within(dialog).getByRole('group', { name: /QQ/ });

    expect(within(qqGroup).getByText('QQ Nick')).toBeInTheDocument();
    expect(within(qqGroup).getByText('默认')).toBeInTheDocument();
    expect(within(dialog).getByText('Netease Nick')).toBeInTheDocument();
  });

  it('falls back to readable provider labels when a cached nickname is blank', () => {
    useProviderSessionStore.setState({
      statuses: {
        netease: { providerId: 'netease', loggedIn: false, playbackReady: false },
        qq: { providerId: 'qq', loggedIn: true, nickname: '   ', playbackReady: true }
      },
      defaultProviderId: 'qq',
      activeProviderId: 'qq',
      isHydrating: false
    });

    const { container } = render(
      <TopBar
        isLoginOpen
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    expect(container.querySelector('.login-button')).toHaveTextContent('QQ 音乐');
    const qqGroup = within(screen.getByRole('dialog', { name: '账号中心' })).getByRole('group', { name: 'QQ 音乐' });
    expect(within(qqGroup).getByText('QQ 音乐账号')).toBeInTheDocument();
  });

  it('keeps account center open and reports when login closes without a session', async () => {
    const onLoginOpenChange = vi.fn();
    const login = vi.fn(async (providerId) => ({
      ok: true as const,
      data: { providerId, loggedIn: false, playbackReady: false }
    }));
    installMusicPlayerMock({ login });

    render(
      <TopBar
        isLoginOpen
        onLoginOpenChange={onLoginOpenChange}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /登录.*QQ/ }));

    await waitFor(() => expect(useAppNotificationStore.getState().notification?.message).toMatch(/未获取到.*QQ/));
    expect(onLoginOpenChange).not.toHaveBeenCalledWith(false);
    expect(login).toHaveBeenCalledWith('qq');
  });

  it('publishes rejected account operations without inserting feedback into the account rows', async () => {
    const login = vi.fn(async () => {
      throw new Error('登录接口失败');
    });
    installMusicPlayerMock({ login });

    render(
      <TopBar
        isLoginOpen
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '账号中心' });
    fireEvent.click(within(dialog).getByRole('button', { name: /登录.*QQ/ }));

    await waitFor(() => expect(useAppNotificationStore.getState()).toMatchObject({
      notification: {
        key: 'account-feedback:qq',
        message: '登录接口失败',
        tone: 'error'
      },
      presence: 'open'
    }));
    expect(within(dialog).queryByText('登录接口失败')).not.toBeInTheDocument();
  });

  it('sets the default provider and clears that provider library after logout', async () => {
    const logout = vi.fn(async () => ({ ok: true as const, data: undefined }));
    installMusicPlayerMock({ logout });
    useProviderSessionStore.setState({
      statuses: {
        netease: { providerId: 'netease', loggedIn: true, nickname: 'Netease Nick', playbackReady: true },
        qq: { providerId: 'qq', loggedIn: true, nickname: 'QQ Nick', playbackReady: true }
      },
      defaultProviderId: 'qq',
      activeProviderId: 'qq',
      isHydrating: false
    });
    useLibraryStore.setState({
      providerPlaylists: {
        netease: [neteasePlaylist],
        qq: [qqPlaylist]
      }
    });

    render(
      <TopBar
        isLoginOpen
        onLoginOpenChange={noop}
        onSearchSubmit={noop}
        onSearchSuggest={async () => []}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /设为默认/ }));

    expect(useProviderSessionStore.getState().defaultProviderId).toBe('netease');

    const qqGroup = screen.getByRole('group', { name: /QQ/ });
    fireEvent.click(within(qqGroup).getByRole('button', { name: /退出/ }));

    await waitFor(() => expect(logout).toHaveBeenCalledWith('qq'));
    expect(useProviderSessionStore.getState().statuses.qq.loggedIn).toBe(false);
    expect(useLibraryStore.getState().providerPlaylists.qq).toBeUndefined();
    await waitFor(() => expect(useAppNotificationStore.getState().notification?.message).toMatch(/已退出.*QQ/));
  });
});

function noop() {}

function createRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => undefined
  } as DOMRect;
}

function installMusicPlayerMock(overrides: Partial<Window['musicPlayer']['music']> = {}) {
  const music = {
    getLoginStatus: vi.fn(async (providerId) => ({ ok: true as const, data: { providerId, loggedIn: false, playbackReady: false } })),
    login: vi.fn(async (providerId) => ({ ok: true as const, data: { providerId, loggedIn: true, playbackReady: true } })),
    logout: vi.fn(async () => ({ ok: true as const, data: undefined })),
    search: vi.fn(async () => ({ ok: true as const, data: [] })),
    getUserPlaylists: vi.fn(async (providerId) => ({
      ok: true as const,
      data: providerId === 'qq' ? [qqPlaylist] : [neteasePlaylist]
    })),
    getPlaylistTracks: vi.fn(async () => ({ ok: true as const, data: [] })),
    getSongUrl: vi.fn(async (_providerId, song, quality) => ({
      ok: true as const,
      data: {
        ok: true,
        providerId: song.providerId,
        quality,
        url: 'https://example.test/song.mp3'
      }
    })),
    getLyrics: vi.fn(async (_providerId, song) => ({
      ok: true as const,
      data: {
        ok: true,
        providerId: song.providerId,
        lrc: '[00:01.00]Test lyric'
      }
    })),
    importLocalFiles: vi.fn(async () => ({ ok: true as const, data: [] })),
    ...overrides
  };

  window.musicPlayer = {
    app: { getVersion: async () => '0.1.0' },
    window: {
      minimize: () => undefined,
      toggleMaximize: () => undefined,
      toggleFullscreen: () => undefined,
      close: () => undefined
    },
    music
  } as unknown as Window['musicPlayer'];

  return music;
}

function installAudioApiMock(overrides: Partial<NonNullable<Window['musicPlayer']['audio']>> = {}) {
  installMusicPlayerMock();
  const audio: NonNullable<Window['musicPlayer']['audio']> = {
    getOutputSettings: vi.fn(async () => createAudioOutputSettings()),
    setExclusiveMode: vi.fn(async (enabled) => createAudioOutputSettings({
      exclusiveModeEnabled: enabled,
      restartRequired: enabled
    })),
    restart: vi.fn(async () => undefined),
    ...overrides
  };

  window.musicPlayer.audio = audio;
  return audio;
}

function createAudioOutputSettings(overrides: Partial<AudioOutputSettings> = {}): AudioOutputSettings {
  return {
    supported: true,
    exclusiveModeEnabled: false,
    activeExclusiveMode: false,
    restartRequired: false,
    ...overrides
  };
}
