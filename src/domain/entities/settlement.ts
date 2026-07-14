/**
 * Modelos del reporte de liquidación (RF-04).
 */

export interface SettlementSummary {
  totalTransactions: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  netPointsOwed: number;
  /** Valor neto sin recortar; puede ser negativo (uso interno). */
  internalNetPoints: number;
  uniqueMembers: number;
}

export interface DailyBreakdownEntry {
  date: string;
  transactions: number;
  pointsEarned: number;
  pointsRedeemed: number;
}

export interface SettlementReport {
  partnerId: string;
  partnerName: string;
  period: { from: string; to: string };
  summary: SettlementSummary;
  dailyBreakdown: DailyBreakdownEntry[];
}
