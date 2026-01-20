# 📚 Conversor PDF para EPUB - Sistema Completo

Sistema multi-plataforma para converter PDFs em EPUBs. Inclui:
- 🌐 **Website** - Interface Next.js moderna e responsiva
- 📡 **API REST** - Backend Express com documentação Swagger
- 🤖 **Bot Discord** - Acesso ao conversor direto no Discord

## 🚀 Quick Start

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/conversor-de-livros.git
cd conversor-de-livros
```

### 2. Instalar dependências

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Discord Bot
cd discord-bot && npm install && cd ..
```

### 3. Configurar variáveis de ambiente

```bash
# Discord Bot (criar arquivo)
cp discord-bot/.env.example discord-bot/.env
# Editar discord-bot/.env com seus valores
```

### 4. Executar com Docker Compose

```bash
docker-compose up
```

Ou sem Docker (modo desenvolvimento):

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Terminal 3 - Discord Bot
cd discord-bot && npm run dev
```

## 📖 Acesso

| Componente | URL | Descrição |
|-----------|-----|-----------|
| **Website** | http://localhost:3000 | Interface web |
| **API** | http://localhost:3001 | API REST |
| **Swagger** | http://localhost:3001/api-docs | Documentação da API |
| **Bot Discord** | Discord | Bot no seu servidor |

## 🏗️ Estrutura do Projeto

```
conversor-de-livros/
├── backend/                    # API Express
│   ├── src/
│   │   ├── index.js           # Servidor principal
│   │   ├── routes/            # Rotas da API
│   │   ├── services/          # Lógica de conversão
│   │   └── swagger.js         # Documentação
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── package.json
│
├── frontend/                   # Aplicação Next.js
│   ├── app/
│   │   ├── page.tsx           # Página principal
│   │   ├── layout.tsx         # Layout
│   │   └── globals.css        # Estilos
│   ├── public/
│   │   ├── fundo-livro.png   # Imagem de fundo
│   │   └── ...
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── package.json
│
├── discord-bot/               # Bot Discord
│   ├── src/
│   │   ├── bot.js            # Cliente Discord
│   │   ├── commands/         # Comandos
│   │   ├── handlers/         # Processadores
│   │   └── services/         # Serviços compartilhados
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── docker-compose.yml         # Orquestração
└── README.md                  # Este arquivo
```

## 🔧 Funcionalidades

### Website

- ✅ Interface moderna com tema de livro
- ✅ Upload de PDF com drag-and-drop
- ✅ Customização de capa
- ✅ Modo rápido/completo
- ✅ Tradução em tempo real
- ✅ Visualização de progresso
- ✅ Download automático do EPUB

### API REST

```bash
# Converter PDF
curl -X POST http://localhost:3001/api/convert \
  -F "pdf=@documento.pdf" \
  -F "mode=fast" \
  -F "translate=true"

# Ver progresso
curl http://localhost:3001/api/progress/{jobId}

# Health check
curl http://localhost:3001/health
```

### Bot Discord

- `/convert` - Converter PDF para EPUB
- `/help` - Ajuda sobre comandos
- `/status` - Status do bot

## 📦 Dependências Principais

### Backend
- express - Framework web
- pdf-parse - Parsing de PDFs
- epub-gen - Geração de EPUBs
- pdfjs-dist - Extração de imagens
- canvas - Renderização de imagens

### Frontend
- next.js - Framework React
- axios - Requisições HTTP
- TypeScript - Tipagem estática

### Discord Bot
- discord.js - Cliente Discord
- Compartilha converter.js e translator.js com o backend

## 🔒 Segurança

- ✅ Validação de tipos de arquivo
- ✅ Limites de tamanho (8MB)
- ✅ Rate limiting
- ✅ Sanitização de entrada
- ✅ Limpeza automática de temporários
- ✅ Tratamento robusto de erros

## 🚀 Deployment

### Produção com Docker

```bash
# Build de produção
docker-compose -f docker-compose.yml build

# Rodar
docker-compose -f docker-compose.yml up -d
```

### Variáveis de Ambiente

```bash
# Backend
PORT=3001
FRONTEND_URL=https://seu-dominio.com
NODE_ENV=production

# Frontend
NEXT_PUBLIC_API_URL=https://api.seu-dominio.com

# Discord Bot
DISCORD_BOT_TOKEN=seu_token
DISCORD_CLIENT_ID=seu_client_id
```

## 📊 Limites e Restrições

| Limite | Valor | Motivo |
|--------|-------|--------|
| Tamanho PDF | 8MB | Limite Discord |
| Tamanho Capa | 5MB | Limite Discord |
| Caracteres | 800k | Performance |
| EPUB Resultante | 8MB | Limite Discord |
| Conversões Simultâneas | 1 por usuário | Recursos |

## 🐛 Troubleshooting

### Backend não inicia
```bash
# Verificar porta 3001
lsof -i :3001

# Limpar node_modules
rm -rf backend/node_modules
npm install
```

### Frontend com erro de conexão
```bash
# Verificar NEXT_PUBLIC_API_URL em .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" >> frontend/.env.local
```

### Discord Bot não responde
1. Verificar token em `discord-bot/.env`
2. Aguardar 1 hora para comandos globais aparecerem
3. Usar `DISCORD_GUILD_ID` para testes rápidos
4. Ver logs: `docker-compose logs discord-bot`

## 📚 Documentação Adicional

- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [Discord Bot README](./discord-bot/README.md)

## 🤝 Contribuindo

1. Faça um Fork
2. Crie sua feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

ISC

## 👨‍💻 Autor

Seu Nome

## 🙏 Agradecimentos

- PDF.js para extração de PDFs
- Discord.js para integrações Discord
- Google Translate API para tradução

---

**Última atualização**: 20 de janeiro de 2026
