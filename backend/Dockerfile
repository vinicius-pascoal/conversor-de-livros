FROM node:18-slim

# Não precisa mais instalar Poppler - usando PDF.js puro JavaScript
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
