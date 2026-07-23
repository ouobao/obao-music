import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCoverPalette } from './useCoverPalette';

const originalImage = globalThis.Image;
const originalCreateElement = document.createElement.bind(document);

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: originalImage
  });
});

describe('useCoverPalette', () => {
  it('returns the new fallback palette on the first render after the cover changes', () => {
    const renderedColors: string[] = [];
    const renderedShadows: string[] = [];
    const Probe = ({ coverTone }: { coverTone: string }) => {
      const palette = useCoverPalette(coverTone);
      renderedColors.push(palette.primary);
      renderedShadows.push(palette.shadow);
      return null;
    };
    const { rerender } = render(<Probe coverTone="linear-gradient(135deg, #31c27c, #2f6f90)" />);

    renderedColors.length = 0;
    renderedShadows.length = 0;
    rerender(<Probe coverTone="linear-gradient(135deg, #b41e28, #2a4e36)" />);

    expect(renderedColors[0]).toBe('#b41e28');
    expect(renderedShadows[0]).toBe('var(--qq-text)');
  });

  it('returns a completed palette synchronously when revisiting a cover', async () => {
    const pixelsByUrl = new Map([
      ['cover://a', new Uint8ClampedArray([180, 30, 40, 255])],
      ['cover://b', new Uint8ClampedArray([42, 140, 80, 255])]
    ]);
    let imageCount = 0;

    class FakeImage {
      crossOrigin = '';
      height = 1;
      naturalHeight = 1;
      naturalWidth = 1;
      onerror: OnErrorEventHandler = null;
      onload: ((event: Event) => void) | null = null;
      width = 1;
      private source = '';

      get src(): string {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
        imageCount += 1;
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: FakeImage
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName, options);
      }

      let drawnSource = '';
      return {
        getContext: () => ({
          drawImage: (image: FakeImage) => {
            drawnSource = image.src;
          },
          getImageData: () => ({
            data: pixelsByUrl.get(drawnSource) ?? new Uint8ClampedArray()
          })
        }),
        height: 0,
        width: 0
      } as unknown as HTMLCanvasElement;
    });

    const renderedColors: string[] = [];
    const Probe = ({ coverTone, coverUrl }: { coverTone: string; coverUrl: string }) => {
      const palette = useCoverPalette(coverTone, coverUrl);
      renderedColors.push(palette.primary);
      return <output>{palette.primary}</output>;
    };
    const coverA = {
      coverTone: 'linear-gradient(135deg, #111111, #222222)',
      coverUrl: 'cover://a'
    };
    const coverB = {
      coverTone: 'linear-gradient(135deg, #333333, #444444)',
      coverUrl: 'cover://b'
    };
    const { rerender } = render(<Probe {...coverA} />);

    expect(screen.getByText('#111111')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('#b41e28')).toBeTruthy());

    rerender(<Probe {...coverB} />);
    expect(screen.getByText('#333333')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('#2a8c50')).toBeTruthy());

    renderedColors.length = 0;
    rerender(<Probe {...coverA} />);
    await act(async () => undefined);

    expect(renderedColors).toEqual(['#b41e28']);
    expect(screen.getByText('#b41e28')).toBeTruthy();
    expect(imageCount).toBe(2);
  });
});
