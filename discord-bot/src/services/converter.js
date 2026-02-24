import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'
import { translateTextWithProgress, detectLanguage } from './translator.js'
import { renderPdfPagesToSvg } from './pdfRenderer.js'
import { analyzePdfLayout, reconstructChapters } from './layoutAnalyzer.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'

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

    console.log('🔄 Iniciando conversão com modo Reflow EPUB...')
    console.log('⚡ fastMode:', fastMode)
    console.log('🌐 translate:', translateToPt)
    console.time('pdf-total')
    progress?.({ type: 'log', message: 'Iniciando conversão' })

    // Lê metadados básicos do PDF
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
      console.warn('⚠️ Pouco ou nenhum texto extraído - PDF pode ser digitalizado')
    }

    // Extrair título do nome do arquivo
    const title = originalFilename.replace('.pdf', '') || 'Documento Convertido'

    let text = pdfData.text

    // Traduzir texto se solicitado (para metadados e busca)
    if (translateToPt && text && text.trim().length > 0) {
      console.time('translation')
      progress?.({ type: 'phase', phase: 'translating' })
      progress?.({ type: 'log', message: 'Detectando idioma...' })

      const detectedLang = await detectLanguage(text)
      console.log('🌍 Idioma detectado:', detectedLang)
      progress?.({ type: 'log', message: `Idioma detectado: ${detectedLang}` })

      if (detectedLang !== 'pt' && detectedLang !== 'unknown') {
        progress?.({ type: 'log', message: 'Traduzindo texto extraído...' })
        text = await translateTextWithProgress(text.slice(0, 100000), progress) // Limita para não travar
        console.log('✅ Texto traduzido para pt-br')
        progress?.({ type: 'log', message: 'Tradução concluída!' })
      } else {
        console.log('ℹ️ Texto já está em português, pulando tradução')
        progress?.({ type: 'log', message: 'Texto já está em português' })
      }
      console.timeEnd('translation')
    }

    // MODO REFLOW COM RECONSTRUÇÃO INTELIGENTE DE LAYOUT
    console.log('📐 Usando modo Reflow com reconstrução inteligente de layout')
    progress?.({ type: 'log', message: 'Analisando estrutura do PDF...' })

    return await convertPdfToEpubReflowEnhanced(pdfPath, epubPath, originalFilename, {
      ...options,
      text,
      pdfData,
      title,
      coverPath,
      progress,
      dataBuffer
    })

  } catch (error) {
    console.error('Erro na conversão:', error)
    throw new Error(`Falha ao converter PDF para EPUB: ${error.message}`)
  }
}

// ========== MODO REFLOW COM RECONSTRUÇÃO INTELIGENTE ==========

