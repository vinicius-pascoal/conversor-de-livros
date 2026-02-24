import type { OutputFormat } from '../types'

interface ConvertButtonProps {
  selectedFile: File | null
  isConverting: boolean
  outputFormat: OutputFormat
  onConvert: () => void
}

export default function ConvertButton({
  selectedFile,
  isConverting,
  outputFormat,
  onConvert
}: ConvertButtonProps) {
  const convertBtnLabel = isConverting
    ? 'Processando...'
    : outputFormat === 'pdf'
      ? ' Gerar PDF Traduzido'
      : ' Converter para EPUB'

  return (
    <div className="convert-action">
      <button
        className={`convert-btn-main ${outputFormat === 'pdf' ? 'convert-btn-pdf' : ''}`}
        onClick={onConvert}
        disabled={!selectedFile || isConverting}
      >
        {convertBtnLabel}
      </button>
      {!selectedFile && !isConverting && (
        <p className="convert-hint">Selecione um arquivo PDF para começar</p>
      )}
    </div>
  )
}
