/**
 * Idiomas suportados para tradução
 * (Mesma lista do backend)
 */
export const SUPPORTED_LANGUAGES = {
  pt: 'Português (BR)',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  zh: '中文',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  ko: '한국어',
  nl: 'Nederlands',
  pl: 'Polski',
  sv: 'Svenska',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  cs: 'Čeština',
  da: 'Dansk',
  fi: 'Suomi',
  el: 'Ελληνικά',
  he: 'עברית',
  id: 'Bahasa Indonesia',
  no: 'Norsk',
  ro: 'Română',
  uk: 'Українська'
} as const

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES

export const DEFAULT_TARGET_LANGUAGE: LanguageCode = 'pt'
