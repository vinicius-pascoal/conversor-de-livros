import fs from 'fs'
import pdfParse from 'pdf-parse'
import Epub from 'epub-gen'

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
    console.log('🔄 Iniciando conversão...')
    console.log('⚡ fastMode:', fastMode)
    console.time('pdf-total')

    // Ler o PDF
    console.time('pdf-read')
    const dataBuffer = await fs.promises.readFile(pdfPath)
    console.timeEnd('pdf-read')

    console.time('pdf-parse')
    const pdfData = await runWithTimeout(pdfParse(dataBuffer), 30000, 'pdf-parse')
    console.timeEnd('pdf-parse')

    console.log('📖 PDF lido com sucesso')
    console.log('📊 Páginas:', pdfData.numpages)
    console.log('📝 Texto extraído:', pdfData.text.length, 'caracteres')

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('Nenhum texto extraído do PDF (pode ser digitalizado sem OCR)')
    }

    // Limita tamanho para evitar lentidão extrema em PDFs gigantes
    const MAX_CHARS = 800_000
    const text = pdfData.text.length > MAX_CHARS
      ? pdfData.text.slice(0, MAX_CHARS)
      : pdfData.text

    // Extrair título do nome do arquivo ou usar texto
    const title = originalFilename.replace('.pdf', '') || 'Documento Convertido'

    console.time('split-chapters')
    let chapters
    if (fastMode) {
      // Modo rápido: um capítulo único para reduzir tempo
      chapters = [{ title: 'Conteúdo', data: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` }]
      console.timeEnd('split-chapters')
    } else {
      chapters = await runWithTimeout(
        Promise.resolve().then(() => splitIntoChapters(text, pdfData.numpages)),
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
      cover: '', // Você pode adicionar uma capa se quiser
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
        content: [{ title: 'Conteúdo', data: `<pre>${escapeHtml(text)}</pre>` }],
        lang: 'pt'
      }
      await runWithTimeout(new Epub(fallbackOptions, epubPath).promise, 15000, 'epub-gen-fallback')
    }

    console.timeEnd('epub-gen')
    console.timeEnd('pdf-total')
    console.log('✨ EPUB gerado com sucesso!')

    return epubPath

  } catch (error) {
    console.error('Erro na conversão:', error)
    throw new Error(`Falha ao converter PDF para EPUB: ${error.message}`)
  }
}

function splitIntoChapters(text, numPages) {
  // Tentar dividir por quebras de página ou seções
  const chapters = []

  const safePages = numPages && numPages > 0 ? numPages : Math.max(Math.ceil(text.length / 2000), 1)

  // Se o texto for muito pequeno, criar um único capítulo
  if (text.length < 1000) {
    return [{
      title: 'Capítulo 1',
      data: `<p>${text.replace(/\n/g, '</p><p>')}</p>`
    }]
  }

  // Dividir o texto em partes aproximadamente iguais baseado no número de páginas
  const charsPerPage = Math.ceil(text.length / safePages)
  let currentPos = 0
  let chapterNum = 1

  while (currentPos < text.length) {
    let endPos = currentPos + charsPerPage * 5 // Agrupar ~5 páginas por capítulo
    if (endPos > text.length) endPos = text.length

    // Tentar encontrar o fim de um parágrafo
    const nextBreak = text.indexOf('\n\n', endPos - 100)
    if (nextBreak !== -1 && nextBreak < endPos + 100) {
      endPos = nextBreak
    }

    const chapterText = text.substring(currentPos, endPos).trim()

    if (chapterText.length > 0) {
      chapters.push({
        title: `Capítulo ${chapterNum}`,
        data: `<p>${chapterText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
      })
      chapterNum++
    }

    currentPos = endPos
  }

  // Se não conseguiu dividir em capítulos, criar um único
  if (chapters.length === 0) {
    chapters.push({
      title: 'Conteúdo',
      data: `<p>${text.replace(/\n/g, '</p><p>')}</p>`
    })
  }

  return chapters
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
