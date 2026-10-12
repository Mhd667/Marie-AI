import type { ProductImage, UploadView } from '../../../shared/types.js';

/**
 * Service de stockage d'images interchangeable.
 *
 * Cycle de vie en deux temps, pour ne jamais annoncer une image comme enregistrée trop tôt :
 * 1. `stage` : la photo jointe au chat est écrite dans une zone d'attente (fichier réel,
 *    pas une URL temporaire du navigateur). Elle n'est rattachée à aucun produit.
 * 2. `commit` : appelé uniquement pendant l'exécution d'une opération confirmée ; la photo
 *    devient une image définitive. Le produit n'est mis à jour qu'après ce succès.
 *
 * Une implémentation S3 / Cloudinary / Supabase Storage pourra remplacer
 * LocalDiskImageStorage sans toucher au reste du code.
 */
export interface ImageStorage {
  stage(file: IncomingImage): Promise<UploadView>;
  getStaged(uploadId: string): Promise<StagedUpload | null>;
  commit(uploadId: string): Promise<ProductImage>;
  /** Supprime une image définitive (après qu'elle a été détachée d'un produit). */
  remove(image: ProductImage): Promise<void>;
}

export interface IncomingImage {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StagedUpload extends UploadView {
  status: 'staged' | 'committed';
  committedImageId?: string;
  createdAt: string;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Vérifie la signature binaire : le type déclaré par le navigateur ne suffit pas. */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}
