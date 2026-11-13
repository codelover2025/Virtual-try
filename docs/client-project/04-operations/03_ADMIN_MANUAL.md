# CATALOGUE ADMINISTRATOR MANUAL

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Audience** | Staff maintaining the jewellery catalogue |
| **Sources** | `docs/DEVELOPER_GUIDE.md` §3, `DOCUMENTATION.md` §8, `server.py` |

## 1. Where the Catalogue Lives

| Store | Location | Used when |
|---|---|---|
| Backend master list | `PRODUCTS_MASTER` / `CATEGORIES` in `server.py` | API running (serves `/api/v1/products`) |
| Frontend fallback catalogue | `frontend/src/features/try-on/fallback-catalogue.ts` | API unreachable / standalone mode |
| Offline catalogue | `frontend/src/features/try-on/offline-catalog.ts` | Offline support |
| Product imagery | `static/Image/<Category>/` (served by API) **and** `frontend/public/static/Image/<Category>/` (frontend) | Everywhere |

> Keep the backend list and the frontend fallback in sync when adding products, so behaviour is identical online and offline.

## 2. Asset Specification (2D PNG overlays)

Per `docs/DEVELOPER_GUIDE.md` §3.1:
- Format: 32-bit RGBA transparent PNG, smooth anti-aliased alpha.
- Resolution: 800×800 to 1200×1200 px.
- **Earrings**: oriented with hook/post at top center.
- **Necklaces**: natural hanging "U" shape, clasp at top center.
- Placement: `frontend/public/static/Image/<Category>/` (e.g. `Necklace/necklace_new.png`).

## 3. Adding a 2D Piece (Necklace / Earring)

1. Drop the PNG in the category folder (both image roots if backend is used).
2. Add an entry to `FALLBACK_CATALOGUE` in `fallback-catalogue.ts`:

```typescript
{
 id: 'vj-neck-010',
 slug: 'emerald-royal-choker',
 name: 'Emerald Royal Choker',
 sku: 'VJ-NK-010',
 jewelleryKind: 'NECKLACE',
 priceCents: 4999900,
 currency: 'INR',
 description: 'Handcrafted bridal emerald choker framed in 22kt yellow gold.',
 primaryImage: { url: '/static/Image/Necklace/necklace_new.png' },
 tryOnAsset: {
 id: 'asset-neck-010',
 assetType: 'IMAGE_OVERLAY',
 assetUrl: '/static/Image/Necklace/necklace_new.png',
 renderScale: 1.0,
 renderOffsetY: 0,
 },
}
```

3. For the backend, mirror the entry in `PRODUCTS_MASTER` (`server.py`) with the matching `anchorProfile`:
 - Necklaces: `{"anchorType": "SUPRASTERNAL_NOTCH"}`
 - Earrings: `{"anchorType": "EAR_LOBE", "earSide": "BOTH"}` + `"mirrorForOppositeEar": True`
 - Bangles: `{"anchorType": "WRIST"}`
 - Rings: `{"anchorType": "FINGER_BASE", "fingerIndex": 3}`

## 4. Adding a 3D Gemstone Ring

Rings render procedurally in Three.js — no 3D model file needed. Provide a `ringConfig` in product `metadata`:

```typescript
metadata: {
 ringConfig: {
 id: 'prod-ring-006',
 gemColor: '#F39C12', // any hex; diamonds vs colored stones handled automatically
 gemShape: 'round', // 'round' | 'princess' | 'emerald' | 'pear'
 gemScale: 1.05,
 bandMetal: 'yellow', // 'yellow' | 'white' | 'rose'
 bandThickness: 1.0,
 hasHalo: false,
 accentStones: true,
 },
}
```

Existing reference SKUs (`server.py`): round diamond `#FFFFFF`, princess ruby `#E0115F`, halo sapphire `#1E6FD9`, emerald-cut `#2ECC71`, pear amethyst `#9B59B6`.

For 3D bangles, supply the analogous `bangleConfig` (metal/finish); wrist anchoring and two-pass shading are automatic.

## 5. Publishing Checklist

| # | Step | Verify |
|---|---|---|
| 1 | Asset files added to both image roots | File exists, transparent background, size spec met |
| 2 | Catalogue entries added (fallback + backend) | IDs/slugs/SKUs unique and matching |
| 3 | `pnpm typecheck` in `frontend/` | 0 errors |
| 4 | Restart/refresh | New piece listed on `/products` and selectable in `/try-on` |
| 5 | Try-on smoke test | Anchors correctly (earlobe / neckline / finger / wrist); swap is instant |
| 6 | Adjust `renderScale` / `renderOffsetY` (2D) or `gemScale`/`bandThickness` (3D) if fit looks off | Defaults (1.0 / 0) suit spec-compliant assets |

## 6. Settings & Service Health

| Item | Where | Notes |
|---|---|---|
| Public settings | `GET /api/v1/settings/public` | `guestTryOnEnabled`, `brandName`, `supportEmail` (edit in `server.py`) |
| Service health | `GET /` on API | Returns `status: "online"` and `productsCount` |
| Captures | `captures/` folder | Snapshots saved by the studio; served at `/captures/<key>.jpg` |
| API reference | `/api/docs` (Swagger) | Full request/response schemas |
