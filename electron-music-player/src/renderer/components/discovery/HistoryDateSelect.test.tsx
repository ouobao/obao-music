import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDateSelect } from './HistoryDateSelect';

const dates = ['2026-07-18', '2026-07-17', '2026-07-16'];

describe('HistoryDateSelect', () => {
  it('supports directional, Home/End and Enter selection without a native select', () => {
    const onChange = vi.fn();
    render(
      <HistoryDateSelect
        dates={dates}
        value={dates[1]}
        onChange={onChange}
        formatDate={(date) => date}
      />
    );
    const trigger = screen.getByRole('combobox', { name: '历史日推日期' });

    expect(trigger.tagName).toBe('BUTTON');
    fireEvent.keyDown(trigger, { key: 'End' });
    const lastOption = screen.getByRole('option', { name: dates[2] });
    expect(lastOption).toHaveFocus();
    fireEvent.keyDown(lastOption, { key: 'Home' });
    const firstOption = screen.getByRole('option', { name: dates[0] });
    expect(firstOption).toHaveFocus();
    fireEvent.keyDown(firstOption, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: dates[1] })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('option', { name: dates[1] }), { key: 'ArrowDown' });
    expect(lastOption).toHaveFocus();
    fireEvent.keyDown(lastOption, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(dates[2]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape, Tab and outside pointer interaction', () => {
    render(
      <HistoryDateSelect
        dates={dates}
        value={dates[0]}
        onChange={() => undefined}
        formatDate={(date) => date}
      />
    );
    const trigger = screen.getByRole('combobox', { name: '历史日推日期' });

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('option', { name: dates[0] }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('option', { name: dates[0] }), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
