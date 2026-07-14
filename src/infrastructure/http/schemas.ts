/**
 * Esquemas JSON de las rutas: alimentan la validación de Fastify
 * y la documentación OpenAPI/Swagger (descripciones en español).
 */

const rowErrorsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      row: { type: 'integer' },
      field: { type: 'string' },
      message: { type: 'string' }
    }
  }
} as const;

const manifestSchema = {
  type: 'object',
  properties: {
    batchId: { type: 'string' },
    totalValidRows: { type: 'integer' },
    totalRejectedRows: { type: 'integer' },
    totalFlaggedRows: { type: 'integer' },
    errors: rowErrorsSchema,
    processedAt: { type: 'string' },
    originalFileSha256: { type: 'string' }
  }
} as const;

const flaggedSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      transactionId: { type: 'string' },
      reason: { type: 'string' }
    }
  }
} as const;

export const uploadSchema = {
  tags: ['transactions'],
  summary: 'Carga de archivo CSV de transacciones de puntos (RF-01)',
  description:
    'Recibe un archivo CSV (multipart/form-data, campo "file") con transacciones de puntos. ' +
    'Valida formato y contenido, aplica las reglas de negocio RN-01..RN-04, almacena las ' +
    'transacciones válidas en S3 (emulado) y registra la catalogación en Glue (emulado).',
  consumes: ['multipart/form-data'],
  response: {
    201: {
      description: 'Archivo procesado correctamente',
      type: 'object',
      properties: {
        batch_id: { type: 'string' },
        manifest: manifestSchema,
        flagged: flaggedSchema
      }
    },
    400: {
      description: 'Errores de validación por fila o archivo inválido',
      type: 'object',
      properties: {
        message: { type: 'string' },
        errors: rowErrorsSchema,
        batch_id: { type: 'string' },
        manifest: manifestSchema,
        flagged: flaggedSchema
      }
    }
  }
} as const;

export const settlementSchema = {
  tags: ['settlements'],
  summary: 'Resumen de liquidación de puntos por aliado (RF-04)',
  description:
    'Devuelve el resumen de liquidación de un aliado comercial en un rango de fechas, ' +
    'incluyendo el desglose diario con TODOS los días del rango (ceros si no hay transacciones).',
  params: {
    type: 'object',
    required: ['partner_id'],
    properties: {
      partner_id: { type: 'string', description: 'Identificador del aliado (formato PART + 2 dígitos)' }
    }
  },
  querystring: {
    type: 'object',
    required: ['from', 'to'],
    properties: {
      from: { type: 'string', description: 'Fecha inicial YYYY-MM-DD' },
      to: { type: 'string', description: 'Fecha final YYYY-MM-DD' }
    }
  },
  response: {
    200: {
      description: 'Reporte de liquidación',
      type: 'object',
      properties: {
        partner_id: { type: 'string' },
        partner_name: { type: 'string' },
        period: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } }
        },
        summary: {
          type: 'object',
          properties: {
            total_transactions: { type: 'integer' },
            total_points_earned: { type: 'integer' },
            total_points_redeemed: { type: 'integer' },
            net_points_owed: { type: 'integer' },
            unique_members: { type: 'integer' }
          }
        },
        daily_breakdown: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              transactions: { type: 'integer' },
              points_earned: { type: 'integer' },
              points_redeemed: { type: 'integer' }
            }
          }
        }
      }
    },
    400: {
      description: 'Parámetros de fecha inválidos',
      type: 'object',
      properties: { message: { type: 'string' } }
    }
  }
} as const;
