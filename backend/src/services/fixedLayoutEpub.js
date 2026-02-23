import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import { v4 as uuidv4 } from 'uuid'

/**
 * Gera um EPUB 3.0 com Fixed Layout para preservar posicionamento exato
 * @param {Object} options - Opções do EPUB
 * @param {string} outputPath - Caminho do arquivo EPUB de saída
 * @returns {Promise<void>}
 */
export async function generateFixedLayoutEpub(options, outputPath) {
  const {
    title = 'Documento',
    author = 'Autor Desconhecido',
    publisher = 'Conversor PDF-EPUB',
    language = 'pt',
    pages = [], // Array de objetos { pageNum, imagePath, width, height, svgContent }
    coverImagePath = null
  } = options

  console.log('📚 Gerando EPUB Fixed Layout...')
  console.log(`📄 Total de páginas: ${pages.length}`)

  // Cria estrutura temporária do EPUB
  const tempDir = path.join(path.dirname(outputPath), `.epub-temp-${Date.now()}`)
  await fs.promises.mkdir(tempDir, { recursive: true })

  try {
    // Estrutura EPUB
    const metaInfDir = path.join(tempDir, 'META-INF')
    const oebpsDir = path.join(tempDir, 'OEBPS')
    const imagesDir = path.join(oebpsDir, 'images')
    const textDir = path.join(oebpsDir, 'text')

    await fs.promises.mkdir(metaInfDir, { recursive: true })
    await fs.promises.mkdir(oebpsDir, { recursive: true })
    await fs.promises.mkdir(imagesDir, { recursive: true })
    await fs.promises.mkdir(textDir, { recursive: true })

    // 1. mimetype (sem compressão)
    await fs.promises.writeFile(
      path.join(tempDir, 'mimetype'),
      'application/epub+zip',
      { encoding: 'utf8' }
    )

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    await fs.promises.writeFile(path.join(metaInfDir, 'container.xml'), containerXml)

    // 3. Copia as imagens
    const imageManifestItems = []
    const spineItems = []

    for (const page of pages) {
      const imageFileName = `page-${String(page.pageNum).padStart(4, '0')}.png`
      const imageDestPath = path.join(imagesDir, imageFileName)
      await fs.promises.copyFile(page.imagePath, imageDestPath)

      imageManifestItems.push({
        id: `img-${page.pageNum}`,
        href: `images/${imageFileName}`,
        mediaType: 'image/png'
      })

      // Cria XHTML para cada página com Fixed Layout
      const xhtmlFileName = `page-${String(page.pageNum).padStart(4, '0')}.xhtml`
      const xhtmlContent = createFixedLayoutPage(page, imageFileName)
      await fs.promises.writeFile(path.join(textDir, xhtmlFileName), xhtmlContent)

      spineItems.push({
        id: `page-${page.pageNum}`,
        href: `text/${xhtmlFileName}`
      })
    }

    // 4. Copia a capa se fornecida
    let coverManifestItem = null
    if (coverImagePath && fs.existsSync(coverImagePath)) {
      const coverExt = path.extname(coverImagePath)
      const coverFileName = `cover${coverExt}`
      await fs.promises.copyFile(coverImagePath, path.join(imagesDir, coverFileName))

      const coverMediaType = coverExt === '.png' ? 'image/png' : 'image/jpeg'
      coverManifestItem = {
        id: 'cover-image',
        href: `images/${coverFileName}`,
        mediaType: coverMediaType,
        properties: 'cover-image'
      }
    }

    // 5. content.opf (Package Document)
    const contentOpf = generateContentOpf({
      title,
      author,
      publisher,
      language,
      pages: spineItems,
      images: imageManifestItems,
      coverImage: coverManifestItem
    })
    await fs.promises.writeFile(path.join(oebpsDir, 'content.opf'), contentOpf)

    // 6. toc.ncx (Navegação)
    const tocNcx = generateTocNcx({ title, pages: spineItems })
    await fs.promises.writeFile(path.join(oebpsDir, 'toc.ncx'), tocNcx)

    // 7. nav.xhtml (EPUB 3 Navigation Document)
    const navXhtml = generateNavXhtml({ title, pages: spineItems })
    await fs.promises.writeFile(path.join(oebpsDir, 'nav.xhtml'), navXhtml)

    // 8. CSS para Fixed Layout com texto sobreposto
    const cssContent = `
@page {
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.page img {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.text-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

.text-line {
  position: absolute;
  color: #000;
  font-family: 'Helvetica', 'Arial', sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  pointer-events: auto;
  user-select: text;
}
`
    await fs.promises.writeFile(path.join(oebpsDir, 'style.css'), cssContent)

    // 9. Compacta tudo em EPUB
    await zipEpub(tempDir, outputPath)

    console.log('✅ EPUB Fixed Layout gerado com sucesso!')

  } finally {
    // Limpa diretório temporário
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  }
}

/**
 * Cria página XHTML com Fixed Layout e texto traduzido sobreposto
 */
