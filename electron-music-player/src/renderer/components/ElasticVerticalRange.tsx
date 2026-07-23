import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  useRef,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type RefObject
} from 'react';

gsap.registerPlugin(useGSAP);

type Edge = 'min' | 'max';

interface DragState {
  edge: Edge | null;
  lastY: number;
  overscroll: number;
  pointerId: number;
}

type RangeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'max' | 'min' | 'onChange' | 'onPointerCancel' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'step' | 'type' | 'value'
>;

interface ElasticVerticalRangeProps extends RangeInputProps {
  max: number;
  min: number;
  onPointerDown?: PointerEventHandler<HTMLInputElement>;
  onValueChange: (value: number) => void;
  step?: number;
  surfaceRef: RefObject<HTMLElement>;
  value: number;
}

const pullDistancePx = 18;
const maximumStretch = 0.08;

export function ElasticVerticalRange({
  max,
  min,
  onPointerDown,
  onValueChange,
  step,
  surfaceRef,
  value,
  ...inputProps
}: ElasticVerticalRangeProps) {
  const dragRef = useRef<DragState | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const { contextSafe } = useGSAP(
    () => () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
      if (surfaceRef.current) {
        gsap.killTweensOf(surfaceRef.current);
      }
    },
    { scope: surfaceRef }
  );

  const applyPull = contextSafe((edge: Edge, overscroll: number) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    surface.dataset.edgeImpulse = edge;
    surface.dataset.edgeState = 'pulling';
    if (prefersReducedMotion()) {
      return;
    }

    const direction = edge === 'max' ? -1 : 1;
    const resistance = 1 - Math.exp(-overscroll / pullDistancePx);
    gsap.to(surface, {
      y: direction * resistance * 4,
      scaleY: 1 + resistance * maximumStretch,
      transformOrigin: edge === 'max' ? '50% 100%' : '50% 0%',
      duration: 0.16,
      ease: 'power3.out',
      overwrite: 'auto'
    });
  });

  const releaseDrag = contextSafe(() => {
    const drag = dragRef.current;
    const surface = surfaceRef.current;
    dragRef.current = null;
    if (!drag?.edge || !surface) {
      return;
    }

    surface.dataset.edgeState = 'rebounding';
    timelineRef.current?.kill();
    gsap.killTweensOf(surface);

    if (prefersReducedMotion()) {
      delete surface.dataset.edgeImpulse;
      surface.dataset.edgeState = 'settled';
      return;
    }

    const direction = drag.edge === 'max' ? -1 : 1;
    timelineRef.current = gsap.timeline({
      onComplete: () => {
        delete surface.dataset.edgeImpulse;
        surface.dataset.edgeState = 'settled';
        gsap.set(surface, { clearProps: 'transform,transformOrigin' });
        timelineRef.current = null;
      }
    })
      .to(surface, {
        y: direction * -1.5,
        scaleY: 0.982,
        duration: 0.12,
        ease: 'power3.in'
      })
      .to(surface, {
        y: direction * 0.8,
        scaleY: 1.018,
        duration: 0.16,
        ease: 'back.out(2.8)'
      })
      .to(surface, {
        y: 0,
        scaleY: 1,
        duration: 0.38,
        ease: 'elastic.out(1, 0.46)'
      });
  });

  function handlePointerDown(event: ReactPointerEvent<HTMLInputElement>) {
    timelineRef.current?.kill();
    dragRef.current = {
      edge: null,
      lastY: event.clientY,
      overscroll: 0,
      pointerId: event.pointerId
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onPointerDown?.(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLInputElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaY = event.clientY - drag.lastY;
    drag.lastY = event.clientY;
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.5) {
      return;
    }

    const currentValue = Number(event.currentTarget.value);
    const tolerance = Math.max(Number.EPSILON, Math.abs(max - min) * 0.000001);
    const edge = currentValue >= max - tolerance && deltaY < 0
      ? 'max'
      : currentValue <= min + tolerance && deltaY > 0
        ? 'min'
        : null;

    if (!edge) {
      return;
    }

    if (drag.edge !== edge) {
      drag.edge = edge;
      drag.overscroll = 0;
    }
    drag.overscroll += Math.abs(deltaY);
    applyPull(edge, drag.overscroll);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLInputElement>) {
    releaseDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <input
      {...inputProps}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange(Number(event.currentTarget.value))}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={releaseDrag}
    />
  );
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
