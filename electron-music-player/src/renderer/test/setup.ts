import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

beforeAll(() => {
  if (!window.PointerEvent) {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: MouseEvent
    });
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve()
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => undefined
  });
});

afterEach(() => {
  cleanup();
});
