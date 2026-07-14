/**
 * Reglas de negocio de validación cruzada (RF-05, RN-01..RN-04).
 * Cada regla es una función pura e independiente: recibe las transacciones
 * del lote y devuelve los transaction_id marcados con su motivo.
 */
import { Transaction } from '../entities/transaction';

export interface FlagResult {
  transactionId: string;
  reason: string;
}

const MAX_DAILY_NET_POINTS = 10000;
const MAX_REDEMPTION_RATIO = 0.3;
const MAX_DAILY_TX_PER_PARTNER = 5;
const MAX_PAST_YEARS = 2;

/** Aplica todas las reglas y consolida los motivos por transacción. */
export function applyBusinessRules(transactions: Transaction[], today: Date = new Date()): FlagResult[] {
  const results = [
    ...ruleDailyNetPointsLimit(transactions),
    ...rulePartnerRedemptionRatio(transactions),
    ...ruleMaxTransactionsPerPartner(transactions),
    ...ruleDateWindow(transactions, today)
  ];
  return dedupeByTransaction(results);
}

function dedupeByTransaction(results: FlagResult[]): FlagResult[] {
  const byId = new Map<string, string[]>();
  for (const result of results) {
    const reasons = byId.get(result.transactionId) ?? [];
    reasons.push(result.reason);
    byId.set(result.transactionId, reasons);
  }
  return [...byId.entries()].map(([transactionId, reasons]) => ({
    transactionId,
    reason: reasons.join(' | ')
  }));
}

function groupBy(transactions: Transaction[], keyOf: (transaction: Transaction) => string): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const key = keyOf(transaction);
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }
  return groups;
}

/** RN-01: máximo 10.000 puntos netos por miembro y día; el exceso queda "sujeto a revisión". */
export function ruleDailyNetPointsLimit(transactions: Transaction[]): FlagResult[] {
  const flagged: FlagResult[] = [];
  const groups = groupBy(transactions, (transaction) => `${transaction.memberId}|${transaction.transactionDate}`);
  for (const group of groups.values()) {
    let accumulated = 0;
    for (const transaction of group) {
      accumulated += transaction.pointsEarned - transaction.pointsRedeemed;
      if (accumulated > MAX_DAILY_NET_POINTS) {
        flagged.push({
          transactionId: transaction.transactionId,
          reason: 'RN-01: el miembro supera 10,000 puntos netos en el día (sujeta a revisión)'
        });
      }
    }
  }
  return flagged;
}

/** RN-02: más del 30% de transacciones diarias de un aliado con redención (posible fraude). */
export function rulePartnerRedemptionRatio(transactions: Transaction[]): FlagResult[] {
  const flagged: FlagResult[] = [];
  const groups = groupBy(transactions, (transaction) => `${transaction.partnerId}|${transaction.transactionDate}`);
  for (const group of groups.values()) {
    const redemptions = group.filter((transaction) => transaction.pointsRedeemed > 0);
    if (redemptions.length / group.length <= MAX_REDEMPTION_RATIO) {
      continue;
    }
    const allowed = Math.floor(group.length * MAX_REDEMPTION_RATIO);
    for (const transaction of redemptions.slice(allowed)) {
      flagged.push({
        transactionId: transaction.transactionId,
        reason: 'RN-02: el aliado supera el 30% de transacciones diarias con redención (posible fraude)'
      });
    }
  }
  return flagged;
}

/** RN-03: más de 5 transacciones del mismo miembro con el mismo aliado en un día. */
export function ruleMaxTransactionsPerPartner(transactions: Transaction[]): FlagResult[] {
  const flagged: FlagResult[] = [];
  const groups = groupBy(
    transactions,
    (transaction) => `${transaction.memberId}|${transaction.partnerId}|${transaction.transactionDate}`
  );
  for (const group of groups.values()) {
    for (const transaction of group.slice(MAX_DAILY_TX_PER_PARTNER)) {
      flagged.push({
        transactionId: transaction.transactionId,
        reason: 'RN-03: más de 5 transacciones del miembro con el mismo aliado en el día (sujeta a revisión)'
      });
    }
  }
  return flagged;
}

/** RN-04: la fecha no puede ser futura ni anterior a 2 años. */
export function ruleDateWindow(transactions: Transaction[], today: Date): FlagResult[] {
  const upperBound = toDateOnly(today);
  const lowerBound = new Date(upperBound);
  lowerBound.setUTCFullYear(lowerBound.getUTCFullYear() - MAX_PAST_YEARS);

  const flagged: FlagResult[] = [];
  for (const transaction of transactions) {
    const date = new Date(`${transaction.transactionDate}T00:00:00Z`);
    if (date > upperBound || date < lowerBound) {
      flagged.push({
        transactionId: transaction.transactionId,
        reason: 'RN-04: transaction_date fuera del rango permitido (no futura y máximo 2 años atrás)'
      });
    }
  }
  return flagged;
}

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
