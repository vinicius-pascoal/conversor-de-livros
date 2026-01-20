# 🚀 Guia de Deployment - Bot Discord

## 📍 Plataformas Recomendadas

### 1. **Replit** (Gratuito com limitações)

```bash
# 1. Importar repositório
# 2. Configurar .env
# 3. Rodar comando:
npm start
```

**Vantagens:**
- Fácil de usar
- Sempre online
- Suporte a webhooks

**Desvantagens:**
- Pode hibernar se inativo
- Recursos limitados

---

### 2. **Railway.app** (Recomendado)

#### Setup:

1. Crie conta em [railway.app](https://railway.app)
2. Conecte seu GitHub
3. Selecione este repositório

#### Configure variáveis:

```env
DISCORD_BOT_TOKEN=seu_token
DISCORD_CLIENT_ID=seu_client_id
NODE_ENV=production
```

#### Deploy:

```bash
# Automático quando fazer push para main
git push origin main
```

**Custo:** $5/mês por bot (primeira 500h grátis)

---

### 3. **Heroku** (Gratuito com account verification)

```bash
# 1. Instalar Heroku CLI
# 2. Login
heroku login

# 3. Criar app
heroku create seu-bot-name

# 4. Configurar variáveis
heroku config:set DISCORD_BOT_TOKEN=seu_token
heroku config:set DISCORD_CLIENT_ID=seu_client_id

# 5. Deploy
git push heroku main
```

**Custo:** Gratuito (conta verificada)

---

### 4. **Docker em VPS (Recomendado para produção)**

#### Servidor Ubuntu/Debian:

```bash
# 1. Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Clonar repositório
git clone https://github.com/seu-usuario/conversor-de-livros.git
cd conversor-de-livros

# 4. Configurar .env
cp discord-bot/.env.example discord-bot/.env
# Editar com seus valores

# 5. Build e run
docker-compose build
docker-compose up -d

# 6. Ver logs
docker-compose logs -f discord-bot
```

---

## 🔐 Variáveis de Ambiente

### Essenciais

```env
# Discord
DISCORD_BOT_TOKEN=xxxxxxxxxxx
DISCORD_CLIENT_ID=123456789012345678

# Modo de produção
NODE_ENV=production
```

### Opcionais

```env
# Para desenvolvimento/testes (não usar em produção)
DISCORD_GUILD_ID=seu_guild_id

# Diretórios
TEMP_DIR=/tmp/conversions
MAX_FILE_SIZE=8388608
```

---

## 📊 Monitoramento

### Logs

```bash
# Docker
docker-compose logs -f discord-bot

# Específico
docker-compose logs discord-bot --tail=100
```

### Uptime Monitoring

Usar serviços como:
- [Uptime Robot](https://uptimerobot.com) - Gratuito
- [Healthchecks.io](https://healthchecks.io) - Gratuito
- [PagerDuty](https://www.pagerduty.com) - Pago

---

## 🔄 Atualizar Bot

### Com Docker Compose

```bash
# Puxar atualizações
git pull origin main

# Rebuild
docker-compose build --no-cache

# Restart
docker-compose restart discord-bot

# Ver status
docker-compose ps
```

### Com PM2 (Processo Node)

```bash
# Instalar PM2
npm install -g pm2

# Iniciar
pm2 start src/bot.js --name "conversor-bot"

# Ver logs
pm2 logs conversor-bot

# Restart
pm2 restart conversor-bot

# Stop
pm2 stop conversor-bot
```

---

## 🌐 Melhorias de Performance

### 1. **Cache de Conversões**

```javascript
// src/services/cache.js
const conversionCache = new Map()

export function cacheConversion(hash, epub) {
  conversionCache.set(hash, epub)
}

export function getFromCache(hash) {
  return conversionCache.get(hash)
}
```

### 2. **Queue de Conversões**

```javascript
// src/services/queue.js
import PQueue from 'p-queue'

export const queue = new PQueue({ concurrency: 2 })

// Usar
await queue.add(() => convertPdfToEpub(...))
```

### 3. **Compressão de EPUBs**

```javascript
// Reduzir tamanho antes de enviar
const zlib = require('zlib')
const compressed = zlib.gzipSync(epubBuffer)
```

---

## 🚨 Troubleshooting Deployment

### Bot não inicia

```bash
# Verificar logs
docker-compose logs discord-bot

# Verificar variáveis
docker-compose config

# Rebuild
docker-compose up --build
```

### Erro: "Canvas not found"

```bash
# Alpine Linux não tem suporte a canvas por padrão
# Solução: Usar ubuntu/debian

FROM node:20
# Adicionar dependências
RUN apt-get update && apt-get install -y \
    cairo-dev pango-dev libjpeg-dev giflib-dev
```

### Bot consome muita memória

```bash
# Aumentar limite Node
NODE_OPTIONS=--max-old-space-size=2048 npm start

# Ou no Docker
environment:
  - NODE_OPTIONS=--max-old-space-size=1024
```

### Timeouts longos

```javascript
// Aumentar timeout em src/bot.js
client.on('interactionCreate', async (interaction) => {
  // Adicionar timeout handler
  setTimeout(() => {
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: 'Timeout!', ephemeral: true })
    }
  }, 14 * 60 * 1000) // 14 minutos (limite é 15)
})
```

---

## 📈 Escalabilidade

### Múltiplas Instâncias

```yaml
# docker-compose.yml com múltiplas instâncias
services:
  discord-bot-1:
    build: ./discord-bot
    env_file: ./discord-bot/.env
    
  discord-bot-2:
    build: ./discord-bot
    env_file: ./discord-bot/.env-2
    
  # ... mais instâncias se necessário
```

### Balanceamento de Carga

```bash
# nginx.conf
upstream discord_bots {
    server bot-1:3001;
    server bot-2:3001;
}

server {
    listen 3001;
    
    location / {
        proxy_pass http://discord_bots;
    }
}
```

---

## 🔄 CI/CD com GitHub Actions

### `.github/workflows/deploy.yml`

```yaml
name: Deploy Bot

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Build Docker image
      run: docker build -t conversor-bot ./discord-bot
    
    - name: Push to Registry
      env:
        REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
      run: |
        docker tag conversor-bot:latest seu-registry/conversor-bot:latest
        docker push seu-registry/conversor-bot:latest
    
    - name: Deploy
      run: |
        # Comandos de deploy
        docker pull seu-registry/conversor-bot:latest
        docker-compose up -d
```

---

## 💰 Comparação de Custos (Por Mês)

| Plataforma | Custo | Uptime | Recomendado Para |
|-----------|-------|--------|-----------------|
| Replit | $7+ | ~90% | Prototipagem |
| Railway | $5 | 99.9% | Produção pequena |
| Heroku | Gratuito | 99.9% | Hobby projects |
| VPS Digital Ocean | $5-20 | 99.95% | Produção |
| AWS EC2 | $10-50+ | 99.99% | Enterprise |

---

## ✅ Checklist de Deployment

- [ ] Variáveis de ambiente configuradas
- [ ] Token Discord válido
- [ ] Bot adicionado ao servidor
- [ ] Permissões configuradas
- [ ] Testes locais passando
- [ ] Logs configurados
- [ ] Backup do .env (seguro)
- [ ] Monitoramento ativado
- [ ] Respuesta rápida para erros definida
- [ ] Plano de recuperação pronto

---

## 🆘 Suporte

Se tiver dúvidas:
1. Verificar logs: `docker-compose logs discord-bot`
2. Consultar [Discord.js Docs](https://discord.js.org/)
3. Abrir issue no GitHub
4. Contactar suporte da plataforma

---

**Última atualização**: 20 de janeiro de 2026
