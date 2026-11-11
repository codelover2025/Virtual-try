import type { CaptureOptions, CaptureResult } from '../types.js';

/**
 * Phase 2 – Production CaptureCompositor.
 *
 * Enhancements:
 * - High-quality PNG export via reusable offscreen canvas.
 * - Format fallback ladder: tries requested → WebP → JPEG → PNG.
 * - Mirror-aware compositing: flip canvas for front-camera captures.
 * - Thumbnail generation with center crop and configurable size.
 * - Watermark support (optional branding overlay).
 * - Multi-resolution export: full-res + thumbnail in single call.
 * - Canvas pooling: reuses offscreen canvases to reduce GC pressure.
 * - Background processing: non-blocking blob conversion.
 */

type WatermarkConfig = {
  text: string;
  font?: string;
  color?: string;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  opacity?: number;
};

export class CaptureCompositor {
  // Canvas pool for reuse
  private canvasPool: HTMLCanvasElement[] = [];
  private watermark: WatermarkConfig | null = null;

  /** Set a watermark to apply to all captures. */
  setWatermark(config: WatermarkConfig | null): void {
    this.watermark = config;
  }

  /**
   * Composite all sources into a single Blob.
   * @param sources  Ordered list of video/canvas elements to paint bottom-to-top.
   * @param mirrored If true, flip horizontally (front-camera preview correction).
   * @param mimeType Target MIME type (tries WebP first, falls back to JPEG).
   * @param quality  Encoder quality 0–1.
   */
  async toBlob(
    sources:  Array<HTMLCanvasElement | HTMLVideoElement>,
    mirrored  = false,
    mimeType  = 'image/jpeg',
    quality   = 0.94,
  ): Promise<Blob> {
    const base   = sources[0];
    if (!base)   throw new Error('No capture source');

    const width  = 'videoWidth'  in base ? base.videoWidth  : base.width;
    const height = 'videoHeight' in base ? base.videoHeight : base.height;
    if (!width || !height) throw new Error('Source has no dimensions');

    const canvas = this._getCanvas(width, height);
    const ctx    = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('2D context unavailable');

    ctx.clearRect(0, 0, width, height);

    if (mirrored) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      for (const src of sources) {
        try {
          ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
        } catch {
          // skip un-drawable source
        }
      }
      ctx.restore();
    } else {
      for (const src of sources) {
        try {
          ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
        } catch {
          // skip un-drawable source
        }
      }
    }

    // Apply watermark if configured
    if (this.watermark) {
      this._drawWatermark(ctx, width, height, this.watermark);
    }

