import { Monitor, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopoverStyle } from '../hooks/useAnchoredPopoverStyle';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { type ThemePreference, useVisualStore } from '../state/visualStore';
import { visualThemes } from '../visual/visualThemes';

const themePreferences: Array<{
  id: ThemePreference;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'system', label: '跟随系统', icon: <Monitor aria-hidden="true" size={16} /> },
  { id: 'light', label: '白色', icon: <Sun aria-hidden="true" size={16} /> },
  { id: 'dark', label: '黑色', icon: <Moon aria-hidden="true" size={16} /> }
];

interface ThemeSwitcherProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ThemeSwitcher({ open, onOpenChange }: ThemeSwitcherProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const presence = useAnimatedPresence(isOpen);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const popoverStyle = useAnchoredPopoverStyle({
    anchorRef: switcherRef,
    gap: 10,
    open: presence.isMounted,
    placement: 'bottom-end',
    width: 320
  });
  const themePreference = useVisualStore((state) => state.themePreference);
  const themeId = useVisualStore((state) => state.themeId);
  const setThemePreference = useVisualStore((state) => state.setThemePreference);

  return (
    <div className="theme-switcher" data-top-popover-owner="theme" ref={switcherRef}>
      <button
        className="theme-trigger liquid-glass-button"
        type="button"
        aria-label="主题设置"
        aria-expanded={isOpen}
        data-top-popover-owner="theme"
        onClick={() => setOpen(!isOpen)}
      >
        <Palette aria-hidden="true" size={17} />
        <Sparkles aria-hidden="true" size={13} />
        <span className="theme-trigger-label">主题</span>
      </button>

      {presence.isMounted && typeof document !== 'undefined' ? createPortal(
        <div
          className="theme-popover glass-surface"
          role="dialog"
          aria-label="主题设置面板"
          data-top-popover-owner="theme"
          data-state={presence.state}
          style={popoverStyle}
        >
          <div className="theme-popover-section">
            <span className="theme-popover-title">显示模式</span>
            <div className="theme-card-list">
              {themePreferences.map((preference) => {
                const previewTheme = preference.id === 'dark'
                  ? visualThemes.black
                  : preference.id === 'light'
                    ? visualThemes.white
                    : visualThemes[themeId];

                return (
                  <button
                    className={preference.id === themePreference ? 'theme-card theme-card-active' : 'theme-card'}
                    type="button"
                    aria-label={`使用${preference.label}显示模式`}
                    aria-pressed={preference.id === themePreference}
                    style={{
                      '--theme-card-accent': previewTheme.accent,
                      '--theme-card-soft': previewTheme.accentSoft,
                      '--theme-card-surface': previewTheme.surface,
                      '--theme-card-text': previewTheme.text
                    } as CSSProperties}
                    onClick={() => setThemePreference(preference.id)}
                    key={preference.id}
                  >
                    <span className="theme-card-swatch" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <span className="theme-card-name">
                      {preference.icon}
                      <span>{preference.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
