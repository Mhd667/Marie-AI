import type {
  ApiErrorBody,
  Conversation,
  ConversationSummary,
  HealthResponse,
  OperationActionResponse,
  SendMessageRequest,
  SendMessageResponse,
  UploadResponse,
} from '../../../shared/types';

/**
 * Couche d'accès à l'API, indépendante des composants.
 * Le navigateur ne parle qu'au serveur de l'assistante (jamais à Groq directement).
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Une nouvelle tentative peut-elle réussir ? (réseau, IA momentanément indisponible) */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.code === 'AI_UNAVAILABLE';
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('NETWORK', 'Connexion au serveur impossible. Vérifiez votre réseau.', 0);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(error?.code ?? 'HTTP', error?.message ?? `Erreur du serveur (${response.status}).`, response.status);
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  listConversations: () =>
    request<{ conversations: ConversationSummary[] }>('/api/conversations').then((r) => r.conversations),

  getConversation: (id: string) =>
    request<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}`).then((r) => r.conversation),

  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  sendMessage: (payload: SendMessageRequest) => request<SendMessageResponse>('/api/chat', json(payload)),

  uploadImages: (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('images', file, file.name);
    return request<UploadResponse>('/api/uploads', { method: 'POST', body: form }).then((r) => r.uploads);
  },

  confirmOperation: (id: string) =>
    request<OperationActionResponse>(`/api/operations/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),

  cancelOperation: (id: string) =>
    request<OperationActionResponse>(`/api/operations/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
