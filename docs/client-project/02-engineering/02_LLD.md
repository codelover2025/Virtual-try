# LOW-LEVEL DESIGN (LLD)

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Sources** | `docs/VISION_AND_TRACKING.md`, `docs/3D_SHADING_AND_MATERIALS.md`, `docs/TRY_ON_STUDIO.md`, `docs/ARCHITECTURE.md` |

## 1. AR Engine Runtime Loop

`ArEngine` (`frontend/src/ar-engine/ar-engine.ts`) owns the requestAnimationFrame loop, detector scheduling, active-jewellery map, and event broadcasting.

### 1.1 Detector scheduling (multi-concurrent, non-blocking)

```
runDetection():
 if detecting in progress → skip tick # never overlaps inference
 needed = { AnchorRegistry.detector(kind) | kind ∈ activeJewellery }
 for detectorKind in needed: # e.g. face + pose + hand in multi mode
 det = getOrLoadDetector(detectorKind) # persistent cache, load-once
 raw = det.estimate(video)
 proc = processor.process(raw) # temporal smoothing
 lastLandmarksMap.set(detectorKind, proc.result)
```

- Models cached in `private readonly cachedDetectors = new Map<'face'|'hand'|'pose', ModelAdapter>()`; `getOrLoadDetector` loads on first use only.
- Inference runs ~15–20 Hz in WASM; the render loop interpolates transforms each frame (60 FPS) via `PoseFitter` second-order exponential spring damping.

### 1.2 Fit resolution per frame
For every entry in `activeJewellery`: resolve anchor profile → read matching landmarks → compute position/orientation/scale → apply spring state → dispatch to the correct renderer (2D or 3D).

## 2. Anatomical Anchor Algorithms

### 2.1 Earrings (FaceLandmarker, 478 pts)
| Step | Formula (from `docs/VISION_AND_TRACKING.md` §2.1) |
|---|---|
| Earlobe anchors | landmarks `177` (left), `401` (right) |
| IPD | `√((x₄₆₈−x₄₇₃)² + (y₄₆₈−y₄₇₃)²)` |
| Width | `max(14, min(64, FaceWidth × 0.12))` |
| Hook offset | `originY = −h × 0.08` (hangs below lobe, not on cheek) |
| Yaw occlusion | `Yaw = atan2(z_nose − z_mid_ears, x_nose − x_mid_ears)`; fade far earring when `|Yaw| > 35° (0.61 rad)` |
| Head roll | overlay tilt aligned to earlobe-to-earlobe axis |

### 2.2 Necklaces (PoseLandmarkerLite, 33 pts; face fallback)
| Step | Formula (§2.2) |
|---|---|
| Neck base | `P_neck = (P₁₁ + P₁₂) / 2` (shoulder midpoint → suprasternal notch/collarbone projection) |
| Shoulder width | `W = ‖P₁₁ − P₁₂‖` (biacromial) |
| Target scale | `max(0.60, min(1.50, 1 + fineTuneOffsetY/70)) × W/240` |
| Drape position | `y = P_neck.y + fineTuneOffsetY` (−30 px choker collar ↔ +30 px chest drop) |
| Canvas2D detail | bilateral depth sorting + catenary drape calibration (`canvas2d-renderer.ts`) |

### 2.3 Rings (HandLandmarker, 21 joints)
| Step | Formula (§2.3) |
|---|---|
| Finger vector | `V = P₁₄ − P₁₃` (ring finger PIP→DIP), `ẑ = V/‖V‖` |
| Palm normal | `N = (P₅−P₀) × (P₁₇−P₀)` |
| Gram-Schmidt | `U_up = normalize(N − ẑ(N·ẑ))`, `U_right = U_up × ẑ` |
| Orientation | basis `(U_right, U_up, ẑ)` → Three.js Quaternion, SLERP damping α = 0.40 |
| Angle readout | `θ = atan2(y₁₄−y₁₃, x₁₄−x₁₃) + 90°` |

### 2.4 Bangles (HandLandmarker)
| Step | Formula (§2.4) |
|---|---|
| Wrist anchor | landmark `0`; forearm vector to landmark `9` (middle MCP) |
| Roll | `θ_roll = −atan2(V_arm.y, V_arm.x)` |
| Radius | `PalmWidth = ‖P₅ − P₁₇‖`; `BangleRadius = PalmWidth × 1.22 / 2` |
| Stabilization | continuous scale stabilization against palm-width noise |

## 3. Rendering Modules

### 3.1 Canvas2dRenderer (`renderers/canvas2d-renderer.ts`)
Multi-overlay compositor for transparent PNG jewellery; handles bilateral earring depth sorting, yaw-based opacity interpolation, and necklace catenary drape placement.

### 3.2 ThreeRenderer (`renderers/three-renderer.ts`)
WebGL 2.0, HDR `RoomEnvironment` lighting, transparent background.

