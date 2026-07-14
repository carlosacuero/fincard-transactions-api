/**
 * Puerto de persistencia de transacciones (Ports & Adapters).
 * La capa de aplicación depende de esta interfaz, nunca de una BD concreta.
 */
import { FlaggedTransaction, Transaction } from '../entities/transaction';

export interface TransactionRepository {
  saveMany(transactions: Transaction[]): Promise<void>;
  saveFlagged(transactions: FlaggedTransaction[]): Promise<void>;
  existsTransactionId(transactionId: string): Promise<boolean>;
  findByPartnerAndDateRange(partnerId: string, from: string, to: string): Promise<Transaction[]>;
  findByMemberAndDate(memberId: string, date: string): Promise<Transaction[]>;
}
