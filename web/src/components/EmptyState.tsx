import type { HealthResponse } from '../../../shared/types';
import { IconArrowRight } from './Icons';

const SUGGESTIONS = [
  'Fais-moi un résumé du catalogue',
  'Quels produits sont en rupture de stock ?',
  'Ajoute un nouveau produit',
  'Montre-moi les dernières modifications',
];

export function EmptyState({ health, onPick }: { health: HealthResponse | null; onPick: (text: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
  return (
    <div className="empty">
      <p className="empty-mark">MG</p>
      <h1>{greeting}.</h1>
      <p className="empty-sub">Que souhaitez-vous faire dans le catalogue aujourd’hui ?</p>
      {health && !health.ai.configured && (
        <p className="notice notice-error empty-notice">
          L’assistante n’est pas encore configurée : la clé GROQ_API_KEY manque côté serveur.
        </p>
      )}
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="suggestion" onClick={() => onPick(s)}>
            <span>{s}</span>
            <IconArrowRight width={16} height={16} />
          </button>
        ))}
      </div>
    </div>
  );
}
