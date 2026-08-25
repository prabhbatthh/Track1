import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WriteReviewModal } from './WriteReviewModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === 'string' ? options : (options?.defaultValue ?? key),
  }),
}));

const INITIAL_REVIEW = {
  bookId: 'book-1',
  bookTitle: 'The Test Book',
  bookAuthor: 'Test Author',
  rating: 4,
  comment: 'A useful review',
  images: [],
};

describe('WriteReviewModal', () => {
  it('locks submission while an async update is pending', () => {
    let finish!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <WriteReviewModal
        open
        onClose={() => undefined}
        onSubmit={onSubmit}
        initialValues={INITIAL_REVIEW}
      />,
    );

    const submit = screen.getByRole('button', { name: 'reviews.writeReviewModal.saveChanges' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finish();
  });

  it('rejects an oversized image before reading it', () => {
    render(
      <WriteReviewModal
        open
        onClose={() => undefined}
        onSubmit={() => undefined}
        initialValues={INITIAL_REVIEW}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('Expected image input');
    const oversized = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 });

    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Each image must be 5 MB or smaller.');
  });
});
