import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier du paquet serveur (fonctionne depuis src/ avec tsx comme depuis dist/ une fois compilé). */
function findServerDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === '@marie-glam/server') return dir;
    dir = dirname(dir);
  }
  throw new Error('Impossible de localiser le dossier server/.');
}

export const SERVER_DIR = findServerDir();
export const PROJECT_ROOT = resolve(SERVER_DIR, '..');

// Variables d'environnement : fichier .env à la racine du projet (facultatif).
// Les variables déjà définies dans l'environnement gardent la priorité.
const envFile = join(PROJECT_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function resolveDataDir(value: string | undefined): string {
  if (!value) return join(SERVER_DIR, 'data');
  return isAbsolute(value) ? value : resolve(SERVER_DIR, value);
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  groqApiKey: process.env.GROQ_API_KEY?.trim() || undefined,
  groqModel: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
  catalogAdapter: (process.env.CATALOG_ADAPTER?.trim() || 'demo') as 'demo' | 'shared',
  dataDir: resolveDataDir(process.env.DATA_DIR?.trim()),
  webDistDir: join(PROJECT_ROOT, 'web', 'dist'),
};
