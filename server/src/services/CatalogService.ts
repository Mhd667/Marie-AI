import type { CatalogSummary, ChangeEntry, Product } from '../../../shared/types.js';
import { DomainError } from '../domain/errors.js';
import { parseOrThrow, productIdSchema, searchProductsInput } from '../domain/validation.js';
import type { ProductRepository } from '../repositories/ProductRepository.js';

export const LOW_STOCK_THRESHOLD = 3;

/** Opérations de lecture du catalogue. Aucune écriture ici. */
export class CatalogService {
  constructor(private readonly repo: ProductRepository) {}

  async searchProducts(rawInput: unknown): Promise<Product[]> {
    const input = parseOrThrow(searchProductsInput, rawInput);
    const products = await this.repo.list();
    const terms = normalize(input.query ?? '')
      .split(/\s+/)
      .filter((term) => term.length > 0)
      // Pluriel simple : "perruques" doit trouver "Perruque Bob".
      .map((term) => (term.length > 3 ? term.replace(/s$/, '') : term));
    const category = input.category ? normalize(input.category) : undefined;

    return products
      .filter((product) => {
        if (category && normalize(product.category) !== category) return false;
        if (input.status && product.status !== input.status) return false;
        if (input.inStock === true && product.stock <= 0) return false;
        if (input.inStock === false && product.stock > 0) return false;
        if (terms.length === 0) return true;
        const haystack = normalize(`${product.name} ${product.category} ${product.description} ${product.id}`);
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .slice(0, input.limit);
  }

  async getProduct(rawId: unknown): Promise<Product> {
    const id = parseOrThrow(productIdSchema, rawId);
    const product = await this.repo.getById(id);
    if (!product) throw new DomainError('NOT_FOUND', `Aucun produit avec l'identifiant ${id}.`);
    return product;
  }

  async listStockAlerts(threshold = LOW_STOCK_THRESHOLD): Promise<{ outOfStock: Product[]; lowStock: Product[] }> {
    const products = await this.repo.list();
    const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'fr');
    return {
      outOfStock: products.filter((p) => p.stock <= 0).sort(byName),
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= threshold).sort((a, b) => a.stock - b.stock),
    };
  }

  async getSummary(): Promise<CatalogSummary> {
    const products = await this.repo.list();
    const categories = new Map<string, { products: number; units: number }>();
    for (const product of products) {
      const entry = categories.get(product.category) ?? { products: 0, units: 0 };
      entry.products += 1;
      entry.units += product.stock;
      categories.set(product.category, entry);
    }
    return {
      totalProducts: products.length,
      publishedProducts: products.filter((p) => p.status === 'published').length,
      draftProducts: products.filter((p) => p.status === 'draft').length,
      totalUnits: products.reduce((sum, p) => sum + p.stock, 0),
      outOfStock: products.filter((p) => p.stock <= 0).length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      stockValueFcfa: products.reduce((sum, p) => sum + p.stock * p.priceFcfa, 0),
      categories: [...categories.entries()]
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'fr')),
    };
  }

  async listChanges(filter: { productId?: string; limit?: number } = {}): Promise<ChangeEntry[]> {
    if (filter.productId) parseOrThrow(productIdSchema, filter.productId);
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 20), 1), 100);
    return this.repo.listChanges({ productId: filter.productId, limit });
  }

  async listCategories(): Promise<string[]> {
    const products = await this.repo.list();
    return [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'fr'));
  }
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
