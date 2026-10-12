import { join } from 'node:path';
import type { ChangeEntry, Product } from '../../../../shared/types.js';
import { DomainError } from '../../domain/errors.js';
import { JsonFile } from '../../lib/jsonFile.js';
import type { CatalogAdapterInfo, ProductRepository } from '../ProductRepository.js';
import { buildDemoCatalog } from './seed.js';

interface DemoState {
  products: Product[];
  changes: ChangeEntry[];
}

/**
 * ADAPTATEUR DE DÉMONSTRATION.
 *
 * Catalogue fictif stocké dans un fichier JSON local au serveur de l'assistante
 * (DATA_DIR/demo-catalog.json). Il n'est PAS relié à la boutique en ligne : les
 * modifications faites ici n'apparaissent pas sur le storefront.
 */
export class DemoProductRepository implements ProductRepository {
  readonly info: CatalogAdapterInfo = {
    id: 'demo',
    label: 'Catalogue de démonstration (non synchronisé avec la boutique)',
    isDemo: true,
    syncedWithStorefront: false,
  };

  private readonly file: JsonFile<DemoState>;
  private state: DemoState;

  constructor(dataDir: string) {
    this.file = new JsonFile<DemoState>(join(dataDir, 'demo-catalog.json'), () => ({
      products: buildDemoCatalog(),
      changes: [],
    }));
    this.state = this.file.read();
    this.file.write(this.state);
  }

  async list(): Promise<Product[]> {
    return structuredClone(this.state.products);
  }

  async getById(id: string): Promise<Product | null> {
    const product = this.state.products.find((p) => p.id === id);
    return product ? structuredClone(product) : null;
  }

  async create(product: Product, change: ChangeEntry): Promise<Product> {
    if (this.state.products.some((p) => p.id === product.id)) {
      throw new DomainError('CONFLICT', `L'identifiant ${product.id} existe déjà.`);
    }
    this.commit({
      products: [...this.state.products, structuredClone(product)],
      changes: [structuredClone(change), ...this.state.changes],
    });
    return structuredClone(product);
  }

  async update(
    id: string,
    expectedVersion: number,
    next: Omit<Product, 'id' | 'createdAt' | 'version'>,
    change: ChangeEntry,
  ): Promise<Product> {
    const index = this.state.products.findIndex((p) => p.id === id);
    const current = this.state.products[index];
    if (!current) throw new DomainError('NOT_FOUND', `Produit introuvable (${id}).`);
    if (current.version !== expectedVersion) {
      throw new DomainError(
        'CONFLICT',
        `« ${current.name} » a été modifié entre-temps. Demandez un nouvel aperçu avant de confirmer.`,
      );
    }
    const updated: Product = {
      ...structuredClone(next),
      id: current.id,
      createdAt: current.createdAt,
      version: current.version + 1,
    };
    const products = [...this.state.products];
    products[index] = updated;
    this.commit({ products, changes: [structuredClone(change), ...this.state.changes] });
    return structuredClone(updated);
  }

  async listChanges(filter: { productId?: string; limit?: number } = {}): Promise<ChangeEntry[]> {
    const changes = filter.productId
      ? this.state.changes.filter((c) => c.productId === filter.productId)
      : this.state.changes;
    return structuredClone(changes.slice(0, filter.limit ?? 20));
  }

  /** Écrit d'abord sur disque, puis remplace l'état en mémoire : pas d'état à moitié appliqué. */
  private commit(next: DemoState): void {
    this.file.write(next);
    this.state = next;
  }
}
