import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useTranslateText } from '@/features/translate/hooks/useTranslateText';

const DEMO_LANGUAGES = [
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'bn', label: 'Bengali (বাংলা)' },
  { value: 'ta', label: 'Tamil (தமிழ்)' },
  { value: 'te', label: 'Telugu (తెలుగు)' },
  { value: 'mr', label: 'Marathi (मराठी)' },
  { value: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { value: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { value: 'ml', label: 'Malayalam (മലയാളം)' },
  { value: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { value: 'ur', label: 'Urdu (اردو)' },
  { value: 'or', label: 'Odia (ଓଡ଼ିଆ)' },
  { value: 'as', label: 'Assamese (অসমীয়া)' },
];

const DEFAULT_TEXT = 'Welcome to the library. This book is currently available to borrow.';

export function TranslateDemoPage() {
  const { t } = useTranslation();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [targetLang, setTargetLang] = useState('hi');
  const { translated, loading, error, retry } = useTranslateText(text, targetLang);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <Card className="rounded-3xl border-border bg-surface shadow-panel">
        <CardHeader>
          <h1 className="text-lg font-semibold text-foreground">{t('translateDemo.title')}</h1>
          <CardDescription>{t('translateDemo.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Textarea
            id="demo-source-text"
            label={t('translateDemo.sourceLabel')}
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <Select
            label={t('translateDemo.targetLabel')}
            options={DEMO_LANGUAGES}
            value={targetLang}
            onChange={(event) => setTargetLang(event.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t('translateDemo.outputLabel')}{' '}
              {loading && (
                <span className="text-muted-foreground">{t('translateDemo.loading')}</span>
              )}
            </span>
            <p className="min-h-[3.5rem] rounded-md border border-border-muted bg-secondary/10 px-3 py-2 text-sm text-foreground">
              {translated}
            </p>
            {Boolean(error) && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-danger"
              >
                <span>{getErrorMessage(error, t('translateDemo.error'))}</span>
                <Button type="button" size="sm" variant="outline" onClick={retry}>
                  {t('feedback.error.retry')}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
