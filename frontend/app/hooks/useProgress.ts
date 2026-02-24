import { useState, useRef, useEffect } from 'react'
import type { ConversionPhase } from '../types'

export function useProgress() {
  const [conversionPhase, setConversionPhase] = useState<ConversionPhase>('idle')
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [uploadPercent, setUploadPercent] = useState<number>(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll do log para o final
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [progressLog])

  const resetProgress = () => {
    setConversionPhase('idle')
    setProgressLog([])
    setUploadPercent(0)
  }

  const addLogMessage = (message: string) => {
    setProgressLog((prev) => [...prev, message])
  }

  return {
    conversionPhase,
    progressLog,
    uploadPercent,
    logEndRef,
    setConversionPhase,
    setProgressLog,
    setUploadPercent,
    resetProgress,
    addLogMessage
  }
}
