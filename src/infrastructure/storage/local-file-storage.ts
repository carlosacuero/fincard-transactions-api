/**
 * Adaptador de almacenamiento: emula Amazon S3 sobre el sistema de archivos.
 * En producción se reemplaza por un adaptador con @aws-sdk/client-s3
 * sin tocar el dominio ni los casos de uso (mismo puerto FileStorage).
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { FileStorage } from '../../domain/ports/file-storage';

export class LocalFileStorage implements FileStorage {
  constructor(private readonly rootDir: string) {}

  async putObject(key: string, content: string): Promise<void> {
    const filePath = join(this.rootDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }
}
