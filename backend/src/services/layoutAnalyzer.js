import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Analisa o layout do PDF para reconstrução inteligente em Reflow
 * Detecta colunas, blocos de texto, hierarquia e ordem lógica de leitura
 */

/**
 * Analisa todo o PDF e retorna estrutura de layout por página
 * @param {Buffer} pdfBuffer - Buffer do arquivo PDF
 * @returns {Promise<Object>} - Estrutura de layout analisada
 */
export async function analyzePdfLayout(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    verbosity: 0
  })
  const pdfDocument = await loadingTask.promise

  const pageLayouts = []

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.0 })

    // Extrai texto com posições
    const textContent = await page.getTextContent()

    // Extrai operadores gráficos para detectar linhas/caixas
    const operatorList = await page.getOperatorList()

    // Analisa o layout da página
    const pageLayout = analyzePageLayout(textContent, viewport, operatorList, pageNum)
    pageLayouts.push(pageLayout)
  }

  return {
    pages: pageLayouts,
    totalPages: pdfDocument.numPages
  }
}

/**
 * Analisa o layout de uma página individual
 */
function analyzePageLayout(textContent, viewport, operatorList, pageNum) {
  const pageWidth = viewport.width
  const pageHeight = viewport.height

  // Extrai items de texto com metadados completos
  const textItems = textContent.items.map(item => ({
    text: item.str,
    x: item.transform[4],
    y: pageHeight - item.transform[5], // Inverte Y
    width: item.width,
    height: item.height,
    fontSize: Math.abs(item.transform[0]),
    fontName: item.fontName,
    transform: item.transform
  })).filter(item => item.text.trim().length > 0)

  // Detecta colunas baseado em agrupamento horizontal
  const columns = detectColumns(textItems, pageWidth)

  // Agrupa texto em blocos lógicos (parágrafos, títulos, etc)
  const blocks = groupTextIntoBlocks(textItems, columns)

  // Classifica blocos (título, parágrafo, cabeçalho, rodapé)
  const classifiedBlocks = classifyBlocks(blocks, pageHeight)

  // Ordena blocos na ordem de leitura correta
  const orderedBlocks = orderBlocksForReading(classifiedBlocks, columns)

  return {
    pageNum,
    width: pageWidth,
    height: pageHeight,
    columns: columns.length,
    blocks: orderedBlocks
  }
}

/**
 * Detecta número e posições de colunas na página
 */
function detectColumns(textItems, pageWidth) {
  if (textItems.length === 0) return [{ xStart: 0, xEnd: pageWidth }]

  // Agrupa items por posição X inicial (com tolerância)
  const xPositions = textItems.map(item => item.x)
  const tolerance = pageWidth * 0.05 // 5% da largura

  // Clustering simples de posições X
  const clusters = []
  xPositions.sort((a, b) => a - b)

  let currentCluster = [xPositions[0]]
  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - currentCluster[currentCluster.length - 1] < tolerance) {
      currentCluster.push(xPositions[i])
    } else {
      clusters.push(currentCluster)
      currentCluster = [xPositions[i]]
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster)

  // Identifica colunas principais (clusters com muitos items)
  const minItemsForColumn = Math.max(3, textItems.length * 0.1)
  const columnClusters = clusters.filter(cluster => cluster.length >= minItemsForColumn)

  if (columnClusters.length === 0) {
    return [{ xStart: 0, xEnd: pageWidth }]
  }

  // Define limites de cada coluna
  const columns = columnClusters.map((cluster, idx) => {
    const avgX = cluster.reduce((sum, x) => sum + x, 0) / cluster.length
    const nextAvgX = columnClusters[idx + 1]
      ? columnClusters[idx + 1].reduce((sum, x) => sum + x, 0) / columnClusters[idx + 1].length
      : pageWidth

    return {
      xStart: avgX - tolerance,
      xEnd: idx < columnClusters.length - 1 ? (avgX + nextAvgX) / 2 : pageWidth
    }
  })

  return columns
}

