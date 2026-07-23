import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVisualStore } from '../state/visualStore';
import type { VisualSettings } from '../visual/threeScene';
import { getVisualTheme, type VisualTheme } from '../visual/visualThemes';

type ThreeSceneModule = typeof import('../visual/threeScene');
type AmbientScene = ReturnType<ThreeSceneModule['createAmbientScene']>;

const centerPointer = { x: 0.5, y: 0.5 };
const isTestRuntime = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const ambientVisualSettings: VisualSettings = {
  enableGlobal3D: true,
  enableParticles: true,
  enableCardDepth: true,
  enablePlaybackStage: true,
  particleCount: 320,
  pixelRatioCap: 1
};

gsap.registerPlugin(useGSAP);

export const VisualBackdrop = memo(function VisualBackdrop() {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeId = useVisualStore((state) => state.themeId);
  const themePreference = useVisualStore((state) => state.themePreference);
  const syncSystemTheme = useVisualStore((state) => state.syncSystemTheme);
  const settings = ambientVisualSettings;
  const [isBackdropVisible, setBackdropVisible] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => syncSystemTheme(colorScheme.matches ? 'black' : 'white');
    sync();
    colorScheme.addEventListener?.('change', sync);
    return () => colorScheme.removeEventListener?.('change', sync);
  }, [syncSystemTheme]);

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop || isTestRuntime) {
      return undefined;
    }

    const syncVisibility = () => {
      setBackdropVisible((current) => {
        const next = isRenderable(backdrop);
        return current === next ? current : next;
      });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncVisibility);

    syncVisibility();
    resizeObserver?.observe(backdrop);
    window.addEventListener('resize', syncVisibility, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncVisibility);
    };
  }, []);

  useGSAP(
    () => {
      if (isTestRuntime || !isBackdropVisible || !settings.enableGlobal3D || !settings.enableParticles) {
        return;
      }

      const motion = gsap.matchMedia();
      motion.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set('.ambient-sheet', {
          transformOrigin: '50% 50%',
          force3D: true
        });

        const timeline = gsap.timeline({
          repeat: -1,
          yoyo: true,
          defaults: {
            duration: 12,
            ease: 'sine.inOut'
          }
        });

        timeline
          .to('.ambient-sheet-a', { xPercent: 3.6, yPercent: -2.4, rotation: 3.8, scale: 1.04, autoAlpha: 0.74 }, 0)
          .to('.ambient-sheet-b', { xPercent: -4.2, yPercent: 2.8, rotation: -3.2, scale: 1.05, autoAlpha: 0.58 }, 0)
          .to('.ambient-sheet-c', { xPercent: 2.2, yPercent: 3.4, rotation: 2.4, scale: 1.03, autoAlpha: 0.48 }, 0);
      });

      return () => motion.revert();
    },
    {
      dependencies: [isBackdropVisible, settings.enableGlobal3D, settings.enableParticles],
      revertOnUpdate: true,
      scope: backdropRef
    }
  );

  useEffect(() => {
    if (!isBackdropVisible && !isTestRuntime) {
      return undefined;
    }

    const root = document.documentElement;
    let animationFrame = 0;
    let pendingPointer = centerPointer;

    applyGlobalDepth(root, centerPointer);

    function scheduleDepth(pointer: typeof centerPointer) {
      pendingPointer = pointer;

      if (isTestRuntime) {
        applyGlobalDepth(root, pendingPointer);
        return;
      }

      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyGlobalDepth(root, pendingPointer);
      });
    }

    function handleMouseMove(event: MouseEvent) {
      const width = window.innerWidth || 1024;
      const height = window.innerHeight || 768;

      scheduleDepth({
        x: clamp(event.clientX / width),
        y: clamp(event.clientY / height)
      });
    }

    function resetDepth() {
      scheduleDepth(centerPointer);
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('blur', resetDepth);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', resetDepth);
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      applyGlobalDepth(root, centerPointer);
    };
  }, [isBackdropVisible]);

  useEffect(() => {
    const theme = getVisualTheme(themeId);
    const navHover = theme.accentSoft;
    const navActive = `color-mix(in srgb, ${theme.accentSoft} 84%, ${theme.accent} 16%)`;
    const songHover = `color-mix(in srgb, ${theme.accentSoft} 52%, ${theme.surface} 48%)`;
    const primaryActionHover = `color-mix(in srgb, ${theme.accent} 84%, ${theme.text} 16%)`;
    const root = document.documentElement;
    root.dataset.theme = themeId;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = themeId === 'black' ? 'dark' : 'light';

    const variables = {
      '--visual-accent': theme.accent,
      '--visual-accent-soft': theme.accentSoft,
      '--visual-muted': theme.mutedText,
      '--visual-inverse': theme.inverseText,
      '--visual-chrome-text': theme.chromeText,
      '--visual-base-panel-border': theme.panelBorder,
      '--visual-panel-border': theme.panelBorder,
      '--visual-base-surface': theme.surface,
      '--visual-surface': theme.surface,
      '--visual-base-deep-surface': theme.deepSurface,
      '--visual-deep-surface': theme.deepSurface,
      '--visual-text': theme.text,
      '--visual-canvas-base': theme.canvasBase,
      '--visual-canvas-glow': theme.canvasGlow,
      '--visual-particle-a': theme.particleA,
      '--visual-particle-b': theme.particleB,
      '--visual-material-a': theme.materialA,
      '--visual-material-b': theme.materialB,
      '--qq-accent': theme.accent,
      '--qq-accent-hover': theme.materialA,
      '--qq-lyric-active': theme.accent,
      '--qq-primary-action': theme.accent,
      '--qq-primary-action-hover': primaryActionHover,
      '--qq-window-bg': theme.deepSurface,
      '--qq-content-bg': theme.surface,
      '--qq-sidebar-bg': theme.deepSurface,
      '--qq-line': theme.panelBorder,
      '--qq-line-strong': theme.panelBorder,
      '--qq-text': theme.text,
      '--qq-muted': theme.mutedText,
      '--qq-subtle': theme.mutedText,
      '--qq-hover': theme.accentSoft,
      '--qq-song-hover': songHover,
      '--qq-nav-hover': navHover,
      '--qq-nav-active': navActive,
      '--qq-on-accent': theme.inverseText,
      ...createThemeGradientVariables(theme, navHover, navActive),
      '--surface': theme.surface,
      '--surface-soft': theme.deepSurface,
      '--surface-strong': theme.deepSurface,
      '--line': theme.panelBorder,
      '--text': theme.text,
      '--muted': theme.mutedText,
      '--accent': theme.accent,
      '--accent-strong': theme.materialA
    };

    Object.entries(variables).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });

    void window.musicPlayer?.app?.setWindowTheme?.({
      preference: themePreference,
      resolvedThemeId: themeId
    });
  }, [themeId, themePreference]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    if (navigator.userAgent.includes('jsdom')) {
      canvas.dataset.visualMode = 'test';
      return undefined;
    }

    if (!isBackdropVisible) {
      canvas.dataset.visualMode = 'disabled';
      canvas.width = 0;
      canvas.height = 0;
      return undefined;
    }

    let isDisposed = false;
    let scene: AmbientScene | null = null;

    void import('../visual/threeScene')
      .then(({ createAmbientScene }) => {
        if (isDisposed) {
          return;
        }

        scene = createAmbientScene(canvas, {
          theme: getVisualTheme(themeId),
          settings
        });
        scene.start();
      })
      .catch(() => undefined);

    return () => {
      isDisposed = true;
      scene?.dispose();
    };
  }, [isBackdropVisible, themeId, settings]);

  return (
    <div className="visual-backdrop" ref={backdropRef} aria-hidden="true">
      <div className="ambient-mesh">
        <span className="ambient-sheet ambient-sheet-a" />
        <span className="ambient-sheet ambient-sheet-b" />
        <span className="ambient-sheet ambient-sheet-c" />
      </div>
      <canvas className="visual-backdrop-canvas" ref={canvasRef} data-testid="visual-backdrop-canvas" />
    </div>
  );
});

