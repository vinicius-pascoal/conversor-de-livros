import { EventEmitter } from 'events'

// Mapa de emissores por jobId
const buses = new Map()

function getBus(jobId) {
  if (!buses.has(jobId)) {
    buses.set(jobId, new EventEmitter())
  }
  return buses.get(jobId)
}

export function emitProgress(jobId, event) {
  try {
    const bus = getBus(jobId)
    bus.emit('message', event)
  } catch (_) {
    // ignore
  }
}

export function completeProgress(jobId) {
  const bus = getBus(jobId)
  bus.emit('end')
}

export function sseStream(jobId, res) {
  console.log('📡 [SSE] Iniciando stream SSE para jobId:', jobId)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const bus = getBus(jobId)

  // Mensagem inicial para confirmar conexão
  console.log('📡 [SSE] Enviando mensagem inicial')
  res.write(`data: ${JSON.stringify({ type: 'log', message: 'Conexão de progresso aberta' })}\n\n`)

  const onMessage = (event) => {
    console.log('📡 [SSE] Enviando evento:', event)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const onEnd = () => {
    console.log('📡 [SSE] Finalizando stream')
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()
  }

  bus.on('message', onMessage)
  bus.once('end', onEnd)

  // Limpeza quando cliente desconecta
  reqOnClose(res, () => {
    bus.removeListener('message', onMessage)
    bus.removeListener('end', onEnd)
  })
}

function reqOnClose(res, cb) {
  res.on('close', cb)
  res.on('finish', cb)
}
