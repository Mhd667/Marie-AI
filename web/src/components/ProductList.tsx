import { useState } from 'react';
import type { Product } from '../../../shared/types';
import { formatFcfa } from '../lib/format';
import { ProductThumb } from './ProductThumb';

const COLLAPSED = 4;

export function ProductList({ title, products }: { title?: string; products: Product[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? products : products.slice(0, COLLAPSED);

  return (
    <section className="card">
      {title && (
        <header className="card-header">
          <h3>{title}</h3>
          <span className="muted">{products.length}</span>
        </header>
      )}
      {products.length === 0 ? (
        <p className="card-empty">Aucun produit.</p>
      ) : (
        <ul className="product-list">
          {visible.map((product) => (
            <li key={product.id} className="product-row">
              <ProductThumb product={product} />
              <div className="product-main">
                <p className="product-name">{product.name}</p>
                <p className="product-meta">
                  {product.category}
                  {product.status === 'draft' && <span className="tag">Brouillon</span>}
                  {product.images.length > 0 && (
                    <span className="muted"> · {product.images.length} photo{product.images.length > 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>
              <div className="product-side">
                <p className="product-price">{formatFcfa(product.priceFcfa)}</p>
                <StockBadge stock={product.stock} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {products.length > COLLAPSED && (
        <button type="button" className="card-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Réduire' : `Voir les ${products.length - COLLAPSED} autres`}
        </button>
      )}
    </section>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <span className="stock stock-out">Rupture</span>;
  if (stock <= 3) return <span className="stock stock-low">{stock} en stock</span>;
  return <span className="stock">{stock} en stock</span>;
}
