# TEST STRATEGY

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Basis** | Verifiable checks and behaviours documented in `README.md`, `DOCUMENTATION.md`, `docs/DEVELOPER_GUIDE.md` |

## 1. Test Objectives
Validate that the documented quality bar holds: 60 FPS smooth tracking, instant piece switching, correct anatomical anchoring per category, privacy guarantee (no frame egress), and clean static/production builds.

## 2. Scope & Test Types

| Level | What | How |
|---|---|---|
| Static | TypeScript strict compile | `cd frontend; pnpm typecheck` → 0 errors |
| Build | Production bundle | `pnpm build` → success; `pnpm start` serves prod |
| API functional | Endpoints & envelope contract | Request `/api/v1/categories`, `/products`, session lifecycle; verify `{success, data, meta}` shape, pagination, 404s |
| Vision/AR functional | Anchor correctness per category | Manual scenario suite (§4) |
| Performance | FPS & responsiveness | On-screen FPS readout; slider drag lag check; piece-swap freeze check |
| Privacy | No frame egress | Browser DevTools Network audit during try-on: only explicit capture uploads leave the client |
| Compatibility | Browser matrix | Chrome/Edge/Safari/Firefox desktop; mobile via HTTPS proxy (mkcert/ngrok) |
| Regression aids | 3D orientation QA | `X` AxesHelper toggle for ring alignment verification |

## 3. Environments

| Env | Frontend | Backend |
|---|---|---|
| Local dev | `pnpm dev` → `http://localhost:3000` | `python server.py` → `http://localhost:4000` (docs `/api/docs`) |
| Local prod | `pnpm build && pnpm start` | same |
| Standalone | frontend only (fallback catalogue must render) | not running |

## 4. Manual AR Scenario Suite (per category)

| ID | Scenario | Expected |
|---|---|---|
| AR-01 | Face camera, wear earring piece | Both earlobe overlays track; tilt follows head roll |
| AR-02 | Turn head > ~35° yaw | Far-side earring fades progressively |
| AR-03 | Wear necklace; shrug/approach camera | Chain scales with shoulder width, stays on collarbone line |
| AR-04 | Multi mode: adjust drape slider (−30 to +30 range) | Choker collar → chest drop, no jitter |
| AR-05 | Show hand, wear ring | Ring follows ring finger with correct 3D orientation when finger rotates |
| AR-06 | Move hand near/away | Ring scales; rear shank arc hidden behind finger (occluder), contact shadow visible |
| AR-07 | Wear bangle, rotate wrist | Bangle aligns to forearm vector; back arc translucent, front opaque |
| AR-08 | Swap same-category piece | Instant swap; camera and models keep running |
| AR-09 | Pick different category in Single mode | Direct transfer to Multi; both pieces composite; no camera restart |
| AR-10 | `× Remove` one item in Multi | Only that item disappears; others keep tracking |
| AR-11 | Multi mode without necklace | Guard message + `Browse Necklaces` button shown |
| AR-12 | Capture snapshot | Full-res composited image saved; with backend running, file lands in `captures/` |
| AR-13 | Poor/dim lighting | Gem colours stay saturated (emissive + point light behaviour) |

## 5. Entry / Exit Criteria
- **Entry:** `pnpm typecheck` and `pnpm build` pass; app boots via `run_web.bat` or documented commands.
- **Exit:** All "Must" SRS features demonstrated; no open Severity-1 (crash / camera dead / data loss) defects; performance checks (§5 of `DOCUMENTATION.md`: 60 FPS loop, 500 ms FPS throttle, no swap freeze) verified on reference hardware.

## 6. Defect Severity Definitions

| Sev | Definition |
|---|---|
| S1 | App/camera unusable, build failure, data loss |
| S2 | A documented Must feature broken (e.g., anchor category fails entirely) |
| S3 | Degraded experience (visible jitter, mis-scaled overlay) in normal conditions |
| S4 | Cosmetic / copy / edge-case issue |

## 7. Deliverables
- Completed [TEST_REPORT.md](./02_TEST_REPORT.md) per release candidate.
- [UAT_ACCEPTANCE.md](./03_UAT_ACCEPTANCE.md) scenarios executed with the business stakeholders.
