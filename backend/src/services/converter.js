import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'
import { translateTextWithProgress, detectLanguage } from './translator.js'

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
    const translateToPt = options.translate === true
    const progress = typeof options.progress === 'function' ? options.progress : null
    console.log('🔄 Iniciando conversão...')
    console.log('⚡ fastMode:', fastMode)
    console.log('🖼️ keepImages:', keepImages)
    console.log('🌐 translate:', translateToPt)
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
    let text = pdfData.text.length > MAX_CHARS
      ? pdfData.text.slice(0, MAX_CHARS)
      : pdfData.text

    // Traduzir texto se solicitado
    if (translateToPt) {
      console.time('translation')
      progress?.({ type: 'phase', phase: 'translating' })
      progress?.({ type: 'log', message: 'Detectando idioma...' })

      const detectedLang = await detectLanguage(text)
      console.log('🌍 Idioma detectado:', detectedLang)
      progress?.({ type: 'log', message: `Idioma detectado: ${detectedLang}` })

      if (detectedLang !== 'pt' && detectedLang !== 'unknown') {
        progress?.({ type: 'log', message: 'Traduzindo para português...' })
        text = await translateTextWithProgress(text, progress)
        console.log('✅ Texto traduzido para pt-br')
        progress?.({ type: 'log', message: 'Tradução concluída!' })
      } else {
        console.log('ℹ️ Texto já está em português, pulando tradução')
        progress?.({ type: 'log', message: 'Texto já está em português' })
      }
      console.timeEnd('translation')
    }

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
  // Lista imagens com informações DETALHADAS: página, X, Y, largura, altura
  const { stdout: listOutput } = await execFileAsync('pdfimages', ['-list', pdfPath])

  // Parse da saída para obter: página, posição X, Y, largura, altura
  const lines = listOutput.split('\n').slice(2) // Pula cabeçalho
  const imageMetadata = []

  for (const line of lines) {
    if (line.trim()) {
      const parts = line.trim().split(/\s+/)
      // Formato: num page x-pos y-pos width height ...
      if (parts.length >= 6) {
        const pageNum = parseInt(parts[1])
        const xPos = parseFloat(parts[2])
        const yPos = parseFloat(parts[3])
        const width = parseFloat(parts[4])
        const height = parseFloat(parts[5])

        if (!isNaN(pageNum) && !isNaN(yPos)) {
          imageMetadata.push({
            page: pageNum,
            x: xPos,
            y: yPos,
            width: width,
            height: height
          })
        }
      }
    }
  }

  // Extrai as imagens do PDF
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
  const baseOut = path.join(tempDir, 'img')
  await execFileAsync('pdfimages', ['-png', pdfPath, baseOut])

  // Coletar arquivos e associar com metadados de página
  const files = await fs.promises.readdir(tempDir)
  const imagePaths = files
    .filter((f) => f.startsWith('img') && f.endsWith('.png'))
    .sort()

  const images = imagePaths.map((file, idx) => ({
    path: path.join(tempDir, file),
    page: imageMetadata[idx]?.page || 1,
    x: imageMetadata[idx]?.x || 0,
    y: imageMetadata[idx]?.y || 0,
    width: imageMetadata[idx]?.width || 0,
    height: imageMetadata[idx]?.height || 0
  }))

  console.log('📊 Imagens com posições:', images.map(img => `Pág ${img.page}, Y: ${img.y.toFixed(0)}`).join(' | '))
  return { assetsDir: tempDir, images }
}

