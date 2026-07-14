/**
 * Caso de uso RF-01/RF-02/RF-03/RF-05: cargar y procesar un archivo CSV.
 * Orquesta validación, reglas de negocio, almacenamiento (S3 emulado),
 * manifiesto y catalogación (Glue emulado). Solo depende de puertos.
 */
import { createHash, randomUUID } from 'crypto';
import { parseCsv, validateRows, CsvRow } from '../domain/services/csv-validator';
import { applyBusinessRules } from '../domain/services/business-rules';
import { CsvValidationError } from '../domain/errors';
import { FlaggedTransaction, Transaction } from '../domain/entities/transaction';
import { BatchManifest } from '../domain/entities/manifest';
import { TransactionRepository } from '../domain/ports/transaction-repository';
import { FileStorage } from '../domain/ports/file-storage';
import { CatalogColumn, DataCatalog } from '../domain/ports/data-catalog';

export interface UploadResult {
  batchId: string;
  manifest: BatchManifest;
  flagged: Array<{ transactionId: string; reason: string }>;
}

const GLUE_DATABASE = 'fincard_loyalty';
const GLUE_TABLE = 'transactions';

const TABLE_COLUMNS: CatalogColumn[] = [
  { name: 'transaction_id', type: 'STRING' },
  { name: 'member_id', type: 'STRING' },
  { name: 'partner_id', type: 'STRING' },
  { name: 'points_earned', type: 'INT' },
  { name: 'points_redeemed', type: 'INT' },
  { name: 'transaction_date', type: 'DATE' },
  { name: 'partner_name', type: 'STRING' },
  { name: 'processed_at', type: 'TIMESTAMP' },
  { name: 'batch_id', type: 'STRING' }
];

export class UploadTransactionsUseCase {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly storage: FileStorage,
    private readonly catalog: DataCatalog
  ) {}

  async execute(fileContent: string): Promise<UploadResult> {
    const rows = parseCsv(fileContent);
    const { validRows, errors } = validateRows(rows);
    if (validRows.length === 0) {
      throw new CsvValidationError(errors);
    }

    const batchId = randomUUID();
    const processedAt = new Date().toISOString();
    const transactions = validRows.map(({ data }) => toTransaction(data, batchId, processedAt));

    const { clean, flagged } = this.splitByBusinessRules(transactions);
    await this.repository.saveMany(clean);
    await this.repository.saveFlagged(flagged);

    const manifest = this.buildManifest(batchId, processedAt, fileContent, clean, flagged, errors);
    await this.storeInS3(clean, manifest);
    await this.registerInCatalog(batchId);

    return {
      batchId,
      manifest,
      flagged: flagged.map(({ transactionId, flagReason }) => ({ transactionId, reason: flagReason }))
    };
  }

  private splitByBusinessRules(transactions: Transaction[]): {
    clean: Transaction[];
    flagged: FlaggedTransaction[];
  } {
    const flags = new Map(applyBusinessRules(transactions).map((flag) => [flag.transactionId, flag.reason]));
    const clean = transactions.filter((transaction) => !flags.has(transaction.transactionId));
    const flagged = transactions
      .filter((transaction) => flags.has(transaction.transactionId))
      .map((transaction) => ({ ...transaction, flagReason: flags.get(transaction.transactionId) as string }));
    return { clean, flagged };
  }

  private buildManifest(
    batchId: string,
    processedAt: string,
    fileContent: string,
    clean: Transaction[],
    flagged: FlaggedTransaction[],
    errors: BatchManifest['errors']
  ): BatchManifest {
    return {
      batchId,
      totalValidRows: clean.length,
      totalRejectedRows: errors.length === 0 ? 0 : countRejectedRows(errors),
      totalFlaggedRows: flagged.length,
      errors,
      processedAt,
      originalFileSha256: createHash('sha256').update(fileContent).digest('hex')
    };
  }

  /** Guarda CSVs por partición {year}/{month}/{partner_id}/ y el manifiesto del lote. */
  private async storeInS3(transactions: Transaction[], manifest: BatchManifest): Promise<void> {
    const groups = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      const [year, month] = transaction.transactionDate.split('-');
      const key = `${year}/${month}/${transaction.partnerId}/${manifest.batchId}.csv`;
      const group = groups.get(key) ?? [];
      group.push(transaction);
      groups.set(key, group);
    }

    for (const [key, group] of groups) {
      await this.storage.putObject(key, toCsv(group));
    }
    await this.storage.putObject(`manifests/${manifest.batchId}.json`, JSON.stringify(manifest, null, 2));
  }

  private async registerInCatalog(batchId: string): Promise<void> {
    await this.catalog.ensureDatabase(GLUE_DATABASE);
    await this.catalog.ensureTable(GLUE_DATABASE, GLUE_TABLE, TABLE_COLUMNS);
    await this.catalog.registerBatch(GLUE_DATABASE, GLUE_TABLE, batchId, 's3://fincard-transactions/');
  }
}

function toTransaction(row: CsvRow, batchId: string, processedAt: string): Transaction {
  return {
    transactionId: row.transaction_id,
    memberId: row.member_id,
    partnerId: row.partner_id,
    pointsEarned: Number(row.points_earned),
    pointsRedeemed: Number(row.points_redeemed),
    transactionDate: row.transaction_date,
    partnerName: row.partner_name,
    processedAt,
    batchId
  };
}

function toCsv(transactions: Transaction[]): string {
  const header = 'transaction_id,member_id,partner_id,points_earned,points_redeemed,transaction_date,partner_name,processed_at,batch_id';
  const lines = transactions.map((transaction) =>
    [
      transaction.transactionId,
      transaction.memberId,
      transaction.partnerId,
      transaction.pointsEarned,
      transaction.pointsRedeemed,
      transaction.transactionDate,
      transaction.partnerName,
      transaction.processedAt,
      transaction.batchId
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

function countRejectedRows(errors: BatchManifest['errors']): number {
  return new Set(errors.map((error) => error.row)).size;
}