async function convertPdfToEpubReflowEnhanced(pdfPath, epubPath, originalFilename, options) {
  const { fastMode, text, pdfData, title, coverPath, progress, translateToPt, dataBuffer } = options

  console.time('layout-analysis')
  progress?.({ type: 'phase', phase: 'extracting' })
  progress?.({ type: 'log', message: 'Analisando estrutura de layout do PDF...' })

  // Analisa layout do PDF
  const layoutAnalysis = await analyzePdfLayout(dataBuffer)
  console.log(`📐 Layout analisado: ${layoutAnalysis.totalPages} páginas`)
  progress?.({ type: 'log', message: `${layoutAnalysis.totalPages} páginas analisadas` })
  console.timeEnd('layout-analysis')

  // Reconstrói capítulos a partir da análise
  console.time('reconstruct-chapters')
  progress?.({ type: 'phase', phase: 'processing' })
  progress?.({ type: 'log', message: 'Reconstruindo estrutura de capítulos...' })

  let chapters = reconstructChapters(layoutAnalysis.pages, {
    preserveFormatting: true,
    addSeparators: true,
    includeHeaderFooter: false
  })
  console.log(`📚 ${chapters.length} capítulos reconstruídos`)
  progress?.({ type: 'log', message: `${chapters.length} seções identificadas` })
  console.timeEnd('reconstruct-chapters')

  // Traduz conteúdo dos capítulos se solicitado
  if (translateToPt && text && text.trim().length > 0) {
    console.time('translation')
    progress?.({ type: 'log', message: 'Traduzindo conteúdo preservando estrutura...' })

    const detectedLang = await detectLanguage(text)
    console.log('🌍 Idioma detectado:', detectedLang)

    if (detectedLang !== 'pt' && detectedLang !== 'unknown') {
      progress?.({ type: 'log', message: `Traduzindo de ${detectedLang} para pt-br...` })

      // Traduz cada capítulo mantendo HTML
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i]
        progress?.({ type: 'log', message: `Traduzindo seção ${i + 1}/${chapters.length}...` })

        // Remove tags HTML temporariamente
        const textOnly = chapter.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

        if (textOnly.length > 100) {
          const translated = await translateTextWithProgress(textOnly, progress)
          // Reconstrói com estrutura HTML básica
          chapter.data = `<div class="chapter">${translated.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}</div>`
        }
      }
      console.log('✅ Capítulos traduzidos')
      progress?.({ type: 'log', message: 'Tradução concluída!' })
    } else {
      console.log('ℹ️ Texto já está em português')
    }
    console.timeEnd('translation')
  }

  // Gera EPUB com estrutura reconstruída
  const epubOptions = {
    title,
    author: 'Autor Desconhecido',
    publisher: 'Conversor PDF-EPUB (Reflow Inteligente)',
    cover: coverPath || '',
    content: chapters,
    lang: 'pt',
    tocTitle: 'Índice',
    appendChapterTitles: true,
    version: 3,
    css: `
      body { font-family: serif; line-height: 1.6; margin: 1em; }
      h1 { font-size: 1.8em; margin-top: 1em; margin-bottom: 0.5em; page-break-before: always; }
      h2 { font-size: 1.5em; margin-top: 0.8em; margin-bottom: 0.4em; }
      h3 { font-size: 1.2em; margin-top: 0.6em; margin-bottom: 0.3em; }
      p { text-align: justify; margin: 0.5em 0; }
      .caption { font-style: italic; font-size: 0.9em; text-align: center; }
      hr { border: 0; border-top: 1px solid #ccc; margin: 1em 0; }
    `
  }

  console.log('📚 Gerando EPUB Reflow otimizado...')
  progress?.({ type: 'phase', phase: 'generating' })
  console.time('epub-gen')

  try {
    await runWithTimeout(
      new Epub(epubOptions, epubPath).promise,
      fastMode ? 15000 : 30000,
      'epub-gen'
    )
  } catch (err) {
    console.error('⚠️ Erro ao gerar EPUB, tentando modo simplificado:', err.message)
    const fallbackOptions = {
      title,
      author: 'Autor Desconhecido',
      cover: coverPath || '',
      content: chapters.slice(0, 1),
      lang: 'pt'
    }
    await runWithTimeout(
      new Epub(fallbackOptions, epubPath).promise,
      15000,
      'epub-gen-fallback'
    )
  }

  console.timeEnd('epub-gen')
  console.log('✨ EPUB Reflow com layout inteligente gerado!')
  progress?.({ type: 'phase', phase: 'complete' })

  return { epubPath }
}

// ========== MODO LEGADO (FALLBACK) ==========

