import type { ChatMessage, MessageBlock, OperationView, Product, UploadView } from '../../../shared/types.js';
import { DomainError } from '../domain/errors.js';
import type { ProductRepository } from '../repositories/ProductRepository.js';
import { LOW_STOCK_THRESHOLD, type CatalogService } from '../services/CatalogService.js';
import type { OperationService } from '../services/OperationService.js';
import type { LlmClient, LlmMessage, LlmToolCall } from './llm.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { isWriteTool, TOOL_DEFINITIONS } from './tools.js';

const MAX_TOOL_ROUNDS = 6;
const HISTORY_MESSAGES = 24;

const STATUS_LABELS: Record<OperationView['status'], string> = {
  pending: 'en attente de confirmation',
  executing: 'en cours',
  executed: 'confirmée et enregistrée',
  cancelled: 'annulée',
  failed: 'échouée',
};

export interface AssistantReply {
  text: string;
  blocks: MessageBlock[];
}

/**
 * Orchestration de la conversation : le modèle choisit des outils, le serveur les exécute
 * (lecture) ou prépare des opérations (écriture), puis renvoie le texte et les cartes à afficher.
 */
export class Assistant {
  constructor(
    private readonly llm: LlmClient,
    private readonly catalog: CatalogService,
    private readonly operations: OperationService,
    private readonly repo: ProductRepository,
  ) {}

  async reply(input: {
    conversationId: string;
    history: ChatMessage[];
    userText: string;
    attachments: UploadView[];
  }): Promise<AssistantReply> {
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({
          today: new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' }),
          categories: await this.catalog.listCategories(),
          lowStockThreshold: LOW_STOCK_THRESHOLD,
          isDemo: this.repo.info.isDemo,
        }),
      },
      ...input.history.slice(-HISTORY_MESSAGES).map((message) => this.toLlmMessage(message)),
      { role: 'user', content: describeUserTurn(input.userText, input.attachments) },
    ];

    const collected = new TurnCollector();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await this.llm.complete({ messages, tools: TOOL_DEFINITIONS });
      if (completion.toolCalls.length === 0) {
        return collected.finish(completion.content);
      }
      messages.push({ role: 'assistant', content: completion.content, tool_calls: completion.toolCalls });
      for (const call of completion.toolCalls) {
        const result = await this.runTool(call, input.conversationId, collected);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return collected.finish(
      collected.operations.length > 0 ? null : "Je n'ai pas réussi à aller au bout de cette demande. Pouvez-vous la préciser ?",
    );
  }

  private async runTool(call: LlmToolCall, conversationId: string, collected: TurnCollector): Promise<unknown> {
    const name = call.function.name;
    let args: unknown;
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      return { error: 'Arguments JSON invalides. Reformule l’appel.' };
    }

    try {
      if (isWriteTool(name)) {
        const operation = await this.operations.prepare(name, args, conversationId);
        collected.operations.push(operation);
        return {
          status: 'awaiting_confirmation',
          operationId: operation.id,
          preview: operation.preview,
          instruction: 'Rien n’est encore enregistré. La propriétaire doit vérifier l’aperçu et cliquer sur « Confirmer ».',
        };
      }
      const record = asRecord(args);
      switch (name) {
        case 'searchProducts': {
          const products = await this.catalog.searchProducts(args);
          collected.setProducts(products, record.query ? `Résultats pour « ${String(record.query)} »` : undefined);
          return { count: products.length, products: products.map(compactProduct) };
        }
        case 'getProduct': {
          const product = await this.catalog.getProduct(record.productId);
          collected.setProducts([product]);
          return { product: { ...compactProduct(product), description: product.description, images: product.images } };
        }
        case 'listStockAlerts': {
          const alerts = await this.catalog.listStockAlerts();
          collected.stockAlerts = alerts;
          return {
            lowStockThreshold: LOW_STOCK_THRESHOLD,
            outOfStock: alerts.outOfStock.map(compactProduct),
            lowStock: alerts.lowStock.map(compactProduct),
          };
        }
        case 'getCatalogSummary': {
          const summary = await this.catalog.getSummary();
          collected.extra.push({ type: 'summary', summary });
          return summary;
        }
        case 'getChangeHistory': {
          const changes = await this.catalog.listChanges({
            productId: typeof record.productId === 'string' ? record.productId : undefined,
            limit: typeof record.limit === 'number' ? record.limit : 15,
          });
          collected.extra.push({ type: 'changes', changes });
          return { count: changes.length, changes };
        }
        default:
          return { error: `Outil inconnu : ${name}` };
      }
    } catch (error) {
      if (error instanceof DomainError && error.code !== 'NOT_IMPLEMENTED') {
        return { error: error.message, hint: 'Explique le problème à la propriétaire ou demande-lui l’information manquante.' };
      }
      throw error;
    }
  }

  /** Résume les messages passés pour le modèle, avec l'état réel (actuel) des opérations. */
  private toLlmMessage(message: ChatMessage): LlmMessage {
    if (message.role === 'user') {
      return { role: 'user', content: describeUserTurn(message.text, message.attachments ?? []) };
    }
    const notes: string[] = [];
    for (const block of message.blocks ?? []) {
      if (block.type === 'operation') {
        const live = this.operations.get(block.operation.id) ?? block.operation;
        notes.push(
          `[Opération « ${live.preview.title} » sur « ${live.preview.productName} »${
            live.preview.productId ? ` (${live.preview.productId})` : ''
          } : ${STATUS_LABELS[live.status]}${live.error ? ` — ${live.error}` : ''}]`,
        );
      } else if (block.type === 'products') {
        notes.push(`[Produits affichés : ${block.products.map((p) => `${p.name} (${p.id})`).join(' ; ')}]`);
      } else if (block.type === 'notice') {
        notes.push(`[${block.text}]`);
      }
    }
    return { role: 'assistant', content: [message.text, ...notes].filter(Boolean).join('\n') };
  }
}

