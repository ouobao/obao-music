import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

interface HistoryDateSelectProps {
  dates: readonly string[];
  value: string;
  disabled?: boolean;
  onChange?: (date: string) => void;
  formatDate: (date: string) => string;
}

export function HistoryDateSelect({
  dates,
  value,
  disabled = false,
  onChange,
  formatDate
}: HistoryDateSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, dates.indexOf(value));
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const presence = useAnimatedPresence(isOpen, 180);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen && presence.isMounted) {
      optionRefs.current[activeIndex]?.focus();
    }
  }, [activeIndex, isOpen, presence.isMounted]);

  const selectDate = (date: string) => {
    closeListbox(true);
    if (date !== value) {
      onChange?.(date);
    }
  };

  const closeListbox = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      closeListbox(event.key === 'Escape');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDate(dates[activeIndex] ?? value);
      return;
    }
    const nextIndex = getNextIndex(event.key, activeIndex, dates.length);
    if (nextIndex !== activeIndex) {
      event.preventDefault();
      setActiveIndex(nextIndex);
    }
  };

  return (
    <div className="history-date-select" ref={rootRef}>
      <button
        className="history-date-select-trigger netease-discovery-history-date"
        type="button"
        role="combobox"
        aria-label="历史日推日期"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled || dates.length === 0 || !onChange}
        ref={triggerRef}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActiveIndex(getNextIndex(event.key, selectedIndex, dates.length));
            setOpen(true);
          }
        }}
      >
        <span>{formatDate(value)}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {presence.isMounted ? (
        <div
          className="history-date-select-list glass-surface"
          id={listboxId}
          role="listbox"
          aria-label="历史日推日期选项"
          aria-hidden={presence.state === 'closed'}
          data-state={presence.state}
          onKeyDown={handleListKeyDown}
        >
          {dates.map((date, index) => (
            <button
              className={date === value
                ? 'history-date-select-option history-date-select-option-active'
                : 'history-date-select-option'}
              type="button"
              role="option"
              aria-selected={date === value}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => selectDate(date)}
              onPointerMove={() => setActiveIndex(index)}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              key={date}
            >
              <span>{formatDate(date)}</span>
              {date === value ? <Check aria-hidden="true" size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getNextIndex(key: string, index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowDown') return (index + 1) % itemCount;
  if (key === 'ArrowUp') return (index - 1 + itemCount) % itemCount;
  return index;
}
