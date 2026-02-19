import PDFDocument from 'pdfkit'
import fs from 'fs'

/**
 * Gera um PDF formatado a partir de texto e título.
 */
export async function generatePdf({ text, title, outputPath, coverPath = null, progress = null }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A5',
        bufferPages: true,
        margins: { top: 60, bottom: 60, left: 55, right: 55 },
        info: {
          Title: title,
          Author: 'Conversor de Livros',
          Creator: 'PDF Traduzido',
          CreationDate: new Date()
        }
      })

      const ws = fs.createWriteStream(outputPath)
      doc.pipe(ws)

      progress && progress({ type: 'log', message: 'Iniciando geração do PDF traduzido...' })

      // Capa opcional
      if (coverPath && fs.existsSync(coverPath)) {
        try {
          doc.image(coverPath, {
            fit: [doc.page.width - 40, doc.page.height - 40],
            align: 'center',
            valign: 'center'
          })
          progress && progress({ type: 'log', message: 'Capa adicionada' })
        } catch (e) {
          console.warn('Capa ignorada:', e.message)
        }
        doc.addPage()
      }

      // Folha de título
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a1a2e').text(title, { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(10).font('Helvetica').fillColor('#555555').text('Traduzido para Portugues (pt-BR)', { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(9).fillColor('#888888').text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), { align: 'center' })
      const lineY = doc.y + 14
      doc.moveTo(doc.page.margins.left, lineY)
        .lineTo(doc.page.width - doc.page.margins.right, lineY)
        .strokeColor('#cccccc').lineWidth(0.5).stroke()
      doc.addPage()
      progress && progress({ type: 'log', message: 'Pagina de titulo criada' })

      // Corpo
      const rawParagraphs = text.split(/\n{2,}/).map(function (p) { return p.replace(/\n/g, ' ').trim() }).filter(Boolean)
      const chapterPat = /^(capitulo|chapter|parte|part|prologue|prologo|epilogo|epilogue)[\s\d.:-]/i
      doc.fontSize(10.5).font('Helvetica').fillColor('#1a1a1a')
      let lastPct = -1

      for (let i = 0; i < rawParagraphs.length; i++) {
        const para = rawParagraphs[i]
        const isH = (para.length < 80 && /^[A-Z]/.test(para) && para === para.toUpperCase()) || chapterPat.test(para)
        if (isH) {
          if (i > 0) doc.addPage()
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a2e').text(para, { align: 'center' })
          doc.moveDown(0.8)
          const hy = doc.y
          doc.moveTo(doc.page.margins.left + 20, hy)
            .lineTo(doc.page.width - doc.page.margins.right - 20, hy)
            .strokeColor('#aaaaaa').lineWidth(0.4).stroke()
          doc.moveDown(0.8)
          doc.fontSize(10.5).font('Helvetica').fillColor('#1a1a1a')
        } else {
          doc.text(para, { align: 'justify', indent: 20, paragraphGap: 4, lineGap: 2 })
          doc.moveDown(0.4)
        }
        const pct = Math.round(i / rawParagraphs.length * 100)
        if (pct % 10 === 0 && pct !== lastPct) {
          lastPct = pct
          progress && progress({ type: 'log', message: 'Gerando PDF: ' + pct + '%' })
        }
      }

      // Numeração de páginas
      const range = doc.bufferedPageRange()
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i)
        doc.fontSize(8).font('Helvetica').fillColor('#aaaaaa').text(
          String(i + 1),
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 10,
          { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
        )
      }

      doc.flushPages()
      doc.end()

      ws.on('finish', function () {
        progress && progress({ type: 'log', message: 'PDF gerado com sucesso!' })
        resolve(outputPath)
      })
      ws.on('error', reject)
    } catch (err) {
      reject(err)
    }
  })
}
