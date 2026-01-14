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
    const progress = typeof options.progress === 'function' ? options.progress : null
    console.log('🔄 Iniciando conversão...')
    console.log('⚡ fastMode:', fastMode)
    console.log('🖼️ keepImages:', keepImages)
    console.time('pdf-total')
    progress?.({ type: 'log', message: 'Iniciando conversão' })

    // Ler o PDF
    console.time('pdf-read')
    const dataBuffer = await fs.promises.readFile(pdfPath)
    progress?.({ type: 'log', message: 'PDF carregado em memória' })
    console.timeEnd('pdf-read')

    console.time('pdf-parse')
    const pdfData = await runWithTimeout(pdfParse(dataBuffer), 30000, 'pdf-parse')
    progress?.({ type: 'log', message: `PDF parse concluído: ${dataBuffer.length} bytes` })
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

    // Extrair imagens do PDF (opcional) com informação de página
    let assetsDir = null
    let extractedImages = []
    if (keepImages) {
      console.time('pdf-images')
      progress?.({ type: 'phase', phase: 'extracting' })
      try {
        const imagesResult = await extractImagesWithPages(pdfPath)
        assetsDir = imagesResult.assetsDir
        extractedImages = imagesResult.images
        console.log('🖼️ Imagens extraídas:', extractedImages.length)
        progress?.({ type: 'log', message: `Imagens extraídas: ${extractedImages.length}` })
        if (!coverPath && extractedImages.length > 0) {
          coverPath = extractedImages[0].path
          console.log('📔 Capa definida pela primeira imagem extraída')
          progress?.({ type: 'log', message: 'Capa definida pela primeira imagem' })
        }
      } catch (err) {
        console.error('⚠️ Falha ao extrair imagens:', err.message)
        progress?.({ type: 'log', message: `Falha ao extrair imagens: ${err.message}` })
      }
      console.timeEnd('pdf-images')
    }

    // Criar capítulos com texto e imagens na ordem exata do PDF
    console.time('split-chapters')
    let chapters
    if (fastMode) {
      // Modo rápido: um capítulo único com imagens inseridas em ordem
      progress?.({ type: 'phase', phase: 'processing' })
      chapters = createChaptersWithImagesInOrder(text, extractedImages, pdfData.numpages, true)
      console.timeEnd('split-chapters')
    } else {
      progress?.({ type: 'phase', phase: 'processing' })
      chapters = await runWithTimeout(
        Promise.resolve().then(() => createChaptersWithImagesInOrder(text, extractedImages, pdfData.numpages, false)),
        5000,
        'split-chapters'
      )
      console.timeEnd('split-chapters')
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
    progress?.({ type: 'phase', phase: 'generating' })
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
    progress?.({ type: 'phase', phase: 'complete' })
    progress?.({ type: 'log', message: 'EPUB gerado com sucesso' })

    return { epubPath, assetsDir }

  } catch (error) {
    console.error('Erro na conversão:', error)
    throw new Error(`Falha ao converter PDF para EPUB: ${error.message}`)
  }
}

async function extractImagesWithPages(pdfPath) {
  // Primeiro, lista imagens com informações de página
  const { stdout: listOutput } = await execFileAsync('pdfimages', ['-list', pdfPath])

  // Parse da saída para obter páginas das imagens
  const lines = listOutput.split('\n').slice(2) // Pula cabeçalho
  const imagePages = []

  for (const line of lines) {
    if (line.trim()) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        const pageNum = parseInt(parts[1])
        if (!isNaN(pageNum)) {
          imagePages.push(pageNum)
        }
      }
    }
  }

  // Extrai as imagens
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
  const baseOut = path.join(tempDir, 'img')
  await execFileAsync('pdfimages', ['-png', pdfPath, baseOut])

  // Coletar arquivos gerados e associar com páginas
  const files = await fs.promises.readdir(tempDir)
  const imagePaths = files
    .filter((f) => f.startsWith('img'))
    .sort()

  const images = imagePaths.map((file, idx) => ({
    path: path.join(tempDir, file),
    page: imagePages[idx] || 1
  }))

  return { assetsDir: tempDir, images }
}

function createChaptersWithImagesInOrder(text, images, totalPages, fastMode) {
  if (!text || totalPages === 0) {
    return [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
  }

  // Estima caracteres por página
  const charsPerPage = Math.ceil(text.length / totalPages)

  // Cria um mapa de página -> imagens
  const imagesByPage = new Map()
  for (const img of images) {
    if (!imagesByPage.has(img.page)) {
      imagesByPage.set(img.page, [])
    }
    imagesByPage.get(img.page).push(img)
  }

  if (fastMode) {
    // Modo rápido: um capítulo único com todas as imagens inseridas na ordem das páginas
    let content = ''
    let textPos = 0

    for (let page = 1; page <= totalPages; page++) {
      // Adiciona texto desta página
      const pageStart = textPos
      const pageEnd = Math.min(textPos + charsPerPage, text.length)
      const pageText = text.substring(pageStart, pageEnd)

      if (pageText.trim()) {
        content += `<p>${pageText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>\n`
      }

      // Adiciona imagens desta página (se houver)
      if (imagesByPage.has(page)) {
        for (const img of imagesByPage.get(page)) {
          content += `<div style="text-align:center;margin:20px 0;page-break-inside:avoid;"><img src="${img.path}" alt="Imagem página ${page}" style="max-width:100%;height:auto;" /></div>\n`
        }
      }

      textPos = pageEnd
    }

    return [{ title: 'Conteúdo', data: content }]
  } else {
    // Modo normal: múltiplos capítulos (agrupa ~10 páginas por capítulo)
    const pagesPerChapter = 10
    const chapters = []
    let textPos = 0

    for (let chapterStart = 1; chapterStart <= totalPages; chapterStart += pagesPerChapter) {
      const chapterEnd = Math.min(chapterStart + pagesPerChapter - 1, totalPages)
      let chapterContent = ''

      // Processa cada página do capítulo na ordem
      for (let page = chapterStart; page <= chapterEnd; page++) {
        const pageStart = textPos
        const pageEnd = Math.min(textPos + charsPerPage, text.length)
        const pageText = text.substring(pageStart, pageEnd)

        if (pageText.trim()) {
          chapterContent += `<p>${pageText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>\n`
        }

        if (imagesByPage.has(page)) {
          for (const img of imagesByPage.get(page)) {
            chapterContent += `<div style="text-align:center;margin:20px 0;page-break-inside:avoid;"><img src="${img.path}" alt="Imagem página ${page}" style="max-width:100%;height:auto;" /></div>\n`
          }
        }

        textPos = pageEnd
      }

      chapters.push({
        title: `Capítulo ${chapters.length + 1}`,
        data: chapterContent || '<p></p>'
      })
    }

    // Caso não tenha sido possível compor capítulos, retorna conteúdo único
    if (chapters.length === 0) {
      return [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
    }

    return chapters
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
