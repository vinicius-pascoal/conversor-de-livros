# Conversor de Livros

Aplicação completa para converter arquivos PDF em formato EPUB ou gerar PDF traduzido, preservando imagens e estrutura do documento original. Frontend em Next.js e backend em Node.js com pdf.js e node-canvas para extração de imagens e tradução automática.

![Demo da Aplicação](demo.png)

## 📁 Estrutura do Projeto

```
conversor-de-livros/
├── frontend/              # Aplicação Next.js
│   ├── app/
│   ├── Dockerfile
│   └── package.json
├── backend/               # Servidor Node.js + Express
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml     # Orquestração dos containers
└── README.md
```

## 🚀 Como Executar

### Desenvolvimento Local (Recomendado)

A forma mais prática para desenvolvimento, com hot reload automático.

#### Pré-requisitos

- **Node.js 18+** - [Download aqui](https://nodejs.org/)
- **npm** ou **yarn** - Incluído com Node.js

#### Passos

**1. Clone o repositório**

```bash
git clone https://github.com/vinicius-pascoal/conversor-de-livros.git
cd conversor-de-livros
```

**2. Configure e inicie o Backend**

```bash
cd backend
npm install
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

**3. Em outro terminal, configure e inicie o Frontend**

```bash
cd frontend
npm install
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

#### Variáveis de Ambiente

Crie um arquivo `.env` no backend (opcional):
```env
PORT=3001
FRONTEND_URL=http://localhost:3000
MAX_UPLOAD_MB=200
FAST_MODE_DEFAULT=true
```

Crie um arquivo `.env.local` no frontend (opcional):
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Com Docker

Alternativa para executar sem instalar Node.js localmente.

#### Desenvolvimento (com hot reload)

```bash
# Build e iniciar
docker-compose up --build
```

A aplicação estará disponível em:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

Para parar:
```bash
docker-compose down
```

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
- **pdfjs-dist** - Renderização e extração de imagens do PDF
- **node-canvas** - Manipulação de imagens em alta qualidade
- **epub-gen** - Geração de arquivos EPUB
- **Google Translate API** - Tradução automática de texto
- **Swagger/OpenAPI** - Documentação da API
- **Server-Sent Events (SSE)** - Progresso em tempo real

### DevOps
- **Docker** - Containerização
- **Docker Compose** - Orquestração de containers

## 📝 Funcionalidades

### Formatos de Saída
- ✅ **Conversão de PDF para EPUB** - Livro digital com texto fluido
- ✅ **Geração de PDF traduzido** - Novo PDF com layout preservado e tradução para pt-BR

### Modos de Conversão (EPUB)
- ⚡ **Modo Rápido** - Um único capítulo, processamento mais rápido
- 📖 **Modo Completo** - Múltiplos capítulos com índice navegável

### Recursos
- ✅ Upload de arquivos PDF via drag & drop ou clique
- ✅ **Extração automática de imagens do PDF**
- ✅ **Inserção de imagens nas posições originais do documento**
- ✅ **Upload opcional de capa personalizada**
- ✅ **Capa automática usando primeira imagem extraída**
- ✅ **Tradução automática com suporte a 27 idiomas**
- ✅ **Detecção automática de idioma do documento**
- ✅ **Seleção de idioma de destino** (pt-BR padrão)
- ✅ **Prévia interativa do EPUB antes do download**
- ✅ **Progresso em tempo real com Server-Sent Events (SSE)**
- ✅ Download automático do arquivo convertido
- ✅ Interface responsiva e moderna
- ✅ Validação de tipo de arquivo
- ✅ Feedback visual durante o processo
- ✅ Logs detalhados para diagnóstico
- ✅ Documentação Swagger/OpenAPI interativa

## � Documentação da API

Acesse a documentação Swagger interativa em:
```
http://localhost:3001/api-docs
```

A documentação inclui:
- Todos os endpoints disponíveis
- Parâmetros e exemplos de requisição
- Respostas esperadas
- Interface para testar a API diretamente

## ⚙️ Opções Avançadas

### Parâmetros da API

A rota `/api/convert` aceita os seguintes parâmetros via query string:

- **`outputFormat`**: Formato de saída (padrão: `epub`)
  - `epub`: Gera livro digital em formato EPUB
  - `pdf`: Gera novo PDF traduzido
- **`mode`**: Modo de conversão (apenas para EPUB, padrão: `fast`)
  - `fast`: ⚡ **Rápido** - Um único capítulo, processamento mais rápido
  - `full`: 📖 **Completo** - Múltiplos capítulos com índice navegável
- **`translate`**: Traduzir conteúdo (padrão: `false`)
  - Obrigatório (sempre `true`) quando `outputFormat=pdf`
  - Opcional para `outputFormat=epub`
- **`targetLang`**: Idioma de destino para tradução (padrão: `pt`)
  - Códigos ISO 639-1 suportados: `pt`, `en`, `es`, `fr`, `de`, `it`, `ja`, `zh`, `ru`, `ar`, `hi`, `ko`, `nl`, `pl`, `sv`, `tr`, `vi`, `th`, `cs`, `da`, `fi`, `el`, `he`, `id`, `no`, `ro`, `uk`
  - Português brasileiro (`pt`) é o idioma padrão
- **`extractImages`**: Extrair e incluir imagens (padrão: `true`)
- **`jobId`**: ID único para rastreamento em tempo real via SSE

**Exemplos:**
```bash
# EPUB completo com tradução para espanhol
POST http://localhost:3001/api/convert?outputFormat=epub&mode=full&translate=true&targetLang=es

# PDF traduzido para francês
POST http://localhost:3001/api/convert?outputFormat=pdf&targetLang=fr

# EPUB rápido traduzido para pt-BR (padrão)
POST http://localhost:3001/api/convert?mode=fast&translate=true
```

### Upload de Arquivos

A API aceita dois campos no formulário multipart:
- **`pdf`** (obrigatório): Arquivo PDF a ser convertido
- **`cover`** (opcional): Imagem JPG/PNG para usar como capa do EPUB

Se nenhuma capa for enviada e `keepImages=true`, a primeira imagem extraída do PDF será usada como capa automaticamente.

### Idiomas Suportados para Tradução

O conversor suporta tradução automática para **27 idiomas** diferentes:

| Código | Idioma | Código | Idioma |
|--------|--------|--------|--------|
| `pt` | Português (BR) ⭐ | `en` | English |
| `es` | Español | `fr` | Français |
| `de` | Deutsch | `it` | Italiano |
| `ja` | 日本語 | `zh` | 中文 |
| `ru` | Русский | `ar` | العربية |
| `hi` | हिन्दी | `ko` | 한국어 |
| `nl` | Nederlands | `pl` | Polski |
| `sv` | Svenska | `tr` | Türkçe |
| `vi` | Tiếng Việt | `th` | ไทย |
| `cs` | Čeština | `da` | Dansk |
| `fi` | Suomi | `el` | Ελληνικά |
| `he` | עברית | `id` | Bahasa Indonesia |
| `no` | Norsk | `ro` | Română |
| `uk` | Українська | | |

⭐ **Português brasileiro (`pt`) é o idioma padrão**

A detecção de idioma é automática - o sistema identifica o idioma do PDF original e, se for diferente do idioma de destino selecionado, realiza a tradução.

## 📦 Estrutura de Arquivos

### Backend
- `src/index.js` - Servidor principal Express
- `src/routes/` - Rotas da API
  - `convert.js` - Conversão de PDF para EPUB/PDF traduzido
  - `health.js` - Health check
  - `progress.js` - SSE para progresso em tempo real
- `src/services/` - Lógica de negócio
  - `converter.js` - Conversão PDF → EPUB com extração de imagens
  - `translator.js` - Tradução automática
  - `pdfGenerator.js` - Geração de PDF traduzido
  - `pdfGeneratorWithLayout.js` - PDF com layout preservado
  - `layoutAnalyzer.js` - Análise de estrutura do PDF
  - `pdfRenderer.js` - Renderização de páginas
- `src/swagger.js` - Configuração do Swagger

### Frontend
- `app/page.tsx` - Página principal com interface
- `app/layout.tsx` - Layout da aplicação
- `app/globals.css` - Estilos globais

## 🎯 Como Funciona

### Processo de Conversão

1. **Upload**: Usuário envia PDF e opcionalmente uma imagem de capa
2. **Detecção de Idioma**: Sistema detecta automaticamente o idioma do documento
3. **Extração de Texto**: `pdf-parse` extrai todo o texto do PDF
4. **Extração de Imagens**: `pdfjs-dist` identifica e extrai imagens em alta qualidade usando `node-canvas`
5. **Tradução (opcional)**: Texto é traduzido para pt-BR usando Google Translate API
6. **Divisão em Capítulos**: Texto dividido em capítulos (modo completo) ou capítulo único (modo rápido)
7. **Posicionamento de Imagens**: Cada imagem é inserida na posição proporcional baseada na página original
8. **Geração**: 
   - **EPUB**: `epub-gen` cria o livro digital com texto, imagens e capa
   - **PDF**: Gera novo PDF com texto traduzido e layout preservado
9. **Download**: Frontend recebe o arquivo e inicia download automático
10. **Limpeza**: Arquivos temporários são removidos do servidor

### Posicionamento de Imagens

O sistema usa `pdfjs-dist` para extrair imagens com informações de posição:

- Cada imagem mantém referência à página original do PDF
- No modo completo: imagens são distribuídas proporcionalmente entre os capítulos
- No modo rápido: imagens são inseridas em ordem no capítulo único
- Sistema filtra imagens muito pequenas (< 32x32) para evitar ícones e artefatos
- Imagens são renderizadas em alta qualidade (2x scale) usando node-canvas

Isso garante que as imagens apareçam aproximadamente nas mesmas posições do PDF original.

### Prévia do EPUB

Após a conversão para EPUB, o sistema oferece uma prévia interativa antes do download:

- **Renderização no navegador**: Usa a biblioteca `epub.js` para renderizar o conteúdo diretamente
- **Navegação por páginas**: Botões e teclas de seta (← →) para navegar
- **Visualização em tela cheia**: Interface imersiva com fundo escuro
- **Controles intuitivos**:
  - Contador de páginas atual/total
  - Botão de download quando estiver satisfeito com o resultado
  - Tecla ESC para fechar a prévia
- **Automático para EPUB, direto para PDF**: PDFs traduzidos são baixados diretamente (sem prévia)

Isso permite que você verifique a qualidade da conversão, formatação do texto e posicionamento de imagens antes de fazer o download final.

## 🐳 Docker

### Arquitetura

- **Backend Container**: Node.js 18 Slim + dependências nativas (Cairo, Pango, Canvas)
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

### Erro ao instalar dependências do Canvas (desenvolvimento local)

**Windows:**
- Instale as ferramentas de build: `npm install --global windows-build-tools`
- Ou instale o Visual Studio Build Tools manualmente

**Linux:**
```bash
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
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
  - ✅ Integração com Google Translate
  - ✅ Preservação de formatação e estrutura durante tradução
  - ✅ Toggle na interface para ativar/desativar tradução
  - ✅ Geração de PDF traduzido com layout preservado
  - ✅ Seletor de idioma de destino (pt-BR padrão)
  - ✅ Suporte a múltiplos idiomas de saída
  - ✅ Geração de PDF traduzido com layout preservado
  - ✅ Suporte a múltiplos idiomas de saída (além de pt-BR)
~~ ✅ Implementado
- [x] ~~Geração de PDF traduzido~~ ✅ Implementado
- [x] ~~Detecção automática de idioma~~ ✅ Implementado
- [x] ~~Progresso em tempo real (SSE)~~ ✅ Implementado
- [x] ~~Suporte a múltiplos idiomas de tradução~~ ✅ Implementado (27 idiomas)
- [x] ~~Prévia do EPUB antes do download~~ ✅ Implementado
- [ ] Suporte a outros formatos de entrada (DOCX, TXT, MOBI)

## 📄 Licença

ISC
