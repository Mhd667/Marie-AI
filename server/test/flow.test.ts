import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type {
  Conversation,
  OperationActionResponse,
  OperationView,
  SendMessageResponse,
  UploadResponse,
} from '../../shared/types.js';
import { GroqClient } from '../src/ai/GroqClient.js';
import type { LlmClient, LlmCompletion, LlmMessage, LlmToolDefinition } from '../src/ai/llm.js';
import { createServices, type Services } from '../src/container.js';
import { createApp } from '../src/http/app.js';

/**
 * Tests de bout en bout de l'API, avec un modèle simulé (ScriptedLlm) à la place de Groq :
 * on vérifie que le serveur valide, prévisualise et n'exécute qu'après confirmation,
 * quelles que soient les demandes du modèle.
 */

type Step = (messages: LlmMessage[]) => LlmCompletion;

class ScriptedLlm implements LlmClient {
  readonly provider = 'test';
  readonly model = 'scripted';
  readonly configured = true;
  private steps: Step[] = [];
  lastMessages: LlmMessage[] = [];

  script(...steps: Step[]): void {
    this.steps = steps;
  }

  async complete(request: { messages: LlmMessage[]; tools: LlmToolDefinition[] }): Promise<LlmCompletion> {
    this.lastMessages = request.messages;
    const step = this.steps.shift();
    if (!step) return { content: 'Fin du scénario.', toolCalls: [] };
    return step(request.messages);
  }
}

