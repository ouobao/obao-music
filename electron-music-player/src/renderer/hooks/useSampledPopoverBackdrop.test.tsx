import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSampledPopoverBackdrop } from './useSampledPopoverBackdrop';

describe('useSampledPopoverBackdrop', () => {
  it('keeps sampled backdrop capture disabled for the restored static glass material', () => {
    const capturePopoverBackdrop = vi.fn();

    render(<SampledBackdropProbe />);

    expect(capturePopoverBackdrop).not.toHaveBeenCalled();
    expect(screen.getByTestId('ready')).toHaveTextContent('ready');
    expect(screen.getByTestId('supported')).toHaveTextContent('unsupported');
    expect(screen.getByTestId('image-url')).toBeEmptyDOMElement();
    expect(screen.getByTestId('layer')).toHaveTextContent('-32,-32,0,0');
  });
});

function SampledBackdropProbe() {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const backdrop = useSampledPopoverBackdrop({
    enabled: true,
    popoverRef,
    spread: 32
  });

  return (
    <div>
      <div
        ref={(node) => {
          popoverRef.current = node;
          if (node) {
            node.getBoundingClientRect = () => ({
              x: 100,
              y: 60,
              top: 60,
              left: 100,
              right: 460,
              bottom: 240,
              width: 360,
              height: 180,
              toJSON: () => undefined
            });
          }
      }}
      />
      <span data-testid="ready">{backdrop.isReady ? 'ready' : 'pending'}</span>
      <span data-testid="supported">{backdrop.isSupported ? 'supported' : 'unsupported'}</span>
      <span data-testid="image-url">{backdrop.imageUrl}</span>
      <span data-testid="layer">
        {backdrop.layerStyle.left},{backdrop.layerStyle.top},{backdrop.layerStyle.width},{backdrop.layerStyle.height}
      </span>
    </div>
  );
}
