/**
 * Idiomas suportados para tradução
 * Códigos ISO 639-1
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
}

/**
 * Idioma padrão para tradução
 */
export const DEFAULT_TARGET_LANGUAGE = 'pt'

/**
 * Obtém o nome do idioma pelo código
 * @param {string} code - Código do idioma (pt, en, es, etc)
 * @returns {string} Nome do idioma
 */
export function getLanguageName(code) {
  return SUPPORTED_LANGUAGES[code] || code.toUpperCase()
}

/**
 * Valida se um código de idioma é suportado
 * @param {string} code - Código do idioma
 * @returns {boolean}
 */
export function isLanguageSupported(code) {
  return code in SUPPORTED_LANGUAGES
}
