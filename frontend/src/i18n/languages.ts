export interface LanguageOption {
  code: string;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
  /** true for languages with a hand-maintained locale file bundled at build time. */
  static?: boolean;
}

// en/hi/pa ship as reviewed static locale files (see i18n/locales). Every other
// language here is machine-translated on first use via ensureLanguageLoaded and
// then cached — see i18n/autoTranslate.ts.
export const LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', static: true },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', static: true },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', dir: 'ltr', static: true },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', dir: 'ltr' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', dir: 'ltr' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', dir: 'ltr' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl' },
  { code: 'or', nativeName: 'ଓଡ଼ିଆ', englishName: 'Odia', dir: 'ltr' },
  { code: 'as', nativeName: 'অসমীয়া', englishName: 'Assamese', dir: 'ltr' },
];

export const DEFAULT_LANGUAGE = 'en';
