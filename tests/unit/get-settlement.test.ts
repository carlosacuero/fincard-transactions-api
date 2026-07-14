/**
 * Pruebas unitarias del caso de uso de liquidación (RF-04).
 */
import { GetSettlementUseCase } from '../../src/application/get-settlement';
import { InvalidDateRangeError } from '../../src/domain/errors';
import { InMemoryTransactionRepository } from '../helpers/fakes';
import { buildTransaction } from '../helpers/builders';

describe('GetSettlementUseCase', () => {
  it('devuelve el reporte para el aliado y rango indicados', async () => {
    const repository = new InMemoryTransactionRepository();
    repository.transactions = [
      buildTransaction({ partnerId: 'PART01', transactionDate: '2026-07-01', pointsEarned: 100 }),
      buildTransaction({ partnerId: 'PART02', transactionDate: '2026-07-01', pointsEarned: 999 })
    ];
    const report = await new GetSettlementUseCase(repository).execute('PART01', '2026-07-01', '2026-07-02');
    expect(report.summary.totalTransactions).toBe(1);
    expect(report.summary.totalPointsEarned).toBe(100);
  });

  it('rechaza fechas con formato inválido', async () => {
    const useCase = new GetSettlementUseCase(new InMemoryTransactionRepository());
    await expect(useCase.execute('PART01', '01/07/2026', '2026-07-02')).rejects.toThrow(InvalidDateRangeError);
  });

  it('rechaza rangos invertidos (from > to)', async () => {
    const useCase = new GetSettlementUseCase(new InMemoryTransactionRepository());
    await expect(useCase.execute('PART01', '2026-07-10', '2026-07-01')).rejects.toThrow(InvalidDateRangeError);
  });
});
