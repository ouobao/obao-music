import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderSegmentedControl } from './ProviderSegmentedControl';

describe('ProviderSegmentedControl', () => {
  it('renders both remote providers and only reports an actual source change', () => {
    const handleChange = vi.fn();
    render(
      <ProviderSegmentedControl
        value="qq"
        ariaLabel="排行榜来源"
        onChange={handleChange}
      />
    );

    const control = screen.getByRole('group', { name: '排行榜来源' });
    const qqButton = within(control).getByRole('button', { name: 'QQ 音乐' });
    const neteaseButton = within(control).getByRole('button', { name: '网易云音乐' });

    expect(qqButton).toHaveAttribute('aria-pressed', 'true');
    expect(neteaseButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(qqButton);
    fireEvent.click(neteaseButton);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('netease');
  });
});