let callCounter = 0;
const tool = (name: string, args: unknown): Step => () => ({
  content: null,
  toolCalls: [{ id: `call_${++callCounter}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});
const say = (text: string): Step => () => ({ content: text, toolCalls: [] });

function lastToolResult(messages: LlmMessage[]): Record<string, unknown> {
  const toolMessages = messages.filter((m) => m.role === 'tool');
  const last = toolMessages[toolMessages.length - 1];
  assert.ok(last && last.role === 'tool', 'un résultat d’outil est attendu');
  return JSON.parse(last.content) as Record<string, unknown>;
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Marie Glam Assistant — API', () => {
  let dataDir: string;
  let baseUrl: string;
  let llm: ScriptedLlm;
  let services: Services;
  let close: () => void;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mga-test-'));
    llm = new ScriptedLlm();
    services = createServices({ dataDir, catalogAdapter: 'demo', llm });
    const server = createApp(services).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });

  after(() => {
    close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : init?.headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  }

  const chat = (text: string, extra: { conversationId?: string; attachmentIds?: string[] } = {}) =>
    api<SendMessageResponse>('/api/chat', { method: 'POST', json: { text, ...extra } });

  const confirm = (id: string) =>
    api<OperationActionResponse & { error?: { code: string } }>(`/api/operations/${id}/confirm`, { method: 'POST' });

  function operationOf(response: SendMessageResponse): OperationView {
    const block = response.assistantMessage.blocks?.find((b) => b.type === 'operation');
    assert.ok(block && block.type === 'operation', 'un aperçu d’opération est attendu');
    return block.operation;
  }

  it('indique clairement le mode démonstration non synchronisé', async () => {
    const { body } = await api<{ catalogAdapter: { isDemo: boolean; syncedWithStorefront: boolean } }>('/api/health');
    assert.equal(body.catalogAdapter.isDemo, true);
    assert.equal(body.catalogAdapter.syncedWithStorefront, false);
  });

  it('prépare une modification de prix sans rien écrire, puis l’exécute une seule fois après confirmation', async () => {
    llm.script(
      tool('searchProducts', { query: 'bob' }),
      tool('updateProduct', { productId: 'prd_demo0002', priceFcfa: 99000 }),
      say('Voici l’aperçu, confirmez si c’est bon.'),
    );
    const { status, body } = await chat('Passe la perruque bob à 99 000 FCFA');
    assert.equal(status, 200);
    const op = operationOf(body);
    assert.equal(op.status, 'pending');
    assert.deepEqual(op.preview.changes[0], { field: 'priceFcfa', label: 'Prix', before: '95 000 FCFA', after: '99 000 FCFA' });

    // Rien n'est écrit avant la confirmation.
    assert.equal((await services.repo.getById('prd_demo0002'))?.priceFcfa, 95000);

    const first = await confirm(op.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.operation.status, 'executed');
    assert.equal(first.body.alreadyResolved, false);
    const product = await services.repo.getById('prd_demo0002');
    assert.equal(product?.priceFcfa, 99000);
    assert.equal(product?.version, 2);

    // Double clic / nouvel envoi : pas de seconde exécution.
    const second = await confirm(op.id);
    assert.equal(second.body.alreadyResolved, true);
    assert.equal((await services.repo.getById('prd_demo0002'))?.version, 2);

    const history = await services.repo.listChanges({ productId: 'prd_demo0002' });
    assert.equal(history.length, 1);
    assert.equal(history[0]?.operationId, op.id);

    // Le message de confirmation est enregistré dans la conversation.
    const conv = await api<{ conversation: Conversation }>(`/api/conversations/${body.conversation.id}`);
    const messages = conv.body.conversation.messages;
    assert.equal(messages.length, 3);
    const hydrated = messages[1]?.blocks?.find((b) => b.type === 'operation');
    assert.equal(hydrated?.type === 'operation' && hydrated.operation.status, 'executed');
  });

  it('n’applique qu’une fois deux confirmations simultanées', async () => {
    llm.script(tool('adjustStock', { productId: 'prd_demo0003', mode: 'increase', quantity: 5 }), say('Aperçu prêt.'));
    const { body } = await chat('Ajoute 5 lots deep wave');
    const op = operationOf(body);
    const results = await Promise.all([confirm(op.id), confirm(op.id), confirm(op.id)]);
    const executed = results.filter((r) => r.status === 200 && !r.body.alreadyResolved);
    assert.equal(executed.length, 1);
    assert.equal((await services.repo.getById('prd_demo0003'))?.stock, 12);
  });

  it('refuse un retrait supérieur au stock et renvoie l’erreur au modèle', async () => {
    llm.script(tool('adjustStock', { productId: 'prd_demo0005', mode: 'decrease', quantity: 5 }), (messages) => {
      const result = lastToolResult(messages);
      assert.match(String(result.error), /n'en a que 2 en stock/);
      return { content: 'Il n’en reste que 2.', toolCalls: [] };
    });
    const { body } = await chat('Retire 5 rouges nude');
    assert.equal(body.assistantMessage.blocks?.some((b) => b.type === 'operation'), false);
    assert.equal((await services.repo.getById('prd_demo0005'))?.stock, 2);
  });

  it('rejette un prix absent ou non numérique et un identifiant inventé', async () => {
    llm.script(
      tool('createProduct', { name: 'Gloss Cristal', stock: 4, category: 'Maquillage' }),
      (messages) => {
        assert.match(String(lastToolResult(messages).error), /priceFcfa/);
        return tool('updateProduct', { productId: 'prd_demo0004', priceFcfa: 'quinze mille' })(messages);
      },
      (messages) => {
        assert.match(String(lastToolResult(messages).error), /priceFcfa/);
        return tool('adjustStock', { productId: 'prd_inexistant', mode: 'set', quantity: 3 })(messages);
      },
      (messages) => {
        assert.match(String(lastToolResult(messages).error), /Aucun produit/);
        return { content: 'Quel est le prix ?', toolCalls: [] };
      },
    );
    const { body } = await chat('Ajoute un gloss cristal');
    assert.equal(body.assistantMessage.blocks?.some((b) => b.type === 'operation'), false);
    const products = await services.repo.list();
    assert.equal(products.some((p) => p.name === 'Gloss Cristal'), false);
  });

  it('refuse d’exécuter un aperçu devenu obsolète', async () => {
    llm.script(
      tool('updateProduct', { productId: 'prd_demo0009', name: 'Créoles dorées Glam XL' }),
      tool('adjustStock', { productId: 'prd_demo0009', mode: 'set', quantity: 1 }),
      say('Deux aperçus prêts.'),
    );
    const { body } = await chat('Renomme les créoles et corrige le stock à 1');
    const ops = body.assistantMessage.blocks?.flatMap((b) => (b.type === 'operation' ? [b.operation] : [])) ?? [];
    assert.equal(ops.length, 2);
    assert.equal((await confirm(ops[0]!.id)).body.operation.status, 'executed');
    const stale = await confirm(ops[1]!.id);
    assert.equal(stale.body.operation.status, 'failed');
    assert.match(stale.body.operation.error ?? '', /modifié depuis l’aperçu/);
    assert.equal((await services.repo.getById('prd_demo0009'))?.stock, 9);
  });

  it('annule une opération et empêche ensuite sa confirmation', async () => {
    llm.script(tool('updateProduct', { productId: 'prd_demo0010', category: 'Sacs' }), say('Aperçu prêt.'));
    const op = operationOf((await chat('Range le sac Marie dans Sacs')).body);
    const cancelled = await api<OperationActionResponse>(`/api/operations/${op.id}/cancel`, { method: 'POST' });
    assert.equal(cancelled.body.operation.status, 'cancelled');
    const late = await confirm(op.id);
    assert.equal(late.status, 409);
    assert.equal((await services.repo.getById('prd_demo0010'))?.category, 'Accessoires');
  });

  it('enregistre une photo seulement à la confirmation et crée le produit avec', async () => {
    const form = new FormData();
    form.append('images', new Blob([PNG_1PX], { type: 'image/png' }), 'gloss.png');
    const uploaded = await api<UploadResponse>('/api/uploads', { method: 'POST', body: form });
    assert.equal(uploaded.status, 201);
    const uploadId = uploaded.body.uploads[0]!.id;
    assert.match(uploaded.body.uploads[0]!.url, /^\/media\/staging\//);

    llm.script(
      (messages) => {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        assert.ok(lastUser && String(lastUser.content).includes(uploadId), 'le modèle reçoit l’identifiant de la photo');
        return tool('createProduct', {
          name: 'Gloss Cristal',
          priceFcfa: 5500,
          stock: 6,
          category: 'Maquillage',
          imageUploadIds: [uploadId],
        })(messages);
      },
      say('Aperçu prêt.'),
    );
    const { body } = await chat('Crée un gloss cristal à 5500, 6 en stock, catégorie Maquillage', {
      attachmentIds: [uploadId],
    });
    const op = operationOf(body);
    assert.equal(op.preview.imagesAdded.length, 1);
    assert.equal((await services.repo.list()).some((p) => p.name === 'Gloss Cristal'), false);

    const done = await confirm(op.id);
    assert.equal(done.body.operation.status, 'executed');
    const created = await services.repo.getById(done.body.operation.resultProductId!);
    assert.equal(created?.images.length, 1);
    assert.match(created!.images[0]!.url, /^\/media\/images\/img_/);
    const image = await fetch(`${baseUrl}${created!.images[0]!.url}`);
    assert.equal(image.status, 200);
    assert.equal(done.body.operation.preview.imagesAdded[0]?.url, created!.images[0]!.url);

    // La même photo ne peut pas être associée une seconde fois.
    llm.script(
      tool('manageProductImages', { productId: 'prd_demo0001', action: 'add', uploadIds: [uploadId] }),
      (messages) => {
        assert.match(String(lastToolResult(messages).error), /déjà associée/);
        return { content: 'Cette photo est déjà utilisée.', toolCalls: [] };
      },
    );
    await chat('Ajoute aussi cette photo à la perruque body wave');
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const form = new FormData();
    form.append('images', new Blob(['pas une image'], { type: 'image/png' }), 'faux.png');
    const res = await api<{ error: { message: string } }>('/api/uploads', { method: 'POST', body: form });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /n'est pas une image/);
  });

  it('résume le catalogue et affiche les ruptures', async () => {
    llm.script(tool('getCatalogSummary', {}), tool('listStockAlerts', {}), say('Voici le point.'));
    const { body } = await chat('Fais-moi le point');
    const types = body.assistantMessage.blocks?.map((b) => b.type);
    assert.deepEqual(types, ['products', 'products', 'summary']);
    const outOfStock = body.assistantMessage.blocks?.[0];
    assert.ok(outOfStock?.type === 'products');
    assert.deepEqual(
      outOfStock.products.map((p) => p.id).sort(),
      ['prd_demo0002', 'prd_demo0007'],
    );
  });

  it('renvoie une erreur claire si GROQ_API_KEY est absente, sans enregistrer le message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mga-nokey-'));
    const noKey = createServices({ dataDir: dir, catalogAdapter: 'demo', llm: new GroqClient(undefined, 'x') });
    const server = createApp(noKey).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Bonjour' }),
    });
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'AI_NOT_CONFIGURED');
    assert.equal(noKey.chat.listConversations().length, 0);
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
