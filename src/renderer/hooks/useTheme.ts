import { useEffect } from 'react';
import { useUiStore } from '../state/uiStore';

export function useReducedEffects() {
  const reduceEffects = useUiStore((s) => s.reduceEffects);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const reduced = reduceEffects || mediaQuery.matches;
      document.documentElement.dataset.reduceEffects = String(reduced);
    };
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, [reduceEffects]);
}

export function useThemeSync() {
  useEffect(() => {
    const apply = () => {
      const stored = localStorage.getItem('obao-music-visual-preferences');
      let theme: 'dark' | 'light' = 'dark';
      try {
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.themeId === 'white') theme = 'light';
          else if (parsed.themeId === 'black') theme = 'dark';
        }
      } catch {
        // ignore
      }
      const preference = localStorage.getItem('obao-music-theme-preference') ?? 'system';
      if (preference === 'light') theme = 'light';
      else if (preference === 'dark') theme = 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      window.musicPlayer.app.setWindowTheme?.({
        preference: preference as 'system' | 'light' | 'dark',
        resolvedThemeId: theme === 'light' ? 'white' : 'black'
      }).catch(() => {});
    };

    apply();
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, []);
}

export function setTheme(theme: 'light' | 'dark') {
  const preference = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem('obao-music-theme-preference', preference);
  document.documentElement.setAttribute('data-theme', theme);
  window.musicPlayer.app.setWindowTheme?.({
    preference,
    resolvedThemeId: theme === 'light' ? 'white' : 'black'
  }).catch(() => {});
}
