interface CoverUploadProps {
  coverFile: File | null
  coverInputRef: React.RefObject<HTMLInputElement>
  isConverting: boolean
  formatFileSize: (bytes: number) => string
  onCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveCover: () => void
}

export default function CoverUpload({
  coverFile,
  coverInputRef,
  isConverting,
  formatFileSize,
  onCoverChange,
  onRemoveCover
}: CoverUploadProps) {
  return (
    <div className="cover-section">
      <p className="cover-hint">JPG ou PNG</p>
      <button
        type="button"
        className="secondary-btn full-width"
        onClick={() => coverInputRef.current?.click()}
        disabled={isConverting}
      >
        {coverFile ? ' Alterar capa' : ' Escolher capa'}
      </button>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={onCoverChange}
        className="file-input"
      />
      {coverFile && (
        <div className="selected-cover">
          <div className="file-info">
            <div className="file-icon"></div>
            <div className="file-details">
              <h3>{coverFile.name}</h3>
              <p>{formatFileSize(coverFile.size)}</p>
            </div>
          </div>
          <button className="remove-btn" onClick={onRemoveCover}></button>
        </div>
      )}
    </div>
  )
}
