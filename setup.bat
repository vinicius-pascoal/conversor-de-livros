@echo off
REM Setup script para Windows - Conversor PDF para EPUB

echo.
echo ================================
echo    SETUP CONVERSOR COMPLETO
echo ================================
echo.

REM 1. Instalar dependências
echo [1/4] Instalando dependências...

echo   Backend...
cd backend
call npm install >nul 2>&1
cd ..

echo   Frontend...
cd frontend
call npm install >nul 2>&1
cd ..

echo   Discord Bot...
cd discord-bot
call npm install >nul 2>&1
cd ..

echo.

REM 2. Criar arquivo .env
if not exist "discord-bot\.env" (
    echo [2/4] Criando arquivo .env do Discord Bot...
    copy discord-bot\.env.example discord-bot\.env >nul
    echo  ARQUIVO CRIADO: discord-bot\.env
    echo  IMPORTANTE: Edite o arquivo com seus valores!
    echo.
) else (
    echo [2/4] Arquivo discord-bot\.env ja existe
    echo.
)

REM 3. Criar diretorios
echo [3/4] Criando diretorios...
if not exist "backend\uploads" mkdir backend\uploads
if not exist "discord-bot\temp" mkdir discord-bot\temp

echo.

REM 4. Resumo
echo ================================
echo   SETUP COMPLETO!
echo ================================
echo.
echo Proximos passos:
echo.
echo 1. Configure o Discord Bot:
echo    - Abra discord-bot\.env
echo    - Adicione DISCORD_BOT_TOKEN
echo    - Adicione DISCORD_CLIENT_ID
echo.
echo 2. Iniciar os servicos:
echo    - Com Docker: docker-compose up
echo    - Desenvolvimento:
echo      * Backend:    cd backend ^&^& npm run dev
echo      * Frontend:   cd frontend ^&^& npm run dev
echo      * Bot:        cd discord-bot ^&^& npm run dev
echo.
echo 3. Acessar:
echo    - Website:    http://localhost:3000
echo    - API:        http://localhost:3001
echo    - Swagger:    http://localhost:3001/api-docs
echo.
echo Documentacao: Ver README-COMPLETO.md
echo.
pause