    const blob = await this._canvasToBlob(canvas, mimeType, quality);
    this._returnCanvas(canvas);
    return blob;
  }

  /**
   * High-quality capture: returns both full-res blob and optional thumbnail.
   */
  async captureHQ(
    sources: Array<HTMLCanvasElement | HTMLVideoElement>,
    mirrored = false,
    options: CaptureOptions = {},
  ): Promise<CaptureResult> {
    const base = sources[0];
    if (!base) throw new Error('No capture source');

    const width  = 'videoWidth'  in base ? base.videoWidth  : base.width;
    const height = 'videoHeight' in base ? base.videoHeight : base.height;

    const mime    = options.mimeType ?? 'image/jpeg';
    const quality = options.quality  ?? 0.94;

    const blob = await this.toBlob(sources, mirrored, mime, quality);

    let thumbnailBlob: Blob | undefined;
    if (options.thumbnail) {
      thumbnailBlob = await this.toThumbnailBlob(sources, 400, mirrored);
    }

    return { blob, thumbnailBlob, width, height, mimeType: mime };
  }

  /**
   * Generate a square thumbnail Blob at targetSize × targetSize (center crop).
   */
  async toThumbnailBlob(
    sources:    Array<HTMLCanvasElement | HTMLVideoElement>,
    targetSize  = 400,
    mirrored    = false,
  ): Promise<Blob> {
    const base   = sources[0];
    if (!base)   throw new Error('No capture source');

    const srcW   = 'videoWidth'  in base ? base.videoWidth  : base.width;
    const srcH   = 'videoHeight' in base ? base.videoHeight : base.height;

    // Center-crop to square.
    const cropSize = Math.min(srcW, srcH);
    const sx = (srcW - cropSize) / 2;
    const sy = (srcH - cropSize) / 2;

    const thumb = this._getCanvas(targetSize, targetSize);
    const ctx   = thumb.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Thumb context unavailable');

    ctx.clearRect(0, 0, targetSize, targetSize);

    if (mirrored) {
      ctx.save();
      ctx.translate(targetSize, 0);
      ctx.scale(-1, 1);
      for (const src of sources) {
        try {
          ctx.drawImage(
            src as CanvasImageSource,
            sx, sy, cropSize, cropSize,
            0,  0,  targetSize, targetSize,
          );
        } catch { /* skip */ }
      }
      ctx.restore();
    } else {
      for (const src of sources) {
        try {
          ctx.drawImage(
            src as CanvasImageSource,
            sx, sy, cropSize, cropSize,
            0,  0,  targetSize, targetSize,
          );
        } catch { /* skip */ }
      }
    }

    const blob = await this._canvasToBlob(thumb, 'image/jpeg', 0.88);
    this._returnCanvas(thumb);
    return blob;
  }

  /**
   * Export at a specific resolution (e.g. for sharing).
   */
  async toResizedBlob(
    sources:  Array<HTMLCanvasElement | HTMLVideoElement>,
    targetWidth: number,
    targetHeight: number,
    mirrored = false,
    mimeType = 'image/jpeg',
    quality  = 0.90,
  ): Promise<Blob> {
    const canvas = this._getCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');

    ctx.clearRect(0, 0, targetWidth, targetHeight);

    if (mirrored) {
      ctx.save();
      ctx.translate(targetWidth, 0);
      ctx.scale(-1, 1);
      for (const src of sources) {
        try {
          ctx.drawImage(src as CanvasImageSource, 0, 0, targetWidth, targetHeight);
        } catch { /* skip */ }
      }
      ctx.restore();
    } else {
      for (const src of sources) {
        try {
          ctx.drawImage(src as CanvasImageSource, 0, 0, targetWidth, targetHeight);
        } catch { /* skip */ }
      }
    }

    if (this.watermark) {
      this._drawWatermark(ctx, targetWidth, targetHeight, this.watermark);
    }

    const blob = await this._canvasToBlob(canvas, mimeType, quality);
    this._returnCanvas(canvas);
    return blob;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _getCanvas(width: number, height: number): HTMLCanvasElement {
    // Try to reuse a pooled canvas
    const canvas = this.canvasPool.pop() ?? document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    return canvas;
  }

  private _returnCanvas(canvas: HTMLCanvasElement): void {
    // Keep max 3 canvases in the pool
    if (this.canvasPool.length < 3) {
      this.canvasPool.push(canvas);
    }
  }

  private _drawWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    wm: WatermarkConfig,
  ): void {
    ctx.save();
    ctx.globalAlpha = wm.opacity ?? 0.4;
    ctx.fillStyle = wm.color ?? 'rgba(255,255,255,0.8)';
    ctx.font = wm.font ?? `${Math.max(12, Math.round(width * 0.018))}px sans-serif`;

    const measured = ctx.measureText(wm.text);
    const textHeight = Math.max(12, Math.round(width * 0.018));
    const padding = Math.round(width * 0.02);

    let x: number;
    let y = height - padding;

    switch (wm.position ?? 'bottom-right') {
      case 'bottom-left':
        x = padding;
        break;
      case 'bottom-center':
        x = (width - measured.width) / 2;
        break;
      case 'bottom-right':
      default:
        x = width - measured.width - padding;
        break;
    }

    ctx.fillText(wm.text, x, y);
    ctx.restore();
  }

  private _canvasToBlob(
    canvas:   HTMLCanvasElement,
    mimeType: string,
    quality:  number,
  ): Promise<Blob> {
    const types = [mimeType, 'image/webp', 'image/jpeg', 'image/png'];

    const tryNext = (idx: number): Promise<Blob> => {
      if (idx >= types.length) return Promise.reject(new Error('Capture failed'));
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else   tryNext(idx + 1).then(resolve).catch(reject);
          },
          types[idx],
          quality,
        );
      });
    };

    return tryNext(0);
  }
}
