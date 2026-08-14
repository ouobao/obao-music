import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { ProviderId } from '../../shared/musicTypes';
import type {
  AppView,
  ContentTransitionStyle,
  NavigationDirection
} from '../state/uiStore';

gsap.registerPlugin(useGSAP);

const isTestRuntime = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const layerClearProps = 'transform,opacity,visibility,willChange';

interface MainContentTransitionProps {
  children: ReactNode;
  transitionKey: string;
  motionKey?: string;
  scope?: 'page' | 'section';
  style: ContentTransitionStyle;
  direction: NavigationDirection;
  reduceEffects: boolean;
  retainOutgoing?: boolean;
}

export interface MainContentTransitionSpec {
  reduced: boolean;
  incomingFrom: gsap.TweenVars;
  incomingTo: gsap.TweenVars;
  incomingAt: number;
  outgoingTo: gsap.TweenVars | null;
  outgoingAt: number;
}

interface MainContentLayerSnapshot {
  children: ReactNode;
  id: number;
  motionKey: string;
  transitionKey: string;
}

interface MainContentLayerState {
  activeId: number;
  activeMotionKey: string;
  generation: number;
  nextId: number;
  outgoing: MainContentLayerSnapshot | null;
}

export function MainContentTransition({
  children,
  transitionKey,
  motionKey = transitionKey,
  scope = 'page',
  style,
  direction,
  reduceEffects,
  retainOutgoing = true
}: MainContentTransitionProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const incomingContentRef = useRef<HTMLDivElement | null>(null);
  const outgoingContentRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const animatedGenerationRef = useRef(0);
  const previousReduceEffectsRef = useRef(reduceEffects);
  const committedLayerRef = useRef<MainContentLayerSnapshot>({
    children,
    id: 0,
    motionKey,
    transitionKey
  });
  const [layerState, setLayerState] = useState<MainContentLayerState>(() => ({
    activeId: 0,
    activeMotionKey: motionKey,
    generation: 0,
    nextId: 0,
    outgoing: null
  }));
  let renderedLayerState = layerState;

  if (layerState.activeMotionKey !== motionKey) {
    const nextId = scope === 'page' ? layerState.nextId + 1 : layerState.nextId;
    const nextLayerState: MainContentLayerState = {
      activeId: scope === 'page' ? nextId : layerState.activeId,
      activeMotionKey: motionKey,
      generation: layerState.generation + 1,
      nextId,
      outgoing: scope === 'page' && retainOutgoing && !isTestRuntime
        ? committedLayerRef.current
        : null
    };
    setLayerState(nextLayerState);
    renderedLayerState = nextLayerState;
  }

  useLayoutEffect(() => {
    committedLayerRef.current = {
      children,
      id: renderedLayerState.activeId,
      motionKey,
      transitionKey
    };
  });

  const transitionGeneration = renderedLayerState.generation;
  const outgoingSnapshot = renderedLayerState.outgoing;

  useGSAP(
    (_context, contextSafe) => {
      const isNewPage = animatedGenerationRef.current !== transitionGeneration;
      animatedGenerationRef.current = transitionGeneration;

      if (isTestRuntime || !isNewPage || transitionGeneration === 0) {
        return undefined;
      }

      const incoming = incomingContentRef.current;
      const outgoing = outgoingContentRef.current;
      if (!incoming) {
        return undefined;
      }

      const spec = getMainContentTransitionSpec(style, direction, reduceEffects, scope);
      let timeline: gsap.core.Timeline | null = null;
      let watchdogId: number | null = null;
      const outgoingId = outgoingSnapshot?.id ?? null;
      let settled = false;
      const clearWatchdog = () => {
        if (watchdogId !== null) {
          window.clearTimeout(watchdogId);
          watchdogId = null;
        }
      };
      const handleSettle = () => {
        if (settled) {
          return;
        }

        if (timelineRef.current !== timeline && timelineRef.current !== null) {
          return;
        }

        settled = true;
        clearWatchdog();
        timelineRef.current = null;
        try {
          gsap.set(incoming, { clearProps: layerClearProps });
        } catch {
          // GSAP can reject a detached node while React is unmounting.
        }
        if (outgoingId !== null) {
          setLayerState((currentState) => (
            currentState.generation === transitionGeneration
            && currentState.outgoing?.id === outgoingId
              ? { ...currentState, outgoing: null }
              : currentState
          ));
        }
      };
      const settleTransition = contextSafe ? contextSafe(handleSettle) : handleSettle;
      try {
        gsap.set(incoming, { clearProps: layerClearProps });
        if (outgoing) {
          gsap.set(outgoing, { clearProps: layerClearProps });
        }

        if (spec.reduced) {
          gsap.set(incoming, spec.incomingFrom);
        } else {
          gsap.set(incoming, { willChange: scope === 'section' ? 'transform' : 'transform, opacity' });
          gsap.set(incoming, spec.incomingFrom);
          if (outgoing) {
            gsap.set(outgoing, { willChange: 'transform, opacity' });
          }
        }

        timeline = gsap.timeline({
          onComplete: settleTransition,
          onInterrupt: settleTransition
        });
        timelineRef.current = timeline;

        timeline.to(incoming, spec.incomingTo, outgoing ? spec.incomingAt : 0);
        if (outgoing && spec.outgoingTo) {
          timeline.to(outgoing, spec.outgoingTo, spec.outgoingAt);
        }

        const incomingEnd = spec.incomingAt + Number(spec.incomingTo.duration ?? 0);
        const outgoingEnd = spec.outgoingTo
          ? spec.outgoingAt + Number(spec.outgoingTo.duration ?? 0)
          : 0;
        const watchdogMs = Math.max(incomingEnd, outgoingEnd) * 1_000 + 500;
        watchdogId = window.setTimeout(settleTransition, watchdogMs);
      } catch {
        handleSettle();
      }

      return () => {
        clearWatchdog();
        if (timelineRef.current === timeline) {
          timelineRef.current = null;
        }
        timeline?.kill();
      };
    },
    {
      dependencies: [transitionGeneration],
      scope: stageRef,
      revertOnUpdate: true
    }
  );

  useLayoutEffect(() => {
    const becameReduced = reduceEffects && !previousReduceEffectsRef.current;
    previousReduceEffectsRef.current = reduceEffects;
    if (becameReduced) {
      timelineRef.current?.progress(1);
    }
  }, [reduceEffects]);

  return (
    <div
      className={`main-content-transition-stage main-content-transition-stage-${scope}`}
      data-testid={scope === 'page' ? 'main-content-transition' : undefined}
      data-transition-key={transitionKey}
      data-motion-key={motionKey}
      data-transition-scope={scope}
      data-transition-style={style}
      data-transition-direction={direction}
      data-reduce-effects={reduceEffects ? 'true' : 'false'}
      ref={stageRef}
    >
      {outgoingSnapshot ? (
        <div
          aria-hidden="true"
          className="main-content-transition-layer main-content-transition-layer-outgoing"
          data-transition-key={outgoingSnapshot.transitionKey}
          data-transition-layer="outgoing"
          key={`main-content-layer-${outgoingSnapshot.id}`}
          ref={(element) => element?.setAttribute('inert', '')}
        >
          <div className="main-content-transition-content" ref={outgoingContentRef}>
            {outgoingSnapshot.children}
          </div>
        </div>
      ) : null}
      <div
        className="main-content-transition-layer main-content-transition-layer-active"
        data-transition-layer="active"
        key={scope === 'page' ? `main-content-layer-${renderedLayerState.activeId}` : 'main-content-section-layer'}
        ref={(element) => element?.removeAttribute('inert')}
      >
        <div className="main-content-transition-content" ref={incomingContentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function createMainContentTransitionKey(
  view: AppView,
  searchKeyword: string,
  searchProviderId: ProviderId | null
) {
  switch (view.type) {
    case 'search':
      return `search:${searchProviderId ?? 'none'}:${searchKeyword.trim()}`;
    case 'playlist':
      return `playlist:${view.providerId}:${view.playlistId}`;
    case 'recommendationCollection':
      return `recommendationCollection:${view.providerId}:${view.collectionId}`;
    case 'charts':
      return `charts:${view.providerId}`;
    case 'chart':
      return `chart:${view.providerId}:${view.chartId}`;
    case 'playlistDiscovery':
      return `playlistDiscovery:${view.providerId}:${view.categoryId}`;
    case 'artist':
      return `artist:${view.providerId}:${view.artistId}`;
    case 'album':
      return `album:${view.providerId}:${view.albumId}`;
    default:
      return 'home';
  }
}

export function createMainContentMotionKey(
  view: AppView,
  searchKeyword: string,
  searchProviderId: ProviderId | null
) {
  if (view.type === 'playlistDiscovery') {
    return 'playlistDiscovery';
  }

  return createMainContentTransitionKey(view, searchKeyword, searchProviderId);
}

export function getMainContentTransitionSpec(
  style: ContentTransitionStyle,
  direction: NavigationDirection,
  reduceEffects: boolean,
  scope: 'page' | 'section' = 'page'
): MainContentTransitionSpec {
  if (reduceEffects) {
    return {
      reduced: true,
      incomingFrom: { autoAlpha: 0 },
      incomingTo: { autoAlpha: 1, duration: 0.06, ease: 'none' },
      incomingAt: 0.06,
      outgoingTo: { autoAlpha: 0, duration: 0.06, ease: 'none' },
      outgoingAt: 0
    };
  }

  if (scope === 'section') {
    const travel = direction === 'backward' ? -1 : 1;
    const isDirectional = style === 'directional';
    const isLayered = style === 'layered';
    return {
      reduced: false,
      incomingFrom: {
        x: isDirectional ? travel * 20 : 0,
        y: isDirectional ? 0 : isLayered ? 18 : 8,
        scale: isLayered ? 0.972 : 0.994
      },
      incomingTo: {
        x: 0,
        y: 0,
        scale: 1,
        duration: isLayered ? 0.44 : 0.34,
        ease: isLayered ? 'power3.out' : 'power2.out'
      },
      incomingAt: 0,
      outgoingTo: null,
      outgoingAt: 0
    };
  }

  if (style === 'directional') {
    const travel = direction === 'backward' ? -1 : 1;
    return {
      reduced: false,
      incomingFrom: { autoAlpha: 0, x: travel * 28 },
      incomingTo: { autoAlpha: 1, x: 0, duration: 0.28, ease: 'power2.out' },
      incomingAt: 0.1,
      outgoingTo: { autoAlpha: 0, x: travel * -16, duration: 0.1, ease: 'power2.in' },
      outgoingAt: 0
    };
  }

  if (style === 'layered') {
    return {
      reduced: false,
      incomingFrom: { autoAlpha: 0, y: 18, scale: 0.972 },
      incomingTo: { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: 'power3.out' },
      incomingAt: 0.14,
      outgoingTo: { autoAlpha: 0, y: -10, scale: 1.018, duration: 0.14, ease: 'power2.in' },
      outgoingAt: 0
    };
  }

  return {
    reduced: false,
    incomingFrom: { autoAlpha: 0, y: 8, scale: 0.994 },
    incomingTo: { autoAlpha: 1, y: 0, scale: 1, duration: 0.32, ease: 'power2.out' },
    incomingAt: 0.12,
    outgoingTo: { autoAlpha: 0, y: -5, scale: 1.006, duration: 0.12, ease: 'power2.in' },
    outgoingAt: 0
  };
}
