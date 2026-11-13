# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Sources** | `README.md`, `DOCUMENTATION.md`, `docs/TRY_ON_STUDIO.md`, `docs/VISION_AND_TRACKING.md`, `docs/3D_SHADING_AND_MATERIALS.md`, `server.py` |

## Revision History

| Ver | Description |
|---|---|
| 0.1 | Draft compiled from repository documentation and code |
| 1.0 | Baselined for the project documentation pack |

---

## 1. Introduction

### 1.1 Purpose
This SRS specifies the functional and non-functional requirements of the Lumière Virtual Jewellery Try-On Studio as implemented in this repository.

### 1.2 Product Perspective
Two deployables:
1. **Web Atelier (frontend)** — standalone Next.js 15 (App Router) / React 19 application with the in-browser AR Engine (MediaPipe Tasks Vision + Three.js + Canvas2D). Runs with zero server or database requirements, using the offline fallback catalogue.
2. **Backend API (optional)** — FastAPI service (`server.py`) on `http://localhost:4000/api/v1` providing catalogue, settings, try-on session lifecycle, capture upload, and static asset serving with CORS for `http://localhost:3000`.

### 1.3 User Classes
- **Shopper**: browses catalogue, runs single- or multi-piece try-on, captures snapshots.
- **Catalogue administrator**: adds products (PNG assets and/or `ringConfig`/`bangleConfig` entries).
- **Operator**: installs and runs the stack (`run_web.bat`, `pnpm dev`, or `uvicorn`).

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Landmark | Tracked anatomical point from MediaPipe models |
| Anchor | Computed jewellery attachment point derived from landmarks |
| PBR | Physically-Based Rendering (Three.js materials) |
| Fine-Tune | User sliders: Size Ratio 80–120%, Vertical Position ±30px |

---

## 2. Functional Requirements

### 2.1 Storefront & Catalogue
| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The site shall present a luxury storefront home with category spotlights at `/`. | Must |
| FR-2 | The site shall list and filter categories and products (`/categories`, `/products`, `/products/[id]`). | Must |
| FR-3 | When the backend API is unreachable, the app shall serve the embedded fallback catalogue (`frontend/src/features/try-on/fallback-catalogue.ts`, `offline-catalog.ts`) so try-on still works. | Must |
| FR-4 | Product entries shall carry try-on asset metadata (`tryOnAsset`: `assetType`, `assetUrl`, `renderScale`, `renderOffsetY`) and, for 3D rings/bangles, `metadata.ringConfig` / `bangleConfig`. | Must |
| FR-5 | The app shall cache catalogue assets for instant switching (`asset-cache.ts`, `preloadMany`, `HTMLImageElement.decode()`). | Should |

### 2.2 Camera & Vision Pipeline
| ID | Requirement | Priority |
|---|---|---|
| FR-10 | The studio shall negotiate a webcam stream targeting 1280×720 @ 30 FPS with mirrored display. | Must |
| FR-11 | The studio shall run FaceLandmarker, PoseLandmarkerLite, and HandLandmarker fully on-device via MediaPipe Tasks Vision (bundled `.task` models and WASM). | Must |
| FR-12 | Detector models shall be loaded once and cached persistently per session (`cachedDetectors` map); switching pieces shall never reload models or restart the camera. | Must |
| FR-13 | Earrings shall anchor to face mesh landmarks `177`/`401` (earlobes) with head-roll tilt, dynamic sizing `max(14, min(64, FaceWidth × 0.12))`, and far-side occlusion fade beyond ~35° yaw. | Must |
| FR-14 | Necklaces shall anchor to `NECK_BASE`/`COLLARBONE` derived from shoulder pose landmarks `11`/`12` with face fallback. | Must |
| FR-15 | Rings shall anchor to hand landmarks `13`/`14` (ring finger) with full 3D orientation via Gram-Schmidt orthogonalization and quaternion SLERP smoothing. | Must |
| FR-16 | Bangles shall anchor to wrist (`landmark 0`) with forearm-vector alignment (landmark `9`) and continuous scale stabilization. | Must |
| FR-17 | Rendering shall interpolate tracked poses at 60 FPS using spring damping while ML inference runs decoupled at 15–20 Hz. | Must |

### 2.3 Try-On Studio Modes
| ID | Requirement | Priority |
|---|---|---|
| FR-20 | Single-Piece Studio (`/try-on`, `/try-on/[productId]`) shall trial one piece with universal Fine-Tune controls (Size Ratio 80–120%, Vertical Position ±30px). | Must |
| FR-21 | Same-category selection shall swap the active piece immediately without camera restart. | Must |
| FR-22 | Cross-category selection in Single Studio shall directly transfer the session to Multi-Jewellery Studio with zero camera interruption, showing a toast confirmation. | Must |
| FR-23 | Multi-Jewellery Studio (`/try-on/multi`) shall allow one simultaneous piece per category (Necklace, Earrings, Rings, Bangles). | Must |
| FR-24 | Multi mode shall display an Active Multi-Fitting pill bar with per-item `× Remove` that disposes only that item's overlay/mesh. | Must |
| FR-25 | In Multi mode, Fine-Tune sliders shall be restricted to Necklace Size (80–120%, step 2%) and Necklace Drape Length (−30px choker collar to +30px chest drop). | Must |
| FR-26 | If no necklace is equipped in Multi mode, the panel shall prompt: "Add a necklace to the fitting to adjust size and drape length." with a `Browse Necklaces` shortcut. | Should |

