import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import convertRoutes from './routes/convert.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', convertRoutes)

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📡 Frontend permitido: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`)
})
