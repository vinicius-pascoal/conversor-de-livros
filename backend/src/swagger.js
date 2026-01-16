import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PDF to EPUB Converter API',
      version: '1.0.0',
      description: 'API para conversão de arquivos PDF para formato EPUB',
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
