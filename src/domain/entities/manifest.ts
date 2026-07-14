/**
 * Manifiesto de procesamiento de un lote (RF-02):
 * resume filas válidas, rechazadas, errores y el hash del archivo original.
 */
import { RowValidationError } from './transaction';

export interface BatchManifest {
  batchId: string;
  totalValidRows: number;
  totalRejectedRows: number;
  totalFlaggedRows: number;
  errors: RowValidationError[];
  processedAt: string;
  originalFileSha256: string;
}
