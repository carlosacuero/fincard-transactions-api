/**
 * Ayudas para las pruebas: constructor de transacciones con valores por defecto.
 */
import { Transaction } from '../../src/domain/entities/transaction';

let sequence = 0;

export function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1;
  return {
    transactionId: `TXN${String(sequence).padStart(3, '0')}`,
    memberId: 'MEM001',
    partnerId: 'PART01',
    pointsEarned: 100,
    pointsRedeemed: 0,
    transactionDate: '2026-07-01',
    partnerName: 'Café Central',
    processedAt: '2026-07-10T00:00:00.000Z',
    batchId: 'batch-1',
    ...overrides
  };
}
