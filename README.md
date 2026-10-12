# Marie Glam Assistant

Application web indépendante, pensée d'abord pour le mobile, qui permet à la propriétaire de Marie Glam de gérer son catalogue en discutant avec une assistante IA (Groq).

> **Mode démonstration.** Cette première version travaille sur un **catalogue fictif** stocké localement par le serveur de l'assistante. Elle **n'est pas reliée à la boutique en ligne** : rien de ce qui est modifié ici n'apparaît sur le storefront. Le point de branchement vers la future base partagée est décrit plus bas.

La boutique publique (projet React + Vite séparé) n'est ni modifiée ni fusionnée avec ce projet.

---

## Démarrage rapide

Prérequis : **Node.js 20.12 ou plus récent** (testé avec Node 22) et npm.

```bash
# 1. Installer les dépendances (serveur + interface)
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env
#    puis ouvrir .env et renseigner GROQ_API_KEY

# 3. Lancer en développement (API + interface)
npm run dev
```

- Interface : <http://localhost:5173>
- API : <http://localhost:8787> (Vite relaie automatiquement `/api` et `/media` vers l'API)

Sur téléphone, sur le même réseau Wi-Fi : `npm run dev --workspace web -- --host`, puis ouvrir `http://<IP-de-l-ordinateur>:5173`.

### Production

```bash
npm run build   # compile le serveur (server/dist) et l'interface (web/dist)
npm start       # un seul serveur Node sert l'API ET l'interface sur http://localhost:8787
```

### Autres commandes

| Commande | Rôle |
| --- | --- |
| `npm run typecheck` | Vérification TypeScript du serveur (y compris les tests) et de l'interface |
| `npm test` | Tests de bout en bout de l'API, avec un modèle IA simulé |
| `npm run reset-demo` | Remet à zéro le catalogue de démo, les conversations, les opérations et les photos |

## Variables d'environnement

À placer dans `.env` à la racine (lu **uniquement** par le serveur, jamais envoyé au navigateur) :

| Variable | Défaut | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | — | **Obligatoire** pour que l'assistante réponde. Clé créée sur <https://console.groq.com/keys>. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Modèle Groq ; il doit prendre en charge l'appel d'outils. |
| `PORT` | `8787` | Port du serveur. |
| `CATALOG_ADAPTER` | `demo` | `demo` = catalogue fictif local. `shared` = future base partagée (pas encore implémentée : le serveur refuse de démarrer). |
| `DATA_DIR` | `./data` (dans `server/`) | Dossier des données locales : catalogue de démo, conversations, opérations, photos. |

Sans `GROQ_API_KEY`, l'application démarre quand même : l'interface affiche que l'assistante n'est pas configurée et le serveur répond par une erreur explicite.

Le fichier `.env` est exclu de git (`.gitignore`). Ne jamais mettre la clé dans le code de `web/` : tout ce qui est dans `web/` finit dans le navigateur.

---

## Ce que l'assistante sait faire

- lister et rechercher les produits (nom, catégorie, statut, disponibilité) ;
- ajouter un produit ;
- modifier le nom, la description, le prix, la catégorie et le statut de publication ;
- ajouter, remplacer ou supprimer des photos ;
- augmenter, diminuer ou corriger le stock ;
- lister les ruptures et les stocks faibles (≤ 3 exemplaires) ;
- résumer le catalogue ;
- montrer l'historique des modifications.

Chaque produit a un identifiant stable (`prd_…`), un nom, une description, un prix entier en FCFA, une quantité en stock (un produit peut exister en plusieurs exemplaires), une catégorie, des images et un statut (publié / brouillon).

## Comment l'IA est encadrée

L'IA ne touche jamais directement aux données. Elle dispose d'outils structurés, et le serveur décide :

1. **Lecture** (`searchProducts`, `getProduct`, `listStockAlerts`, `getCatalogSummary`, `getChangeHistory`) : exécutée immédiatement.
2. **Écriture** (`createProduct`, `updateProduct`, `adjustStock`, `manageProductImages`) : le serveur **valide** l'entrée (schémas zod : prix entier > 0, stock entier ≥ 0, identifiants au bon format, produit existant, retrait ≤ stock, photos réellement reçues…) puis **prépare un aperçu**. Rien n'est écrit.
3. L'aperçu s'affiche dans le chat avec les valeurs avant → après et des avertissements (produit homonyme, publication sans photo, rupture…).
4. La propriétaire clique **Confirmer** (une réponse « oui » dans le chat ne suffit pas).
5. Le serveur réexécute les contrôles, vérifie que le produit **n'a pas changé depuis l'aperçu** (numéro de version), puis écrit le produit et son entrée d'historique.
6. Le message « C'est enregistré » est rédigé **par le serveur à partir du résultat réel**, pas par l'IA. En cas d'échec, l'erreur est affichée et rien n'est modifié.

