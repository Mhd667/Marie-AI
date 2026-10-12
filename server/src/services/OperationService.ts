import { join } from 'node:path';
import type {
  ChangeEntry,
  ChangeKind,
  FieldChange,
  OperationKind,
  OperationPreview,
  OperationStatus,
  OperationView,
  Product,
  ProductImage,
} from '../../../shared/types.js';
import { DomainError } from '../domain/errors.js';
import {
  adjustStockInput,
  createProductInput,
  formatFcfa,
  manageImagesInput,
  MAX_STOCK,
  parseOrThrow,
  statusLabel,
  updateProductInput,
  type AdjustStockInput,
  type CreateProductInput,
  type ManageImagesInput,
  type UpdateProductInput,
} from '../domain/validation.js';
import { newId, nowIso } from '../lib/ids.js';
import { JsonFile } from '../lib/jsonFile.js';
import type { ProductRepository } from '../repositories/ProductRepository.js';
import type { ImageStorage, StagedUpload } from '../storage/ImageStorage.js';
import { normalize } from './CatalogService.js';

type OperationInput =
  | { kind: 'createProduct'; input: CreateProductInput }
  | { kind: 'updateProduct'; input: UpdateProductInput }
  | { kind: 'adjustStock'; input: AdjustStockInput }
  | { kind: 'manageProductImages'; input: ManageImagesInput };

interface StoredOperation {
  id: string;
  conversationId: string;
  payload: OperationInput;
  /** Version du produit au moment de l'aperçu : l'exécution échoue si elle a changé. */
  expectedVersion?: number;
  preview: OperationPreview;
  status: OperationStatus;
  error?: string;
  resultProductId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface OperationOutcome {
  operation: OperationView;
  product?: Product;
  /** true si l'opération était déjà confirmée/annulée : rien n'a été réexécuté. */
  alreadyResolved: boolean;
}

/**
 * Opérations d'écriture en deux temps : préparation (validation + aperçu, aucune écriture)
 * puis exécution après confirmation explicite de la propriétaire.
 *
 * Garanties :
 * - toute entrée est revalidée côté serveur, quelle que soit sa provenance (IA ou API) ;
 * - une opération ne s'exécute qu'une seule fois (machine à états persistée) ;
 * - si le produit a changé depuis l'aperçu, l'exécution est refusée (contrôle de version) ;
 * - le résultat renvoyé reflète ce qui a réellement été écrit.
 */
export class OperationService {
  private readonly file: JsonFile<Record<string, StoredOperation>>;
  private operations: Record<string, StoredOperation>;

  constructor(
    private readonly repo: ProductRepository,
    private readonly images: ImageStorage,
    dataDir: string,
  ) {
    this.file = new JsonFile(join(dataDir, 'operations.json'), () => ({}));
    this.operations = this.file.read();
    // Une opération restée « en cours » lors d'un arrêt du serveur n'est jamais rejouée automatiquement.
    for (const op of Object.values(this.operations)) {
      if (op.status === 'executing') {
        op.status = 'failed';
        op.error = "L'exécution a été interrompue (redémarrage du serveur). Vérifiez le produit avant de recommencer.";
        op.resolvedAt = nowIso();
      }
    }
    this.file.write(this.operations);
  }

  get(id: string): OperationView | null {
    const op = this.operations[id];
    return op ? toView(op) : null;
  }

  conversationOf(id: string): string | undefined {
    return this.operations[id]?.conversationId;
  }

  /* ------------------------------------------------------------------ */
  /* Préparation                                                         */
  /* ------------------------------------------------------------------ */

