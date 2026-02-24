'use client'

import { useEffect, useRef, useState } from 'react'
import ePub, { Book, Rendition } from 'epubjs'

interface EpubPreviewProps {
  epubBlob: Blob
  fileName: string
  onClose: () => void
  onDownload: () => void
}

export default function EpubPreview({ epubBlob, fileName, onClose, onDownload }: EpubPreviewProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [currentLocation, setCurrentLocation] = useState<string>('')
  const [totalPages, setTotalPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!viewerRef.current) return

    let renditionInstance: Rendition | null = null

    const loadEpub = async () => {
      try {
        // Converter Blob para ArrayBuffer para compatibilidade com epub.js
        const arrayBuffer = await epubBlob.arrayBuffer()
        const bookInstance = ePub(arrayBuffer)
        setBook(bookInstance)

        renditionInstance = bookInstance.renderTo(viewerRef.current!, {
          width: '100%',
          height: '100%',
          spread: 'none'
        })

        await renditionInstance.display()
        setIsLoading(false)

        // Listener para mudanças de localização
        renditionInstance.on('relocated', (location: any) => {
          setCurrentLocation(location.start.cfi)

          // Calcula página atual
          if (location.start.displayed && location.end.displayed) {
            const current = location.start.displayed.page
            const total = location.end.displayed.total
            setCurrentPage(current)
            setTotalPages(total)
          }
        })

        setRendition(renditionInstance)
      } catch (error) {
        console.error('Erro ao carregar EPUB:', error)
        setError('Erro ao carregar a prévia do EPUB. Tente fazer o download direto.')
        setIsLoading(false)
      }
    }

    loadEpub()

    // Cleanup
    return () => {
      if (renditionInstance) {
        renditionInstance.destroy()
      }
    }
  }, [epubBlob])

  const goToNextPage = () => {
    rendition?.next()
  }

  const goToPrevPage = () => {
    rendition?.prev()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') goToNextPage()
    else if (e.key === 'ArrowLeft') goToPrevPage()
    else if (e.key === 'Escape') onClose()
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rendition])

  return (
    <div className="epub-preview-overlay">
      <div className="epub-preview-container">
        {/* Header */}
        <div className="epub-preview-header">
          <div className="epub-preview-title">
            <span className="epub-preview-icon">📖</span>
            <h2>Prévia: {fileName}</h2>
          </div>
          <div className="epub-preview-actions">
            <button onClick={goToPrevPage} className="epub-nav-button" title="Página anterior (←)">
              ←
            </button>
            <span className="epub-page-counter">
              {currentPage} / {totalPages || '...'}
            </span>
            <button onClick={goToNextPage} className="epub-nav-button" title="Próxima página (→)">
              →
            </button>
            <div className="epub-divider"></div>
            <button onClick={onDownload} className="epub-action-button download">
              ⬇ Baixar EPUB
            </button>
            <button onClick={onClose} className="epub-action-button close">
              ✕ Fechar
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="epub-preview-viewer">
          {isLoading && !error && (
            <div className="epub-loading">
              <div className="epub-spinner"></div>
              <p>Carregando prévia...</p>
            </div>
          )}
          {error && (
            <div className="epub-error">
              <div className="epub-error-icon">⚠️</div>
              <p className="epub-error-message">{error}</p>
              <button onClick={onDownload} className="epub-error-button">
                📥 Fazer Download Mesmo Assim
              </button>
            </div>
          )}
          <div ref={viewerRef} className="epub-viewer-content"></div>
        </div>

        {/* Footer com dicas */}
        <div className="epub-preview-footer">
          <span>💡 Use as setas ← → do teclado para navegar</span>
          <span>Pressione ESC para fechar</span>
        </div>
      </div>
    </div>
  )
}