**Gem material (verbatim parameters, §1 of 3D guide):**
```typescript
new THREE.MeshPhysicalMaterial({
 color: gemColor, emissive: gemColor,
 emissiveIntensity: 0.35, // saturation guard under dim webcam light
 metalness: 0.0, roughness: 0.05,
 transmission: isDiamond ? 0.60 : 0.0, // 0 for colored stones (no white washout)
 transparent: false, opacity: 1.0,
 ior: 2.2, clearcoat: 1.0, clearcoatRoughness: 0.05,
 envMapIntensity: 0.60, flatShading: true,
});
```
Each gem carries an internal colour-matched `PointLight` (intensity ≈ 0.40).

**Product gem catalogue (from `PRODUCTS_MASTER` / materials doc):**
| Product | gemColor | gemShape | bandMetal | halo |
|---|---|---|---|---|
| Brilliant Solitaire Diamond Ring | `#FFFFFF` | round | yellow | — |
| Royal Ruby Pavé Crown Ring | `#E0115F` | princess | yellow | — |
| Sapphire Halo Luxury Ring | `#1E6FD9` | round | white | `#FFFFFF` |
| Imperial Emerald Cut Gold Ring | `#2ECC71` | emerald | yellow | — |
| Amethyst Sovereign Gold Ring | `#9B59B6` | pear | rose | `#FFFFFF` |

**Two-pass bangle shader (§3):** back arc `renderOrder 1, depthWrite false, opacity 0.16`, diffuse darkened 0.7×; front arc `renderOrder 2, depthWrite true, opacity 1.0`; blend via `smoothstep(−seam, seam, dot(normal, viewVector))`.

**Ring occlusion (§4):** invisible occluder cylinder (0.85× inner radius, `colorWrite false, depthWrite true, renderOrder 0`) masks the rear shank arc; canvas-generated radial contact blob shadow grounds the ring.

**Debug (§5):** `X` key / header toggle attaches AxesHelper to the active ring (R=X lateral, G=Y dorsal normal, B=Z finger axis).

## 4. Studio UI Logic (`features/try-on/TryOnExperience.tsx`)

### 4.1 Mode state machine
```
SINGLE ──(pick same category)──▶ SINGLE (hot-swap piece, camera kept)
SINGLE ──(pick different category)──▶ MULTI # direct transfer, no camera/model restart, toast shown
MULTI ──(remove all but one)──▶ MULTI # pills support per-item × Remove
MULTI ──(Exit Multi Mode)────▶ SINGLE # keeps primary selected piece
```

### 4.2 Fine-tune control paths
- Single: universal `Size Ratio 80–120%` + `Vertical ±30px` applied to the worn item.
- Multi: necklace-only handlers:
```typescript
const handleNecklaceFineTuneChange = (scale: number, y: number) => {
 setNecklaceScale(scale);
 setNecklaceLengthY(y);
 engineRef.current?.setNecklaceFineTune(scale, y);
};
```
- Empty-necklace guard renders: *"Add a necklace to the fitting to adjust size and drape length."* + `Browse Necklaces` button.

### 4.3 Per-item removal
`handleRemovePiece(item)` disposes that item's 2D overlay or 3D mesh and updates the active jewellery map, leaving other pieces and the camera feed untouched.

### 4.4 Asset preloading (§5 of TRY_ON_STUDIO.md)
1. Selector mount → `assetCache.preloadMany(urls)`.
2. glTF/GLB → `warmCache(url)` decode in background workers.
3. PNGs → `HTMLImageElement.decode()` before renderer assignment.

## 5. Camera Engine (`ar-engine/camera/`)
Constraint ladder targeting 1280×720 @ 30 FPS; device enumeration/switching; facing-mode flip; health watchdog detecting stalled streams. Mirror display via CSS `-scale-x-100`.

## 6. Backend Module Design (`server.py`)

- **Catalogue store:** module-level `CATEGORIES` (4) and `PRODUCTS_MASTER` (17 products) lists; `build_product_dto()` composes the wire DTO incl. `tryOnAsset` (anchorProfile, defaultScale, mirrorForOppositeEar, fingerIndex) and `metadata` (ringConfig for rings).
- **Session store:** in-memory `SESSIONS: Dict[str, dict]`; statuses `ACTIVE`/updated via PATCH; `lastHeartbeat` epoch.
- **Capture pipeline:** `upload-url` issues `storageKey` (`cap_<14 hex>`) → client `PUT`s binary to `/api/v1/uploads/{key}` → written to `captures/<key>.jpg` and mirrored to root `captured_image_with_jewelry.png` → `POST .../captures` registers record in `CAPTURES` list (served at `/captures/<key>.jpg`).
- **Auth:** guest/demo stubs returning fixed `user-guest` profile + static tokens.
- **Response contract:** `api_envelope()` → `{success, data, meta:{requestId, timestamp[, pagination]}}`.
- **Static mounts:** `/static` → `static/`, `/captures` → `captures/`. Swagger at `/api/docs`, OpenAPI JSON at `/api/openapi.json`.

Full endpoint contract: [API_SPECIFICATION.md](./03_API_SPECIFICATION.md).
