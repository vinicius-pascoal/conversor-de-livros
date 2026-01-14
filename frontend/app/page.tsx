'use client'

import { useState, useRef } from 'react'
import axios from 'axios'

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setCoverFile(file)
      setMessage(null)
    } else if (file) {
      setMessage({ type: 'error', text: 'Capa precisa ser imagem (JPG ou PNG).' })
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

    const formData = new FormData()
    formData.append('pdf', selectedFile)
    if (coverFile) {
      formData.append('cover', coverFile)
    }

    try {
      const response = await axios.post(`${apiUrl}/api/convert`, formData, {
        responseType: 'blob',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Criar URL do blob e fazer download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', selectedFile.name.replace('.pdf', '.epub'))
      document.body.appendChild(link)
      link.click()
      link.remove()

      setMessage({ type: 'success', text: 'Conversão concluída! O download começará automaticamente.' })
      setSelectedFile(null)
      setCoverFile(null)
    } catch (error) {
      console.error('Erro na conversão:', error)
      setMessage({
        type: 'error',
        text: 'Erro ao converter o arquivo. Por favor, tente novamente.'
      })
    } finally {
      setIsConverting(false)
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
    <div className="container">
      <h1>📚 Conversor PDF para EPUB</h1>

      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="upload-icon">📄</div>
        <div className="upload-text">
          {selectedFile ? 'Clique ou arraste para selecionar outro arquivo' : 'Clique ou arraste seu arquivo PDF aqui'}
        </div>
        <div className="upload-subtext">Formatos aceitos: PDF</div>
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
            Remover
          </button>
        </div>
      )}

      <div className="cover-section">
        <div className="cover-header">
          <h3>Capa (opcional)</h3>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => coverInputRef.current?.click()}
          >
            Escolher capa
          </button>
        </div>
        <p className="cover-hint">Formatos: JPG ou PNG. Será usada como capa do EPUB.</p>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleCoverChange}
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
              Remover
            </button>
          </div>
        )}
      </div>

      <button
        className="convert-btn"
        onClick={handleConvert}
        disabled={!selectedFile || isConverting}
      >
        {isConverting ? 'Convertendo...' : 'Converter para EPUB'}
      </button>

      {isConverting && (
        <div className="loading">
          <div className="loading-spinner"></div>
          <div className="loading-text">Convertendo seu arquivo...</div>
        </div>
      )}

      {message && (
        <div className={message.type === 'success' ? 'success-message' : 'error-message'}>
          {message.text}
        </div>
      )}
    </div>
  )
}
