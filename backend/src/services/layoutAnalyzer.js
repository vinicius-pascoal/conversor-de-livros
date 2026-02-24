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

  // Log para verificar ordem das páginas
  console.log(`[RECONSTRUCT] Processando ${pageLayouts.length} páginas`)

  for (const pageLayout of pageLayouts) {
    // GARANTE que blocos dentro da página estão ordenados
    pageLayout.blocks.sort((a, b) => a.yStart - b.yStart)

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

  // Log final - verifica ordem dos blocos em cada capítulo
  chapters.forEach((chapter, idx) => {
    if (chapter.blocks.length > 0) {
      const firstBlock = chapter.blocks[0]
      const lastBlock = chapter.blocks[chapter.blocks.length - 1]
      console.log(`[CAPÍTULO ${idx + 1}] "${chapter.title}" - ${chapter.blocks.length} blocos - Página ${firstBlock.pageNum} Y=${firstBlock.yStart?.toFixed(1)} até Página ${lastBlock.pageNum} Y=${lastBlock.yStart?.toFixed(1)}`)

      // Verifica se há violações de ordem
      for (let i = 1; i < chapter.blocks.length; i++) {
        const prev = chapter.blocks[i - 1]
        const curr = chapter.blocks[i]
        if (prev.pageNum === curr.pageNum && prev.yStart > curr.yStart) {
          console.warn(`  ⚠️ ORDEM VIOLADA: Bloco ${i - 1} (Y=${prev.yStart.toFixed(1)}) vem antes de Bloco ${i} (Y=${curr.yStart.toFixed(1)}) na mesma página ${curr.pageNum}`)
        }
      }
    }
  })

  return chapters.map(chapter => ({
    title: chapter.title,
    data: blocksToHtml(chapter.blocks, options)
  }))
}

// ========== NOVA LÓGICA DE DETECÇÃO DE PARÁGRAFOS ==========

/**
 * Nova função que detecta parágrafos baseada em características reais do PDF
 * Analisa: indentação, espaçamento vertical, fim de linha, alinhamento
 */
