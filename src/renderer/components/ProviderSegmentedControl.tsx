import { useLayoutEffect, useRef, useState } from 'react';

interface ProviderSegmentedControlProps<T extends string> {
  options: { id: T; label: string }[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
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
  className
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
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setThumb({ left: btnRect.left - containerRect.left, width: btnRect.width });
    };
    measure();
    // 窗口尺寸变化时重新测量（主题/缩放等也可能改变按钮宽度）
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeId, options]);

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