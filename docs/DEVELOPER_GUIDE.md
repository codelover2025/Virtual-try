# Developer & Contributor Guide

> [!NOTE]
> Lumière is designed as a modular monorepo-ready web application with **zero mandatory backend dependencies**. The Next.js frontend can run completely standalone with full offline mock catalogues, on-device MediaPipe models, and WebGL rendering.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or higher (minimum `v18.18+`).
- **Package Manager**: `pnpm` (recommended, `v9+`) or `npm`.
- **Operating System**: Windows, macOS, or Linux.
- **Hardware**: Standard webcam or mobile camera supporting 720p @ 30 FPS.

---

## 2. Quick Start

### 2.1 Starting the Web Atelier

```bash
# 1. Navigate to the frontend workspace
cd frontend

# 2. Install project dependencies
pnpm install

# 3. Start Next.js development server
pnpm dev
```

*(On Windows, you can simply double-click [`run_web.bat`](file:///C:/Users/ankus/Downloads/Virtual-try/run_web.bat) in the root directory)*

Open your browser to: **`http://localhost:3000`**

### 2.2 Verifying Types & Production Build

```bash
cd frontend

# Run TypeScript static analysis
pnpm typecheck

# Build optimized production bundle
pnpm build

# Test production server locally
pnpm start
```

---

## 3. Adding New Products to the Catalogue

All jewellery pieces available in the studio and storefront are defined in [`frontend/src/features/try-on/fallback-catalogue.ts`](file:///C:/Users/ankus/Downloads/Virtual-try/frontend/src/features/try-on/fallback-catalogue.ts).

### 3.1 Adding a 2D PNG Overlay Piece (e.g. Necklace, Earring)

1. Save your transparent PNG image in `frontend/public/static/Image/<Category>/`.
   - **Resolution**: 800x800 to 1200x1200px.
   - **Alpha**: 32-bit RGBA with smooth anti-aliased transparency.
   - **Earrings**: Orient with hook/post at top center.
   - **Necklaces**: Natural hanging "U" shape with clasp at top center.
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

---

### 3.2 Adding a 3D Gemstone Ring

For procedural 3D rings, define a `RingConfig` specifying the gemstone color, shape, metal, and pavé accents:

```typescript
{
  id: 'prod-ring-006',
  slug: 'citrine-solitaire-band',
  name: 'Sunlight Citrine Solitaire',
  sku: 'VJ-RG-006',
  jewelleryKind: 'RINGS',
  priceCents: 2199900,
  currency: 'INR',
  description: 'Warm golden citrine stone cut with brilliant facets.',
  primaryImage: { url: '/static/Image/Ring/ring_citrine.png' },
  metadata: {
    ringConfig: {
      id: 'prod-ring-006',
      gemColor: '#F39C12',         // Golden Citrine Hex
      gemShape: 'round',           // 'round' | 'princess' | 'emerald' | 'pear'
      gemScale: 1.05,
      bandMetal: 'yellow',         // 'yellow' | 'white' | 'rose'
      bandThickness: 1.0,
      hasHalo: false,
      accentStones: true,
    },
  },
}
```

---

## 4. Key Studio Routes

| Path | Component | Purpose |
|---|---|---|
| **`/`** | [`frontend/src/app/page.tsx`](file:///C:/Users/ankus/Downloads/Virtual-try/frontend/src/app/page.tsx) | Luxury storefront hero, category spotlights, and interactive studio modal overlay. |
| **`/try-on`** | [`frontend/src/app/try-on/page.tsx`](file:///C:/Users/ankus/Downloads/Virtual-try/frontend/src/app/try-on/page.tsx) | Virtual Studio hub (defaults to Single-Piece mode). |
| **`/try-on/[productId]`** | [`frontend/src/app/try-on/[productId]/page.tsx`](file:///C:/Users/ankus/Downloads/Virtual-try/frontend/src/app/try-on/[productId]/page.tsx) | Single-piece try-on stage dedicated to a selected product. |
| **`/try-on/multi`** | [`frontend/src/app/try-on/multi/page.tsx`](file:///C:/Users/ankus/Downloads/Virtual-try/frontend/src/app/try-on/multi/page.tsx) | Dedicated Multi-Jewellery Studio with Active Fitting pills & necklace-only sliders. |

---

## 5. Troubleshooting & FAQ

#### Camera access denied or black screen
- Click the padlock or camera icon in your browser address bar and ensure camera permissions are set to **Allow**.
- Ensure no other application (Zoom, Teams, another browser window) is holding an exclusive hardware lock on your camera.

#### Localhost mobile testing
- Browsers require a **secure context (`https://` or `http://localhost`)** to access `navigator.mediaDevices.getUserMedia()`.
- To test on a smartphone on the local network, use an HTTPS reverse proxy (e.g. `mkcert` or `ngrok`).
