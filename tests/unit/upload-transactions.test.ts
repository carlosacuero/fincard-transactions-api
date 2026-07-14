/**
 * Pruebas unitarias del caso de uso de carga (RF-01, RF-02, RF-03, RF-05)
 * usando adaptadores en memoria (puertos falsos).
 */
import { UploadTransactionsUseCase } from '../../src/application/upload-transactions';
import { CsvValidationError, InvalidCsvError } from '../../src/domain/errors';
import { InMemoryDataCatalog, InMemoryFileStorage, InMemoryTransactionRepository } from '../helpers/fakes';

const HEADER = 'transaction_id,member_id,partner_id,points_earned,points_redeemed,transaction_date,partner_name';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function buildUseCase() {
  const repository = new InMemoryTransactionRepository();
  const storage = new InMemoryFileStorage();
  const catalog = new InMemoryDataCatalog();
  const useCase = new UploadTransactionsUseCase(repository, storage, catalog);
  return { useCase, repository, storage, catalog };
}

describe('UploadTransactionsUseCase', () => {
  it('procesa un archivo válido: persiste, guarda en S3 emulado y cataloga', async () => {
    const { useCase, repository, storage, catalog } = buildUseCase();
    const result = await useCase.execute(csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central'));

    expect(result.manifest.totalValidRows).toBe(1);
    expect(result.manifest.totalRejectedRows).toBe(0);
    expect(repository.transactions).toHaveLength(1);
    expect([...storage.objects.keys()]).toEqual([
      `2026/07/PART01/${result.batchId}.csv`,
      `manifests/${result.batchId}.json`
    ]);
    expect(catalog.databases.has('fincard_loyalty')).toBe(true);
    expect(catalog.tables.has('fincard_loyalty.transactions')).toBe(true);
    expect(catalog.batches[0].batchId).toBe(result.batchId);
  });

  it('incluye el hash SHA-256 del archivo original en el manifiesto', async () => {
    const { useCase } = buildUseCase();
    const content = csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central');
    const result = await useCase.execute(content);
    expect(result.manifest.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('lanza CsvValidationError cuando todas las filas son inválidas', async () => {
    const { useCase } = buildUseCase();
    await expect(useCase.execute(csv('TXN001,BAD,PART01,150,0,2026-07-01,Café Central'))).rejects.toThrow(
      CsvValidationError
    );
  });

  it('lanza InvalidCsvError con un archivo sin las columnas esperadas', async () => {
    const { useCase } = buildUseCase();
    await expect(useCase.execute('foo,bar\n1,2')).rejects.toThrow(InvalidCsvError);
  });

  it('procesa las filas válidas y reporta las rechazadas en el manifiesto', async () => {
    const { useCase, repository } = buildUseCase();
    const result = await useCase.execute(
      csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central', 'TXN002,BAD,PART01,10,0,2026-07-01,Café Central')
    );
    expect(result.manifest.totalValidRows).toBe(1);
    expect(result.manifest.totalRejectedRows).toBe(1);
    expect(result.manifest.errors).toHaveLength(1);
    expect(repository.transactions).toHaveLength(1);
  });

  it('separa las transacciones marcadas por reglas de negocio (transactions_flagged)', async () => {
    const { useCase, repository } = buildUseCase();
    const result = await useCase.execute(
      csv(
        'TXN001,MEM001,PART01,9500,0,2026-07-01,Café Central',
        'TXN002,MEM001,PART01,800,0,2026-07-01,Café Central'
      )
    );
    expect(repository.transactions.map((transaction) => transaction.transactionId)).toEqual(['TXN001']);
    expect(repository.flagged.map((transaction) => transaction.transactionId)).toEqual(['TXN002']);
    expect(repository.flagged[0].flagReason).toContain('RN-01');
    expect(result.manifest.totalFlaggedRows).toBe(1);
  });

  it('agrupa los archivos en S3 por {year}/{month}/{partner_id}', async () => {
    const { useCase, storage } = buildUseCase();
    const result = await useCase.execute(
      csv(
        'TXN001,MEM001,PART01,100,0,2026-06-15,Café Central',
        'TXN002,MEM002,PART02,200,0,2026-07-01,Gasolinera Express'
      )
    );
    const keys = [...storage.objects.keys()];
    expect(keys).toContain(`2026/06/PART01/${result.batchId}.csv`);
    expect(keys).toContain(`2026/07/PART02/${result.batchId}.csv`);
  });
});
