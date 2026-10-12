import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ProductImage, UploadView } from '../../../shared/types.js';
import { DomainError } from '../domain/errors.js';
import { newId, nowIso } from '../lib/ids.js';
import { JsonFile } from '../lib/jsonFile.js';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  sniffImageType,
  type ImageStorage,
  type IncomingImage,
  type StagedUpload,
} from './ImageStorage.js';

/**
 * Stockage sur le disque du serveur de l'assistante (DATA_DIR/media).
 * Les fichiers sont servis sous /media/... par ce serveur uniquement : la boutique publique
 * ne peut pas les lire. Pour partager les images avec le storefront, remplacer cet
 * adaptateur par un stockage objet public (voir ImageStorage).
 */
export class LocalDiskImageStorage implements ImageStorage {
  private readonly stagingDir: string;
  private readonly imagesDir: string;
  private readonly index: JsonFile<Record<string, StagedUpload>>;
  private uploads: Record<string, StagedUpload>;

  constructor(dataDir: string, private readonly publicPath = '/media') {
    this.stagingDir = join(dataDir, 'media', 'staging');
    this.imagesDir = join(dataDir, 'media', 'images');
    mkdirSync(this.stagingDir, { recursive: true });
    mkdirSync(this.imagesDir, { recursive: true });
    this.index = new JsonFile(join(dataDir, 'uploads.json'), () => ({}));
    this.uploads = this.index.read();
  }

  get mediaRoot(): string {
    return join(this.stagingDir, '..');
  }

  async stage(file: IncomingImage): Promise<UploadView> {
    if (file.buffer.length === 0) throw new DomainError('VALIDATION', `« ${file.originalName} » est vide.`);
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new DomainError('VALIDATION', `« ${file.originalName} » dépasse 8 Mo.`);
    }
    const detected = sniffImageType(file.buffer);
    const extension = detected ? ALLOWED_IMAGE_TYPES[detected] : undefined;
    if (!detected || !extension) {
      throw new DomainError(
        'VALIDATION',
        `« ${file.originalName} » n'est pas une image prise en charge (JPEG, PNG, WebP ou GIF).`,
      );
    }
    const id = newId('upl');
    const fileName = `${id}.${extension}`;
    writeFileSync(join(this.stagingDir, fileName), file.buffer);
    const upload: StagedUpload = {
      id,
      url: `${this.publicPath}/staging/${fileName}`,
      fileName: basename(file.originalName).slice(0, 120) || fileName,
      size: file.buffer.length,
      mimeType: detected,
      status: 'staged',
      createdAt: nowIso(),
    };
    this.save({ ...this.uploads, [id]: upload });
    return toView(upload);
  }

  async getStaged(uploadId: string): Promise<StagedUpload | null> {
    const upload = this.uploads[uploadId];
    return upload ? { ...upload } : null;
  }

  async commit(uploadId: string): Promise<ProductImage> {
    const upload = this.uploads[uploadId];
    if (!upload) throw new DomainError('NOT_FOUND', `Pièce jointe introuvable (${uploadId}).`);
    if (upload.status === 'committed') {
      throw new DomainError('CONFLICT', `La photo « ${upload.fileName} » est déjà associée à un produit.`);
    }
    const stagedFile = join(this.stagingDir, basename(upload.url));
    if (!existsSync(stagedFile)) {
      throw new DomainError('NOT_FOUND', `Le fichier de « ${upload.fileName} » n'existe plus sur le serveur.`);
    }
    const imageId = newId('img');
    const fileName = `${imageId}.${ALLOWED_IMAGE_TYPES[upload.mimeType] ?? 'bin'}`;
    renameSync(stagedFile, join(this.imagesDir, fileName));
    const image: ProductImage = { id: imageId, url: `${this.publicPath}/images/${fileName}`, alt: upload.fileName };
    this.save({
      ...this.uploads,
      [uploadId]: { ...upload, status: 'committed', committedImageId: imageId, url: image.url },
    });
    return image;
  }

  async remove(image: ProductImage): Promise<void> {
    if (!image.url.startsWith(`${this.publicPath}/images/`)) return;
    rmSync(join(this.imagesDir, basename(image.url)), { force: true });
  }

  private save(next: Record<string, StagedUpload>): void {
    this.index.write(next);
    this.uploads = next;
  }
}

function toView(upload: StagedUpload): UploadView {
  return { id: upload.id, url: upload.url, fileName: upload.fileName, size: upload.size, mimeType: upload.mimeType };
}
