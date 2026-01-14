'use client'

import { useState, useRef } from 'react'
import axios from 'axios'

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
