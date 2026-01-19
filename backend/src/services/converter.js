import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'
import { translateTextWithProgress, detectLanguage } from './translator.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

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
  console.log('🔍 Extraindo imagens com PDF.js...')

  try {
    // Carrega o PDF com PDF.js
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      disableFontFace: true,
      standardFontDataUrl: null
    })

    const pdfDocument = await loadingTask.promise
    const numPages = pdfDocument.numPages
    console.log(`📄 Processando ${numPages} páginas para extrair imagens...`)

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
    const images = []
    let imageCounter = 0

    // Processa cada página - tenta extrair imagens diretamente ou renderiza se necessário
    let pagesWithoutXObjects = 0
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const pageWidth = viewport.width
        const pageHeight = viewport.height

        try {
          // Obtém recursos da página UMA VEZ antes do loop
          const commonObjs = page.commonObjs
          const objs = page.objs

          // Método 1: Tenta extrair via operadores (mais robusto)
          const ops = await page.getOperatorList()

          if (pageNum <= 3) {
            console.log(`🔍 Página ${pageNum}: ${ops.fnArray.length} operações encontradas`)
          }

          let imageOpsCount = 0
          for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i]
            const args = ops.argsArray[i]

            // OPS.paintImageXObject = 85 ou OPS.paintInlineImageXObject = 86
            if (fn === 85 || fn === 86) {
              imageOpsCount++
              if (pageNum <= 3) {
                console.log(`  🖼️ Operação de imagem encontrada: fn=${fn}, args=`, args)
              }

              try {
                const imgName = args[0]

                // Tenta obter imagem dos objetos da página
                let imgObj = null

                // Método 1: Via objs.get()
                if (objs && objs.has && objs.has(imgName)) {
                  imgObj = objs.get(imgName)
                  if (pageNum <= 3) console.log(`  ✓ Imagem obtida via objs.get()`)
                }

                // Método 2: Via commonObjs.get()
                if (!imgObj && commonObjs && commonObjs.has && commonObjs.has(imgName)) {
                  imgObj = commonObjs.get(imgName)
                  if (pageNum <= 3) console.log(`  ✓ Imagem obtida via commonObjs.get()`)
                }

                // Método 3: Aguarda o objeto ser carregado
                if (!imgObj && objs) {
                  try {
                    imgObj = await new Promise((resolve, reject) => {
                      const timeout = setTimeout(() => reject(new Error('timeout')), 1000)
                      objs.get(imgName, (obj) => {
                        clearTimeout(timeout)
                        resolve(obj)
                      })
                    })
                    if (pageNum <= 3) console.log(`  ✓ Imagem obtida via callback`)
                  } catch (e) {
                    if (pageNum <= 3) console.log(`  ⚠️ Timeout aguardando imagem`)
                  }
                }

                if (!imgObj) {
                  if (pageNum <= 3) console.log(`  ⚠️ Objeto de imagem não encontrado para ${imgName}`)
                  continue
                }

                if (pageNum <= 3) {
                  console.log(`  ✓ Objeto obtido:`, {
                    type: typeof imgObj,
                    hasData: !!imgObj?.data,
                    hasWidth: !!imgObj?.width,
                    hasHeight: !!imgObj?.height,
                    nodeName: imgObj?.nodeName || 'N/A'
                  })
                }

                // Extrai dados da imagem renderizada pelo PDF.js
                let imgData = null
                let width = imgObj?.width || 0
                let height = imgObj?.height || 0

                // Se é um canvas ou ImageData, extrai os pixels
                if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
                  // É um ImageData ou similar
                  imgData = imgObj.data
                  width = imgObj.width
                  height = imgObj.height

                  if (pageNum <= 3) {
                    console.log(`  ✓ Dados de ImageData: ${width}x${height}, ${imgData.length} bytes`)
                  }
                } else if (imgObj && imgObj.nodeName === 'CANVAS') {
                  // É um canvas
                  const ctx = imgObj.getContext('2d')
                  const imageData = ctx.getImageData(0, 0, imgObj.width, imgObj.height)
                  imgData = imageData.data
                  width = imgObj.width
                  height = imgObj.height

                  if (pageNum <= 3) {
                    console.log(`  ✓ Dados de Canvas: ${width}x${height}, ${imgData.length} bytes`)
                  }
                } else {
                  if (pageNum <= 3) console.log(`  ⚠️ Formato de objeto não reconhecido`)
                  continue
                }

                if (pageNum <= 3) {
                  console.log(`  📐 Dimensões: ${width}x${height}`)
                }

                // Valida dimensões
                if (!width || !height || width <= 0 || height <= 0 || width > 10000 || height > 10000) {
                  if (pageNum <= 3) console.log(`  ⚠️ Dimensões inválidas`)
                  continue
                }

                if (!imgData || imgData.length === 0) {
                  if (pageNum <= 3) console.log(`  ⚠️ imgData vazio ou nulo`)
                  continue
                }

                // ImageData do PDF.js já vem como RGBA (4 componentes)
                const components = 4

                // Converte para PNG
                const buffer = Buffer.isBuffer(imgData) ? imgData : Buffer.from(imgData)
                const imageBuffer = await convertToPNG(buffer, width, height, components, 'DeviceRGB')

                if (imageBuffer && imageBuffer.length > 0) {
                  const imgPath = path.join(tempDir, `img-${String(imageCounter).padStart(3, '0')}.png`)
                  await fs.promises.writeFile(imgPath, imageBuffer)

                  // Para posicionamento correto, precisamos da ordem no documento
                  // Usamos o índice da operação como aproximação da posição Y
                  const estimatedY = (i / ops.fnArray.length) * pageHeight

                  images.push({
                    path: imgPath,
                    page: pageNum,
                    x: 0,
                    y: estimatedY,
                    width: width,
                    height: height,
                    pageWidth: pageWidth,
                    pageHeight: pageHeight,
                    opIndex: i  // Índice da operação para ordenação precisa
                  })

                  imageCounter++
                  console.log(`✅ Página ${pageNum}: Imagem ${imgName} extraída (${width}x${height}) pos=${i}/${ops.fnArray.length}`)
                } else {
                  if (pageNum <= 3) console.log(`  ⚠️ Falha ao converter para PNG`)
                }
              } catch (err) {
                if (pageNum <= 3) console.log(`  ❌ Erro ao processar imagem:`, err.message)
                continue
              }
            }
          }

          if (pageNum <= 3) {
            console.log(`  📊 Total de operações de imagem na página ${pageNum}: ${imageOpsCount}`)
          }
        } catch (err) {
          console.log(`  ⚠️ Página ${pageNum}: Erro ao processar operadores:`, err.message)
          pagesWithoutXObjects++
        }
      } catch (err) {
        // Continua para próxima página
        continue
      }
    }

    pdfDocument.destroy()
    console.log(`📊 Total de imagens extraídas: ${imageCounter}`)
    console.log(`ℹ️ Análise: ${pagesWithoutXObjects}/${numPages} páginas sem XObjects`)
    return { assetsDir: tempDir, images }
  } catch (err) {
    console.error('❌ Erro na extração de imagens:', err.message)
    console.error('Stack:', err.stack)
    // Retorna resultado vazio em caso de erro crítico
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfimgs-'))
    return { assetsDir: tempDir, images: [] }
  }
}

