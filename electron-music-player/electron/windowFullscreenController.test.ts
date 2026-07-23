import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFullscreenTransitionController,
  type FullscreenWindow
} from './windowFullscreenController.cjs';

class FakeFullscreenWindow extends EventEmitter implements FullscreenWindow {
  destroyed = false;
  fullscreen = false;
  readonly requests: boolean[] = [];

  isDestroyed() {
    return this.destroyed;
  }

  isFullScreen() {
    return this.fullscreen;
  }

  setFullScreen(fullscreen: boolean) {
    this.requests.push(fullscreen);
  }

  complete(fullscreen: boolean) {
    this.fullscreen = fullscreen;
    this.emit(fullscreen ? 'enter-full-screen' : 'leave-full-screen');
  }
}

describe('window fullscreen transition controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the native transition event before resolving', async () => {
    const controller = createFullscreenTransitionController();
    const targetWindow = new FakeFullscreenWindow();

    const transition = controller.setFullscreen(targetWindow, true);
    expect(targetWindow.requests).toEqual([true]);
    expect(controller.hasPendingTransition(targetWindow)).toBe(true);

    targetWindow.complete(true);

    await expect(transition).resolves.toBe(true);
    expect(controller.hasPendingTransition(targetWindow)).toBe(false);
  });

  it('lets a newer exit request win over a pending fullscreen entry', async () => {
    const controller = createFullscreenTransitionController();
    const targetWindow = new FakeFullscreenWindow();

    const enterTransition = controller.setFullscreen(targetWindow, true);
    const leaveTransition = controller.setFullscreen(targetWindow, false);

    await expect(enterTransition).resolves.toBe(false);
    expect(controller.getDesiredState(targetWindow)).toBe(false);
    expect(targetWindow.requests).toEqual([true, false]);

    targetWindow.complete(true);
    expect(targetWindow.requests).toEqual([true, false, false]);
    targetWindow.complete(false);

    await expect(leaveTransition).resolves.toBe(false);
    expect(controller.hasPendingTransition(targetWindow)).toBe(false);
  });

  it('shares duplicate requests for the same pending target state', () => {
    const controller = createFullscreenTransitionController();
    const targetWindow = new FakeFullscreenWindow();

    const first = controller.setFullscreen(targetWindow, true);
    const second = controller.setFullscreen(targetWindow, true);

    expect(second).toBe(first);
    expect(targetWindow.requests).toEqual([true]);
  });

  it('retries once and reports the actual state when the target is never reached', async () => {
    vi.useFakeTimers();
    const controller = createFullscreenTransitionController({ timeoutMs: 50, maxAttempts: 2 });
    const targetWindow = new FakeFullscreenWindow();
    targetWindow.fullscreen = true;

    const transition = controller.setFullscreen(targetWindow, false);
    await vi.advanceTimersByTimeAsync(50);
    expect(targetWindow.requests).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(50);

    await expect(transition).resolves.toBe(true);
    expect(controller.hasPendingTransition(targetWindow)).toBe(false);
  });
});
