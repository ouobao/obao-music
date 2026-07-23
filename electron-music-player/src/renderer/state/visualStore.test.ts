import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualStore } from './visualStore';
import { visualThemes } from '../visual/visualThemes';

describe('visual store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockSystemTheme(false);
    useVisualStore.getState().resetForTest();
  });

  it('defaults to the Windows color scheme preference', () => {
    expect(useVisualStore.getState()).toMatchObject({
      themePreference: 'system',
      themeId: 'white'
    });

    mockSystemTheme(true);
    useVisualStore.getState().resetForTest();
    expect(useVisualStore.getState()).toMatchObject({
      themePreference: 'system',
      themeId: 'black'
    });
  });

  it('updates system mode live while preserving a manual override', () => {
    useVisualStore.getState().syncSystemTheme('black');
    expect(useVisualStore.getState().themeId).toBe('black');

    useVisualStore.getState().setThemePreference('light');
    useVisualStore.getState().syncSystemTheme('black');
    expect(useVisualStore.getState()).toMatchObject({
      themePreference: 'light',
      themeId: 'white'
    });
  });

  it('persists only the selected preference', () => {
    useVisualStore.getState().setThemePreference('dark');

    expect(JSON.parse(window.localStorage.getItem('oubao-music-visual-preferences') ?? '{}')).toEqual({
      themePreference: 'dark'
    });
    expect(window.localStorage.getItem('mine-radio-visual-preferences')).toBeNull();
  });

  it.each([
    ['defaultWhite', 'light', 'white'],
    ['obsidian', 'dark', 'black'],
    ['ocean', 'system', 'white']
  ] as const)('migrates legacy theme %s to %s', async (legacyThemeId, preference, themeId) => {
    window.localStorage.setItem(
      'mine-radio-visual-preferences',
      JSON.stringify({ themeId: legacyThemeId, performanceMode: 'low', reducedMotion: true })
    );

    vi.resetModules();
    const { useVisualStore: freshStore } = await import('./visualStore');

    expect(freshStore.getState()).toMatchObject({ themePreference: preference, themeId });
    expect(freshStore.getState()).not.toHaveProperty('performanceMode');
    expect(freshStore.getState()).not.toHaveProperty('reducedMotion');
  });

  it('keeps white and black text combinations at WCAG AA contrast', () => {
    expect(Object.keys(visualThemes)).toEqual(['white', 'black']);

    Object.values(visualThemes).forEach((theme) => {
      expect(readContrastRatio(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(readContrastRatio(theme.text, theme.deepSurface)).toBeGreaterThanOrEqual(4.5);
      expect(readContrastRatio(theme.mutedText, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(readContrastRatio(theme.inverseText, theme.accent)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

function mockSystemTheme(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: dark,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
}

function readContrastRatio(foreground: string, background: string) {
  const foregroundLuminance = readRelativeLuminance(foreground);
  const backgroundLuminance = readRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function readRelativeLuminance(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
