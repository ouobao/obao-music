import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

type PopoverPlacement = 'bottom-end' | 'top-end' | 'top-center' | 'left-end';

interface AnchoredPopoverOptions {
  anchorRef: RefObject<HTMLElement>;
  gap: number;
  height?: number;
  offsetY?: number;
  open: boolean;
  placement: PopoverPlacement;
  width: number;
}

type AnchoredPopoverStyle = CSSProperties & {
  '--popover-origin-x'?: string;
  '--popover-origin-y'?: string;
  '--popover-slide-x'?: string;
  '--popover-slide-y'?: string;
};

const viewportMargin = 16;

export function useAnchoredPopoverStyle({ anchorRef, gap, height = 0, offsetY = 0, open, placement, width }: AnchoredPopoverOptions) {
  const [style, setStyle] = useState<AnchoredPopoverStyle>({
    position: 'fixed',
    visibility: 'hidden'
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const left = placement === 'left-end'
      ? clamp(rect.left - width - gap, viewportMargin, window.innerWidth - width - viewportMargin)
      : placement === 'top-center'
        ? clamp(rect.left + rect.width / 2 - width / 2, viewportMargin, window.innerWidth - width - viewportMargin)
        : clamp(rect.right - width, viewportMargin, window.innerWidth - width - viewportMargin);
    const top = placement === 'bottom-end'
      ? clamp(rect.bottom + gap, viewportMargin, window.innerHeight - viewportMargin)
      : placement === 'left-end'
        ? clamp(rect.bottom - height + offsetY, viewportMargin, window.innerHeight - height - viewportMargin)
        : clamp(rect.top - height - gap, viewportMargin, window.innerHeight - height - viewportMargin);
    const originX = placement === 'left-end' ? width : clamp(rect.left + rect.width / 2 - left, 0, width);
    const originY = placement === 'bottom-end'
      ? 0
      : placement === 'left-end'
        ? clamp(rect.bottom - top, 0, height)
        : height;
    const slideX = placement === 'left-end' ? '4px' : '0px';
    const slideY = placement === 'left-end' ? '0px' : placement === 'bottom-end' ? '-4px' : '4px';

    setStyle({
      position: 'fixed',
      left,
      top,
      right: 'auto',
      bottom: 'auto',
      visibility: 'visible',
      '--popover-origin-x': `${originX}px`,
      '--popover-origin-y': `${originY}px`,
      '--popover-slide-x': slideX,
      '--popover-slide-y': slideY
    });
  }, [anchorRef, gap, height, offsetY, placement, width]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return style;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
