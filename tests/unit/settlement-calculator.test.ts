/**
 * Pruebas unitarias del cálculo de liquidación (RF-04).
 */
import { calculateSettlement } from '../../src/domain/services/settlement-calculator';
import { buildTransaction } from '../helpers/builders';

describe('calculateSettlement', () => {
  it('calcula el resumen con totales y miembros únicos', () => {
    const transactions = [
      buildTransaction({ memberId: 'MEM001', pointsEarned: 100, pointsRedeemed: 0, transactionDate: '2026-07-01' }),
      buildTransaction({ memberId: 'MEM002', pointsEarned: 200, pointsRedeemed: 50, transactionDate: '2026-07-02' }),
      buildTransaction({ memberId: 'MEM001', pointsEarned: 0, pointsRedeemed: 100, transactionDate: '2026-07-02' })
    ];
    const report = calculateSettlement('PART01', '2026-07-01', '2026-07-03', transactions);
    expect(report.summary).toEqual({
      totalTransactions: 3,
      totalPointsEarned: 300,
      totalPointsRedeemed: 150,
      netPointsOwed: 150,
      internalNetPoints: 150,
      uniqueMembers: 2
    });
  });

  it('reporta 0 cuando el neto es negativo pero conserva el valor interno', () => {
    const transactions = [buildTransaction({ pointsEarned: 100, pointsRedeemed: 500 })];
    const report = calculateSettlement('PART01', '2026-07-01', '2026-07-01', transactions);
    expect(report.summary.netPointsOwed).toBe(0);
    expect(report.summary.internalNetPoints).toBe(-400);
  });

  it('incluye TODOS los días del rango con ceros cuando no hay transacciones', () => {
    const transactions = [buildTransaction({ transactionDate: '2026-07-02', pointsEarned: 100 })];
    const report = calculateSettlement('PART01', '2026-07-01', '2026-07-03', transactions);
    expect(report.dailyBreakdown).toEqual([
      { date: '2026-07-01', transactions: 0, pointsEarned: 0, pointsRedeemed: 0 },
      { date: '2026-07-02', transactions: 1, pointsEarned: 100, pointsRedeemed: 0 },
      { date: '2026-07-03', transactions: 0, pointsEarned: 0, pointsRedeemed: 0 }
    ]);
  });

  it('devuelve resumen vacío cuando no hay transacciones', () => {
    const report = calculateSettlement('PART09', '2026-07-01', '2026-07-01', []);
    expect(report.summary.totalTransactions).toBe(0);
    expect(report.partnerName).toBe('');
    expect(report.dailyBreakdown).toHaveLength(1);
  });
});
