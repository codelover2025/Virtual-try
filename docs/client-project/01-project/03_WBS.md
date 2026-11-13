# WORK BREAKDOWN STRUCTURE (WBS)

| | |
|---|---|
| **Project** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Basis** | Repository module structure and commit history |

The WBS decomposes the delivered scope into work packages, each mapped to the implementing repository area so status is verifiable.

## 1. WBS Decomposition

| WBS | Work Package | Deliverable / Evidence in Repo | Status |
|---|---|---|---|
| **1.0** | **Lumière Virtual Try-On** | Whole repository | Done |
| 1.1 | Project setup & tooling | Next.js 15 + TypeScript strict, pnpm, Tailwind; `run_web.bat`; `requirements.txt` | Done |
| **1.2** | **AR Engine core** (`frontend/src/ar-engine/`) | | Done |
| 1.2.1 | Camera engine | `camera/` — 720p@30 constraint ladders, device switch, health watchdog | Done |
| 1.2.2 | Vision detectors | `detectors/` — Face, Pose, Hand MediaPipe wrappers; persistent `cachedDetectors` | Done |
| 1.2.3 | Landmark processing & smoothing | `landmarks/`, `tracking/` — temporal smoothing, spring interpolation | Done |
| 1.2.4 | Anatomical pose fitting | `fitting/pose-fitter.ts` — earring/necklace/ring/bangle anchor profiles | Done |
| 1.2.5 | Adaptive performance controller | `performance/` — frame budgeting, detection-rate scaling | Done |
| 1.2.6 | Canvas2D overlay renderer | `renderers/canvas2d-renderer.ts` — multi-overlay, depth sort, catenary drape | Done |
| 1.2.7 | Three.js WebGL 3D renderer | `renderers/three-renderer.ts` — PBR gems, two-pass bangles, occluders | Done |
| 1.2.8 | Capture subsystem | `capture/` — high-resolution composited snapshots | Done |
| 1.2.9 | Anchors & imaging utilities | `anchors/`, `imaging/`, `utils/`, `models/`, `opencv/` | Done |
| **1.3** | **Try-On Studio UI** (`frontend/src/features/try-on/`, `components/try-on/`) | | Done |
| 1.3.1 | Single-Piece Studio | `/try-on`, `/try-on/[productId]`; universal Fine-Tune sliders | Done |
| 1.3.2 | Multi-Jewellery Studio | `/try-on/multi`; Active Fitting bar; necklace-only sliders (commit `52950ef`) | Done |
| 1.3.3 | Automatic cross-category transfer | Zero-camera-interrupt transfer + toast (commit `52950ef`) | Done |
| 1.3.4 | Fallback & offline catalogues | `fallback-catalogue.ts`, `offline-catalog.ts` | Done |
| 1.3.5 | Studio state bridge | `try-on-bridge.ts`, `stores/studio-store.ts`, `stores/try-on-store.ts` | Done |
| **1.4** | **Storefront** (`frontend/src/app/(shop)/`, `components/catalog/`) | | Done |
| 1.4.1 | Home / landing | `app/page.tsx` — hero, category spotlights, studio modal | Done |
| 1.4.2 | Categories & product browsing | `(shop)/categories`, `(shop)/products`, product detail | Done |
| 1.4.3 | Auth & account | `/login`, `/register`, `/account`; `auth-store.ts`, `use-auth.ts` | Done |
| **1.5** | **Design system** (`frontend/src/ui/`) | 18 shared components, theme provider, Tailwind config | Done |
| **1.6** | **Backend API** (`server.py`) | | Done |
| 1.6.1 | Catalogue & settings endpoints | `/categories`, `/products`, `/settings/public` | Done |
| 1.6.2 | Try-on session lifecycle | sessions CRUD + `/heartbeat` + `/events/batch` | Done |
| 1.6.3 | Asset & capture pipeline | `/try-on/products/{id}/asset`, `/uploads`, `/captures`; `captures/` storage | Done |
| 1.6.4 | Static asset serving & CORS | `/static/Image/...`; CORS for `localhost:3000` | Done |
| **1.7** | **3D content & materials** | Gem material set (diamond/ruby/sapphire/emerald/amethyst); gem colour fix (commits `ef957c5`, `2dd63f6` chain work) | Done |
| **1.8** | **Asset production** | `static/Image/` — 4 earrings, 4 necklaces, 5 rings, 4 bangles; SVG catalogue icons; WASM/model bundles | Done |
| **1.9** | **Documentation** | `README.md`, `DOCUMENTATION.md`, `docs/` (5 technical guides), this client pack | Done |

## 2. Milestone Mapping (from commit history)

| Phase | Scope | Evidence |
|---|---|---|
| M-A | Necklace AR anchoring & chain rendering | Commits `0cc078b` → `2dd63f6` (long chain, layered/choker styles, shoulder-line anchoring) |
| M-B | Ring gem material correctness | Commits `b884c35`, `ef957c5` (vibrant physical materials, facets, tint light) |
| M-C | Multi-Jewellery Studio | Commit `52950ef` (multi studio, per-item removal, idle-mirror reset) |
| M-D | Documentation & delivery pack | `docs/` guides; `client-project/` pack |
