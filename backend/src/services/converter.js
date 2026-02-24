import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'
import { translateText, translateTextWithProgress, detectLanguage } from './translator.js'
import { renderPdfPagesToSvg, renderPdfPagesWithoutText, translatePagesText } from './pdfRenderer.js'
import { generateFixedLayoutEpub } from './fixedLayoutEpub.js'
import { analyzePdfLayout, analyzePdfLayoutWithParagraphs, reconstructChapters } from './layoutAnalyzer.js'
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
    let useFixedLayout = options.useFixedLayout === true // Reflow é o padrão
    const progress = typeof options.progress === 'function' ? options.progress : null

    console.log('🔄 Iniciando conversão PDF para EPUB...')
    console.log('⚡ fastMode:', fastMode)
    console.log('🖼️ useFixedLayout:', useFixedLayout)
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

    // Detecta idioma antes (não traduz ainda - será feito nos capítulos reconstruídos)
    let detectedLang = 'unknown'
    if (translateToPt && text && text.trim().length > 0) {
      progress?.({ type: 'phase', phase: 'translating' })
      progress?.({ type: 'log', message: 'Detectando idioma...' })

      detectedLang = await detectLanguage(text)
      console.log('🌍 Idioma detectado:', detectedLang)
      progress?.({ type: 'log', message: `Idioma detectado: ${detectedLang}` })

      if (detectedLang === 'pt') {
        console.log('ℹ️ Texto já está em português, pulando tradução')
        progress?.({ type: 'log', message: 'Texto já está em português' })
      }
    }

    if (translateToPt && useFixedLayout) {
      console.log('📖 Tradução + Fixed Layout: renderizando sem texto e traduzindo')
      progress?.({ type: 'log', message: 'Modo Fixed Layout com tradução ativado' })
      progress?.({ type: 'log', message: 'Renderizando páginas sem texto original...' })

      // 1. Renderiza páginas removendo texto original
      console.time('render-pages-no-text')
      const renderResult = await renderPdfPagesWithoutText(pdfPath, {
        scale: 2.0,
        progress: (msg) => {
          console.log(msg)
          progress?.({ type: 'log', message: msg })
        }
      })
      console.timeEnd('render-pages-no-text')

      let { pages, assetsDir } = renderResult
      console.log(`✅ ${pages.length} páginas renderizadas sem texto`)

      // 2. Traduz os textos extraídos
      if (detectedLang !== 'pt') {
        console.log('🌐 Traduzindo textos para português...')
        console.time('translate-texts')
        pages = await translatePagesText(pages, {
          targetLang: 'pt',
          sourceLang: 'auto',
          progress: progress
        })
        console.timeEnd('translate-texts')
        console.log('✅ Tradução concluída')
      } else {
        console.log('ℹ️ Texto já em português, copiando para translatedText')
        // Copia texto original para translatedText
        for (const page of pages) {
          for (const item of page.textItems) {
            item.translatedText = item.text
          }
        }
      }

      // 3. Define capa como primeira página se não fornecida
      if (!coverPath && pages.length > 0) {
        coverPath = pages[0].imagePath
        console.log('📔 Capa definida pela primeira página')
      }

      // 4. Gera EPUB Fixed Layout com texto traduzido sobreposto
      console.log('📚 Gerando EPUB Fixed Layout com texto traduzido...')
      progress?.({ type: 'phase', phase: 'generating' })
      progress?.({ type: 'log', message: 'Montando estrutura EPUB com texto traduzido...' })

      console.time('epub-gen')
      await generateFixedLayoutEpub({
        title,
        author: 'Autor Desconhecido',
        publisher: 'Conversor PDF-EPUB (Fixed Layout Traduzido)',
        language: 'pt',
        pages: pages,
        coverImagePath: coverPath
      }, epubPath)
      console.timeEnd('epub-gen')

      console.timeEnd('pdf-total')
      console.log('✨ EPUB Fixed Layout traduzido gerado com sucesso!')
      progress?.({ type: 'phase', phase: 'complete' })
      progress?.({ type: 'log', message: 'Conversão concluída!' })

      return { epubPath, assetsDir }
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
      dataBuffer,
      detectedLang,
      translateToPt // Passa explicitamente
    })

  } catch (error) {
    console.error('Erro na conversão:', error)
    throw new Error(`Falha ao converter PDF para EPUB: ${error.message}`)
  }
}

