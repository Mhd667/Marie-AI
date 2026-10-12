/**
 * Contrat minimal d'un modèle de langage avec appel d'outils (format compatible OpenAI,
 * utilisé par Groq). Permet de remplacer le fournisseur ou de le simuler dans les tests.
 */
export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlmToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmCompletion {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  readonly configured: boolean;
  complete(request: { messages: LlmMessage[]; tools: LlmToolDefinition[] }): Promise<LlmCompletion>;
}
