import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from './icons';

export interface PopoverMenuItem {
  key: string;
  icon?: ReactNode;
  label?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
  children?: PopoverMenuItem[];
  onSelect?: () => void;
}

interface PopoverMenuProps {
  open: boolean;
  onClose: () => void;
  /** 菜单项；与 children 二选一（children 为自定义内容模式） */
  items?: PopoverMenuItem[];
  /** 自定义内容模式：传入 children 时替代 items 菜单渲染（如音量面板等自定义控件） */
  children?: ReactNode;
  triggerRef?: React.RefObject<HTMLElement | null>;
  fixedPosition?: { x: number; y: number } | null;
  position?: 'top' | 'bottom';
  align?: 'left' | 'center' | 'right';
  /** 右键菜单模式：菜单以鼠标点为锚点优先向右/向下展开，空间不足时自动翻转 */
  cursorAnchored?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function PopoverMenu({
  open,
  onClose,
  items = [],
  children,
  triggerRef,
  fixedPosition,
  position = 'top',
  align = 'left',
  cursorAnchored = false,
  className,
  style,
  ariaLabel
}: PopoverMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openPath, setOpenPath] = useState<string[]>([]);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [opensLeft, setOpensLeft] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setOpenPath([]);
      return;
    }
    // 同步实测：弹层元素已随本次 commit 挂载，layout effect 内即可取 offsetWidth/Height
    // （布局尺寸，不受 popoverMount 缩放动画影响）——首帧即真实位置，避免按估计值落位后跳正
    const measureSize = () => {
      const menu = menuRef.current;
      if (!menu || menu.offsetWidth === 0 || menu.offsetHeight === 0) return null;
      return { width: menu.offsetWidth, height: menu.offsetHeight };
    };
    const commitRect = (left: number, top: number, width: number, height: number) => {
      setMenuRect((prev) =>
        prev && prev.left === left && prev.top === top && prev.width === width && prev.height === height
          ? prev
          : { left, top, width, height }
      );
    };
    if (fixedPosition) {
      const anchorX = fixedPosition.x;
      const anchorY = fixedPosition.y;
      const estimatedWidth = 200;
      const estimatedHeight = 240;
      const clampLeft = (menuWidth: number, left: number) => Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      const clampTop = (menuHeight: number, top: number) => Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

      if (cursorAnchored) {
        // 右键菜单：以鼠标点为锚，优先向右下展开，空间不足时分情况翻转到左侧/上方
        const resolveLeft = (menuWidth: number) => {
          const preferRight = anchorX + menuWidth + 12 <= window.innerWidth - 8;
          return preferRight ? clampLeft(menuWidth, anchorX + 8) : clampLeft(menuWidth, anchorX - menuWidth - 8);
        };
        const resolveTop = (menuHeight: number) => {
          const preferBelow = anchorY + menuHeight + 12 <= window.innerHeight - 8;
          return preferBelow ? clampTop(menuHeight, anchorY + 8) : clampTop(menuHeight, anchorY - menuHeight - 8);
        };
        const apply = (menuWidth: number, menuHeight: number) => {
          commitRect(resolveLeft(menuWidth), resolveTop(menuHeight), menuWidth, menuHeight);
          setOpensLeft(anchorX + 8 + menuWidth + 218 > window.innerWidth);
          setOpensUp(anchorY + 8 + menuHeight + 12 > window.innerHeight - 8);
        };
        apply(estimatedWidth, estimatedHeight);
        const size = measureSize();
        if (size) apply(size.width, size.height);
        requestAnimationFrame(() => {
          const refined = measureSize();
          if (refined) apply(refined.width, refined.height);
        });
      } else {
        const resolveLeft = (menuWidth: number) => {
          let left: number;
          if (align === 'center') left = anchorX - menuWidth / 2;
          else if (align === 'right') left = anchorX - menuWidth;
          else left = anchorX;
          return clampLeft(menuWidth, left);
        };
        const apply = (menuWidth: number, menuHeight: number) => {
          commitRect(resolveLeft(menuWidth), clampTop(menuHeight, anchorY), menuWidth, menuHeight);
        };
        apply(estimatedWidth, estimatedHeight);
        setOpensLeft(anchorX > window.innerWidth - 240);
        const size = measureSize();
        if (size) apply(size.width, size.height);
        requestAnimationFrame(() => {
          const refined = measureSize();
          if (refined) apply(refined.width, refined.height);
        });
      }
    } else {
      const trigger = triggerRef?.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const apply = (menuWidth: number, menuHeight: number) => {
        let left: number;
        if (align === 'center') left = rect.left + rect.width / 2 - menuWidth / 2;
        else if (align === 'right') left = rect.right - menuWidth;
        else left = rect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
        const top =
          position === 'top'
            ? Math.max(8, rect.top - menuHeight - 8)
            : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8);
        commitRect(left, top, menuWidth, menuHeight);
      };
      apply(190, 240);
      setOpensLeft(rect.right > window.innerWidth - 240);
      const size = measureSize();
      if (size) apply(size.width, size.height);
      requestAnimationFrame(() => {
        const refined = measureSize();
        if (refined) apply(refined.width, refined.height);
      });
    }

    const focusTarget = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const checked = menu.querySelector<HTMLButtonElement>('.popover-menu-item[aria-checked="true"]');
      const first = menu.querySelector<HTMLButtonElement>('.popover-menu-item:not([aria-disabled="true"])');
      (checked ?? first)?.focus();
    };
    requestAnimationFrame(focusTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerRef, position, align, fixedPosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.popover-menu')) return;
      if (triggerRef?.current && triggerRef.current.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) lastFocusedRef.current = document.activeElement as HTMLElement;
    if (!open && lastFocusedRef.current) lastFocusedRef.current.focus();
  }, [open]);

  if (!open) return null;

  // 右键菜单：从鼠标锚点所在角落向外生长；
  // 按钮锚定：从贴近触发按钮的一边生长（position=top 在按钮上方 → 底边为原点）
  const transformOrigin = cursorAnchored
    ? `${opensLeft ? 'right' : 'left'} ${opensUp ? 'bottom' : 'top'}`
    : position === 'top'
      ? 'center bottom'
      : 'center top';

  const currentLevelItems = (() => {
    let level = items;
    for (const key of openPath) {
      const item = level.find((candidate) => candidate.key === key);
      if (!item?.children) break;
      level = item.children;
    }
    return level;
  })();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const menu = menuRef.current;
    if (!menu) return;
    const levelContainer = menu.querySelector<HTMLElement>('.popover-menu-level.current');
    const candidates = Array.from(
      levelContainer?.querySelectorAll<HTMLButtonElement>('.popover-menu-item:not([aria-disabled="true"])') ?? []
    );
    if (candidates.length === 0) return;
    const currentIndex = candidates.indexOf(document.activeElement as HTMLButtonElement);

    const focus = (index: number) => {
      const clamped = (index + candidates.length) % candidates.length;
      candidates[clamped]?.focus();
    };

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focus(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        candidates[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        candidates[candidates.length - 1]?.focus();
        break;
      case 'ArrowRight': {
        const active = candidates[currentIndex];
        const item = currentLevelItems[currentIndex];
        if (active && item?.children?.length) {
          event.preventDefault();
          setOpenPath((path) => [...path, item.key]);
        }
        break;
      }
      case 'ArrowLeft': {
        if (openPath.length > 0) {
          event.preventDefault();
          setOpenPath((path) => path.slice(0, -1));
        }
        break;
      }
      case 'Enter':
      case ' ': {
        const item = currentLevelItems[currentIndex];
        if (item && !item.disabled) {
          event.preventDefault();
          handleSelect(item, openPath.length);
        }
        break;
      }
      case 'Tab':
        onClose();
        break;
      default:
        break;
    }
  };

  const handleSelect = (item: PopoverMenuItem, depth: number) => {
    if (item.disabled) return;
    if (item.children?.length) {
      setOpenPath((path) => {
        const next = [...path];
        next.length = depth;
        next.push(item.key);
        return next;
      });
      return;
    }
    item.onSelect?.();
    onClose();
  };

  const renderLevel = (levelItems: PopoverMenuItem[], depth: number) => {
    const isCurrent = depth === openPath.length;
    return (
      <div
        className={`popover-menu-level ${isCurrent ? 'current' : ''}`}
        data-level={depth}
        role="presentation"
      >
        {levelItems.map((item) => {
          if (item.divider) {
            return <div key={item.key} className="popover-menu-divider" role="separator" />;
          }
          return (
            <div
              key={item.key}
              className={`popover-menu-item-wrap ${openPath[depth] === item.key ? 'open' : ''}`}
              role="presentation"
            >
            <button
              type="button"
              role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={item.checked !== undefined ? item.checked : undefined}
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.children?.length ? 'menu' : undefined}
              aria-expanded={openPath[depth] === item.key || undefined}
              className={`popover-menu-item ${item.checked ? 'active' : ''}`}
              disabled={item.disabled}
              onClick={() => handleSelect(item, depth)}
              onMouseEnter={() => {
                if (item.children?.length) {
                  setOpenPath((path) => {
                    const next = [...path];
                    next.length = depth;
                    next.push(item.key);
                    return next;
                  });
                }
              }}
            >
              {item.icon && <span className="popover-menu-item-icon">{item.icon}</span>}
              <span className="popover-menu-item-label">{item.label}</span>
              {item.checked !== undefined && (
                <span className="popover-menu-check">{item.checked && <CheckIcon size={12} strokeWidth={2.5} />}</span>
              )}
              {item.children?.length ? (
                <span className={`popover-menu-arrow ${opensLeft ? 'flip' : ''}`} aria-hidden="true">›</span>
              ) : null}
            </button>
            {item.children?.length && openPath[depth] === item.key && (
              <div className={`popover-menu-submenu ${opensLeft ? 'opens-left' : ''}`} role="presentation">
                {renderLevel(item.children, depth + 1)}
              </div>
            )}
          </div>
          );
        })}
      </div>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className={`popover-menu open ${className ?? ''}`}
      style={{
        position: 'fixed',
        left: menuRect?.left ?? 0,
        top: menuRect?.top ?? 0,
        bottom: 'auto',
        width: 'max-content',
        maxWidth: 'min(360px, calc(100vw - 16px))',
        maxHeight: 'min(360px, calc(100vh - 16px))',
        overflow: 'visible',
        transformOrigin,
        ...style
      }}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {children !== undefined ? children : renderLevel(items, 0)}
    </div>,
    document.body
  );
}
