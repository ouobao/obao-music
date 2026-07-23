import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const diagnosticHarness = vi.hoisted(() => ({
  reportRendererDiagnostic: vi.fn()
}));

vi.mock('../utils/runtimeDiagnostics', () => ({
  reportRendererDiagnostic: diagnosticHarness.reportRendererDiagnostic,
  toErrorDetails: (error: Error) => ({ message: error.message, stack: error.stack })
}));

import { RendererErrorBoundary } from './RendererErrorBoundary';

describe('RendererErrorBoundary', () => {
  beforeEach(() => {
    diagnosticHarness.reportRendererDiagnostic.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates a child render error and reports the affected area', () => {
    const onError = vi.fn();

    render(
      <RendererErrorBoundary
        area="lyrics-panel"
        entityId="qq:song-1"
        fallback={<p>Lyrics unavailable</p>}
        onError={onError}
      >
        <ThrowingChild />
      </RendererErrorBoundary>
    );

    expect(screen.getByText('Lyrics unavailable')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(diagnosticHarness.reportRendererDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      area: 'lyrics-panel',
      entityId: 'qq:song-1',
      event: 'react-error-boundary',
      message: 'render failed'
    }));
  });

  it('resets the isolated failure when its reset key changes', () => {
    const { rerender } = render(
      <RendererErrorBoundary
        area="artist-detail"
        fallback={<p>Artist unavailable</p>}
        resetKey="artist-a"
      >
        <ThrowingChild />
      </RendererErrorBoundary>
    );
    expect(screen.getByText('Artist unavailable')).toBeInTheDocument();

    rerender(
      <RendererErrorBoundary
        area="artist-detail"
        fallback={<p>Artist unavailable</p>}
        resetKey="artist-b"
      >
        <p>Artist B</p>
      </RendererErrorBoundary>
    );

    expect(screen.getByText('Artist B')).toBeInTheDocument();
    expect(screen.queryByText('Artist unavailable')).not.toBeInTheDocument();
  });
});

function ThrowingChild(): never {
  throw new Error('render failed');
}
