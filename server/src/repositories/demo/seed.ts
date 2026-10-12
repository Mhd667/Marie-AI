import type { Product } from '../../../../shared/types.js';

/**
 * Données FICTIVES servant uniquement à la démonstration.
 * Elles ne reflètent pas le catalogue réel de la boutique.
 * Les identifiants sont fixes pour rester stables d'un redémarrage à l'autre.
 */
const SEED: Array<Omit<Product, 'createdAt' | 'updatedAt' | 'version' | 'images'>> = [
  {
    id: 'prd_demo0001',
    name: 'Perruque Lace Front Body Wave 22"',
    description: 'Cheveux humains, densité 180 %, lace HD transparente.',
    priceFcfa: 185000,
    stock: 4,
    category: 'Perruques',
    status: 'published',
  },
  {
    id: 'prd_demo0002',
    name: 'Perruque Bob Lisse 12"',
    description: 'Coupe carré plongeant, prête à porter, fermeture 4x4.',
    priceFcfa: 95000,
    stock: 0,
    category: 'Perruques',
    status: 'published',
  },
  {
    id: 'prd_demo0003',
    name: 'Mèches Brésiliennes Deep Wave (lot de 3)',
    description: 'Lot de 3 tissages 18", 20", 22".',
    priceFcfa: 120000,
    stock: 7,
    category: 'Mèches',
    status: 'published',
  },
  {
    id: 'prd_demo0004',
    name: 'Rouge à lèvres mat Velours — Rubis',
    description: 'Tenue longue durée, fini mat poudré.',
    priceFcfa: 7500,
    stock: 18,
    category: 'Maquillage',
    status: 'published',
  },
  {
    id: 'prd_demo0005',
    name: 'Rouge à lèvres mat Velours — Nude Caramel',
    description: 'Tenue longue durée, fini mat poudré.',
    priceFcfa: 7500,
    stock: 2,
    category: 'Maquillage',
    status: 'published',
  },
  {
    id: 'prd_demo0006',
    name: 'Fond de teint Glow Skin',
    description: 'Couvrance moyenne modulable, teintes ébène à caramel.',
    priceFcfa: 14500,
    stock: 11,
    category: 'Maquillage',
    status: 'published',
  },
  {
    id: 'prd_demo0007',
    name: 'Huile capillaire Ricin & Karité',
    description: 'Fortifie et nourrit les cheveux et le cuir chevelu. Flacon 100 ml.',
    priceFcfa: 6000,
    stock: 0,
    category: 'Soins',
    status: 'published',
  },
  {
    id: 'prd_demo0008',
    name: 'Beurre corporel Karité Vanille',
    description: 'Pot de 250 ml, karité brut du Burkina Faso.',
    priceFcfa: 8500,
    stock: 23,
    category: 'Soins',
    status: 'published',
  },
  {
    id: 'prd_demo0009',
    name: 'Créoles dorées Glam',
    description: 'Acier inoxydable doré à l’or fin, diamètre 5 cm.',
    priceFcfa: 12000,
    stock: 9,
    category: 'Bijoux',
    status: 'published',
  },
  {
    id: 'prd_demo0010',
    name: 'Sac à main Marie — Noir',
    description: 'Similicuir grainé, bandoulière amovible.',
    priceFcfa: 32000,
    stock: 3,
    category: 'Accessoires',
    status: 'published',
  },
  {
    id: 'prd_demo0011',
    name: 'Faux cils Mink Drama',
    description: 'Réutilisables jusqu’à 15 fois.',
    priceFcfa: 4500,
    stock: 30,
    category: 'Maquillage',
    status: 'draft',
  },
];

export function buildDemoCatalog(): Product[] {
  const createdAt = new Date('2026-01-15T09:00:00.000Z').toISOString();
  return SEED.map((product) => ({
    ...product,
    images: [],
    createdAt,
    updatedAt: createdAt,
    version: 1,
  }));
}
