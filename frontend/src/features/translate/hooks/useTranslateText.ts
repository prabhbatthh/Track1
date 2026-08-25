import { useEffect, useState } from 'react';

import { apiPost } from '@/lib/api';

interface TranslateResponse {
  translated: string;
}

const DEBOUNCE_MS = 400;

/** Translates dynamic text (e.g. user-generated content) via the backend's free translate proxy. */
export function useTranslateText(text: string, targetLang: string) {
  const [translation, setTranslation] = useState<{
    text: string;
    targetLang: string;
    translated: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{
    text: string;
    targetLang: string;
    error: unknown;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const skip = !text.trim() || targetLang === 'en';

  useEffect(() => {
    if (skip) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setFailure(null);
      apiPost<TranslateResponse>('/translate', { text, target_lang: targetLang })
        .then((data) => {
          if (!cancelled) setTranslation({ text, targetLang, translated: data.translated });
        })
        .catch((requestError) => {
          if (!cancelled) {
            setTranslation(null);
            setFailure({ text, targetLang, error: requestError });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, targetLang, skip, retryKey]);

  const translated =
    !skip && translation?.text === text && translation.targetLang === targetLang
      ? translation.translated
      : text;
  const error =
    !skip && failure?.text === text && failure.targetLang === targetLang ? failure.error : null;

  return {
    translated,
    loading: !skip && loading,
    error: skip ? null : error,
    retry: () => setRetryKey((key) => key + 1),
  };
}
