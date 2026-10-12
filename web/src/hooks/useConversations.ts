import { useCallback, useEffect, useState } from 'react';
import type { ConversationSummary, HealthResponse } from '../../../shared/types';
import { api } from '../api/client';

export function useConversations() {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listConversations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Historique indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteConversation(id);
    setItems((current) => current.filter((c) => c.id !== id));
  }, []);

  return { items, loading, error, refresh, remove };
}

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setUnreachable(false);
      })
      .catch(() => setUnreachable(true));
  }, []);

  return { health, unreachable };
}