class TurnCollector {
  operations: OperationView[] = [];
  extra: MessageBlock[] = [];
  stockAlerts: { outOfStock: Product[]; lowStock: Product[] } | null = null;
  private products: { products: Product[]; title?: string } | null = null;

  setProducts(products: Product[], title?: string): void {
    this.products = { products, title };
  }

  finish(content: string | null): AssistantReply {
    const blocks: MessageBlock[] = [];
    if (this.stockAlerts) {
      blocks.push({ type: 'products', title: 'En rupture de stock', products: this.stockAlerts.outOfStock });
      if (this.stockAlerts.lowStock.length > 0) {
        blocks.push({ type: 'products', title: 'Stock faible', products: this.stockAlerts.lowStock });
      }
    }
    blocks.push(...this.extra);
    // Quand une opération est proposée, l'aperçu suffit : on n'affiche pas en plus les résultats de recherche intermédiaires.
    if (this.operations.length > 0) {
      blocks.push(...this.operations.map((operation): MessageBlock => ({ type: 'operation', operation })));
    } else if (this.products && this.products.products.length > 0 && !this.stockAlerts) {
      blocks.push({ type: 'products', title: this.products.title, products: this.products.products });
    }

    let text = (content ?? '').trim();
    if (!text) {
      text =
        this.operations.length > 0
          ? 'Voici l’aperçu. Vérifiez les changements puis confirmez.'
          : blocks.length > 0
            ? 'Voici ce que j’ai trouvé.'
            : 'Je n’ai pas de réponse à proposer. Pouvez-vous reformuler ?';
    }
    return { text, blocks };
  }
}

function describeUserTurn(text: string, attachments: UploadView[]): string {
  if (attachments.length === 0) return text;
  const list = attachments.map((a) => `${a.id} (${a.fileName})`).join(', ');
  return `${text || '(aucun texte)'}\n[Photos jointes à ce message, non encore associées à un produit : ${list}]`;
}

function compactProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    priceFcfa: product.priceFcfa,
    stock: product.stock,
    category: product.category,
    status: product.status,
    imageCount: product.images.length,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
