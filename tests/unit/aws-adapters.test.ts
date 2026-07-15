/**
 * Pruebas de los adaptadores AWS reales (S3 y Glue) con clientes simulados.
 * No requieren conexión a AWS: se inyecta un cliente falso por el constructor.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { GlueClient } from '@aws-sdk/client-glue';
import { S3FileStorage } from '../../src/infrastructure/storage/s3-file-storage';
import { GlueDataCatalog } from '../../src/infrastructure/catalog/glue-data-catalog';

function entityNotFound(): Error {
  const error = new Error('not found');
  error.name = 'EntityNotFoundException';
  return error;
}

describe('S3FileStorage', () => {
  it('envía PutObject con bucket, clave y content type correctos', async () => {
    const send = jest.fn().mockResolvedValue({});
    const storage = new S3FileStorage('my-bucket', { send } as unknown as S3Client);

    await storage.putObject('manifests/batch-1.json', '{"a":1}');
    await storage.putObject('2026/01/PART01/batch-1.csv', 'a,b');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'manifests/batch-1.json',
      ContentType: 'application/json'
    });
    expect(send.mock.calls[1][0].input).toMatchObject({
      Key: '2026/01/PART01/batch-1.csv',
      ContentType: 'text/csv'
    });
  });
});

describe('GlueDataCatalog', () => {
  const columns = [{ name: 'transaction_id', type: 'STRING' }];

  it('crea la base de datos solo si no existe', async () => {
    const send = jest.fn().mockRejectedValueOnce(entityNotFound()).mockResolvedValue({});
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await catalog.ensureDatabase('fincard_loyalty');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input).toMatchObject({
      DatabaseInput: { Name: 'fincard_loyalty' }
    });
  });

  it('no crea la base de datos si ya existe', async () => {
    const send = jest.fn().mockResolvedValue({});
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await catalog.ensureDatabase('fincard_loyalty');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('propaga errores distintos a EntityNotFoundException', async () => {
    const send = jest.fn().mockRejectedValue(new Error('access denied'));
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await expect(catalog.ensureDatabase('fincard_loyalty')).rejects.toThrow('access denied');
  });

  it('crea la tabla si no existe', async () => {
    const send = jest.fn().mockRejectedValueOnce(entityNotFound()).mockResolvedValue({});
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await catalog.ensureTable('fincard_loyalty', 'transactions', columns);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input).toMatchObject({
      DatabaseName: 'fincard_loyalty',
      TableInput: expect.objectContaining({ Name: 'transactions' })
    });
  });

  it('actualiza la tabla si ya existe', async () => {
    const send = jest.fn().mockResolvedValue({ Table: {} });
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await catalog.ensureTable('fincard_loyalty', 'transactions', columns);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('registra el lote como propiedades de la tabla', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ Table: { Parameters: { classification: 'csv' } } })
      .mockResolvedValue({});
    const catalog = new GlueDataCatalog('s3://b/', { send } as unknown as GlueClient);

    await catalog.registerBatch('fincard_loyalty', 'transactions', 'batch-1', 's3://b/2026/01/');

    const updateInput = send.mock.calls[1][0].input;
    expect(updateInput.TableInput.Parameters).toMatchObject({
      classification: 'csv',
      last_batch_id: 'batch-1',
      last_batch_location: 's3://b/2026/01/'
    });
  });
});
