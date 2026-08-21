export type LyricsTransitionDirection = 'enter' | 'exit';
export type LyricsTransitionPhase =
  | 'entering'
  | 'handoff'
  | 'unlocking'
  | 'interactive'
  | 'exiting'
  | 'returning'
  | 'restoring';

export interface LyricsTransitionOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CoverFlightTarget {
  coverScaleX: number;
  coverScaleY: number;
  coverX: number;
  coverY: number;
}

export function isLyricsDepthInteractive(phase: LyricsTransitionPhase) {
  return phase === 'interactive';
}

const reducedMotionDurationMs = 160;

export function toLyricsTransitionOrigin(
  rect: Pick<LyricsTransitionOrigin, 'left' | 'top' | 'width' | 'height'>
): LyricsTransitionOrigin {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  };
}

export function getLyricsTransitionDuration(
  direction: LyricsTransitionDirection,
  reducedMotion: boolean
) {
  if (reducedMotion) {
    return reducedMotionDurationMs;
  }

  return direction === 'enter' ? 620 : 460;
}

export function createFallbackLyricsTransitionOrigin(): LyricsTransitionOrigin {
  if (typeof window === 'undefined') {
    return { left: 0, top: 0, width: 56, height: 56 };
  }

  return {
    left: 24,
    top: Math.max(24, window.innerHeight - 88),
    width: 56,
    height: 56
  };
}

export function createCoverFlightTarget(
  origin: LyricsTransitionOrigin,
  target: LyricsTransitionOrigin
): CoverFlightTarget {
  const scale = Math.min(target.width / origin.width, target.height / origin.height);
  const originCenterX = origin.left + origin.width / 2;
  const originCenterY = origin.top + origin.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  return {
    coverScaleX: scale,
    coverScaleY: scale,
    coverX: Math.round(targetCenterX - originCenterX),
    coverY: Math.round(targetCenterY - originCenterY)
  };
}
