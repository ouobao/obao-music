import { afterEach, describe, expect, it } from 'vitest';
import {
  createCoverPaletteFromPixels,
  createCoverPaletteFromTone,
  getCachedCoverPaletteFromImage,
  sampleCoverPaletteFromImage
} from './coverPalette';

const originalImage = globalThis.Image;

afterEach(() => {
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: originalImage
  });
});

describe('coverPalette', () => {
  it('creates an immediate fallback palette from the supplied cover tone', () => {
    expect(createCoverPaletteFromTone('linear-gradient(135deg, #31c27c, #2f6f90)')).toEqual({
      primary: '#31c27c',
      secondary: '#2f6f90',
      shadow: 'var(--qq-text)',
      tone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    });
  });

  it('selects the dominant usable image color for the cover shadow', () => {
    const fallback = createCoverPaletteFromTone('linear-gradient(135deg, #31c27c, #2f6f90)');
    const palette = createCoverPaletteFromPixels(new Uint8ClampedArray([
      180, 30, 40, 255,
      180, 30, 40, 255,
      180, 30, 40, 255,
      42, 78, 54, 255
    ]), fallback);

    expect(palette.primary).toBe('#b41e28');
    expect(palette.shadow).toBe('#b41e28');
  });

  it('returns the fallback when every sampled pixel is unusable', () => {
    const fallback = createCoverPaletteFromTone('linear-gradient(135deg, #31c27c, #2f6f90)');

    expect(createCoverPaletteFromPixels(new Uint8ClampedArray([0, 0, 0, 0]), fallback)).toBe(fallback);
  });

  it('keeps completed samples in a bounded least-recently-used cache', async () => {
    class FailingImage {
      crossOrigin = '';
      onerror: OnErrorEventHandler = null;
      onload: ((event: Event) => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.(new Event('error')));
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: FailingImage
    });
    const fallback = createCoverPaletteFromTone('linear-gradient(135deg, #506070, #8090a0)');

    await sampleCoverPaletteFromImage('lru://oldest', fallback);
    for (let index = 0; index < 63; index += 1) {
      await sampleCoverPaletteFromImage(`lru://initial-${index}`, fallback);
    }

    expect(getCachedCoverPaletteFromImage('lru://oldest', fallback)).toBe(fallback);
    await sampleCoverPaletteFromImage('lru://newest', fallback);

    expect(getCachedCoverPaletteFromImage('lru://oldest', fallback)).toBe(fallback);
    expect(getCachedCoverPaletteFromImage('lru://initial-0', fallback)).toBeUndefined();
    expect(getCachedCoverPaletteFromImage('lru://newest', fallback)).toBe(fallback);
  });
});
