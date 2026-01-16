import express from 'express'

const router = express.Router()

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Verifica o status do servidor
 *     description: Retorna o status atual do servidor
 *     responses:
 *       200:
 *         description: Servidor está operacional
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor rodando!' })
})

export default router
