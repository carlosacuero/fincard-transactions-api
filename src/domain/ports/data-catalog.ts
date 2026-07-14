/**
 * Puerto de catalogación de datos (emula AWS Glue Data Catalog).
 */
export interface CatalogColumn {
  name: string;
  type: string;
}

export interface DataCatalog {
  ensureDatabase(name: string): Promise<void>;
  ensureTable(database: string, table: string, columns: CatalogColumn[]): Promise<void>;
  registerBatch(database: string, table: string, batchId: string, location: string): Promise<void>;
}
