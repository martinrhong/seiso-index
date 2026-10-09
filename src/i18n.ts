import en from './locales/en'
import ja from './locales/ja'

export const LANGUAGE_STORAGE_KEY = 'seisoIndexLanguage'

export const LANGUAGE_OPTIONS = [
  {
    code: 'en',
    label: 'EN',
    htmlLang: 'en',
    displayLocale: 'en-AU',
    browserPrefixes: ['en'],
  },
  {
    code: 'ja',
    label: '日本語',
    htmlLang: 'ja',
    displayLocale: 'ja-JP',
    browserPrefixes: ['ja'],
  },
] as const

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code']

const translations = {
  en,
  ja,
}

export function isLanguageCode(value: string | null): value is LanguageCode {
  return LANGUAGE_OPTIONS.some((option) => option.code === value)
}

export function getInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en'

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isLanguageCode(saved)) return saved

  const browserLanguages = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language]

  for (const browserLanguage of browserLanguages) {
    const normalized = browserLanguage.toLowerCase()
    const match = LANGUAGE_OPTIONS.find((option) =>
      option.browserPrefixes.some((prefix) => normalized.startsWith(prefix)),
    )
    if (match) return match.code
  }

  return 'en'
}

export function applyLanguage(language: LanguageCode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }

  if (typeof document !== 'undefined') {
    const option = LANGUAGE_OPTIONS.find((candidate) => candidate.code === language)
    document.documentElement.lang = option?.htmlLang ?? 'en'
  }
}

export function getTranslations(language: LanguageCode) {
  return translations[language]
}

export function getDisplayLocale(language: LanguageCode) {
  return LANGUAGE_OPTIONS.find((option) => option.code === language)?.displayLocale ?? 'en-AU'
}