function detectParagraphsFromTextItems(textItems, columnBounds, pageWidth) {
  if (textItems.length === 0) return []

  // Ordena items por posição Y (top to bottom)
  const sortedItems = [...textItems].sort((a, b) => a.y - b.y)

  const paragraphs = []
  let currentParagraph = {
    lines: [],
    xStart: null,
    xEnd: null,
    yStart: null,
    yEnd: null
  }

  // Detecta margem esquerda comum (alinhamento padrão)
  const leftMargins = sortedItems.map(item => item.x).sort((a, b) => a - b)
  const commonLeftMargin = leftMargins[Math.floor(leftMargins.length * 0.2)] // 20% percentil
  const marginTolerance = 5 // pixels de tolerância

  // Detecta tamanho de fonte mais comum
  const fontSizes = sortedItems.map(item => item.fontSize)
  const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length

  // Detecta largura média das linhas (para identificar fim de parágrafo)
  const columnWidth = columnBounds.xEnd - columnBounds.xStart
  const lineWidths = []

  console.log(`[NOVA LÓGICA] Analisando ${sortedItems.length} items de texto`)
  console.log(`[NOVA LÓGICA] Margem esquerda comum: ${commonLeftMargin.toFixed(1)}px`)
  console.log(`[NOVA LÓGICA] Fonte média: ${avgFontSize.toFixed(1)}px`)

  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i]
    const prevItem = i > 0 ? sortedItems[i - 1] : null
    const nextItem = i < sortedItems.length - 1 ? sortedItems[i + 1] : null

    let isNewParagraph = false

    if (!prevItem) {
      // Primeiro item sempre inicia um parágrafo
      isNewParagraph = true
    } else {
      // Calcula espaçamento vertical entre esta linha e a anterior
      const verticalGap = item.y - (prevItem.y + prevItem.height)
      const normalLineSpacing = avgFontSize * 0.3 // Espaçamento normal entre linhas
      const paragraphSpacing = avgFontSize * 0.8 // Espaçamento que indica novo parágrafo

      // Calcula características da linha anterior
      const prevLineEnd = prevItem.x + prevItem.width
      const prevLineEndRatio = (prevLineEnd - columnBounds.xStart) / columnWidth

      // Detecta indentação (linha atual recuada em relação à margem comum)
      const hasIndentation = item.x > (commonLeftMargin + marginTolerance)

      // Detecta se linha anterior terminou "cedo" (não chegou até o final)
      // Linhas que terminam antes de 85% da largura da coluna geralmente indicam fim de parágrafo
      const prevLineEndedEarly = prevLineEndRatio < 0.85

      // Detecta mudança significativa de fonte
      const fontSizeChange = Math.abs(item.fontSize - prevItem.fontSize) > 1

      // CRITÉRIOS para novo parágrafo:
      // 1. Espaçamento vertical maior que o normal
      if (verticalGap > paragraphSpacing) {
        isNewParagraph = true
        // console.log(`  → Novo parágrafo por espaçamento: ${verticalGap.toFixed(1)}px`)
      }
      // 2. Linha anterior terminou cedo E há indentação na atual
      else if (prevLineEndedEarly && hasIndentation) {
        isNewParagraph = true
        // console.log(`  → Novo parágrafo por fim de linha + indentação`)
      }
      // 3. Linha anterior terminou cedo E espaçamento > normal (mesmo sem indentação)
      else if (prevLineEndedEarly && verticalGap > normalLineSpacing * 1.5) {
        isNewParagraph = true
        // console.log(`  → Novo parágrafo por fim de linha + espaçamento`)
      }
      // 4. Mudança de tamanho de fonte (provavelmente um título ou seção)
      else if (fontSizeChange) {
        isNewParagraph = true
        // console.log(`  → Novo parágrafo por mudança de fonte`)
      }
      // 5. Linha atual tem indentação significativa (> 15px da margem comum)
      else if (item.x > (commonLeftMargin + 15)) {
        isNewParagraph = true
        // console.log(`  → Novo parágrafo por indentação forte`)
      }
    }

    // Se é novo parágrafo, finaliza o anterior
    if (isNewParagraph && currentParagraph.lines.length > 0) {
      const firstLine = currentParagraph.lines[0]
      const lastLine = currentParagraph.lines[currentParagraph.lines.length - 1]

      currentParagraph.xStart = Math.min(...currentParagraph.lines.map(l => l.x))
      currentParagraph.xEnd = Math.max(...currentParagraph.lines.map(l => l.x + l.width))
      currentParagraph.yStart = firstLine.y
      currentParagraph.yEnd = lastLine.y + (lastLine.height || lastLine.fontSize || 10)

      paragraphs.push({ ...currentParagraph })

      // Inicia novo parágrafo
      currentParagraph = {
        lines: [],
        xStart: null,
        xEnd: null,
        yStart: null,
        yEnd: null
      }
    }

    // Adiciona item ao parágrafo atual
    currentParagraph.lines.push(item)
  }

  // Finaliza último parágrafo
  if (currentParagraph.lines.length > 0) {
    const firstLine = currentParagraph.lines[0]
    const lastLine = currentParagraph.lines[currentParagraph.lines.length - 1]

    currentParagraph.xStart = Math.min(...currentParagraph.lines.map(l => l.x))
    currentParagraph.xEnd = Math.max(...currentParagraph.lines.map(l => l.x + l.width))
    currentParagraph.yStart = firstLine.y
    currentParagraph.yEnd = lastLine.y + (lastLine.height || lastLine.fontSize || 10)

    paragraphs.push(currentParagraph)
  }

  console.log(`[NOVA LÓGICA] Detectados ${paragraphs.length} parágrafos`)

  return paragraphs
}

/**
 * Junta linhas de um parágrafo em texto corrido
 * Remove hifenização e junta palavras corretamente
 */
function joinParagraphLines(lines) {
  if (lines.length === 0) return ''
  if (lines.length === 1) return lines[0].text.trim()

  let result = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = i < lines.length - 1 ? lines[i + 1] : null
    let text = line.text.trim()

    if (!text) continue

    // Detecta e remove hifenização
    if (text.endsWith('-') && nextLine) {
      const nextText = nextLine.text.trim()
      // Se próxima linha começa com minúscula, provavelmente é continuação de palavra hifenizada
      if (nextText && /^[a-záàâãéêíóôõúçñ]/.test(nextText)) {
        text = text.slice(0, -1) // Remove hífen
        result += text
        continue // Não adiciona espaço
      }
    }

    result += text

    // Adiciona espaço entre linhas, exceto se for a última
    if (nextLine) {
      result += ' '
    }
  }

  return result
}

/**
 * Agrupa texto em parágrafos usando a nova lógica de detecção
 * Esta função substitui groupTextIntoBlocks com uma abordagem mais precisa
 */
