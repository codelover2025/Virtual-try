# Lumière — AI Virtual Jewellery Try-On Documentation

**Lumière** is an augmented reality atelier designed for real-time virtual jewellery try-on. It combines high-accuracy computer vision with real-time biometric landmark tracking to simulate photorealistic placement of fine jewellery—including earrings, necklaces, rings, and bangles—directly onto the user's live camera feed.

The repository includes:
1. **Web Atelier (`frontend/`)**: A modern, standalone Next.js 15 + React 19 web application running on-device MediaPipe Vision Tasks (WebGL/WASM), Three.js PBR shaders, and high-performance 2D canvas overlays with zero server or backend dependencies.
2. **Backend API (`server.py`)**: An optional Python API service on port 4000 for catalogue management and session storage.

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Platform Implementations](#2-platform-implementations)
  - [2.1 Python Desktop Application (`app.py`)](#21-python-desktop-application-apppy)
  - [2.2 Next.js Web Application (`frontend/`)](#22-nextjs-web-application-frontend)
- [3. Computer Vision & Landmark Alignment Calibration](#3-computer-vision--landmark-alignment-calibration)
  - [3.1 Earrings & Drops](#31-earrings--drops)
  - [3.2 Necklaces & Chokers](#32-necklaces--chokers)
  - [3.3 Solitaire Rings](#33-solitaire-rings)
  - [3.4 Bangles & Kadas](#34-bangles--kadas)
- [4. Performance & AR Pipeline Optimization](#4-performance--ar-pipeline-optimization)
  - [4.1 React State Throttle (97% Render Reduction)](#41-react-state-throttle-97-render-reduction)
  - [4.2 Detection Decoupling (60 FPS Interpolation)](#42-detection-decoupling-60-fps-interpolation)
  - [4.3 Camera Constraint Ladder (720p @ 30 FPS)](#43-camera-constraint-ladder-720p--30-fps)
  - [4.4 Single-Target Model Profiling](#44-single-target-model-profiling)
- [5. Installation & Running](#5-installation--running)
  - [5.1 Desktop App](#51-desktop-app)
  - [5.2 Web App](#52-web-app)
- [6. Directory Structure](#6-directory-structure)
- [7. Catalogue & Asset Addition Guide](#7-catalogue--asset-addition-guide)
- [8. Troubleshooting & FAQ](#8-troubleshooting--faq)

---

## 1. Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │            User Web Camera            │
                      └──────────────────┬────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
     ┌───────────────────────┐                       ┌───────────────────────┐
     │  Desktop Atelier      │                       │  Web Atelier          │
     │  (Python / OpenCV)    │                       │  (Next.js / WebGL)    │
     └───────────┬───────────┘                       └───────────┬───────────┘
                 │                                               │
     ┌───────────┴───────────┐                       ┌───────────┴───────────┐
     │ • OpenCV VideoCapture │                       │ • CameraEngine (720p) │
     │ • MediaPipe Hands     │                       │ • MediaPipe Tasks WASM│
     │ • MediaPipe FaceMesh  │                       │ • AdaptiveController  │
     │ • Affine Matrix Warp  │                       │ • PoseFitter (Spring) │
     │ • Alpha Blending      │                       │ • Canvas2dRenderer    │
     │ • Tkinter GUI Shell   │                       │ • Three.js PBR Engine │
     └───────────────────────┘                       └───────────────────────┘
```

Both platforms execute **100% on the client device**. Video frames never leave the user's computer or browser, guaranteeing strict privacy, low power consumption, and instant real-time response.

---

## 2. Platform Architecture

### 2.1 Next.js Web Application (`frontend/`)
- **Technology Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, `@mediapipe/tasks-vision`, `@tensorflow/tfjs`, Three.js.
- **Entry Point**: [`frontend/src/app/page.tsx`](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/frontend/src/app/page.tsx) and [`frontend/src/app/try-on/page.tsx`](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/frontend/src/app/try-on/page.tsx)
- **Features**:
  - Fully responsive, luxury-themed storefront and live virtual fitting studio.
  - Built-in offline catalogue (no backend or database required).
  - Dual rendering pipeline: Canvas 2D for high-resolution PNG jewellery and Three.js for 3D PBR glTF models.
  - Fine-tune controls (Size Ratio slider: 80%–120%, Vertical Position offset: ±25px).
  - Studio camera controls (Mirror Flip, Alignment Guide, Studio Lighting Boost, Front/Rear camera switch).
  - Studio snapshot export with automatic compositing and downloads.

### 2.2 Python Backend Server (`server.py`)
- **Technology Stack**: Python 3.10+, FastAPI / Flask.
- **Entry Point**: [`server.py`](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/server.py)
- **Features**:
  - RESTful API endpoints for product catalogue, try-on session persistence, and asset preloading.

---

## 3. Computer Vision & Landmark Alignment Calibration

To ensure identical fitting accuracy across both desktop and web applications, the web AR engine (`frontend/src/ar-engine/`) mirrors the mathematical calibration formulated in `app.py`:

### 3.1 Earrings & Drops
- **Landmark Anchors**: Dual earlobes via MediaPipe Face Mesh landmarks `177` (left earlobe) and `401` (right earlobe).
- **Dynamic Sizing**:
  $$\text{Earring Width} = \max\left(14,\; \min\left(64,\; \text{Face Width} \times 0.12\right)\right)$$
- **Attachment Point**: Anchor top hook at `originY = -h * 0.08` so the earring hangs naturally below the earlobe rather than floating over the cheek.
- **Perspective Occlusion**: Head yaw angle is tracked in real-time. When yaw exceeds $35^\circ$ ($0.61\text{ rad}$), the far-side earring automatically fades out with progressive opacity, matching real-world ear occlusion.

### 3.2 Necklaces & Chokers
- **Landmark Anchors**: Suprasternal notch and clavicle base (`NECK_BASE` and `COLLARBONE`) derived from MediaPipe Pose shoulders (`landmarks 11 & 12`) with fallback to facial chin triangulation.
- **Dynamic Sizing**:
  $$\text{Necklace Width} = \max\left(160,\; \min\left(560,\; \text{Face Width} \times 1.50\right)\right)$$
- **Attachment Point**: Centered at `originY = -h * 0.48` ensuring the necklace rests along the collarbone and sternum without drifting when turning.

### 3.3 Solitaire Rings
- **Landmark Anchors**: Proximal and distal interphalangeal joints of the ring finger (`landmarks 13 & 14`).
- **Dynamic Rotation & Angle**:
  $$\theta = \text{atan2}(y_{14} - y_{13},\; x_{14} - x_{13}) + 90^\circ$$
- **Perspective Squashing**: Elliptical perspective compression ratio of $0.70$ applied along the finger axis:
  $$w = \text{Segment Length} \times 0.35, \quad h = w \times 0.70$$

### 3.4 Bangles & Kadas
- **Landmark Anchors**: Wrist center (`landmark 0`) and base of middle finger (`landmark 9`) defining the forearm vector.
- **Dynamic Sizing & Tilt**:
  $$\text{Bangle Width} = \text{Palm Width} \times 1.22$$
  $$\text{Bangle Height} = \text{Bangle Width} \times 0.35$$
  Anchored at the wrist midpoint with rotation aligned perpendicular to the forearm direction vector.

---

## 4. Performance & AR Pipeline Optimization

The web AR engine implements multiple performance optimizations ensuring sustained 60 FPS rendering without CPU lag or browser frame drops:

### 4.1 React State Throttle (97% Render Reduction)
- **Problem**: Previously, continuous frame callbacks triggered `setHud(...)` on every animation frame (30–60 FPS) because `fps` fluctuated slightly every frame. This caused React to re-render the entire 730-line `TryOnExperience` component tree 60 times a second, starving the main thread.
- **Solution**: Throttled FPS HUD state updates to once every 500ms using a timestamp delta check. Critical state transitions (`status`, `error`, `promptMessage`, `faceCentered`) remain instantaneous.
- **Result**: Reduced React component re-renders by **~97%**, eliminating UI click lag and slider drag stuttering.

### 4.2 Detection Decoupling (60 FPS Interpolation)
- **Problem**: MediaPipe's `detectForVideo()` runs synchronously on the main thread and takes 25–45ms per frame on typical hardware, bottlenecking frame rate to ~20–25 FPS.
- **Solution**: `AdaptiveController` initializes with `detectEveryN = 2`. Computer vision detection runs at ~15–20 Hz, while the `PoseFitter` applies second-order spring damping and exponential smoothing to render jewellery motion at a continuous **60 FPS**.

### 4.3 Camera Constraint Ladder (720p @ 30 FPS)
- **Problem**: Requesting unconstrained 1080p @ 60 FPS feeds overwhelmed USB buses and required uploading 2.07 million pixels per frame into WebGL texture memory.
- **Solution**: Camera engine negotiates standard **1280x720 (720p HD) and 960x540 at 30 FPS**. Because the web viewport renders the camera feed at ~400–600px width, 720p provides double retina crispness while cutting raw pixel volume by **over 55%**.

### 4.4 Single-Target Model Profiling
- MediaPipe FaceLandmarker configured with `numFaces: 1` rather than multi-face tracking.
- BlazeFace and TensorFlow.js models are lazy-loaded strictly as on-demand error fallbacks rather than loading eagerly on startup.
- Canvas luminance sampling in `LightingEstimator` is throttled to execute every 16 frames instead of every 8 frames.

---

## 5. Installation & Running

### 5.1 Backend API (Optional Python Server)

#### Requirements:
- Python 3.10+
- `pip install -r requirements.txt`

#### Steps:
```bash
# Launch backend API on port 4000
python server.py
```

### 5.2 Web App (Standalone Atelier)

#### Requirements:
- Node.js 18+ (Node.js 20+ recommended)
- `pnpm` (recommended) or `npm`

#### Steps:
```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
pnpm install

# 3. Start development server
pnpm dev

# Or launch directly using the root batch script:
# run_web.bat
```

Open your browser at: **`http://localhost:3000`**

#### Production Build:
```bash
cd frontend
pnpm build
pnpm start
```

---

## 6. Directory Structure

```text
VIRTUAL-TRY-ON-main/
├── server.py                   # Backend API server (Port 4000)
├── requirements.txt            # Python dependencies
├── README.md                   # Repository overview
├── DOCUMENTATION.md            # Comprehensive system documentation
├── run_web.bat                 # One-click Windows launch script for Web Atelier
├── static/                     # Shared jewellery assets & desktop UI resources
│   ├── Image/
│   │   ├── Earring/            # Earring transparent PNG overlays
│   │   ├── Necklace/           # Necklace transparent PNG overlays
│   │   ├── Ring/               # Ring transparent PNG overlays
│   │   └── Bangle/             # Bangle transparent PNG overlays
│   └── icons/                  # Desktop GUI toolbar icons
└── frontend/                   # Standalone Next.js 15 Web Atelier
    ├── public/
    │   ├── assets/             # Vector icons and SVG mock overlays
    │   ├── models/             # MediaPipe WASM and .task model runtimes
    │   └── static/             # Static symlink/copy of jewellery PNGs
    └── src/
        ├── app/                # App Router pages (Home, Products, Categories, Studio)
        ├── ar-engine/          # Production AR Engine
        │   ├── camera/         # CameraEngine (stream negotiation & device switching)
        │   ├── detectors/      # FaceDetector, PoseDetector, HandDetector
        │   ├── fitting/        # PoseFitter with spring damping & fine-tune calibration
        │   ├── renderers/      # Canvas2dRenderer & ThreeRenderer (3D PBR)
        │   ├── performance/    # AdaptiveController & FpsMeter
        │   └── capture/        # CaptureCompositor for lookbook snapshots
        ├── features/try-on/    # Studio UI, Camera Viewfinder, Fine-Tune Sliders
        ├── components/         # Reusable UI components & navigation
        └── ui/                 # Design system components
```

---

## 7. Catalogue & Asset Addition Guide

### Adding New Jewellery Overlays:

1. **Asset Requirements**:
   - Format: Transparent PNG with 32-bit alpha (`RGBA`).
   - Resolution: 800x800 to 1200x1200px recommended.
   - Framing: Centered with no extraneous transparent margins.
   - For Earrings: Create the asset with the hook/post at the top center.
   - For Necklaces: Create the asset curved naturally in a hanging "U" shape with clasp at top center.

2. **Placement**:
   - Place desktop assets in `static/Image/<Category>/`.
   - Place web assets in `frontend/public/static/Image/<Category>/`.

3. **Registering in the Web Catalogue**:
   - Open [`frontend/src/features/try-on/fallback-catalogue.ts`](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/frontend/src/features/try-on/fallback-catalogue.ts).
   - Add a new product entry matching the `ProductDetailDto` schema:
     ```typescript
     {
       id: 'vj-neck-099',
       slug: 'solitaire-diamond-pendant',
       name: 'Solitaire Diamond Pendant',
       jewelleryKind: 'NECKLACE',
       priceCents: 2499900,
       currency: 'INR',
       primaryImage: { url: '/static/Image/Necklace/necklace_new.png' },
       tryOnAsset: {
         id: 'asset-neck-099',
         assetType: 'IMAGE_OVERLAY',
         assetUrl: '/static/Image/Necklace/necklace_new.png',
         renderScale: 1.0,
         renderOffsetY: 0,
       },
     }
     ```

---

## 8. Troubleshooting & FAQ

#### Q1: "Camera access is blocked or black screen appears in the browser"
- Check browser permissions by clicking the padlock or camera icon in the URL bar.
- Ensure no other application (e.g. Zoom, Teams, or another browser tab) is holding an exclusive hardware lock on the webcam.

#### Q2: "The jewellery overlay appears mirrored or reversed"
- Lumière features unified mirror compensation: the camera viewfinder DOM container applies `-scale-x-100` so looking into the screen feels like a natural mirror. The AR engine draws in standard unmirrored coordinate space to avoid double-mirroring. You can toggle manual mirror view using the mirror button at the top of the camera viewfinder.

#### Q3: "Web try-on runs slowly on older laptops or battery power"
- The built-in `AdaptiveController` automatically adjusts detection scaling and frame intervals if frame budget is exceeded.
- Ensure hardware acceleration is enabled in your browser settings (`chrome://settings/system` -> "Use graphics acceleration when available").

#### Q4: "Do I need to run Python or a backend server to use the web storefront?"
- **No.** The web application is 100% self-contained. You can run `pnpm dev` inside `frontend/` and all catalogues, 3D engines, landmark detection, and photo captures function entirely inside your browser.

---

*Lumière Luxury Virtual Jewellery Studio © 2026. All rights reserved.*