function createFixedLayoutPage(page, imageFileName) {
  const { width, height, pageNum, textItems } = page

  let textOverlay = ''

  // Se há textos traduzidos, adiciona overlay
  if (textItems && textItems.length > 0) {
    textOverlay = '<div class="text-overlay">\n'

    // Agrupa textos por linha (Y similar)
    const lines = []
    const sortedItems = [...textItems].sort((a, b) => {
      const yDiff = Math.abs(b.y - a.y)
      if (yDiff > 3) return b.y - a.y
      return a.x - b.x
    })

    let currentLine = null
    for (const item of sortedItems) {
      if (!currentLine || Math.abs(item.y - currentLine.y) > 3) {
        if (currentLine) lines.push(currentLine)
        currentLine = {
          items: [item],
          y: item.y,
          x: item.x,
          fontSize: item.fontSize
        }
      } else {
        currentLine.items.push(item)
        currentLine.fontSize = Math.max(currentLine.fontSize, item.fontSize)
      }
    }
    if (currentLine) lines.push(currentLine)

    // Renderiza cada linha de texto traduzido
    for (const line of lines) {
      const lineText = line.items
        .map(item => item.translatedText || item.text)
        .join(' ')
        .trim()

      if (lineText.length === 0) continue

      const escapedText = escapeXml(lineText)

      // Calcula posição e tamanho
      const x = line.x
      const y = line.y
      const fontSize = Math.max(6, Math.min(line.fontSize, 18))

      // Calcula largura disponível
      const lastItem = line.items[line.items.length - 1]
      const maxWidth = (lastItem.x + lastItem.width) - line.x

      textOverlay += `    <div class="text-line" style="left: ${x.toFixed(2)}px; top: ${y.toFixed(2)}px; font-size: ${fontSize.toFixed(1)}px; max-width: ${maxWidth.toFixed(2)}px;">${escapedText}</div>\n`
    }

    textOverlay += '  </div>\n'
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>Página ${pageNum}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
  <meta name="viewport" content="width=${width}, height=${height}"/>
</head>
<body>
  <div class="page">
    <img src="../images/${imageFileName}" alt="Página ${pageNum}" 
         width="${width}" height="${height}"/>
    ${textOverlay}
  </div>
</body>
</html>`
}

/**
 * Gera content.opf
 */
function generateContentOpf(options) {
  const { title, author, publisher, language, pages, images, coverImage } = options
  const uuid = uuidv4()
  const timestamp = new Date().toISOString()

  let manifestItems = ''

  // CSS
  manifestItems += '    <item id="css" href="style.css" media-type="text/css"/>\n'

  // Nav
  manifestItems += '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
  manifestItems += '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n'

  // Capa
  if (coverImage) {
    manifestItems += `    <item id="${coverImage.id}" href="${coverImage.href}" media-type="${coverImage.mediaType}" properties="${coverImage.properties}"/>\n`
  }

  // Páginas
  for (const page of pages) {
    manifestItems += `    <item id="${page.id}" href="${page.href}" media-type="application/xhtml+xml"/>\n`
  }

  // Imagens
  for (const img of images) {
    manifestItems += `    <item id="${img.id}" href="${img.href}" media-type="${img.mediaType}"/>\n`
  }

  let spineItems = ''
  for (const page of pages) {
    spineItems += `    <itemref idref="${page.id}"/>\n`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid_id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uuid_id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:publisher>${escapeXml(publisher)}</dc:publisher>
    <dc:language>${language}</dc:language>
    <dc:date>${timestamp}</dc:date>
    <meta property="dcterms:modified">${timestamp}</meta>
    <!-- Fixed Layout Metadata -->
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
${manifestItems}  </manifest>
  <spine toc="ncx">
${spineItems}  </spine>
</package>`
}

/**
 * Gera toc.ncx
 */
function generateTocNcx(options) {
  const { title, pages } = options
  const uuid = uuidv4()

  let navPoints = ''
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    navPoints += `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>Página ${i + 1}</text>
      </navLabel>
      <content src="${page.href}"/>
    </navPoint>\n`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
${navPoints}  </navMap>
</ncx>`
}

/**
 * Gera nav.xhtml
 */
function generateNavXhtml(options) {
  const { title, pages } = options

  let navItems = ''
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    navItems += `      <li><a href="${page.href}">Página ${i + 1}</a></li>\n`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>Índice</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXml(title)}</h1>
    <ol>
${navItems}    </ol>
  </nav>
</body>
</html>`
}

/**
 * Compacta o diretório em arquivo EPUB (ZIP)
 */
async function zipEpub(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', {
      zlib: { level: 9 }
    })

    output.on('close', () => {
      console.log(`📦 EPUB compactado: ${archive.pointer()} bytes`)
      resolve()
    })

    archive.on('error', reject)
    archive.pipe(output)

    // mimetype deve ser o primeiro arquivo, sem compressão
    archive.file(path.join(sourceDir, 'mimetype'), {
      name: 'mimetype',
      store: true
    })

    // Resto do conteúdo
    archive.directory(path.join(sourceDir, 'META-INF'), 'META-INF')
    archive.directory(path.join(sourceDir, 'OEBPS'), 'OEBPS')

    archive.finalize()
  })
}

/**
 * Escapa XML
 */
function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
