/**
 * Adaptador de persistencia: guarda transacciones y transacciones marcadas
 * (tabla "transactions_flagged") en archivos JSON locales. En producción se
 * reemplaza por un adaptador de base de datos (mismo puerto TransactionRepository).
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { FlaggedTransaction, Transaction } from '../../domain/entities/transaction';
import { TransactionRepository } from '../../domain/ports/transaction-repository';

export class JsonTransactionRepository implements TransactionRepository {
  constructor(private readonly dataDir: string) {}

  async saveMany(transactions: Transaction[]): Promise<void> {
    const existing = await this.readAll<Transaction>('transactions.json');
    await this.writeAll('transactions.json', [...existing, ...transactions]);
  }

  async saveFlagged(transactions: FlaggedTransaction[]): Promise<void> {
    const existing = await this.readAll<FlaggedTransaction>('transactions_flagged.json');
    await this.writeAll('transactions_flagged.json', [...existing, ...transactions]);
  }

  async existsTransactionId(transactionId: string): Promise<boolean> {
    const transactions = await this.readAll<Transaction>('transactions.json');
    return transactions.some((transaction) => transaction.transactionId === transactionId);
  }

  async findByPartnerAndDateRange(partnerId: string, from: string, to: string): Promise<Transaction[]> {
    const transactions = await this.readAll<Transaction>('transactions.json');
    return transactions.filter(
      (transaction) =>
        transaction.partnerId === partnerId &&
        transaction.transactionDate >= from &&
        transaction.transactionDate <= to
    );
  }

  async findByMemberAndDate(memberId: string, date: string): Promise<Transaction[]> {
    const transactions = await this.readAll<Transaction>('transactions.json');
    return transactions.filter(
      (transaction) => transaction.memberId === memberId && transaction.transactionDate === date
    );
  }

  private async readAll<T>(fileName: string): Promise<T[]> {
    try {
      return JSON.parse(await readFile(join(this.dataDir, fileName), 'utf-8')) as T[];
    } catch {
      return [];
    }
  }

  private async writeAll<T>(fileName: string, records: T[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(join(this.dataDir, fileName), JSON.stringify(records, null, 2), 'utf-8');
  }
}
