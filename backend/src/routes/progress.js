import express from 'express'
import { sseStream } from '../services/progress.js'

const router = express.Router()

// SSE para progresso da conversão
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params
  if (!jobId) {
    return res.status(400).json({ error: 'jobId é obrigatório' })
  }
  sseStream(jobId, res)
})

export default router
