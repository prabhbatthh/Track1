import { createContext, useContext } from 'react';

export interface LanguageContextValue {
  language: string;
  setLanguage: (code: string) => void;
  /** True while a language without a static locale file is being auto-translated for the first time. */
  isTranslating: boolean;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
