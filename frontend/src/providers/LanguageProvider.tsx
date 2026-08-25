import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import i18n from '@/i18n/config';
import { ensureLanguageLoaded } from '@/i18n/autoTranslate';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/i18n/languages';
import { useLocalStorageState } from '@/lib/useLocalStorageState';

import { LanguageContext } from './languageContext';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useLocalStorageState<string>('language', DEFAULT_LANGUAGE);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsTranslating(true);
      let failed = false;
      ensureLanguageLoaded(language)
        .catch(() => {
          // i18next's fallbackLng keeps the UI readable in English rather than
          // breaking, but staying silent about it meant a user could pick a language,
          // watch a spinner, and be left on an English page with no explanation.
          failed = true;
        })
        .finally(() => {
          if (cancelled) return;
          void i18n.changeLanguage(language);
          const option = LANGUAGES.find((entry) => entry.code === language);
          document.documentElement.lang = language;
          // Only flip writing direction if the translation actually loaded — RTL
          // English is harder to read than LTR English.
          document.documentElement.dir = failed ? 'ltr' : (option?.dir ?? 'ltr');
          setIsTranslating(false);
          if (failed) {
            toast.error(
              i18n.t(
                'common.errors.translationUnavailable',
                'That language could not be loaded — showing English for now.',
              ),
            );
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, isTranslating }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
