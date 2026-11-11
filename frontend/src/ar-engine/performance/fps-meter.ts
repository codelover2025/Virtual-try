/**
 * Phase 2 – Production FpsMeter.
 *
 * Enhancements:
 * - Per-frame delta tracking for per-frame latency.
 * - Min/Max/P95/P99 latency metrics.
 * - Rolling window: always shows "current" FPS, not 1-second stale.
 * - Dropped frame detection.
 * - Configurable window size.
 * - Frame time histogram for distribution analysis.
 */

export type FpsMetrics = {
  fps: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  droppedFrames: number;
  jankFrames: number;
  totalFrames: number;
};

export class FpsMeter {
  private timestamps: number[] = [];
  private deltas:     number[] = [];
  private fps         = 0;
  private lastTick    = 0;
  private droppedFrames = 0;
  private jankFrames    = 0;
  private totalFrames   = 0;

  // Frame time threshold for "jank" (>2x the expected frame time)
  private readonly jankThresholdMs: number;
  // Frame time threshold for "dropped" (>3x expected)
  private readonly dropThresholdMs: number;

  private readonly windowMs: number;
  private readonly maxDeltas: number;

  constructor(targetFps = 30, windowMs = 1500) {
    this.windowMs = windowMs;
    this.maxDeltas = Math.max(60, Math.ceil(targetFps * 2));
    this.jankThresholdMs = (1000 / targetFps) * 2;
    this.dropThresholdMs = (1000 / targetFps) * 3;
  }

  /** Call once per rendered frame. Returns current smoothed FPS. */
  tick(now = performance.now()): number {
    this.totalFrames++;

    if (this.lastTick > 0) {
      const dt = now - this.lastTick;
      this.deltas.push(dt);
      if (this.deltas.length > this.maxDeltas) this.deltas.shift();

      // Detect jank and drops
      if (dt > this.dropThresholdMs) {
        this.droppedFrames++;
        this.jankFrames++;
      } else if (dt > this.jankThresholdMs) {
        this.jankFrames++;
      }
    }
    this.lastTick = now;

    this.timestamps.push(now);
    // Keep only timestamps within the rolling window.
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= 2) {
      const span = now - this.timestamps[0]!;
      this.fps = span > 0 ? ((this.timestamps.length - 1) * 1000) / span : 0;
    }

    return this.fps;
  }

  getFps(): number {
    return this.fps;
  }

  /** Mean frame latency over recent window (ms). */
  getMeanLatency(): number {
    if (this.deltas.length === 0) return 0;
    return this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
  }

  /** Nth-percentile frame latency (ms). */
  getPercentileLatency(percentile: number): number {
    if (this.deltas.length === 0) return 0;
    const sorted = [...this.deltas].sort((a, b) => a - b);
    const idx    = Math.floor(sorted.length * (percentile / 100));
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
  }

  /** 95th-percentile frame latency (ms). */
  getP95Latency(): number {
    return this.getPercentileLatency(95);
  }

  /** 99th-percentile frame latency (ms). */
  getP99Latency(): number {
    return this.getPercentileLatency(99);
  }

  getMaxLatency(): number {
    return this.deltas.length > 0 ? Math.max(...this.deltas) : 0;
  }

  getMinLatency(): number {
    return this.deltas.length > 0 ? Math.min(...this.deltas) : 0;
  }

  getDroppedFrames(): number {
    return this.droppedFrames;
  }

  getJankFrames(): number {
    return this.jankFrames;
  }

  /** Get comprehensive metrics snapshot. */
  getMetrics(): FpsMetrics {
    return {
      fps: this.fps,
      meanLatencyMs: this.getMeanLatency(),
      p95LatencyMs: this.getP95Latency(),
      p99LatencyMs: this.getP99Latency(),
      maxLatencyMs: this.getMaxLatency(),
      minLatencyMs: this.getMinLatency(),
      droppedFrames: this.droppedFrames,
      jankFrames: this.jankFrames,
      totalFrames: this.totalFrames,
    };
  }

  reset(): void {
    this.timestamps    = [];
    this.deltas        = [];
    this.fps           = 0;
    this.lastTick      = 0;
    this.droppedFrames = 0;
    this.jankFrames    = 0;
    this.totalFrames   = 0;
  }
}
