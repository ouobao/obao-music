import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef
} from 'react';

interface CoverDepthSample {
  scene: HTMLElement;
  clientX: number;
  clientY: number;
}

export function useCoverCardDepth() {
  const sampleRef = useRef<CoverDepthSample | null>(null);
  const frameRef = useRef<number | null>(null);
  const framePendingRef = useRef(false);

  const handleDepthPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const scene = event.currentTarget;
    if (!shouldUseCoverCardDepth(event.pointerType)) {
      resetCoverCardDepth(scene);
      return;
    }

    sampleRef.current = { scene, clientX: event.clientX, clientY: event.clientY };
    if (framePendingRef.current) {
      return;
    }

    framePendingRef.current = true;
    frameRef.current = window.requestAnimationFrame(() => {
      framePendingRef.current = false;
      frameRef.current = null;
      const sample = sampleRef.current;
      if (!sample) {
        return;
      }

      const rect = sample.scene.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        resetCoverCardDepth(sample.scene);
        return;
      }

      const pointerX = clamp(((sample.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      const pointerY = clamp(((sample.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
      sample.scene.style.setProperty('--playlist-card-rotate-x', `${(-pointerY * 2.5).toFixed(2)}deg`);
      sample.scene.style.setProperty('--playlist-card-rotate-y', `${(pointerX * 3.5).toFixed(2)}deg`);
      sample.scene.style.setProperty('--playlist-card-sheen-x', `${(50 + pointerX * 24).toFixed(1)}%`);
      sample.scene.style.setProperty('--playlist-card-sheen-y', `${(48 + pointerY * 20).toFixed(1)}%`);
    });
  }, []);

  const handleDepthPointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (sampleRef.current?.scene === event.currentTarget) {
      sampleRef.current = null;
    }
    resetCoverCardDepth(event.currentTarget);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
    framePendingRef.current = false;
    sampleRef.current = null;
  }, []);

  return { handleDepthPointerLeave, handleDepthPointerMove };
}

function shouldUseCoverCardDepth(pointerType: string) {
  if (pointerType === 'touch' || document.documentElement.dataset.reduceEffects === 'true') {
    return false;
  }
  return !window.matchMedia?.('(pointer: coarse)').matches;
}

function resetCoverCardDepth(scene: HTMLElement) {
  scene.style.setProperty('--playlist-card-rotate-x', '0deg');
  scene.style.setProperty('--playlist-card-rotate-y', '0deg');
  scene.style.setProperty('--playlist-card-sheen-x', '50%');
  scene.style.setProperty('--playlist-card-sheen-y', '48%');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
