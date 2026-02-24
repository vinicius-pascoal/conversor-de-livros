import type { ConversionPhase, OutputFormat } from '../types'

interface ProgressViewerProps {
  isConverting: boolean
  conversionPhase: ConversionPhase
  outputFormat: OutputFormat
  progressLog: string[]
  logEndRef: React.RefObject<HTMLDivElement>
}

const phaseLabels: Record<ConversionPhase, string> = {
  idle: 'Pronto',
  uploading: 'Enviando arquivo...',
  extracting: 'Extraindo texto...',
  processing: 'Processando conteúdo...',
  translating: 'Traduzindo para pt-BR...',
  generating: 'Gerando arquivo...',
  complete: 'Concluído!'
}

const phaseSteps: ConversionPhase[] = ['uploading', 'extracting', 'processing', 'translating', 'generating']

const phaseIcons: Record<string, string> = {
  uploading: '📤',
  extracting: '🔍',
  processing: '⚙️',
  translating: '🌐',
  generating: '📦'
}

const phaseNames: Record<string, string> = {
  uploading: 'Upload',
  extracting: 'Extração',
  processing: 'Processando',
  translating: 'Tradução',
  generating: 'Gerando'
}

const getLogIcon = (logMessage: string): string => {
  const msg = logMessage.toLowerCase()
  if (msg.includes('arquivo recebido') || msg.includes('enviando')) return '📥'
  if (msg.includes('detectando idioma') || msg.includes('idioma')) return '🔍'
  if (msg.includes('traduzindo') || msg.includes('tradução')) return '🌐'
  if (msg.includes('analisando') || msg.includes('estrutura')) return '📊'
  if (msg.includes('capítulo') || msg.includes('seção')) return '📑'
  if (msg.includes('imagem')) return '🖼️'
  if (msg.includes('gerando') || msg.includes('montando')) return '⚡'
  if (msg.includes('concluí') || msg.includes('sucesso')) return '✅'
  if (msg.includes('erro') || msg.includes('falha')) return '❌'
  if (msg.includes('pdf')) return '📄'
  if (msg.includes('epub')) return '📘'
  return '💬'
}

export default function ProgressViewer({
  isConverting,
  conversionPhase,
  outputFormat,
  progressLog,
  logEndRef
}: ProgressViewerProps) {
  if (!isConverting) return null

  const currentPhaseIndex = phaseSteps.indexOf(conversionPhase as any)
  const progressPercent = conversionPhase === 'complete' ? 100 :
    conversionPhase === 'idle' ? 0 :
      Math.round(((currentPhaseIndex + 1) / phaseSteps.length) * 100)

  const currentPhaseLabel = phaseLabels[conversionPhase]

  return (
    <div className="progress-modal-overlay">
      <div className="progress-modal-container">
        <div className="progress-modal-header">
          <h2 className="progress-modal-title">📊 Progresso da Conversão</h2>
          <div className="progress-percentage">{progressPercent}%</div>
        </div>

        <div className="conversion-progress">
          <div className="progress-phases">
            {phaseSteps.map((phase, idx) => {
              const currentIdx = phaseSteps.indexOf(conversionPhase as any)
              const isActive = currentIdx >= idx || conversionPhase === 'complete'
              const isCurrent = currentIdx === idx
              return (
                <div key={phase} className={`phase ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}>
                  <div className="phase-icon">{phaseIcons[phase]}</div>
                  <div className="phase-label">{phaseNames[phase]}</div>
                </div>
              )
            })}
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}>
              <div className="progress-bar-shine"></div>
            </div>
          </div>
          <div className="progress-info">
            <div className="progress-icon">{conversionPhase === 'complete' ? '🎉' : '⏳'}</div>
            <div className="progress-text">{currentPhaseLabel}</div>
          </div>
          {progressLog.length > 0 && (
          <div className="progress-logs-container">
            <div className="progress-logs-header">
              <span className="logs-title">📋 Log de Atividades</span>
              <span className="logs-count">{progressLog.length} mensagens</span>
            </div>
            <div className="progress-logs">
              {progressLog.map((l, idx) => (
                <div key={idx} className="progress-log-item">
                  <span className="log-icon">{getLogIcon(l)}</span>
                  <span className="log-text">{l}</span>
                  <span className="log-time">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
