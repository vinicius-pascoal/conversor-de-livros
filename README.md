# Conversor de PDF para EPUB

Aplicação para converter arquivos PDF em formato EPUB, com frontend em Next.js e backend em Node.js.

## 📁 Estrutura do Projeto

```
conversor-de-livros/
├── frontend/          # Aplicação Next.js
│   ├── app/
│   ├── package.json
│   └── ...
├── backend/           # Servidor Node.js
│   ├── src/
│   ├── package.json
│   └── ...
└── README.md
```

## 🚀 Como Executar

### Backend

1. Navegue até a pasta do backend:
```bash
cd backend
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

### Frontend

1. Abra um novo terminal e navegue até a pasta do frontend:
```bash
cd frontend
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

## 🛠️ Tecnologias Utilizadas

### Frontend
- **Next.js 14** - Framework React
- **TypeScript** - Tipagem estática
- **Axios** - Cliente HTTP

### Backend
- **Express** - Framework web
- **Multer** - Upload de arquivos
- **pdf-parse** - Extração de texto de PDF
- **epub-gen** - Geração de arquivos EPUB
- **CORS** - Comunicação entre frontend e backend

## 📝 Funcionalidades

- ✅ Upload de arquivos PDF via drag & drop ou clique
- ✅ Conversão de PDF para EPUB
- ✅ Download automático do arquivo convertido
- ✅ Interface responsiva e moderna
- ✅ Validação de tipo de arquivo
- ✅ Feedback visual durante o processo

## 🔧 Configuração

### Backend (.env)
```
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 📦 Estrutura de Arquivos

### Backend
- `src/index.js` - Servidor principal
- `src/routes/convert.js` - Rotas de conversão
- `src/services/converter.js` - Lógica de conversão PDF → EPUB

### Frontend
- `app/page.tsx` - Página principal com interface de upload
- `app/layout.tsx` - Layout da aplicação
- `app/globals.css` - Estilos globais

## 🤝 Contribuindo

Sinta-se à vontade para abrir issues e pull requests!

## 📄 Licença

ISC
