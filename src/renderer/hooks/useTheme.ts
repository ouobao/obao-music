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
      applyThemeAttribute(theme);
      window.musicPlayer.app.setWindowTheme?.(
        {
          preference: preference as 'system' | 'light' | 'dark',
          resolvedThemeId: theme === 'light' ? 'white' : 'black'
        }
      ).catch(() => {});
    };

    apply();
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, []);
}

/**
 * 主题切换的过渡开关。
 * tokens.css 里用 html[data-theme-transition='true'] 给"所有元素"临时挂上
 * 颜色过渡，摘掉后不留任何常驻 transition —— 因为绝大多数容器都自己声
 * 明了 transition，靠选择器清单逐个列是列不全的。
 * 时长与 tokens 的 --duration-base 对齐，多留 40ms 余量避免掐断。
 */
let themeTransitionTimer = 0;

function applyThemeAttribute(theme: 'light' | 'dark') {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;

  const prefersReduced = root.dataset.reduceEffects === 'true';
  if (!prefersReduced) {
    root.setAttribute('data-theme-transition', 'true');
    window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => {
      root.removeAttribute('data-theme-transition');
    }, 260);
  }

  root.setAttribute('data-theme', theme);
}

export function setTheme(theme: 'light' | 'dark') {
  const preference = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem('obao-music-theme-preference', preference);
  applyThemeAttribute(theme);
  window.musicPlayer.app.setWindowTheme?.({
    preference,
    resolvedThemeId: theme === 'light' ? 'white' : 'black'
  }).catch(() => {});
}
