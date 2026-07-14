/**
 * Pruebas de integración: levantan el servidor Fastify completo
 * (con adaptadores locales sobre un directorio temporal) y ejercitan
 * los endpoints HTTP de extremo a extremo.
 */
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import FormData from 'form-data';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/infrastructure/http/server';

const HEADER = 'transaction_id,member_id,partner_id,points_earned,points_redeemed,transaction_date,partner_name';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

async function uploadCsv(app: FastifyInstance, content: string) {
  const form = new FormData();
  form.append('file', Buffer.from(content), { filename: 'transactions.csv', contentType: 'text/csv' });
  return app.inject({
    method: 'POST',
    url: '/api/v1/transactions/upload',
    payload: form,
    headers: form.getHeaders()
  });
}

describe('API de FinCard (integración)', () => {
  let app: FastifyInstance;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'fincard-'));
    app = await buildServer({ baseDir });
  });

  afterEach(async () => {
    await app.close();
    await rm(baseDir, { recursive: true, force: true });
  });

  it('POST /api/v1/transactions/upload procesa un CSV válido (201)', async () => {
    const response = await uploadCsv(app, csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central'));
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.manifest.totalValidRows).toBe(1);
    expect(body.batch_id).toBeDefined();

    // Verifica el almacenamiento en el "S3" local y el manifiesto.
    const stored = await readFile(
      join(baseDir, 'storage', 'fincard-transactions', '2026', '07', 'PART01', `${body.batch_id}.csv`),
      'utf-8'
    );
    expect(stored).toContain('TXN001');
    const manifest = JSON.parse(
      await readFile(join(baseDir, 'storage', 'fincard-transactions', 'manifests', `${body.batch_id}.json`), 'utf-8')
    );
    expect(manifest.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('POST upload devuelve 400 con detalle de errores por fila', async () => {
    const response = await uploadCsv(
      app,
      csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central', 'TXN002,BAD,PART01,10,0,2026-07-01,Café Central')
    );
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({ row: 3, field: 'member_id' });
  });

  it('POST upload devuelve 400 si todas las filas son inválidas', async () => {
    const response = await uploadCsv(app, csv('TXN001,BAD,PART01,150,0,2026-07-01,Café Central'));
    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toHaveLength(1);
  });

  it('POST upload devuelve 400 si no se envía archivo', async () => {
    const form = new FormData();
    form.append('other', 'value');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions/upload',
      payload: form,
      headers: form.getHeaders()
    });
    expect(response.statusCode).toBe(400);
  });

  it('registra la catalogación en el Glue Data Catalog emulado', async () => {
    await uploadCsv(app, csv('TXN001,MEM001,PART01,150,0,2026-07-01,Café Central'));
    const catalog = JSON.parse(await readFile(join(baseDir, 'data', 'glue-catalog.json'), 'utf-8'));
    const table = catalog.databases.fincard_loyalty.tables.transactions;
    expect(table.columns).toHaveLength(9);
    expect(table.batches).toHaveLength(1);
  });

  it('GET /api/v1/settlements/{partner_id} devuelve el resumen de liquidación', async () => {
    await uploadCsv(
      app,
      csv(
        'TXN001,MEM001,PART01,150,0,2026-07-01,Café Central',
        'TXN002,MEM002,PART01,0,50,2026-07-02,Café Central',
        'TXN003,MEM001,PART02,999,0,2026-07-01,Gasolinera Express',
        'TXN004,MEM003,PART01,30,0,2026-07-02,Café Central',
        'TXN005,MEM004,PART01,10,0,2026-07-02,Café Central',
        'TXN006,MEM005,PART01,20,0,2026-07-02,Café Central'
      )
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settlements/PART01?from=2026-07-01&to=2026-07-03'
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.partner_id).toBe('PART01');
    expect(body.summary).toEqual({
      total_transactions: 5,
      total_points_earned: 210,
      total_points_redeemed: 50,
      net_points_owed: 160,
      unique_members: 5
    });
    expect(body.daily_breakdown).toHaveLength(3);
    expect(body.daily_breakdown[2]).toEqual({
      date: '2026-07-03',
      transactions: 0,
      points_earned: 0,
      points_redeemed: 0
    });
  });

  it('GET settlements devuelve 400 con fechas inválidas', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settlements/PART01?from=bad&to=2026-07-03'
    });
    expect(response.statusCode).toBe(400);
  });

  it('las transacciones marcadas no afectan la liquidación', async () => {
    await uploadCsv(
      app,
      csv(
        'TXN001,MEM001,PART01,9500,0,2026-07-01,Café Central',
        'TXN002,MEM001,PART01,800,0,2026-07-01,Café Central'
      )
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settlements/PART01?from=2026-07-01&to=2026-07-01'
    });
    expect(response.json().summary.total_points_earned).toBe(9500);
  });

  it('expone la documentación Swagger en /docs', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
    const spec = response.json();
    expect(spec.paths['/api/v1/transactions/upload']).toBeDefined();
    expect(spec.paths['/api/v1/settlements/{partner_id}']).toBeDefined();
  });
});