export function groupTextIntoParagraphsNew(textItems, columns, pageWidth) {
  const allParagraphs = []
  const processedItems = new Set()

  console.log(`[NOVA LÓGICA] Iniciando detecção com ${columns.length} coluna(s)`)

  // Processa cada coluna separadamente
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const column = columns[colIndex]

    // Filtra items que pertencem a esta coluna
    // Usa o CENTRO do item para determinar a coluna (mais preciso)
    const columnItems = textItems.filter(item => {
      const itemCenter = item.x + (item.width / 2)
      const belongsToColumn = itemCenter >= column.xStart && itemCenter < column.xEnd
      if (belongsToColumn && !processedItems.has(item)) {
        processedItems.add(item)
        return true
      }
      return false
    })

    if (columnItems.length === 0) continue

    console.log(`[NOVA LÓGICA] Coluna ${colIndex + 1}/${columns.length}: ${columnItems.length} items`)
    console.log(`[NOVA LÓGICA] Coluna bounds: X ${column.xStart.toFixed(1)} - ${column.xEnd.toFixed(1)}`)

    // Detecta parágrafos nesta coluna
    const paragraphs = detectParagraphsFromTextItems(columnItems, column, pageWidth)

    // Converte parágrafos em blocos compatíveis com o formato existente
    for (const para of paragraphs) {
      // Detecta tipo baseado em características
      const avgFontSize = para.lines.reduce((sum, l) => sum + l.fontSize, 0) / para.lines.length
      const allFontSizes = textItems.map(item => item.fontSize)
      const globalAvgFontSize = allFontSizes.reduce((sum, s) => sum + s, 0) / allFontSizes.length

      let type = 'paragraph'
      let importance = 0

      // Título se fonte é significativamente maior
      if (avgFontSize > globalAvgFontSize * 1.3) {
        type = 'heading'
        importance = avgFontSize > globalAvgFontSize * 1.8 ? 1 : 2
      }

      // Caption se texto é muito curto
      const text = joinParagraphLines(para.lines)
      if (text.length < 50 && type === 'paragraph') {
        type = 'caption'
      }

      allParagraphs.push({
        type,
        importance,
        text,
        xStart: para.xStart,
        xEnd: para.xEnd,
        yStart: para.yStart,
        yEnd: para.yEnd,
        lines: para.lines,
        fontSize: avgFontSize,
        columnIndex: colIndex
      })
    }
  }

  // Verifica se todos os items foram processados
  const unprocessedItems = textItems.filter(item => !processedItems.has(item))
  if (unprocessedItems.length > 0) {
    console.warn(`[NOVA LÓGICA] ⚠️ ${unprocessedItems.length} items não foram processados em nenhuma coluna`)
    console.warn(`[NOVA LÓGICA] Processando items restantes...`)

    // Processa items não atribuídos (geralmente imagens ou elementos fora das margens)
    // Atribui à coluna mais próxima baseado na posição X
    for (const item of unprocessedItems) {
      const itemCenter = item.x + (item.width / 2)
      let closestColIndex = 0
      let minDistance = Math.abs(itemCenter - (columns[0].xStart + columns[0].xEnd) / 2)

      for (let i = 1; i < columns.length; i++) {
        const colCenter = (columns[i].xStart + columns[i].xEnd) / 2
        const distance = Math.abs(itemCenter - colCenter)
        if (distance < minDistance) {
          minDistance = distance
          closestColIndex = i
        }
      }

      console.log(`[NOVA LÓGICA] Item "${item.text.substring(0, 30)}" atribuído à coluna ${closestColIndex + 1}`)
      // Adiciona como parágrafo isolado
      allParagraphs.push({
        type: 'paragraph',
        importance: 0,
        text: item.text,
        xStart: item.x,
        xEnd: item.x + item.width,
        yStart: item.y,
        yEnd: item.y + (item.height || item.fontSize || 10),
        lines: [item],
        fontSize: item.fontSize,
        columnIndex: closestColIndex
      })
    }
  }

  // Ordena parágrafos por coluna e depois por posição Y
  allParagraphs.sort((a, b) => {
    if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex
    return a.yStart - b.yStart
  })

  console.log(`[NOVA LÓGICA] Total de ${allParagraphs.length} parágrafos detectados e ordenados`)
  console.log(`[DEBUG-ORDER] Primeiros 5 parágrafos após ordenação:`)
  for (let i = 0; i < Math.min(5, allParagraphs.length); i++) {
    const para = allParagraphs[i]
    console.log(`  ${i + 1}. Col=${para.columnIndex} Y=${para.yStart.toFixed(1)}-${para.yEnd.toFixed(1)} tipo=${para.type} texto="${para.text.substring(0, 50)}"`)
  }

  if (allParagraphs.length > 5) {
    console.log(`[DEBUG-ORDER] ... e outros ${allParagraphs.length - 5} parágrafos`)
  }

  return allParagraphs
}

