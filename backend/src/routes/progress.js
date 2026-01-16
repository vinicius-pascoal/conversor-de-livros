import express from 'express'
import { sseStream } from '../services/progress.js'

const router = express.Router()

// SSE para progresso da conversão
/**
 * @swagger
 * /api/progress/{jobId}:
 *   get:
 *     tags:
 *       - Progresso
 *     summary: Obtém atualizações de progresso em tempo real
 *     description: Conecta usando Server-Sent Events (SSE) para receber atualizações de progresso da conversão
 *     parameters:
 *       - name: jobId
 *         in: path
 *         description: ID único da tarefa de conversão
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Streaming SSE com eventos de progresso
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [phase, log, done]
 *                   description: Tipo de evento
 *                 phase:
 *                   type: string
 *                   enum: [uploading, extracting, processing, generating, complete]
 *                   description: Fase da conversão (apenas para type=phase)
 *                 message:
 *                   type: string
 *                   description: Mensagem de log (apenas para type=log)
 *       400:
 *         description: jobId ausente ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params
  if (!jobId) {
    return res.status(400).json({ error: 'jobId é obrigatório' })
  }
  sseStream(jobId, res)
})

export default router
