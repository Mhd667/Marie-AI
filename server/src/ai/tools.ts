import type { LlmToolDefinition } from './llm.js';

const productId = {
  type: 'string',
  description: 'Identifiant exact du produit (prd_...), obtenu via searchProducts ou getProduct. Ne jamais l’inventer.',
};

/**
 * Outils exposés au modèle. Les outils de lecture s'exécutent immédiatement ;
 * les outils d'écriture ne font que PRÉPARER une opération qui attend la confirmation
 * de la propriétaire dans l'interface.
 */
export const TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'searchProducts',
      description:
        'Recherche des produits du catalogue par mots-clés, catégorie, statut ou disponibilité. Sans critère, liste les produits.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Mots-clés (nom, catégorie, description).' },
          category: { type: 'string', description: 'Catégorie exacte.' },
          status: { type: 'string', enum: ['published', 'draft'] },
          inStock: { type: 'boolean', description: 'true : en stock uniquement ; false : en rupture uniquement.' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProduct',
      description: 'Récupère la fiche complète d’un produit (y compris les identifiants de ses images).',
      parameters: { type: 'object', properties: { productId }, required: ['productId'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listStockAlerts',
      description: 'Liste les produits en rupture de stock et ceux dont le stock est faible.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCatalogSummary',
      description: 'Résumé chiffré du catalogue : nombre de produits, stock total, ruptures, valeur du stock, catégories.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getChangeHistory',
      description: 'Historique des modifications réellement enregistrées, éventuellement pour un seul produit.',
      parameters: {
        type: 'object',
        properties: { productId, limit: { type: 'integer', minimum: 1, maximum: 50 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createProduct',
      description:
        'PRÉPARE la création d’un produit (rien n’est enregistré avant la confirmation de la propriétaire). ' +
        'Le nom, le prix, le stock et la catégorie doivent avoir été donnés explicitement par la propriétaire.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          priceFcfa: { type: 'integer', description: 'Prix entier en FCFA, donné par la propriétaire.' },
          stock: { type: 'integer', description: 'Nombre d’exemplaires, donné par la propriétaire.' },
          category: { type: 'string' },
          status: { type: 'string', enum: ['published', 'draft'], description: 'Par défaut : draft.' },
          imageUploadIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Identifiants upl_... des photos jointes dans la conversation.',
          },
        },
        required: ['name', 'priceFcfa', 'stock', 'category'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateProduct',
      description:
        'PRÉPARE la modification du nom, de la description, du prix, de la catégorie ou du statut de publication d’un produit.',
      parameters: {
        type: 'object',
        properties: {
          productId,
          name: { type: 'string' },
          description: { type: 'string' },
          priceFcfa: { type: 'integer' },
          category: { type: 'string' },
          status: { type: 'string', enum: ['published', 'draft'] },
        },
        required: ['productId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjustStock',
      description:
        'PRÉPARE un ajustement de stock : increase (ajouter des exemplaires), decrease (retirer), set (corriger à une valeur exacte).',
      parameters: {
        type: 'object',
        properties: {
          productId,
          mode: { type: 'string', enum: ['increase', 'decrease', 'set'] },
          quantity: { type: 'integer', minimum: 0 },
        },
        required: ['productId', 'mode', 'quantity'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manageProductImages',
      description:
        'PRÉPARE la gestion des photos d’un produit. add : ajoute des photos jointes ; replace : remplace les images ' +
        'indiquées (ou toutes si imageIds est vide) par les photos jointes ; remove : supprime les images indiquées.',
      parameters: {
        type: 'object',
        properties: {
          productId,
          action: { type: 'string', enum: ['add', 'replace', 'remove'] },
          uploadIds: { type: 'array', items: { type: 'string' }, description: 'Photos jointes (upl_...).' },
          imageIds: { type: 'array', items: { type: 'string' }, description: 'Images existantes du produit (img_...).' },
        },
        required: ['productId', 'action'],
        additionalProperties: false,
      },
    },
  },
];

export const WRITE_TOOLS = {
  createProduct: 'createProduct',
  updateProduct: 'updateProduct',
  adjustStock: 'adjustStock',
  manageProductImages: 'manageProductImages',
} as const;

export type WriteToolName = keyof typeof WRITE_TOOLS;

export function isWriteTool(name: string): name is WriteToolName {
  return Object.hasOwn(WRITE_TOOLS, name);
}
