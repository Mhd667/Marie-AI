import { useEffect } from 'react';
import type { ConversationSummary } from '../../../shared/types';
import { formatRelative } from '../lib/format';
import { IconClose, IconEdit, IconTrash } from './Icons';

interface Props {
  open: boolean;
  items: ConversationSummary[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/** Historique des conversations, en panneau superposé (pas de navigation permanente). */
export function HistorySheet({ open, items, loading, error, activeId, onClose, onSelect, onNew, onDelete }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`sheet-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="sheet-backdrop" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="Historique des conversations">
        <header className="sheet-header">
          <h2>Conversations</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <IconClose />
          </button>
        </header>
        <button type="button" className="sheet-new" onClick={onNew}>
          <IconEdit width={18} height={18} /> Nouvelle conversation
        </button>
        <div className="sheet-list">
          {loading && items.length === 0 && <p className="muted sheet-empty">Chargement…</p>}
          {error && <p className="sheet-empty error-text">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="muted sheet-empty">Vos conversations apparaîtront ici.</p>
          )}
          <ul>
            {items.map((c) => (
              <li key={c.id} className={c.id === activeId ? 'is-active' : ''}>
                <button type="button" className="sheet-item" onClick={() => onSelect(c.id)}>
                  <span className="sheet-title">{c.title}</span>
                  <span className="muted small">{formatRelative(c.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn sheet-delete"
                  aria-label={`Supprimer « ${c.title} »`}
                  onClick={() => {
                    if (window.confirm('Supprimer cette conversation de l’historique ? Les modifications du catalogue ne sont pas annulées.')) {
                      onDelete(c.id);
                    }
                  }}
                >
                  <IconTrash width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
