'use client'

import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

type ConversionMode = 'fast' | 'full'
type EpubType = 'fixed' | 'reflow'
type ConversionPhase = 'idle' | 'uploading' | 'extracting' | 'processing' | 'generating' | 'complete'

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [conversionMode, setConversionMode] = useState<ConversionMode>('fast')
  const [epubType, setEpubType] = useState<EpubType>('reflow')
  const [translateToPt, setTranslateToPt] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionPhase, setConversionPhase] = useState<ConversionPhase>('idle')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploadPercent, setUploadPercent] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const phaseLabels: Record<ConversionPhase, string> = {
    idle: 'Pronto',
    uploading: 'Enviando arquivo...',
    extracting: 'Extraindo imagens...',
    processing: 'Processando conteúdo...',
    generating: 'Gerando EPUB...',
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
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleConvert = async () => {
    if (!selectedFile) return

    setIsConverting(true)
    setMessage(null)
    setConversionPhase('uploading')
    setProgressLog([])
    setUploadPercent(0)

    const formData = new FormData()
    formData.append('pdf', selectedFile)
    if (coverFile) {
      formData.append('cover', coverFile)
    }

    // Debug: verificar o que está sendo enviado
    console.log('📤 [FRONTEND] Enviando FormData:')
    console.log('📤 [FRONTEND] - PDF:', selectedFile.name, selectedFile.size, 'bytes')
    if (coverFile) console.log('📤 [FRONTEND] - Cover:', coverFile.name, coverFile.size, 'bytes')

    try {
      // Iniciar SSE de progresso
      const jobId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : String(Date.now())
      console.log('📤 [FRONTEND] jobId gerado:', jobId)
      console.log('📤 [FRONTEND] URL da API:', `${apiUrl}/api/convert?mode=${conversionMode}&jobId=${jobId}`)

      const es = new EventSource(`${apiUrl}/api/progress/${jobId}`)

      es.onerror = (err) => {
        console.error('❌ [FRONTEND] Erro no EventSource:', err)
        console.log('⚠️ [FRONTEND] Continuando sem SSE')
        // Não fechar a conexão axios por causa de erro no SSE
      }

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          console.log('📡 [FRONTEND] Evento SSE recebido:', data)
          if (data.type === 'phase') {
            setConversionPhase(data.phase as ConversionPhase)
          } else if (data.type === 'log') {
            setProgressLog(prev => [...prev, data.message])
          } else if (data.type === 'done') {
            es.close()
          }
        } catch (e) {
          console.error('❌ [FRONTEND] Erro ao parsear evento SSE:', e)
        }
      }

      console.log('📤 [FRONTEND] Iniciando POST com axios...')

      const useFixedLayout = epubType === 'fixed'
      const response = await axios.post(
        `${apiUrl}/api/convert?mode=${conversionMode}&jobId=${jobId}&translate=${translateToPt}&useFixedLayout=${useFixedLayout}`,
        formData,
        {
          responseType: 'blob',
          // Não definir Content-Type manualmente - deixar o axios adicionar o boundary automaticamente
          onUploadProgress: (e) => {
            if (e.total) {
              const p = Math.round((e.loaded / e.total) * 100)
              setUploadPercent(p)
            }
          }
        }
      )

      console.log('✅ [FRONTEND] Resposta recebida do backend')
      console.log('✅ [FRONTEND] Tamanho do EPUB:', response.data.size, 'bytes')

      // Fechar EventSource
      es.close()

      // Criar URL do blob e fazer download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', selectedFile.name.replace('.pdf', '.epub'))
      document.body.appendChild(link)
      link.click()
      link.remove()

      setConversionPhase('complete')
      setMessage({ type: 'success', text: 'Conversão concluída! O download começará automaticamente.' })
      setProgressLog(prev => [...prev, 'Conversão concluída'])

      // Reset após 2 segundos
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
      setMessage({
        type: 'error',
        text: 'Erro ao converter o arquivo. Por favor, tente novamente.'
      })
      setProgressLog(prev => [...prev, 'Erro ao converter o arquivo'])
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="page-wrapper">
      <h1 className="main-title">Conversor PDF para EPUB</h1>

      {/* Card Progresso (aparece no topo quando ativo) */}
      {isConverting && (
        <div className="card progress-card">
          <h2 className="card-title"> Progresso</h2>
          <div className="conversion-progress">
            <div className="progress-phases">
              <div className={`phase ${conversionPhase === 'uploading' || (conversionPhase && conversionPhase !== 'idle') ? 'active' : ''}`}>
                <div className="phase-icon">📤</div>
                <div className="phase-label">Enviando</div>
              </div>
              <div className={`phase ${conversionPhase === 'extracting' || ['processing', 'generating', 'complete'].includes(conversionPhase) ? 'active' : ''}`}>
                <div className="phase-icon">🖼️</div>
                <div className="phase-label">Imagens</div>
              </div>
              <div className={`phase ${conversionPhase === 'processing' || ['generating', 'complete'].includes(conversionPhase) ? 'active' : ''}`}>
                <div className="phase-icon">⚙️</div>
                <div className="phase-label">Processando</div>
              </div>
              <div className={`phase ${conversionPhase === 'generating' || conversionPhase === 'complete' ? 'active' : ''}`}>
                <div className="phase-icon">📦</div>
                <div className="phase-label">Gerando</div>
              </div>
            </div>

            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{
                  width: conversionPhase === 'uploading'
                    ? `${Math.min(25, Math.max(0, uploadPercent / 4))}%`
                    : conversionPhase === 'extracting' ? '50%'
                      : conversionPhase === 'processing' ? '75%'
                        : conversionPhase === 'generating' ? '90%'
                          : '100%'
                }}
              />
            </div>

            <div className="progress-info">
              <div className="progress-icon">
                {conversionPhase === 'complete' ? '✅' : '⏳'}
              </div>
              <div className="progress-text">
                {phaseLabels[conversionPhase]}
              </div>
            </div>

            {progressLog.length > 0 && (
              <div className="progress-logs">
                {progressLog.slice(-5).map((l, idx) => (
                  <div key={idx} className="progress-log-item">{l}</div>
                ))}
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

      <div className="grid-layout">
        {/* Card 1: Arquivo PDF */}
        <div className="card upload-card">
          <div className='title-box '>
            <img src="/book-bookmark-svgrepo-com.svg" alt="Ícone de livro com marcador" className='icon-title' />
            <h2 className="card-title">Arquivo PDF</h2>
          </div>
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <img src="/book-bookmark-svgrepo-com.svg" alt="Ícone de livro com marcador" className='icon-upload' />
            <div className="upload-text">
              {selectedFile ? 'Clique para alterar' : 'Clique ou arraste aqui'}
            </div>
            <div className="upload-subtext">Apenas PDF</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="file-input"
          />

          {selectedFile && (
            <div className="selected-file">
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <h3>{selectedFile.name}</h3>
                  <p>{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
              <button
                className="remove-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFile(null)
                  setMessage(null)
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Configurações */}
        <div className="card settings-card">
          <div className='title-box'>
            <img src="/settings-svgrepo-com.svg" alt="Ícone de configurações" className='icon-title' />
            <h2 className="card-title">Configurações</h2>
          </div>

          <div className="mode-selector">
            <label>Modo de conversão:</label>
            <div className="mode-options">
              <button
                className={`mode-btn ${conversionMode === 'fast' ? 'active' : ''}`}
                onClick={() => setConversionMode('fast')}
                disabled={isConverting}
                title="Conversão mais rápida em um capítulo único"
              >
                ⚡ Rápido
              </button>
              <button
                className={`mode-btn ${conversionMode === 'full' ? 'active' : ''}`}
                onClick={() => setConversionMode('full')}
                disabled={isConverting}
                title="Conversão completa com múltiplos capítulos"
              >
                📖 Completo
              </button>
            </div>
          </div>

          <div className="mode-selector">
            <label>Tipo de EPUB:</label>
            <div className="mode-options">
              <button
                className={`mode-btn ${epubType === 'fixed' ? 'active' : ''}`}
                onClick={() => setEpubType('fixed')}
                disabled={isConverting}
                title="Layout fixo - preserva design original perfeitamente (arquivos maiores)"
              >
                🎨 Fixed Layout
              </button>
              <button
                className={`mode-btn ${epubType === 'reflow' ? 'active' : ''}`}
                onClick={() => setEpubType('reflow')}
                disabled={isConverting}
                title="Texto fluido - se adapta ao tamanho da tela (arquivos menores)"
              >
                📱 Reflow
              </button>
            </div>
          </div>
          <p className="translate-hint">Reflow recomendado para Kindle; Fixed Layout preserva o design.</p>
          {translateToPt && epubType === 'fixed' && (
            <p className="translate-hint">Para traducao visivel, use Reflow.</p>
          )}

          <div className="translate-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={translateToPt}
                onChange={(e) => setTranslateToPt(e.target.checked)}
                disabled={isConverting}
              />
              <span>🌐 Traduzir para pt-br</span>
            </label>
            <p className="translate-hint">Detecta e traduz automaticamente</p>
          </div>

          <div className='secondary-title-box' >
            <img src="/album-svgrepo-com.svg" alt="Ícone de imagem" className='icon-title' />
            <h2 className="card-title">Capa</h2>
          </div>
          <div className="cover-section">
            <p className="cover-hint">JPG ou PNG (opcional)</p>
            <button
              type="button"
              className="secondary-btn full-width"
              onClick={() => coverInputRef.current?.click()}
            >
              {coverFile ? 'Alterar capa' : 'Escolher capa'}
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
                  <div className="file-icon">🖼️</div>
                  <div className="file-details">
                    <h3>{coverFile.name}</h3>
                    <p>{formatFileSize(coverFile.size)}</p>
                  </div>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => setCoverFile(null)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Ação */}
        <div className="card action-card">
          <button
            className="convert-btn"
            onClick={handleConvert}
            disabled={!selectedFile || isConverting}
          >
            {isConverting ? 'Convertendo...' : 'Converter para EPUB'}
          </button>
        </div>
      </div>
    </div>
  )
}
