import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

import { Overlay } from './internal/Overlay';

export interface ModalProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  dismissible?: boolean;
  /** Escape and backdrop clicks no longer close the modal — see Overlay's `blocking`. */
  blocking?: boolean;
}

export function Modal({
  id,
  open,
  onClose,
  title,
  children,
  footer,
  className,
  dismissible = true,
  blocking = false,
}: ModalProps) {
  const titleId = useId();
  const { t } = useTranslation();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      panelClassName="m-auto"
      blocking={blocking}
    >
      <div
        id={id}
        className={cn(
          'flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col rounded-lg bg-surface shadow-panel',
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.actions.close')}
                className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}
