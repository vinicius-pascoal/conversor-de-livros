import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { convertPdfToEpub } from '../services/converter.js'
import { generatePdf } from '../services/pdfGenerator.js'
import { translateTextWithProgress, detectLanguage } from '../services/translator.js'
import pdfParse from 'pdf-parse'
import { emitProgress, completeProgress } from '../services/progress.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '200', 10)
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf'
    const isImage = file.mimetype.startsWith('image/')
    if (isPdf || isImage) {
      cb(null, true)
    } else {
      cb(new Error('Apenas arquivos PDF ou imagens são permitidos (para capa).'))
    }
  },
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024 // limite configurável (padrão 200MB)
  }
})

// Rota de conversão
/**
 * @swagger
 * /api/convert:
 *   post:
 *     tags:
 *       - Conversão
 *     summary: Converte um arquivo PDF para EPUB
 *     description: Converte um arquivo PDF para o formato EPUB com opções de tradução, modo rápido e cover opcional
 *     parameters:
 *       - name: mode
 *         in: query
 *         description: Modo de conversão - 'fast' para conversão rápida ou 'full' para completa
 *         required: false
 *         schema:
 *           type: string
 *           enum: [fast, full]
 *           default: fast
 *       - name: translate
 *         in: query
 *         description: Traduzir o conteúdo para português (pt-br)
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *       - name: useFixedLayout
 *         in: query
 *         description: Usar Fixed Layout EPUB (preserva layout original) ou Reflow (texto fluido)
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *       - name: jobId
 *         in: query
 *         description: ID único da tarefa para rastreamento de progresso (SSE)
 *         required: false
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdf:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo PDF a ser convertido (obrigatório)
 *               cover:
 *                 type: string
 *                 format: binary
 *                 description: Imagem de capa do EPUB em PNG ou JPG (opcional)
 *             required:
 *               - pdf
 *     responses:
 *       200:
 *         description: EPUB gerado com sucesso
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Erro na requisição (arquivo inválido ou ausente)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Erro ao processar a conversão
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/convert', (req, res, next) => {
  console.log('🔵 [CONVERT] Requisição recebida')
  console.log('🔵 [CONVERT] Headers:', JSON.stringify(req.headers, null, 2))
  console.log('🔵 [CONVERT] Query params:', req.query)
  console.log('🔵 [CONVERT] Content-Type:', req.headers['content-type'])
  next()
}, upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), (err, req, res, next) => {
  // Tratamento de erros do multer
  if (err) {
    console.error('❌ [MULTER] Erro no upload:', err)
    console.error('❌ [MULTER] Tipo de erro:', err.code || err.message)
    return res.status(400).json({
      error: 'Erro no upload do arquivo',
      message: err.message,
      code: err.code
    })
  }
  next()
}, async (req, res) => {
  console.log('🟢 [CONVERT] Upload concluído pelo multer')
  console.log('🟢 [CONVERT] req.files:', req.files)
  console.log('🟢 [CONVERT] req.body:', req.body)
  try {
    const pdfFile = req.files?.pdf?.[0]
    const coverFile = req.files?.cover?.[0]
    console.log('🟢 [CONVERT] Arquivos recebidos:', { pdf: !!pdfFile, cover: !!coverFile })

    if (!pdfFile) {
      console.log('❌ [CONVERT] Nenhum arquivo PDF recebido')
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' })
    }

    const jobId = req.query.jobId ? String(req.query.jobId) : null
    console.log('🟡 [CONVERT] jobId:', jobId)
    const outputFormat = req.query.outputFormat || 'epub' // 'epub' | 'pdf'
    const fastMode = req.query.mode
      ? req.query.mode === 'fast'
      : (process.env.FAST_MODE_DEFAULT === 'true')
    const keepImages = req.query.keepImages
      ? ['true', '1', 'yes', 'on'].includes(String(req.query.keepImages).toLowerCase())
      : true
    const extractImages = req.query.extractImages !== undefined
      ? ['true', '1', 'yes', 'on'].includes(String(req.query.extractImages).toLowerCase())
      : true // Padrão: extrair imagens
    const translate = req.query.translate
      ? ['true', '1', 'yes', 'on'].includes(String(req.query.translate).toLowerCase())
      : false
    const useFixedLayout = req.query.useFixedLayout
      ? ['true', '1', 'yes', 'on'].includes(String(req.query.useFixedLayout).toLowerCase())
      : true // Fixed Layout é padrão

    console.log('📄 [CONVERT] Arquivo recebido:', pdfFile.originalname, 'tamanho:', pdfFile.size, 'bytes')
    console.log('📄 [CONVERT] Configuração: outputFormat=%s, fastMode=%s, keepImages=%s, extractImages=%s, translate=%s, useFixedLayout=%s', outputFormat, fastMode, keepImages, extractImages, translate, useFixedLayout)
    if (jobId) {
      console.log('📡 [CONVERT] Emitindo progresso para jobId:', jobId)
      emitProgress(jobId, { type: 'log', message: `Arquivo recebido: ${pdfFile.originalname}` })
    }
    console.log('⚡ Modo rápido:', fastMode)
    console.log('🖼️ Manter imagens:', keepImages)
    if (jobId) emitProgress(jobId, { type: 'phase', phase: 'extracting' })

    const pdfPath = pdfFile.path
    const coverPath = coverFile ? coverFile.path : null
    console.log('📂 [CONVERT] Caminhos: pdf=%s, cover=%s', pdfPath, coverPath)

    // ── Fluxo: PDF Traduzido ──────────────────────────────────────────────────
    if (outputFormat === 'pdf') {
      const outputPdfPath = pdfPath.replace(/(\.pdf)?$/, '_traduzido.pdf')
      const title = pdfFile.originalname.replace('.pdf', '')
      const progressFn = jobId ? (evt) => emitProgress(jobId, evt) : null

      console.log('🔄 [CONVERT] Iniciando fluxo PDF traduzido')

      // 1. Extrair texto
      progressFn?.({ type: 'log', message: 'Extraindo texto do PDF...' })
      const dataBuffer = await fs.promises.readFile(pdfPath)
      const pdfData = await pdfParse(dataBuffer)
      let text = pdfData.text || ''

      if (!text.trim()) {
        return res.status(400).json({ error: 'Nenhum texto foi encontrado no PDF. O arquivo pode ser digitalizado (imagem).' })
      }

      progressFn?.({ type: 'log', message: `Texto extraído: ${text.length} caracteres` })
      if (jobId) emitProgress(jobId, { type: 'phase', phase: 'processing' })

      // 2. Traduzir
      progressFn?.({ type: 'log', message: 'Iniciando tradução...' })
      const detectedLang = await detectLanguage(text)
      console.log('🌍 Idioma detectado:', detectedLang)

      if (detectedLang !== 'pt') {
        text = await translateTextWithProgress(text, progressFn)
      } else {
        progressFn?.({ type: 'log', message: 'Texto já está em português, pulando tradução' })
      }

      if (jobId) emitProgress(jobId, { type: 'phase', phase: 'generating' })

      // 3. Gerar PDF
      await generatePdf({
        text,
        title,
        outputPath: outputPdfPath,
        coverPath,
        progress: progressFn
      })

      console.log('✅ PDF traduzido gerado:', outputPdfPath)

      const downloadName = pdfFile.originalname.replace('.pdf', '') + '_pt-br.pdf'
      res.download(outputPdfPath, downloadName, (err) => {
        fs.unlink(pdfPath, () => { })
        fs.unlink(outputPdfPath, () => { })
        if (coverPath) fs.unlink(coverPath, () => { })

        if (err) {
          console.error('❌ [CONVERT] Erro ao enviar PDF traduzido:', err)
        } else {
          console.log('✅ [CONVERT] Download PDF traduzido concluído')
          if (jobId) {
            emitProgress(jobId, { type: 'done' })
            completeProgress(jobId)
          }
        }
      })

      return
    }

    // ── Fluxo: EPUB (padrão) ─────────────────────────────────────────────────
    const epubPath = pdfPath.replace('.pdf', '.epub')

    // Converter PDF para EPUB
    console.time('convert-route')
    console.log('➡️ [CONVERT] Chamando convertPdfToEpub')
    const result = await convertPdfToEpub(pdfPath, epubPath, pdfFile.originalname, {
      fastMode,
      coverPath,
      keepImages: extractImages, // usa extractImages como keepImages
      translate,
      useFixedLayout,
      progress: jobId ? (evt) => emitProgress(jobId, evt) : null
    })
    console.log('⬅️ Retorno convertPdfToEpub')
    console.timeEnd('convert-route')

    console.log('✅ Conversão concluída')
    if (jobId) emitProgress(jobId, { type: 'phase', phase: 'generating' })

    // Enviar o arquivo EPUB
    console.log('📤 [CONVERT] Iniciando download do EPUB')
    res.download(epubPath, pdfFile.originalname.replace('.pdf', '.epub'), (err) => {
      console.log('🧹 [CONVERT] Callback do download executado')
      // Limpar arquivos temporários após o download
      fs.unlink(pdfPath, () => { })
      fs.unlink(epubPath, () => { })
      if (coverPath) fs.unlink(coverPath, () => { })
      if (result?.assetsDir) fs.rm(result.assetsDir, { recursive: true, force: true }, () => { })

      if (err) {
        console.error('❌ [CONVERT] Erro ao enviar arquivo:', err)
        res.status(500).json({ error: 'Erro ao enviar arquivo convertido' })
      } else {
        console.log('✅ [CONVERT] Download concluído com sucesso')
        if (jobId) {
          console.log('📡 [CONVERT] Emitindo done e completando progresso')
          emitProgress(jobId, { type: 'done' })
          completeProgress(jobId)
        }
      }
    })

  } catch (error) {
    console.error('❌ [CONVERT] Erro na conversão:', error)
    console.error('❌ [CONVERT] Stack:', error.stack)

    // Limpar arquivo temporário em caso de erro
    const pdfFile = req.files?.pdf?.[0]
    const coverFile = req.files?.cover?.[0]
    if (pdfFile) {
      console.log('🧹 [CONVERT] Limpando arquivo PDF temporário')
      fs.unlink(pdfFile.path, () => { })
    }
    if (coverFile) {
      console.log('🧹 [CONVERT] Limpando arquivo cover temporário')
      fs.unlink(coverFile.path, () => { })
    }

    res.status(500).json({
      error: 'Erro ao converter arquivo',
      message: error.message
    })
  }
})

export default router
