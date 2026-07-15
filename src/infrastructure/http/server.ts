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
import { S3FileStorage } from '../storage/s3-file-storage';
import { LocalGlueCatalog } from '../catalog/local-glue-catalog';
import { GlueDataCatalog } from '../catalog/glue-data-catalog';
import { FileStorage } from '../../domain/ports/file-storage';
import { DataCatalog } from '../../domain/ports/data-catalog';
import { UploadTransactionsUseCase } from '../../application/upload-transactions';
import { GetSettlementUseCase } from '../../application/get-settlement';
import { registerRoutes } from './routes';

export interface ServerOptions {
  /** Directorio raíz para datos, storage (S3 emulado) y catálogo. */
  baseDir?: string;
  logger?: boolean;
  /** "aws" usa S3 y Glue reales; "local" (por defecto) usa los emulados. */
  storageDriver?: 'local' | 'aws';
  /** Bucket S3 destino cuando storageDriver es "aws". */
  s3Bucket?: string;
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
  const { storage, catalog } = buildStorageAdapters(options, baseDir);

  registerRoutes(app, {
    uploadTransactions: new UploadTransactionsUseCase(repository, storage, catalog),
    getSettlement: new GetSettlementUseCase(repository)
  });

  return app;
}

/** Selecciona los adaptadores según configuración: AWS reales o emulados en local. */
function buildStorageAdapters(
  options: ServerOptions,
  baseDir: string
): { storage: FileStorage; catalog: DataCatalog } {
  if (options.storageDriver === 'aws') {
    const bucket = options.s3Bucket;
    if (!bucket) {
      throw new Error('Se requiere s3Bucket cuando storageDriver es "aws"');
    }
    return {
      storage: new S3FileStorage(bucket),
      catalog: new GlueDataCatalog(`s3://${bucket}/`)
    };
  }
  return {
    storage: new LocalFileStorage(join(baseDir, 'storage', 'fincard-transactions')),
    catalog: new LocalGlueCatalog(join(baseDir, 'data', 'glue-catalog.json'))
  };
}
