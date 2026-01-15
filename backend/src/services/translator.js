import https from 'https'

/**
 * Traduz texto usando a API do Google Translate (via endpoint público)
 * @param {string} text - Texto para traduzir
 * @param {string} targetLang - Idioma de destino (padrão: 'pt')
 * @param {string} sourceLang - Idioma de origem (padrão: 'auto')
 * @returns {Promise<string>} Texto traduzido
 */
export async function translateText(text, targetLang = 'pt', sourceLang = 'auto') {
  if (!text || text.trim().length === 0) {
    return text
  }

  // Limita o tamanho do texto por requisição (API do Google tem limite)
  const MAX_CHUNK_SIZE = 4500

  if (text.length > MAX_CHUNK_SIZE) {
    // Divide em chunks e traduz cada um
    const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE)
    const translatedChunks = []

    for (const chunk of chunks) {
      const translated = await translateChunk(chunk, targetLang, sourceLang)
      translatedChunks.push(translated)
    }

    return translatedChunks.join('')
  }

  return translateChunk(text, targetLang, sourceLang)
}

/**
 * Divide texto em chunks respeitando quebras de parágrafos
 */
function splitTextIntoChunks(text, maxSize) {
  const chunks = []
  const paragraphs = text.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = ''
      }

      // Se o parágrafo sozinho é maior que maxSize, divide por sentença
      if (para.length > maxSize) {
        const sentences = para.split(/\. /)
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 2 > maxSize) {
            if (currentChunk) chunks.push(currentChunk)
            currentChunk = sentence + '. '
          } else {
            currentChunk += sentence + '. '
          }
        }
      } else {
        currentChunk = para + '\n\n'
      }
    } else {
      currentChunk += para + '\n\n'
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * Traduz um chunk de texto usando Google Translate API
 */
async function translateChunk(text, targetLang, sourceLang) {
  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(text)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodedText}`

    https.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed && parsed[0]) {
            const translated = parsed[0].map(item => item[0]).join('')
            resolve(translated)
          } else {
            resolve(text) // Retorna original se falhar
          }
        } catch (err) {
          console.error('❌ Erro ao parsear resposta da tradução:', err.message)
          resolve(text) // Retorna original se falhar
        }
      })
    }).on('error', (err) => {
      console.error('❌ Erro na requisição de tradução:', err.message)
      resolve(text) // Retorna original se falhar
    })
  })
}

/**
 * Traduz texto em lotes para melhor performance
 * @param {string} text - Texto completo para traduzir
 * @param {Function} progressCallback - Callback para reportar progresso
 * @returns {Promise<string>} Texto traduzido
 */
export async function translateTextWithProgress(text, progressCallback) {
  if (!text || text.trim().length === 0) {
    return text
  }

  console.log('🌐 Iniciando tradução para pt-br...')
  console.log('📝 Tamanho do texto:', text.length, 'caracteres')

  const MAX_CHUNK_SIZE = 4500
  const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE)

  console.log('📦 Dividido em', chunks.length, 'chunks')

  const translatedChunks = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    if (progressCallback) {
      progressCallback({
        type: 'log',
        message: `Traduzindo ${i + 1}/${chunks.length} (${Math.round(((i + 1) / chunks.length) * 100)}%)`
      })
    }

    const translated = await translateChunk(chunk, 'pt', 'auto')
    translatedChunks.push(translated)

    // Pequeno delay para não sobrecarregar a API
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log('✅ Tradução concluída!')
  return translatedChunks.join('')
}

/**
 * Detecta o idioma do texto
 * @param {string} text - Texto para detectar idioma
 * @returns {Promise<string>} Código do idioma detectado
 */
export async function detectLanguage(text) {
  const sample = text.substring(0, 500) // Usa apenas uma amostra

  return new Promise((resolve, reject) => {
    const encodedText = encodeURIComponent(sample)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodedText}`

    https.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          const detectedLang = parsed[2] || 'unknown'
          resolve(detectedLang)
        } catch (err) {
          resolve('unknown')
        }
      })
    }).on('error', () => {
      resolve('unknown')
    })
  })
}