/**
 * Agrupa texto em blocos lógicos (parágrafos)
 */
function groupTextIntoBlocks(textItems, columns) {
  const blocks = []

  // Agrupa por coluna primeiro
  for (const column of columns) {
    const columnItems = textItems.filter(item =>
      item.x >= column.xStart && item.x < column.xEnd
    )

    // Ordena por Y (top to bottom) - Y menor = topo (após inversão), então crescente
    columnItems.sort((a, b) => a.y - b.y)

    // Agrupa linhas próximas em blocos
    let currentBlock = {
      lines: [],
      xStart: column.xStart,
      xEnd: column.xEnd,
      yStart: 0,
      yEnd: 0,
      fontSize: 0,
      fontName: ''
    }

    for (let i = 0; i < columnItems.length; i++) {
      const item = columnItems[i]
      const prevItem = i > 0 ? columnItems[i - 1] : null

      // Verifica se pertence ao mesmo bloco
      const lineSpacing = prevItem ? prevItem.y - item.y : 0
      const avgFontSize = prevItem ? (prevItem.fontSize + item.fontSize) / 2 : item.fontSize
      const isNewBlock = lineSpacing > avgFontSize * 1.8 // Espaçamento maior que 1.8x = novo bloco

      if (prevItem && isNewBlock && currentBlock.lines.length > 0) {
        // Finaliza bloco anterior
        currentBlock.yEnd = prevItem.y + prevItem.height
        currentBlock.yStart = currentBlock.lines[currentBlock.lines.length - 1].y
        blocks.push({ ...currentBlock })

        // Inicia novo bloco
        currentBlock = {
          lines: [],
          xStart: column.xStart,
          xEnd: column.xEnd,
          yStart: 0,
          yEnd: 0,
          fontSize: item.fontSize,
          fontName: item.fontName
        }
      }

      currentBlock.lines.push(item)
      currentBlock.fontSize = Math.max(currentBlock.fontSize, item.fontSize)
      if (!currentBlock.fontName) currentBlock.fontName = item.fontName
    }

    // Adiciona último bloco
    if (currentBlock.lines.length > 0) {
      currentBlock.yEnd = currentBlock.lines[currentBlock.lines.length - 1].y
      currentBlock.yStart = currentBlock.lines[0].y
      blocks.push(currentBlock)
    }
  }

  return blocks
}

/**
 * Classifica blocos em tipos (título, parágrafo, cabeçalho, rodapé)
 */
function classifyBlocks(blocks, pageHeight) {
  if (blocks.length === 0) return []

  const avgFontSize = blocks.reduce((sum, b) => sum + b.fontSize, 0) / blocks.length

  return blocks.map((block, idx) => {
    let type = 'paragraph'
    let importance = 0

    // Título: fonte maior que a média
    if (block.fontSize > avgFontSize * 1.3) {
      type = 'heading'
      importance = block.fontSize > avgFontSize * 1.8 ? 1 : 2
    }

    // Cabeçalho: topo da página
    if (block.yStart > pageHeight * 0.90) {
      type = 'header'
    }

    // Rodapé: base da página
    if (block.yEnd < pageHeight * 0.10) {
      type = 'footer'
    }

    // Texto muito curto pode ser caption
    const totalChars = block.lines.reduce((sum, line) => sum + line.text.length, 0)
    if (totalChars < 50 && type === 'paragraph') {
      type = 'caption'
    }

    return {
      ...block,
      type,
      importance,
      text: block.lines.map(l => l.text).join(' ')
    }
  })
}

/**
 * Ordena blocos na ordem correta de leitura
 */
