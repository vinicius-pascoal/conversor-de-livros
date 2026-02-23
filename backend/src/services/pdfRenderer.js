import fs from 'fs'
import path from 'path'
import os from 'os'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'
import { translateText } from './translator.js'

/**
 * Renderiza cada página do PDF como SVG preservando layout e posições exatas
 * @param {string} pdfPath - Caminho do arquivo PDF
 * @param {Object} options - Opções de renderização
 * @returns {Promise<Object>} - Páginas renderizadas com metadados
 */
export async function renderPdfPagesToSvg(pdfPath, options = {}) {
  const scale = options.scale || 2.0 // Alta resolução para qualidade
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-svg-'))
  const pages = []

  try {
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0
    })
    const pdfDocument = await loadingTask.promise

    console.log(`📄 Renderizando ${pdfDocument.numPages} páginas como SVG/imagens de alta qualidade...`)

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // Renderiza a página como imagem de alta qualidade
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      })

      // Fundo branco
      context.fillStyle = 'white'
      context.fillRect(0, 0, viewport.width, viewport.height)

      // Renderiza o conteúdo do PDF
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        background: 'white'
      }

      await page.render(renderContext).promise

      // Salva como PNG de alta qualidade
      const imagePath = path.join(tempDir, `page-${String(pageNum).padStart(4, '0')}.png`)
      const buffer = canvas.toBuffer('image/png', {
        compressionLevel: 6,
        filters: canvas.PNG_FILTER_NONE
      })
      await fs.promises.writeFile(imagePath, buffer)

      // Extrai texto com posições para overlay (opcional, para texto selecionável)
      const textContent = await page.getTextContent()
      const textItems = textContent.items.map(item => ({
        text: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5], // Inverte Y
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        fontSize: Math.abs(item.transform[0]) // Tamanho da fonte da matriz
      }))

      pages.push({
        pageNum,
        imagePath,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        textItems: textItems.filter(t => t.text.trim().length > 0),
        originalWidth: page.view[2],
        originalHeight: page.view[3]
      })

      if (pageNum % 10 === 0 || pageNum === pdfDocument.numPages) {
        console.log(`✅ Renderizadas ${pageNum}/${pdfDocument.numPages} páginas`)
      }
    }

    console.log(`🎨 Todas as ${pages.length} páginas renderizadas com sucesso`)
    return { pages, assetsDir: tempDir }

  } catch (error) {
    console.error('❌ Erro ao renderizar PDF:', error)
    throw error
  }
}

/**
 * Cria um SVG que combina a imagem renderizada com overlay de texto (opcional)
 * @param {Object} pageData - Dados da página renderizada
 * @param {boolean} includeTextOverlay - Se deve incluir texto selecionável
 * @returns {string} - Código SVG da página
 */
export function createSvgWithTextOverlay(pageData, includeTextOverlay = false) {
  const { width, height, imagePath, textItems } = pageData

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" xlink:href="${path.basename(imagePath)}"/>
`

  // Adiciona texto invisível sobre a imagem para permitir seleção/cópia
  if (includeTextOverlay && textItems && textItems.length > 0) {
    svg += '  <g opacity="0.01" style="user-select: text;">\n'

    for (const item of textItems) {
      const escapedText = escapeXml(item.text)
      svg += `    <text x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" font-size="${item.fontSize.toFixed(1)}px">${escapedText}</text>\n`
    }

    svg += '  </g>\n'
  }

  svg += '</svg>'
  return svg
}

/**
 * Renderiza páginas do PDF sem texto original (removido) para tradução
 * @param {string} pdfPath - Caminho do arquivo PDF
 * @param {Object} options - Opções de renderização
 * @returns {Promise<Object>} - Páginas renderizadas com metadados e textos extraídos
 */
