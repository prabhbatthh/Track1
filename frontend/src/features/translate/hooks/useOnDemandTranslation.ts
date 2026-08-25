import { useState } from 'react';

import { apiPost } from '@/lib/api';
import { useLanguage } from '@/providers/languageContext';

interface TranslateResponse {
  translated: string;
}

/**
 * Manual "Translate this" for member-written text (a community post, comment, or
 * review), as opposed to useTranslateText's automatic translation of the app's own UI
 * strings. The two can't share logic: useTranslateText skips whenever the app language
 * is English, since the UI's *source* text always is — but member-written content can
 * be in any language regardless of the viewer's own app language, so English is a
 * perfectly normal target here too.
 */
export function useOnDemandTranslation(originalText: string) {
  const { language } = useLanguage();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isShown = translated !== null;

  async function translate() {
    if (isShown) {
      setTranslated(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const data = await apiPost<TranslateResponse>('/translate', {
        text: originalText,
        target_lang: language,
      });
      setTranslated(data.translated);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return {
    text: isShown ? (translated ?? originalText) : originalText,
    isShown,
    loading,
    error,
    toggle: translate,
  };
}
