import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useAnchoredPopoverStyle } from './useAnchoredPopoverStyle';

describe('useAnchoredPopoverStyle', () => {
  it('exposes an upward entry vector for bottom-anchored popovers', async () => {
    render(<AnchoredPopoverProbe placement="bottom-end" />);

    const popover = screen.getByTestId('anchored-popover');

    await waitFor(() => expect(popover.style.visibility).toBe('visible'));
    expect(popover.style.getPropertyValue('--popover-origin-y')).toBe('0px');
    expect(popover.style.getPropertyValue('--popover-slide-x')).toBe('0px');
    expect(popover.style.getPropertyValue('--popover-slide-y')).toBe('-4px');
  });

  it('exposes a downward entry vector for top-anchored popovers', async () => {
    render(<AnchoredPopoverProbe placement="top-end" />);

    const popover = screen.getByTestId('anchored-popover');

    await waitFor(() => expect(popover.style.visibility).toBe('visible'));
    expect(popover.style.getPropertyValue('--popover-origin-y')).toBe('176px');
    expect(popover.style.getPropertyValue('--popover-slide-x')).toBe('0px');
    expect(popover.style.getPropertyValue('--popover-slide-y')).toBe('4px');
  });

  it('centers top popovers over their trigger', async () => {
    render(<AnchoredPopoverProbe placement="top-center" />);

    const popover = screen.getByTestId('anchored-popover');

    await waitFor(() => expect(popover.style.visibility).toBe('visible'));
    expect(popover.style.left).toBe('552px');
    expect(popover.style.getPropertyValue('--popover-origin-x')).toBe('68px');
    expect(popover.style.getPropertyValue('--popover-origin-y')).toBe('176px');
    expect(popover.style.getPropertyValue('--popover-slide-x')).toBe('0px');
    expect(popover.style.getPropertyValue('--popover-slide-y')).toBe('4px');
  });

  it('exposes a rightward entry vector for left-anchored popovers', async () => {
    render(<AnchoredPopoverProbe placement="left-end" />);

    const popover = screen.getByTestId('anchored-popover');

    await waitFor(() => expect(popover.style.visibility).toBe('visible'));
    expect(popover.style.getPropertyValue('--popover-origin-x')).toBe('136px');
    expect(popover.style.getPropertyValue('--popover-slide-x')).toBe('4px');
    expect(popover.style.getPropertyValue('--popover-slide-y')).toBe('0px');
  });
});

function AnchoredPopoverProbe({ placement }: { placement: 'bottom-end' | 'top-end' | 'top-center' | 'left-end' }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const style = useAnchoredPopoverStyle({
    anchorRef,
    gap: 12,
    height: 176,
    open: true,
    placement,
    width: 136
  });

  return (
    <>
      <button ref={setAnchorRef} type="button">
        anchor
      </button>
      <div data-testid="anchored-popover" style={style} />
    </>
  );

  function setAnchorRef(node: HTMLButtonElement | null) {
    if (node) {
      node.getBoundingClientRect = () => ({
        x: 600,
        y: 500,
        left: 600,
        top: 500,
        right: 640,
        bottom: 532,
        width: 40,
        height: 32,
        toJSON: () => ({})
      });
    }

    anchorRef.current = node;
  }
}
