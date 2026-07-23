import { create } from 'zustand';
import type { VisualThemeId } from '../visual/visualThemes';

export type ThemePreference = 'system' | 'light' | 'dark';

interface VisualState {
  themePreference: ThemePreference;
  themeId: VisualThemeId;
  setThemePreference: (themePreference: ThemePreference) => void;
  syncSystemTheme: (themeId: VisualThemeId) => void;
  resetForTest: () => void;
}

const storageKey = 'oubao-music-visual-preferences';
const legacyStorageKey = 'mine-radio-visual-preferences';

const createDefaultPreferences = () => ({
  themePreference: 'system' as ThemePreference,
  themeId: readSystemTheme()
});

export const useVisualStore = create<VisualState>((set, get) => {
  const initialPreferences = readPreferences();

  return {
    ...initialPreferences,
    setThemePreference: (themePreference) => {
      const themeId = resolveThemePreference(themePreference);
      set({ themePreference, themeId });
      persist(get());
    },
    syncSystemTheme: (themeId) => {
      set((state) => (
        state.themePreference === 'system' && state.themeId !== themeId
          ? { themeId }
          : state
      ));
    },
    resetForTest: () => {
      set(createDefaultPreferences());
    }
  };
});

export function readSystemTheme(): VisualThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'white';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white';
}

function resolveThemePreference(themePreference: ThemePreference): VisualThemeId {
  if (themePreference === 'light') {
    return 'white';
  }
  if (themePreference === 'dark') {
    return 'black';
  }
  return readSystemTheme();
}

function readPreferences(): Pick<VisualState, 'themePreference' | 'themeId'> {
  const defaults = createDefaultPreferences();
  if (typeof window === 'undefined') {
    return defaults;
  }

  for (const key of [storageKey, legacyStorageKey]) {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const themePreference = readThemePreference(parsed);
      return {
        themePreference,
        themeId: resolveThemePreference(themePreference)
      };
    } catch {
      continue;
    }
  }

  return defaults;
}

function readThemePreference(parsed: Record<string, unknown>): ThemePreference {
  if (isThemePreference(parsed.themePreference)) {
    return parsed.themePreference;
  }

  if (parsed.themeId === 'defaultWhite' || parsed.themeId === 'white') {
    return 'light';
  }
  if (parsed.themeId === 'obsidian' || parsed.themeId === 'black') {
    return 'dark';
  }
  return 'system';
}

function persist(state: Pick<VisualState, 'themePreference'>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ themePreference: state.themePreference })
  );
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}
