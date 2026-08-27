export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error: { description: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loadPromise: Promise<boolean> | null = null;

class DemoRazorpayCheckout implements RazorpayInstance {
  private options: RazorpayCheckoutOptions;
  private failHandlers: Array<(res: { error: { description: string } }) => void> = [];

  constructor(options: RazorpayCheckoutOptions) {
    this.options = options;
  }

  on(event: 'payment.failed', handler: (response: { error: { description: string } }) => void): void {
    if (event === 'payment.failed') {
      this.failHandlers.push(handler);
    }
  }

  open(): void {
    if (typeof document === 'undefined') return;

    const backdrop = document.createElement('div');
    backdrop.id = 'demo-payment-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1e293b; color: #f8fafc; border: 1px solid #334155;
      border-radius: 12px; max-width: 440px; width: 100%; padding: 1.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); font-family: system-ui, sans-serif;
    `;

    const formattedAmount = (this.options.amount / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: this.options.currency || 'INR',
    });

    dialog.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
        <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #0284c7; color: white; padding: 0.2rem 0.6rem; border-radius: 9999px;">
          Demo Payment Mode
        </span>
        <span style="font-size: 0.75rem; color: #94a3b8;">Development Preview</span>
      </div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; font-weight: 600; color: #fff;">
        Simulated Checkout: ${formattedAmount}
      </h3>
      <p style="margin: 0 0 1rem 0; font-size: 0.875rem; color: #94a3b8;">
        ${this.options.description || 'Membership Payment'} — Test Mode (No real money charged).
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
        <button id="demo-pay-cancel-btn" type="button" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #475569; background: transparent; color: #cbd5e1; cursor: pointer; font-size: 0.875rem;">
          Cancel
        </button>
        <button id="demo-pay-approve-btn" type="button" style="padding: 0.5rem 1rem; border-radius: 6px; border: none; background: #0284c7; color: white; font-weight: 600; cursor: pointer; font-size: 0.875rem;">
          Approve Demo Payment
        </button>
      </div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const approveBtn = dialog.querySelector('#demo-pay-approve-btn');
    const cancelBtn = dialog.querySelector('#demo-pay-cancel-btn');

    approveBtn?.addEventListener('click', () => {
      if (document.body.contains(backdrop)) {
        document.body.removeChild(backdrop);
      }
      const demoPaymentId = 'pay_demo_' + Math.random().toString(36).substring(2, 12);
      this.options.handler({
        razorpay_order_id: this.options.order_id,
        razorpay_payment_id: demoPaymentId,
        razorpay_signature: 'demo_signature_valid',
      });
    });

    cancelBtn?.addEventListener('click', () => {
      if (document.body.contains(backdrop)) {
        document.body.removeChild(backdrop);
      }
      this.options.modal?.ondismiss?.();
    });
  }
}

export function isDemoOrder(options: { key?: string; order_id?: string }): boolean {
  return (
    options.key === 'rzp_demo_key' ||
    Boolean(options.order_id?.startsWith('order_demo_'))
  );
}

export function createRazorpayCheckout(options: RazorpayCheckoutOptions): RazorpayInstance {
  if (isDemoOrder(options)) {
    return new DemoRazorpayCheckout(options);
  }
  if (typeof window !== 'undefined' && window.Razorpay) {
    return new window.Razorpay(options);
  }
  return new DemoRazorpayCheckout(options);
}

// Loaded on demand (only once the member actually clicks "Pay") rather than on every
// Payment page visit — members using "pay at library" instead never need it.
export function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  
  // If window.Razorpay is already present, return true
  if (window.Razorpay) return Promise.resolve(true);

  // If no script loaded yet, ensure we fall back to DemoRazorpayCheckout if script fails or is omitted
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      script.remove();
      loadPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}
