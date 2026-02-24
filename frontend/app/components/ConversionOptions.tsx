import type { OutputFormat } from '../types'

interface ConversionOptionsProps {
  outputFormat: OutputFormat
  translateToPt: boolean
  extractImages: boolean
  isConverting: boolean
  onTranslateChange: (translate: boolean) => void
  onExtractImagesChange: (extract: boolean) => void
}

export default function ConversionOptions({
  outputFormat,
  translateToPt,
  extractImages,
  isConverting,
  onTranslateChange,
  onExtractImagesChange
}: ConversionOptionsProps) {
  return (
    <>
      {outputFormat === 'epub' && (
        <>
          <div className="toggle-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={translateToPt}
                onChange={(e) => onTranslateChange(e.target.checked)}
                disabled={isConverting}
              />
              <span> Traduzir para pt-BR</span>
            </label>
            <p className="translate-hint">Detecta e traduz automaticamente o texto</p>
          </div>
          <div className="toggle-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={extractImages}
                onChange={(e) => onExtractImagesChange(e.target.checked)}
                disabled={isConverting}
              />
              <span> Extrair imagens do PDF</span>
            </label>
            <p className="translate-hint">Desative para EPUBs mais leves e rápidos</p>
          </div>
        </>
      )}

      {outputFormat === 'pdf' && (
        <div className="toggle-option disabled-option">
          <label className="checkbox-label">
            <input type="checkbox" checked readOnly disabled />
            <span> Tradução automática ativada</span>
          </label>
          <p className="translate-hint">Sempre ativa no modo PDF Traduzido</p>
        </div>
      )}
    </>
  )
}
