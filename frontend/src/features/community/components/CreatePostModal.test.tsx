import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreatePostModal } from './CreatePostModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === 'string' ? options : (options?.defaultValue ?? key),
  }),
}));

describe('CreatePostModal', () => {
  it('locks submission while an async create is pending', async () => {
    let finish!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <CreatePostModal open onClose={() => undefined} onSubmit={onSubmit} />,
    );

    const textarea = document.querySelector('textarea');
    if (!textarea) throw new Error('Expected post textarea');
    fireEvent.change(textarea, { target: { value: 'A new post' } });
    const submit = screen.getByRole('button', { name: 'community.createPostModal.submit' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finish();
  });

  it('rejects a non-image attachment before reading it', () => {
    render(
      <CreatePostModal open onClose={() => undefined} onSubmit={() => undefined} />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('Expected image input');

    fireEvent.change(input, {
      target: { files: [new File(['plain text'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Only image files can be attached.');
  });
});