// ========== MODO REFLOW COM RECONSTRUÇÃO INTELIGENTE ==========

/**
 * Traduz conteúdo HTML preservando todas as tags e estrutura
 * Traduz texto em lotes para evitar rate limiting
 */
async function translateHtmlContent(html) {
  console.log(`  🔄 Iniciando tradução do capítulo (${html.length} chars)...`)

  // Protege blocos que não devem ser alterados
  const protectedBlocks = []
  let workingHtml = html

  // Protege tags <figure> completas (incluindo imagens)
  workingHtml = workingHtml.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (match) => {
    const idx = protectedBlocks.length
    protectedBlocks.push(match)
    return `___FIGURE_${idx}___`
  })

  // Protege tags <img> standalone
  workingHtml = workingHtml.replace(/<img[^>]*\/?>/gi, (match) => {
    const idx = protectedBlocks.length
    protectedBlocks.push(match)
    return `___IMG_${idx}___`
  })

  // Protege <hr>
  workingHtml = workingHtml.replace(/<hr[^>]*\/?>/gi, (match) => {
    const idx = protectedBlocks.length
    protectedBlocks.push(match)
    return `___HR_${idx}___`
  })

  console.log(`  🛡️ ${protectedBlocks.length} elementos protegidos (imagens, figuras, etc)`)

  // Coleta todos os textos dentro de tags de conteúdo, preservando atributos
  const textsToTranslate = []
  const textPattern = /<(h[1-6]|p|div|span|li|td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi

  workingHtml = workingHtml.replace(textPattern, (fullMatch, tag, attributes, content) => {
    // Extrai apenas o texto, removendo tags internas
    const textOnly = content.replace(/<[^>]+>/g, '').trim()

    // Reduz o limite mínimo para 3 caracteres para não perder textos curtos
    if (textOnly.length >= 3) {
      textsToTranslate.push({
        original: fullMatch,
        tag: tag,
        attributes: attributes,  // Preserva atributos originais
        content: content,         // Conteúdo original (pode ter tags internas)
        textOnly: textOnly
      })
      return `___TEXT_${textsToTranslate.length - 1}___`
    }

    return fullMatch
  })

  console.log(`  📝 ${textsToTranslate.length} blocos de texto para traduzir`)

  if (textsToTranslate.length === 0) {
    console.log(`  ⏭️ Nada para traduzir, retornando original`)
    return html
  }

  // Traduz cada texto individualmente (mais lento mas mais confiável)
  const totalTexts = textsToTranslate.length
  console.log(`  📦 Traduzindo ${totalTexts} blocos de texto...`)

  for (let i = 0; i < textsToTranslate.length; i++) {
    const item = textsToTranslate[i]
    const progress = Math.round((i / totalTexts) * 100)

    if (i % 10 === 0 || i === totalTexts - 1) {
      console.log(`  ⏳ Progresso: ${i + 1}/${totalTexts} (${progress}%)...`)
    }

    try {
      const translated = await translateText(item.textOnly)
      item.translated = translated

      // Pausa breve para evitar rate limiting (50ms entre traduções)
      if (i < totalTexts - 1) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch (err) {
      console.warn(`  ⚠️ Erro no texto ${i + 1}, mantendo original:`, err.message)
      item.translated = item.textOnly
    }
  }

  console.log(`  ✅ Tradução concluída, reconstruindo HTML...`)

  // Reconstrói substituindo os placeholders, preservando atributos
  for (let i = 0; i < textsToTranslate.length; i++) {
    const item = textsToTranslate[i]
    const placeholder = `___TEXT_${i}___`

    // Reconstrói a tag com atributos originais e texto traduzido
    const translatedTag = `<${item.tag}${item.attributes}>${item.translated}</${item.tag}>`
    workingHtml = workingHtml.replace(placeholder, translatedTag)
  }

  // Restaura blocos protegidos
  protectedBlocks.forEach((block, idx) => {
    workingHtml = workingHtml.replace(`___FIGURE_${idx}___`, block)
    workingHtml = workingHtml.replace(`___IMG_${idx}___`, block)
    workingHtml = workingHtml.replace(`___HR_${idx}___`, block)
  })

  console.log(`  🎉 HTML reconstruído com ${protectedBlocks.length} elementos restaurados`)

  return workingHtml
}

/**
 * Integra imagens extraídas nos capítulos baseado nas páginas
 * DESABILITADO no modo tradução para evitar duplicação e problemas de posicionamento
 */
/**
 * Integra imagens nos capítulos baseado em posições Y por página
 * Abordagem 6: Integra imagens no nível de página antes de agrupar em capítulos
 */
function integrateImagesIntoChapters(chapters, images, pageLayouts) {
  if (!images || images.length === 0) return chapters

  console.log(`  🖼️ Integrando ${images.length} imagens por página...`)

  // Cria mapa de imagens por página
  const imagesByPage = new Map()
  for (const img of images) {
    if (!imagesByPage.has(img.page)) {
      imagesByPage.set(img.page, [])
    }
    imagesByPage.get(img.page).push(img)
  }

  // Processa cada capítulo
  const enhancedChapters = chapters.map((chapter, idx) => {
    console.log(`  📄 Processando capítulo ${idx + 1}: "${chapter.title}"...`)

    let html = chapter.data

    // Extrai blocos HTML com suas posições Y e página
    const blockRegex = /<(p|h[1-6])(?:\s[^>]*)data-y-mid="(\d+)"(?:[^>]*)data-page="(\d+)"(?:[^>]*)>.*?<\/\1>/gis
    const textBlocksWithPage = []
    let match

    // Reset do regex
    blockRegex.lastIndex = 0

    while ((match = blockRegex.exec(html)) !== null) {
      const yMid = match[2] ? parseInt(match[2]) : null
      const page = match[3] ? parseInt(match[3]) : null
      if (yMid !== null && page !== null) {
        textBlocksWithPage.push({
          type: 'text',
          html: match[0],
          yMid: yMid,
          page: page,
          originalIndex: match.index
        })
      }
    }

    // Se não tem atributo data-page, tenta integrar de forma mais simples
    if (textBlocksWithPage.length === 0) {
      console.log(`    ℹ️ Blocos sem atributo data-page, usando método simplificado`)

      // Extrai blocos apenas com Y
      const simpleBlockRegex = /<(p|h[1-6])(?:\s[^>]*)data-y-mid="(\d+)"(?:[^>]*)>.*?<\/\1>/gis
      const textBlocks = []

      simpleBlockRegex.lastIndex = 0
      while ((match = simpleBlockRegex.exec(html)) !== null) {
        const yMid = match[2] ? parseInt(match[2]) : null
        if (yMid !== null) {
          textBlocks.push({
            type: 'text',
            html: match[0],
            yMid: yMid,
            originalIndex: match.index
          })
        }
      }

      if (textBlocks.length === 0) {
        console.log(`    ⚠️ Nenhum bloco com posição Y encontrado`)
        return { ...chapter, data: html }
      }

      // Coleta todas as imagens
      const allImages = []
      for (const [pageNum, pageImages] of imagesByPage.entries()) {
        for (const img of pageImages) {
          allImages.push({
            type: 'image',
            pageNum: pageNum,
            yMid: img.y,
            img: img
          })
        }
      }

      // Combina e ordena
      const allElements = [...textBlocks, ...allImages]
      allElements.sort((a, b) => {
        // Primeiro por página (se disponível)
        if (a.pageNum && b.pageNum && a.pageNum !== b.pageNum) {
          return a.pageNum - b.pageNum
        }
        // Depois por Y (ASCENDENTE = topo para baixo após inversão de coordenadas)
        return a.yMid - b.yMid
      })

      const newHtml = allElements.map(el => {
        if (el.type === 'text') {
          return el.html
        } else {
          return createImageHtml(el.img, el.pageNum)
        }
      }).join('\n')

      console.log(`  ✅ Integradas ${allImages.length} imagens (método simplificado)`)
      return { ...chapter, data: newHtml }
    }

    // Agrupa blocos por página
    const elementsByPage = new Map()

    for (const block of textBlocksWithPage) {
      if (!elementsByPage.has(block.page)) {
        elementsByPage.set(block.page, [])
      }
      elementsByPage.get(block.page).push(block)
    }

    // Adiciona imagens aos elementos de cada página
    let totalImagesAdded = 0
    for (const [pageNum, pageImages] of imagesByPage.entries()) {
      if (!elementsByPage.has(pageNum)) {
        elementsByPage.set(pageNum, [])
      }

      for (const img of pageImages) {
        elementsByPage.get(pageNum).push({
          type: 'image',
          pageNum: pageNum,
          yMid: img.y,
          img: img
        })
        totalImagesAdded++
      }
    }

    console.log(`  📦 Organizando elementos em ${elementsByPage.size} páginas`)

    // Ordena todos os elementos por página e depois por Y
    const sortedPages = Array.from(elementsByPage.keys()).sort((a, b) => a - b)
    const orderedElements = []

    for (const pageNum of sortedPages) {
      const pageElements = elementsByPage.get(pageNum)
      // Ordena elementos da página por Y (ASCENDENTE = topo para baixo após inversão)
      pageElements.sort((a, b) => a.yMid - b.yMid)
      orderedElements.push(...pageElements)
    }

    // Reconstrói HTML com elementos ordenados
    const newHtml = orderedElements.map(el => {
      if (el.type === 'text') {
        return el.html
      } else {
        return createImageHtml(el.img, el.pageNum)
      }
    }).join('\n')

    console.log(`  ✅ Integradas ${totalImagesAdded} imagens mantendo ordem por página e posição Y`)

    return {
      ...chapter,
      data: newHtml
    }
  })

  console.log(`  ✨ Integração concluída!`)
  return enhancedChapters
}

/**
 * Encontra o melhor ponto de inserção para uma imagem baseado em posição Y
 */
function findBestInsertionPoint(image, blocks) {
  if (blocks.length === 0) return null

  let closestBlock = null
  let minDistance = Infinity
  let position = 'after' // 'before' ou 'after'

  for (const block of blocks) {
    // Calcula posição Y média do bloco
    const blockY = (block.yStart + block.yEnd) / 2
    const distance = Math.abs(image.y - blockY)

    if (distance < minDistance) {
      minDistance = distance
      closestBlock = block

      // Decide se insere antes ou depois baseado na posição relativa
      // Image Y maior = mais acima na página (PDF coordenadas invertidas)
      position = image.y > blockY ? 'before' : 'after'
    }
  }

  if (!closestBlock) return null

  return {
    blockText: closestBlock.text,
    position,
    distance: minDistance
  }
}

/**
 * Cria HTML para uma imagem com figure e caption
 * Usa caminho relativo para epub-gen processar corretamente
 */
function createImageHtml(image, pageNum) {
  try {
    // Verifica se o arquivo existe
    if (!fs.existsSync(image.path)) {
      console.warn(`⚠️ Arquivo de imagem não encontrado: ${image.path}`)
      return ''
    }

    // Usa o caminho completo do arquivo para o epub-gen copiar
    // O epub-gen automaticamente copiará e referenciará a imagem
    const imagePath = image.path.replace(/\\/g, '/') // Normaliza para formato Unix

    return `
<figure class="epub-image" data-page="${pageNum}" data-y="${image.y.toFixed(0)}">
  <img src="${imagePath}" alt="Imagem da página ${pageNum}" style="max-width:100%; height:auto;" />
  <figcaption>Figura - Página ${pageNum}</figcaption>
</figure>
`
  } catch (err) {
    console.warn(`⚠️ Erro ao processar imagem:`, err.message)
    // Retorna vazio ao invés de placeholder para evitar erros
    return ''
  }
}

/**
 * Insere HTML de imagem no HTML do capítulo no ponto correto
 * Usa estrutura HTML (ordem e quantidade de elementos) ao invés de buscar texto específico
 */
function insertImageIntoHtml(html, imageHtml, insertionPoint) {
  const { blockText, position } = insertionPoint

  // Estratégia: conta quantos blocos (p, h1-h6) existem e insere proporcionalmente
  // Extrai todos os blocos de conteúdo
  const blockRegex = /(<(?:p|h[1-6])[^>]*>.*?<\/(?:p|h[1-6])>)/gis
  const blocks = html.match(blockRegex) || []

  if (blocks.length === 0) {
    // Sem blocos estruturados, adiciona no início
    return imageHtml + '\n' + html
  }

  // Tenta encontrar um bloco que contenha parte do texto original
  // Usa apenas os primeiros 30 caracteres para busca fuzzy
  const searchText = blockText.substring(0, 30).toLowerCase()
  let bestMatchIndex = -1
  let bestMatchScore = 0

  for (let i = 0; i < blocks.length; i++) {
    // Remove HTML tags para comparação
    const blockContent = blocks[i].replace(/<[^>]+>/g, '').toLowerCase()

    // Calcula similaridade básica (palavras em comum)
    const words = searchText.split(/\s+/).filter(w => w.length > 3)
    let matchCount = 0
    for (const word of words) {
      if (blockContent.includes(word)) matchCount++
    }

    const score = matchCount / Math.max(words.length, 1)
    if (score > bestMatchScore) {
      bestMatchScore = score
      bestMatchIndex = i
    }
  }

  // Se encontrou uma correspondência razoável (>30%), usa ela
  if (bestMatchIndex >= 0 && bestMatchScore > 0.3) {
    const targetBlock = blocks[bestMatchIndex]
    const targetIndex = position === 'before' ? bestMatchIndex : bestMatchIndex + 1

    // Reconstrói HTML inserindo imagem na posição correta
    const beforeBlocks = blocks.slice(0, targetIndex)
    const afterBlocks = blocks.slice(targetIndex)

    // Preserva conteúdo que não está nos blocos
    let result = html
    const insertMarker = '___INSERT_IMAGE_HERE___'

    // Substitui o bloco alvo por um marcador temporário
    result = result.replace(targetBlock, targetBlock + '\n' + insertMarker)

    // Substitui o marcador pela imagem
    result = result.replace(insertMarker, imageHtml)

    return result
  }

  // Fallback: insere após o primeiro bloco (geralmente título)
  if (blocks.length > 0) {
    return html.replace(blocks[0], blocks[0] + '\n' + imageHtml)
  }

  // Último fallback: adiciona no início
  return imageHtml + '\n' + html
}

/**
 * Escapa string para uso em regex
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function convertPdfToEpubReflowEnhanced(pdfPath, epubPath, originalFilename, options) {
  const { fastMode, text, pdfData, title, coverPath, progress, translateToPt, dataBuffer, detectedLang, keepImages } = options

  console.time('layout-analysis')
  progress?.({ type: 'phase', phase: 'extracting' })
  progress?.({ type: 'log', message: 'Analisando estrutura de layout do PDF...' })

  // NOVA LÓGICA: Usa detecção precisa de parágrafos baseada em características do PDF
  console.log('🔍 Usando NOVA LÓGICA de detecção de parágrafos')
  const layoutAnalysis = await analyzePdfLayoutWithParagraphs(dataBuffer)
  console.log(`📐 Layout analisado: ${layoutAnalysis.totalPages} páginas`)
  progress?.({ type: 'log', message: `${layoutAnalysis.totalPages} páginas analisadas` })
  console.timeEnd('layout-analysis')

  // Extrai imagens do PDF se solicitado
  let extractedImages = []
  if (keepImages !== false) {
    console.time('extract-images')
    progress?.({ type: 'log', message: 'Extraindo imagens do PDF...' })

    try {
      const imagesResult = await extractImagesWithPages(pdfPath)
      extractedImages = imagesResult.images
      console.log(`🖼️ ${extractedImages.length} imagens extraídas`)
      progress?.({ type: 'log', message: `${extractedImages.length} imagens extraídas` })
    } catch (err) {
      console.warn('⚠️ Falha ao extrair imagens:', err.message)
      progress?.({ type: 'log', message: `Aviso: não foi possível extrair imagens` })
    }
    console.timeEnd('extract-images')
  }

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

  // Traduz conteúdo dos capítulos ANTES de adicionar imagens (para preservar posições)
  // Traduz conteúdo dos capítulos se solicitado
  console.log('🔍 [DEBUG] translateToPt =', translateToPt, ', detectedLang =', detectedLang)
  if (translateToPt && detectedLang !== 'pt' && detectedLang !== 'unknown') {
    console.time('translation')
    progress?.({ type: 'phase', phase: 'translating' })
    progress?.({ type: 'log', message: `Traduzindo de ${detectedLang} para pt-br...` })

    // Traduz cada capítulo mantendo estrutura HTML e imagens
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const chapterNum = i + 1
      const totalChapters = chapters.length

      progress?.({ type: 'log', message: `Traduzindo ${chapterNum}/${totalChapters} (${Math.round(chapterNum / totalChapters * 100)}%)` })

      try {
        // Traduz preservando estrutura HTML completa
        const originalLength = chapter.data.length
        const originalImages = (chapter.data.match(/<figure|<img/gi) || []).length

        chapter.data = await translateHtmlContent(chapter.data)

        const newLength = chapter.data.length
        const newImages = (chapter.data.match(/<figure|<img/gi) || []).length

        console.log(`  ✅ Capítulo ${chapterNum}: ${originalLength} → ${newLength} chars, ${originalImages} imagens preservadas`)
      } catch (err) {
        console.warn(`⚠️ Erro ao traduzir capítulo ${chapterNum}:`, err.message)
      }
    }

    console.log('✅ Capítulos traduzidos')
    progress?.({ type: 'log', message: 'Tradução concluída!' })
    console.timeEnd('translation')
  }

  // Integra imagens nos capítulos DEPOIS da tradução (Abordagem 4)
  if (extractedImages && extractedImages.length > 0) {
    console.log('🖼️ Integrando imagens nos capítulos usando posições Y...')

    // Valida imagens antes de integrar
    const validImages = extractedImages.filter(img => {
      if (!img.path) {
        console.warn('⚠️ Imagem sem caminho, ignorando')
        return false
      }
      if (!fs.existsSync(img.path)) {
        console.warn(`⚠️ Arquivo não encontrado: ${img.path}`)
        return false
      }
      const ext = path.extname(img.path).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        console.warn(`⚠️ Extensão inválida: ${ext} em ${img.path}`)
        return false
      }
      return true
    })

    console.log(`✅ ${validImages.length}/${extractedImages.length} imagens válidas`)
    progress?.({ type: 'log', message: `${validImages.length} imagens válidas encontradas` })

    if (validImages.length > 0) {
      progress?.({ type: 'log', message: 'Integrando imagens nos capítulos...' })
      try {
        const integratedChapters = integrateImagesIntoChapters(chapters, validImages, layoutAnalysis.pages)
        if (integratedChapters && integratedChapters.length > 0) {
          chapters = integratedChapters
          console.log('✅ Imagens integradas com sucesso!')
          progress?.({ type: 'log', message: 'Imagens integradas!' })
        } else {
          console.warn('⚠️ Integração retornou capítulos vazios, mantendo originais')
        }
      } catch (imgErr) {
        console.error('⚠️ Erro ao integrar imagens, continuando sem elas:', imgErr.message)
        progress?.({ type: 'log', message: 'Aviso: imagens não puderam ser integradas' })
      }
    } else {
      console.warn('⚠️ Nenhuma imagem válida para integrar')
      progress?.({ type: 'log', message: 'Continuando sem imagens' })
    }
  }

  // Gera EPUB com estrutura reconstruída
  console.log(`📊 Preparando EPUB: ${chapters?.length || 0} capítulos, ${extractedImages?.length || 0} imagens`)

  // Verifica e valida imagens nos capítulos
  const totalImagesInChapters = chapters.reduce((count, ch) => {
    const matches = ch.data.match(/<img[^>]+>/g)
    return count + (matches ? matches.length : 0)
  }, 0)
  console.log(`🖼️ Total de tags <img> encontradas nos capítulos: ${totalImagesInChapters}`)

  // Remove imagens inválidas dos capítulos para evitar erros no epub-gen
  if (totalImagesInChapters > 0) {
    console.log('🔍 Validando referências de imagens nos capítulos...')
    let removedImages = 0

    for (const chapter of chapters) {
      // Remove tags img que referenciam arquivos inexistentes
      chapter.data = chapter.data.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (match, src) => {
        // Verifica se é caminho de arquivo válido
        if (src.startsWith('data:')) {
          // Data URL, mantém
          return match
        }

        // Normaliza caminho
        const normalizedPath = src.replace(/\//g, path.sep)

        if (!fs.existsSync(normalizedPath)) {
          console.warn(`⚠️ Removendo referência a imagem inexistente: ${src}`)
          removedImages++
          // Remove a tag img mas mantém a figura se houver
          return ''
        }

        return match
      })

      // Remove figuras vazias
      chapter.data = chapter.data.replace(/<figure[^>]*>\s*<\/figure>/gi, '')
    }

    if (removedImages > 0) {
      console.log(`🧹 Removidas ${removedImages} referências de imagens inválidas`)
    }
  }

  // Debug: mostra preview do primeiro capítulo
  if (chapters.length > 0) {
    const preview = chapters[0].data.substring(0, 500)
    console.log(`📄 Preview do capítulo 1 (primeiros 500 chars):`)
    console.log(preview)
  }

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
      figure.epub-image { margin: 1em 0; text-align: center; page-break-inside: avoid; }
      figure.epub-image img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
      figcaption { font-size: 0.85em; color: #666; margin-top: 0.5em; font-style: italic; }
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
    console.timeEnd('epub-gen')
    console.log('✨ EPUB Reflow com layout inteligente gerado!')
    progress?.({ type: 'phase', phase: 'complete' })
  } catch (err) {
    console.error('⚠️ Erro ao gerar EPUB com imagens:', err.message)
    console.log('🔄 Tentando novamente sem imagens...')

    // Remove todas as imagens dos capítulos
    const chaptersWithoutImages = chapters.map(ch => ({
      ...ch,
      data: ch.data
        .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
        .replace(/<img[^>]*\/?>/gi, '')
    }))

    const fallbackOptions = {
      title,
      author: 'Autor Desconhecido',
      publisher: 'Conversor PDF-EPUB (Reflow)',
      cover: coverPath || '',
      content: chaptersWithoutImages,
      lang: 'pt',
      tocTitle: 'Índice',
      appendChapterTitles: true,
      version: 3,
      css: epubOptions.css
    }

    try {
      await runWithTimeout(
        new Epub(fallbackOptions, epubPath).promise,
        fastMode ? 15000 : 30000,
        'epub-gen-no-images'
      )
      console.timeEnd('epub-gen')
      console.log('✨ EPUB gerado com sucesso (sem imagens)')
      progress?.({ type: 'log', message: 'EPUB gerado sem imagens devido a erros' })
      progress?.({ type: 'phase', phase: 'complete' })
    } catch (fallbackErr) {
      console.error('⚠️ Fallback também falhou, tentando modo ultra-simplificado')

      // Último fallback: apenas primeiros capítulos
      const minimalOptions = {
        title,
        author: 'Autor Desconhecido',
        cover: '',
        content: chaptersWithoutImages.slice(0, Math.min(5, chaptersWithoutImages.length)),
        lang: 'pt'
      }

      await runWithTimeout(
        new Epub(minimalOptions, epubPath).promise,
        15000,
        'epub-gen-minimal'
      )
      console.timeEnd('epub-gen')
      console.log('✨ EPUB gerado em modo reduzido')
      progress?.({ type: 'phase', phase: 'complete' })
    }
  }

  return { epubPath }
}

// ========== MODO LEGADO (FALLBACK) ==========
// Mantido para compatibilidade, mas não é mais usado por padrão

async function convertPdfToEpubLegacy(pdfPath, epubPath, originalFilename, options) {
  const { fastMode, keepImages, text, pdfData, title, coverPath, progress } = options

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

      try {
        const textPosResult = await extractTextPositionsWithPages(pdfPath)
        textPositionsByPage = textPosResult.textPositionsByPage
      } catch (txErr) {
        console.warn('⚠️ Falha ao extrair posições de texto:', txErr.message)
      }
    } catch (err) {
      console.error('⚠️ Falha ao extrair imagens:', err.message)
      progress?.({ type: 'log', message: `Falha ao extrair imagens: ${err.message}` })
    }
    console.timeEnd('pdf-images')
  }

  // Criar capítulos com texto e imagens
  console.time('split-chapters')
  let chapters
  if (fastMode) {
    progress?.({ type: 'phase', phase: 'processing' })
    chapters = createChaptersWithImagesInOrderExtended(text, extractedImages, pdfData.numpages, true, textPositionsByPage)
    console.timeEnd('split-chapters')
  } else {
    progress?.({ type: 'phase', phase: 'processing' })
    chapters = await runWithTimeout(
      Promise.resolve().then(() => createChaptersWithImagesInOrderExtended(text, extractedImages, pdfData.numpages, false, textPositionsByPage)),
      5000,
      'split-chapters'
    )
    console.timeEnd('split-chapters')
  }

  // Configuração do EPUB
  const epubOptions = {
    title: title,
    author: 'Autor Desconhecido',
    publisher: 'Conversor PDF-EPUB (Reflow)',
    cover: coverPath || '',
    content: chapters,
    lang: 'pt',
    tocTitle: 'Índice',
    appendChapterTitles: true,
    version: 3
  }

  console.log('📚 Gerando EPUB (modo reflow)...')
  progress?.({ type: 'phase', phase: 'generating' })
  console.time('epub-gen')

  try {
    await runWithTimeout(new Epub(epubOptions, epubPath).promise, fastMode ? 15000 : 30000, 'epub-gen')
  } catch (err) {
    console.error('⚠️ epub-gen falhou, tentando modo simplificado:', err.message)
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
  console.log('✨ EPUB (reflow) gerado com sucesso!')
  progress?.({ type: 'phase', phase: 'complete' })

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
