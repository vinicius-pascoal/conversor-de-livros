import { SUPPORTED_LANGUAGES, DEFAULT_TARGET_LANGUAGE, type LanguageCode } from '../constants/languages'

interface LanguageSelectorProps {
  selectedLang: string
  onLanguageChange: (lang: string) => void
  disabled?: boolean
}

export default function LanguageSelector({
  selectedLang,
  onLanguageChange,
  disabled = false
}: LanguageSelectorProps) {
  return (
    <div className="language-selector">
      <label className="language-label">Idioma de destino:</label>
      <select
        className="language-select"
        value={selectedLang}
        onChange={(e) => onLanguageChange(e.target.value)}
        disabled={disabled}
      >
        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
