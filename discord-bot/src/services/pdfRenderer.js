import fs from 'fs'
import path from 'path'
import os from 'os'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'

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