### 2.4 Rendering & Materials
| ID | Requirement | Priority |
|---|---|---|
| FR-30 | A dual-compositor stack shall layer: `<video>` (L0) → Canvas2D overlay (L1) → Three.js WebGL (L2) → DOM HUD (L3). | Must |
| FR-31 | 2D pieces (earrings, necklaces) shall render from transparent PNG overlays; 3D pieces (rings, bangles) procedurally via Three.js. | Must |
| FR-32 | Gemstone materials shall be defined per product: Brilliant Solitaire `#FFFFFF` (clear transmission), Royal Ruby Pavé `#E0115F`, Sapphire Halo `#1E6FD9`, Imperial Emerald `#2ECC71`, Amethyst Sovereign `#9B59B6` (opaque faceted PBR, `emissiveIntensity 0.35`, `clearcoat 1.0`, `flatShading`, local point light). | Must |
| FR-33 | Bangles shall use two-pass shading: opaque front band (`depthWrite: true`, `renderOrder: 2`) and translucent darkened back band (opacity 0.16, 0.7×, `renderOrder: 1`). | Should |
| FR-34 | Rings shall render a finger occluder cylinder (0.85× inner radius, `colorWrite: false`, `depthWrite: true`, `renderOrder: 0`) and a soft radial contact shadow. | Should |

### 2.5 Capture & Sessions (backend-supported)
| ID | Requirement | Priority |
|---|---|---|
| FR-40 | The studio shall capture high-resolution composited snapshots of the current fitting. | Must |
| FR-41 | The backend shall manage try-on session lifecycle: create (`POST /try-on/sessions`), read, update, heartbeat, and event batch endpoints. | Must |
| FR-42 | The backend shall accept capture uploads (`PUT /uploads/{storageKey}`, `POST /try-on/sessions/{sessionId}/captures`) and persist them under `captures/`. | Must |
| FR-43 | The backend shall serve product imagery statically from `/static/Image/...` and per-product try-on assets. | Must |

---

## 3. Non-Functional Requirements

| ID | Category | Requirement (as documented in repo) |
|---|---|---|
| NFR-1 | Performance | 60 FPS rendering via decoupled 15–20 Hz inference + spring-damped interpolation |
| NFR-2 | Performance | Persistent detector caching — swapping pieces is instant with zero freeze |
| NFR-3 | Performance | React state throttling achieving 97% re-render reduction; FPS state updated once per 500 ms, while `status`, `promptMessage`, `error` transitions stay immediate |
| NFR-4 | Privacy | 100% client-side; video streams never leave the user's browser |
| NFR-5 | Availability | Frontend is standalone: zero server or database requirements (backend optional) |
| NFR-6 | Maintainability | TypeScript strict project; `pnpm typecheck` passes with 0 errors |
| NFR-7 | Usability | Camera permission issues guided via on-screen prompts; documented troubleshooting (see `DOCUMENTATION.md` §9) |
| NFR-8 | Compatibility | Requires secure context for `getUserMedia` (`https://` or `http://localhost`); mobile testing via HTTPS reverse proxy (`mkcert`, `ngrok`) |

---

## 4. Interface Requirements

### 4.1 UI Routes (implemented)
| Path | Purpose |
|---|---|
| `/` | Storefront hero, category spotlights, interactive studio modal overlay |
| `/try-on` | Virtual Studio hub (defaults to Single-Piece mode) |
| `/try-on/[productId]` | Single-piece try-on stage |
| `/try-on/multi` | Multi-Jewellery Studio with fitting bar & necklace sliders |
| `/categories`, `/products` | Catalogue browsing (shop group) |
| `/login`, `/register`, `/account` | Auth & account area |

### 4.2 API
Full contract in [API_SPECIFICATION.md](../../02-engineering/03_API_SPECIFICATION.md); all responses use the envelope `{ success, data, meta: { requestId, timestamp } }`.

### 4.3 Hardware
Webcam via `getUserMedia` (720p @ 30 FPS target); WebGL-capable GPU for the Three.js layer.

---

## 5. Constraints
- MediaPipe `.task` models and WASM runtimes are bundled locally (`frontend/public/models/`).
- Fixed catalogue at hand: 4 Earring, 4 Necklace, 5 Ring, 4 Bangle PNG assets under `static/Image/`.
- Backend is Python (FastAPI ≥ 0.100, uvicorn, pydantic ≥ 2) with in-memory/disk persistence only.
