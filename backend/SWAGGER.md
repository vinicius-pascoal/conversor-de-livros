# API Documentation - Swagger

## Acessando a Documentação

Após iniciar o servidor, acesse a documentação da API em:

```
http://localhost:3001/api-docs
```

## Endpoints Disponíveis

### 1. **POST /api/convert**
Converte um arquivo PDF para EPUB ou gera um PDF traduzido com layout preservado.

**Parâmetros de Query:**
- `outputFormat` (opcional): `epub` (padrão) ou `pdf` - Formato de saída
  - `epub`: Gera livro digital em formato EPUB
  - `pdf`: Gera novo PDF traduzido para pt-BR
- `mode` (opcional, apenas para EPUB): `fast` (padrão) ou `full` - Modo de conversão
  - `fast`: **⚡ Rápido** - Um único capítulo, processamento mais rápido
  - `full`: **📖 Completo** - Múltiplos capítulos com índice navegável
- `translate` (opcional): `true` ou `false` - Traduzir para português pt-BR
  - Obrigatório (sempre true) quando `outputFormat=pdf`
  - Opcional para `outputFormat=epub`
- `extractImages` (opcional): `true` (padrão) ou `false` - Extrair e incluir imagens
- `jobId` (opcional): ID único para rastreamento em tempo real via SSE

**Body (multipart/form-data):**
- `pdf` (obrigatório): Arquivo PDF (máximo 200MB)
- `cover` (opcional): Imagem PNG ou JPG para capa do EPUB

**Exemplos cURL:**

Gerar EPUB completo com tradução:
```bash
curl -X POST "http://localhost:3001/api/convert?outputFormat=epub&mode=full&translate=true" \
  -F "pdf=@documento.pdf" \
  -F "cover=@capa.jpg"
```

Gerar PDF traduzido:
```bash
curl -X POST "http://localhost:3001/api/convert?outputFormat=pdf" \
  -F "pdf=@documento.pdf"
```

Gerar EPUB rápido sem tradução:
```bash
curl -X POST "http://localhost:3001/api/convert?mode=fast&translate=false" \
  -F "pdf=@documento.pdf"
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

✅ Conversão de PDF para EPUB (livro digital)
✅ Geração de PDF traduzido com layout preservado
✅ Tradução automática para português pt-BR
✅ Upload opcional de capa personalizada
✅ Modo rápido: um único capítulo, processamento mais rápido
✅ Modo completo: múltiplos capítulos com índice navegável
✅ Extração e preservação de imagens
✅ Progresso em tempo real via SSE
✅ Documentação interativa com Swagger/OpenAPI 3.0
✅ CORS configurável
✅ Suporte a uploads grandes (até 200MB configurável)
✅ Detecção automática de idioma
