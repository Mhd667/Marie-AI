import type {
  ChatMessage,
  Conversation,
  MessageBlock,
  OperationView,
  OperationActionResponse,
  SendMessageRequest,
  SendMessageResponse,
  UploadView,
} from '../../../shared/types.js';
import type { Assistant } from '../ai/Assistant.js';
import type { ConversationStore } from '../conversations/ConversationStore.js';
import { DomainError } from '../domain/errors.js';
import { uploadIdSchema } from '../domain/validation.js';
import { newId, nowIso } from '../lib/ids.js';
import type { ImageStorage } from '../storage/ImageStorage.js';
import type { OperationOutcome, OperationService } from './OperationService.js';

const MAX_TEXT_LENGTH = 4000;
const MAX_ATTACHMENTS = 10;

/** Relie l'historique des conversations, l'assistante et les opérations confirmées. */
export class ChatService {
  constructor(
    private readonly conversations: ConversationStore,
    private readonly assistant: Assistant,
    private readonly operations: OperationService,
    private readonly images: ImageStorage,
  ) {}

  listConversations() {
    return this.conversations.list();
  }

  getConversation(id: string): Conversation {
    const conversation = this.conversations.get(id);
    return { ...conversation, messages: conversation.messages.map((m) => this.hydrate(m)) };
  }

  deleteConversation(id: string): void {
    this.conversations.delete(id);
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    const attachmentIds = Array.isArray(request.attachmentIds) ? request.attachmentIds : [];
    if (!text && attachmentIds.length === 0) throw new DomainError('VALIDATION', 'Le message est vide.');
    if (text.length > MAX_TEXT_LENGTH) throw new DomainError('VALIDATION', 'Le message est trop long.');
    if (attachmentIds.length > MAX_ATTACHMENTS) {
      throw new DomainError('VALIDATION', `${MAX_ATTACHMENTS} photos maximum par message.`);
    }

    const attachments: UploadView[] = [];
    for (const rawId of new Set(attachmentIds)) {
      const parsed = uploadIdSchema.safeParse(rawId);
      const upload = parsed.success ? await this.images.getStaged(parsed.data) : null;
      if (!upload) throw new DomainError('VALIDATION', 'Une des photos jointes est introuvable. Joignez-la à nouveau.');
      attachments.push({ id: upload.id, url: upload.url, fileName: upload.fileName, size: upload.size, mimeType: upload.mimeType });
    }

    const conversation = this.conversations.getOrCreate(request.conversationId, text);
    const userMessage: ChatMessage = {
      id: newId('msg'),
      role: 'user',
      text,
      createdAt: nowIso(),
      ...(attachments.length ? { attachments } : {}),
    };

    // Si l'IA échoue, rien n'est enregistré : l'interface propose de renvoyer le message.
    const reply = await this.assistant.reply({
      conversationId: conversation.id,
      history: conversation.messages,
      userText: text,
      attachments,
    });

    const assistantMessage: ChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      text: reply.text,
      createdAt: nowIso(),
      blocks: reply.blocks,
    };
    const summary = this.conversations.append(conversation.id, userMessage, assistantMessage);
    return { conversation: summary, userMessage, assistantMessage };
  }

  async confirmOperation(operationId: string): Promise<OperationActionResponse> {
    const outcome = await this.operations.confirm(operationId);
    return this.reportOutcome(operationId, outcome);
  }

  cancelOperation(operationId: string): OperationActionResponse {
    const outcome = this.operations.cancel(operationId);
    return this.reportOutcome(operationId, outcome);
  }

  /** Le message de résultat est rédigé par le serveur à partir du résultat réel, pas par l'IA. */
  private reportOutcome(
    operationId: string,
    outcome: OperationOutcome,
  ): OperationActionResponse {
    const { operation, product } = outcome;
    const blocks: MessageBlock[] = [];
    let text: string;

    if (operation.status === 'executed') {
      text = outcome.alreadyResolved
        ? 'Cette modification avait déjà été enregistrée : elle n’a pas été appliquée une seconde fois.'
        : successText(operation.kind, product?.name ?? operation.preview.productName);
      blocks.push({ type: 'notice', tone: 'success', text: 'Modification enregistrée dans le catalogue.' });
      if (product) blocks.push({ type: 'products', products: [product] });
    } else if (operation.status === 'cancelled') {
      text = 'D’accord, j’ai annulé. Rien n’a été modifié.';
    } else {
      text = 'La modification n’a pas pu être enregistrée. Rien n’a été modifié.';
      blocks.push({ type: 'notice', tone: 'error', text: operation.error ?? 'Erreur inconnue.' });
    }

    const message: ChatMessage = { id: newId('msg'), role: 'assistant', text, createdAt: nowIso(), blocks };
    if (!outcome.alreadyResolved) {
      const conversationId = this.operations.conversationOf(operationId);
      if (conversationId) this.conversations.append(conversationId, message);
    }
    return { operation, message, alreadyResolved: outcome.alreadyResolved };
  }


  /** Remplace l'état figé des opérations par leur état actuel (confirmée, annulée...). */
  private hydrate(message: ChatMessage): ChatMessage {
    if (!message.blocks) return message;
    return {
      ...message,
      blocks: message.blocks.map((block) =>
        block.type === 'operation'
          ? { ...block, operation: this.operations.get(block.operation.id) ?? block.operation }
          : block,
      ),
    };
  }
}

function successText(kind: OperationView['kind'], name: string): string {
  switch (kind) {
    case 'createProduct':
      return `C’est enregistré : « ${name} » a été ajouté au catalogue.`;
    case 'adjustStock':
      return `C’est enregistré : le stock de « ${name} » est à jour.`;
    case 'manageProductImages':
      return `C’est enregistré : les photos de « ${name} » sont à jour.`;
    default:
      return `C’est enregistré : « ${name} » est à jour.`;
  }
}
