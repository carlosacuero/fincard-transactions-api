/**
 * Adaptador de catálogo real sobre AWS Glue Data Catalog (AWS SDK v3).
 * Implementa el mismo puerto DataCatalog que el adaptador local.
 */
import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetDatabaseCommand,
  GetTableCommand,
  GlueClient,
  UpdateTableCommand
} from '@aws-sdk/client-glue';
import { CatalogColumn, DataCatalog } from '../../domain/ports/data-catalog';

export class GlueDataCatalog implements DataCatalog {
  constructor(
    private readonly dataLocation: string,
    private readonly client: GlueClient = new GlueClient({})
  ) {}

  async ensureDatabase(name: string): Promise<void> {
    try {
      await this.client.send(new GetDatabaseCommand({ Name: name }));
    } catch (error) {
      if (!isEntityNotFound(error)) {
        throw error;
      }
      await this.client.send(new CreateDatabaseCommand({ DatabaseInput: { Name: name } }));
    }
  }

  async ensureTable(database: string, table: string, columns: CatalogColumn[]): Promise<void> {
    const tableInput = this.buildTableInput(table, columns);
    try {
      await this.client.send(new GetTableCommand({ DatabaseName: database, Name: table }));
      await this.client.send(new UpdateTableCommand({ DatabaseName: database, TableInput: tableInput }));
    } catch (error) {
      if (!isEntityNotFound(error)) {
        throw error;
      }
      await this.client.send(new CreateTableCommand({ DatabaseName: database, TableInput: tableInput }));
    }
  }

  /**
   * Glue no tiene un concepto directo de "lote"; se registra como propiedad
   * de la tabla para trazabilidad del último batch procesado.
   */
  async registerBatch(database: string, table: string, batchId: string, location: string): Promise<void> {
    const existing = await this.client.send(new GetTableCommand({ DatabaseName: database, Name: table }));
    const parameters = {
      ...existing.Table?.Parameters,
      last_batch_id: batchId,
      last_batch_location: location,
      last_batch_registered_at: new Date().toISOString()
    };
    await this.client.send(
      new UpdateTableCommand({
        DatabaseName: database,
        TableInput: {
          Name: table,
          StorageDescriptor: existing.Table?.StorageDescriptor,
          Parameters: parameters
        }
      })
    );
  }

  private buildTableInput(table: string, columns: CatalogColumn[]) {
    return {
      Name: table,
      TableType: 'EXTERNAL_TABLE',
      Parameters: { classification: 'csv' },
      StorageDescriptor: {
        Columns: columns.map((column) => ({ Name: column.name, Type: column.type.toLowerCase() })),
        Location: this.dataLocation,
        InputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
        OutputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
        SerdeInfo: {
          SerializationLibrary: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
          Parameters: { 'field.delim': ',' }
        }
      }
    };
  }
}

function isEntityNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'EntityNotFoundException';
}
