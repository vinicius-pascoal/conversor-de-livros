# 🚀 Guia Rápido de Testes - Fixed Layout EPUB

## 🧪 Teste 1: Backend API

```bash
# 1. Iniciar o backend
cd backend
npm run dev

# 2. Em outro terminal, fazer upload de um PDF de teste
curl -X POST http://localhost:3000/api/convert \
  -F "pdf=@seu_arquivo.pdf" \
  -o output-fixedlayout.epub

# 3. Verificar o EPUB gerado
ls -lh output-fixedlayout.epub
```

### Validar o EPUB:
```bash
# Instalar EPUBCheck (validador oficial)
# https://github.com/w3c/epubcheck/releases
java -jar epubcheck.jar output-fixedlayout.epub

# Ou usar Calibre para visualizar
ebook-viewer output-fixedlayout.epub
```

## 🤖 Teste 2: Discord Bot

```bash
# 1. Configurar as variáveis de ambiente
cd discord-bot
cp .env.example .env
# Editar .env e adicionar seu DISCORD_BOT_TOKEN

# 2. Iniciar o bot
npm run dev

# 3. No Discord, usar:
/convert pdf:[anexar arquivo]
```

## 📊 Parâmetros de Teste

### Testar Fixed Layout (padrão):
```javascript
// Sem parâmetros especiais - já é o padrão
await convertPdfToEpub(pdfPath, epubPath, filename)
```

### Testar modo legado (reflow):
```javascript
// Adicionar useFixedLayout: false
await convertPdfToEpub(pdfPath, epubPath, filename, {
  useFixedLayout: false,
  keepImages: true
})
```

## 🔍 O Que Verificar

### ✅ Checklist de Sucesso:

1. **EPUB gerado**
   - [ ] Arquivo .epub criado
   - [ ] Tamanho razoável (geralmente 2-5x o PDF original)

2. **Estrutura interna**
   ```bash
   unzip -l output-fixedlayout.epub | head -20
   ```
   - [ ] `mimetype` presente
   - [ ] Pasta `META-INF/` com `container.xml`
   - [ ] Pasta `OEBPS/` com `content.opf`, `toc.ncx`, `nav.xhtml`
   - [ ] Pasta `OEBPS/images/` com PNGs das páginas
   - [ ] Pasta `OEBPS/text/` com XHTMLs das páginas

3. **Metadata Fixed Layout**
   ```bash
   unzip -p output-fixedlayout.epub OEBPS/content.opf | grep rendition
   ```
   - [ ] Deve conter: `<meta property="rendition:layout">pre-paginated</meta>`

4. **Qualidade visual**
   - [ ] Abrir no Apple Books / Google Play Books / Calibre
   - [ ] Páginas mantêm layout exato do PDF
   - [ ] Imagens nítidas e bem posicionadas
   - [ ] Navegação funciona entre páginas

5. **Console logs**
   - [ ] Vê "🎨 Renderizando páginas..."
   - [ ] Vê "✅ X páginas renderizadas"
   - [ ] Vê "📚 Gerando EPUB Fixed Layout..."
   - [ ] Vê "✨ EPUB Fixed Layout gerado com sucesso!"

## 🐛 Troubleshooting

### Erro: "Cannot find module 'archiver'"
```bash
cd backend  # ou discord-bot
npm install archiver uuid
```

### Erro: "Failed to render page X"
- PDF pode ter proteção/restrições
- Tentar outro arquivo PDF

### EPUB não abre corretamente
```bash
# Validar estrutura
java -jar epubcheck.jar output.epub

# Ver erros específicos
```

### Imagens borradas
```javascript
// Aumentar a escala de renderização
// Em pdfRenderer.js, alterar:
const scale = options.scale || 3.0  // de 2.0 para 3.0
```

### Arquivo muito grande
```javascript
// Reduzir escala
const scale = options.scale || 1.5

// Ou aumentar compressão PNG
// Em pdfRenderer.js:
compressionLevel: 9  // de 6 para 9
```

## 📁 PDFs de Teste Sugeridos

1. **Simples**: Documento de texto puro (1-5 páginas)
2. **Médio**: Relatório com imagens e gráficos (10-20 páginas)
3. **Complexo**: Livro/revista com layout elaborado (50+ páginas)
4. **Scaneado**: PDF sem texto (para verificar OCR futuro)

## 🎯 Métricas de Sucesso

| Métrica | Target |
|---------|--------|
| Tempo de conversão | < 2s por página |
| Tamanho EPUB | 2-5x tamanho PDF |
| Validação EPUBCheck | 0 erros |
| Qualidade visual | Layout 100% preservado |

## 📝 Reportar Issues

Se encontrar problemas:
1. Executar com logs verbosos
2. Capturar output do console
3. Anexar PDF de teste (se possível)
4. Verificar com EPUBCheck
5. Testar em múltiplos leitores EPUB

---

**Boa sorte! 🚀**
