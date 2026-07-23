import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface TimelineConfig {
  onComplete?: () => void;
  onInterrupt?: () => void;
}

interface TimelineHarness {
  complete: () => void;
  interrupt: () => void;
  kill: ReturnType<typeof vi.fn>;
  progress: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
}

const gsapHarness = vi.hoisted(() => {
  const timelines: TimelineHarness[] = [];
  const set = vi.fn();
  const timeline = vi.fn((config: TimelineConfig = {}) => {
    const instance = {
      complete: () => config.onComplete?.(),
      interrupt: () => config.onInterrupt?.(),
      kill: vi.fn(),
      progress: vi.fn(),
      to: vi.fn()
    } as TimelineHarness;
    instance.to.mockReturnValue(instance);
    timelines.push(instance);
    return instance;
  });

  return {
    registerPlugin: vi.fn(),
    set,
    timeline,
    timelines
  };
});

const environmentHarness = vi.hoisted(() => ({
  userAgent: navigator.userAgent
}));

vi.mock('gsap', () => ({
  default: (() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'main-content-transition-browser-test'
    });
    return gsapHarness;
  })()
}));

vi.mock('@gsap/react', async () => {
  const { useLayoutEffect } = await vi.importActual<typeof import('react')>('react');

  return {
    useGSAP: (
      callback: (
        context: unknown,
        contextSafe: <Callback extends (...args: never[]) => unknown>(callback: Callback) => Callback
      ) => void | (() => void),
      config: { dependencies?: unknown[] } = {}
    ) => {
      useLayoutEffect(
        () => callback({}, (safeCallback) => safeCallback),
        config.dependencies ?? []
      );

      return {
        context: {},
        contextSafe: <Callback extends (...args: never[]) => unknown>(safeCallback: Callback) => safeCallback
      };
    }
  };
});

import {
  MainContentTransition,
  createMainContentMotionKey,
  createMainContentTransitionKey,
  getMainContentTransitionSpec
} from './MainContentTransition';

