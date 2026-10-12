import { Assistant } from './ai/Assistant.js';
import type { LlmClient } from './ai/llm.js';
import { ConversationStore } from './conversations/ConversationStore.js';
import { DemoProductRepository } from './repositories/demo/DemoProductRepository.js';
import type { ProductRepository } from './repositories/ProductRepository.js';
import { SharedDatabaseProductRepository } from './repositories/shared/SharedDatabaseProductRepository.js';
import { CatalogService } from './services/CatalogService.js';
import { ChatService } from './services/ChatService.js';
import { OperationService } from './services/OperationService.js';
import { LocalDiskImageStorage } from './storage/LocalDiskImageStorage.js';

export interface Services {
  repo: ProductRepository;
  images: LocalDiskImageStorage;
  catalog: CatalogService;
  operations: OperationService;
  chat: ChatService;
  llm: LlmClient;
}

/** Assemble les couches : stockage → logique métier → IA → conversation. */
export function createServices(options: { dataDir: string; catalogAdapter: 'demo' | 'shared'; llm: LlmClient }): Services {
  const repo: ProductRepository =
    options.catalogAdapter === 'shared'
      ? new SharedDatabaseProductRepository()
      : new DemoProductRepository(options.dataDir);
  const images = new LocalDiskImageStorage(options.dataDir);
  const catalog = new CatalogService(repo);
  const operations = new OperationService(repo, images, options.dataDir);
  const assistant = new Assistant(options.llm, catalog, operations, repo);
  const chat = new ChatService(new ConversationStore(options.dataDir), assistant, operations, images);
  return { repo, images, catalog, operations, chat, llm: options.llm };
}
