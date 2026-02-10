# 🎨 Fixed Layout EPUB - Atualização Arquitetural

## 📋 Resumo das Mudanças

O projeto foi **completamente reformulado** para usar **Fixed Layout EPUB** por padrão, garantindo posicionamento **perfeito** de imagens e layout exato do PDF original.

---

## 🆕 Novos Módulos

### 1. `pdfRenderer.js`
- **Função**: Renderiza cada página do PDF como imagem de alta qualidade (PNG, scale 2.0)
- **Tecnologia**: PDF.js + Canvas
- **Output**: Array de páginas com imagens e metadados (largura, altura, posições de texto)

### 2. `fixedLayoutEpub.js`
- **Função**: Gera EPUB 3.0 com metadata Fixed Layout (`rendition:layout=pre-paginated`)
- **Estrutura**: 
  - Uma página XHTML por página do PDF
  - Imagens em resolução 2x para qualidade
  - CSS otimizado para telas fixas
  - Navegação completa (toc.ncx + nav.xhtml)
- **Formato**: ZIP estruturado conforme especificação EPUB 3.0

---

## 🔄 Mudanças no `converter.js`

### Novo fluxo (padrão):
1. **Parse básico** do PDF com `pdf-parse` (metadados)
2. **Renderização** de todas as páginas em alta qualidade
3. **Geração** de EPUB Fixed Layout com posicionamento pixel-perfect
4. Tradução de texto extraído (opcional, para busca/metadados)

### Modo legado (fallback):
- Mantido como `convertPdfToEpubLegacy()`
- Ativado com `useFixedLayout: false`
- Usa extração de imagens individual + reflow EPUB

---

## 📦 Novas Dependências

```json
{
  "archiver": "^7.0.1",  // Compactar estrutura EPUB em ZIP
  "uuid": "^10.0.0"      // Gerar identificadores únicos
}
```

### Instalação:
```bash
# Backend
cd backend
npm install

# Discord Bot
cd discord-bot
npm install
```

---

## 🎯 Benefícios

### ✅ Vantagens do Fixed Layout:
- **Posicionamento perfeito** de imagens e texto
- **Fidelidade visual** 100% ao PDF original
- **Escalabilidade** de imagens (2x) para telas de alta resolução
- **Compatibilidade** com leitores EPUB modernos (Apple Books, Google Play Books, Calibre)

### ⚠️ Trade-offs:
- **Tamanho maior** do arquivo (imagens em alta resolução)
- **Menos responsivo** que reflow (páginas fixas)
- **Busca/seleção de texto** limitada (depende de extração)

---

## 🔧 Como Usar

### Modo padrão (Fixed Layout):
```javascript
await convertPdfToEpub(pdfPath, epubPath, filename, {
  fastMode: false,
  translate: false,
  useFixedLayout: true  // ✅ Padrão
})
```

### Modo legado (Reflow):
```javascript
await convertPdfToEpub(pdfPath, epubPath, filename, {
  useFixedLayout: false,  // ❌ Desabilita Fixed Layout
  keepImages: true
})
```

---

## 📊 Estrutura do EPUB Gerado

```
epub/
├── mimetype
├── META-INF/
│   └── container.xml
└── OEBPS/
    ├── content.opf        # Metadata + Fixed Layout flags
    ├── toc.ncx            # Navegação EPUB 2.0
    ├── nav.xhtml          # Navegação EPUB 3.0
    ├── style.css          # CSS para Fixed Layout
    ├── images/
    │   ├── page-0001.png  # Páginas renderizadas
    │   ├── page-0002.png
    │   └── ...
    └── text/
        ├── page-0001.xhtml # XHTML por página
        ├── page-0002.xhtml
        └── ...
```

---

## 🧪 Testando

### Backend:
```bash
cd backend
npm run dev

# Enviar PDF via API
curl -X POST http://localhost:3000/api/convert \
  -F "pdf=@test.pdf" \
  -o output.epub
```

### Discord Bot:
```bash
cd discord-bot
npm run dev

# Usar comando /convert no Discord
```

### Validar EPUB:
```bash
# EPUBCheck (validador oficial)
java -jar epubcheck.jar output.epub

# Calibre (visualizar)
ebook-viewer output.epub
```

---

## 🔍 Arquivos Modificados

### Backend:
- ✅ `package.json` - novas dependências
- ✅ `src/services/converter.js` - lógica Fixed Layout
- ✨ `src/services/pdfRenderer.js` - novo
- ✨ `src/services/fixedLayoutEpub.js` - novo

### Discord Bot:
- ✅ `package.json` - novas dependências
- ✅ `src/services/converter.js` - lógica Fixed Layout
- ✨ `src/services/pdfRenderer.js` - novo
- ✨ `src/services/fixedLayoutEpub.js` - novo

---

## 🚀 Próximos Passos

1. **Instalar dependências** em ambos os projetos
2. **Testar conversão** com PDFs variados
3. **Ajustar scale** (1.5x - 3.0x) conforme necessidade de qualidade
4. **Implementar OCR** (opcional) para PDFs escaneados
5. **Adicionar overlay de texto** selecionável (já preparado no código)

---

## 📚 Referências

- [EPUB 3.3 Spec - Fixed Layout](https://www.w3.org/TR/epub-33/#sec-fixed-layouts)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Archiver NPM](https://www.npmjs.com/package/archiver)

---

**Desenvolvido com ❤️ para precisão máxima em conversões PDF → EPUB**