// Função auxiliar para converter dados de imagem para PNG
async function convertToPNG(buffer, width, height, components, colorSpace) {
  try {
    const { PNG } = await import('pngjs')

    // Valida dimensões
    if (!width || !height || width <= 0 || height <= 0 || width > 10000 || height > 10000) {
      return null
    }

    // Cria PNG
    const png = new PNG({ width, height })

    // Preenche buffer PNG com dados da imagem
    const pixelCount = width * height
    const expectedSize = pixelCount * components

    // Se o buffer é menor que o esperado, preenche com zeros
    const fullBuffer = Buffer.alloc(expectedSize)
    if (buffer && buffer.length > 0) {
      buffer.copy(fullBuffer, 0, 0, Math.min(buffer.length, expectedSize))
    }

    for (let i = 0; i < pixelCount; i++) {
      const dstIdx = i * 4

      if (components === 1) { // Grayscale
        const val = fullBuffer[i] || 0
        png.data[dstIdx] = val
        png.data[dstIdx + 1] = val
        png.data[dstIdx + 2] = val
        png.data[dstIdx + 3] = 255
      } else if (components === 3) { // RGB
        const srcIdx = i * 3
        png.data[dstIdx] = fullBuffer[srcIdx] || 0
        png.data[dstIdx + 1] = fullBuffer[srcIdx + 1] || 0
        png.data[dstIdx + 2] = fullBuffer[srcIdx + 2] || 0
        png.data[dstIdx + 3] = 255
      } else if (components === 4) { // CMYK ou RGBA
        const srcIdx = i * 4
        const c = fullBuffer[srcIdx] || 0
        const m = fullBuffer[srcIdx + 1] || 0
        const y = fullBuffer[srcIdx + 2] || 0
        const k = fullBuffer[srcIdx + 3] || 0

        // Se parece ser CMYK (valores elevados), converte para RGB
        if (colorSpace === 'DeviceCMYK' || (Array.isArray(colorSpace) && colorSpace[0] === 'DeviceCMYK')) {
          // Conversão CMYK -> RGB
          const kPercent = k / 255
          const r = Math.round(255 * (1 - c / 255) * (1 - kPercent))
          const g = Math.round(255 * (1 - m / 255) * (1 - kPercent))
          const b = Math.round(255 * (1 - y / 255) * (1 - kPercent))

          png.data[dstIdx] = r
          png.data[dstIdx + 1] = g
          png.data[dstIdx + 2] = b
          png.data[dstIdx + 3] = 255
        } else {
          // Assume RGBA
          png.data[dstIdx] = c
          png.data[dstIdx + 1] = m
          png.data[dstIdx + 2] = y
          png.data[dstIdx + 3] = k || 255
        }
      } else {
        // Fallback: trata como RGB
        const srcIdx = i * Math.min(3, components)
        png.data[dstIdx] = fullBuffer[srcIdx] || 0
        png.data[dstIdx + 1] = fullBuffer[srcIdx + 1] || 0
        png.data[dstIdx + 2] = fullBuffer[srcIdx + 2] || 0
        png.data[dstIdx + 3] = 255
      }
    }

    return PNG.sync.write(png)
  } catch (err) {
    console.warn('⚠️ Falha ao converter para PNG:', err.message)
    return null
  }
}

