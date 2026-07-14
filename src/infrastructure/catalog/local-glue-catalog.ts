/**
 * Adaptador de catálogo: emula AWS Glue Data Catalog persistiendo en JSON.
 * En producción se reemplaza por @aws-sdk/client-glue (mismo puerto DataCatalog).
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { CatalogColumn, DataCatalog } from '../../domain/ports/data-catalog';

interface CatalogState {
  databases: Record<
    string,
    {
      createdAt: string;
      tables: Record<
        string,
        { columns: CatalogColumn[]; updatedAt: string; batches: Array<{ batchId: string; location: string; registeredAt: string }> }
      >;
    }
  >;
}

export class LocalGlueCatalog implements DataCatalog {
  constructor(private readonly filePath: string) {}

  async ensureDatabase(name: string): Promise<void> {
    const state = await this.load();
    if (!state.databases[name]) {
      state.databases[name] = { createdAt: new Date().toISOString(), tables: {} };
    }
    await this.save(state);
  }

  async ensureTable(database: string, table: string, columns: CatalogColumn[]): Promise<void> {
    const state = await this.load();
    const db = state.databases[database];
    if (!db) {
      throw new Error(`La base de datos "${database}" no existe en el catálogo`);
    }
    const existing = db.tables[table];
    db.tables[table] = {
      columns,
      updatedAt: new Date().toISOString(),
      batches: existing?.batches ?? []
    };
    await this.save(state);
  }

  async registerBatch(database: string, table: string, batchId: string, location: string): Promise<void> {
    const state = await this.load();
    const tableState = state.databases[database]?.tables[table];
    if (!tableState) {
      throw new Error(`La tabla "${database}.${table}" no existe en el catálogo`);
    }
    tableState.batches.push({ batchId, location, registeredAt: new Date().toISOString() });
    await this.save(state);
  }

  private async load(): Promise<CatalogState> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf-8')) as CatalogState;
    } catch {
      return { databases: {} };
    }
  }

  private async save(state: CatalogState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}
