import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { convertPdfToEpub } from '../services/converter.js'

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
    fileSize: 50 * 1024 * 1024 // 50MB por arquivo
  }
})

// Rota de conversão
router.post('/convert', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    const pdfFile = req.files?.pdf?.[0]
    const coverFile = req.files?.cover?.[0]

    if (!pdfFile) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' })
    }

    const fastMode = req.query.mode
      ? req.query.mode === 'fast'
      : (process.env.FAST_MODE_DEFAULT === 'true')
    const keepImages = req.query.keepImages
      ? ['true', '1', 'yes', 'on'].includes(String(req.query.keepImages).toLowerCase())
      : true

    console.log('📄 Arquivo recebido:', pdfFile.originalname, 'tamanho:', pdfFile.size, 'bytes')
    console.log('⚡ Modo rápido:', fastMode)
    console.log('🖼️ Manter imagens:', keepImages)

    const pdfPath = pdfFile.path
    const epubPath = pdfPath.replace('.pdf', '.epub')
    const coverPath = coverFile ? coverFile.path : null

    // Converter PDF para EPUB
    console.time('convert-route')
    console.log('➡️ Chamando convertPdfToEpub')
    const result = await convertPdfToEpub(pdfPath, epubPath, pdfFile.originalname, { fastMode, coverPath, keepImages })
    console.log('⬅️ Retorno convertPdfToEpub')
    console.timeEnd('convert-route')

    console.log('✅ Conversão concluída')

    // Enviar o arquivo EPUB
    res.download(epubPath, pdfFile.originalname.replace('.pdf', '.epub'), (err) => {
      // Limpar arquivos temporários após o download
      fs.unlink(pdfPath, () => { })
      fs.unlink(epubPath, () => { })
      if (coverPath) fs.unlink(coverPath, () => { })
      if (result?.assetsDir) fs.rm(result.assetsDir, { recursive: true, force: true }, () => { })

      if (err) {
        console.error('Erro ao enviar arquivo:', err)
        res.status(500).json({ error: 'Erro ao enviar arquivo convertido' })
      }
    })

  } catch (error) {
    console.error('❌ Erro na conversão:', error)

    // Limpar arquivo temporário em caso de erro
    const pdfFile = req.files?.pdf?.[0]
    const coverFile = req.files?.cover?.[0]
    if (pdfFile) fs.unlink(pdfFile.path, () => { })
    if (coverFile) fs.unlink(coverFile.path, () => { })

    res.status(500).json({
      error: 'Erro ao converter arquivo',
      message: error.message
    })
  }
})

export default router
