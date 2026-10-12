import { DomainError } from '../domain/errors.js';
import type { LlmClient, LlmCompletion, LlmMessage, LlmToolCall, LlmToolDefinition } from './llm.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: LlmToolCall[] } }>;
  error?: { message?: string; code?: string };
}

/**
 * Client Groq côté serveur uniquement. La clé GROQ_API_KEY est lue depuis l'environnement
 * du serveur et n'est jamais transmise au navigateur.
 */
export class GroqClient implements LlmClient {
  readonly provider = 'groq';

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly timeoutMs = 45_000,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(request: { messages: LlmMessage[]; tools: LlmToolDefinition[] }): Promise<LlmCompletion> {
    if (!this.apiKey) {
      throw new DomainError(
        'AI_NOT_CONFIGURED',
        "L'assistante n'est pas configurée : ajoutez GROQ_API_KEY dans le fichier .env du serveur puis redémarrez-le.",
      );
    }
    // Groq renvoie parfois « tool_use_failed » quand le modèle formule mal un appel d'outil : on réessaie une fois.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call(request);
      } catch (error) {
        if (attempt < 2 && error instanceof RetryableToolError) continue;
        if (error instanceof RetryableToolError) {
          throw new DomainError('AI_UNAVAILABLE', "L'assistante n'a pas réussi à formuler sa réponse. Pouvez-vous reformuler ?");
        }
        throw error;
      }
    }
  }

  private async call(request: { messages: LlmMessage[]; tools: LlmToolDefinition[] }): Promise<LlmCompletion> {
    let response: Response;
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: 'auto',
          temperature: 0.2,
          max_completion_tokens: 1500,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      throw new DomainError(
        'AI_UNAVAILABLE',
        timedOut ? "L'assistante met trop de temps à répondre. Réessayez dans un instant." : 'Impossible de joindre Groq.',
      );
    }

    const body = (await response.json().catch(() => ({}))) as GroqResponse;
    if (!response.ok) {
      if (response.status === 400 && body.error?.code === 'tool_use_failed') throw new RetryableToolError();
      console.error('[groq] erreur', response.status, body.error?.message);
      if (response.status === 401) throw new DomainError('AI_NOT_CONFIGURED', 'La clé GROQ_API_KEY est refusée par Groq.');
      if (response.status === 429) {
        throw new DomainError('AI_UNAVAILABLE', 'Limite de requêtes Groq atteinte. Réessayez dans quelques instants.');
      }
      throw new DomainError('AI_UNAVAILABLE', `Groq a renvoyé une erreur (${response.status}).`);
    }

    const message = body.choices?.[0]?.message;
    return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
  }
}

class RetryableToolError extends Error {}
