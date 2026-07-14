/**
 * Entidades del dominio: transacción de puntos y transacción marcada.
 * Representan el núcleo del negocio, sin dependencias de infraestructura.
 */

export interface Transaction {
  transactionId: string;
  memberId: string;
  partnerId: string;
  pointsEarned: number;
  pointsRedeemed: number;
  transactionDate: string;
  partnerName: string;
  processedAt: string;
  batchId: string;
}

/** Transacción que incumple una regla de negocio (RN-01..RN-04). */
export interface FlaggedTransaction extends Transaction {
  flagReason: string;
}

/** Error de validación asociado a una fila del archivo CSV. */
export interface RowValidationError {
  row: number;
  field: string;
  message: string;
}
