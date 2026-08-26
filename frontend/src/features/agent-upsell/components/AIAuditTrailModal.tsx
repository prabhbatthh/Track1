import { useState, useEffect } from 'react';
import { Bot, CheckCircle2, Clock, ShieldCheck, X, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchAIAuditTrail } from '../api';
import type { AIAuditRecord } from '../types';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency } from '@/lib/format';

export interface AIAuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAuditTrailModal({ isOpen, onClose }: AIAuditTrailModalProps) {
  let token: string | undefined;
  try {
    const auth = useAuth();
    token = auth?.token ?? undefined;
  } catch {
    token = undefined;
  }
  const [records, setRecords] = useState<AIAuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setError(null);
    fetchAIAuditTrail(token ?? undefined)
      .then((res) => {
        setRecords(res.records);
      })
      .catch((err) => {
        console.error('Failed to load audit trail:', err);
        setError('Could not retrieve audit trail records.');
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, token]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-purple-200 bg-white shadow-2xl dark:border-purple-900/60 dark:bg-zinc-950 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 p-5 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-950 text-white">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-amber-300">
              <Bot className="size-5" />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-lg font-bold font-serif text-white">
                AI Growth Decision Audit Trail
              </h2>
              <p className="text-xs text-purple-200/90 font-mono">
                Server-Verified Explainable AI Logs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-purple-200/80 bg-purple-50/70 p-3.5 text-xs text-purple-950 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
            <ShieldCheck className="size-4 text-purple-700 dark:text-purple-300 shrink-0" />
            <span>
              <strong>Money-Action Safety Gate:</strong> Every AI recommendation is transparently logged. The AI never charges your account automatically — payment requires your explicit authorization.
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Bot className="size-8 animate-bounce text-purple-600 mb-2" />
              <p className="text-xs font-mono">Fetching server-signed audit logs...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-danger/10 text-danger text-xs text-center">
              {error}
            </div>
          ) : records.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              <FileText className="size-8 mx-auto mb-2 opacity-40" />
              <p>No AI evaluation history found for this account.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((rec) => (
                <div
                  key={rec.audit_id}
                  data-testid="audit-log-item"
                  className="rounded-2xl border border-purple-200/80 bg-white p-4 shadow-sm transition-all dark:border-purple-900/40 dark:bg-zinc-900"
                >
                  {/* Top Meta Bar */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2.5 mb-3 text-xs">
                    <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(rec.timestamp).toLocaleString()}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        rec.payment_status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : rec.payment_status === 'initiated'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : rec.accepted
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      <CheckCircle2 className="size-3" />
                      STATUS: {rec.payment_status.toUpperCase()}
                    </span>
                  </div>

                  {/* Rationale & Signals */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      "{rec.explanation}"
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="rounded-xl bg-muted/40 p-2 text-center">
                        <span className="block text-[10px] text-muted-foreground">Book Loans</span>
                        <span className="text-xs font-bold text-foreground">
                          {rec.usage_signals?.total_loans ?? 0}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-2 text-center">
                        <span className="block text-[10px] text-muted-foreground">Library Visits</span>
                        <span className="text-xs font-bold text-foreground">
                          {rec.usage_signals?.total_visits ?? 0}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-2 text-center">
                        <span className="block text-[10px] text-muted-foreground">Reason Code</span>
                        <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">
                          {rec.reason_code}
                        </span>
                      </div>
                      <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 p-2 text-center">
                        <span className="block text-[10px] text-purple-700 dark:text-purple-300">Est. Savings</span>
                        <span className="text-xs font-bold text-purple-950 dark:text-purple-100">
                          {rec.savings_percent ?? 25}% OFF
                        </span>
                      </div>
                    </div>

                    {/* Audit Pipeline States */}
                    <div className="mt-3 flex items-center justify-between text-[11px] pt-2 border-t border-border/40 font-mono">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ AI Evaluated
                      </span>
                      <span className={rec.accepted ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
                        {rec.accepted ? '✓ User Approved' : '⏳ User Approval Pending'}
                      </span>
                      <span className={rec.payment_initiated ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
                        {rec.payment_initiated ? '✓ Payment Initiated' : '🔒 Payment Not Started'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border/80 p-4 bg-muted/20">
          <Button variant="secondary" size="sm" onClick={onClose} className="rounded-xl px-5 text-xs font-semibold">
            Close Audit Trail
          </Button>
        </div>
      </div>
    </div>
  );
}
