import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Persistance minimale dans un fichier JSON (écriture atomique via fichier temporaire).
 * Suffisant pour la démonstration locale ; un adaptateur base de données le remplacera.
 */
export class JsonFile<T> {
  constructor(
    private readonly path: string,
    private readonly fallback: () => T,
  ) {}

  read(): T {
    if (!existsSync(this.path)) return this.fallback();
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as T;
    } catch (error) {
      throw new Error(`Fichier de données illisible : ${this.path} (${(error as Error).message})`);
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2));
    renameSync(tmp, this.path);
  }
}