describe('MainContentTransition', () => {
  beforeEach(() => {
    gsapHarness.registerPlugin.mockClear();
    gsapHarness.set.mockClear();
    gsapHarness.timeline.mockClear();
    gsapHarness.timelines.length = 0;
  });

  afterAll(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: environmentHarness.userAgent
    });
  });

  it('builds stable identities for every main-content route', () => {
    expect(createMainContentTransitionKey({ type: 'home' }, '', null)).toBe('home');
    expect(createMainContentTransitionKey({ type: 'search' }, '  neon sky  ', 'qq')).toBe('search:qq:neon sky');
    expect(createMainContentTransitionKey({ type: 'playlist', providerId: 'netease', playlistId: 'liked:7' }, '', null))
      .toBe('playlist:netease:liked:7');
    expect(createMainContentTransitionKey({ type: 'charts', providerId: 'qq' }, '', null)).toBe('charts:qq');
    expect(createMainContentTransitionKey({ type: 'chart', providerId: 'netease', chartId: '19723756' }, '', null))
      .toBe('chart:netease:19723756');
    expect(createMainContentTransitionKey({ type: 'playlistDiscovery', providerId: 'qq', categoryId: '165' }, '', null))
      .toBe('playlistDiscovery:qq:165');

    expect(createMainContentMotionKey({ type: 'playlistDiscovery', providerId: 'qq', categoryId: '165' }, '', null))
      .toBe('playlistDiscovery');
    expect(createMainContentMotionKey({ type: 'playlist', providerId: 'netease', playlistId: 'liked:7' }, '', null))
      .toBe('playlist:netease:liked:7');
    expect(createMainContentMotionKey({ type: 'playlist', providerId: 'netease', playlistId: 'daily:8' }, '', null))
      .toBe('playlist:netease:daily:8');
    expect(createMainContentMotionKey({ type: 'playlist', providerId: 'qq', playlistId: 'daily:8' }, '', null))
      .toBe('playlist:qq:daily:8');
  });

  it('uses distinct full-page motion profiles while keeping the readable handoff bounded', () => {
    const expectedTiming = {
      directional: { incomingAt: 0.1, incomingDuration: 0.28, outgoingDuration: 0.1 },
      layered: { incomingAt: 0.14, incomingDuration: 0.42, outgoingDuration: 0.14 },
      soft: { incomingAt: 0.12, incomingDuration: 0.32, outgoingDuration: 0.12 }
    } as const;
    for (const style of ['soft', 'directional', 'layered'] as const) {
      const spec = getMainContentTransitionSpec(style, 'forward', false);

      expect(spec).toMatchObject({
        reduced: false,
        incomingFrom: { autoAlpha: 0 },
        incomingTo: {
          autoAlpha: 1,
          duration: expectedTiming[style].incomingDuration,
          ease: style === 'layered' ? 'power3.out' : 'power2.out'
        },
        incomingAt: expectedTiming[style].incomingAt,
        outgoingTo: {
          autoAlpha: 0,
          duration: expectedTiming[style].outgoingDuration,
          ease: 'power2.in'
        },
        outgoingAt: 0
      });
      expect(spec.outgoingAt + (spec.outgoingTo?.duration as number)).toBe(spec.incomingAt);
      expect(spec.incomingAt + (spec.incomingTo.duration as number)).toBe(
        expectedTiming[style].incomingAt + expectedTiming[style].incomingDuration
      );
      expect(JSON.stringify(spec)).not.toMatch(/"opacity"|filter/);
    }
  });

  it('reverses the opposing directional travel for incoming and outgoing pages', () => {
    const forward = getMainContentTransitionSpec('directional', 'forward', false);
    const backward = getMainContentTransitionSpec('directional', 'backward', false);

    expect(forward.incomingFrom.x).toBe(28);
    expect(backward.incomingFrom.x).toBe(-28);
    expect(forward.incomingTo).toMatchObject({ x: 0, duration: 0.28, ease: 'power2.out' });
    expect(forward.incomingAt).toBe(0.1);
    expect(forward.outgoingTo).toMatchObject({ x: -16, duration: 0.1, ease: 'power2.in' });
    expect(backward.outgoingTo).toMatchObject({ x: 16, duration: 0.1, ease: 'power2.in' });
  });

  it('keeps soft and layered crossfades visually distinct', () => {
    const soft = getMainContentTransitionSpec('soft', 'forward', false);
    const layered = getMainContentTransitionSpec('layered', 'forward', false);

    expect(soft.incomingFrom).toMatchObject({ y: 8, scale: 0.994 });
    expect(soft.incomingTo).toMatchObject({ y: 0, scale: 1, duration: 0.32, ease: 'power2.out' });
    expect(soft.incomingAt).toBe(0.12);
    expect(soft.outgoingTo).toMatchObject({ y: -5, scale: 1.006, duration: 0.12, ease: 'power2.in' });
    expect(layered.incomingFrom).toMatchObject({ y: 18, scale: 0.972 });
    expect(layered.incomingTo).toMatchObject({ y: 0, scale: 1, duration: 0.42, ease: 'power3.out' });
    expect(layered.incomingAt).toBe(0.14);
    expect(layered.outgoingTo).toMatchObject({ y: -10, scale: 1.018, duration: 0.14, ease: 'power2.in' });
  });

  it('reduces every full-page style to a transform-free 120ms crossfade', () => {
    for (const style of ['soft', 'directional', 'layered'] as const) {
      const spec = getMainContentTransitionSpec(style, 'backward', true);
      const serialized = JSON.stringify(spec);

      expect(spec).toMatchObject({
        reduced: true,
        incomingFrom: { autoAlpha: 0 },
        incomingTo: { autoAlpha: 1, duration: 0.06, ease: 'none' },
        incomingAt: 0.06,
        outgoingTo: { autoAlpha: 0, duration: 0.06, ease: 'none' },
        outgoingAt: 0
      });
      expect(serialized).not.toMatch(/filter|willChange|"x"|"y"|scale|rotation/);
    }
  });

  it('keeps a single local content layer without rasterizing blur during category motion', () => {
    const spec = getMainContentTransitionSpec('directional', 'backward', false, 'section');

    expect(spec.incomingFrom).toMatchObject({ x: -20, y: 0, scale: 0.994 });
    expect(spec.incomingTo).toMatchObject({ x: 0, y: 0, scale: 1, duration: 0.34 });
    expect(spec.outgoingTo).toBeNull();
    expect(spec.outgoingAt).toBe(0);
    expect(JSON.stringify(spec)).not.toMatch(/autoAlpha|opacity|filter/);
  });

  it('reuses the previously active DOM node as an inert outgoing page', () => {
    const { container, rerender } = renderTransition('home', <section>Home page</section>);
    const initialLayer = container.querySelector('.main-content-transition-layer-active');

    rerenderTransition(rerender, 'artist:a', <section>Artist page</section>);

    const outgoing = container.querySelector('.main-content-transition-layer-outgoing');
    const active = container.querySelector('.main-content-transition-layer-active');
    const outgoingContent = outgoing?.querySelector('.main-content-transition-content');
    const activeContent = active?.querySelector('.main-content-transition-content');

    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);
    expect(outgoing).toBe(initialLayer);
    expect(outgoing).toHaveTextContent('Home page');
    expect(outgoing).toHaveAttribute('data-transition-key', 'home');
    expect(outgoing).toHaveAttribute('aria-hidden', 'true');
    expect(outgoing).toHaveAttribute('inert');
    expect(active).not.toBe(initialLayer);
    expect(active).toHaveTextContent('Artist page');
    expect(active).not.toHaveAttribute('aria-hidden');
    expect(active).not.toHaveAttribute('inert');

    const timeline = gsapHarness.timelines[0];
    expect(timeline.to).toHaveBeenCalledTimes(2);
    expect(timeline.to).toHaveBeenNthCalledWith(
      1,
      activeContent,
      expect.objectContaining({ autoAlpha: 1, duration: 0.32, ease: 'power2.out' }),
      0.12
    );
    expect(timeline.to).toHaveBeenNthCalledWith(
      2,
      outgoingContent,
      expect.objectContaining({ autoAlpha: 0, duration: 0.12, ease: 'power2.in' }),
      0
    );
  });

  it('keeps one active page and starts the incoming motion immediately when retention is disabled', () => {
    const { container, rerender } = render(
      <MainContentTransition
        transitionKey="home"
        style="soft"
        direction="forward"
        reduceEffects={false}
        retainOutgoing={false}
      >
        <section>Home page</section>
      </MainContentTransition>
    );

    rerender(
      <MainContentTransition
        transitionKey="search:qq:test"
        style="soft"
        direction="forward"
        reduceEffects={false}
        retainOutgoing={false}
      >
        <section>Search page</section>
      </MainContentTransition>
    );

    const activeContent = container.querySelector('.main-content-transition-layer-active .main-content-transition-content');
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).not.toBeInTheDocument();
    expect(activeContent).toHaveTextContent('Search page');
    expect(gsapHarness.timelines[0].to).toHaveBeenCalledTimes(1);
    expect(gsapHarness.timelines[0].to).toHaveBeenCalledWith(
      activeContent,
      expect.objectContaining({ autoAlpha: 1, duration: 0.32 }),
      0
    );
  });

  it('keeps at most the last committed page and the new page when a transition is interrupted', () => {
    const { container, rerender } = renderTransition('home', <section>Home page</section>);

    rerenderTransition(rerender, 'playlist:a', <section>Playlist A</section>);
    const interruptedTimeline = gsapHarness.timelines[0];
    const playlistALayer = container.querySelector('.main-content-transition-layer-active');
    rerenderTransition(rerender, 'playlist:b', <section>Playlist B</section>);

    expect(interruptedTimeline.kill).toHaveBeenCalledTimes(1);
    expect(interruptedTimeline.progress).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);
    expect(screen.queryByText('Home page')).not.toBeInTheDocument();
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toBe(playlistALayer);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toHaveTextContent('Playlist A');
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Playlist B');
  });

  it('keeps the active generation running when its transition preferences change', () => {
    const { container, rerender } = render(
      <MainContentTransition
        transitionKey="home"
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        <section>Home page</section>
      </MainContentTransition>
    );

    rerender(
      <MainContentTransition
        transitionKey="artist:a"
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        <section>Artist page</section>
      </MainContentTransition>
    );
    const activeTimeline = gsapHarness.timelines[0];

    rerender(
      <MainContentTransition
        transitionKey="artist:a"
        style="layered"
        direction="backward"
        reduceEffects={false}
      >
        <section>Artist page</section>
      </MainContentTransition>
    );

    expect(activeTimeline.kill).not.toHaveBeenCalled();
    expect(gsapHarness.timeline).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);

    act(() => activeTimeline.complete());
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
  });

  it('settles the current outgoing page when GSAP interrupts unexpectedly', () => {
    const { container, rerender } = renderTransition('home', <section>Home page</section>);

    rerenderTransition(rerender, 'artist:a', <section>Artist page</section>);
    act(() => gsapHarness.timelines[0].interrupt());

    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Artist page');
  });

  it('keeps only the current and immediately previous page when navigation returns to an earlier route', () => {
    const { container, rerender } = renderTransition('artist:a', <section>Artist A</section>);

    rerenderTransition(rerender, 'album:b', <section>Album B</section>);
    const albumLayer = container.querySelector('.main-content-transition-layer-active');
    rerenderTransition(rerender, 'artist:a', <section>Artist A again</section>);

    expect(container.querySelectorAll('.main-content-transition-stage')).toHaveLength(1);
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toBe(albumLayer);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toHaveTextContent('Album B');
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Artist A again');
  });

  it('ignores a stale completion callback and removes only the current outgoing page on completion', () => {
    const { container, rerender } = renderTransition('home', <section>Home page</section>);

    rerenderTransition(rerender, 'playlist:a', <section>Playlist A</section>);
    const staleTimeline = gsapHarness.timelines[0];
    rerenderTransition(rerender, 'playlist:b', <section>Playlist B</section>);
    const currentTimeline = gsapHarness.timelines[1];
    const currentOutgoing = container.querySelector('.main-content-transition-layer-outgoing');
    const currentOutgoingContent = currentOutgoing?.querySelector('.main-content-transition-content');
    const getOutgoingClearCount = () => gsapHarness.set.mock.calls.filter(([target, vars]) => (
      target === currentOutgoingContent
      && vars
      && typeof vars === 'object'
      && 'clearProps' in vars
    )).length;

    act(() => staleTimeline.complete());
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toBe(currentOutgoing);
    expect(currentOutgoing).toHaveTextContent('Playlist A');
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Playlist B');

    const outgoingClearCountBeforeCompletion = getOutgoingClearCount();
    act(() => currentTimeline.complete());
    expect(getOutgoingClearCount()).toBe(outgoingClearCountBeforeCompletion);
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Playlist B');
  });

  it('updates children for the same transition key without starting a new transition', () => {
    const { rerender } = renderTransition('home', <section>Home version 1</section>);

    rerenderTransition(rerender, 'home', <section>Home version 2</section>);

    expect(gsapHarness.timeline).not.toHaveBeenCalled();
    expect(screen.queryByText('Home version 1')).not.toBeInTheDocument();
    expect(screen.getByText('Home version 2')).toBeInTheDocument();
  });

  it('keeps one reusable wrapper for section transitions', () => {
    const { container, rerender } = render(
      <MainContentTransition
        transitionKey="playlistDiscovery:qq:all"
        motionKey="category:all"
        scope="section"
        style="directional"
        direction="forward"
        reduceEffects={false}
      >
        <section>All playlists</section>
      </MainContentTransition>
    );
    const initialLayer = container.querySelector('.main-content-transition-layer-active');

    rerender(
      <MainContentTransition
        transitionKey="playlistDiscovery:qq:165"
        motionKey="category:165"
        scope="section"
        style="directional"
        direction="forward"
        reduceEffects={false}
      >
        <section>Pop playlists</section>
      </MainContentTransition>
    );

    const active = container.querySelector('.main-content-transition-layer-active');
    const activeContent = active?.querySelector('.main-content-transition-content');
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).not.toBeInTheDocument();
    expect(active).toBe(initialLayer);
    expect(active).toHaveTextContent('Pop playlists');
    expect(gsapHarness.timeline).toHaveBeenCalledTimes(1);
    expect(gsapHarness.timelines[0].to).toHaveBeenCalledTimes(1);
    expect(gsapHarness.timelines[0].to).toHaveBeenCalledWith(
      activeContent,
      expect.objectContaining({ duration: 0.34, ease: 'power2.out' }),
      0
    );
  });

  it('keeps a stable layer when route content changes inside the same motion boundary', () => {
    const { container, rerender } = render(
      <MainContentTransition
        transitionKey="playlistDiscovery:qq:all"
        motionKey="playlistDiscovery"
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        <section>All playlists</section>
      </MainContentTransition>
    );
    const initialLayer = container.querySelector('.main-content-transition-layer-active');

    rerender(
      <MainContentTransition
        transitionKey="playlistDiscovery:qq:165"
        motionKey="playlistDiscovery"
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        <section>Pop playlists</section>
      </MainContentTransition>
    );

    expect(container.querySelector('.main-content-transition-stage')).toHaveAttribute(
      'data-transition-key',
      'playlistDiscovery:qq:165'
    );
    expect(container.querySelector('.main-content-transition-stage')).toHaveAttribute('data-motion-key', 'playlistDiscovery');
    expect(container.querySelector('.main-content-transition-layer-active')).toBe(initialLayer);
    expect(gsapHarness.timeline).not.toHaveBeenCalled();
  });

  it('keeps a two-layer transition in Strict Mode and settles back to one page', () => {
    const { container, rerender } = renderStrictTransition('home', <section>Home page</section>);
    const initialLayer = container.querySelector('.main-content-transition-layer-active');

    rerenderStrictTransition(rerender, 'search:qq:neon', <section>Search page</section>);

    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(2);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toBe(initialLayer);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).toHaveTextContent('Home page');
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Search page');
    expect(gsapHarness.timeline).toHaveBeenCalledTimes(1);

    act(() => gsapHarness.timelines[0].complete());
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-outgoing')).not.toBeInTheDocument();
    expect(container.querySelector('.main-content-transition-layer-active')).toHaveTextContent('Search page');
  });

  it('does not animate nested page descendants during a full-page transition', () => {
    const { rerender } = renderTransition('home', <section>Home page</section>);

    rerenderTransition(
      rerender,
      'search:qq:neon',
      <section>
        <header data-main-reveal>Reveal heading</header>
        <div>Static content</div>
        <div><span data-main-reveal>Nested reveal</span></div>
      </section>
    );

    const revealSetCall = gsapHarness.set.mock.calls.find(([target, vars]) => (
      target instanceof HTMLElement
        && target.hasAttribute('data-main-reveal')
        && vars
        && typeof vars === 'object'
        && 'y' in vars
    ));
    expect(revealSetCall).toBeUndefined();
  });

  it('kills the scoped active timeline when the transition boundary unmounts', () => {
    const { rerender, unmount } = renderTransition('home', <section>Home page</section>);
    rerenderTransition(rerender, 'playlist:a', <section>Playlist A</section>);
    const activeTimeline = gsapHarness.timelines[0];

    unmount();

    expect(activeTimeline.kill).toHaveBeenCalledTimes(1);
    expect(activeTimeline.progress).not.toHaveBeenCalled();
  });
});

function renderTransition(transitionKey: string, children: React.ReactNode) {
  return render(
    <MainContentTransition
      transitionKey={transitionKey}
      style="soft"
      direction="forward"
      reduceEffects={false}
    >
      {children}
    </MainContentTransition>
  );
}

function rerenderTransition(
  rerender: ReturnType<typeof render>['rerender'],
  transitionKey: string,
  children: React.ReactNode
) {
  rerender(
    <MainContentTransition
      transitionKey={transitionKey}
      style="soft"
      direction="forward"
      reduceEffects={false}
    >
      {children}
    </MainContentTransition>
  );
}

function renderStrictTransition(transitionKey: string, children: React.ReactNode) {
  return render(
    <StrictMode>
      <MainContentTransition
        transitionKey={transitionKey}
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        {children}
      </MainContentTransition>
    </StrictMode>
  );
}

function rerenderStrictTransition(
  rerender: ReturnType<typeof render>['rerender'],
  transitionKey: string,
  children: React.ReactNode
) {
  rerender(
    <StrictMode>
      <MainContentTransition
        transitionKey={transitionKey}
        style="soft"
        direction="forward"
        reduceEffects={false}
      >
        {children}
      </MainContentTransition>
    </StrictMode>
  );
}
