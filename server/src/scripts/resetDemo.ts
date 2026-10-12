import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

// Remet à zéro les données locales de démonstration (catalogue, opérations, conversations, photos).
for (const name of ['demo-catalog.json', 'operations.json', 'conversations.json', 'uploads.json', 'media']) {
  rmSync(join(config.dataDir, name), { recursive: true, force: true });
}
console.log(`Données de démonstration réinitialisées (${config.dataDir}).`);
