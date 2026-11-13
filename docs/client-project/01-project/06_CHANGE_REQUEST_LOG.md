# CHANGE REQUEST (CR) LOG

| | |
|---|---|
| **Product** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Version** | 1.0 |
| **Usage** | Copy the CR form for each request; keep the summary table current |

## CR Summary

| CR | Title | Raised by | Type | Status |
|---|---|---|---|---|
| CR-001 | Multi-Jewellery Studio (mix & match across categories) | Product | Enhancement | **Implemented** — commit `52950ef` |
| CR-002 | Ring gem colour correction (vibrant faceted materials) | QA / Product | Defect fix | **Implemented** — commits `b884c35` → `ef957c5` |
| CR-003 | Necklace chain anchoring to neck/shoulder line with drape extension | Product | Enhancement | **Implemented** — commits `b55589c`, `74b12da`, `2dd63f6` |
| CR-004 | Reset to idle mirror view when switching pieces | Product | Improvement | **Implemented** — commit `52950ef` |
| ____ | ____ | ____ | ____ | ____ |

> CR-001…004 are reconstructed from the repository commit history (they document scope changes that actually happened during development). Add new rows for future requests using the form below.

---

## CR Form (template)

**CR ID:** CR-___ 
**Date raised:** ____ 
**Raised by:** ____ 
**Type:** [ ] Defect fix [ ] Enhancement [ ] Improvement [ ] Documentation

### 1. Description
What is requested and why (business/user view):

____

### 2. Affected Scope
| Area | Files/Modules |
|---|---|
| [ ] Frontend studio | `frontend/src/features/try-on/…` |
| [ ] AR Engine | `frontend/src/ar-engine/…` |
| [ ] Backend API | `server.py` |
| [ ] Catalogue/assets | `fallback-catalogue.ts`, `static/Image/…` |
| [ ] Docs | `docs/…` |

### 3. Related Requirements
SRS reference(s): FR-___ / NFR-___

### 4. Impact Analysis
- **Effort:** ____ 
- **Risk:** [ ] Low [ ] Medium [ ] High — Notes: ____ 
- **Regression areas:** ____

### 5. Decision
[ ] Approved [ ] Rejected [ ] Deferred 
**Approver:** ____ **Date:** ____

### 6. Implementation Evidence
Commit(s)/PR(s): ____ **Verified by:** ____ **Status:** ____
