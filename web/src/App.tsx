import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Composer } from './components/Composer';
import { EmptyState } from './components/EmptyState';
import { HistorySheet } from './components/HistorySheet';
import { IconAlert, IconClock, IconEdit } from './components/Icons';
import { MessageView, TypingIndicator } from './components/MessageView';
import { useChat } from './hooks/useChat';
import { useConversations, useHealth } from './hooks/useConversations';

export function App() {
  const conversations = useConversations();
  const { health, unreachable } = useHealth();
  const chat = useChat(conversations.refresh);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void conversations.refresh();
  }, [conversations.refresh]);

  // Défilement automatique vers le dernier message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: chat.messages.length > 2 ? 'smooth' : 'auto' });
  }, [chat.messages.length, chat.sending]);

  const openConversation = useCallback(
    (id: string) => {
      setHistoryOpen(false);
      void chat.open(id);
    },
    [chat.open],
  );

  const newConversation = useCallback(() => {
    setHistoryOpen(false);
    chat.reset();
  }, [chat.reset]);

  const isEmpty = chat.messages.length === 0 && !chat.loading && !chat.loadError;
  const adapter = health?.catalogAdapter;

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setHistoryOpen(true)} aria-label="Historique des conversations">
          <IconClock />
        </button>
        <div className="brand">
          <span className="brand-name">Marie Glam</span>
          {adapter?.isDemo ? (
            <span className="brand-badge" title={adapter.label}>
              Mode démo · non synchronisé
            </span>
          ) : (
            <span className="brand-sub">Assistante catalogue</span>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={newConversation} aria-label="Nouvelle conversation">
          <IconEdit />
        </button>
      </header>

      <main className="thread" ref={scroller}>
        <div className="thread-inner">
          {unreachable && (
            <p className="notice notice-error">
              <IconAlert width={16} height={16} /> Le serveur de l’assistante est injoignable. Vérifiez qu’il est lancé.
            </p>
          )}
          {isEmpty && <EmptyState health={health} onPick={(text) => chat.send(text, [])} />}
          {chat.loading && (
            <div className="skeletons" aria-label="Chargement de la conversation">
              <div className="skeleton skeleton-right" />
              <div className="skeleton" />
              <div className="skeleton skeleton-short" />
            </div>
          )}
          {chat.loadError && (
            <p className="notice notice-error">
              <IconAlert width={16} height={16} /> {chat.loadError}
            </p>
          )}
          {chat.messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              operationStates={chat.operationStates}
              onConfirm={chat.confirmOperation}
              onCancel={chat.cancelOperation}
              onRetry={chat.retry}
              onDiscard={chat.discard}
            />
          ))}
          {chat.sending && <TypingIndicator />}
        </div>
      </main>

      <div className="composer-dock">
        <Composer disabled={chat.sending || chat.loading} onSend={chat.send} />
        <p className="composer-footnote">Aucune modification n’est enregistrée sans votre confirmation.</p>
      </div>

      <HistorySheet
        open={historyOpen}
        items={conversations.items}
        loading={conversations.loading}
        error={conversations.error}
        activeId={chat.conversationId}
        onClose={() => setHistoryOpen(false)}
        onSelect={openConversation}
        onNew={newConversation}
        onDelete={(id) => {
          void conversations.remove(id).then(() => {
            if (id === chat.conversationId) chat.reset();
          });
        }}
      />
    </div>
  );
}