async function convertPdfToEpubLegacy(pdfPath, epubPath, originalFilename, options) {
  const { fastMode, keepImages, text, pdfData, title, coverPath, progress } = options

  let assetsDir = null
  let extractedImages = []
  let textPositionsByPage = new Map()

  if (keepImages) {
    console.time('pdf-images')
    progress?.({ type: 'phase', phase: 'extracting' })
    try {
      const imagesResult = await extractImagesWithPages(pdfPath)
      assetsDir = imagesResult.assetsDir
      extractedImages = imagesResult.images

      try {
        const textPosResult = await extractTextPositionsWithPages(pdfPath)
        textPositionsByPage = textPosResult.textPositionsByPage
      } catch (txErr) {
        console.warn('⚠️ Falha ao extrair posições de texto:', txErr.message)
      }
    } catch (err) {
      console.error('⚠️ Falha ao extrair imagens:', err.message)
    }
    console.timeEnd('pdf-images')
  }

  console.time('split-chapters')
  let chapters
  if (fastMode) {
    chapters = createChaptersWithImagesInOrderExtended(text, extractedImages, pdfData.numpages, true, textPositionsByPage)
  } else {
    chapters = await runWithTimeout(
      Promise.resolve().then(() => createChaptersWithImagesInOrderExtended(text, extractedImages, pdfData.numpages, false, textPositionsByPage)),
      5000,
      'split-chapters'
    )
  }
  console.timeEnd('split-chapters')

  const epubOptions = {
    title,
    author: 'Autor Desconhecido',
    publisher: 'Conversor PDF-EPUB (Reflow)',
    cover: coverPath || '',
    content: chapters,
    lang: 'pt',
    version: 3
  }

  console.time('epub-gen')
  try {
    await runWithTimeout(new Epub(epubOptions, epubPath).promise, fastMode ? 15000 : 30000, 'epub-gen')
  } catch (err) {
    const fallbackOptions = {
      title,
      author: 'Autor Desconhecido',
      cover: coverPath || '',
      content: [{ title: 'Conteúdo', data: `<pre>${escapeHtml(text)}</pre>` }],
      lang: 'pt'
    }
    await runWithTimeout(new Epub(fallbackOptions, epubPath).promise, 15000, 'epub-gen-fallback')
  }
  console.timeEnd('epub-gen')

  return { epubPath, assetsDir }
}

