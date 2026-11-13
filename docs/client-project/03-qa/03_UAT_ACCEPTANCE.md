# USER ACCEPTANCE TESTING (UAT) & ACCEPTANCE CERTIFICATE

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **UAT Window** | ____ to ____ |
| **Facilitator** | ____ |
| **Preconditions** | App running per [DEPLOYMENT_RUNBOOK.md](../04-operations/01_DEPLOYMENT_RUNBOOK.md); camera permission granted |

## 1. UAT Scenarios (business-level)

### UAT-1: First-time shopper tries an earring
| Step | Action | Expected |
|---|---|---|
| 1 | Open `http://localhost:3000` | Storefront home loads with category spotlights |
| 2 | Enter `/try-on`, allow camera when prompted | Live mirrored viewfinder appears; permission rationale shown before prompt |
| 3 | Choose an earring piece | Earrings appear anchored on both earlobes, tilt with head |
| 4 | Turn head sideways | Far earring fades naturally |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

### UAT-2: Bridal set with multiple pieces
| Step | Action | Expected |
|---|---|---|
| 1 | While wearing earrings, pick a necklace | Immediate transfer to Multi-Jewellery Studio, toast shown, camera never restarts |
| 2 | Add a ring (show hand) and a bangle | All pieces track simultaneously; Active Multi-Fitting bar lists each with `×` |
| 3 | Adjust Necklace Size (80–120%) and Drape (±30) | Only necklace responds; other pieces stay anatomically locked |
| 4 | Remove one piece via pill `×` | Only that piece disappears |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

### UAT-3: Snapshot capture
| Step | Action | Expected |
|---|---|---|
| 1 | Trigger capture | High-resolution composited photo saved |
| 2 | With backend running, check server | File persisted under `captures/`, retrievable via capture list/download endpoints |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

### UAT-4: Works without backend (privacy & resilience)
| Step | Action | Expected |
|---|---|---|
| 1 | Stop the API server, reload `/try-on` | Fallback catalogue loads; try-on fully functional |
| 2 | Open DevTools → Network during try-on | No webcam frame or landmark traffic sent anywhere; only explicit capture upload |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

### UAT-5: Ring realism check
| Step | Action | Expected |
|---|---|---|
| 1 | Wear each of the 5 ring SKUs | Gem colours distinguishable (diamond/ruby/sapphire/emerald/amethyst) even in dim room light |
| 2 | Rotate finger | Ring orientates with finger; band hides behind finger; contact shadow visible |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

### UAT-6: Troubleshooting behaviours (from product FAQ)
| Step | Action | Expected |
|---|---|---|
| 1 | Deny camera access | Clear guidance to re-enable via browser padlock/camera icon |
| 2 | Camera held by another app (e.g., Zoom) | Guidance surfaced to release the device |
| Result | [ ] Pass [ ] Fail — Notes: ____ |

## 2. Acceptance Criteria
- All six UAT scenarios Pass (or gaps accepted in writing below).
- No open Severity-1/2 defects (see [TEST_REPORT.md](./02_TEST_REPORT.md) §4).

## 3. Open Items / Waivers

| # | Item | Severity | Disposition (Fix / Waive / Post-GA) | Agreed by |
|---|---|---|---|---|
| — | | | | |

## 4. Acceptance Sign-off

By signing, the reviewer accepts the Lumière Virtual Try-On Studio as delivered against the documented feature set.

| Role | Name | Signature | Date |
|---|---|---|---|
| Business / Product owner | ____ | ____ | ____ |
| QA representative | ____ | ____ | ____ |
| Technical representative | ____ | ____ | ____ |
