/**
 * Adaptadores en memoria para pruebas unitarias de los casos de uso.
 */
import { FlaggedTransaction, Transaction } from '../../src/domain/entities/transaction';
import { TransactionRepository } from '../../src/domain/ports/transaction-repository';
import { FileStorage } from '../../src/domain/ports/file-storage';
import { CatalogColumn, DataCatalog } from '../../src/domain/ports/data-catalog';

export class InMemoryTransactionRepository implements TransactionRepository {
  transactions: Transaction[] = [];
  flagged: FlaggedTransaction[] = [];

  async saveMany(transactions: Transaction[]): Promise<void> {
    this.transactions.push(...transactions);
  }

  async saveFlagged(transactions: FlaggedTransaction[]): Promise<void> {
    this.flagged.push(...transactions);
  }

  async existsTransactionId(transactionId: string): Promise<boolean> {
    return this.transactions.some((transaction) => transaction.transactionId === transactionId);
  }

  async findByPartnerAndDateRange(partnerId: string, from: string, to: string): Promise<Transaction[]> {
    return this.transactions.filter(
      (transaction) =>
        transaction.partnerId === partnerId &&
        transaction.transactionDate >= from &&
        transaction.transactionDate <= to
    );
  }

  async findByMemberAndDate(memberId: string, date: string): Promise<Transaction[]> {
    return this.transactions.filter(
      (transaction) => transaction.memberId === memberId && transaction.transactionDate === date
    );
  }
}

export class InMemoryFileStorage implements FileStorage {
  objects = new Map<string, string>();

  async putObject(key: string, content: string): Promise<void> {
    this.objects.set(key, content);
  }
}

export class InMemoryDataCatalog implements DataCatalog {
  databases = new Set<string>();
  tables = new Map<string, CatalogColumn[]>();
  batches: Array<{ batchId: string; location: string }> = [];

  async ensureDatabase(name: string): Promise<void> {
    this.databases.add(name);
  }

  async ensureTable(database: string, table: string, columns: CatalogColumn[]): Promise<void> {
    this.tables.set(`${database}.${table}`, columns);
  }

  async registerBatch(_database: string, _table: string, batchId: string, location: string): Promise<void> {
    this.batches.push({ batchId, location });
  }
}
