# Lumière — AI Virtual Jewellery Try-On Studio

An AI-powered augmented reality atelier for real-time virtual jewellery try-on using Computer Vision and Deep Learning landmark tracking. Users can interactively preview earrings, necklaces, rings, and bangles on live webcam feeds and capture high-resolution snapshots.

The project features a **Dual-Platform Architecture**:
1. 🖥️ **Desktop Atelier (`app.py`)**: High-performance Python + OpenCV application with Tkinter GUI.
2. 🌐 **Web Atelier (`frontend/`)**: Standalone Next.js 15 + React 19 web storefront and real-time WebGL/MediaPipe AR engine requiring zero server or database setup.

> 📖 **Comprehensive System Documentation**: For exhaustive technical details, landmark calibration formulas, and performance tuning architecture, see [**`DOCUMENTATION.md`**](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/DOCUMENTATION.md).

---

## ✨ Features

* **Real-Time Anatomical Landmark Detection & Calibration**
  * **Earrings**: Dual earlobe anchors (MediaPipe Face Mesh 177 & 401) with head-roll tilt and dynamic far-side ear occlusion fading when turning.
  * **Necklaces**: Suprasternal notch & collarbone alignment (`NECK_BASE` & `COLLARBONE`) using shoulder pose tracking with face fallback.
  * **Rings**: MediaPipe Hand landmark tracking on the ring finger (landmarks 13 & 14) with dynamic 3D tilt angle computation and perspective squashing.
  * **Bangles**: Hand and wrist landmark tracking with forearm vector alignment and continuous scale stabilization.

* **100% On-Device Privacy**: Video streams never leave the user's computer or browser.
* **Dual Rendering Pipeline**: Procedural WebGL PBR 3D rendering (Three.js) + calibrated 2D transparent overlay rendering.
* **Optimized for 60 FPS**: Throttled React state thrashing, decoupled 15–20 Hz ML detection with 60 FPS spring-damped pose interpolation, and 720p HD stream negotiation.

---

## 🚀 Setup & Running

### 1. Web Atelier (Next.js 15 + React 19)

Navigate into the `frontend` directory:
```bash
cd frontend
pnpm install
pnpm dev
```
*(Or double-click [`run_web.bat`](file:///c:/Users/ankus/Downloads/VIRTUAL-TRY-ON-main/run_web.bat) on Windows)*

Then open: **`http://localhost:3000`** in your browser.

### 2. Desktop Atelier (Python + OpenCV)

From the project root:
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Launch desktop application
python app.py
```

---

## 📁 Repository Structure

```text
├── app.py                  # Desktop AR application (OpenCV + MediaPipe + Tkinter)
├── requirements.txt        # Python dependencies
├── run_web.bat             # One-click Windows launch script for Web Atelier
├── DOCUMENTATION.md        # Complete system and mathematical calibration guide
├── README.md               # Repository overview
├── static/                 # Jewellery transparent PNGs and desktop assets
│   ├── Image/
│   │   ├── Earring/        # Earring transparent PNG overlays
│   │   ├── Necklace/       # Necklace transparent PNG overlays
│   │   ├── Ring/           # Ring transparent PNG overlays
│   │   └── Bangle/         # Bangle transparent PNG overlays
│   └── icons/              # Desktop GUI icons
└── frontend/               # Standalone Next.js 15 Web Atelier
    ├── public/             # Static assets, 2D overlays, and MediaPipe WASM models
    └── src/
        ├── app/            # Next.js App Router pages (Home, Products, Studio)
        ├── ar-engine/      # Production AR Engine (detectors, PoseFitter, renderers)
        ├── features/       # Try-on stage, camera bridge, offline catalogue
        ├── components/     # Showroom components & navigation
        └── ui/             # Reusable UI component library
```

---

## 📄 License & Attribution

Lumière Luxury Virtual Jewellery Studio © 2026. All rights reserved.
