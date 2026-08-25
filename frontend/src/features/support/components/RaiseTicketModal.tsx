import { Check, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, Modal, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  useAuth,
  type SupportTicketCategory,
  type SupportTicketRecord,
} from '@/providers/AuthProvider';

import { CATEGORY_ICONS } from '../constants';

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

export interface RaiseTicketModalProps {
  open: boolean;
  onClose: () => void;
  categories: SupportTicketCategory[];
  onCreated: (ticket: SupportTicketRecord) => void;
}

type Step = 1 | 2 | 3 | 4;

export function RaiseTicketModal({ open, onClose, categories, onCreated }: RaiseTicketModalProps) {
  const { t } = useTranslation();
  const { createSupportTicket } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<SupportTicketCategory | null>(null);
  const [description, setDescription] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setCategory(null);
      setDescription('');
      setAcknowledged(false);
      setError(null);
    }
  }

  const trimmedLength = description.trim().length;
  const descriptionValid = trimmedLength >= MIN_LENGTH && trimmedLength <= MAX_LENGTH;

  async function submit() {
    if (!category) return;
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createSupportTicket({ category, description: description.trim() });
      onCreated(ticket);
      setStep(4);
    } catch {
      setError(t('support.wizard.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('support.wizard.title')}>
      <div className="flex flex-col gap-4">
        {step === 1 && (
          <>
            <p className="text-sm font-medium text-foreground">{t('support.wizard.step1Title')}</p>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((value) => {
                const Icon = CATEGORY_ICONS[value];
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                      category === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-secondary',
                    )}
                  >
                    <Icon className={cn('size-5', category === value ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="text-sm font-medium text-foreground">
                      {t(`support.categories.${value}`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button disabled={!category} onClick={() => setStep(2)}>
              {t('support.wizard.next')}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm font-medium text-foreground">{t('support.wizard.step2Title')}</p>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              maxLength={MAX_LENGTH}
              placeholder={t('support.wizard.step2Placeholder')}
              autoFocus
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('support.wizard.step2Hint')}</span>
              <span className="tabular-nums">
                {description.length}/{MAX_LENGTH}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {t('support.wizard.back')}
              </Button>
              <Button disabled={!descriptionValid} onClick={() => setStep(3)}>
                {t('support.wizard.next')}
              </Button>
            </div>
          </>
        )}

        {step === 3 && category && (
          <>
            <p className="text-sm font-medium text-foreground">{t('support.wizard.step3Title')}</p>
            <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <p className="font-medium text-foreground">{t(`support.categories.${category}`)}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {description.trim()}
              </p>
            </div>
            <Checkbox
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              label={t('support.wizard.acknowledge')}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                {t('support.wizard.back')}
              </Button>
              <Button disabled={!acknowledged} isLoading={submitting} onClick={submit}>
                {t('support.wizard.submit')}
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
              <PartyPopper className="size-6" />
            </span>
            <p className="text-lg font-semibold text-foreground">{t('support.wizard.step4Title')}</p>
            <p className="text-sm text-muted-foreground">{t('support.wizard.step4Description')}</p>
            <Button leadingIcon={<Check className="size-4" />} onClick={onClose}>
              {t('support.wizard.done')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
