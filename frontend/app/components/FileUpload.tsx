interface FileUploadProps {
  selectedFile: File | null
  isDragging: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  formatFileSize: (bytes: number) => string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onRemoveFile: () => void
}

export default function FileUpload({
  selectedFile,
  isDragging,
  fileInputRef,
  formatFileSize,
  onFileChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveFile
}: FileUploadProps) {
  return (
    <div className="card upload-hero-card">
      <div className="upload-hero-inner">
        <div
          className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
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
                  onRemoveFile()
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
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={onFileChange} className="file-input" />
      </div>
    </div>
  )
}
