import type { ChangeEntry, Product } from '../../../shared/types.js';

/**
 * Point d'accès unique aux données du catalogue.
 *
 * Toute la logique métier passe par cette interface : l'interface utilisateur et l'IA
 * n'y accèdent jamais directement. Pour brancher la base partagée avec la boutique,
 * il suffit de fournir une nouvelle implémentation (voir repositories/shared/).
 *
 * Contrat attendu de chaque implémentation :
 * - les identifiants produits sont stables et jamais réutilisés ;
 * - `update` applique un contrôle de concurrence optimiste sur `version` ;
 * - l'écriture du produit et de son entrée d'historique est atomique.
 */
export interface ProductRepository {
  /** Décrit l'adaptateur, affiché dans l'interface (mode démo, synchronisation...). */
  readonly info: CatalogAdapterInfo;

  list(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;

  /** Insère un nouveau produit et son entrée d'historique. */
  create(product: Product, change: ChangeEntry): Promise<Product>;

  /**
   * Remplace un produit si sa version actuelle vaut `expectedVersion`.
   * Lève une DomainError CONFLICT sinon. La version est incrémentée par le dépôt.
   */
  update(
    id: string,
    expectedVersion: number,
    next: Omit<Product, 'id' | 'createdAt' | 'version'>,
    change: ChangeEntry,
  ): Promise<Product>;

  listChanges(filter?: { productId?: string; limit?: number }): Promise<ChangeEntry[]>;
}

export interface CatalogAdapterInfo {
  id: string;
  label: string;
  isDemo: boolean;
  /** Ne doit valoir true que si les données sont réellement celles de la boutique. */
  syncedWithStorefront: boolean;
}
