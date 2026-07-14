/**
 * Errores del dominio. Permiten mapear fallos de negocio a respuestas HTTP
 * sin acoplar el dominio a la capa web.
 */
import { RowValidationError } from './entities/transaction';

export class InvalidCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCsvError';
  }
}

export class CsvValidationError extends Error {
  constructor(public readonly errors: RowValidationError[]) {
    super('El archivo CSV contiene errores de validación');
    this.name = 'CsvValidationError';
  }
}

export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDateRangeError';
  }
}