  async prepare(kind: OperationKind, rawInput: unknown, conversationId: string): Promise<OperationView> {
    let payload: OperationInput;
    let built: { preview: OperationPreview; expectedVersion?: number };

    switch (kind) {
      case 'createProduct': {
        const input = parseOrThrow(createProductInput, rawInput);
        payload = { kind, input };
        built = await this.previewCreate(input);
        break;
      }
      case 'updateProduct': {
        const input = parseOrThrow(updateProductInput, rawInput);
        payload = { kind, input };
        built = await this.previewUpdate(input);
        break;
      }
      case 'adjustStock': {
        const input = parseOrThrow(adjustStockInput, rawInput);
        payload = { kind, input };
        built = await this.previewStock(input);
        break;
      }
      case 'manageProductImages': {
        const input = parseOrThrow(manageImagesInput, rawInput);
        payload = { kind, input };
        built = await this.previewImages(input);
        break;
      }
      default:
        throw new DomainError('VALIDATION', `Opération inconnue : ${String(kind)}`);
    }

    const op: StoredOperation = {
      id: newId('op'),
      conversationId,
      payload,
      expectedVersion: built.expectedVersion,
      preview: built.preview,
      status: 'pending',
      createdAt: nowIso(),
    };
    this.save(op);
    return toView(op);
  }

  private async previewCreate(input: CreateProductInput) {
    const uploads = await this.requireStagedUploads(input.imageUploadIds);
    const existing = await this.repo.list();
    const warnings: string[] = [];
    const twin = existing.find((p) => normalize(p.name) === normalize(input.name));
    if (twin) {
      warnings.push(
        `Un produit porte déjà ce nom (« ${twin.name} », stock ${twin.stock}). Pour ajouter des exemplaires, il vaut mieux augmenter son stock.`,
      );
    }
    if (input.status === 'published' && uploads.length === 0) {
      warnings.push('Le produit sera publié sans photo.');
    }
    const preview: OperationPreview = {
      title: 'Nouveau produit',
      productName: input.name,
      changes: [
        { field: 'name', label: 'Nom', after: input.name },
        { field: 'priceFcfa', label: 'Prix', after: formatFcfa(input.priceFcfa) },
        { field: 'stock', label: 'Stock', after: String(input.stock) },
        { field: 'category', label: 'Catégorie', after: input.category },
        { field: 'status', label: 'Statut', after: statusLabel(input.status) },
        ...(input.description ? [{ field: 'description', label: 'Description', after: input.description }] : []),
      ],
      imagesAdded: uploads.map(uploadAsImage),
      imagesRemoved: [],
      warnings,
    };
    return { preview };
  }

  private async previewUpdate(input: UpdateProductInput) {
    const product = await this.requireProduct(input.productId);
    const changes = diffProduct(product, input);
    if (changes.length === 0) {
      throw new DomainError('VALIDATION', `Aucun changement : « ${product.name} » a déjà ces valeurs.`);
    }
    const warnings: string[] = [];
    if (input.status === 'published' && product.images.length === 0) {
      warnings.push('Ce produit sera publié sans photo.');
    }
    const preview: OperationPreview = {
      title: 'Modification du produit',
      productId: product.id,
      productName: product.name,
      changes,
      imagesAdded: [],
      imagesRemoved: [],
      warnings,
    };
    return { preview, expectedVersion: product.version };
  }

  private async previewStock(input: AdjustStockInput) {
    const product = await this.requireProduct(input.productId);
    const next = computeStock(product, input);
    const labels = { increase: 'Ajout de stock', decrease: 'Retrait de stock', set: 'Correction du stock' } as const;
    const preview: OperationPreview = {
      title: labels[input.mode],
      productId: product.id,
      productName: product.name,
      changes: [{ field: 'stock', label: 'Stock', before: String(product.stock), after: String(next) }],
      imagesAdded: [],
      imagesRemoved: [],
      warnings: next === 0 ? ['Le produit sera en rupture de stock.'] : [],
    };
    return { preview, expectedVersion: product.version };
  }

