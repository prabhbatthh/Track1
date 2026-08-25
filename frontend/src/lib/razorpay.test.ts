import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadRazorpayCheckout', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    delete window.Razorpay;
  });

  it('allows a retry after the checkout script fails to load', async () => {
    const { loadRazorpayCheckout } = await import('./razorpay');

    const first = loadRazorpayCheckout();
    const firstScript = document.querySelector('script');
    firstScript?.dispatchEvent(new Event('error'));
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll('script')).toHaveLength(0);

    const second = loadRazorpayCheckout();
    const secondScript = document.querySelector('script');
    expect(secondScript).not.toBe(firstScript);
    secondScript?.dispatchEvent(new Event('load'));
    await expect(second).resolves.toBe(true);
  });
});
