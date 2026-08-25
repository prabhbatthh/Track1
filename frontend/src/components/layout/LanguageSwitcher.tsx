import { ChevronDown, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClickOutside } from '@/hooks';
import { LANGUAGES } from '@/i18n/languages';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/providers/languageContext';

export interface LanguageSwitcherProps {
  className?: string;
}

// Custom dropdown instead of native <select>: a sticky header has no room above it, and the browser's own popup was opening upward off-screen.
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { language, setLanguage, isTranslating } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));

  const current = LANGUAGES.find((option) => option.code === language);

  return (
    <div ref={rootRef} className={cn('relative inline-flex items-center gap-1.5 text-xs', className)}>
      {isTranslating && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isTranslating}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('language.label')}
        aria-busy={isTranslating}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent text-inherit outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {current?.nativeName ?? language}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('language.label')}
          className="absolute right-0 top-full z-20 mt-1.5 max-h-72 w-40 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-border bg-surface py-1.5 text-left shadow-panel"
        >
          {LANGUAGES.map((option) => (
            <button
              key={option.code}
              type="button"
              role="option"
              aria-selected={option.code === language}
              onClick={() => {
                setLanguage(option.code);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm',
                option.code === language
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-foreground hover:bg-secondary/60',
              )}
            >
              {option.nativeName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
