import type { CatalogSummary } from '../../../shared/types';
import { formatFcfa } from '../lib/format';

export function SummaryCard({ summary }: { summary: CatalogSummary }) {
  const figures = [
    { label: 'Produits', value: summary.totalProducts, hint: `${summary.publishedProducts} publié${summary.publishedProducts > 1 ? 's' : ''} · ${summary.draftProducts} brouillon${summary.draftProducts > 1 ? 's' : ''}` },
    { label: 'Exemplaires en stock', value: summary.totalUnits },
    { label: 'En rupture', value: summary.outOfStock, hint: `${summary.lowStock} en stock faible (≤ ${summary.lowStockThreshold})` },
  ];
  return (
    <section className="card">
      <header className="card-header">
        <h3>Résumé du catalogue</h3>
      </header>
      <div className="summary-figures">
        {figures.map((f) => (
          <div key={f.label}>
            <p className="figure">{f.value}</p>
            <p className="figure-label">{f.label}</p>
            {f.hint && <p className="muted small">{f.hint}</p>}
          </div>
        ))}
      </div>
      <p className="summary-value">
        Valeur du stock au prix de vente : <strong>{formatFcfa(summary.stockValueFcfa)}</strong>
      </p>
      <ul className="summary-categories">
        {summary.categories.map((c) => (
          <li key={c.name}>
            <span>{c.name}</span>
            <span className="muted">
              {c.products} produit{c.products > 1 ? 's' : ''} · {c.units} ex.
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