function createChaptersWithImagesInOrder(text, images, totalPages, fastMode) {
  if (!text || text.trim().length === 0) {
    return [{ title: 'Conteúdo', data: '<p>Documento vazio</p>' }]
  }

  const processPageContent = (pageNum, pageText, pageImages) => {
    if (pageImages.length === 0) {
      // Apenas texto
      const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim())
      if (paragraphs.length === 0) return ''
      return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')
    }

    // Com imagens
    console.log(`📄 Pág ${pageNum}: ${pageImages.length} imagens`)

    // Ordena imagens por índice de operação (ordem no PDF) ou por posição Y
    const sortedImages = [...pageImages].sort((a, b) => {
      // Se tem índice de operação, usa ele (mais preciso)
      if (a.opIndex !== undefined && b.opIndex !== undefined) {
        return a.opIndex - b.opIndex
      }
      // Senão, usa posição Y
      return (a.y || 0) - (b.y || 0)
    })

    // Se não tem texto, apenas mostra imagens
    const pageHeight = pageImages[0]?.pageHeight || 800
    if (!pageText || pageText.trim().length === 0) {
      console.log(`📄 Pág ${pageNum}: ${sortedImages.length} imagens SEM texto`)
      return sortedImages.map(img => {
        const width = img.width ? `width:${(img.width / img.pageWidth * 100).toFixed(1)}%` : 'width:90%'
        return `<div style="text-align:center;page-break-inside:avoid;margin:10px auto;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="${width};height:auto;max-width:100%;" /></div>`
      }).join('\n')
    }

    // Divide o texto em parágrafos
    const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim())
    if (paragraphs.length === 0) {
      return sortedImages.map(img => {
        const width = img.width ? `width:${(img.width / img.pageWidth * 100).toFixed(1)}%` : 'width:90%'
        return `<div style="text-align:center;page-break-inside:avoid;margin:10px auto;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="${width};height:auto;max-width:100%;" /></div>`
      }).join('\n')
    }

    // Cria estrutura intercalada com posicionamento baseado em Y
    const elements = []

    // Adiciona imagens na posição estimada
    for (const img of sortedImages) {
      // Normaliza posição Y para 0-1
      const normalizedY = Math.max(0, Math.min(1, (img.y || 0) / pageHeight))
      elements.push({
        type: 'image',
        position: normalizedY,
        content: (() => {
          const width = img.width ? `width:${(img.width / img.pageWidth * 100).toFixed(1)}%` : 'width:90%'
          return `<div style="text-align:center;page-break-inside:avoid;margin:10px auto;"><img src="${img.path}" alt="Imagem página ${pageNum}" style="${width};height:auto;max-width:100%;" /></div>`
        })()
      })
    }

    // Adiciona parágrafos distribuídos
    for (let i = 0; i < paragraphs.length; i++) {
      const position = (i + 0.5) / paragraphs.length
      elements.push({
        type: 'text',
        position: position,
        content: `<p>${paragraphs[i].replace(/\n/g, '<br>')}</p>`
      })
    }

    // Ordena tudo por posição
    elements.sort((a, b) => a.position - b.position)

    // Debug
    const preview = elements.slice(0, 15).map(e =>
      e.type === 'image' ? `IMG@${(e.position * 100).toFixed(0)}%` : `txt@${(e.position * 100).toFixed(0)}%`
    ).join(' ')
    console.log(`  ↳ Ordem: ${preview}${elements.length > 15 ? '...' : ''}`)

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
