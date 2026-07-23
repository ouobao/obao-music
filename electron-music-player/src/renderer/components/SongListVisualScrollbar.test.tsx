import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SongListVisualScrollbar } from './SongListVisualScrollbar';

describe('SongListVisualScrollbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drags the visual thumb by proxying movement to the scroll host', async () => {
    const { container } = render(<ScrollableFixture />);

    const scrollHost = screen.getByTestId('scroll-host');
    const scrollbar = container.querySelector<HTMLElement>('.song-list-visual-scrollbar');
    if (!scrollbar) {
      throw new Error('Visual scrollbar did not render');
    }

    await waitFor(() => {
      expect(scrollbar).toHaveAttribute('data-scrollable', 'true');
    });

    fireEvent(scrollbar, createPointerEvent('pointerdown', 20));
    fireEvent(window, createPointerEvent('pointermove', 70));
    fireEvent(window, createPointerEvent('pointerup', 70));

    expect(scrollHost.scrollTop).toBeGreaterThan(0);
  });

  it('updates the thumb from cached geometry without layout reads in a scroll frame', () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');

    const { container } = render(<ScrollableFixture />);
    const scrollHost = screen.getByTestId('scroll-host');
    const scrollbar = container.querySelector<HTMLElement>('.song-list-visual-scrollbar');
    if (!scrollbar) {
      throw new Error('Visual scrollbar did not render');
    }

    const readClientHeight = vi.fn(() => 100);
    const readScrollHeight = vi.fn(() => 400);
    Object.defineProperty(scrollHost, 'clientHeight', {
      configurable: true,
      get: readClientHeight
    });
    Object.defineProperty(scrollHost, 'scrollHeight', {
      configurable: true,
      get: readScrollHeight
    });

    runNextAnimationFrame(animationFrames);
    expect(readClientHeight).toHaveBeenCalledTimes(1);
    expect(readScrollHeight).toHaveBeenCalledTimes(1);
    expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);

    readClientHeight.mockClear();
    readScrollHeight.mockClear();
    getComputedStyleSpy.mockClear();
    scrollHost.scrollTop = 60;
    fireEvent.scroll(scrollHost);
    scrollHost.scrollTop = 150;

    fireEvent.scroll(scrollHost);
    expect(animationFrames.size).toBe(1);
    runNextAnimationFrame(animationFrames);

    expect(readClientHeight).not.toHaveBeenCalled();
    expect(readScrollHeight).not.toHaveBeenCalled();
    expect(getComputedStyleSpy).not.toHaveBeenCalled();
    expect(scrollbar.style.getPropertyValue('--song-list-scrollbar-thumb-top')).toBe('32px');
  });

  it('coalesces rapid thumb movement into one scroll write per animation frame', () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });

    const { container } = render(<ScrollableFixture />);
    const scrollHost = screen.getByTestId('scroll-host');
    const scrollbar = container.querySelector<HTMLElement>('.song-list-visual-scrollbar');
    if (!scrollbar) {
      throw new Error('Visual scrollbar did not render');
    }

    runNextAnimationFrame(animationFrames);
    const syntheticScrollListener = vi.fn();
    scrollHost.addEventListener('scroll', syntheticScrollListener);

    fireEvent(scrollbar, createPointerEvent('pointerdown', 20));
    fireEvent(window, createPointerEvent('pointermove', 35));
    fireEvent(window, createPointerEvent('pointermove', 55));
    fireEvent(window, createPointerEvent('pointermove', 70));

    expect(scrollHost.scrollTop).toBe(0);
    expect(animationFrames.size).toBe(1);

    runNextAnimationFrame(animationFrames);

    expect(scrollHost.scrollTop).toBeCloseTo(234.375, 3);
    expect(syntheticScrollListener).not.toHaveBeenCalled();

    fireEvent(window, createPointerEvent('pointerup', 70));
    scrollHost.removeEventListener('scroll', syntheticScrollListener);
  });
});

function ScrollableFixture() {
  const scrollHostRef = useRef<HTMLDivElement | null>(null);

  const attachScrollHost = (node: HTMLDivElement | null) => {
    scrollHostRef.current = node;
    if (!node) {
      return;
    }

    Object.defineProperty(node, 'clientHeight', {
      configurable: true,
      value: 100
    });
    Object.defineProperty(node, 'scrollHeight', {
      configurable: true,
      value: 400
    });
    Object.defineProperty(node, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0
    });
  };

  return (
    <div>
      <div data-testid="scroll-host" ref={attachScrollHost} />
      <SongListVisualScrollbar scrollHostRef={scrollHostRef} />
    </div>
  );
}

function createPointerEvent(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientY: {
      value: clientY
    },
    pointerId: {
      value: 1
    }
  });

  return event;
}

function runNextAnimationFrame(animationFrames: Map<number, FrameRequestCallback>) {
  const nextFrame = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!nextFrame) {
    throw new Error('Expected an animation frame to be queued');
  }

  const [frameId, callback] = nextFrame;
  animationFrames.delete(frameId);
  act(() => {
    callback(16);
  });
}
