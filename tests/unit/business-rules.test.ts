/**
 * Pruebas unitarias de las reglas de negocio RN-01..RN-04 (RF-05).
 */
import {
  applyBusinessRules,
  ruleDailyNetPointsLimit,
  rulePartnerRedemptionRatio,
  ruleMaxTransactionsPerPartner,
  ruleDateWindow
} from '../../src/domain/services/business-rules';
import { buildTransaction } from '../helpers/builders';

const TODAY = new Date('2026-07-14T12:00:00Z');

describe('RN-01: límite de 10,000 puntos netos por miembro y día', () => {
  it('marca solo las transacciones que exceden el acumulado diario', () => {
    const transactions = [
      buildTransaction({ transactionId: 'A', pointsEarned: 9500 }),
      buildTransaction({ transactionId: 'B', pointsEarned: 400 }),
      buildTransaction({ transactionId: 'C', pointsEarned: 200 })
    ];
    const flagged = ruleDailyNetPointsLimit(transactions);
    expect(flagged.map((flag) => flag.transactionId)).toEqual(['C']);
  });

  it('no marca nada si el acumulado no supera el límite', () => {
    const transactions = [buildTransaction({ pointsEarned: 10000 })];
    expect(ruleDailyNetPointsLimit(transactions)).toHaveLength(0);
  });

  it('las redenciones descuentan del neto diario', () => {
    const transactions = [
      buildTransaction({ transactionId: 'A', pointsEarned: 9000 }),
      buildTransaction({ transactionId: 'B', pointsEarned: 0, pointsRedeemed: 2000 }),
      buildTransaction({ transactionId: 'C', pointsEarned: 2500 })
    ];
    expect(ruleDailyNetPointsLimit(transactions)).toHaveLength(0);
  });
});

describe('RN-02: máximo 30% de transacciones diarias con redención por aliado', () => {
  it('marca las redenciones que superan el 30% del día', () => {
    const transactions = [
      buildTransaction({ transactionId: 'A', memberId: 'MEM001' }),
      buildTransaction({ transactionId: 'B', memberId: 'MEM002' }),
      buildTransaction({ transactionId: 'C', memberId: 'MEM003', pointsEarned: 0, pointsRedeemed: 100 }),
      buildTransaction({ transactionId: 'D', memberId: 'MEM004', pointsEarned: 0, pointsRedeemed: 100 })
    ];
    const flagged = rulePartnerRedemptionRatio(transactions);
    expect(flagged.map((flag) => flag.transactionId)).toEqual(['D']);
  });

  it('no marca nada si la proporción es menor o igual al 30%', () => {
    const transactions = [
      buildTransaction({ transactionId: 'A', memberId: 'MEM001' }),
      buildTransaction({ transactionId: 'B', memberId: 'MEM002' }),
      buildTransaction({ transactionId: 'C', memberId: 'MEM003' }),
      buildTransaction({ transactionId: 'D', memberId: 'MEM004', pointsEarned: 0, pointsRedeemed: 100 })
    ];
    expect(rulePartnerRedemptionRatio(transactions)).toHaveLength(0);
  });
});

describe('RN-03: máximo 5 transacciones por miembro y aliado en un día', () => {
  it('marca las transacciones adicionales a partir de la sexta', () => {
    const transactions = Array.from({ length: 7 }, (_, index) =>
      buildTransaction({ transactionId: `T${index + 1}` })
    );
    const flagged = ruleMaxTransactionsPerPartner(transactions);
    expect(flagged.map((flag) => flag.transactionId)).toEqual(['T6', 'T7']);
  });
});

describe('RN-04: ventana de fechas permitida', () => {
  it('marca fechas futuras', () => {
    const transactions = [buildTransaction({ transactionId: 'F', transactionDate: '2027-01-15' })];
    expect(ruleDateWindow(transactions, TODAY)).toHaveLength(1);
  });

  it('marca fechas de hace más de 2 años', () => {
    const transactions = [buildTransaction({ transactionId: 'O', transactionDate: '2024-01-01' })];
    expect(ruleDateWindow(transactions, TODAY)).toHaveLength(1);
  });

  it('acepta la fecha actual y el límite de 2 años', () => {
    const transactions = [
      buildTransaction({ transactionId: 'A', transactionDate: '2026-07-14' }),
      buildTransaction({ transactionId: 'B', transactionDate: '2024-07-14' })
    ];
    expect(ruleDateWindow(transactions, TODAY)).toHaveLength(0);
  });
});

describe('applyBusinessRules', () => {
  it('consolida múltiples motivos por transacción', () => {
    const transactions = [
      ...Array.from({ length: 6 }, (_, index) =>
        buildTransaction({ transactionId: `T${index + 1}`, pointsEarned: 2000 })
      )
    ];
    const flagged = applyBusinessRules(transactions, TODAY);
    const t6 = flagged.find((flag) => flag.transactionId === 'T6');
    expect(t6?.reason).toContain('RN-01');
    expect(t6?.reason).toContain('RN-03');
  });
});
