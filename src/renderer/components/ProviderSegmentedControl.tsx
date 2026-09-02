import { useLayoutEffect, useRef, useState } from 'react';

interface ProviderSegmentedControlProps<T extends string> {
  options: { id: T; label: string }[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  /**
   * 控件所在容器是否处于可见状态（如弹窗 open）。
   * 状态变化时触发重新测量；测量用 offsetLeft/offsetWidth 布局属性，
   * 不受祖先 transform 影响，弹窗缩放动画期间也能得到正确几何，
   * 激活项文字始终有滑块衬底。
   */
  active?: boolean;
}

/**
 * 平台切换分段控件：滑块以弹性缓动在选项间滑动替换原来的生硬背景切换。
 * 网易云 / QQ 音乐主顶栏与登录弹窗共用。
 */
export function ProviderSegmentedControl<T extends string>({
  options,
  activeId,
  onChange,
  ariaLabel,
  className,
  active = true
}: ProviderSegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const activeBtn = buttonRefs.current[activeId];
      if (!activeBtn) return;
      // 必须用 offsetLeft/offsetWidth（布局属性）而非 getBoundingClientRect：
      // 后者受祖先 transform（如弹窗 scale 入场动画）影响，会量到过渡中间值
      // 并定格，滑块错位后激活项的近黑文字失去白色衬底，表现为"文字消失"
      if (activeBtn.offsetParent === container) {
        setThumb({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });
      } else {
        const containerRect = container.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        setThumb({ left: btnRect.left - containerRect.left, width: btnRect.width });
      }
    };
    measure();
    // 两帧后再校准一次（首帧可能仍在弹窗入场布局中），并监听容器尺寸变化
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      measure();
      secondFrame = window.requestAnimationFrame(measure);
    });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      observer.disconnect();
    };
  }, [activeId, options, active]);

  return (
    <div
      ref={containerRef}
      className={`provider-toggle ${className ?? ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        className={`provider-toggle-thumb ${thumb ? 'ready' : ''}`}
        style={thumb ? { transform: `translateX(${thumb.left}px)`, width: thumb.width } : undefined}
        aria-hidden="true"
      />
      {options.map((option) => (
        <button
          key={option.id}
          ref={(node) => { buttonRefs.current[option.id] = node; }}
          className={`provider-btn ${activeId === option.id ? 'active' : ''}`}
          onClick={() => onChange(option.id)}
          aria-pressed={activeId === option.id}
          style={{ zIndex: 1 }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
