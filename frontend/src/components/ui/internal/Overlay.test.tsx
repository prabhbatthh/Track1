import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Overlay } from './Overlay';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>trigger</button>
      <Overlay open={open} onClose={() => setOpen(false)}>
        <button>first</button>
        <button>last</button>
      </Overlay>
    </div>
  );
}

describe('Overlay', () => {
  it('moves focus into the panel on open and traps Tab within it', () => {
    render(<Harness />);

    screen.getByText('trigger').focus();
    fireEvent.click(screen.getByText('trigger'));

    const first = screen.getByText('first');
    const last = screen.getByText('last');
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('returns focus to the trigger on close', () => {
    render(<Harness />);

    const trigger = screen.getByText('trigger');
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByText('first')).toHaveFocus();

    fireEvent.keyDown(screen.getByText('first'), { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });
});
