/**
 * Adaptador HTTP de entrada: expone los casos de uso como rutas Fastify.
 * Traduce errores del dominio a códigos HTTP.
 */
import { FastifyError, FastifyInstance } from 'fastify';
import { UploadTransactionsUseCase } from '../../application/upload-transactions';
import { GetSettlementUseCase } from '../../application/get-settlement';
import { CsvValidationError, InvalidCsvError, InvalidDateRangeError } from '../../domain/errors';
import { SettlementReport } from '../../domain/entities/settlement';
import { settlementSchema, uploadSchema } from './schemas';

export interface UseCases {
  uploadTransactions: UploadTransactionsUseCase;
  getSettlement: GetSettlementUseCase;
}

interface SettlementParams {
  partner_id: string;
}

interface SettlementQuery {
  from: string;
  to: string;
}

export function registerRoutes(app: FastifyInstance, useCases: UseCases): void {
  app.post(
    '/api/v1/transactions/upload',
    {
      schema: uploadSchema,
      // El cuerpo multipart se procesa manualmente con request.file();
      // el esquema del body existe solo para la documentación Swagger.
      validatorCompiler: () => () => true
    },
    async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({
        message: 'La solicitud debe ser multipart/form-data e incluir un archivo CSV en el campo "file"',
        errors: []
      });
    }
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ message: 'Se requiere un archivo CSV en el campo "file"', errors: [] });
    }
    if (!isCsvFile(file.filename, file.mimetype)) {
      return reply.status(400).send({
        message: `Solo se admiten archivos CSV (.csv); se recibió "${file.filename}" (${file.mimetype})`,
        errors: []
      });
    }
    const content = (await file.toBuffer()).toString('utf-8');
    const result = await useCases.uploadTransactions.execute(content);
    const status = result.manifest.errors.length > 0 ? 400 : 201;
    return reply.status(status).send({
      batch_id: result.batchId,
      manifest: result.manifest,
      flagged: result.flagged,
      ...(status === 400 && { message: 'Algunas filas fueron rechazadas por errores de validación', errors: result.manifest.errors })
    });
    }
  );

  app.get<{ Params: SettlementParams; Querystring: SettlementQuery }>(
    '/api/v1/settlements/:partner_id',
    { schema: settlementSchema },
    async (request) => {
      const { partner_id } = request.params;
      const { from, to } = request.query;
      const report = await useCases.getSettlement.execute(partner_id, from, to);
      return toApiResponse(report);
    }
  );

  registerErrorHandler(app);
}

/** Solo se aceptan archivos con extensión .csv o content-type de CSV/texto plano. */
function isCsvFile(filename: string, mimetype: string): boolean {
  const csvMimeTypes = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];
  return filename.toLowerCase().endsWith('.csv') || csvMimeTypes.includes(mimetype);
}

/** Convierte el modelo de dominio (camelCase) al contrato del API (snake_case). */
function toApiResponse(report: SettlementReport): Record<string, unknown> {
  return {
    partner_id: report.partnerId,
    partner_name: report.partnerName,
    period: report.period,
    summary: {
      total_transactions: report.summary.totalTransactions,
      total_points_earned: report.summary.totalPointsEarned,
      total_points_redeemed: report.summary.totalPointsRedeemed,
      net_points_owed: report.summary.netPointsOwed,
      unique_members: report.summary.uniqueMembers
    },
    daily_breakdown: report.dailyBreakdown.map((entry) => ({
      date: entry.date,
      transactions: entry.transactions,
      points_earned: entry.pointsEarned,
      points_redeemed: entry.pointsRedeemed
    }))
  };
}

/** Mensajes en español para los errores propios de Fastify/multipart. */
const FASTIFY_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  FST_INVALID_MULTIPART_CONTENT_TYPE: {
    status: 400,
    message: 'La solicitud debe ser multipart/form-data e incluir un archivo CSV en el campo "file"'
  },
  FST_REQ_FILE_TOO_LARGE: {
    status: 413,
    message: 'El archivo excede el tamaño máximo permitido'
  },
  FST_PARTS_LIMIT: {
    status: 413,
    message: 'La solicitud multipart contiene demasiadas partes'
  },
  FST_FILES_LIMIT: {
    status: 413,
    message: 'Solo se permite un archivo por solicitud'
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    message: 'El cuerpo de la solicitud está vacío o no es válido'
  }
};

function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      message: `La ruta ${request.method} ${request.url} no existe. Consulte la documentación en /docs`,
      errors: []
    });
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof CsvValidationError) {
      return reply.status(400).send({ message: error.message, errors: error.errors });
    }
    if (error instanceof InvalidCsvError || error instanceof InvalidDateRangeError) {
      return reply.status(400).send({ message: error.message, errors: [] });
    }
    const known = FASTIFY_ERROR_MESSAGES[error.code ?? ''];
    if (known) {
      return reply.status(known.status).send({ message: known.message, errors: [] });
    }
    if (error.validation) {
      return reply
        .status(400)
        .send({ message: `Parámetros de la solicitud inválidos: ${error.message}`, errors: [] });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ message: 'Error interno del servidor. Intente nuevamente o contacte al administrador', errors: [] });
  });
}
