# 🤖 Conversor PDF para EPUB - Bot Discord

Bot Discord completo para converter PDFs em EPUBs com as mesmas funcionalidades do site web.

## 🚀 Features

### Formatos de Saída
- ✅ Conversão de PDF para EPUB (livro digital)
- ✅ Geração de PDF traduzido (novo PDF com tradução para pt-BR)

### Modos de Conversão (EPUB)
- ⚡ **Modo Rápido** - Um único capítulo, processamento mais rápido
- 📖 **Modo Completo** - Múltiplos capítulos com índice navegável

### Recursos
- ✅ Comando `/convert` com suporte a EPUB e PDF traduzido
- ✅ Suporte a capas customizadas (JPG/PNG)
- ✅ Tradução automática para português pt-BR
- ✅ Detecção automática de idioma
- ✅ Extração inteligente de imagens do PDF
- ✅ Suporte a textos de até 800k caracteres
- ✅ Feedback em tempo real com Embeds do Discord
- ✅ Limite de 8MB por arquivo (limite Discord)
- ✅ Comandos `/help` e `/status`

## 📋 Pré-requisitos

- Node.js 20+
- Bot Discord criado no [Discord Developer Portal](https://discord.com/developers/applications)
- Token do bot e Client ID

## 🔧 Instalação

### 1. Clonar e instalar dependências

```bash
cd discord-bot
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar `.env` com seus valores:

```env
DISCORD_BOT_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
DISCORD_GUILD_ID=seu_guild_id_aqui  # Opcional (para testes rápidos)
MAX_FILE_SIZE=8388608
TEMP_DIR=./temp
```

### 3. Obter Token e Client ID

1. Ir para [Discord Developer Portal](https://discord.com/developers/applications)
2. Clicar em "New Application"
3. Na aba "Bot", clicar em "Add Bot"
4. Em "TOKEN", clicar em "Copy" (use este valor para `DISCORD_BOT_TOKEN`)
5. Na aba "General Information", copiar "APPLICATION ID" (use para `DISCORD_CLIENT_ID`)

### 4. Configurar permissões do Bot

Na aba "OAuth2" > "URL Generator":
- Escopos: `bot`, `applications.commands`
- Permissões:
  - Send Messages
  - Attach Files
  - Use Slash Commands
  - Read Message History

Usar a URL gerada para adicionar o bot ao seu servidor

### 5. Executar o bot

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 🐳 Docker

```bash
# Build
docker build -t conversor-bot .

# Run
docker run --env-file .env conversor-bot
```

## 📖 Uso

### Comando /convert

```
/convert pdf:[arquivo.pdf] formato:epub modo:completo traduzir:true capa:[imagem.png]
```

**Opções:**
- `pdf` (obrigatório): Arquivo PDF para converter
- `formato` (opcional): `epub` (padrão) ou `pdf-traduzido`
  - `epub`: Gera livro digital em formato EPUB
  - `pdf-traduzido`: Gera novo PDF traduzido para pt-BR
- `modo` (opcional, apenas para EPUB): `rápido` ou `completo`
  - ⚡ `rápido`: Um único capítulo, processamento mais rápido
  - 📖 `completo`: Múltiplos capítulos com índice navegável
- `traduzir` (opcional): `true` ou `false` - Traduzir para pt-BR
  - Obrigatório (sempre true) para `formato:pdf-traduzido`
- `capa` (opcional): Imagem de capa (JPG/PNG) - apenas para EPUB

### Exemplos de uso no Discord

```
# Gerar EPUB completo com tradução
/convert pdf:livro.pdf formato:epub modo:completo traduzir:true

# Gerar PDF traduzido
/convert pdf:documento.pdf formato:pdf-traduzido

# Gerar EPUB rápido sem tradução
/convert pdf:livro.pdf modo:rápido traduzir:false
```

### Comando /help

Mostra ajuda completa sobre os comandos disponíveis

### Comando /status

Mostra informações do bot (uptime, servidores, conversões ativas)

## 🏗️ Estrutura de Pastas

```
discord-bot/
├── src/
│   ├── bot.js                 # Inicializador do bot
│   ├── commands/
│   │   ├── convert.js         # Comando /convert
│   │   ├── help.js            # Comando /help
│   │   └── status.js          # Comando /status
│   ├── handlers/
│   │   ├── commandHandler.js  # Registro de comandos
│   │   └── interactionHandler.js # Processamento de interações
│   ├── services/
│   │   ├── converter.js       # Lógica de conversão PDF->EPUB
│   │   └── translator.js      # Tradução via Google Translate
│   └── utils/
├── temp/                      # Arquivos temporários
├── Dockerfile
├── package.json
├── .env.example
└── .gitignore
```

## 🔐 Segurança

- Validação de tipos de arquivo
- Limites de tamanho (8MB por arquivo)
- Limpeza automática de arquivos temporários
- Tratamento robusto de erros
- Logging detalhado

## ⚠️ Limitações

- **Tamanho máximo**: 8MB por arquivo (limite do Discord)
- **Timeout**: 15 minutos para conversão completa
- **Conversões simultâneas**: Uma por usuário por vez
- **Arquivo resultante**: Também limitado a 8MB para upload

## 🐛 Troubleshooting

### Bot não aparece no Discord
- Verificar se o token está correto
- Aguardar até 1 hora para comandos globais aparecerem
- Usar `DISCORD_GUILD_ID` para testes rápidos no servidor específico

### Erro "Canvas não encontrado"
```bash
# Windows (MSVC Build Tools necessário)
npm install --build-from-source

# Linux
sudo apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
```

### Arquivo não faz download
- Verificar se o EPUB gerado tem menos de 8MB
- Verificar espaço em disco
- Ver logs do bot para detalhes do erro

## 📊 Logs e Debugging

O bot loga todas as conversões:

```
✅ Bot logado como BotName#0000
📨 Comando recebido: /convert de usuario#1234
📥 Baixando arquivo PDF...
🔄 Convertendo PDF para EPUB...
✅ Conversão concluída para usuario#1234: documento.pdf
```

## 🤝 Contribuições

Contribuições são bem-vindas! Por favor:
1. Faça um fork do projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📝 Licença

ISC
