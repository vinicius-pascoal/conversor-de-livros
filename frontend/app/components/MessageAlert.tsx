import type { MessageData } from '../types'

interface MessageAlertProps {
  message: MessageData | null
}

export default function MessageAlert({ message }: MessageAlertProps) {
  if (!message) return null

  return (
    <div className={`card message-card ${message.type === 'success' ? 'success-message' : 'error-message'}`}>
      {message.text}
    </div>
  )
}
