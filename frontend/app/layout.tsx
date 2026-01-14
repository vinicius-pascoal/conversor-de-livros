import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Conversor PDF para EPUB',
  description: 'Converta seus arquivos PDF para o formato EPUB',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