/**
 * Versão simplificada que processa todos os items em ordem Y global
 * Garante que a ordem de leitura seja preservada perfeitamente
 */
export function groupTextIntoParagraphsSimple(textItems, columns, pageWidth) {
  if (textItems.length === 0) return []

  console.log(`[DETECÇÃO-SIMPLES] Processando ${textItems.length} items de texto`)

  // Ordena TODOS os items por posição Y primeiro (ordem de leitura natural)
  const sortedItems = [...textItems].sort((a, b) => a.y - b.y)

  const paragraphs = []
  let currentParagraph = {
    lines: [],
    yStart: null,
    yEnd: null
  }

  // Calcula métricas globais
  const avgFontSize = sortedItems.reduce((sum, item) => sum + item.fontSize, 0) / sortedItems.length
  const leftMargins = sortedItems.map(item => item.x).sort((a, b) => a - b)
  const commonLeftMargin = leftMargins[Math.floor(leftMargins.length * 0.2)]

  console.log(`[DETECÇÃO-SIMPLES] Fonte média: ${avgFontSize.toFixed(1)}px, Margem esquerda: ${commonLeftMargin.toFixed(1)}px`)

  // Itera pelos items em ordem Y
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i]
    const prevItem = i > 0 ? sortedItems[i - 1] : null

    let isNewParagraph = false

    if (!prevItem) {
      isNewParagraph = true
    } else {
      // Espaçamento vertical
      const verticalGap = item.y - (prevItem.y + (prevItem.height || prevItem.fontSize || 10))
      const paragraphThreshold = avgFontSize * 0.7

      // Mudança de fonte
      const fontChange = Math.abs(item.fontSize - prevItem.fontSize) > 1

      // Detecta se linha anterior terminou cedo
      const prevLineWidth = prevItem.width
      const expectedLineWidth = pageWidth * 0.7 // 70% da largura como linha "completa"
      const prevLineEndedEarly = prevLineWidth < expectedLineWidth

      // Detecta indentação
      const hasIndentation = item.x > (commonLeftMargin + 10)

      // CRITÉRIOS SIMPLIFICADOS:
      if (verticalGap > paragraphThreshold) {
        isNewParagraph = true
      } else if (fontChange) {
        isNewParagraph = true
      } else if (prevLineEndedEarly && verticalGap > avgFontSize * 0.3) {
        isNewParagraph = true
      } else if (hasIndentation && verticalGap > avgFontSize * 0.2) {
        isNewParagraph = true
      }
    }

    // Finaliza parágrafo anterior se necessário
    if (isNewParagraph && currentParagraph.lines.length > 0) {
      const firstLine = currentParagraph.lines[0]
      const lastLine = currentParagraph.lines[currentParagraph.lines.length - 1]

      currentParagraph.yStart = firstLine.y
      currentParagraph.yEnd = lastLine.y + (lastLine.height || lastLine.fontSize || 10)
      currentParagraph.xStart = Math.min(...currentParagraph.lines.map(l => l.x))
      currentParagraph.xEnd = Math.max(...currentParagraph.lines.map(l => l.x + l.width))

      paragraphs.push({ ...currentParagraph })

      currentParagraph = {
        lines: [],
        yStart: null,
        yEnd: null
      }
    }

    currentParagraph.lines.push(item)
  }

  // Finaliza último parágrafo
  if (currentParagraph.lines.length > 0) {
    const firstLine = currentParagraph.lines[0]
    const lastLine = currentParagraph.lines[currentParagraph.lines.length - 1]

    currentParagraph.yStart = firstLine.y
    currentParagraph.yEnd = lastLine.y + (lastLine.height || lastLine.fontSize || 10)
    currentParagraph.xStart = Math.min(...currentParagraph.lines.map(l => l.x))
    currentParagraph.xEnd = Math.max(...currentParagraph.lines.map(l => l.x + l.width))

    paragraphs.push(currentParagraph)
  }

  console.log(`[DETECÇÃO-SIMPLES] ${paragraphs.length} parágrafos detectados`)

  // Converte para formato de blocos
  const blocks = paragraphs.map((para, idx) => {
    const avgParaFontSize = para.lines.reduce((sum, l) => sum + l.fontSize, 0) / para.lines.length
    const text = joinParagraphLines(para.lines)

    let type = 'paragraph'
    let importance = 0

    // Detecta títulos por tamanho de fonte
    if (avgParaFontSize > avgFontSize * 1.3) {
      type = 'heading'
      importance = avgParaFontSize > avgFontSize * 1.8 ? 1 : 2
    }

    // Detecta captions
    if (text.length < 50 && type === 'paragraph') {
      type = 'caption'
    }

    return {
      type,
      importance,
      text,
      xStart: para.xStart,
      xEnd: para.xEnd,
      yStart: para.yStart,
      yEnd: para.yEnd,
      lines: para.lines,
      fontSize: avgParaFontSize,
      columnIndex: 0 // Não usamos colunas nesta versão
    }
  })

  // GARANTE que os blocos estão ordenados por Y (ordem de leitura)
  blocks.sort((a, b) => a.yStart - b.yStart)

  console.log(`[DETECÇÃO-SIMPLES] Primeiros 3 parágrafos na ordem (após sort final):`)
  for (let i = 0; i < Math.min(3, blocks.length); i++) {
    console.log(`  ${i + 1}. Y=${blocks[i].yStart.toFixed(1)} tipo=${blocks[i].type} texto="${blocks[i].text.substring(0, 50)}"`)
  }

  return blocks
}