function isRenderable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function applyGlobalDepth(root: HTMLElement, pointer: typeof centerPointer) {
  const x = pointer.x - 0.5;
  const y = pointer.y - 0.5;

  root.style.setProperty('--global-pointer-x', formatPointer(pointer.x));
  root.style.setProperty('--global-pointer-y', formatPointer(pointer.y));
  root.style.setProperty('--global-depth-x', `${formatPointer(x * 34)}px`);
  root.style.setProperty('--global-depth-y', `${formatPointer(y * 24)}px`);
  root.style.setProperty('--global-depth-x-reverse', `${formatPointer(x * -28)}px`);
  root.style.setProperty('--global-tilt-x', `${formatPointer(y * -3.2)}deg`);
  root.style.setProperty('--global-tilt-y', `${formatPointer(x * 4.2)}deg`);
  root.style.setProperty('--space-sidebar-x', `${formatPointer(x * -8)}px`);
  root.style.setProperty('--space-sidebar-tilt', `${formatPointer(x * -2.2)}deg`);
  root.style.setProperty('--space-main-x', `${formatPointer(x * 5)}px`);
  root.style.setProperty('--space-main-y', `${formatPointer(y * 4)}px`);
  root.style.setProperty('--space-main-tilt-x', `${formatPointer(y * -0.7)}deg`);
  root.style.setProperty('--space-main-tilt-y', `${formatPointer(x * 0.9)}deg`);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatPointer(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function createThemeGradientVariables(theme: VisualTheme, navHover: string, navActive: string) {
  const songHover = `color-mix(in srgb, ${theme.accentSoft} 52%, ${theme.surface} 48%)`;

  return {
    '--qq-window-gradient': createSoftGradient(145, theme.deepSurface, theme.materialA, theme.materialB, 10, 8),
    '--qq-sidebar-gradient': createSoftGradient(155, theme.deepSurface, theme.materialA, theme.canvasGlow, 12, 8),
    '--qq-content-gradient': createSoftGradient(145, theme.surface, theme.materialA, theme.materialB, 6, 5),
    '--qq-panel-gradient': createSoftGradient(145, theme.surface, theme.canvasGlow, theme.materialB, 7, 6),
    '--qq-hover-gradient': createSoftGradient(135, navHover, theme.surface, theme.materialA, 12, 10),
    '--qq-active-gradient': createSoftGradient(135, navActive, theme.surface, theme.accent, 10, 12),
    '--qq-song-hover-gradient': createSoftGradient(135, songHover, theme.surface, theme.canvasGlow, 8, 6),
    '--qq-accent-gradient': createSoftGradient(135, theme.accent, theme.materialA, theme.canvasGlow, 12, 16),
    '--qq-primary-action-gradient': createSoftGradient(
      135,
      'var(--qq-primary-action)',
      theme.accent,
      theme.materialA,
      14,
      10
    ),
    '--qq-primary-action-hover-gradient': createSoftGradient(
      135,
      'var(--qq-primary-action-hover)',
      theme.accent,
      theme.materialA,
      12,
      16
    )
  };
}

function createSoftGradient(
  angle: number,
  base: string,
  startTint: string,
  endTint: string,
  startTintWeight: number,
  endTintWeight: number
) {
  return `linear-gradient(${angle}deg, color-mix(in srgb, ${base} ${100 - startTintWeight}%, ${startTint} ${startTintWeight}%), color-mix(in srgb, ${base} ${100 - endTintWeight}%, ${endTint} ${endTintWeight}%))`;
}
