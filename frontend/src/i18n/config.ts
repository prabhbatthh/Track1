import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

// hi/pa are ~140kB and ~130kB of JSON — loaded on demand (see autoTranslate.ts's
// ensureLanguageLoaded) instead of shipping every language in the main bundle for
// users who only ever see one of them.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
