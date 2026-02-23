import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import os from 'os'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'
import { translateText } from './translator.js'

/**
 * Extrai imagens embutidas do PDF
 */
async function extractImagesFromPdf(pdfPath) {
  const images = []

  try {
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0
    })
    const pdfDocument = await loadingTask.promise

    console.log('🖼️ Extraindo imagens do PDF...')

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const ops = await page.getOperatorList()

      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
          ops.fnArray[i] === pdfjsLib.OPS.paintInlineImageXObject ||
          ops.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {

          const imageName = ops.argsArray[i][0]

          try {
            const image = await page.objs.get(imageName)

            if (image && image.width && image.height) {
              images.push({
                page: pageNum,
                width: image.width,
                height: image.height,
                data: image.data || image
              })
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao extrair imagem na página ${pageNum}:`, err.message)
          }
        }
      }
    }

    console.log(`✅ ${images.length} imagens extraídas`)
    return images
  } catch (error) {
    console.error('❌ Erro ao extrair imagens:', error)
    return []
  }
}

/**
 * Renderiza cada página do PDF como imagem de alta qualidade
 * E apaga o texto original usando o canvas antes de salvar
 */
async function renderPdfPages(pdfPath, scale = 2.0, removeText = false) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-render-'))
  const pages = []

  try {
    const dataBuffer = await fs.promises.readFile(pdfPath)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0
    })
    const pdfDocument = await loadingTask.promise

    console.log(`🎨 Renderizando ${pdfDocument.numPages} páginas...`)

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

      // Renderiza o PDF completo
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
          x: item.transform[4] * scale,
          y: item.transform[5] * scale,
          width: item.width * scale,
          height: item.height * scale,
          fontSize: Math.abs(item.transform[0])
        }))

      // Se removeText está habilitado, apaga as áreas de texto no canvas
      if (removeText && textItems.length > 0) {
        context.fillStyle = 'white'

        // Agrupa textos por linha para criar retângulos maiores e mais eficientes
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
          const y = viewport.height - line.y - line.height - 2
          const width = line.width + 4
          const height = line.height + 4

          context.fillRect(x, y, width, height)
        }

        console.log(`  🧹 Removidas ${lines.length} linhas de texto da página ${pageNum}`)
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
        width: viewport.width / scale, // Largura em pontos
        height: viewport.height / scale, // Altura em pontos
        renderWidth: viewport.width, // Largura renderizada
        renderHeight: viewport.height, // Altura renderizada
        scale,
        textItems: textItems.map(item => ({
          ...item,
          x: item.x / scale,
          y: item.y / scale,
          width: item.width / scale,
          height: item.height / scale
        }))
      })

      if (pageNum % 5 === 0 || pageNum === pdfDocument.numPages) {
        console.log(`  ✅ ${pageNum}/${pdfDocument.numPages} páginas renderizadas`)
      }
    }

    console.log(`✨ Todas as ${pages.length} páginas renderizadas`)
    return { pages, tempDir }

  } catch (error) {
    console.error('❌ Erro ao renderizar páginas:', error)
    throw error
  }
}

/**
 * Gera PDF preservando layout e imagens, com texto traduzido
 */
export async function generatePdfWithLayout({
  pdfPath,
  outputPath,
  title,
  translate = false,
  targetLang = 'pt',
  progress = null
}) {
  let tempDir = null

  try {
    progress?.({ type: 'log', message: 'Iniciando geração de PDF com preservação de layout...' })

    // 1. Renderiza páginas e remove texto original se for traduzir
    if (translate) {
      progress?.({ type: 'log', message: 'Renderizando páginas e removendo texto original...' })
    } else {
      progress?.({ type: 'log', message: 'Renderizando páginas do PDF original...' })
    }
    const { pages, tempDir: renderDir } = await renderPdfPages(pdfPath, 2.0, translate)
    tempDir = renderDir

    // 2. Extrai imagens (se necessário)
    const images = await extractImagesFromPdf(pdfPath)
    progress?.({ type: 'log', message: `${images.length} imagens extraídas` })

    // 3. Se tradução está habilitada, traduz os textos
    if (translate) {
      progress?.({ type: 'phase', phase: 'translating' })
      progress?.({ type: 'log', message: 'Traduzindo textos...' })

      let totalItems = 0
      for (const page of pages) {
        totalItems += page.textItems.length
      }

      let translatedItems = 0
      for (const page of pages) {
        for (const item of page.textItems) {
          if (item.text.trim().length > 0) {
            try {
              const translated = await translateText(item.text, targetLang, 'auto')
              item.translatedText = translated
              translatedItems++

              if (translatedItems % 20 === 0) {
                const pct = Math.round((translatedItems / totalItems) * 100)
                progress?.({ type: 'log', message: `Tradução: ${pct}% (${translatedItems}/${totalItems})` })
              }

              // Pequeno delay para evitar rate limiting
              if (translatedItems % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100))
              }
            } catch (err) {
              console.warn('⚠️ Erro ao traduzir item:', err.message)
              item.translatedText = item.text
            }
          }
        }
      }

      console.log(`✅ ${translatedItems} itens de texto traduzidos`)
    }

    // 4. Cria o PDF final
    progress?.({ type: 'phase', phase: 'generating' })
    progress?.({ type: 'log', message: 'Gerando PDF final...' })

    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: title,
        Author: 'Conversor de Livros',
        Subject: translate ? 'PDF Traduzido com Layout Preservado' : 'PDF com Layout Preservado',
        CreationDate: new Date()
      }
    })

    const writeStream = fs.createWriteStream(outputPath)
    doc.pipe(writeStream)

    // 5. Adiciona cada página
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]

      // Adiciona página com tamanho correto
      doc.addPage({
        size: [page.width, page.height],
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })

      // Adiciona imagem de fundo (com ou sem texto original removido)
      if (fs.existsSync(page.imagePath)) {
        doc.image(page.imagePath, 0, 0, {
          width: page.width,
          height: page.height
        })
      }

      // Adiciona texto (traduzido ou original) nas posições corretas
      // Agrupa por linha e controla espaçamento para evitar sobreposição
      if (page.textItems && page.textItems.length > 0) {
        doc.save()

        // Agrupa itens de texto por linha (Y similar)
        const lines = []

        // Ordena por Y (de cima para baixo) e depois X (esquerda para direita)
        const sortedItems = [...page.textItems].sort((a, b) => {
          const yDiff = Math.abs(b.y - a.y)
          if (yDiff > 3) return b.y - a.y  // Y maior = mais acima (invertido no PDF)
          return a.x - b.x
        })

        // Agrupa itens na mesma linha
        let currentLine = null
        for (const item of sortedItems) {
          if (!currentLine || Math.abs(item.y - currentLine.y) > 3) {
            if (currentLine) lines.push(currentLine)
            currentLine = {
              items: [item],
              y: item.y,
              x: item.x,
              height: item.height,
              fontSize: item.fontSize
            }
          } else {
            currentLine.items.push(item)
            // Atualiza propriedades da linha
            currentLine.height = Math.max(currentLine.height, item.height)
            currentLine.fontSize = Math.max(currentLine.fontSize, item.fontSize)
          }
        }
        if (currentLine) lines.push(currentLine)

        console.log(`  📝 Página ${page.pageNum}: ${lines.length} linhas de texto agrupadas`)

        // Renderiza cada linha, controlando espaçamento vertical
        let lastY = -1000 // Y da última linha renderizada

        for (const line of lines) {
          // Junta todos os textos da linha
          const lineText = line.items
            .map(item => translate ? (item.translatedText || item.text) : item.text)
            .join(' ')

          if (lineText.trim().length === 0) continue

          // Posição Y corrigida (inverte coordenadas do PDF)
          let x = line.x
          let y = page.height - line.y - line.height

          // Verifica se há sobreposição com a linha anterior
          const lineSpacing = line.height * 0.3 // Espaçamento mínimo entre linhas
          if (lastY !== -1000 && y < lastY + lineSpacing) {
            // Ajusta Y para não sobrepor
            y = lastY + lineSpacing
            console.log(`  ⚠️ Ajustado Y para evitar sobreposição (${y.toFixed(1)})`)
          }

          // Limita o tamanho da fonte
          let fontSize = Math.max(7, Math.min(line.fontSize, 18))

          try {
            // Calcula largura disponível
            const maxWidth = page.width - x - 10

            // Calcula largura da linha original
            const lastItem = line.items[line.items.length - 1]
            const originalWidth = (lastItem.x + lastItem.width) - line.x
            const targetWidth = Math.min(originalWidth * 1.3, maxWidth)

            // Ajusta fonte se o texto traduzido for muito mais longo
            const originalLength = line.items.reduce((sum, item) => sum + item.text.length, 0)
            const translatedLength = lineText.length
            const lengthRatio = translatedLength / originalLength

            if (lengthRatio > 1.4) {
              fontSize = Math.max(6, fontSize / Math.sqrt(lengthRatio * 0.9))
            }

            // Mede o texto com a fonte atual
            doc.fontSize(fontSize)
            let textWidth = doc.widthOfString(lineText)

            // Se ainda não cabe, reduz mais a fonte
            let attempts = 0
            while (textWidth > targetWidth && fontSize > 5 && attempts < 10) {
              fontSize = fontSize * 0.92
              doc.fontSize(fontSize)
              textWidth = doc.widthOfString(lineText)
              attempts++
            }

            // Renderiza o texto da linha
            doc.fontSize(fontSize)
              .fillColor('black')
              .font('Helvetica')
              .text(lineText, x, y, {
                width: targetWidth,
                lineBreak: false, // Mantém na mesma linha
                continued: false,
                ellipsis: true
              })

            // Atualiza última posição Y usada (necessário para próxima linha)
            lastY = y + fontSize * 1.2 // Altura estimada da linha

          } catch (err) {
            console.warn(`⚠️ Erro ao desenhar linha na página ${page.pageNum}:`, err.message)
          }
        }

        doc.restore()
      }

      if ((i + 1) % 10 === 0 || i === pages.length - 1) {
        progress?.({ type: 'log', message: `Processadas ${i + 1}/${pages.length} páginas` })
      }
    }

    doc.end()

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Limpa arquivos temporários
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }

    progress?.({ type: 'log', message: 'PDF gerado com sucesso!' })
    console.log('✅ PDF com layout preservado gerado:', outputPath)

    return outputPath

  } catch (error) {
    // Limpa em caso de erro
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { })
    }

    console.error('❌ Erro ao gerar PDF com layout:', error)
    throw error
  }
}
