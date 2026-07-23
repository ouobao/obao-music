import { useEffect, useLayoutEffect, useState } from 'react';
import { useUiStore } from '../state/uiStore';

const reducedMotionMediaQuery = '(prefers-reduced-motion: reduce)';

export function useReducedEffects() {
  const manualReduceEffects = useUiStore((state) => state.reduceEffects);
  const [systemReduceEffects, setSystemReduceEffects] = useState(readSystemReduceEffects);
  const reduceEffects = manualReduceEffects || systemReduceEffects;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(reducedMotionMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemReduceEffects(event.matches);
    };

    setSystemReduceEffects(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const root = document.documentElement;
    if (reduceEffects) {
      root.dataset.reduceEffects = 'true';
    } else {
      delete root.dataset.reduceEffects;
    }

    return () => {
      delete root.dataset.reduceEffects;
    };
  }, [reduceEffects]);

  return { reduceEffects, systemReduceEffects };
}

function readSystemReduceEffects() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(reducedMotionMediaQuery).matches;
}
