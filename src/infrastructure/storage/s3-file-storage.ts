/**
 * Adaptador de almacenamiento real sobre Amazon S3 (AWS SDK v3).
 * Implementa el mismo puerto FileStorage que el adaptador local,
 * por lo que el dominio y los casos de uso no cambian.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { FileStorage } from '../../domain/ports/file-storage';

export class S3FileStorage implements FileStorage {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({})
  ) {}

  async putObject(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: key.endsWith('.json') ? 'application/json' : 'text/csv'
      })
    );
  }
}
