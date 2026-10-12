import type { ChangeEntry, Product } from '../../../../shared/types.js';
import { DomainError } from '../../domain/errors.js';
import type { CatalogAdapterInfo, ProductRepository } from '../ProductRepository.js';

/**
 * POINT DE BRANCHEMENT — base de données persistante partagée avec le storefront.
 *
 * Cet adaptateur n'est pas encore implémenté : il n'existe aucune synchronisation
 * avec la boutique à ce stade. Pour l'activer :
 *   1. choisir la base commune (ex. PostgreSQL/Supabase) utilisée aussi par le storefront ;
 *   2. implémenter chaque méthode ci-dessous (transaction produit + historique,
 *      `UPDATE ... WHERE id = $1 AND version = $2` pour le contrôle de version) ;
 *   3. remplacer LocalDiskImageStorage par un stockage d'images accessible publiquement ;
 *   4. lancer le serveur avec CATALOG_ADAPTER=shared.
 *
 * Tant que ce n'est pas fait, le serveur refuse de démarrer avec CATALOG_ADAPTER=shared
 * plutôt que de faire semblant d'être synchronisé.
 */
export class SharedDatabaseProductRepository implements ProductRepository {
  readonly info: CatalogAdapterInfo = {
    id: 'shared',
    label: 'Base partagée avec la boutique',
    isDemo: false,
    syncedWithStorefront: true,
  };

  constructor() {
    throw new DomainError(
      'NOT_IMPLEMENTED',
      "L'adaptateur de base partagée n'est pas encore implémenté. Utilisez CATALOG_ADAPTER=demo.",
    );
  }

  list(): Promise<Product[]> {
    return notImplemented();
  }
  getById(_id: string): Promise<Product | null> {
    return notImplemented();
  }
  create(_product: Product, _change: ChangeEntry): Promise<Product> {
    return notImplemented();
  }
  update(
    _id: string,
    _expectedVersion: number,
    _next: Omit<Product, 'id' | 'createdAt' | 'version'>,
    _change: ChangeEntry,
  ): Promise<Product> {
    return notImplemented();
  }
  listChanges(_filter?: { productId?: string; limit?: number }): Promise<ChangeEntry[]> {
    return notImplemented();
  }
}

function notImplemented(): never {
  throw new DomainError('NOT_IMPLEMENTED', "L'adaptateur de base partagée n'est pas encore implémenté.");
}
