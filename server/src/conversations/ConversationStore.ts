import { join } from 'node:path';
import type { ChatMessage, Conversation, ConversationSummary } from '../../../shared/types.js';
import { DomainError } from '../domain/errors.js';
import { newId, nowIso } from '../lib/ids.js';
import { JsonFile } from '../lib/jsonFile.js';

/** Historique des conversations, conservé dans DATA_DIR/conversations.json. */
export class ConversationStore {
  private readonly file: JsonFile<Record<string, Conversation>>;
  private conversations: Record<string, Conversation>;

  constructor(dataDir: string) {
    this.file = new JsonFile(join(dataDir, 'conversations.json'), () => ({}));
    this.conversations = this.file.read();
  }

  list(): ConversationSummary[] {
    return Object.values(this.conversations)
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toSummary);
  }

  get(id: string): Conversation {
    const conversation = this.conversations[id];
    if (!conversation) throw new DomainError('NOT_FOUND', 'Conversation introuvable.');
    return structuredClone(conversation);
  }

  getOrCreate(id: string | undefined, firstText: string): Conversation {
    if (id) return this.get(id);
    const now = nowIso();
    const conversation: Conversation = {
      id: newId('cnv'),
      title: makeTitle(firstText),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    };
    this.save(conversation);
    return structuredClone(conversation);
  }

  append(id: string, ...messages: ChatMessage[]): ConversationSummary {
    const conversation = this.get(id);
    conversation.messages.push(...messages);
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = nowIso();
    this.save(conversation);
    return toSummary(conversation);
  }

  delete(id: string): void {
    if (!this.conversations[id]) throw new DomainError('NOT_FOUND', 'Conversation introuvable.');
    const { [id]: _removed, ...rest } = this.conversations;
    this.file.write(rest);
    this.conversations = rest;
  }

  private save(conversation: Conversation): void {
    const next = { ...this.conversations, [conversation.id]: structuredClone(conversation) };
    this.file.write(next);
    this.conversations = next;
  }
}

function toSummary(c: Conversation): ConversationSummary {
  return { id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length };
}

function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Photos partagées';
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
