import { useEffect, useRef, useState, type RefObject } from 'react';

interface ScrollIndicatorProps {
  targetRef: RefObject<HTMLElement | null>;
}

interface ThumbState {
  visible: boolean;
  top: number;
  height: number;
}

const MIN_THUMB_HEIGHT = 36;

/**
 * 舞台右侧的细滚动指示器。
 *
 * Windows 11 的原生 Fluent 滚动条带左右箭头，且会贴窗口最右侧，
 * 与贴边外壳的分隔线打架；这里隐藏原生滚动条，用一个 3px 的 overlay 指示器代替。
 * 指示器只负责提示位置，不接收指针事件，真正的滚动仍由 .main-content 承担。
 */
export function ScrollIndicator({ targetRef }: ScrollIndicatorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ThumbState>({ visible: false, top: 0, height: MIN_THUMB_HEIGHT });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    const track = trackRef.current;
    if (!target || !track) return;

    let frame = 0;
    let idleTimer = 0;

    const update = () => {
      frame = 0;
      const trackHeight = track.clientHeight;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 4 || trackHeight <= 0) {
        setThumb((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const height = Math.max(
        MIN_THUMB_HEIGHT,
        Math.min(trackHeight, (clientHeight / scrollHeight) * trackHeight)
      );
      const top = (target.scrollTop / maxScroll) * (trackHeight - height);
      setThumb({
        visible: true,
        top: Math.round(top * 10) / 10,
        height: Math.round(height * 10) / 10
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const handleScroll = () => {
      schedule();
      setActive(true);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setActive(false), 900);
    };

    update();
    target.addEventListener('scroll', handleScroll, { passive: true });

    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    // 页面切换时内容高度变化，但滚动容器本身尺寸不变，需要观察内容层
    const stage = target.firstElementChild;
    if (stage) observer.observe(stage);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(idleTimer);
      target.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [targetRef]);

  return (
    <div
      ref={trackRef}
      className={`scroll-indicator${thumb.visible ? ' visible' : ''}${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      <span
        className="scroll-indicator-thumb"
        style={{ height: `${thumb.height}px`, transform: `translateY(${thumb.top}px)` }}
      />
    </div>
  );
}
