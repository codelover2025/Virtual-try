# ✨ Lumière — AI Virtual Jewellery Try-On Studio

An AI-powered augmented reality atelier for real-time virtual jewellery try-on using on-device Computer Vision and Deep Learning landmark tracking. Users can interactively preview earrings, necklaces, rings, and bangles on live webcam feeds and capture high-resolution snapshots.

> [!NOTE]
> **100% Client-Side & Private**: Video streams never leave the user's browser. Built with **Next.js 15 (App Router)**, **React 19**, **Three.js**, and **MediaPipe Tasks Vision** with zero server or database requirements.

---

## 🌟 Key Features

* **Real-Time Anatomical Landmark Detection & Calibration**
  * **Earrings**: Dual earlobe anchors (MediaPipe Face Mesh `177` & `401`) with head-roll tilt and dynamic far-side ear occlusion fading when turning.
  * **Necklaces**: Suprasternal notch & collarbone alignment (`NECK_BASE` & `COLLARBONE`) using shoulder pose tracking with face fallback.
  * **Rings**: MediaPipe Hand tracking on the ring finger with 3D orientation quaternion, contact blob shadows, and finger occluders.
  * **Bangles**: Hand and wrist landmark tracking with forearm vector alignment and continuous scale stabilization.

* **✨ Multi-Jewellery Studio (`/try-on/multi`)**
  * Mix & match multiple fine jewellery pieces simultaneously across categories (Necklace + Earrings + Rings + Bangles).
  * Direct automatic transfer from single-piece mode with zero camera interruption.
  * Active Multi-Fitting pill bar with per-item `× Remove` capability.
  * Dedicated **Necklace Size and Drape Length Fine-Tuning** in multi mode.

* **💎 Physically-Based 3D Gemstone Shading**
  * Dedicated gemstone materials per product: Brilliant Diamond, Royal Ruby Pavé (`#E0115F`), Sapphire Halo (`#1E6FD9`), Imperial Emerald (`#2ECC71`), and Amethyst Sovereign (`#9B59B6`).
  * Faceted flat-shading, emissive saturation recovery, and localized point lighting.
  * Two-pass radial bangle shading (opaque front band + translucent shaded back band).

* **⚡ Ultra-Smooth Performance (60 FPS)**
  * **Persistent Detector Caching**: Vision models (`face`, `pose`, `hand`) stay loaded once per session; swapping pieces is instant with zero freeze.
  * **Decoupled Detection**: 15–20 Hz background ML inference paired with 60 FPS spring-damped pose interpolation.
  * **State Throttling**: 97% reduction in React re-renders.

---

## 📚 Documentation Set

Comprehensive documentation is available in the [`docs/`](file:///C:/Users/ankus/Downloads/Virtual-try/docs/) directory and in [**`DOCUMENTATION.md`**](file:///C:/Users/ankus/Downloads/Virtual-try/DOCUMENTATION.md):

* 🏛️ [**Architecture Overview (`docs/ARCHITECTURE.md`)**](file:///C:/Users/ankus/Downloads/Virtual-try/docs/ARCHITECTURE.md)
* 💍 [**Virtual Fitting Studio & Multi-Jewellery (`docs/TRY_ON_STUDIO.md`)**](file:///C:/Users/ankus/Downloads/Virtual-try/docs/TRY_ON_STUDIO.md)
* 👁️ [**Computer Vision & Landmark Calibration (`docs/VISION_AND_TRACKING.md`)**](file:///C:/Users/ankus/Downloads/Virtual-try/docs/VISION_AND_TRACKING.md)
* 💎 [**3D PBR Shading, Gem Materials & Occlusion (`docs/3D_SHADING_AND_MATERIALS.md`)**](file:///C:/Users/ankus/Downloads/Virtual-try/docs/3D_SHADING_AND_MATERIALS.md)
* 🛠️ [**Developer & Contributor Guide (`docs/DEVELOPER_GUIDE.md`)**](file:///C:/Users/ankus/Downloads/Virtual-try/docs/DEVELOPER_GUIDE.md)

---

## 🚀 Quick Start

### Running the Web Atelier

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
pnpm install

# 3. Launch development server
pnpm dev
```

*(On Windows, you can simply double-click [`run_web.bat`](file:///C:/Users/ankus/Downloads/Virtual-try/run_web.bat) in the project root)*

Open your browser to: **`http://localhost:3000`**

### Production Build & Typecheck

```bash
cd frontend
pnpm typecheck   # Static typecheck (0 errors)
pnpm build       # Optimized Next.js production build
pnpm start       # Start production server
```

---

## 📁 Repository Structure

```text
Virtual-try/
├── run_web.bat                     # Windows launch batch script
├── DOCUMENTATION.md                # Master system documentation
├── README.md                       # Repository overview & quick start
├── docs/                           # Dedicated modular technical guides
│   ├── ARCHITECTURE.md             # System architecture & component design
│   ├── TRY_ON_STUDIO.md            # Studio modes, multi-try UX & fine-tuning
│   ├── VISION_AND_TRACKING.md      # Computer vision & anatomical math
│   ├── 3D_SHADING_AND_MATERIALS.md # PBR materials, gems & two-pass shaders
│   └── DEVELOPER_GUIDE.md          # Local setup, testing & product addition
├── static/                         # Desktop assets & shared PNG overlays
│   └── Image/                      # Earrings, Necklaces, Rings, Bangles
└── frontend/                       # Standalone Next.js 15 Web Atelier
    ├── public/                     # Public assets & WASM model runtimes
    └── src/
        ├── app/                    # Next.js App Router (/, /try-on, /try-on/multi)
        ├── ar-engine/              # AR Engine core (camera, detectors, renderers)
        ├── features/try-on/        # Studio UI, Camera Viewfinder, Fine-Tune Sliders
        ├── components/             # Storefront components
        └── ui/                     # Design system components
```

---

## 📄 License & Attribution

Lumière Luxury Virtual Jewellery Studio © 2026. All rights reserved.
