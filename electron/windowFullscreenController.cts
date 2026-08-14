export type FullscreenTransitionEvent = 'enter-full-screen' | 'leave-full-screen';

export interface FullscreenWindow {
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  setFullScreen(fullscreen: boolean): void;
  on(event: FullscreenTransitionEvent, listener: () => void): unknown;
  removeListener(event: FullscreenTransitionEvent, listener: () => void): unknown;
}

interface FullscreenTransition {
  desired: boolean;
  promise: Promise<boolean>;
  cancel: () => void;
}

interface FullscreenTransitionControllerOptions {
  timeoutMs?: number;
  maxAttempts?: number;
}

export function createFullscreenTransitionController(
  options: FullscreenTransitionControllerOptions = {}
) {
  const timeoutMs = options.timeoutMs ?? 1_200;
  const maxAttempts = options.maxAttempts ?? 2;
  const transitions = new WeakMap<FullscreenWindow, FullscreenTransition>();

  function getDesiredState(targetWindow: FullscreenWindow): boolean {
    return transitions.get(targetWindow)?.desired ?? targetWindow.isFullScreen();
  }

  function hasPendingTransition(targetWindow: FullscreenWindow): boolean {
    return transitions.has(targetWindow);
  }

  function setFullscreen(targetWindow: FullscreenWindow, fullscreen: boolean): Promise<boolean> {
    if (targetWindow.isDestroyed()) {
      return Promise.resolve(false);
    }

    const currentTransition = transitions.get(targetWindow);
    if (currentTransition?.desired === fullscreen) {
      return currentTransition.promise;
    }

    const supersedesTransition = Boolean(currentTransition);
    currentTransition?.cancel();
    if (!supersedesTransition && targetWindow.isFullScreen() === fullscreen) {
      return Promise.resolve(fullscreen);
    }

    let attempts = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let resolveTransition!: (fullscreenState: boolean) => void;

    const promise = new Promise<boolean>((resolve) => {
      resolveTransition = resolve;
    });
    const transition: FullscreenTransition = {
      desired: fullscreen,
      promise,
      cancel: () => finish()
    };

    function cleanup() {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      targetWindow.removeListener('enter-full-screen', handleTransitionEvent);
      targetWindow.removeListener('leave-full-screen', handleTransitionEvent);
      if (transitions.get(targetWindow) === transition) {
        transitions.delete(targetWindow);
      }
    }

    function finish() {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolveTransition(!targetWindow.isDestroyed() && targetWindow.isFullScreen());
    }

    function scheduleTimeout() {
      if (settled) {
        return;
      }

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(handleTimeout, timeoutMs);
    }

    function requestDesiredState() {
      if (settled || targetWindow.isDestroyed()) {
        finish();
        return;
      }

      attempts += 1;
      targetWindow.setFullScreen(fullscreen);
      scheduleTimeout();
    }

    function handleTransitionEvent() {
      if (settled || transitions.get(targetWindow) !== transition) {
        return;
      }

      if (targetWindow.isDestroyed() || targetWindow.isFullScreen() === fullscreen) {
        finish();
        return;
      }

      if (attempts < maxAttempts) {
        requestDesiredState();
      }
    }

    function handleTimeout() {
      timeoutId = undefined;
      if (targetWindow.isDestroyed() || targetWindow.isFullScreen() === fullscreen) {
        finish();
        return;
      }

      if (attempts < maxAttempts) {
        requestDesiredState();
        return;
      }

      finish();
    }

    transitions.set(targetWindow, transition);
    targetWindow.on('enter-full-screen', handleTransitionEvent);
    targetWindow.on('leave-full-screen', handleTransitionEvent);
    requestDesiredState();
    return promise;
  }

  return {
    getDesiredState,
    hasPendingTransition,
    setFullscreen
  };
}
