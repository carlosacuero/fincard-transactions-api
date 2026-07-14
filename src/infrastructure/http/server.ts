/**
 * Composición de la aplicación (composition root):
 * construye los adaptadores, los inyecta en los casos de uso
 * y configura Fastify con Swagger (documentación en /docs).
 */
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { join } from 'path';
import { JsonTransactionRepository } from '../persistence/json-transaction-repository';
import { LocalFileStorage } from '../storage/local-file-storage';
import { LocalGlueCatalog } from '../catalog/local-glue-catalog';
import { UploadTransactionsUseCase } from '../../application/upload-transactions';
import { GetSettlementUseCase } from '../../application/get-settlement';
import { registerRoutes } from './routes';

export interface ServerOptions {
  /** Directorio raíz para datos, storage (S3 emulado) y catálogo. */
  baseDir?: string;
  logger?: boolean;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const baseDir = options.baseDir ?? process.cwd();
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(multipart);
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FinCard - Módulo de Liquidación de Puntos y Aliados',
        description:
          'API para la carga de archivos de transacciones de puntos, validación de calidad ' +
          'del dato y consulta de liquidaciones por aliado comercial.',
        version: '1.0.0'
      },
      tags: [
        { name: 'transactions', description: 'Carga y procesamiento de transacciones' },
        { name: 'settlements', description: 'Consulta de liquidaciones por aliado' }
      ]
    }
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  const repository = new JsonTransactionRepository(join(baseDir, 'data'));
  const storage = new LocalFileStorage(join(baseDir, 'storage', 'fincard-transactions'));
  const catalog = new LocalGlueCatalog(join(baseDir, 'data', 'glue-catalog.json'));

  registerRoutes(app, {
    uploadTransactions: new UploadTransactionsUseCase(repository, storage, catalog),
    getSettlement: new GetSettlementUseCase(repository)
  });

  return app;
}
