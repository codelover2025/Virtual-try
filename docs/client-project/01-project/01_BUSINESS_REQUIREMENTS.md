# BUSINESS REQUIREMENTS DOCUMENT (BRD)

| | |
|---|---|
| **Project** | Lumière — AI Virtual Jewellery Try-On Studio |
| **Repository** | `Virtual-try` |
| **Version** | 1.0 |
| **Sources** | `README.md`, `DOCUMENTATION.md` |

## 1. Background

Lumière is an AI-powered augmented reality studio for real-time virtual jewellery try-on using on-device Computer Vision and Deep Learning landmark tracking. Users interactively preview earrings, necklaces, rings, and bangles on live webcam feeds and capture high-resolution snapshots.

## 2. Business Objectives

| # | Objective | Evidence in Product |
|---|---|---|
| BO-1 | Let customers preview jewellery on themselves before purchase | Real-time try-on of 4 categories (earrings, necklaces, rings, bangles) |
| BO-2 | Guarantee complete biometric privacy | 100% client-side processing; video streams never leave the browser |
| BO-3 | Deliver a premium, photorealistic look | Physically-Based 3D gemstone shading, occlusion, contact shadows |
| BO-4 | Enable styling decisions (sets/occasions) | Multi-Jewellery Studio mixing pieces across categories |
| BO-5 | Support social/share behaviour | High-resolution snapshot capture from the studio |
| BO-6 | Zero-infrastructure deployability | Standalone frontend with optional FastAPI backend; no database requirement |

## 3. Stakeholders

| Role | Responsibility |
|---|---|
| Product / Brand owner | Catalogue content, piece imagery, pricing |
| Engineering team | AR Engine, storefront, backend API |
| QA team | Tracking accuracy, performance and compatibility verification |
| End users (shoppers) | Use try-on studio, capture and share looks |

## 4. Business Requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-1 | Shoppers must be able to try earrings, necklaces, rings and bangles live on camera | Must |
| BR-2 | Shoppers must be able to wear multiple pieces at once across categories | Must |
| BR-3 | No video frame may leave the user's device (privacy guarantee) | Must |
| BR-4 | The experience must stay smooth (target 60 FPS) on consumer hardware | Must |
| BR-5 | Shoppers must be able to capture snapshot images of a fitting | Must |
| BR-6 | The catalogue must be extensible: new pieces added via configuration | Should |
| BR-7 | The storefront must work without a backend (offline fallback catalogue) | Should |

## 5. Success Criteria (as documented in the product)

- Dual-earring, necklace, ring and bangle anchors calibrated to anatomical landmarks (see `docs/VISION_AND_TRACKING.md`).
- Persistent detector caching: swapping pieces is instant with zero freeze.
- 97% reduction in React re-renders via state throttling.
- Static typecheck passes with 0 errors; production build succeeds (`pnpm typecheck`, `pnpm build`).

## 6. Constraints & Assumptions

- Delivery is a web application (Next.js 15 App Router, React 19); no native mobile app.
- Vision models are MediaPipe Tasks Vision (`.task` files + WASM runtimes bundled under `frontend/public/models/`).
- Users need a webcam-capable, WebGL-supporting browser; camera access requires a secure context (`https://` or `http://localhost`).
- Optional FastAPI backend runs at `http://localhost:4000/api/v1` and serves catalogue, session, and capture endpoints.
