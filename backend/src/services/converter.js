import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'
import { translateTextWithProgress, detectLanguage } from './translator.js'
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
    let textPositionsByPage = new Map()
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
        // Extração adicional: posições de texto por página para validação de ordem
        try {
          const textPosResult = await extractTextPositionsWithPages(pdfPath)
          textPositionsByPage = textPosResult.textPositionsByPage
          console.log('📝 Posições de texto extraídas para', textPositionsByPage.size, 'páginas')
        } catch (txErr) {
          console.warn('⚠️ Falha ao extrair posições de texto:', txErr.message)
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
      chapters = createChaptersWithImagesInOrder(text, extractedImages, pdfData.numpages, true, textPositionsByPage)
      console.timeEnd('split-chapters')
    } else {
      progress?.({ type: 'phase', phase: 'processing' })
      chapters = await runWithTimeout(
        Promise.resolve().then(() => createChaptersWithImagesInOrder(text, extractedImages, pdfData.numpages, false, textPositionsByPage)),
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

function createChaptersWithImagesInOrder(text, images, totalPages, fastMode) {
  // Mantida para compatibilidade; versão estendida abaixo aceita textPositions
  return createChaptersWithImagesInOrderExtended(text, images, totalPages, fastMode, new Map())
}

function createChaptersWithImagesInOrderExtended(text, images, totalPages, fastMode, textPositionsByPage) {
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
    const textPositions = textPositionsByPage.get(pageNum) || []
    const hasText = textPositions.length > 0 || pageText.trim().length > 0
    const highestImageY = sortedImages.length ? sortedImages[0].y : null
    const lowestImageY = sortedImages.length ? sortedImages[sortedImages.length - 1].y : null
    const hasTextBeforeImage = hasText && textPositions.some(y => y < (highestImageY ?? Number.MAX_SAFE_INTEGER))
    const hasTextAfterImage = hasText && textPositions.some(y => y > (lowestImageY ?? -1))

    // Registra diagnóstico para posicionamento
    console.log(`📄 Pág ${pageNum}: imagens=${sortedImages.length}, textoAntes=${hasTextBeforeImage}, textoDepois=${hasTextAfterImage}`)

    // Regra solicitada: páginas com imagens devem exibir APENAS as imagens
    return sortedImages.map(img =>
      `<div style="text-align:center;page-break-inside:avoid;margin:12px 0;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="max-width:100%;height:auto;" /></div>`
    ).join('\n')

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
