# 🤖 Guia do Bot Discord - Conversor PDF para EPUB

## 📖 Índice

1. [Instalação Rápida](#instalação-rápida)
2. [Comandos Disponíveis](#comandos-disponíveis)
3. [Exemplos de Uso](#exemplos-de-uso)
4. [Troubleshooting](#troubleshooting)

## 🚀 Instalação Rápida

### Passo 1: Criar Bot no Discord

1. Ir para [Discord Developer Portal](https://discord.com/developers/applications)
2. Clicar em "New Application" e dar um nome
3. Na aba "Bot", clicar em "Add Bot"
4. Em "TOKEN", clicar em "Copy"

### Passo 2: Configurar `.env`

```bash
cd discord-bot
cp .env.example .env
```

Editar `.env`:

```env
DISCORD_BOT_TOKEN=seu_token_copiado_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
```

**Como obter Client ID:**
- Na aba "General Information", copiar "APPLICATION ID"

### Passo 3: Adicionar Bot ao Servidor

1. Em "OAuth2" → "URL Generator"
2. Selecionar escopos: `bot` e `applications.commands`
3. Selecionar permissões:
   - Send Messages
   - Attach Files
   - Read Message History
4. Copiar URL gerada e abrir no navegador

### Passo 4: Iniciar o Bot

```bash
npm start
```

ou em desenvolvimento:

```bash
npm run dev
```

## 📝 Comandos Disponíveis

### `/convert` - Converter PDF para EPUB

**Uso:**
```
/convert pdf:[arquivo] [capa:imagem] [modo:tipo] [traduzir:sim/não]
```

**Parâmetros:**

| Parâmetro | Obrigatório | Tipo | Descrição |
|-----------|-----------|------|-----------|
| `pdf` | ✅ | Arquivo | Arquivo PDF para converter (máx 8MB) |
| `capa` | ❌ | Imagem | Imagem de capa (JPG/PNG, máx 5MB) |
| `modo` | ❌ | Opção | `rápido` ou `completo` (padrão: rápido) |
| `traduzir` | ❌ | Bool | `true` ou `false` (padrão: false) |

**Modos:**
- ⚡ **Rápido**: Converte todo conteúdo em um único capítulo (mais rápido, ~30-60s)
- 📖 **Completo**: Cria múltiplos capítulos (mais estruturado, ~1-3 min)

**Resposta:**
- Embed com informações da conversão
- Arquivo EPUB pronto para download
- Status e tempo de processamento

---

### `/help` - Obter Ajuda

**Uso:**
```
/help
```

**Resposta:**
- Lista de todos os comandos
- Exemplos de uso
- Informações sobre limites e restrições
- Dicas úteis

---

### `/status` - Ver Status do Bot

**Uso:**
```
/status
```

**Resposta:**
- Status online/offline
- Tempo de atividade (uptime)
- Conversões ativas
- Número de servidores
- Uso de memória

## 💡 Exemplos de Uso

### Exemplo 1: Conversão Simples

```
/convert pdf:meu_livro.pdf
```

Resultado: EPUB com modo rápido, sem tradução

### Exemplo 2: Conversão Completa com Tradução

```
/convert pdf:novel.pdf modo:completo traduzir:true
```

Resultado:
- EPUB com múltiplos capítulos
- Texto traduzido para português
- Tempo de processamento: ~2-3 minutos

### Exemplo 3: Com Capa Personalizada

```
/convert pdf:documento.pdf capa:minha_capa.png modo:completo
```

Resultado:
- EPUB com capa customizada
- Estrutura de múltiplos capítulos

### Exemplo 4: Conversão Rápida com Tudo

```
/convert pdf:livro.pdf capa:capa.jpg modo:rápido traduzir:true
```

Resultado:
- Conversão em ~30-60 segundos
- Um capítulo único
- Com tradução e capa

## 🎯 Dicas e Truques

### Otimizar Tempo de Conversão

```
/convert pdf:grande.pdf modo:rápido
```
- Use modo rápido para PDFs grandes
- Pule a tradução se não precisar

### Melhor Qualidade

```
/convert pdf:especial.pdf modo:completo traduzir:true capa:premium.png
```
- Use modo completo para melhor estrutura
- Adicione capa de qualidade
- Deixe traduzir se for outro idioma

### Para Pesquisa Acadêmica

```
/convert pdf:paper.pdf modo:completo
```
- Sem tradução (mantém original)
- Modo completo (preserve capítulos/seções)

## ⚙️ Configuração Avançada

### Variáveis de Ambiente

```env
# .env
DISCORD_BOT_TOKEN=seu_token
DISCORD_CLIENT_ID=seu_client_id
DISCORD_GUILD_ID=123456789     # Para testes (opcional)
MAX_FILE_SIZE=8388608          # 8MB em bytes
TEMP_DIR=./temp                # Diretório temporário
```

### Permissões Recomendadas

```
applications.commands
bot
+ Send Messages
+ Embed Links
+ Attach Files
+ Read Message History
```

## 🐛 Troubleshooting

### "Bot não está respondendo"

**Solução:**
```bash
# 1. Verificar se está rodando
npm run dev

# 2. Verificar token
cat .env | grep DISCORD_BOT_TOKEN

# 3. Ver logs
# Deve mostrar: ✅ Bot logado como Nome#0000
```

### "Comando não aparece"

**Solução:**
- Aguardar até 1 hora (comandos globais)
- Ou adicionar `DISCORD_GUILD_ID` no `.env` para teste rápido

```env
DISCORD_GUILD_ID=seu_guild_id_aqui
```

Depois rodar:
```bash
npm run dev
```

### "Arquivo PDF não processa"

**Verificações:**
- ✅ Arquivo é PDF válido?
- ✅ Tamanho < 8MB?
- ✅ PDF tem texto (não é só imagem)?

Se for PDF scannerizado:
```bash
# Use OCR antes de converter
# Recomendação: PDF-XChange Editor ou Preview no Mac
```

### "EPUB muito grande para enviar"

**Solução:**
- Use modo rápido (reduz tamanho)
- Pule a tradução
- Reduza qualidade de imagens

```
/convert pdf:grande.pdf modo:rápido
```

### "Erro: Canvas não encontrado"

**Windows:**
```bash
npm install --build-from-source
```

**Linux:**
```bash
sudo apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
```

**macOS:**
```bash
brew install cairo pkg-config jpeg
npm install
```

## 📊 Limites e Quotas

| Item | Limite | Observação |
|------|--------|-----------|
| Tamanho PDF | 8 MB | Limite Discord |
| Tamanho Capa | 5 MB | Limite Discord |
| Caracteres | 800k | Performance |
| EPUB Resultante | 8 MB | Para upload |
| Conversões | 1 por usuário | Por vez |
| Timeout | 15 min | Limite Discord |

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs do bot
2. Consultar [Discord.js Documentation](https://discord.js.org/)
3. Ver [GitHub Issues](https://github.com/seu-usuario/conversor-de-livros/issues)

## 🎨 Customização

### Alterar Mensagens

Editar em `src/commands/convert.js`:

```javascript
const successEmbed = new EmbedBuilder()
  .setColor('#10b981')
  .setTitle('✅ Conversão Concluída!')
  // ... customize aqui
```

### Alterar Comportamento

Em `src/bot.js`:

```javascript
client.user.setActivity('📚 /convert - Seu novo texto aqui', { type: 'WATCHING' })
```

## 📝 Histórico de Alterações

- **v1.0.0** - Lançamento inicial
  - Comando /convert
  - Suporte a capa
  - Tradução automática
  - Modo rápido/completo

---

**Última atualização**: 20 de janeiro de 2026

Para mais informações, consulte [README.md](./README.md) ou [README-COMPLETO.md](../README-COMPLETO.md)
