/**
 * Samples a small region of the camera frame and returns mean luminance in 0..1.
 * The engine uses this to lift Three.js exposure when the face is under-lit.
 */
export class LightingEstimator {
  private readonly canvas: HTMLCanvasElement | null =
    typeof document !== 'undefined' ? document.createElement('canvas') : null;
  private readonly ctx: CanvasRenderingContext2D | null = null;

  constructor() {
    if (this.canvas) {
      this.canvas.width = 24;
      this.canvas.height = 24;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
  }

  estimate(
    video: HTMLVideoElement,
    region?: { x: number; y: number; size: number },
  ): number {
    const ctx = this.ctx;
    if (!ctx || video.videoWidth < 2 || video.readyState < 2) return 0.5;

    const size = Math.max(32, Math.min(video.videoWidth, region?.size ?? video.videoWidth * 0.35));
    const cx = region?.x ?? video.videoWidth / 2;
    const cy = region?.y ?? video.videoHeight / 2;
    const sx = Math.max(0, Math.min(video.videoWidth - size, cx - size / 2));
    const sy = Math.max(0, Math.min(video.videoHeight - size, cy - size / 2));

    ctx.drawImage(video, sx, sy, size, size, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return Math.max(0, Math.min(1, sum / pixels / 255));
  }
}
