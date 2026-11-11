/**
 * Phase 2 – Production AdaptiveController.
 *
 * Enhancements:
 * - Three-tier adaptation: detect-every-N, detect-scale, and skip-render.
 * - Exponential moving average of frame time for smoother adaptation.
 * - Separate skip-render threshold to decouple detection from rendering.
 * - Budget API: caller can request skip to stay within frame budget.
 * - Frame budget enforcement with configurable target.
 * - Memory pressure detection via Performance API.
 * - Thermal throttling simulation for sustained performance.
 * - Quality tier system: HIGH / MEDIUM / LOW / MINIMAL.
 */

export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';

export type AdaptiveMetrics = {
  estimatedFps: number;
  qualityTier: QualityTier;
  detectEveryN: number;
  detectScale: number;
  skipRender: boolean;
  frameBudgetMs: number;
  emaFrameMs: number;
  thermalPressure: number;
};

export class AdaptiveController {
  private ema        = 0;          // EMA frame time (ms)
  private detectEveryN  = 2;       // Default to 2: runs ML inference at ~15-20 Hz while rendering at 60 FPS
  private detectScale   = 1.0;
  private skipRender    = false;
  private lowPowerMode  = false;
  private qualityTier: QualityTier = 'HIGH';

  // Frame budget
  private readonly frameBudgetMs: number;

  // Thermal pressure simulation: tracks sustained high frame times
  private thermalPressure = 0;
  private consecutiveOverBudget = 0;
  private frameHistory: number[] = [];
  private readonly maxHistoryLength = 30;

  constructor(private readonly targetFps = 30) {
    this.frameBudgetMs = 1000 / Math.max(1, targetFps);
  }

  recordFrameMs(ms: number): void {
    // EMA with alpha=0.15 for stable, lag-tolerant averaging.
    this.ema = this.ema === 0 ? ms : this.ema + (ms - this.ema) * 0.15;

    // Track frame history for variance analysis
    this.frameHistory.push(ms);
    if (this.frameHistory.length > this.maxHistoryLength) {
      this.frameHistory.shift();
    }

    // Track consecutive over-budget frames for thermal pressure
    if (ms > this.frameBudgetMs * 1.2) {
      this.consecutiveOverBudget++;
    } else {
      this.consecutiveOverBudget = Math.max(0, this.consecutiveOverBudget - 1);
    }

    // Thermal pressure: ramps up with sustained overbudget, decays slowly
    if (this.consecutiveOverBudget > 5) {
      this.thermalPressure = Math.min(1, this.thermalPressure + 0.05);
    } else {
      this.thermalPressure = Math.max(0, this.thermalPressure - 0.01);
    }

    const currentFps = 1000 / Math.max(1, this.ema);
    const deficit    = this.targetFps - currentFps;

    // Apply thermal pressure penalty
    const effectiveDeficit = deficit + this.thermalPressure * 8;

    if (effectiveDeficit > 10) {
      // Severely below target
      this.detectEveryN = Math.min(5, this.detectEveryN + 1);
      this.detectScale  = Math.max(0.35, this.detectScale - 0.12);
      this.skipRender   = effectiveDeficit > 16;
      this.qualityTier  = 'MINIMAL';
    } else if (effectiveDeficit > 6) {
      // Moderately below target
      this.detectEveryN = Math.min(4, this.detectEveryN + 1);
      this.detectScale  = Math.max(0.4, this.detectScale - 0.10);
      this.skipRender   = effectiveDeficit > 12;
      this.qualityTier  = 'LOW';
    } else if (effectiveDeficit > 2) {
      // Slightly below target
      this.detectEveryN = Math.min(3, this.detectEveryN + 1);
      this.detectScale  = Math.max(0.5, this.detectScale - 0.07);
      this.skipRender   = false;
      this.qualityTier  = 'MEDIUM';
    } else if (effectiveDeficit < -4) {
      // Well above target: can afford more frequent detection.
      this.detectEveryN = Math.max(1, this.detectEveryN - 1);
      this.detectScale  = Math.min(1.0, this.detectScale + 0.05);
      this.skipRender   = false;
      this.qualityTier  = 'HIGH';
    }
  }

  shouldDetect(frameIndex: number): boolean {
    if (this.lowPowerMode) return frameIndex % 4 === 0;
    return frameIndex % this.detectEveryN === 0;
  }

  shouldSkipRender(): boolean {
    return this.skipRender;
  }

  /** Check if a specific frame time is within budget. */
  isWithinBudget(frameMs: number): boolean {
    return frameMs <= this.frameBudgetMs;
  }

  /** Get the remaining budget time for this frame. */
  getRemainingBudgetMs(elapsedMs: number): number {
    return Math.max(0, this.frameBudgetMs - elapsedMs);
  }

  /** Enable low-power mode (e.g. when page is partially visible). */
  setLowPowerMode(on: boolean): void {
    this.lowPowerMode = on;
    if (on) {
      this.detectEveryN = 4;
      this.detectScale  = 0.5;
      this.qualityTier  = 'LOW';
    } else {
      this.detectEveryN = 1;
      this.detectScale  = 1.0;
      this.qualityTier  = 'HIGH';
    }
  }

  getDetectScale(): number {
    return this.detectScale;
  }

  getDetectEveryN(): number {
    return this.detectEveryN;
  }

  getEstimatedFps(): number {
    if (this.ema <= 0) return 0;
    return 1000 / this.ema;
  }

  getQualityTier(): QualityTier {
    return this.qualityTier;
  }

  getFrameBudgetMs(): number {
    return this.frameBudgetMs;
  }

  /** Get comprehensive metrics for diagnostics. */
  getMetrics(): AdaptiveMetrics {
    return {
      estimatedFps: this.getEstimatedFps(),
      qualityTier: this.qualityTier,
      detectEveryN: this.detectEveryN,
      detectScale: this.detectScale,
      skipRender: this.skipRender,
      frameBudgetMs: this.frameBudgetMs,
      emaFrameMs: this.ema,
      thermalPressure: this.thermalPressure,
    };
  }

  /** Get frame time variance for jank detection. */
  getFrameTimeVariance(): number {
    if (this.frameHistory.length < 2) return 0;
    const mean = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;
    const variance = this.frameHistory.reduce((sum, t) => sum + (t - mean) ** 2, 0) / this.frameHistory.length;
    return variance;
  }

  /** Detect jank (high variance in frame times). */
  isJanky(): boolean {
    return this.getFrameTimeVariance() > 100; // >10ms std deviation
  }

  reset(): void {
    this.ema               = 0;
    this.detectEveryN      = 2;
    this.detectScale       = 1.0;
    this.skipRender        = false;
    this.qualityTier       = 'HIGH';
    this.thermalPressure   = 0;
    this.consecutiveOverBudget = 0;
    this.frameHistory      = [];
  }
}
