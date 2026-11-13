# DATA MODEL

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Sources** | `server.py` (stores & DTOs), `frontend/src/types/catalog.ts`, `frontend/src/features/try-on/fallback-catalogue.ts` |

## 1. Persistence Model

The system has **no database by design**:
- Backend holds catalogue in module constants (`CATEGORIES`, `PRODUCTS_MASTER`), sessions in memory (`SESSIONS` dict), captures in a list (`CAPTURES`) plus JPEG files on disk under `captures/`.
- Frontend state lives in Zustand stores (`try-on-store.ts`, `studio-store.ts`, `auth-store.ts`, `catalog-filters-store.ts`) and the browser asset cache (`lib/asset-cache.ts`).

## 2. Entity Diagram (logical)

```mermaid
erDiagram
 CATEGORY ||--o{ PRODUCT : "categorises"
 PRODUCT ||--o| TRY_ON_ASSET : "has"
 PRODUCT ||--o| RING_CONFIG : "optional metadata"
 TRY_ON_SESSION }o--|| PRODUCT : "targets"
 TRY_ON_SESSION ||--o{ CAPTURE : "contains"
 USER ||--o{ TRY_ON_SESSION : "owns (demo stub)"

 CATEGORY {
 string id "cat-necklaces"
 string name
 string slug
 string parentId "null"
 string description
 int sortOrder
 bool isActive
 }
 PRODUCT {
 string id "prod-neck-001"
 string sku "VJ-NECK-001"
 string name
 string slug
 string jewelleryKind "NECKLACE|EARRINGS|RINGS|BANGLES"
 string status "PUBLISHED"
 string categoryId FK
 string image "/static/Image/..."
 string description
 int priceCents
 string currency "INR"
 }
 TRY_ON_ASSET {
 string id "asset-<productId>"
 string assetType "IMAGE_OVERLAY"
 string url
 object anchorProfile
 float defaultScale
 float defaultRotationZ
 bool mirrorForOppositeEar
 int fingerIndex
 bool isActive
 }
 RING_CONFIG {
 string id
 string gemColor "hex"
 string gemShape "round|princess|emerald|pear"
 float gemScale
 string bandMetal "yellow|white|rose"
 float bandThickness
 bool hasHalo
 string haloColor
 bool accentStones
 }
 TRY_ON_SESSION {
 string sessionId "sess_<12hex> PK"
 string productId FK
 string jewelleryKind
 object asset
 string status "ACTIVE|patched"
 datetime createdAt
 float lastHeartbeat
 }
 CAPTURE {
 string id "cap_<8hex> PK"
 string sessionId FK
 string status "READY"
 string url "/captures/<storageKey>.jpg"
 string thumbUrl
 datetime createdAt
 }
```

## 3. Anchor Profile Vocabulary (in use in `PRODUCTS_MASTER`)

| jewelleryKind | anchorProfile | Extra fields |
|---|---|---|
| NECKLACE | `{anchorType: "SUPRASTERNAL_NOTCH"}` | — |
| EARRINGS | `{anchorType: "EAR_LOBE", earSide: "BOTH"}` | `mirrorForOppositeEar: true` |
| RINGS | `{anchorType: "FINGER_BASE", fingerIndex: 3}` | `metadata.ringConfig` present |
| BANGLES | `{anchorType: "WRIST"}` | — |

## 4. Catalogue Inventory (as shipped)

| Category | Count | Image assets |
|---|---|---|
| Necklaces | 4 | `static/Image/Necklace/necklace_{1,20,24,28}.png` |
| Earrings | 5 | `static/Image/Earring/earring_{1..5}.png` |
| Rings | 5 | `static/Image/Ring/ring_{1..5}.png` (+ 3D `ringConfig` each) |
| Bangles | 4 | `static/Image/Bangle/bangle_{1..4}.png` |
| **Total products** | **17** | Mirrored under `frontend/public/static/Image/` |

Additional SVG catalogue icons exist under `frontend/public/assets/` (necklace, earring, ring, bangle, nosering variants); nose-ring SVGs are present in the asset set even though no nose-ring products are in the shipped catalogue.

## 5. Frontend Catalogue Types
Typed contracts in `frontend/src/types/catalog.ts` / `try-on.ts`, consumed by `frontend/src/api-client/services.ts`; the offline mirror in `fallback-catalogue.ts` uses the same shape (`tryOnAsset.renderScale`, `renderOffsetY` per `DEVELOPER_GUIDE.md` §3.1).
