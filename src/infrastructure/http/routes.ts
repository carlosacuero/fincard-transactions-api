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
  app.post('/api/v1/transactions/upload', { schema: uploadSchema }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ message: 'Se requiere un archivo CSV en el campo "file"', errors: [] });
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
  });

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

function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof CsvValidationError) {
      return reply.status(400).send({ message: error.message, errors: error.errors });
    }
    if (error instanceof InvalidCsvError || error instanceof InvalidDateRangeError) {
      return reply.status(400).send({ message: error.message, errors: [] });
    }
    if (error.validation) {
      return reply.status(400).send({ message: error.message, errors: [] });
    }
    app.log.error(error);
    return reply.status(500).send({ message: 'Error interno del servidor' });
  });
}
