#!/bin/bash

# 🚀 Script de Setup - Conversor PDF para EPUB

echo "================================"
echo "   🚀 SETUP CONVERSOR COMPLETO   "
echo "================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Instalar dependências
echo -e "${BLUE}📦 Instalando dependências...${NC}"

echo "📘 Backend..."
cd backend && npm install && cd .. > /dev/null 2>&1
echo -e "${GREEN}✓ Backend pronto${NC}"

echo "🎨 Frontend..."
cd frontend && npm install && cd .. > /dev/null 2>&1
echo -e "${GREEN}✓ Frontend pronto${NC}"

echo "🤖 Discord Bot..."
cd discord-bot && npm install && cd .. > /dev/null 2>&1
echo -e "${GREEN}✓ Discord Bot pronto${NC}"

echo ""

# 2. Criar arquivo .env para o bot
if [ ! -f "discord-bot/.env" ]; then
    echo -e "${YELLOW}⚙️  Criando arquivo .env do Discord Bot...${NC}"
    cp discord-bot/.env.example discord-bot/.env
    echo -e "${GREEN}✓ Arquivo criado em: discord-bot/.env${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Edite discord-bot/.env com seus valores!${NC}"
    echo ""
else
    echo -e "${GREEN}✓ Arquivo discord-bot/.env já existe${NC}"
fi

echo ""

# 3. Criar diretórios necessários
echo -e "${BLUE}📁 Criando diretórios...${NC}"
mkdir -p backend/uploads
mkdir -p discord-bot/temp
echo -e "${GREEN}✓ Diretórios criados${NC}"

echo ""

# 4. Resumo
echo "================================"
echo -e "${GREEN}✅ SETUP COMPLETO!${NC}"
echo "================================"
echo ""
echo -e "${BLUE}📚 Próximos passos:${NC}"
echo ""
echo "1️⃣  Configure o Discord Bot:"
echo "   - Abra discord-bot/.env"
echo "   - Adicione DISCORD_BOT_TOKEN"
echo "   - Adicione DISCORD_CLIENT_ID"
echo ""
echo "2️⃣  Iniciar os serviços:"
echo "   - Com Docker: ${YELLOW}docker-compose up${NC}"
echo "   - Desenvolvimento:"
echo "     • Backend:    ${YELLOW}cd backend && npm run dev${NC}"
echo "     • Frontend:   ${YELLOW}cd frontend && npm run dev${NC}"
echo "     • Bot:        ${YELLOW}cd discord-bot && npm run dev${NC}"
echo ""
echo "3️⃣  Acessar:"
echo "   - Website:    ${YELLOW}http://localhost:3000${NC}"
echo "   - API:        ${YELLOW}http://localhost:3001${NC}"
echo "   - Swagger:    ${YELLOW}http://localhost:3001/api-docs${NC}"
echo ""
echo "📚 Documentação: Ver ${YELLOW}README-COMPLETO.md${NC}"
echo ""