/**
 * Nova função de análise de layout que usa a detecção precisa de parágrafos
 * Substituir analyzePageLayout pela chamada a esta função
 */
export function analyzePageLayoutWithParagraphs(textContent, viewport, operatorList, pageNum) {
  const pageWidth = viewport.width
  const pageHeight = viewport.height

  console.log(`[NOVA LÓGICA] Analisando página ${pageNum}`)

  // Extrai items de texto com metadados completos
  const textItems = textContent.items.map(item => ({
    text: item.str,
    x: item.transform[4],
    y: pageHeight - item.transform[5], // Inverte Y para facilitar ordenação
    yOriginal: item.transform[5], // Mantém Y original para debug
    width: item.width,
    height: item.height,
    fontSize: Math.abs(item.transform[0]),
    fontName: item.fontName,
    transform: item.transform
  })).filter(item => item.text.trim().length > 0)

  // Detecta colunas baseado em agrupamento horizontal
  const columns = detectColumns(textItems, pageWidth)
  console.log(`[NOVA LÓGICA] ${columns.length} coluna(s) detectada(s)`)

  // USA A VERSÃO SIMPLIFICADA QUE GARANTE ORDEM PERFEITA
  console.log(`[NOVA LÓGICA] Usando detecção SIMPLIFICADA para garantir ordem correta`)
  const paragraphs = groupTextIntoParagraphsSimple(textItems, columns, pageWidth)

  // Filtra cabeçalhos e rodapés
  const contentParagraphs = paragraphs.filter(para => {
    // Cabeçalho: topo da página (Y pequeno após inversão)
    if (para.yStart < pageHeight * 0.10) {
      para.type = 'header'
      return false // Remove da lista principal
    }
    // Rodapé: base da página (Y grande após inversão)
    if (para.yEnd > pageHeight * 0.90) {
      para.type = 'footer'
      return false // Remove da lista principal
    }
    return true
  })

  // GARANTE ordenação por Y após filtro
  contentParagraphs.sort((a, b) => a.yStart - b.yStart)

  // Log para verificar ordem final
  if (contentParagraphs.length > 0) {
    console.log(`[PÁGINA ${pageNum}] ${contentParagraphs.length} blocos - Primeiro Y=${contentParagraphs[0].yStart.toFixed(1)}, Último Y=${contentParagraphs[contentParagraphs.length - 1].yStart.toFixed(1)}`)
  }

  return {
    pageNum,
    width: pageWidth,
    height: pageHeight,
    columns: columns.length,
    blocks: contentParagraphs // Retorna parágrafos como blocos
  }
}

/**
 * Versão alternativa de analyzePdfLayout que usa a nova detecção de parágrafos
 */
export async function analyzePdfLayoutWithParagraphs(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    verbosity: 0
  })
  const pdfDocument = await loadingTask.promise

  console.log('[NOVA LÓGICA] Iniciando análise com detecção precisa de parágrafos')

  const pageLayouts = []

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.0 })

    // Extrai texto com posições
    const textContent = await page.getTextContent()

    // Extrai operadores gráficos para detectar linhas/caixas
    const operatorList = await page.getOperatorList()

    // USA A NOVA ANÁLISE DE PÁGINA
    const pageLayout = analyzePageLayoutWithParagraphs(textContent, viewport, operatorList, pageNum)
    pageLayouts.push(pageLayout)
  }

  console.log(`[NOVA LÓGICA] Análise concluída: ${pdfDocument.numPages} páginas processadas`)

  return {
    pages: pageLayouts,
    totalPages: pdfDocument.numPages
  }
}
