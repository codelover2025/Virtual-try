# Lumière — Standalone Frontend (No Backend Required)

This folder contains the complete, self-contained **Lumière Virtual Jewellery Try-On Storefront & AR Engine**. It has **zero backend or database dependencies** and runs 100% client-side in the browser.

---

## 💎 Features Included

- **Virtual AR Studio (`/studio`)**: Real-time webcam try-on across 5 categories:
  - **Earrings**: Dual earlobe landmark tracking with head-roll tilt and jaw depth occlusion.
  - **Necklaces**: Suprasternal notch & collarbone alignment with shoulder framing guidance and face fallback.
  - **Nose Rings**: Nostril alar groove stud vs. subnasale septum hoop alignment.
  - **Rings**: Metacarpophalangeal (MCP) finger tracking with finger-curl occlusion.
  - **Bangles**: Anatomical wrist tracking with forearm direction alignment.
- **On-Device Vision Models**: Bundled MediaPipe `.task` models and WASM runtimes under `/public/models/`. Video streams never leave the user's device.
- **Dual Rendering Pipeline**: Procedural WebGL PBR 3D rendering (Three.js) + calibrated 2D SVG overlay rendering.
- **Luxury Showcase**: Homepage, Product Detail pages, Category filters, and Lookbook snapshot downloads.
- **Built-in Offline Catalogue**: Pre-configured with all 10 fine jewellery products.

---

## 🚀 How to Run

Navigate into this `frontend` directory and run:

### Using pnpm (recommended):
```bash
cd frontend
pnpm install
pnpm dev
```

### Or using standard npm:
```bash
cd frontend
npm install
npm run dev
```

Then open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📁 Directory Structure

```
frontend/
├── public/
│   ├── assets/        # 2D SVG jewellery overlays and icons
│   └── models/        # Offline MediaPipe .task models and WASM runtimes
├── src/
│   ├── app/           # Next.js 15 App Router pages (Home, Studio, Catalog, Product)
│   ├── components/    # Navigation, layout, category switches, product cards
│   ├── features/      # Try-on experience stage, camera bridge, catalogue data
│   ├── ar-engine/     # Computer vision detectors, PoseFitter, 3D & 2D renderers
│   ├── ui/            # UI components (camera viewfinder, buttons, dialogs, badges)
│   ├── hooks/         # Responsive media queries, debouncing, local storage
│   ├── shared/        # Shared enums and jewellery constants
│   ├── types/         # TypeScript definitions
│   └── stores/        # Client-side Zustand stores
├── next.config.ts     # Standalone Next.js configuration
├── tailwind.config.ts # Luxury theme tokens and styling
└── tsconfig.json      # Path aliases mapping (@/*, @vj/ar-engine, @vj/ui, etc.)
```

