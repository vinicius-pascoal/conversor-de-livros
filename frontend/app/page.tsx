'use client'

import { useState } from 'react'
import type { ConversionMode, OutputFormat } from './types'
import { DEFAULT_TARGET_LANGUAGE } from './constants/languages'
import { useFileUpload } from './hooks/useFileUpload'
import { useProgress } from './hooks/useProgress'
import { useConversion, ConversionResult } from './hooks/useConversion'
import MessageAlert from './components/MessageAlert'
import FileUpload from './components/FileUpload'
import FormatSelector from './components/FormatSelector'
import ConversionOptions from './components/ConversionOptions'
import LanguageSelector from './components/LanguageSelector'
import CoverUpload from './components/CoverUpload'
import ProgressViewer from './components/ProgressViewer'
import ConvertButton from './components/ConvertButton'
import EpubPreview from './components/EpubPreview'

export default function Home() {
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('epub')
  const [conversionMode, setConversionMode] = useState<ConversionMode>('fast')
  const [translateToPt, setTranslateToPt] = useState(false)
  const [extractImages, setExtractImages] = useState(true)
  const [targetLang, setTargetLang] = useState<string>(DEFAULT_TARGET_LANGUAGE)
  const [previewData, setPreviewData] = useState<ConversionResult | null>(null)

  // Custom hooks para gerenciar estado e lógica
  const fileUpload = useFileUpload()
  const progress = useProgress()

  const { isConverting, handleConvert } = useConversion({
    selectedFile: fileUpload.selectedFile,
    coverFile: fileUpload.coverFile,
    outputFormat,
    conversionMode,
    translateToPt,
    extractImages,
    targetLang,
    setConversionPhase: progress.setConversionPhase,
    setProgressLog: progress.setProgressLog,
    setUploadPercent: progress.setUploadPercent,
    setMessage: fileUpload.setMessage,
    resetProgress: progress.resetProgress
  })

  const handleConvertClick = async () => {
    const result = await handleConvert()
    if (result) {
      // Se for EPUB, mostra preview; se for PDF, faz download direto
      if (result.outputFormat === 'epub') {
        setPreviewData(result)
      } else {
        downloadFile(result.blob, result.fileName)
      }
    }
  }

  const downloadFile = (blob: Blob, fileName: string) => {
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(blobUrl)
  }

  const handleDownloadPreview = () => {
    if (previewData) {
      downloadFile(previewData.blob, previewData.fileName)
    }
  }

  const handleClosePreview = () => {
    setPreviewData(null)
  }

  const handleOutputFormat = (fmt: OutputFormat) => {
    setOutputFormat(fmt)
    if (fmt === 'pdf') setTranslateToPt(true)
  }

  return (
    <div className="page-wrapper">
      <h1 className="main-title">Conversor PDF</h1>

      <ProgressViewer
        isConverting={isConverting}
        conversionPhase={progress.conversionPhase}
        outputFormat={outputFormat}
        progressLog={progress.progressLog}
        logEndRef={progress.logEndRef}
      />

      <MessageAlert message={fileUpload.message} />

      <FileUpload
        selectedFile={fileUpload.selectedFile}
        isDragging={fileUpload.isDragging}
        fileInputRef={fileUpload.fileInputRef}
        formatFileSize={fileUpload.formatFileSize}
        onFileChange={fileUpload.handleFileChange}
        onDrop={fileUpload.handleDrop}
        onDragOver={fileUpload.handleDragOver}
        onDragLeave={fileUpload.handleDragLeave}
        onRemoveFile={fileUpload.removeFile}
      />

      <div className="options-grid">
        <FormatSelector
          outputFormat={outputFormat}
          conversionMode={conversionMode}
          isConverting={isConverting}
          onFormatChange={handleOutputFormat}
          onModeChange={setConversionMode}
        />

        <div className="card extra-card">
          <div className="title-box">
            <img src="/album-svgrepo-com.svg" alt="Opções" className="icon-title" />
            <h2 className="card-title">Opções</h2>
          </div>

          <ConversionOptions
            outputFormat={outputFormat}
            translateToPt={translateToPt}
            extractImages={extractImages}
            isConverting={isConverting}
            onTranslateChange={setTranslateToPt}
            onExtractImagesChange={setExtractImages}
          />
          {translateToPt && (
            <LanguageSelector
              selectedLang={targetLang}
              onLanguageChange={setTargetLang}
              disabled={isConverting}
            />
          )}


          <div className="secondary-title-box">
            <img src="/album-svgrepo-com.svg" alt="Capa" className="icon-title" />
            <h2 className="card-title">
              Capa <span className="optional-tag">(opcional)</span>
            </h2>
          </div>

          <CoverUpload
            coverFile={fileUpload.coverFile}
            coverInputRef={fileUpload.coverInputRef}
            isConverting={isConverting}
            formatFileSize={fileUpload.formatFileSize}
            onCoverChange={fileUpload.handleCoverChange}
            onRemoveCover={fileUpload.removeCover}
          />
        </div>
      </div>

      <ConvertButton
        selectedFile={fileUpload.selectedFile}
        isConverting={isConverting}
        outputFormat={outputFormat}
        onConvert={handleConvertClick}
      />

      {previewData && (
        <EpubPreview
          epubBlob={previewData.blob}
          fileName={previewData.fileName}
          onClose={handleClosePreview}
          onDownload={handleDownloadPreview}
        />
      )}
    </div>
  )
}
