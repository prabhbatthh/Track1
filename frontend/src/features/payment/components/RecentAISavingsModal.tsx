import { Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { Sparkles } from 'lucide-react';
import type { RecentCompletedSaving } from './AISavingsPanel';

export interface RecentAISavingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savings: RecentCompletedSaving[];
}

export function RecentAISavingsModal({ isOpen, onClose, savings }: RecentAISavingsModalProps) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-xl font-black font-serif text-purple-950 dark:text-purple-50">
          <Sparkles className="size-5 text-purple-600 dark:text-purple-400 shrink-0" />
          <span>Your Recent AI Savings</span>
        </div>
      }
      className="max-w-md rounded-3xl border border-purple-200/80 bg-white dark:border-purple-900/60 dark:bg-zinc-950"
    >
      <div className="p-6 text-left">
        <p className="text-xs font-semibold text-purple-900/80 dark:text-purple-300/80 -mt-2 mb-4">
          See the latest ways AI helped you save.
        </p>

        <div className="space-y-2.5" data-testid="recent-ai-savings-modal-list">
          {savings && savings.length > 0 ? (
            savings.slice(0, 3).map((item) => (
              <div
                key={item.id}
                data-testid="recent-savings-modal-item"
                className="flex items-center justify-between rounded-2xl bg-purple-50/70 p-3.5 border border-purple-200/60 dark:bg-purple-950/30 dark:border-purple-800/40 text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-extrabold text-sm text-purple-950 dark:text-purple-100">
                    {item.planName}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    AI helped you save
                  </span>
                </div>
                <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                  Saved {formatCurrency(item.savingsAmount)}
                </span>
              </div>
            ))
          ) : (
            <div
              data-testid="recent-savings-modal-empty"
              className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-5 text-center text-xs font-medium text-purple-900/70 dark:border-purple-800/50 dark:bg-purple-950/20 dark:text-purple-300/70"
            >
              AI will show your savings here after you complete a purchase.
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            data-testid="close-recent-savings-modal-btn"
            className="rounded-xl bg-purple-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800 dark:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
