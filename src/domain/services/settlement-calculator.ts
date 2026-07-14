/**
 * Cálculo del reporte de liquidación (RF-04).
 * Función pura: recibe transacciones ya filtradas por aliado y rango de fechas.
 */
import { Transaction } from '../entities/transaction';
import { DailyBreakdownEntry, SettlementReport } from '../entities/settlement';

export function calculateSettlement(
  partnerId: string,
  from: string,
  to: string,
  transactions: Transaction[]
): SettlementReport {
  const totalEarned = sum(transactions, (transaction) => transaction.pointsEarned);
  const totalRedeemed = sum(transactions, (transaction) => transaction.pointsRedeemed);
  const internalNet = totalEarned - totalRedeemed;

  return {
    partnerId,
    partnerName: transactions[0]?.partnerName ?? '',
    period: { from, to },
    summary: {
      totalTransactions: transactions.length,
      totalPointsEarned: totalEarned,
      totalPointsRedeemed: totalRedeemed,
      // Si el neto es negativo se reporta 0, pero se conserva el valor interno.
      netPointsOwed: Math.max(internalNet, 0),
      internalNetPoints: internalNet,
      uniqueMembers: new Set(transactions.map((transaction) => transaction.memberId)).size
    },
    dailyBreakdown: buildDailyBreakdown(from, to, transactions)
  };
}

function sum(transactions: Transaction[], valueOf: (transaction: Transaction) => number): number {
  return transactions.reduce((total, transaction) => total + valueOf(transaction), 0);
}

/** Incluye TODOS los días del rango, con ceros cuando no hay transacciones. */
function buildDailyBreakdown(from: string, to: string, transactions: Transaction[]): DailyBreakdownEntry[] {
  const byDate = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const group = byDate.get(transaction.transactionDate) ?? [];
    group.push(transaction);
    byDate.set(transaction.transactionDate, group);
  }

  return listDates(from, to).map((date) => {
    const dayTransactions = byDate.get(date) ?? [];
    return {
      date,
      transactions: dayTransactions.length,
      pointsEarned: sum(dayTransactions, (transaction) => transaction.pointsEarned),
      pointsRedeemed: sum(dayTransactions, (transaction) => transaction.pointsRedeemed)
    };
  });
}

function listDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}
