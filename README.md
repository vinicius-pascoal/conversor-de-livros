# Conversor de PDF para EPUB

Aplicação completa para converter arquivos PDF em formato EPUB, preservando imagens e estrutura do documento original. Frontend em Next.js e backend em Node.js com **PDF.js** para extração de imagens e texto.

## 📁 Estrutura do Projeto

```
conversor-de-livros/
├── frontend/              # Aplicação Next.js
│   ├── app/
│   ├── Dockerfile
│   └── package.json
├── backend/               # Servidor Node.js + PDF.js
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml     # Orquestração dos containers
└── README.md
```

## 🚀 Como Executar

### Com Docker (Recomendado)

A forma mais simples de executar o projeto, sem necessidade de instalar dependências no sistema. Inclui **hot reload** automático durante desenvolvimento.

#### Desenvolvimento (com hot reload)

```bash
# Build das imagens de desenvolvimento
docker-compose build

# Iniciar os serviços
docker-compose up
```

A aplicação estará disponível em:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

Qualquer alteração no código será refletida automaticamente sem necessidade de rebuild. O backend usa **nodemon** e o frontend usa o **hot reload nativo do Next.js**.

Para parar os containers:
```bash
docker-compose down
```

#### Produção (compilado)

Para uma build otimizada de produção:

```bash
# Build com Dockerfile de produção
docker build -f backend/Dockerfile -t conversor-backend:prod ./backend
docker build -f frontend/Dockerfile -t conversor-frontend:prod ./frontend

# Então use as imagens em produção
```

### Sem Docker (Desenvolvimento Local)

#### Backend

1. Navegue até a pasta do backend:
```bash
cd backend
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

#### Frontend

1. Abra um novo terminal e navegue até a pasta do frontend:
```bash
cd frontend
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

## 🛠️ Tecnologias Utilizadas

### Frontend
- **Next.js 14** - Framework React
- **TypeScript** - Tipagem estática
- **Axios** - Cliente HTTP
- **CSS Modules** - Estilização

### Backend
- **Node.js 18** - Runtime JavaScript
- **Express** - Framework web
- **Multer** - Upload de arquivos (PDF + imagem de capa)
- **pdf-parse** - Extração de texto de PDF
- **pdfjs-dist** - Extração de imagens do PDF
- **pngjs** - Conversão de imagens para PNG
- **epub-gen** - Geração de arquivos EPUB
- **CORS** - Comunicação entre frontend e backend

### DevOps
- **Docker** - Containerização
- **Docker Compose** - Orquestração de containers

## 📝 Funcionalidades

- ✅ Upload de arquivos PDF via drag & drop ou clique
- ✅ Conversão de PDF para EPUB preservando estrutura
- ✅ **Extração automática de imagens do PDF**
- ✅ **Inserção de imagens nas posições originais do documento**
- ✅ **Upload opcional de capa personalizada**
- ✅ **Capa automática usando primeira imagem extraída**
- ✅ Modo rápido (capítulo único) e modo completo (múltiplos capítulos)
- ✅ Download automático do arquivo convertido
- ✅ Interface responsiva e moderna
- ✅ Validação de tipo de arquivo
- ✅ Feedback visual durante o processo
- ✅ Logs detalhados de timing para diagnóstico

## 🔧 Configuração

### Backend (.env)
```env
PORT=3001
FRONTEND_URL=http://localhost:3000
FAST_MODE_DEFAULT=true
```

