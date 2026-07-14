/**
 * Validación del archivo CSV de transacciones (RF-01).
 * Cada regla de campo está aislada en una función pequeña para mantener
 * baja la complejidad ciclomática y facilitar las pruebas unitarias.
 */
import { parse } from 'csv-parse/sync';
import { InvalidCsvError } from '../errors';
import { RowValidationError } from '../entities/transaction';

export const REQUIRED_COLUMNS = [
  'transaction_id',
  'member_id',
  'partner_id',
  'points_earned',
  'points_redeemed',
  'transaction_date',
  'partner_name'
] as const;

export interface CsvRow {
  transaction_id: string;
  member_id: string;
  partner_id: string;
  points_earned: string;
  points_redeemed: string;
  transaction_date: string;
  partner_name: string;
}

export interface CsvValidationResult {
  validRows: Array<{ row: number; data: CsvRow }>;
  errors: RowValidationError[];
}

const MEMBER_ID_PATTERN = /^MEM\d{3}$/;
const PARTNER_ID_PATTERN = /^PART\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NON_NEGATIVE_INT_PATTERN = /^\d+$/;

/** Convierte el contenido del archivo en filas; falla si no es un CSV válido. */
export function parseCsv(content: string): CsvRow[] {
  let records: Record<string, string>[];
  try {
    records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new InvalidCsvError('El archivo no es un CSV válido');
  }
  validateHeader(records);
  return records as unknown as CsvRow[];
}

function validateHeader(records: Record<string, string>[]): void {
  if (records.length === 0) {
    throw new InvalidCsvError('El archivo CSV está vacío');
  }
  const columns = Object.keys(records[0]);
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    throw new InvalidCsvError(`Faltan columnas requeridas: ${missing.join(', ')}`);
  }
}

/** Valida cada fila y separa las válidas de los errores por fila. */
export function validateRows(rows: CsvRow[]): CsvValidationResult {
  const validRows: CsvValidationResult['validRows'] = [];
  const errors: RowValidationError[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2: encabezado ocupa la fila 1
    const rowErrors = validateRow(row, rowNumber, seenIds);
    if (rowErrors.length === 0) {
      validRows.push({ row: rowNumber, data: row });
    } else {
      errors.push(...rowErrors);
    }
  });

  return { validRows, errors };
}

function validateRow(row: CsvRow, rowNumber: number, seenIds: Set<string>): RowValidationError[] {
  const checks: Array<RowValidationError | null> = [
    checkRequired(row, rowNumber),
    checkDuplicateId(row, rowNumber, seenIds),
    checkPattern(row.member_id, MEMBER_ID_PATTERN, 'member_id', 'debe seguir el formato MEM + 3 dígitos', rowNumber),
    checkPattern(row.partner_id, PARTNER_ID_PATTERN, 'partner_id', 'debe seguir el formato PART + 2 dígitos', rowNumber),
    checkNonNegativeInt(row.points_earned, 'points_earned', rowNumber),
    checkNonNegativeInt(row.points_redeemed, 'points_redeemed', rowNumber),
    checkDate(row.transaction_date, rowNumber)
  ];
  return checks.filter((error): error is RowValidationError => error !== null);
}

function checkRequired(row: CsvRow, rowNumber: number): RowValidationError | null {
  const missing = REQUIRED_COLUMNS.filter((column) => !row[column] || row[column].trim() === '');
  if (missing.length === 0) {
    return null;
  }
  return { row: rowNumber, field: missing.join(', '), message: 'Campos requeridos vacíos' };
}

function checkDuplicateId(row: CsvRow, rowNumber: number, seenIds: Set<string>): RowValidationError | null {
  if (seenIds.has(row.transaction_id)) {
    return { row: rowNumber, field: 'transaction_id', message: `transaction_id duplicado: ${row.transaction_id}` };
  }
  seenIds.add(row.transaction_id);
  return null;
}

function checkPattern(
  value: string,
  pattern: RegExp,
  field: string,
  message: string,
  rowNumber: number
): RowValidationError | null {
  if (pattern.test(value)) {
    return null;
  }
  return { row: rowNumber, field, message: `${field} ${message} (valor: "${value}")` };
}

function checkNonNegativeInt(value: string, field: string, rowNumber: number): RowValidationError | null {
  if (NON_NEGATIVE_INT_PATTERN.test(value)) {
    return null;
  }
  return { row: rowNumber, field, message: `${field} debe ser un entero no negativo (valor: "${value}")` };
}

function checkDate(value: string, rowNumber: number): RowValidationError | null {
  if (DATE_PATTERN.test(value) && isRealDate(value)) {
    return null;
  }
  return {
    row: rowNumber,
    field: 'transaction_date',
    message: `transaction_date debe ser una fecha válida YYYY-MM-DD (valor: "${value}")`
  };
}

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
