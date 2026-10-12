import { z } from 'zod';
import { DomainError } from './errors.js';

/**
 * Schémas de validation des opérations métier.
 * Ils s'appliquent à tout ce qui arrive de l'IA comme de l'API : le modèle n'est jamais
 * cru sur parole, chaque valeur est revérifiée ici avant toute écriture.
 */

/** Accepte un entier ou une chaîne composée uniquement de chiffres ("15000"). Rien d'autre. */
const integerLike = z.preprocess(
  (value) => (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value) ? Number(value.trim()) : value),
  z.number({ error: 'doit être un nombre entier' }).int({ error: 'doit être un nombre entier' }),
);

export const productIdSchema = z
  .string({ error: "l'identifiant produit est obligatoire" })
  .trim()
  .regex(/^prd_[a-z0-9]{6,32}$/, { error: "l'identifiant produit est invalide" });

export const uploadIdSchema = z
  .string()
  .trim()
  .regex(/^upl_[a-z0-9]{6,32}$/, { error: "l'identifiant de pièce jointe est invalide" });

export const imageIdSchema = z
  .string()
  .trim()
  .regex(/^img_[a-z0-9]{6,32}$/, { error: "l'identifiant d'image est invalide" });

export const MAX_PRICE_FCFA = 100_000_000;
export const MAX_STOCK = 1_000_000;

export const priceSchema = integerLike.pipe(
  z
    .number()
    .min(1, { error: 'le prix doit être supérieur à 0 FCFA' })
    .max(MAX_PRICE_FCFA, { error: 'le prix semble anormalement élevé' }),
);

export const stockSchema = integerLike.pipe(
  z
    .number()
    .min(0, { error: 'le stock ne peut pas être négatif' })
    .max(MAX_STOCK, { error: 'la quantité semble anormalement élevée' }),
);

const nameSchema = z
  .string({ error: 'le nom est obligatoire' })
  .trim()
  .min(2, { error: 'le nom est trop court' })
  .max(120, { error: 'le nom est trop long (120 caractères max.)' });

const descriptionSchema = z.string().trim().max(4000, { error: 'la description est trop longue' });

const categorySchema = z
  .string({ error: 'la catégorie est obligatoire' })
  .trim()
  .min(2, { error: 'la catégorie est trop courte' })
  .max(60, { error: 'la catégorie est trop longue' });

export const statusSchema = z.enum(['published', 'draft'], {
  error: 'le statut doit être "published" (publié) ou "draft" (brouillon)',
});

export const createProductInput = z.strictObject({
  name: nameSchema,
  description: descriptionSchema.default(''),
  priceFcfa: priceSchema,
  stock: stockSchema,
  category: categorySchema,
  status: statusSchema.default('draft'),
  imageUploadIds: z.array(uploadIdSchema).max(10).default([]),
});

export const updateProductInput = z
  .strictObject({
    productId: productIdSchema,
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    priceFcfa: priceSchema.optional(),
    category: categorySchema.optional(),
    status: statusSchema.optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined ||
      input.priceFcfa !== undefined ||
      input.category !== undefined ||
      input.status !== undefined,
    { error: 'aucune modification demandée' },
  );

export const adjustStockInput = z.strictObject({
  productId: productIdSchema,
  mode: z.enum(['increase', 'decrease', 'set'], {
    error: 'le mode doit être "increase", "decrease" ou "set"',
  }),
  quantity: stockSchema,
});

export const manageImagesInput = z
  .strictObject({
    productId: productIdSchema,
    action: z.enum(['add', 'replace', 'remove'], { error: 'l\'action doit être "add", "replace" ou "remove"' }),
    uploadIds: z.array(uploadIdSchema).max(10).default([]),
    imageIds: z.array(imageIdSchema).max(20).default([]),
  })
  .superRefine((input, ctx) => {
    if ((input.action === 'add' || input.action === 'replace') && input.uploadIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'au moins une photo jointe est nécessaire', path: ['uploadIds'] });
    }
    if (input.action === 'remove' && input.imageIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'précisez les images à supprimer', path: ['imageIds'] });
    }
    if (input.action === 'add' && input.imageIds.length > 0) {
      ctx.addIssue({ code: 'custom', message: "imageIds n'est pas utilisé pour un ajout", path: ['imageIds'] });
    }
  });

export const searchProductsInput = z.strictObject({
  query: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  status: statusSchema.optional(),
  inStock: z.boolean().optional(),
  limit: integerLike.pipe(z.number().min(1).max(50)).default(20),
});

export type CreateProductInput = z.infer<typeof createProductInput>;
export type UpdateProductInput = z.infer<typeof updateProductInput>;
export type AdjustStockInput = z.infer<typeof adjustStockInput>;
export type ManageImagesInput = z.infer<typeof manageImagesInput>;
export type SearchProductsInput = z.infer<typeof searchProductsInput>;

/** Valide une entrée et lève une DomainError lisible en français en cas d'échec. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw new DomainError('VALIDATION', formatIssues(result.error));
}

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      if (issue.code === 'unrecognized_keys') return `champ(s) non autorisé(s) : ${issue.keys.join(', ')}`;
      return path ? `${path} : ${issue.message}` : issue.message;
    })
    .join(' ; ');
}

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/ | /g, ' ')} FCFA`;
}

export function statusLabel(status: 'published' | 'draft'): string {
  return status === 'published' ? 'Publié' : 'Brouillon';
}
