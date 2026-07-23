export interface LyricsDepthPointer {
  x: number;
  y: number;
}

export type LyricsDepthMode = 'locked' | 'pointer' | 'centering' | 'idle';

export interface LyricsDepthState {
  mode: LyricsDepthMode;
  pointerInside: boolean;
  target: LyricsDepthPointer;
  lastObservedPointer: LyricsDepthPointer;
  resumeIdleAfterCenter: boolean;
}

export type LyricsDepthEvent =
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'sample'; pointer: LyricsDepthPointer }
  | { type: 'center' }
  | { type: 'request-idle' }
  | { type: 'centered' }
  | { type: 'leave' };

export const centerDepthPointer: Readonly<LyricsDepthPointer> = Object.freeze({ x: 0.5, y: 0.5 });

const pointerMovementThreshold = 0.003;

export function createLyricsDepthState(locked: boolean): LyricsDepthState {
  return {
    mode: locked ? 'locked' : 'pointer',
    pointerInside: true,
    target: centerDepthPointer,
    lastObservedPointer: centerDepthPointer,
    resumeIdleAfterCenter: false
  };
}

export function reduceLyricsDepthState(
  state: LyricsDepthState,
  event: LyricsDepthEvent
): LyricsDepthState {
  switch (event.type) {
    case 'lock':
      if (state.mode === 'locked' && state.target === centerDepthPointer) {
        return state;
      }
      return {
        ...state,
        mode: 'locked',
        target: centerDepthPointer,
        resumeIdleAfterCenter: false
      };
    case 'unlock':
      if (state.mode !== 'locked') {
        return state;
      }
      return {
        ...state,
        mode: 'pointer',
        target: centerDepthPointer,
        resumeIdleAfterCenter: false
      };
    case 'sample': {
      if (state.mode === 'locked') {
        return state;
      }

      const pointer = normalizeDepthPointer(event.pointer);
      const moved = !state.pointerInside || getDepthPointerDistance(pointer, state.lastObservedPointer) >= pointerMovementThreshold;
      if (!moved) {
        return state;
      }

      return {
        ...state,
        mode: 'pointer',
        pointerInside: true,
        target: pointer,
        lastObservedPointer: pointer,
        resumeIdleAfterCenter: false
      };
    }
    case 'center':
      if (state.mode === 'locked') {
        return state;
      }
      if (state.mode === 'centering' && !state.resumeIdleAfterCenter) {
        return state;
      }
      return {
        ...state,
        mode: 'centering',
        target: centerDepthPointer,
        resumeIdleAfterCenter: false
      };
    case 'request-idle':
      if (state.mode === 'locked' || !state.pointerInside) {
        return state;
      }
      if (state.mode === 'idle' || (state.mode === 'centering' && state.resumeIdleAfterCenter)) {
        return state;
      }
      return {
        ...state,
        mode: 'centering',
        target: centerDepthPointer,
        resumeIdleAfterCenter: true
      };
    case 'centered':
      if (state.mode !== 'centering' || !state.resumeIdleAfterCenter || !state.pointerInside) {
        return state;
      }
      return {
        ...state,
        mode: 'idle',
        target: centerDepthPointer,
        resumeIdleAfterCenter: false
      };
    case 'leave':
      if (!state.pointerInside) {
        return state;
      }
      return {
        ...state,
        mode: state.mode === 'locked' ? 'locked' : 'centering',
        pointerInside: false,
        target: centerDepthPointer,
        resumeIdleAfterCenter: false
      };
  }
}

function normalizeDepthPointer(pointer: LyricsDepthPointer): LyricsDepthPointer {
  return {
    x: clamp(pointer.x),
    y: clamp(pointer.y)
  };
}

function getDepthPointerDistance(left: LyricsDepthPointer, right: LyricsDepthPointer) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
