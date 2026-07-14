/**
 * Puerto de almacenamiento de objetos (emula Amazon S3 en local).
 */
export interface FileStorage {
  /** Guarda un objeto bajo la clave indicada (p. ej. "2026/07/PART01/batch.csv"). */
  putObject(key: string, content: string): Promise<void>;
}
