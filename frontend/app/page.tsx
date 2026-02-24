'use client'

import { useState } from 'react'
import type { ConversionMode, OutputFormat } from './types'
import { useFileUpload } from './hooks/useFileUpload'
import { useProgress } from './hooks/useProgress'
import { useConversion } from './hooks/useConversion'
import MessageAlert from './components/MessageAlert'
import FileUpload from './components/FileUpload'
import FormatSelector from './components/FormatSelector'
import ConversionOptions from './components/ConversionOptions'
import CoverUpload from './components/CoverUpload'
import ProgressViewer from './components/ProgressViewer'
import ConvertButton from './components/ConvertButton'

export default function Home() {
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('epub')
  const [conversionMode, setConversionMode] = useState<ConversionMode>('fast')
  const [translateToPt, setTranslateToPt] = useState(false)
  const [extractImages, setExtractImages] = useState(true)

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
    setConversionPhase: progress.setConversionPhase,
    setProgressLog: progress.setProgressLog,
    setUploadPercent: progress.setUploadPercent,
    setMessage: fileUpload.setMessage,
    resetProgress: progress.resetProgress
  })

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
        onConvert={handleConvert}
      />
    </div>
  )
}
