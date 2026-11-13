# TEST REPORT

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Report Version** | 1.0 |
| **Baseline** | `main` @ `52950ef` |
| **Strategy** | [TEST_STRATEGY.md](./01_TEST_STRATEGY.md) |

> Automated/static results below are executed commands; manual AR scenarios require a camera session and are recorded per execution run (fill Result column: Pass / Fail / N/A + evidence).

## 1. Automated & Static Checks (executed)

| ID | Check | Command | Expected | Result |
|---|---|---|---|---|
| T-01 | TypeScript strict analysis | `cd frontend; pnpm typecheck` (`tsc --noEmit`) | 0 errors | **Pass — verified 0 errors on `main` @ `52950ef`** |
| T-02 | Production build | `cd frontend; pnpm build` (`next build`) | Build succeeds | Run per release; record output |
| T-03 | Prod server boot | `pnpm start` → `http://localhost:3000` | Storefront renders | Run per release |
| T-04 | Backend boot | `pip install -r requirements.txt; python server.py` | Banner + API live on `:4000` | Run per release |
| T-05 | Catalogue API | `GET /api/v1/products` | Envelope `{success,data,meta.pagination}`, 17 products total | Run per release |
| T-06 | 404 contract | `GET /api/v1/products/does-not-exist` | HTTP 404 `{"detail": "Product not found"}` | Run per release |
| T-07 | Session lifecycle | `POST /try-on/sessions` → `GET` → `heartbeat` | `sess_<12hex>` ACTIVE, heartbeat ok | Run per release |
| T-08 | Capture pipeline | upload-url → PUT binary → register | File in `captures/`, record `READY` | Run per release |
| T-09 | Standalone mode | Kill backend, load `/try-on` | Fallback catalogue renders, try-on works | Run per release |

## 2. Manual AR Scenario Suite

Execute scenarios AR-01 … AR-13 from the strategy on the reference device; log results below.

| ID | Scenario | Result | Evidence / Notes |
|---|---|---|---|
| AR-01 | Earring earlobe tracking + roll | ____ | ____ |
| AR-02 | Yaw >35° far-side fade | ____ | ____ |
| AR-03 | Necklace shoulder-width scaling | ____ | ____ |
| AR-04 | Drape slider choker↔chest | ____ | ____ |
| AR-05 | Ring 3D finger orientation | ____ | ____ |
| AR-06 | Ring occluder + contact shadow | ____ | ____ |
| AR-07 | Bangle forearm alignment, two-pass arcs | ____ | ____ |
| AR-08 | Same-category instant swap | ____ | ____ |
| AR-09 | Cross-category live transfer to Multi | ____ | ____ |
| AR-10 | Per-item remove isolation | ____ | ____ |
| AR-11 | Necklace guard in Multi | ____ | ____ |
| AR-12 | Snapshot capture → `captures/` | ____ | ____ |
| AR-13 | Gem saturation in dim light | ____ | ____ |

## 3. Performance & Privacy Observations

| ID | Check | Basis | Result |
|---|---|---|---|
| PF-01 | 60 FPS render loop with decoupled 15–20 Hz inference | On-screen FPS (updates throttled to 500 ms) | ____ |
| PF-02 | Piece swap with zero freeze (detector cache) | Swap earrings↔necklace↔ring continuously | ____ |
| PF-03 | Slider drag without lag (state throttling) | Drag fine-tune during live tracking | ____ |
| PR-01 | No video frame egress | DevTools Network: only capture uploads leave client | ____ |

## 4. Defect Log

| ID | Sev | Scenario | Description | Status |
|---|---|---|---|---|
| — | — | — | None recorded in repository at baseline (`main` @ `52950ef`) | — |

Historical defects closed during development (from commit history):
| Fix | Description | Commits |
|---|---|---|
| D-H1 | Ring gem washout → vibrant faceted physical materials + tint light | `b884c35` → revert `18bc886` → fixed `ef957c5` |
| D-H2 | Necklace chain artefacts (shoulder bead dots) & open chain ends | `74b12da`, `b55589c`, extended `2dd63f6` |

## 5. Exit-Criteria Assessment

| Criterion | Met? |
|---|---|
| All Must FRs demonstrable (SRS §2) | Verified in code & docs; confirm live in run above |
| `pnpm typecheck` 0 errors | **Yes (T-01)** |
| Production build passes | Record in T-02 |
| No open S1/S2 defects | None recorded at baseline |
| Privacy check PR-01 | Record in §3 |

**Report prepared by:** ____ **Date:** ____ **QA approval:** ____
