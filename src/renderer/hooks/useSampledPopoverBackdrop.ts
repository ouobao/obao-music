import { useMemo, type CSSProperties, type RefObject } from 'react';

interface SampledPopoverBackdropOptions {
  enabled: boolean;
  popoverRef: RefObject<HTMLElement | null>;
  spread?: number;
}

export function useSampledPopoverBackdrop({ enabled, popoverRef, spread = 36 }: SampledPopoverBackdropOptions) {
  void enabled;
  void popoverRef;

  const layerStyle = useMemo<CSSProperties>(() => ({
    left: -spread,
    top: -spread,
    width: 0,
    height: 0
  }), [spread]);

  return {
    imageUrl: null,
    isReady: true,
    isSupported: false,
    rect: {
      width: 0,
      height: 0
    },
    layerStyle
  };
}
