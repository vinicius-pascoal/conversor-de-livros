FROM node:18-slim

# Instala dependências nativas para Canvas (manipulação de imagens)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