Une opération ne peut s'exécuter qu'**une seule fois** : son état (`pending → executing → executed / failed / cancelled`) est persisté avant toute écriture, un double clic ou deux onglets ne la rejouent pas.

Si une valeur manque (prix, quantité…) ou si plusieurs produits correspondent, l'IA a pour consigne de poser la question ; et même si elle ne le faisait pas, le serveur refuse les valeurs absentes ou invalides.

## Photos

1. Une photo jointe dans le chat est **envoyée immédiatement au serveur** et écrite sur disque dans une zone d'attente (`DATA_DIR/media/staging`). Le format est vérifié sur le contenu du fichier (JPEG, PNG, WebP, GIF ; 8 Mo max., 10 par message).
2. L'IA reçoit l'identifiant de la photo et propose de créer un produit ou de l'associer à un produit existant.
3. La photo ne devient une image du produit (`DATA_DIR/media/images`) **qu'à la confirmation**, et le produit n'est mis à jour qu'après la réussite de ce stockage.

Remarque : l'IA ne « voit » pas le contenu des photos dans cette version (elle ne connaît que leur nom de fichier).

---

## Architecture

```
marie-glam-assistant/
├── shared/types.ts                 Types communs serveur ↔ interface (aucune logique)
├── server/                         Node.js + TypeScript + Express
│   ├── src/
│   │   ├── index.ts                Démarrage
│   │   ├── config.ts               Lecture de .env
│   │   ├── container.ts            Assemblage des couches (choix des adaptateurs)
│   │   ├── http/app.ts             Routes HTTP (/api, /media) et gestion d'erreurs
│   │   ├── ai/                     Groq : client, outils, prompt système, orchestration
│   │   ├── services/               Logique métier
│   │   │   ├── CatalogService.ts   Lectures (recherche, résumé, ruptures, historique)
│   │   │   ├── OperationService.ts Préparation / confirmation / exécution des écritures
│   │   │   └── ChatService.ts      Conversation ↔ assistante ↔ opérations
│   │   ├── domain/                 Validation (zod) et erreurs métier
│   │   ├── repositories/
│   │   │   ├── ProductRepository.ts            Interface d'accès aux données
│   │   │   ├── demo/DemoProductRepository.ts   ADAPTATEUR DE DÉMONSTRATION (fichier JSON local)
│   │   │   └── shared/SharedDatabaseProductRepository.ts  Point de branchement futur
│   │   ├── storage/                Stockage d'images interchangeable (ImageStorage + disque local)
│   │   └── conversations/          Historique des conversations
│   └── test/flow.test.ts           Tests de bout en bout avec modèle simulé
└── web/                            React + Vite + TypeScript
    └── src/
        ├── api/client.ts           Couche API (seul endroit qui appelle le serveur)
        ├── hooks/                  État du chat, pièces jointes, historique
        └── components/             Interface (chat, cartes produits, aperçus, historique)
```

API HTTP : `GET /api/health`, `GET /api/conversations`, `GET|DELETE /api/conversations/:id`, `POST /api/chat`, `POST /api/uploads`, `POST /api/operations/:id/confirm`, `POST /api/operations/:id/cancel`.

### Brancher la base partagée avec la boutique (étape suivante)

Rien n'est synchronisé aujourd'hui. Pour relier l'assistante aux vraies données :

1. Choisir la base commune utilisée aussi par le storefront (par ex. PostgreSQL / Supabase).
2. Implémenter `server/src/repositories/shared/SharedDatabaseProductRepository.ts` en respectant le contrat de `ProductRepository` (identifiants stables, contrôle de version `UPDATE … WHERE id = $1 AND version = $2`, produit + historique dans une même transaction).
3. Remplacer `LocalDiskImageStorage` par un stockage objet public (S3, Cloudinary, Supabase Storage…) en implémentant `ImageStorage` : les images locales ne sont pas accessibles depuis la boutique.
4. Démarrer avec `CATALOG_ADAPTER=shared`. Le bandeau « Mode démo » disparaît automatiquement quand l'adaptateur déclare `isDemo: false`.
5. Ajouter une authentification avant toute mise en ligne (voir limites).

## Limites connues de cette version

- **Pas d'authentification** : à n'exposer que sur un réseau de confiance tant qu'un login n'est pas ajouté.
- Catalogue, conversations et opérations sont des fichiers JSON locaux (adaptés à une démo, pas à plusieurs serveurs).
- Les photos jointes mais jamais utilisées restent dans la zone d'attente (pas encore de nettoyage automatique).
- L'IA ne voit pas le contenu des photos.
- Pas d'intégration WhatsApp (Evolution API / Meta) dans cette étape.
