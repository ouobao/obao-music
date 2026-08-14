import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

gsap.registerPlugin(useGSAP);

export interface ElasticOption<Value extends string> {
  value: Value;
  label: string;
}

interface ElasticOptionListProps<Value extends string, Option extends ElasticOption<Value>> {
  activeClassName: string;
  ariaLabel: string;
  className: string;
  containerRef: RefObject<HTMLDivElement>;
  dataState: 'open' | 'closed';
  onChange: (value: Value) => void;
  onMotionComplete: () => void;
  optionClassName: string;
  options: readonly Option[];
  renderOption: (option: Option) => ReactNode;
  style?: CSSProperties;
  value: Value;
}

interface IndicatorMetrics {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function ElasticOptionList<Value extends string, Option extends ElasticOption<Value>>({
  activeClassName,
  ariaLabel,
  className,
  containerRef,
  dataState,
  onChange,
  onMotionComplete,
  optionClassName,
  options,
  renderOption,
  style,
  value
}: ElasticOptionListProps<Value, Option>) {
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const isAnimatingRef = useRef(false);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const { contextSafe } = useGSAP(
    () => () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
    },
    { scope: containerRef }
  );

  useLayoutEffect(() => {
    if (isAnimatingRef.current) {
      return;
    }

    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const option = optionRefs.current[activeIndex];
    if (!container || !indicator || !option) {
      return;
    }

    const metrics = readIndicatorMetrics(container, option);
    gsap.set(indicator, { ...metrics, scaleY: 1, transformOrigin: '50% 50%' });
    indicator.dataset.motionState = 'settled';
  }, [activeIndex, containerRef, options.length]);

  const animateSelection = contextSafe((targetIndex: number) => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const currentOption = optionRefs.current[activeIndex];
    const targetOption = optionRefs.current[targetIndex];
    if (!container || !indicator || !currentOption || !targetOption) {
      onMotionComplete();
      return;
    }

    timelineRef.current?.kill();
    isAnimatingRef.current = true;

    const currentMetrics = readIndicatorMetrics(container, currentOption);
    const targetMetrics = readIndicatorMetrics(container, targetOption);
    if (!indicator.dataset.motionState) {
      gsap.set(indicator, { ...currentMetrics, scaleY: 1, transformOrigin: '50% 50%' });
    }

    const edge = targetIndex === 0 ? 'min' : targetIndex === options.length - 1 ? 'max' : null;
    indicator.dataset.motionState = edge ? 'impact' : 'moving';
    if (edge) {
      container.dataset.edgeImpulse = edge;
    } else {
      delete container.dataset.edgeImpulse;
    }

    const settle = () => {
      isAnimatingRef.current = false;
      indicator.dataset.motionState = 'settled';
      delete container.dataset.edgeImpulse;
      gsap.set(container, { clearProps: 'transform,transformOrigin' });
      timelineRef.current = null;
      onMotionComplete();
    };

    if (prefersReducedMotion()) {
      gsap.set(indicator, { ...targetMetrics, scaleY: 1, transformOrigin: '50% 50%' });
      settle();
      return;
    }

    const timeline = gsap.timeline({ onComplete: settle });
    timelineRef.current = timeline;

    if (!edge) {
      timeline.to(indicator, {
        ...targetMetrics,
        duration: 0.34,
        ease: 'power3.inOut',
        overwrite: 'auto'
      });
      return;
    }

    const direction = edge === 'min' ? -1 : 1;
    const transformOrigin = edge === 'min' ? '50% 100%' : '50% 0%';
    timeline
      .to(indicator, {
        ...targetMetrics,
        y: targetMetrics.y + direction * 6,
        scaleY: 1.14,
        transformOrigin,
        duration: 0.28,
        ease: 'power3.inOut',
        overwrite: 'auto'
      })
      .to(container, {
        y: direction * 3,
        scaleY: 1.045,
        transformOrigin,
        duration: 0.14,
        ease: 'power4.out',
        overwrite: 'auto'
      }, '<0.14')
      .to(indicator, {
        y: targetMetrics.y,
        scaleY: 1,
        duration: 0.36,
        ease: 'elastic.out(1, 0.46)'
      })
      .to(container, {
        y: 0,
        scaleY: 1,
        duration: 0.42,
        ease: 'elastic.out(1, 0.44)'
      }, '<');
  });

  function handleSelect(option: Option, index: number) {
    if (index === activeIndex) {
      onMotionComplete();
      return;
    }

    animateSelection(index);
    onChange(option.value);
  }

  return (
    <div
      className={`${className} elastic-option-list`}
      role="dialog"
      aria-label={ariaLabel}
      data-state={dataState}
      ref={containerRef}
      style={style}
    >
      <span className="elastic-option-indicator" aria-hidden="true" ref={indicatorRef} />
      {options.map((option, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            className={isActive ? `${optionClassName} ${activeClassName}` : optionClassName}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleSelect(option, index)}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            key={option.value}
          >
            {renderOption(option)}
          </button>
        );
      })}
    </div>
  );
}

function readIndicatorMetrics(container: HTMLElement, option: HTMLElement): IndicatorMetrics {
  const containerRect = container.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();

  return {
    height: option.offsetHeight || optionRect.height,
    width: option.offsetWidth || optionRect.width,
    x: option.offsetLeft || optionRect.left - containerRect.left,
    y: option.offsetTop || optionRect.top - containerRect.top
  };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
