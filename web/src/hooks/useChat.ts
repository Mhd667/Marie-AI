import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, MessageBlock, OperationView, UploadView } from '../../../shared/types';
import { api, ApiError } from '../api/client';

export interface UiMessage extends ChatMessage {
  /** Message de l'utilisatrice pas encore accepté par le serveur. */
  pending?: boolean;
  /** Échec d'envoi : le message peut être renvoyé. */
  failure?: { message: string; retryable: boolean };
}

export interface OperationUiState {
  busy?: 'confirm' | 'cancel';
  error?: string;
}

export function useChat(onConversationChanged: () => void) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationStates, setOperationStates] = useState<Record<string, OperationUiState>>({});
  const conversationRef = useRef<string | null>(null);
  conversationRef.current = conversationId;

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setLoadError(null);
    setOperationStates({});
  }, []);

  const open = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    setConversationId(id);
    setMessages([]);
    setOperationStates({});
    try {
      const conversation = await api.getConversation(id);
      setMessages(conversation.messages);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Conversation indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  const deliver = useCallback(
    async (localId: string, text: string, attachments: UploadView[]) => {
      setSending(true);
      try {
        const response = await api.sendMessage({
          conversationId: conversationRef.current ?? undefined,
          text,
          attachmentIds: attachments.map((a) => a.id),
        });
        setConversationId(response.conversation.id);
        setMessages((current) => [
          ...current.map((m) => (m.id === localId ? response.userMessage : m)),
          response.assistantMessage,
        ]);
        onConversationChanged();
      } catch (error) {
        const failure =
          error instanceof ApiError
            ? { message: error.message, retryable: error.retryable }
            : { message: 'Une erreur inattendue est survenue.', retryable: true };
        setMessages((current) => current.map((m) => (m.id === localId ? { ...m, pending: false, failure } : m)));
      } finally {
        setSending(false);
      }
    },
    [onConversationChanged],
  );

  const send = useCallback(
    (text: string, attachments: UploadView[]) => {
      const localId = `local_${Date.now()}`;
      const optimistic: UiMessage = {
        id: localId,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
        attachments,
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);
      void deliver(localId, text, attachments);
    },
    [deliver],
  );

  const retry = useCallback(
    (message: UiMessage) => {
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, pending: true, failure: undefined } : m)));
      void deliver(message.id, message.text, message.attachments ?? []);
    },
    [deliver],
  );

  const discard = useCallback((message: UiMessage) => {
    setMessages((current) => current.filter((m) => m.id !== message.id));
  }, []);

  const resolveOperation = useCallback(
    async (operationId: string, action: 'confirm' | 'cancel') => {
      setOperationStates((s) => ({ ...s, [operationId]: { busy: action } }));
      try {
        const result =
          action === 'confirm' ? await api.confirmOperation(operationId) : await api.cancelOperation(operationId);
        setMessages((current) => [
          ...current.map((m) => withOperation(m, result.operation)),
          result.message,
        ]);
        setOperationStates((s) => ({ ...s, [operationId]: {} }));
        onConversationChanged();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Action impossible.';
        setOperationStates((s) => ({ ...s, [operationId]: { error: message } }));
        // L'état a pu changer côté serveur (déjà annulée, déjà en cours...) : on le relit.
        const id = conversationRef.current;
        if (id) {
          api
            .getConversation(id)
            .then((conversation) => {
              const fresh = conversation.messages.flatMap((m) => operationsOf(m)).find((op) => op.id === operationId);
              if (fresh) setMessages((current) => current.map((m) => withOperation(m, fresh)));
            })
            .catch(() => undefined);
        }
      }
    },
    [onConversationChanged],
  );

  return {
    conversationId,
    messages,
    sending,
    loading,
    loadError,
    operationStates,
    send,
    retry,
    discard,
    open,
    reset,
    confirmOperation: (id: string) => resolveOperation(id, 'confirm'),
    cancelOperation: (id: string) => resolveOperation(id, 'cancel'),
  };
}

function operationsOf(message: ChatMessage): OperationView[] {
  return (message.blocks ?? []).flatMap((b) => (b.type === 'operation' ? [b.operation] : []));
}

function withOperation(message: UiMessage, operation: OperationView): UiMessage {
  if (!message.blocks?.some((b) => b.type === 'operation' && b.operation.id === operation.id)) return message;
  return {
    ...message,
    blocks: message.blocks.map(
      (b): MessageBlock => (b.type === 'operation' && b.operation.id === operation.id ? { ...b, operation } : b),
    ),
  };
}