  private async previewImages(input: ManageImagesInput) {
    const product = await this.requireProduct(input.productId);
    const uploads = await this.requireStagedUploads(input.uploadIds);
    const removed = selectImagesToRemove(product, input);
    const remaining = product.images.length - removed.length + uploads.length;
    const titles = { add: 'Ajout de photos', replace: 'Remplacement de photos', remove: 'Suppression de photos' } as const;
    const warnings: string[] = [];
    if (remaining === 0 && product.status === 'published') warnings.push('Le produit publié n’aura plus aucune photo.');
    const preview: OperationPreview = {
      title: titles[input.action],
      productId: product.id,
      productName: product.name,
      changes: [
        { field: 'images', label: 'Photos', before: String(product.images.length), after: String(remaining) },
      ],
      imagesAdded: uploads.map(uploadAsImage),
      imagesRemoved: removed,
      warnings,
    };
    return { preview, expectedVersion: product.version };
  }

  /* ------------------------------------------------------------------ */
  /* Exécution                                                           */
  /* ------------------------------------------------------------------ */

  async confirm(id: string): Promise<OperationOutcome> {
    const op = this.operations[id];
    if (!op) throw new DomainError('NOT_FOUND', 'Opération introuvable.');
    if (op.status === 'executed') {
      const product = op.resultProductId ? await this.repo.getById(op.resultProductId) : null;
      return { operation: toView(op), product: product ?? undefined, alreadyResolved: true };
    }
    if (op.status === 'executing') throw new DomainError('IN_PROGRESS', 'Cette opération est déjà en cours d’exécution.');
    if (op.status === 'cancelled') throw new DomainError('ALREADY_RESOLVED', 'Cette opération a été annulée.');
    if (op.status === 'failed') {
      throw new DomainError('ALREADY_RESOLVED', `Cette opération a échoué : ${op.error ?? 'erreur inconnue'}`);
    }

    // Verrou : le passage à « executing » est synchrone et persisté avant toute écriture,
    // une seconde confirmation simultanée tombe donc sur IN_PROGRESS.
    this.save({ ...op, status: 'executing' });

    try {
      const product = await this.execute(op);
      // Les photos ont quitté la zone d'attente : l'aperçu pointe désormais vers les images définitives
      // (elles sont ajoutées en fin de liste par execute()).
      const addedCount = op.preview.imagesAdded.length;
      const preview: OperationPreview = addedCount
        ? { ...op.preview, imagesAdded: product.images.slice(-addedCount) }
        : op.preview;
      const done: StoredOperation = {
        ...op,
        preview,
        status: 'executed',
        resultProductId: product.id,
        resolvedAt: nowIso(),
      };
      this.save(done);
      return { operation: toView(done), product, alreadyResolved: false };
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'Erreur technique pendant l’enregistrement.';
      if (!(error instanceof DomainError)) console.error('[operations] échec inattendu', error);
      const failed: StoredOperation = { ...op, status: 'failed', error: message, resolvedAt: nowIso() };
      this.save(failed);
      return { operation: toView(failed), alreadyResolved: false };
    }
  }

  cancel(id: string): OperationOutcome {
    const op = this.operations[id];
    if (!op) throw new DomainError('NOT_FOUND', 'Opération introuvable.');
    if (op.status === 'cancelled') return { operation: toView(op), alreadyResolved: true };
    if (op.status !== 'pending') {
      throw new DomainError('ALREADY_RESOLVED', 'Cette opération ne peut plus être annulée.');
    }
    const cancelled: StoredOperation = { ...op, status: 'cancelled', resolvedAt: nowIso() };
    this.save(cancelled);
    return { operation: toView(cancelled), alreadyResolved: false };
  }

