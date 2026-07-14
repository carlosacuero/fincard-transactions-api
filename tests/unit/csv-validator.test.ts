/**
 * Pruebas unitarias de la validación del archivo CSV (RF-01).
 */
import { parseCsv, validateRows } from '../../src/domain/services/csv-validator';
import { InvalidCsvError } from '../../src/domain/errors';

const HEADER = 'transaction_id,member_id,partner_id,points_earned,points_redeemed,transaction_date,partner_name';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseCsv', () => {
  it('lanza InvalidCsvError si el archivo está vacío', () => {
    expect(() => parseCsv('')).toThrow(InvalidCsvError);
  });

  it('lanza InvalidCsvError si faltan columnas requeridas', () => {
    expect(() => parseCsv('transaction_id,member_id\nTXN001,MEM001')).toThrow(InvalidCsvError);
  });

  it('lanza InvalidCsvError si el contenido no es CSV válido', () => {
    expect(() => parseCsv('a,b\n"unclosed')).toThrow(InvalidCsvError);
  });

  it('parsea filas válidas', () => {
    const rows = parseCsv(csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central'));
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_id).toBe('TXN001');
  });
});

describe('validateRows', () => {
  it('acepta una fila completamente válida', () => {
    const rows = parseCsv(csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central'));
    const result = validateRows(rows);
    expect(result.validRows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('rechaza member_id con formato inválido', () => {
    const rows = parseCsv(csv('TXN001,MEMXXX,PART01,150,0,2026-07-01,Café Central'));
    const result = validateRows(rows);
    expect(result.errors).toEqual([expect.objectContaining({ row: 2, field: 'member_id' })]);
  });

  it('rechaza partner_id con formato inválido', () => {
    const rows = parseCsv(csv('TXN001,MEM001,PARTX,150,0,2026-07-01,Café Central'));
    expect(validateRows(rows).errors[0].field).toBe('partner_id');
  });

  it('rechaza puntos negativos o no enteros', () => {
    const rows = parseCsv(
      csv('TXN001,MEM001,PART01,-50,0,2026-07-01,Café Central', 'TXN002,MEM001,PART01,10,1.5,2026-07-01,Café Central')
    );
    const fields = validateRows(rows).errors.map((error) => error.field);
    expect(fields).toEqual(['points_earned', 'points_redeemed']);
  });

  it('rechaza fechas inválidas o con formato incorrecto', () => {
    const rows = parseCsv(
      csv('TXN001,MEM001,PART01,10,0,2026-13-45,Café Central', 'TXN002,MEM001,PART01,10,0,01/07/2026,Café Central')
    );
    const result = validateRows(rows);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((error) => error.field === 'transaction_date')).toBe(true);
  });

  it('rechaza transaction_id duplicados dentro del archivo', () => {
    const rows = parseCsv(
      csv('TXN001,MEM001,PART01,10,0,2026-07-01,Café Central', 'TXN001,MEM002,PART01,20,0,2026-07-01,Café Central')
    );
    const result = validateRows(rows);
    expect(result.validRows).toHaveLength(1);
    expect(result.errors[0].message).toContain('duplicado');
  });

  it('rechaza filas con campos vacíos', () => {
    const rows = parseCsv(csv('TXN001,,PART01,10,0,2026-07-01,Café Central'));
    const result = validateRows(rows);
    expect(result.errors.some((error) => error.message.includes('vacíos'))).toBe(true);
  });

  it('reporta el número de fila real del archivo (encabezado = fila 1)', () => {
    const rows = parseCsv(
      csv('TXN001,MEM001,PART01,10,0,2026-07-01,Café Central', 'TXN002,BAD,PART01,10,0,2026-07-01,Café Central')
    );
    expect(validateRows(rows).errors[0].row).toBe(3);
  });
});
