import { useState } from 'react'
import axios from 'axios'
import type { ConversionMode, OutputFormat, ConversionPhase, MessageData } from '../types'
import { DEFAULT_TARGET_LANGUAGE } from '../constants/languages'

interface UseConversionOptions {
  selectedFile: File | null
  coverFile: File | null
  outputFormat: OutputFormat
  conversionMode: ConversionMode
  translateToPt: boolean
  extractImages: boolean
  targetLang?: string
  setConversionPhase: (phase: ConversionPhase) => void
  setProgressLog: React.Dispatch<React.SetStateAction<string[]>>
  setUploadPercent: (percent: number) => void
  setMessage: (message: MessageData | null) => void
  resetProgress: () => void
}

export interface ConversionResult {
  blob: Blob
  fileName: string
  outputFormat: OutputFormat
}

export function useConversion(options: UseConversionOptions) {
  const [isConverting, setIsConverting] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const handleConvert = async (): Promise<ConversionResult | null> => {
    const {
      selectedFile,
      coverFile,
      outputFormat,
      conversionMode,
      translateToPt,
      extractImages,
      targetLang = DEFAULT_TARGET_LANGUAGE,
      setConversionPhase,
      setProgressLog,
      setUploadPercent,
      setMessage,
      resetProgress
    } = options

    if (!selectedFile) return null

    setIsConverting(true)
    setMessage(null)
    setConversionPhase('uploading')
    resetProgress()
    setConversionPhase('uploading')

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
        `&extractImages=${extractImages +
        `&targetLang=${targetLang}`}` +
        `&outputFormat=${outputFormat}`

      const response = await axios.post(url, formData, {
        responseType: 'blob',
        onUploadProgress: (e) => {
          if (e.total) setUploadPercent(Math.round((e.loaded / e.total) * 100))
        }
      })

      es.close()

      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '')
      const langSuffix = targetLang === 'pt' ? '_pt-br' : `_${targetLang}`
      const downloadName = isPdfMode ? `${baseName}${langSuffix}.pdf` : `${baseName}.epub`

      setConversionPhase('complete')
      setMessage({
        type: 'success',
        text: isPdfMode
          ? 'PDF traduzido gerado com sucesso!'
          : 'EPUB gerado com sucesso!'
      })
      setProgressLog((prev) => [...prev, 'Concluído com sucesso'])

      setTimeout(() => {
        setIsConverting(false)
      }, 500)

      return {
        blob: new Blob([response.data]),
        fileName: downloadName,
        outputFormat
      }
    } catch (error) {
      console.error('Erro na conversão:', error)
      setConversionPhase('idle')
      setIsConverting(false)
      setMessage({ type: 'error', text: 'Erro ao converter o arquivo. Por favor, tente novamente.' })
      setProgressLog((prev) => [...prev, 'Erro na conversão'])
      return null
    }
  }

  return {
    isConverting,
    handleConvert
  }
}
