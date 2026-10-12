import type { OperationView } from '../../../shared/types';
import type { OperationUiState } from '../hooks/useChat';
import { IconAlert, IconCheck } from './Icons';

interface Props {
  operation: OperationView;
  state?: OperationUiState;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}

/** Aperçu d'une modification préparée par l'assistante. Rien n'est écrit avant « Confirmer ». */
export function OperationCard({ operation, state, onConfirm, onCancel }: Props) {
  const { preview, status } = operation;
  const busy = state?.busy;
  const isPending = status === 'pending';
  const isNew = preview.changes.every((c) => c.before === undefined);

  return (
    <section className={`card operation operation-${status}`} aria-live="polite">
      <header className="card-header">
        <div>
          <p className="eyebrow">{preview.title}</p>
          <h3>{preview.productName}</h3>
        </div>
        <StatusPill status={status} />
      </header>

      {preview.changes.length > 0 && (
        <dl className={`diff ${isNew ? 'diff-new' : ''}`}>
          {preview.changes.map((change) => (
            <div key={change.field} className="diff-row">
              <dt>{change.label}</dt>
              <dd>
                {change.before !== undefined && (
                  <>
                    <span className="diff-before">{change.before}</span>
                    <span className="diff-arrow" aria-label="devient">→</span>
                  </>
                )}
                <span className="diff-after">{change.after ?? '—'}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(preview.imagesAdded.length > 0 || preview.imagesRemoved.length > 0) && (
        <div className="diff-images">
          {preview.imagesAdded.length > 0 && <ImageStrip label="Photos ajoutées" images={preview.imagesAdded} />}
          {preview.imagesRemoved.length > 0 && (
            <ImageStrip label="Photos retirées" images={preview.imagesRemoved} removed />
          )}
        </div>
      )}

      {preview.warnings.length > 0 && isPending && (
        <ul className="warnings">
          {preview.warnings.map((warning) => (
            <li key={warning}>
              <IconAlert width={16} height={16} />
              {warning}
            </li>
          ))}
        </ul>
      )}

      {status === 'failed' && operation.error && <p className="operation-error">{operation.error}</p>}
      {state?.error && <p className="operation-error">{state.error}</p>}

      {isPending && (
        <footer className="operation-actions">
          <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => onCancel(operation.id)}>
            {busy === 'cancel' ? 'Annulation…' : 'Annuler'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(busy)}
            onClick={() => onConfirm(operation.id)}
          >
            {busy === 'confirm' ? <span className="spinner" aria-label="Enregistrement en cours" /> : 'Confirmer'}
          </button>
        </footer>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: OperationView['status'] }) {
  switch (status) {
    case 'pending':
      return <span className="pill pill-pending">À confirmer</span>;
    case 'executing':
      return <span className="pill">En cours…</span>;
    case 'executed':
      return (
        <span className="pill pill-done">
          <IconCheck width={14} height={14} /> Enregistré
        </span>
      );
    case 'cancelled':
      return <span className="pill pill-muted">Annulé</span>;
    case 'failed':
      return <span className="pill pill-error">Échec</span>;
  }
}

function ImageStrip({ label, images, removed }: { label: string; images: OperationView['preview']['imagesAdded']; removed?: boolean }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className={`image-strip ${removed ? 'image-strip-removed' : ''}`}>
        {images.map((image) => (
          <img key={image.id} src={image.url} alt={image.alt ?? ''} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