async function extractImagesWithPages(pdfPath) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
  const images = []

  try {
    // Lê o PDF
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0 // Reduz logs do pdfjs
    })
    const pdfDocument = await loadingTask.promise

    console.log(`📖 PDF carregado: ${pdfDocument.numPages} páginas`)

    // Itera por todas as páginas
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })

      // Obtém operadores da página para encontrar imagens e suas posições
      const ops = await page.getOperatorList()

      // Rastreia transformações para calcular posições reais
      const transformStack = [[1, 0, 0, 1, 0, 0]] // Matriz identidade inicial
      let imageIndex = 0

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        const args = ops.argsArray[i]

        // Rastreia transformações de coordenadas
        if (fn === pdfjsLib.OPS.save) {
          transformStack.push([...transformStack[transformStack.length - 1]])
        } else if (fn === pdfjsLib.OPS.restore) {
          if (transformStack.length > 1) transformStack.pop()
        } else if (fn === pdfjsLib.OPS.transform) {
          const current = transformStack[transformStack.length - 1]
          const [a, b, c, d, e, f] = args
          // Multiplica matrizes
          transformStack[transformStack.length - 1] = [
            a * current[0] + b * current[2],
            a * current[1] + b * current[3],
            c * current[0] + d * current[2],
            c * current[1] + d * current[3],
            e * current[0] + f * current[2] + current[4],
            e * current[1] + f * current[3] + current[5]
          ]
        }

        // Detecta operações de imagem
        if (fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintInlineImageXObject ||
          fn === pdfjsLib.OPS.paintImageMaskXObject) {

          const imageName = args[0]

          try {
            // Obtém a imagem
            const image = await page.objs.get(imageName)

            if (!image || !image.width || !image.height) {
              continue
            }

            // Filtra imagens muito pequenas (provavelmente ícones ou artefatos)
            if (image.width < 32 || image.height < 32) {
              console.log(`⏭️ Ignorando imagem pequena ${imageName}: ${image.width}x${image.height}`)
              continue
            }

            // Calcula posição real usando a transformação atual
            const currentTransform = transformStack[transformStack.length - 1]
            const xPos = currentTransform[4]
            const yPos = viewport.height - currentTransform[5] // Inverte Y (PDF usa coordenadas de baixo para cima)

            // Escala para melhor qualidade (2x)
            const scale = 2.0
            const scaledWidth = Math.round(image.width * scale)
            const scaledHeight = Math.round(image.height * scale)

            // Cria canvas para renderizar a imagem em alta qualidade
            const canvas = createCanvas(scaledWidth, scaledHeight)
            const ctx = canvas.getContext('2d', {
              alpha: true,
              pixelFormat: 'RGBA32'
            })

            // Cria ImageData a partir dos dados da imagem
            if (image.data) {
              const tempCanvas = createCanvas(image.width, image.height)
              const tempCtx = tempCanvas.getContext('2d')
              const imageData = tempCtx.createImageData(image.width, image.height)

              // Copia os dados da imagem com base no tipo
              if (image.kind === 1) { // GRAYSCALE_1BPP
                for (let j = 0; j < image.data.length; j++) {
                  const idx = j * 4
                  imageData.data[idx] = image.data[j]     // R
                  imageData.data[idx + 1] = image.data[j] // G
                  imageData.data[idx + 2] = image.data[j] // B
                  imageData.data[idx + 3] = 255           // A
                }
              } else if (image.kind === 2) { // RGB_24BPP
                for (let j = 0, k = 0; j < image.data.length; j += 3, k += 4) {
                  imageData.data[k] = image.data[j]       // R
                  imageData.data[k + 1] = image.data[j + 1] // G
                  imageData.data[k + 2] = image.data[j + 2] // B
                  imageData.data[k + 3] = 255             // A
                }
              } else if (image.kind === 3) { // RGBA_32BPP
                imageData.data.set(image.data)
              } else { // Fallback genérico
                const bytesPerPixel = image.data.length / (image.width * image.height)
                for (let j = 0, k = 0; j < image.data.length; j += bytesPerPixel, k += 4) {
                  imageData.data[k] = image.data[j]         // R
                  imageData.data[k + 1] = image.data[j + 1] || 0 // G
                  imageData.data[k + 2] = image.data[j + 2] || 0 // B
                  imageData.data[k + 3] = bytesPerPixel === 4 ? image.data[j + 3] : 255 // A
                }
              }

              tempCtx.putImageData(imageData, 0, 0)

              // Redimensiona com qualidade (usando interpolação bicúbica do canvas)
              ctx.imageSmoothingEnabled = true
              ctx.imageSmoothingQuality = 'high'
              ctx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight)
            }

            // Salva a imagem como PNG de alta qualidade
            const imagePath = path.join(tempDir, `img-p${String(pageNum).padStart(4, '0')}-${String(imageIndex).padStart(3, '0')}.png`)
            const buffer = canvas.toBuffer('image/png', {
              compressionLevel: 6,  // Balanceio entre qualidade e tamanho
              filters: canvas.PNG_FILTER_NONE
            })
            await fs.promises.writeFile(imagePath, buffer)

            images.push({
              path: imagePath,
              page: pageNum,
              x: xPos,
              y: yPos,
              width: scaledWidth,
              height: scaledHeight,
              originalWidth: image.width,
              originalHeight: image.height
            })

            console.log(`✅ Pág ${pageNum} - Imagem ${imageIndex}: ${image.width}x${image.height} → ${scaledWidth}x${scaledHeight} @ Y:${yPos.toFixed(0)}`)
            imageIndex++
          } catch (imgError) {
            console.warn(`⚠️ Erro ao extrair imagem ${imageName} da página ${pageNum}:`, imgError.message)
          }
        }
      }
    }

    console.log(`📊 Total de imagens extraídas com PDF.js: ${images.length}`)
    if (images.length > 0) {
      console.log('📍 Posições:', images.map(img => `Pág ${img.page} Y:${img.y.toFixed(0)}`).join(' | '))
    }
    return { assetsDir: tempDir, images }
  } catch (error) {
    console.error('❌ Erro ao extrair imagens com PDF.js:', error)
    throw error
  }
}

