import type { PoseFit } from '../types.js';

/**
 * Phase 2 – Production Canvas2dRenderer.
 *
 * Enhancements:
 * - Image asset cache with LRU eviction and size tracking.
 * - Dynamic jewellery switching without re-creating the renderer.
 * - High-DPI canvas support (devicePixelRatio scaling).
 * - Layered compositing: video drawn once, landmarks and jewellery on top.
 * - Smooth opacity transitions when switching jewellery images.
 * - Export pipeline: high-quality PNG/JPEG capture at native resolution.
 * - Landmark draw mode: none / dots / debug.
 * - Shadow and glow effects for premium look.
 * - Off-screen rendering for capture without UI disruption.
 */

type DrawMode = 'none' | 'dots' | 'debug';

const MAX_CACHE_ENTRIES = 16;
const MAX_CACHE_BYTES   = 50 * 1024 * 1024;

export class Canvas2dRenderer {
  private image:          HTMLImageElement | null = null;
  private mirrorSecondary = false;
  private targetOpacity   = 1;
  private currentOpacity  = 1;
  private currentUrl      = '';

  // Image asset cache: URL → loaded HTMLImageElement with metadata
  private readonly imageCache = new Map<string, { img: HTMLImageElement; bytes: number; lastUsed: number }>();
  private totalCacheBytes = 0;

  // Preload queue: prevent parallel fetches for the same URL.
  private readonly loading = new Map<string, Promise<HTMLImageElement>>();

