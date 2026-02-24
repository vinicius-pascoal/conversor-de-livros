'use client'

import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

type ConversionMode = 'fast' | 'full'
type OutputFormat = 'epub' | 'pdf'
type ConversionPhase = 'idle' | 'uploading' | 'extracting' | 'processing' | 'translating' | 'generating' | 'complete'

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('epub')
  const [conversionMode, setConversionMode] = useState<ConversionMode>('fast')
  const [translateToPt, setTranslateToPt] = useState(false)
  const [extractImages, setExtractImages] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionPhase, setConversionPhase] = useState<ConversionPhase>('idle')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploadPercent, setUploadPercent] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll do log para o final
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [progressLog])

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const phaseLabels: Record<ConversionPhase, string> = {
    idle: 'Pronto',
    uploading: 'Enviando arquivo...',
    extracting: 'Extraindo texto...',
    processing: 'Processando conteúdo...',
    translating: 'Traduzindo para pt-BR...',
    generating: outputFormat === 'pdf' ? 'Gerando PDF...' : 'Gerando EPUB...',
    complete: 'Concluído!'
  }

  const handleFileSelect = (file: File) => {
    if (file.type === 'application/pdf') {
      setSelectedFile(file)
      setMessage(null)
    } else {
      setMessage({ type: 'error', text: 'Por favor, selecione um arquivo PDF válido.' })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleConvert = async () => {
    if (!selectedFile) return

    setIsConverting(true)
    setMessage(null)
    setConversionPhase('uploading')
    setProgressLog([])
    setUploadPercent(0)

    const formData = new FormData()
    formData.append('pdf', selectedFile)
    if (coverFile) formData.append('cover', coverFile)

    try {
      const jobId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as any).randomUUID()
          : String(Date.now())

      const es = new EventSource(`${apiUrl}/api/progress/${jobId}`)
      es.onerror = () => { }
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'phase') setConversionPhase(data.phase as ConversionPhase)
          else if (data.type === 'log') setProgressLog((prev) => [...prev, data.message])
          else if (data.type === 'done') es.close()
        } catch (_) { }
      }

      const isPdfMode = outputFormat === 'pdf'
      const shouldTranslate = isPdfMode ? true : translateToPt

      const url =
        `${apiUrl}/api/convert` +
        `?mode=${conversionMode}` +
        `&jobId=${jobId}` +
        `&translate=${shouldTranslate}` +
        `&extractImages=${extractImages}` +
        `&outputFormat=${outputFormat}`

      const response = await axios.post(url, formData, {
        responseType: 'blob',
        onUploadProgress: (e) => {
          if (e.total) setUploadPercent(Math.round((e.loaded / e.total) * 100))
        }
      })

      es.close()

      const baseName = selectedFile.name.replace('.pdf', '')
      const downloadName = isPdfMode ? `${baseName}_pt-br.pdf` : `${baseName}.epub`

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', downloadName)
      document.body.appendChild(link)
      link.click()
      link.remove()

      setConversionPhase('complete')
      setMessage({
        type: 'success',
        text: isPdfMode
          ? 'PDF traduzido gerado! O download começará automaticamente.'
          : 'EPUB gerado! O download começará automaticamente.'
      })
      setProgressLog((prev) => [...prev, 'Concluído com sucesso'])

      setTimeout(() => {
        setSelectedFile(null)
        setCoverFile(null)
        setConversionPhase('idle')
        setIsConverting(false)
      }, 2000)
    } catch (error) {
      console.error('Erro na conversão:', error)
      setConversionPhase('idle')
      setIsConverting(false)
      setMessage({ type: 'error', text: 'Erro ao converter o arquivo. Por favor, tente novamente.' })
      setProgressLog((prev) => [...prev, 'Erro na conversão'])
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const handleOutputFormat = (fmt: OutputFormat) => {
    setOutputFormat(fmt)
    if (fmt === 'pdf') setTranslateToPt(true)
  }

  const progressBarWidth =
    conversionPhase === 'uploading'
      ? `${Math.min(20, Math.max(0, uploadPercent / 5))}%`
      : conversionPhase === 'extracting'
        ? '35%'
        : conversionPhase === 'processing'
          ? '55%'
          : conversionPhase === 'translating'
            ? '75%'
            : conversionPhase === 'generating'
              ? '90%'
              : '100%'

  const convertBtnLabel = isConverting
    ? 'Processando...'
    : outputFormat === 'pdf'
      ? ' Gerar PDF Traduzido'
      : ' Converter para EPUB'

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

  const currentPhaseIndex = phaseSteps.indexOf(conversionPhase as any)
  const progressPercent = conversionPhase === 'complete' ? 100 :
    conversionPhase === 'idle' ? 0 :
      Math.round(((currentPhaseIndex + 1) / phaseSteps.length) * 100)

  return (
    <div className="page-wrapper">
      <h1 className="main-title">Conversor PDF</h1>

      {/* Progresso */}
      {isConverting && (
        <div className="card progress-card">
          <div className="progress-header">
            <h2 className="card-title">📊 Progresso da Conversão</h2>
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
              <div className="progress-text">{phaseLabels[conversionPhase]}</div>
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
      )}

      {message && (
        <div className={`card message-card ${message.type === 'success' ? 'success-message' : 'error-message'}`}>
          {message.text}
        </div>
      )}

      {/*  Upload Hero  */}
      <div className="card upload-hero-card">
        <div className="upload-hero-inner">
          <div
            className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {selectedFile ? (
              <div className="upload-file-info">
                <span className="upload-file-icon"></span>
                <div className="upload-file-details">
                  <strong>{selectedFile.name}</strong>
                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    setMessage(null)
                  }}
                >

                </button>
              </div>
            ) : (
              <>
                <div className="upload-dropzone-icon">
                  <img src="/book-bookmark-svgrepo-com.svg" alt="Livro" />
                </div>
                <div className="upload-dropzone-label">Arraste o PDF aqui</div>
                <div className="upload-dropzone-sub">ou clique para selecionar</div>
                <button
                  type="button"
                  className="upload-select-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  Escolher arquivo PDF
                </button>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="file-input" />
        </div>
      </div>

      {/*  Formato + Opções  */}
      <div className="options-grid">
        {/* Formato de saída */}
        <div className="card format-card">
          <div className="title-box">
            <img src="/settings-svgrepo-com.svg" alt="Formato" className="icon-title" />
            <h2 className="card-title">Formato de Saída</h2>
          </div>

          <div className="format-toggle">
            <button
              className={`format-btn ${outputFormat === 'epub' ? 'active' : ''}`}
              onClick={() => handleOutputFormat('epub')}
              disabled={isConverting}
            >
              <span className="format-btn-icon"></span>
              <span className="format-btn-label">EPUB</span>
              <span className="format-btn-desc">Livro digital</span>
            </button>
            <button
              className={`format-btn format-btn-pdf ${outputFormat === 'pdf' ? 'active active-pdf' : ''}`}
              onClick={() => handleOutputFormat('pdf')}
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
            <>
              <div className="mode-selector">
                <label>Modo de conversão:</label>
                <div className="mode-options">
                  <button
                    className={`mode-btn ${conversionMode === 'fast' ? 'active' : ''}`}
                    onClick={() => setConversionMode('fast')}
                    disabled={isConverting}
                  >
                    <div className="mode-btn-header">⚡ Rápido</div>
                    <div className="mode-btn-desc">Um único capítulo, processamento mais rápido</div>
                  </button>
                  <button
                    className={`mode-btn ${conversionMode === 'full' ? 'active' : ''}`}
                    onClick={() => setConversionMode('full')}
                    disabled={isConverting}
                  >
                    <div className="mode-btn-header">📖 Completo</div>
                    <div className="mode-btn-desc">Múltiplos capítulos com índice navegável</div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Opções adicionais */}
        <div className="card extra-card">
          <div className="title-box">
            <img src="/album-svgrepo-com.svg" alt="Opções" className="icon-title" />
            <h2 className="card-title">Opções</h2>
          </div>

          {outputFormat === 'epub' && (
            <>
              <div className="toggle-option">
                <label className="checkbox-label">
                  <input type="checkbox" checked={translateToPt} onChange={(e) => setTranslateToPt(e.target.checked)} disabled={isConverting} />
                  <span> Traduzir para pt-BR</span>
                </label>
                <p className="translate-hint">Detecta e traduz automaticamente o texto</p>
              </div>
              <div className="toggle-option">
                <label className="checkbox-label">
                  <input type="checkbox" checked={extractImages} onChange={(e) => setExtractImages(e.target.checked)} disabled={isConverting} />
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

          <div className="secondary-title-box">
            <img src="/album-svgrepo-com.svg" alt="Capa" className="icon-title" />
            <h2 className="card-title">
              Capa <span className="optional-tag">(opcional)</span>
            </h2>
          </div>

          <div className="cover-section">
            <p className="cover-hint">JPG ou PNG</p>
            <button
              type="button"
              className="secondary-btn full-width"
              onClick={() => coverInputRef.current?.click()}
              disabled={isConverting}
            >
              {coverFile ? ' Alterar capa' : ' Escolher capa'}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && file.type.startsWith('image/')) {
                  setCoverFile(file)
                  setMessage(null)
                } else if (file) {
                  setMessage({ type: 'error', text: 'Capa precisa ser imagem (JPG ou PNG).' })
                }
              }}
              className="file-input"
            />
            {coverFile && (
              <div className="selected-cover">
                <div className="file-info">
                  <div className="file-icon"></div>
                  <div className="file-details">
                    <h3>{coverFile.name}</h3>
                    <p>{formatFileSize(coverFile.size)}</p>
                  </div>
                </div>
                <button className="remove-btn" onClick={() => setCoverFile(null)}></button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*  Botão de conversão  */}
      <div className="convert-action">
        <button
          className={`convert-btn-main ${outputFormat === 'pdf' ? 'convert-btn-pdf' : ''}`}
          onClick={handleConvert}
          disabled={!selectedFile || isConverting}
        >
          {convertBtnLabel}
        </button>
        {!selectedFile && !isConverting && (
          <p className="convert-hint">Selecione um arquivo PDF para começar</p>
        )}
      </div>
    </div>
  )
}