**Variáveis disponíveis:**
- `PORT`: Porta do servidor backend (padrão: 3001)
- `FRONTEND_URL`: URL do frontend para CORS (padrão: http://localhost:3000)
- `FAST_MODE_DEFAULT`: Modo rápido ativo por padrão (true/false)

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Variáveis disponíveis:**
- `NEXT_PUBLIC_API_URL`: URL da API backend

## ⚙️ Opções Avançadas

### Parâmetros da API

A rota `/api/convert` aceita os seguintes parâmetros via query string:

- **`mode=fast`**: Ativa modo rápido (capítulo único, conversão mais rápida)
- **`mode=full`**: Modo completo (múltiplos capítulos)
- **`keepImages=true`**: Preserva imagens do PDF (padrão)
- **`keepImages=false`**: Remove imagens (conversão somente texto)

**Exemplo:**
```
POST http://localhost:3001/api/convert?mode=fast&keepImages=true
```

### Upload de Arquivos

A API aceita dois campos no formulário multipart:
- **`pdf`** (obrigatório): Arquivo PDF a ser convertido
- **`cover`** (opcional): Imagem JPG/PNG para usar como capa do EPUB

Se nenhuma capa for enviada e `keepImages=true`, a primeira imagem extraída do PDF será usada como capa automaticamente.

## 📦 Estrutura de Arquivos

### Backend
- `src/index.js` - Servidor principal Express
- `src/routes/convert.js` - Rotas de conversão e upload
- `src/services/converter.js` - Lógica de conversão PDF → EPUB
  - Extração de texto com `pdf-parse`
  - Extração de imagens com `pdfjs-dist` (PDF.js)
  - Posicionamento de imagens nas localizações originais
  - Upload de PDF via drag & drop
  - Seleção opcional de capa
  - Feedback visual de progresso
- `app/layout.tsx` - Layout da aplicação
- `app/globals.css` - Estilos globais e componentes
- `Dockerfile` - Imagem Docker do frontend Next.js
- `.dockerignore` - Arquivos ignorados no build Docker

## 🎯 Como Funciona

### Processo de Conversão

1. **Upload**: Usuário envia PDF e opcionalmente uma imagem de capa
2. **Extração de Texto**: `pdf-parse` extrai todo o texto do PDF
3. **Extração de Imagens**: `pdfjs-dist` processa cada página do PDF extraindo imagens com suas posições exatas (coordenadas X, Y)
4. **Divisão em Capítulos**: Texto dividido em capítulos (modo normal) ou capítulo único (modo rápido)
5. **Posicionamento de Imagens**: Cada imagem é inserida na posição proporcional baseada nas coordenadas originais da página
6. **Geração EPUB**: `epub-gen` cria o arquivo EPUB com texto, imagens e capa
7. **Download**: Frontend recebe o EPUB e inicia download automático
8. **Limpeza**: Arquivos temporários são removidos do servidor

### Posicionamento de Imagens

O sistema usa as coordenadas reais (X, Y) extraídas do PDF pelo PDF.js para posicionar cada imagem:

- Cada página do PDF é processada para obter as operações de desenho
- Quando uma imagem é detectada, suas coordenadas de transformação são capturadas
- A posição Y é calculada como percentual da altura da página
- Imagens são ordenadas e inseridas mantendo sua posição relativa ao texto

Isso garante que as imagens apareçam aproximadamente nas mesmas posições do PDF original.

## 🐳 Docker

### Arquitetura

- **Backend Container**: Node.js 18 Slim com PDF.js
- **Frontend Container**: Node.js 18 Slim + Next.js
- **Network**: Bridge automático entre containers
- **Volumes**: 
  - Código fonte mapeado para hot reload
  - Pasta `uploads` montada para persistência
  - node_modules isolado para evitar conflitos

### Hot Reload em Desenvolvimento

O projeto está configurado para hot reload automático:

- **Backend**: Usa `nodemon` para reiniciar ao detectar mudanças em `/backend/src`
- **Frontend**: Usa hot reload nativo do Next.js ao detectar mudanças em `/frontend/app`

Não é necessário fazer rebuild dos containers quando o código muda. Basta salvar os arquivos e as mudanças aparecerão automaticamente.

**Arquivos de desenvolvimento:**
- `backend/Dockerfile.dev` - Dockerfile para modo desenvolvimento
- `frontend/Dockerfile.dev` - Dockerfile para modo desenvolvimento
- `docker-compose.yml` - Configura volumes para hot reload

### Comandos Úteis

```bash
# Build sem cache
docker-compose build --no-cache

# Logs em tempo real
docker-compose logs -f

# Logs apenas do backend
docker-compose logs -f backend

# Apenas frontend
docker-compose up frontend backend

# Reiniciar serviços
docker-compose restart

# Remover volumes (limpar node_modules)
docker-compose down -v
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
- Abrir issues para bugs ou sugestões
- Enviar pull requests com melhorias
- Melhorar a documentação
- `app/page.tsx` - Página principal com interface de upload
- `app/layout.tsx` - Layout da aplicação
- `app/globals.css` - Estilos globais

## 🔧 Troubleshooting

### Hot Reload não está funcionando

Se as mudanças no código não aparecem automaticamente:

```bash
# Remover volumes de node_modules e reconstruir
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Porta já está em uso

Se receber erro "Address already in use":

```bash
# Windows - parar processo na porta 3000 ou 3001
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# ou mudar as portas no docker-compose.yml
```

### Frontend não conecta ao Backend

Se receber erro de CORS ou conexão recusada:

```bash
# Verificar se ambos os serviços estão rodando
docker-compose logs

# Resetar serviços
docker-compose restart
```

## 🤝 Contribuindo

Sinta-se à vontade para abrir issues e pull requests!

## 📋 TODO List

### 🔧 Melhorias em Desenvolvimento

- [ ] **Ajuste preciso de posicionamento de imagens**
  - Melhorar algoritmo de posicionamento de imagens no EPUB
  - Calcular posição exata baseada em coordenadas do PDF
  - Usar análise de texto ao redor da imagem para posicionamento mais preciso
  - Considerar uso de bibliotecas como `pdf.js` para extração de coordenadas
  - Testar com diferentes tipos de PDFs (acadêmicos, livros, revistas)

- [ ] **Tradutor automático de PDF para EPUB**
  - Implementar detecção automática de idioma do PDF
  - Adicionar tradução automática para pt-BR durante conversão
  - Integrar API de tradução (Google Translate, DeepL ou similar)
  - Opção de selecionar idioma de origem e destino manualmente
  - Preservar formatação e estrutura durante tradução
  - Adicionar toggle na interface para ativar/desativar tradução
  - Cache de traduções para otimizar performance
  - Suporte a múltiplos idiomas de saída

### 🎯 Roadmap Futuro

- [ ] Suporte a outros formatos de entrada (DOCX, TXT, MOBI)
- [ ] Editor EPUB integrado para ajustes pós-conversão
- [ ] Prévia do EPUB antes do download
- [ ] Histórico de conversões
- [ ] Processamento em lote (múltiplos PDFs)
- [ ] API REST documentada com Swagger
- [ ] Testes automatizados (unit + integration)
- [ ] CI/CD com GitHub Actions


## 📄 Licença

ISC
