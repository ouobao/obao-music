import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../state/uiStore';
import { useReducedEffects } from './useReducedEffects';

describe('useReducedEffects', () => {
  let media: ReturnType<typeof installReducedMotionMediaQuery>;

  beforeEach(() => {
    useUiStore.getState().resetForTest();
    delete document.documentElement.dataset.reduceEffects;
    media = installReducedMotionMediaQuery(false);
  });

  afterEach(() => {
    delete document.documentElement.dataset.reduceEffects;
    vi.restoreAllMocks();
  });

  it('synchronizes the manual preference to the effective value and root dataset', () => {
    render(<ReducedEffectsHarness />);

    expect(screen.getByTestId('reduced-effects')).toHaveTextContent('false:false');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-effects');

    act(() => useUiStore.getState().setReduceEffects(true));

    expect(screen.getByTestId('reduced-effects')).toHaveTextContent('true:false');
    expect(document.documentElement).toHaveAttribute('data-reduce-effects', 'true');

    act(() => useUiStore.getState().setReduceEffects(false));

    expect(screen.getByTestId('reduced-effects')).toHaveTextContent('false:false');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-effects');
  });

  it('reacts to the operating-system preference even when the manual switch is off', () => {
    render(<ReducedEffectsHarness />);

    act(() => media.setMatches(true));

    expect(screen.getByTestId('reduced-effects')).toHaveTextContent('true:true');
    expect(document.documentElement).toHaveAttribute('data-reduce-effects', 'true');

    act(() => media.setMatches(false));

    expect(screen.getByTestId('reduced-effects')).toHaveTextContent('false:false');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-effects');
  });

  it('removes the root policy and media listener when its owner unmounts', () => {
    useUiStore.getState().setReduceEffects(true);
    const { unmount } = render(<ReducedEffectsHarness />);

    expect(document.documentElement).toHaveAttribute('data-reduce-effects', 'true');

    unmount();

    expect(document.documentElement).not.toHaveAttribute('data-reduce-effects');
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

function ReducedEffectsHarness() {
  const { reduceEffects, systemReduceEffects } = useReducedEffects();

  return <output data-testid="reduced-effects">{`${reduceEffects}:${systemReduceEffects}`}</output>;
}

function installReducedMotionMediaQuery(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn((_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
    listeners.add(listener);
  });
  const removeEventListener = vi.fn((_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
    listeners.delete(listener);
  });
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  } as MediaQueryList;

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQueryList));

  return {
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    }
  };
}