  private async execute(op: StoredOperation): Promise<Product> {
    const { payload } = op;
    const now = nowIso();

    if (payload.kind === 'createProduct') {
      const { input } = payload;
      await this.requireStagedUploads(input.imageUploadIds);
      const images = await this.commitUploads(input.imageUploadIds);
      const product: Product = {
        id: newId('prd'),
        name: input.name,
        description: input.description,
        priceFcfa: input.priceFcfa,
        stock: input.stock,
        category: input.category,
        status: input.status,
        images,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      try {
        return await this.repo.create(
          product,
          this.changeEntry(op, product, 'create', `Création de « ${product.name} »`, op.preview.changes),
        );
      } catch (error) {
        await Promise.all(images.map((image) => this.images.remove(image)));
        throw error;
      }
    }

    const current = await this.requireProduct(payload.input.productId);
    if (op.expectedVersion !== undefined && current.version !== op.expectedVersion) {
      throw new DomainError(
        'CONFLICT',
        `« ${current.name} » a été modifié depuis l’aperçu. Redemandez la modification pour obtenir un aperçu à jour.`,
      );
    }
    const { id: _id, createdAt: _createdAt, version, ...base } = current;

    if (payload.kind === 'updateProduct') {
      const changes = diffProduct(current, payload.input);
      if (changes.length === 0) throw new DomainError('VALIDATION', 'Aucun changement à appliquer.');
      const { productId: _pid, ...fields } = payload.input;
      const next = { ...base, ...definedOnly(fields), updatedAt: now };
      return this.repo.update(
        current.id,
        version,
        next,
        this.changeEntry(op, current, 'update', `Modification de « ${current.name} »`, changes),
      );
    }

    if (payload.kind === 'adjustStock') {
      const stock = computeStock(current, payload.input);
      const changes: FieldChange[] = [
        { field: 'stock', label: 'Stock', before: String(current.stock), after: String(stock) },
      ];
      return this.repo.update(
        current.id,
        version,
        { ...base, stock, updatedAt: now },
        this.changeEntry(op, current, 'stock', `Stock de « ${current.name} » : ${current.stock} → ${stock}`, changes),
      );
    }

    // manageProductImages
    const { input } = payload;
    const removed = selectImagesToRemove(current, input);
    await this.requireStagedUploads(input.uploadIds);
    const added = await this.commitUploads(input.uploadIds);
    const removedIds = new Set(removed.map((image) => image.id));
    const images = [...current.images.filter((image) => !removedIds.has(image.id)), ...added];
    let product: Product;
    try {
      product = await this.repo.update(
        current.id,
        version,
        { ...base, images, updatedAt: now },
        this.changeEntry(op, current, 'images', `Photos de « ${current.name} » : ${current.images.length} → ${images.length}`, [
          { field: 'images', label: 'Photos', before: String(current.images.length), after: String(images.length) },
        ]),
      );
    } catch (error) {
      await Promise.all(added.map((image) => this.images.remove(image)));
      throw error;
    }
    // Le produit est à jour : les anciennes images peuvent être supprimées du stockage.
    await Promise.all(removed.map((image) => this.images.remove(image).catch(() => undefined)));
    return product;
  }

  /* ------------------------------------------------------------------ */

  private async requireProduct(id: string): Promise<Product> {
    const product = await this.repo.getById(id);
    if (!product) throw new DomainError('NOT_FOUND', `Aucun produit avec l'identifiant ${id}.`);
    return product;
  }

  private async requireStagedUploads(ids: string[]): Promise<StagedUpload[]> {
    if (new Set(ids).size !== ids.length) throw new DomainError('VALIDATION', 'La même photo est indiquée deux fois.');
    const uploads: StagedUpload[] = [];
    for (const id of ids) {
      const upload = await this.images.getStaged(id);
      if (!upload) throw new DomainError('NOT_FOUND', `Pièce jointe introuvable (${id}).`);
      if (upload.status !== 'staged') {
        throw new DomainError('CONFLICT', `La photo « ${upload.fileName} » est déjà associée à un produit.`);
      }
      uploads.push(upload);
    }
    return uploads;
  }

  private async commitUploads(ids: string[]): Promise<ProductImage[]> {
    const committed: ProductImage[] = [];
    try {
      for (const id of ids) committed.push(await this.images.commit(id));
    } catch (error) {
      await Promise.all(committed.map((image) => this.images.remove(image)));
      throw error;
    }
    return committed;
  }

  private changeEntry(
    op: StoredOperation,
    product: Pick<Product, 'id' | 'name'>,
    kind: ChangeKind,
    summary: string,
    changes: FieldChange[],
  ): ChangeEntry {
    return {
      id: newId('chg'),
      productId: product.id,
      productName: product.name,
      kind,
      summary,
      changes,
      operationId: op.id,
      at: nowIso(),
    };
  }

  private save(op: StoredOperation): void {
    const next = { ...this.operations, [op.id]: op };
    this.file.write(next);
    this.operations = next;
  }
}

/* -------------------------------------------------------------------- */

function computeStock(product: Product, input: AdjustStockInput): number {
  if (input.mode !== 'set' && input.quantity === 0) {
    throw new DomainError('VALIDATION', 'La quantité à ajouter ou retirer doit être supérieure à 0.');
  }
  const next =
    input.mode === 'increase'
      ? product.stock + input.quantity
      : input.mode === 'decrease'
        ? product.stock - input.quantity
        : input.quantity;
  if (next < 0) {
    throw new DomainError(
      'VALIDATION',
      `Impossible de retirer ${input.quantity} exemplaire(s) : « ${product.name} » n'en a que ${product.stock} en stock.`,
    );
  }
  if (next > MAX_STOCK) throw new DomainError('VALIDATION', 'La quantité obtenue semble anormalement élevée.');
  if (input.mode === 'set' && next === product.stock) {
    throw new DomainError('VALIDATION', `Le stock de « ${product.name} » est déjà de ${product.stock}.`);
  }
  return next;
}

function selectImagesToRemove(product: Product, input: ManageImagesInput): ProductImage[] {
  if (input.action === 'add') return [];
  if (input.action === 'replace' && input.imageIds.length === 0) return [...product.images];
  return input.imageIds.map((imageId) => {
    const image = product.images.find((candidate) => candidate.id === imageId);
    if (!image) throw new DomainError('NOT_FOUND', `L'image ${imageId} n'appartient pas à « ${product.name} ».`);
    return image;
  });
}

function diffProduct(product: Product, input: UpdateProductInput): FieldChange[] {
  const changes: FieldChange[] = [];
  if (input.name !== undefined && input.name !== product.name) {
    changes.push({ field: 'name', label: 'Nom', before: product.name, after: input.name });
  }
  if (input.priceFcfa !== undefined && input.priceFcfa !== product.priceFcfa) {
    changes.push({
      field: 'priceFcfa',
      label: 'Prix',
      before: formatFcfa(product.priceFcfa),
      after: formatFcfa(input.priceFcfa),
    });
  }
  if (input.category !== undefined && input.category !== product.category) {
    changes.push({ field: 'category', label: 'Catégorie', before: product.category, after: input.category });
  }
  if (input.status !== undefined && input.status !== product.status) {
    changes.push({ field: 'status', label: 'Statut', before: statusLabel(product.status), after: statusLabel(input.status) });
  }
  if (input.description !== undefined && input.description !== product.description) {
    changes.push({
      field: 'description',
      label: 'Description',
      before: product.description || '—',
      after: input.description || '—',
    });
  }
  return changes;
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function uploadAsImage(upload: StagedUpload): ProductImage {
  return { id: upload.id, url: upload.url, alt: upload.fileName };
}

function toView(op: StoredOperation): OperationView {
  return {
    id: op.id,
    kind: op.payload.kind,
    status: op.status,
    preview: op.preview,
    error: op.error,
    resultProductId: op.resultProductId,
    createdAt: op.createdAt,
    resolvedAt: op.resolvedAt,
  };
}
