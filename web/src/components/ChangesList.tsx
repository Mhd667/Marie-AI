import type { ChangeEntry } from '../../../shared/types';
import { formatDateTime } from '../lib/format';

export function ChangesList({ changes }: { changes: ChangeEntry[] }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>Historique des modifications</h3>
      </header>
      {changes.length === 0 ? (
        <p className="card-empty">Aucune modification enregistrée pour le moment.</p>
      ) : (
        <ol className="changes">
          {changes.map((change) => (
            <li key={change.id}>
              <p className="change-summary">{change.summary}</p>
              {change.changes.length > 0 && change.kind !== 'create' && (
                <p className="muted small">
                  {change.changes.map((c) => `${c.label} : ${c.before ?? '—'} → ${c.after ?? '—'}`).join(' · ')}
                </p>
              )}
              <time className="muted small" dateTime={change.at}>
                {formatDateTime(change.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
