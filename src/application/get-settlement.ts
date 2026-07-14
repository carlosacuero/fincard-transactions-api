/**
 * Caso de uso RF-04: consulta de liquidación por aliado y rango de fechas.
 */
import { InvalidDateRangeError } from '../domain/errors';
import { SettlementReport } from '../domain/entities/settlement';
import { calculateSettlement } from '../domain/services/settlement-calculator';
import { TransactionRepository } from '../domain/ports/transaction-repository';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class GetSettlementUseCase {
  constructor(private readonly repository: TransactionRepository) {}

  async execute(partnerId: string, from: string, to: string): Promise<SettlementReport> {
    this.validateRange(from, to);
    const transactions = await this.repository.findByPartnerAndDateRange(partnerId, from, to);
    return calculateSettlement(partnerId, from, to, transactions);
  }

  private validateRange(from: string, to: string): void {
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      throw new InvalidDateRangeError('Los parámetros from y to deben tener formato YYYY-MM-DD');
    }
    if (from > to) {
      throw new InvalidDateRangeError('El parámetro from no puede ser mayor que to');
    }
  }
}
