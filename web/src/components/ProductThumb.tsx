import type { Product } from '../../../shared/types';

export function ProductThumb({ product, size = 56 }: { product: Product; size?: number }) {
  const image = product.images[0];
  const initials = product.name
    .split(/\s+/)
    .filter((w) => w.length > 2 && /^[A-Za-zÀ-ÿ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {image ? <img src={image.url} alt={image.alt ?? product.name} loading="lazy" /> : <span>{initials}</span>}
    </div>
  );
}
