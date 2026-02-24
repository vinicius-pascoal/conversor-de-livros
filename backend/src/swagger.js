import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Conversor de Livros API',
      version: '2.0.0',
      description: `
API para conversão de arquivos PDF para formato EPUB ou geração de PDF traduzido.

**Recursos principais:**
- 📚 Conversão de PDF para EPUB (formato de livro digital)
- 🌐 Tradução automática para português (pt-BR)
- 📄 Geração de PDF traduzido com layout preservado
- 🖼️ Suporte a imagens e capas personalizadas
- ⚡ Modo rápido (um capítulo) ou completo (múltiplos capítulos)
- 📊 Progresso em tempo real via Server-Sent Events (SSE)
- 🔄 Upload de arquivos grandes (até 200MB)
      `,
      contact: {
        name: 'Support',
        email: 'support@example.com'
      },
      license: {
        name: 'ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Servidor de desenvolvimento'
      }
    ],
    components: {
      schemas: {
        ConversionResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Conversão iniciada'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Descrição do erro'
            },
            message: {
              type: 'string',
              example: 'Detalhes adicionais'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'OK'
            },
            message: {
              type: 'string',
              example: 'Servidor rodando!'
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/index.js']
}

const specs = swaggerJsdoc(options)

export default specs
