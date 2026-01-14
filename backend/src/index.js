import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import convertRoutes from './routes/convert.js'
import progressRoutes from './routes/progress.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

// Não aplicar body parsers em rotas de upload (multer gerencia isso)
app.use((req, res, next) => {
  const isUploadRoute = req.path.includes('/convert')
  if (isUploadRoute && req.method === 'POST') {
    console.log('🔷 [EXPRESS] Pulando body parsers para rota de upload')
    return next()
  }
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', convertRoutes)
app.use('/api', progressRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor rodando!' })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Erro:', err)
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  })
})

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📡 Frontend permitido: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`)
})

// Desabilita timeouts de requisição para permitir conversões longas
// Evita encerramento automático de conexões em PDFs grandes
server.setTimeout(0)
// Em algumas versões do Node, o headersTimeout também influencia
// conexões longas; definimos como 0 para não limitar
server.headersTimeout = 0
