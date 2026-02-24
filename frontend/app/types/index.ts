export type ConversionMode = 'fast' | 'full'
export type OutputFormat = 'epub' | 'pdf'
export type ConversionPhase = 'idle' | 'uploading' | 'extracting' | 'processing' | 'translating' | 'generating' | 'complete'
export type MessageType = 'success' | 'error'
export type LanguageCode = string // Códigos ISO 639-1

export interface MessageData {
  type: MessageType
  text: string
}

export interface ConversionOptions {
  outputFormat: OutputFormat
  conversionMode: ConversionMode
  translateToPt: boolean
  extractImages: boolean
  targetLang?: string // Idioma de destino para tradução
}

export interface ConversionProgress {
  phase: ConversionPhase
  progressLog: string[]
  uploadPercent: number
  isConverting: boolean
}
