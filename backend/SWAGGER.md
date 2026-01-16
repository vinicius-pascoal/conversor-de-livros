# API Documentation - Swagger

## Acessando a Documentação

Após iniciar o servidor, acesse a documentação da API em:

```
http://localhost:3001/api-docs
```

## Endpoints Disponíveis

### 1. **POST /api/convert**
Converte um arquivo PDF para EPUB com opções avançadas.

**Parâmetros de Query:**
- `mode` (opcional): `fast` (padrão) ou `full` - Modo de conversão
- `translate` (opcional): `true` ou `false` - Traduzir para português
- `jobId` (opcional): ID único para rastreamento em tempo real

**Body (multipart/form-data):**
- `pdf` (obrigatório): Arquivo PDF
- `cover` (opcional): Imagem PNG ou JPG para capa

**Exemplo cURL:**
```bash
curl -X POST "http://localhost:3001/api/convert?mode=full&translate=true" \
  -F "pdf=@documento.pdf" \
  -F "cover=@capa.jpg"
```

### 2. **GET /api/progress/{jobId}**
Conecta via Server-Sent Events (SSE) para receber atualizações de progresso em tempo real.

**Retorna eventos:**
- `phase`: Mudança de fase (uploading, extracting, processing, generating, complete)
- `log`: Mensagens de log
- `done`: Conversão concluída

**Exemplo JavaScript:**
```javascript
const eventSource = new EventSource('http://localhost:3001/api/progress/seu-job-id');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progresso:', data);
};

eventSource.onerror = () => {
  eventSource.close();
};
```

### 3. **GET /health**
Verifica o status do servidor.

**Resposta:**
```json
{
  "status": "OK",
  "message": "Servidor rodando!"
}
```

## Testando via Swagger UI

1. Abra http://localhost:3001/api-docs
2. Clique em "Try it out" no endpoint desejado
3. Preencha os parâmetros e envie a requisição
4. Veja a resposta e os headers retornados

## Configuração de Ambiente

As seguintes variáveis de ambiente afetam a API:

```env
PORT=3001                          # Porta do servidor
FRONTEND_URL=http://localhost:3000 # URL do frontend (para CORS)
MAX_UPLOAD_MB=200                  # Tamanho máximo de upload em MB
FAST_MODE_DEFAULT=true             # Modo padrão (fast ou full)
```

## Recursos da API

✅ Conversão de PDF para EPUB
✅ Suporte a tradução automática
✅ Upload opcional de capa personalizada
✅ Modo rápido (um capítulo) ou completo (múltiplos capítulos)
✅ Progresso em tempo real via SSE
✅ Documentação interativa com Swagger/OpenAPI
✅ CORS configurável
✅ Suporte a uploads grandes (até 200MB)