export async function renderPdfPagesWithoutText(pdfPath, options = {}) {
  const scale = options.scale || 2.0
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-no-text-'))
  const pages = []
  const progress = options.progress || (() => { })

  try {
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0
    })
    const pdfDocument = await loadingTask.promise

    console.log(`🎨 Renderizando ${pdfDocument.numPages} páginas sem texto original...`)
    progress(`Renderizando ${pdfDocument.numPages} páginas...`)

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // Cria canvas para renderizar a página
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      })

      // Fundo branco
      context.fillStyle = 'white'
      context.fillRect(0, 0, viewport.width, viewport.height)

      // Renderiza o PDF completo primeiro
      await page.render({
        canvasContext: context,
        viewport: viewport,
        background: 'white'
      }).promise

      // Extrai texto com posições
      const textContent = await page.getTextContent()
      const textItems = textContent.items
        .filter(item => item.str && item.str.trim().length > 0)
        .map(item => ({
          text: item.str,
          x: item.transform[4],
          y: viewport.height - item.transform[5],
          width: item.width,
          height: item.height,
          fontSize: Math.abs(item.transform[0]),
          transform: item.transform
        }))

      // Remove o texto original desenhando retângulos brancos
      if (textItems.length > 0) {
        context.fillStyle = 'white'

        // Agrupa textos por linha para criar retângulos maiores
        const lines = []
        let currentLine = null

        // Ordena por Y e depois X
        const sortedItems = [...textItems].sort((a, b) => {
          const yDiff = Math.abs(b.y - a.y)
          if (yDiff > 3) return b.y - a.y
          return a.x - b.x
        })

        for (const item of sortedItems) {
          if (!currentLine || Math.abs(item.y - currentLine.y) > 3) {
            if (currentLine) lines.push(currentLine)
            currentLine = {
              items: [item],
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height
            }
          } else {
            currentLine.items.push(item)
            currentLine.width = Math.max(currentLine.x + currentLine.width, item.x + item.width) - currentLine.x
            currentLine.height = Math.max(currentLine.height, item.height)
          }
        }
        if (currentLine) lines.push(currentLine)

        // Desenha retângulos brancos sobre cada linha de texto
        for (const line of lines) {
          const x = line.x - 2
          const y = line.y - 2
          const width = line.width + 4
          const height = line.height + 4

          context.fillRect(x, y, width, height)
        }

        console.log(`  🧹 Página ${pageNum}: removidas ${lines.length} linhas de texto`)
      }

      // Salva como PNG
      const imagePath = path.join(tempDir, `page-${String(pageNum).padStart(4, '0')}.png`)
      const buffer = canvas.toBuffer('image/png', {
        compressionLevel: 6,
        filters: canvas.PNG_FILTER_NONE
      })
      await fs.promises.writeFile(imagePath, buffer)

      pages.push({
        pageNum,
        imagePath,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        scale,
        textItems: textItems,
        originalWidth: page.view[2],
        originalHeight: page.view[3]
      })

      if (pageNum % 5 === 0 || pageNum === pdfDocument.numPages) {
        console.log(`  ✅ ${pageNum}/${pdfDocument.numPages} páginas processadas`)
        progress(`Processadas ${pageNum}/${pdfDocument.numPages} páginas`)
      }
    }

    console.log(`✨ Todas as ${pages.length} páginas renderizadas sem texto`)
    return { pages, assetsDir: tempDir }

  } catch (error) {
    console.error('❌ Erro ao renderizar páginas:', error)
    throw error
  }
}

/**
 * Traduz os textos de todas as páginas com progresso
 * @param {Array} pages - Array de páginas com textItems
 * @param {Object} options - Opções de tradução
 * @returns {Promise<Array>} - Páginas com textos traduzidos
 */
export async function translatePagesText(pages, options = {}) {
  const targetLang = options.targetLang || 'pt'
  const sourceLang = options.sourceLang || 'auto'
  const progress = options.progress || (() => { })

  console.log('🌐 Iniciando tradução dos textos...')
  progress({ type: 'phase', phase: 'translating' })
  progress({ type: 'log', message: 'Iniciando tradução...' })

  // Conta total de itens de texto
  let totalItems = 0
  for (const page of pages) {
    totalItems += page.textItems.length
  }

  console.log(`📝 Total de ${totalItems} itens de texto para traduzir`)
  progress({ type: 'log', message: `${totalItems} textos para traduzir` })

  let translatedItems = 0

  for (const page of pages) {
    for (const item of page.textItems) {
      if (item.text.trim().length > 0) {
        try {
          const translated = await translateText(item.text, targetLang, sourceLang)
          item.translatedText = translated
          translatedItems++

          // Reporta progresso a cada 20 itens
          if (translatedItems % 20 === 0 || translatedItems === totalItems) {
            const pct = Math.round((translatedItems / totalItems) * 100)
            console.log(`  🔄 Tradução: ${pct}% (${translatedItems}/${totalItems})`)
            progress({ type: 'log', message: `Traduzindo: ${pct}% (${translatedItems}/${totalItems})` })
          }

          // Pequeno delay para evitar rate limiting da API
          if (translatedItems % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (err) {
          console.warn(`⚠️ Erro ao traduzir texto "${item.text}":`, err.message)
          item.translatedText = item.text // Usa original se falhar
        }
      } else {
        item.translatedText = item.text
      }
    }
  }

  console.log(`✅ ${translatedItems} textos traduzidos com sucesso`)
  progress({ type: 'log', message: `Tradução concluída: ${translatedItems} textos` })

  return pages
}

/**
 * Escapa caracteres especiais XML
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
