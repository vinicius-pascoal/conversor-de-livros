import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'

const execFileAsync = promisify(execFile)

// Garante que etapas críticas não fiquem penduradas indefinidamente
async function runWithTimeout(promise, ms, label) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} excedeu ${ms} ms`)), ms)
  })
  const result = await Promise.race([promise, timeoutPromise])
  clearTimeout(timeout)
  return result
}

export async function convertPdfToEpub(pdfPath, epubPath, originalFilename, options = {}) {
  try {
    const fastMode = options.fastMode === true
    let coverPath = options.coverPath || null
    const keepImages = options.keepImages !== false
    console.log('🔄 Iniciando conversão...')
    console.log('⚡ fastMode:', fastMode)
    console.log('🖼️ keepImages:', keepImages)
    console.time('pdf-total')

    // Ler o PDF
    console.time('pdf-read')
    const dataBuffer = await fs.promises.readFile(pdfPath)
    console.timeEnd('pdf-read')

    console.time('pdf-parse')
    const pdfData = await runWithTimeout(pdfParse(dataBuffer), 30000, 'pdf-parse')
    console.timeEnd('pdf-parse')

    console.log('📖 PDF lido com sucesso')
    console.log('📊 Páginas:', pdfData.numpages)
    console.log('📝 Texto extraído:', pdfData.text.length, 'caracteres')

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('Nenhum texto extraído do PDF (pode ser digitalizado sem OCR)')
    }

    // Limita tamanho para evitar lentidão extrema em PDFs gigantes
    const MAX_CHARS = 800_000
    const text = pdfData.text.length > MAX_CHARS
      ? pdfData.text.slice(0, MAX_CHARS)
      : pdfData.text

    // Extrair título do nome do arquivo ou usar texto
    const title = originalFilename.replace('.pdf', '') || 'Documento Convertido'

    console.time('split-chapters')
    let chapters
    if (fastMode) {
      // Modo rápido: um capítulo único para reduzir tempo
      chapters = [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
      console.timeEnd('split-chapters')
    } else {
      chapters = await runWithTimeout(
        Promise.resolve().then(() => splitIntoChapters(text, pdfData.numpages)),
        5000,
        'split-chapters'
      )
      console.timeEnd('split-chapters')
    }

    // Extrair imagens do PDF (opcional)
    let assetsDir = null
    let extractedImages = []
    if (keepImages) {
      console.time('pdf-images')
      try {
        const imagesResult = await extractImages(pdfPath)
        assetsDir = imagesResult.assetsDir
        extractedImages = imagesResult.images
        console.log('🖼️ Imagens extraídas:', extractedImages.length)
        if (!coverPath && extractedImages.length > 0) {
          coverPath = extractedImages[0]
          console.log('📔 Capa definida pela primeira imagem extraída')
        }
      } catch (err) {
        console.error('⚠️ Falha ao extrair imagens:', err.message)
      }
      console.timeEnd('pdf-images')
    }

    // Anexa capítulo de galeria de imagens, se existirem
    if (extractedImages.length > 0) {
      const imgsHtml = extractedImages
        .map((imgPath) => `<div style="text-align:center;margin:16px 0;"><img src="${imgPath}" alt="Imagem do PDF" style="max-width:100%;" /></div>`)
        .join('\n')
      chapters.push({ title: 'Imagens', data: imgsHtml })
    }

    // Configuração do EPUB
    const epubOptions = {
      title: title,
      author: 'Autor Desconhecido',
      publisher: 'Conversor PDF-EPUB',
      cover: coverPath || '',
      content: chapters,
      lang: 'pt',
      tocTitle: 'Índice',
      appendChapterTitles: true,
      customOpfTemplatePath: null,
      customNcxTocTemplatePath: null,
      customHtmlTocTemplatePath: null,
      version: 3
    }

    console.log('📚 Gerando EPUB...')
    console.time('epub-gen')

    try {
      // Gerar o EPUB
      await runWithTimeout(new Epub(epubOptions, epubPath).promise, fastMode ? 15000 : 30000, 'epub-gen')
    } catch (err) {
      console.error('⚠️ epub-gen falhou, tentando modo simplificado:', err.message)
      // fallback simples: um capítulo único com o texto plano para não travar
      const fallbackOptions = {
        title: title,
        author: 'Autor Desconhecido',
        cover: coverPath || '',
        content: [{ title: 'Conteúdo', data: `<pre>${escapeHtml(text)}</pre>` }],
        lang: 'pt'
      }
      await runWithTimeout(new Epub(fallbackOptions, epubPath).promise, 15000, 'epub-gen-fallback')
    }

    console.timeEnd('epub-gen')
    console.timeEnd('pdf-total')
    console.log('✨ EPUB gerado com sucesso!')

    return { epubPath, assetsDir }

  } catch (error) {
    console.error('Erro na conversão:', error)
    throw new Error(`Falha ao converter PDF para EPUB: ${error.message}`)
  }
}

async function extractImages(pdfPath) {
  // Usa pdfimages (Poppler) para extrair imagens como PNG
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
  const baseOut = path.join(tempDir, 'img')
  await execFileAsync('pdfimages', ['-png', pdfPath, baseOut])

  // Coletar arquivos gerados
  const files = await fs.promises.readdir(tempDir)
  const images = files
    .filter((f) => f.startsWith('img'))
    .map((f) => path.join(tempDir, f))
    .sort()

  return { assetsDir: tempDir, images }
}

function splitIntoChapters(text, numPages) {
  // Tentar dividir por quebras de página ou seções
  const chapters = []

  const safePages = numPages && numPages > 0 ? numPages : Math.max(Math.ceil(text.length / 2000), 1)

  // Se o texto for muito pequeno, criar um único capítulo
  if (text.length < 1000) {
    return [{
      title: 'Capítulo 1',
      data: `<p>${text.replace(/\n/g, '</p><p>')}</p>`
    }]
  }

  // Dividir o texto em partes aproximadamente iguais baseado no número de páginas
  const charsPerPage = Math.ceil(text.length / safePages)
  let currentPos = 0
  let chapterNum = 1

  while (currentPos < text.length) {
    let endPos = currentPos + charsPerPage * 5 // Agrupar ~5 páginas por capítulo
    if (endPos > text.length) endPos = text.length

    // Tentar encontrar o fim de um parágrafo
    const nextBreak = text.indexOf('\n\n', endPos - 100)
    if (nextBreak !== -1 && nextBreak < endPos + 100) {
      endPos = nextBreak
    }

    const chapterText = text.substring(currentPos, endPos).trim()

    if (chapterText.length > 0) {
      chapters.push({
        title: `Capítulo ${chapterNum}`,
        data: `<p>${chapterText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
      })
      chapterNum++
    }

    currentPos = endPos
  }

  // Se não conseguiu dividir em capítulos, criar um único
  if (chapters.length === 0) {
    chapters.push({
      title: 'Conteúdo',
      data: `<p>${text.replace(/\n/g, '</p><p>')}</p>`
    })
  }

  return chapters
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
