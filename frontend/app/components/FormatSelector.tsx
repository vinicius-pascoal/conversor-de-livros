import type { OutputFormat, ConversionMode } from '../types'

interface FormatSelectorProps {
  outputFormat: OutputFormat
  conversionMode: ConversionMode
  isConverting: boolean
  onFormatChange: (format: OutputFormat) => void
  onModeChange: (mode: ConversionMode) => void
}

export default function FormatSelector({
  outputFormat,
  conversionMode,
  isConverting,
  onFormatChange,
  onModeChange
}: FormatSelectorProps) {
  return (
    <div className="card format-card">
      <div className="title-box">
        <img src="/settings-svgrepo-com.svg" alt="Formato" className="icon-title" />
        <h2 className="card-title">Formato de Saída</h2>
      </div>

      <div className="format-toggle">
        <button
          className={`format-btn ${outputFormat === 'epub' ? 'active' : ''}`}
          onClick={() => onFormatChange('epub')}
          disabled={isConverting}
        >
          <span className="format-btn-icon"></span>
          <span className="format-btn-label">EPUB</span>
          <span className="format-btn-desc">Livro digital</span>
        </button>
        <button
          className={`format-btn format-btn-pdf ${outputFormat === 'pdf' ? 'active active-pdf' : ''}`}
          onClick={() => onFormatChange('pdf')}
          disabled={isConverting}
        >
          <span className="format-btn-icon"></span>
          <span className="format-btn-label">PDF Traduzido</span>
          <span className="format-btn-desc">Traduz para pt-BR</span>
        </button>
      </div>

      {outputFormat === 'pdf' && (
        <div className="format-info-box">
          <p>O texto será extraído, <strong>traduzido automaticamente para pt-BR</strong> e um novo PDF formatado será gerado.</p>
        </div>
      )}

      {outputFormat === 'epub' && (
        <div className="mode-selector">
          <label>Modo de conversão:</label>
          <div className="mode-options">
            <button
              className={`mode-btn ${conversionMode === 'fast' ? 'active' : ''}`}
              onClick={() => onModeChange('fast')}
              disabled={isConverting}
            >
              <div className="mode-btn-header">⚡ Rápido</div>
              <div className="mode-btn-desc">Um único capítulo, processamento mais rápido</div>
            </button>
            <button
              className={`mode-btn ${conversionMode === 'full' ? 'active' : ''}`}
              onClick={() => onModeChange('full')}
              disabled={isConverting}
            >
              <div className="mode-btn-header">📖 Completo</div>
              <div className="mode-btn-desc">Múltiplos capítulos com índice navegável</div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
