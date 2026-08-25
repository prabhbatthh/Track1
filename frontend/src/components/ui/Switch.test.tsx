import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './Switch';

describe('Switch', () => {
  it('has an accessible name and reports the requested checked state', () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} label="Email notifications" onCheckedChange={onCheckedChange} />);

    const control = screen.getByRole('switch', { name: 'Email notifications' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('lets the visible label toggle the switch and respects disabled state', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch checked label="Dark mode" onCheckedChange={onCheckedChange} />,
    );

    fireEvent.click(screen.getByText('Dark mode'));
    expect(onCheckedChange).toHaveBeenCalledWith(false);

    rerender(<Switch checked disabled label="Dark mode" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByText('Dark mode'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeDisabled();
  });
});
