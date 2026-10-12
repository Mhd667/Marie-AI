/**
 * Types partagés entre le serveur et l'interface.
 * Ce fichier ne contient que des types : il n'embarque aucune logique ni aucun secret.
 */

export type PublicationStatus = 'published' | 'draft';

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
}

export interface Product {
  /** Identifiant stable, jamais réutilisé (ex. "prd_8f3k2m"). */
  id: string;
  name: string;
  description: string;
  /** Prix entier en francs CFA (FCFA). */
  priceFcfa: number;
  /** Nombre d'exemplaires disponibles. */
  stock: number;
  category: string;
  images: ProductImage[];
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  /** Incrémentée à chaque modification, sert au contrôle de concurrence. */
  version: number;
}

export type ChangeKind = 'create' | 'update' | 'stock' | 'images';

export interface FieldChange {
  field: string;
  label: string;
  before?: string;
  after?: string;
}

export interface ChangeEntry {
  id: string;
  productId: string;
  productName: string;
  kind: ChangeKind;
  summary: string;
  changes: FieldChange[];
  operationId: string;
  at: string;
}

export interface CatalogSummary {
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  totalUnits: number;
  outOfStock: number;
  lowStock: number;
  lowStockThreshold: number;
  stockValueFcfa: number;
  categories: { name: string; products: number; units: number }[];
}

export type OperationKind = 'createProduct' | 'updateProduct' | 'adjustStock' | 'manageProductImages';
export type OperationStatus = 'pending' | 'executing' | 'executed' | 'cancelled' | 'failed';

export interface OperationPreview {
  title: string;
  productId?: string;
  productName: string;
  changes: FieldChange[];
  imagesAdded: ProductImage[];
  imagesRemoved: ProductImage[];
  warnings: string[];
}

export interface OperationView {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  preview: OperationPreview;
  error?: string;
  resultProductId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface UploadView {
  id: string;
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
}

export type MessageBlock =
  | { type: 'products'; title?: string; products: Product[] }
  | { type: 'operation'; operation: OperationView }
  | { type: 'summary'; summary: CatalogSummary }
  | { type: 'changes'; changes: ChangeEntry[] }
  | { type: 'notice'; tone: 'success' | 'error' | 'info'; text: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  attachments?: UploadView[];
  blocks?: MessageBlock[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation extends ConversationSummary {
  createdAt: string;
  messages: ChatMessage[];
}

/* ---------- Contrats HTTP ---------- */

export interface HealthResponse {
  ok: true;
  catalogAdapter: { id: string; label: string; isDemo: boolean; syncedWithStorefront: boolean };
  ai: { configured: boolean; provider: string; model: string };
}

export interface SendMessageRequest {
  conversationId?: string;
  text: string;
  attachmentIds?: string[];
}

export interface SendMessageResponse {
  conversation: ConversationSummary;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface OperationActionResponse {
  operation: OperationView;
  message: ChatMessage;
  alreadyResolved: boolean;
}

export interface UploadResponse {
  uploads: UploadView[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
