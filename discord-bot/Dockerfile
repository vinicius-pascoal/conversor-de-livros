FROM node:20-alpine

# Instala dependências necessárias para canvas e pdf-parse
RUN apk add --no-cache \
  cairo-dev \
  pango-dev \
  jpeg-dev \
  giflib-dev \
  librsvg-dev \
  python3 \
  make \
  g++

WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm ci --only=production && npm rebuild canvas

# Copia código do bot
COPY . .

# Cria diretório de temporários
RUN mkdir -p ./temp

# Executa o bot
CMD ["node", "src/bot.js"]