  // Offscreen canvas for HQ capture rendering
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx:    CanvasRenderingContext2D,
  ) {
    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  // ─── Asset Loading ─────────────────────────────────────────────────────────

  async loadOverlay(url: string, mirrorSecondary = false): Promise<void> {
    this.mirrorSecondary = mirrorSecondary;

    if (this.currentUrl === url) return; // already loaded

    // Fade out before switching.
    if (this.currentUrl !== '') {
      this.targetOpacity = 0;
      await this._waitOpacityReached(0, 6);
    }

    this.image = await this._loadCached(url);
    this.currentUrl = url;
    this.targetOpacity = 1;
  }

  /** Preload an image URL into cache without making it the active overlay. */
  async preload(url: string): Promise<void> {
    await this._loadCached(url);
  }

  /** Preload multiple URLs concurrently. */
  async preloadMany(urls: string[]): Promise<void> {
    await Promise.allSettled(urls.map((u) => this._loadCached(u)));
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  drawVideo(video: HTMLVideoElement, mirrored: boolean): void {
    const { width, height } = this.canvas;
    this.ctx.save();
    if (mirrored) {
      this.ctx.translate(width, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(video, 0, 0, width, height);
    this.ctx.restore();
  }

  drawJewellery(pose: PoseFit, secondary = false, kind?: string): void {
    if (!this.image || !pose.visible) return;

    // Advance opacity with smooth interpolation.
    if (this.currentOpacity !== this.targetOpacity) {
      this.currentOpacity += (this.targetOpacity - this.currentOpacity) * 0.25;
      if (Math.abs(this.currentOpacity - this.targetOpacity) < 0.02) {
        this.currentOpacity = this.targetOpacity;
      }
    }
    if (this.currentOpacity < 0.02) return;

    const img = this.image;
    const pos = secondary && pose.secondaryPosition ? pose.secondaryPosition : pose.position;

    const isNecklace =
      kind === 'NECKLACE' ||
      kind === 'PENDANT' ||
      kind === 'MANGALSUTRA' ||
      this.currentUrl.includes('neck') ||
      this.currentUrl.includes('pendant');

    let w: number;
    let h: number;
    let originX: number;
    let originY: number;

    const aspect = img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalHeight / img.naturalWidth
      : 260 / 320;

    const kindKey = (kind ?? '').toUpperCase();
    const isEarring = kindKey.includes('EARRING') || this.currentUrl.includes('earring');
    const isNose = kindKey.includes('NOSE');
    const isRing = kindKey === 'RINGS' || kindKey === 'RING';
    const isBangle =
      kindKey.includes('BANGLE') || kindKey.includes('BRACELET') || kindKey.includes('WATCH');

    if (isNecklace) {
      // Golden calibration from app.py: necklace_w = int(face_w * 1.50)
      const faceW = pose.scale * 100;
      w = Math.max(160, Math.min(560, faceW * 1.50));
      h = w * aspect;
      originX = -w / 2;
      originY = -h * 0.48; // Centered at neck base / suprasternal notch
    } else if (isEarring) {
      // Golden calibration from app.py: earring_w = max(14, int(face_width * 0.12))
      const faceW = pose.scale * 100;
      w = Math.max(14, Math.min(64, faceW * 0.12));
      h = w * aspect;
      originX = -w / 2;
      originY = -h * 0.10; // Hook loop attaches directly inside earlobe piercing
    } else if (isNose) {
      w = Math.max(10, Math.min(36, pose.scale * 14));
      h = w * aspect;
      originX = -w / 2;
      const isSeptum = this.currentUrl.includes('septum');
      originY = isSeptum ? -h * 0.28 : -h / 2;
    } else if (isRing) {
      // Golden calibration from app.py: raw_width = seg_len * 0.58, squashed by 0.70
      const refW = pose.scale * 100;
      w = Math.max(16, Math.min(80, refW * 0.35));
      h = w * 0.70; // Perspective ellipse squashing along finger axis
      originX = -w / 2;
      originY = -h / 2;
    } else if (isBangle) {
      // Golden calibration from app.py: target_w = palm_w * 1.22, tilt factor 0.35
      const palmW = pose.scale * 100;
      w = Math.max(35, Math.min(260, palmW * 1.22));
      h = w * 0.35; // Perspective ellipse squashing across wrist
      originX = -w / 2;
      originY = -h / 2;
    } else {
      w = Math.max(24, Math.min(140, pose.scale * 32));
      h = w * aspect;
      originX = -w / 2;
      originY = -h / 2;
    }

    let alpha = this.currentOpacity * (pose.confidence > 0 ? Math.min(1, pose.confidence + 0.3) : 1);

    // Head yaw fading thresholds for earrings:
    // |yaw| < 20 deg: show both earrings.
    // 20-45 deg: fade the far-side earring toward 0 opacity.
    // > 45 deg: hide the far earring completely, keep the near one attached.
    if (isEarring && pose.secondaryPosition && pose.yaw !== undefined) {
      const YAW_20_DEG = (20 * Math.PI) / 180; // ~0.349 rad
      const YAW_45_DEG = (45 * Math.PI) / 180; // ~0.785 rad
      const absYaw = Math.abs(pose.yaw);
      if (absYaw > YAW_20_DEG) {
        const fade = absYaw >= YAW_45_DEG
          ? 0
          : Math.max(0, 1 - (absYaw - YAW_20_DEG) / (YAW_45_DEG - YAW_20_DEG));
        const otherPos = secondary ? pose.position : pose.secondaryPosition;

        // When yaw > 0 (looking right): ear on screen right (larger X) goes behind head (far side).
        // When yaw < 0 (looking left): ear on screen left (smaller X) goes behind head (far side).
        let isFarSide = false;
        if (pos.z !== undefined && otherPos.z !== undefined && Math.abs(pos.z - otherPos.z) > 0.04) {
          isFarSide = pos.z > otherPos.z; // in MediaPipe, larger z is farther away
        } else {
          isFarSide = pose.yaw > 0 ? pos.x > otherPos.x : pos.x < otherPos.x;
        }

        if (isFarSide) {
          alpha *= fade;
        }
      }
    }

    if (alpha < 0.01) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.translate(pos.x, pos.y);
    this.ctx.rotate(pose.rotationZ);
    if (secondary && this.mirrorSecondary) {
      this.ctx.scale(-1, 1);
    }
    this.ctx.shadowColor   = 'rgba(0,0,0,0.16)';
    this.ctx.shadowBlur    = 3;
    this.ctx.shadowOffsetY = 1;
    this.ctx.shadowOffsetX = 0;
    this.ctx.drawImage(img, originX, originY, w, h);
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  clearJewellery(): void {
    this.image = null;
    this.currentUrl = '';
    this.currentOpacity = 1;
    this.targetOpacity = 1;
    this.clear();
  }

  hasActiveOverlay(): boolean {
    return this.image !== null;
  }

  getActiveUrl(): string {
    return this.currentUrl;
  }

  drawLandmarks(
    named:  Record<string, { x: number; y: number }>,
    keys:   string[],
    mode:   DrawMode = 'dots',
  ): void {
    if (mode === 'none') return;
    this.ctx.save();
    for (const key of keys) {
      const p = named[key];
      if (!p) continue;

      const color = key.includes('EAR') ? '#22c55e'
        : key.includes('RING') ? '#f59e0b'
        : key.includes('WRIST') || key.includes('BANGLE') ? '#a78bfa'
        : key.includes('NOSE') ? '#f472b6'
        : key.includes('NECKLACE') || key.includes('CHIN') ? '#06b6d4'
        : '#38bdf8';

      // Outer glow
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      this.ctx.fillStyle = color + '30';
      this.ctx.fill();

      // Inner dot
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();

      // Border
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();

      if (mode === 'debug') {
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.font = '9px monospace';
        this.ctx.fillText(key.replace(/_/g, ' '), p.x + 8, p.y + 3);
      }
    }
    this.ctx.restore();
  }

  /**
   * Diagnostic ?debug=1 overlay:
   * Renders detected landmarks, measured widths (shoulders, face),
   * anchor crosshair, and live performance metrics HUD.
   */
  drawDebugOverlay(options: {
    landmarks?: {
      kind: string;
      named: Record<string, { x: number; y: number }>;
      scaleRef?: number;
      shouldersVisible?: boolean;
    } | null;
    pose?: PoseFit | null;
    fps?: number;
    latencyMs?: number;
    status?: string;
  }): void {
    const { landmarks, pose, fps = 0, latencyMs = 0, status = 'UNKNOWN' } = options;
    const ctx = this.ctx;
    ctx.save();

    // 1. Draw Landmarks with labels
    if (landmarks?.named) {
      const named = landmarks.named;
      const keys = Object.keys(named).filter((k) => !k.endsWith('_ROT') && !k.endsWith('_WIDTH'));
      this.drawLandmarks(named, keys, 'debug');

      // 2. Draw Measured Widths
      // Shoulder span
      const ls = named['LEFT_SHOULDER'];
      const rs = named['RIGHT_SHOULDER'];
      if (ls && rs) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(ls.x, ls.y);
        ctx.lineTo(rs.x, rs.y);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (ls.x + rs.x) / 2;
        const midY = (ls.y + rs.y) / 2;
        const shoulderSpan = Math.hypot(rs.x - ls.x, rs.y - ls.y);

        ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
        ctx.fillRect(midX - 70, midY - 18, 140, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Shoulders: ${shoulderSpan.toFixed(0)}px`, midX, midY - 5);
      }

      // Face width (ear-to-ear or pupils)
      const le = named['LEFT_EAR'] ?? named['LEFT_EAR_LOBE'] ?? named['LEFT_EYE'];
      const re = named['RIGHT_EAR'] ?? named['RIGHT_EAR_LOBE'] ?? named['RIGHT_EYE'];
      if (le && re) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(le.x, le.y);
        ctx.lineTo(re.x, re.y);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        const faceMidX = (le.x + re.x) / 2;
        const faceMidY = (le.y + re.y) / 2;
        const faceSpan = Math.hypot(re.x - le.x, re.y - le.y);

        ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
        ctx.fillRect(faceMidX - 60, faceMidY - 18, 120, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Face: ${faceSpan.toFixed(0)}px`, faceMidX, faceMidY - 5);
      }
    }

    // 3. Draw Anchor Point Crosshair & Target Reticle
    if (pose?.position) {
      const { x, y } = pose.position;

      // Outer pulsing ring
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Inner reticle circle
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center crosshair lines
      ctx.beginPath();
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x, y + 14);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Anchor coordinate badge
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.fillRect(x + 16, y - 10, 115, 18);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`ANCHOR (${x.toFixed(0)}, ${y.toFixed(0)})`, x + 20, y + 3);
    }

    // 4. Live Diagnostic Performance HUD (top-left)
    const hudX = 14;
    const hudY = 14;
    const hudW = 168;
    const hudH = 108;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AR ENGINE DEBUG (?debug=1)', hudX + 8, hudY + 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = '9px monospace';
    ctx.fillText(`FPS:       ${fps}`, hudX + 8, hudY + 32);
    ctx.fillText(`LATENCY:   ${latencyMs.toFixed(1)} ms`, hudX + 8, hudY + 46);
    ctx.fillText(`STATUS:    ${status}`, hudX + 8, hudY + 60);
    ctx.fillText(`SCALE:     ${(pose?.scale ?? 1).toFixed(2)}`, hudX + 8, hudY + 74);
    ctx.fillText(`ROTATION:  ${(((pose?.rotationZ ?? 0) * 180) / Math.PI).toFixed(1)}°`, hudX + 8, hudY + 88);
    ctx.fillText(
      `SHOULDERS: ${landmarks?.shouldersVisible !== false ? 'VISIBLE' : 'OUT_OF_FRAME'}`,
      hudX + 8,
      hudY + 102,
    );

    ctx.restore();
  }

  // ─── Capture / Export ──────────────────────────────────────────────────────

  /**
   * Export the current canvas state as a Blob.
   * Composites video + overlay + jewellery at native resolution.
   */
  async exportBlob(
    sources: Array<HTMLVideoElement | HTMLCanvasElement>,
    mimeType = 'image/jpeg',
    quality  = 0.94,
  ): Promise<Blob> {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Reuse or create offscreen canvas
    if (!this.offscreenCanvas || this.offscreenCanvas.width !== w || this.offscreenCanvas.height !== h) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width  = w;
      this.offscreenCanvas.height = h;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }
    const octx = this.offscreenCtx;
    if (!octx) throw new Error('2D context unavailable for export');

    octx.clearRect(0, 0, w, h);
    for (const src of sources) {
      octx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      this.offscreenCanvas!.toBlob((b) => resolve(b), mimeType, quality),
    );
    if (!blob) throw new Error('Canvas export failed');
    return blob;
  }

  // ─── Cache Stats ───────────────────────────────────────────────────────────

  getCacheStats() {
    return {
      entries: this.imageCache.size,
      totalBytes: this.totalCacheBytes,
      maxBytes: MAX_CACHE_BYTES,
      urls: [...this.imageCache.keys()],
    };
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.image       = null;
    this.currentUrl  = '';
    this.imageCache.clear();
    this.loading.clear();
    this.totalCacheBytes = 0;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _loadCached(url: string): Promise<HTMLImageElement> {
    const hit = this.imageCache.get(url);
    if (hit) {
      hit.lastUsed = Date.now();
      return Promise.resolve(hit.img);
    }

    const inFlight = this.loading.get(url);
    if (inFlight) return inFlight;

    const p = loadImage(url).then((img) => {
      // Estimate memory usage
      const bytes = img.naturalWidth * img.naturalHeight * 4; // RGBA
      this._evictIfNeeded(bytes);

      this.imageCache.set(url, { img, bytes, lastUsed: Date.now() });
      this.totalCacheBytes += bytes;
      this.loading.delete(url);
      return img;
    });
    this.loading.set(url, p);
    return p;
  }

  /** LRU eviction to stay within byte and entry caps. */
  private _evictIfNeeded(incoming: number): void {
    // Sort by LRU (oldest lastUsed first).
    const entries = [...this.imageCache.entries()]
      .filter(([url]) => url !== this.currentUrl) // don't evict active
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    while (
      entries.length > 0 &&
      (
        this.totalCacheBytes + incoming > MAX_CACHE_BYTES ||
        this.imageCache.size >= MAX_CACHE_ENTRIES
      )
    ) {
      const [url, entry] = entries.shift()!;
      this.totalCacheBytes -= entry.bytes;
      this.imageCache.delete(url);
    }
  }

  private _waitOpacityReached(target: number, frames: number): Promise<void> {
    return new Promise((resolve) => {
      let n = 0;
      const check = () => {
        this.currentOpacity += (target - this.currentOpacity) * 0.35;
        if (++n >= frames || Math.abs(this.currentOpacity - target) < 0.02) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load overlay: ${url}`));
    img.src = url;
  });
}