function orderBlocksForReading(blocks, columns) {
  // Remove cabeçalhos e rodapés da ordem principal
  const headerFooter = blocks.filter(b => b.type === 'header' || b.type === 'footer')
  const contentBlocks = blocks.filter(b => b.type !== 'header' && b.type !== 'footer')

  // Ordena por coluna e depois por posição Y
  contentBlocks.sort((a, b) => {
    // Determina coluna de cada bloco
    const aCol = columns.findIndex(col => a.xStart >= col.xStart && a.xStart < col.xEnd)
    const bCol = columns.findIndex(col => b.xStart >= col.xStart && b.xStart < col.xEnd)

    if (aCol !== bCol) return aCol - bCol

    // Mesma coluna: ordena por Y (top to bottom)
    // Y menor = topo (após inversão), então ordena crescente para ler de cima para baixo
    return a.yStart - b.yStart
  })

  return contentBlocks
}

/**
 * Converte blocos analisados em HTML estruturado
 * Preserva posições Y e página como atributos data para posicionamento de imagens
 */
export function blocksToHtml(blocks, options = {}) {
  const { preserveFormatting = true, addSeparators = true } = options

  let html = ''

  for (const block of blocks) {
    // Adiciona atributos data com informações de posição E página
    const positionData = block.yStart && block.yEnd && block.pageNum
      ? ` data-y-start="${block.yStart.toFixed(0)}" data-y-end="${block.yEnd.toFixed(0)}" data-y-mid="${((block.yStart + block.yEnd) / 2).toFixed(0)}" data-page="${block.pageNum}"`
      : block.yStart && block.yEnd
        ? ` data-y-start="${block.yStart.toFixed(0)}" data-y-end="${block.yEnd.toFixed(0)}" data-y-mid="${((block.yStart + block.yEnd) / 2).toFixed(0)}"`
        : ''

    switch (block.type) {
      case 'heading':
        const level = block.importance === 1 ? 'h1' : block.importance === 2 ? 'h2' : 'h3'
        html += `<${level}${positionData}>${escapeHtml(block.text)}</${level}>\n`
        break

      case 'paragraph':
        html += `<p${positionData}>${escapeHtml(block.text)}</p>\n`
        break

      case 'caption':
        html += `<p class="caption"${positionData}><em>${escapeHtml(block.text)}</em></p>\n`
        break

      case 'header':
      case 'footer':
        if (options.includeHeaderFooter) {
          html += `<p class="${block.type}"${positionData}><small>${escapeHtml(block.text)}</small></p>\n`
        }
        break
    }

    if (addSeparators && block.type === 'heading') {
      html += '<hr>\n'
    }
  }

  return html
}

/**
 * Escapa HTML
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Reconstrói capítulos a partir da análise de layout
 */
export function reconstructChapters(pageLayouts, options = {}) {
  const chapters = []
  let currentChapter = null

  for (const pageLayout of pageLayouts) {
    for (const block of pageLayout.blocks) {
      // Adiciona número da página ao bloco para rastreamento
      block.pageNum = pageLayout.pageNum

      // Novo capítulo quando encontra heading de nível 1
      if (block.type === 'heading' && block.importance === 1) {
        if (currentChapter && currentChapter.blocks.length > 0) {
          chapters.push(currentChapter)
        }
        currentChapter = {
          title: block.text,
          blocks: []
        }
      }

      // Adiciona bloco ao capítulo atual
      if (currentChapter) {
        currentChapter.blocks.push(block)
      } else {
        // Primeiro conteúdo sem título - cria capítulo padrão
        currentChapter = {
          title: `Página ${pageLayout.pageNum}`,
          blocks: [block]
        }
      }
    }
  }

  // Adiciona último capítulo
  if (currentChapter && currentChapter.blocks.length > 0) {
    chapters.push(currentChapter)
  }

  // Se nenhum capítulo foi criado, agrupa tudo
  if (chapters.length === 0) {
    const allBlocks = pageLayouts.flatMap(p => p.blocks.map(b => ({ ...b, pageNum: p.pageNum })))
    chapters.push({
      title: 'Documento',
      blocks: allBlocks
    })
  }

  return chapters.map(chapter => ({
    title: chapter.title,
    data: blocksToHtml(chapter.blocks, options)
  }))
}