function createChaptersWithImagesInOrderExtended(text, images, totalPages, fastMode, textPositionsByPage) {
  if (!text || totalPages === 0) {
    return [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
  }

  // Cria mapa de imagens por página
  const imagesByPage = new Map()
  for (const img of images) {
    if (!imagesByPage.has(img.page)) {
      imagesByPage.set(img.page, [])
    }
    imagesByPage.get(img.page).push(img)
  }

  // Função para processar uma página, mantendo ordem exata de texto + imagens por posição Y
  function processPageContent(pageNum, pageText, pageImages) {
    if (pageImages.length === 0) {
      // Sem imagens: apenas texto
      return `<p>${pageText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    }

    // Ordena imagens por posição Y (de cima para baixo)
    const sortedImages = [...pageImages].sort((a, b) => a.y - b.y)
    const textPositions = textPositionsByPage.get(pageNum) || []
    const hasTextPositions = textPositions.length > 0

    // Agrupa imagens consecutivas (gap menor que 100 pontos)
    const imageGroups = []
    let currentGroup = [sortedImages[0]]

    for (let i = 1; i < sortedImages.length; i++) {
      const gap = sortedImages[i].y - sortedImages[i - 1].y
      if (gap < 100) {
        // Imagens muito próximas: pertencem ao mesmo grupo
        currentGroup.push(sortedImages[i])
      } else {
        // Grande gap: nova imagem/grupo isolado
        imageGroups.push({ type: 'imageGroup', images: currentGroup, y: currentGroup[0].y })
        currentGroup = [sortedImages[i]]
      }
    }
    imageGroups.push({ type: 'imageGroup', images: currentGroup, y: currentGroup[0].y })

    // Cria lista de elementos com posição Y
    const elements = []

    // Adiciona grupos de imagens (mantém imagens consecutivas juntas)
    for (const group of imageGroups) {
      // Cria um grupo de imagens como um único elemento
      const imagesHtml = group.images.map(img =>
        `<div style="text-align:center;page-break-inside:avoid;margin:8px 0;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="max-width:100%;height:auto;" /></div>`
      ).join('\n')

      elements.push({
        type: 'imageGroup',
        y: group.y,
        content: `<div style="page-break-inside:avoid;">${imagesHtml}</div>`,
        groupImages: group.images
      })
    }

    // Divide o texto em parágrafos
    const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim())

    // Adiciona parágrafos com posição Y se disponível
    if (paragraphs.length > 0) {
      if (hasTextPositions && sortedImages.length > 0) {
        // Com posições de texto: analisa texto ANTES e DEPOIS de cada grupo de imagens
        for (let i = 0; i < paragraphs.length; i++) {
          const posIndex = Math.floor((i / Math.max(1, paragraphs.length - 1)) * (textPositions.length - 1))
          const textY = textPositions[Math.min(posIndex, textPositions.length - 1)]

          elements.push({
            type: 'text',
            y: textY,
            content: `<p>${paragraphs[i].replace(/\n/g, '<br>')}</p>`
          })
        }

        // Analisa e loga quais textos vêm antes/depois das imagens
        for (let gIdx = 0; gIdx < imageGroups.length; gIdx++) {
          const groupY = imageGroups[gIdx].y
          const textBefore = textPositions.filter(t => t < groupY)
          const textAfter = textPositions.filter(t => t > groupY)
          console.log(`  ↳ Grupo ${gIdx + 1} (Y:${groupY.toFixed(0)}): ${textBefore.length} textos ANTES, ${textAfter.length} textos DEPOIS`)
        }
      } else if (sortedImages.length > 0) {
        // Sem posições exatas: agrupa texto antes e depois dos grupos de imagens
        const firstImageY = imageGroups[0].y
        const lastImageY = imageGroups[imageGroups.length - 1].y

        // Metade dos parágrafos antes, metade depois
        const midPoint = Math.ceil(paragraphs.length / 2)
        for (let i = 0; i < paragraphs.length; i++) {
          const y = i < midPoint ? firstImageY - 100 - (midPoint - i) * 50 : lastImageY + 50 + (i - midPoint) * 50
          elements.push({
            type: 'text',
            y: y,
            content: `<p>${paragraphs[i].replace(/\n/g, '<br>')}</p>`
          })
        }
      } else {
        // Sem imagens: apenas texto
        for (const para of paragraphs) {
          elements.push({
            type: 'text',
            y: 0,
            content: `<p>${para.replace(/\n/g, '<br>')}</p>`
          })
        }
      }
    }

    // Ordena TODOS os elementos por posição Y
    elements.sort((a, b) => a.y - b.y)

    // Debug
    const preview = elements.slice(0, 10).map(e =>
      e.type === 'imageGroup' ? `[${e.content.split('src=').length - 1}IMGS]@${e.y.toFixed(0)}` : `txt@${e.y.toFixed(0)}`
    ).join(' → ')
    console.log(`📄 Pág ${pageNum}: ${elements.length} elementos (${imageGroups.length} grupos) | ${preview}${elements.length > 10 ? '...' : ''}`)

    // Retorna elementos na ordem exata do PDF
    return elements.map(el => el.content).join('\n')
  }

  if (fastMode) {
    // Modo rápido: um capítulo único com TODO o texto distribuído corretamente
    let content = ''
    let textPos = 0
    const charsPerPage = Math.ceil(text.length / totalPages)

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
    // Modo normal: múltiplos capítulos - SEM limite fixo de imagens
    // Estratégia: divide por páginas (10 páginas = 1 capítulo) e coloca TODO conteúdo
    const pagesPerChapter = 10
    const chapters = []
    let textPos = 0
    const charsPerPage = Math.ceil(text.length / totalPages)

    for (let chapterStart = 1; chapterStart <= totalPages; chapterStart += pagesPerChapter) {
      const chapterEnd = Math.min(chapterStart + pagesPerChapter - 1, totalPages)
      let chapterContent = ''
      let chapterImages = []

      // Processa todas as páginas do capítulo
      for (let page = chapterStart; page <= chapterEnd; page++) {
        const pageStart = textPos
        const pageEnd = Math.min(textPos + charsPerPage, text.length)
        const pageText = text.substring(pageStart, pageEnd)
        const pageImages = imagesByPage.get(page) || []

        chapterContent += processPageContent(page, pageText, pageImages)
        chapterImages.push(...pageImages)
        textPos = pageEnd
      }

      chapters.push({
        title: `Capítulo ${chapters.length + 1}`,
        data: chapterContent || '<p></p>'
      })

      console.log(`📖 Capítulo ${chapters.length}: páginas ${chapterStart}-${chapterEnd}, ${chapterImages.length} imagens, ${chapterContent.length} caracteres`)
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

// Extrai posições Y do texto por página para validar se há texto antes/depois das imagens
async function extractTextPositionsWithPages(pdfPath) {
  const textPositionsByPage = new Map()
  try {
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0
    })
    const pdfDocument = await loadingTask.promise

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      const textContent = await page.getTextContent()
      const positions = []

      for (const item of textContent.items) {
        // item.transform: [a, b, c, d, e, f]; e,f contém posição
        const e = item.transform[4]
        const f = item.transform[5]
        const y = viewport.height - f // Inverte Y para topo
        // Filtra artefatos muito pequenos
        if (item.str && item.str.trim().length > 0) {
          positions.push(y)
        }
      }

      positions.sort((a, b) => a - b)
      textPositionsByPage.set(pageNum, positions)
    }

    return { textPositionsByPage }
  } catch (error) {
    console.error('❌ Erro ao extrair posições de texto com PDF.js:', error)
    throw error
  }
}