function createChaptersWithImagesInOrder(text, images, totalPages, fastMode) {
  if (!text || totalPages === 0) {
    return [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
  }

  // Função para processar uma página dividindo texto baseado nas posições reais das imagens
  function processPageContent(pageNum, pageText, pageImages) {
    if (pageImages.length === 0) {
      // Sem imagens: apenas texto
      return `<p>${pageText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    }

    // Ordena imagens por posição Y (de cima para baixo)
    const sortedImages = [...pageImages].sort((a, b) => a.y - b.y)

    if (pageText.trim().length === 0) {
      // Só imagens, sem texto
      console.log(`📄 Pág ${pageNum}: ${sortedImages.length} imagens SEM texto`)
      return sortedImages.map(img =>
        `<div style="text-align:center;page-break-inside:avoid;margin:10px 0;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="max-width:100%;height:auto;" /></div>`
      ).join('\n')
    }

    const PAGE_HEIGHT = 792

    // Calcula quanto % da página cada imagem ocupa
    const imagePositions = sortedImages.map(img => ({
      img,
      positionPercent: img.y / PAGE_HEIGHT
    }))

    console.log(`📄 Pág ${pageNum}: ${sortedImages.length} imgs [${imagePositions.map(p => `${(p.positionPercent * 100).toFixed(0)}%`).join(', ')}]`)

    // Divide o texto em parágrafos
    const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim())
    if (paragraphs.length === 0) {
      return sortedImages.map(img =>
        `<div style="text-align:center;page-break-inside:avoid;margin:10px 0;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="max-width:100%;height:auto;" /></div>`
      ).join('\n')
    }

    // Cria estrutura unificada: para cada parágrafo, estima sua posição
    // Para cada imagem, usa sua posição real
    const elements = []

    // Adiciona imagens com suas posições reais (em %)
    for (const imgPos of imagePositions) {
      elements.push({
        type: 'image',
        position: imgPos.positionPercent,
        content: `<div style="text-align:center;page-break-inside:avoid;margin:10px 0;"><img src="${imgPos.img.path}" alt="Imagem página ${pageNum}" style="max-width:100%;height:auto;" /></div>`
      })
    }

    // Adiciona parágrafos distribuídos uniformemente
    for (let i = 0; i < paragraphs.length; i++) {
      const position = (i + 0.5) / paragraphs.length // Posição relativa (0 a 1)
      elements.push({
        type: 'text',
        position: position,
        content: `<p>${paragraphs[i].replace(/\n/g, '<br>')}</p>`
      })
    }

    // Ordena TUDO por posição
    elements.sort((a, b) => a.position - b.position)

    // Debug: mostra ordem final
    const preview = elements.slice(0, 15).map(e =>
      e.type === 'image' ? `IMG@${(e.position * 100).toFixed(0)}%` : `txt@${(e.position * 100).toFixed(0)}%`
    ).join(' ')
    console.log(`  ↳ Ordem: ${preview}${elements.length > 15 ? '...' : ''}`)

    // Retorna elementos na ordem correta
    return elements.map(el => el.content).join('\n')
  }

  if (fastMode) {
    // Modo rápido: um capítulo único
    const charsPerPage = Math.ceil(text.length / totalPages)
    let content = ''
    let textPos = 0

    // Agrupa imagens por página
    const imagesByPage = new Map()
    for (const img of images) {
      if (!imagesByPage.has(img.page)) {
        imagesByPage.set(img.page, [])
      }
      imagesByPage.get(img.page).push(img)
    }

    for (let page = 1; page <= totalPages; page++) {
      const pageStart = textPos
      const pageEnd = Math.min(textPos + charsPerPage, text.length)
      const pageText = text.substring(pageStart, pageEnd)
      const pageImages = imagesByPage.get(page) || []

      content += processPageContent(page, pageText, pageImages)
      textPos = pageEnd
    }

    return [{ title: 'Conteúdo', data: content }]
  } else {
    // Modo normal: múltiplos capítulos
    const charsPerPage = Math.ceil(text.length / totalPages)
    const pagesPerChapter = 10
    const chapters = []
    let textPos = 0

    // Agrupa imagens por página
    const imagesByPage = new Map()
    for (const img of images) {
      if (!imagesByPage.has(img.page)) {
        imagesByPage.set(img.page, [])
      }
      imagesByPage.get(img.page).push(img)
    }

    for (let chapterStart = 1; chapterStart <= totalPages; chapterStart += pagesPerChapter) {
      const chapterEnd = Math.min(chapterStart + pagesPerChapter - 1, totalPages)
      let chapterContent = ''

      for (let page = chapterStart; page <= chapterEnd; page++) {
        const pageStart = textPos
        const pageEnd = Math.min(textPos + charsPerPage, text.length)
        const pageText = text.substring(pageStart, pageEnd)
        const pageImages = imagesByPage.get(page) || []

        chapterContent += processPageContent(page, pageText, pageImages)
        textPos = pageEnd
      }

      chapters.push({
        title: `Capítulo ${chapters.length + 1}`,
        data: chapterContent || '<p></p>'
      })
    }

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
