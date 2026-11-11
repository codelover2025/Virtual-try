import type { LandmarkResult, Vec2 } from '../types.js';

export type ProcessorOptions = {
  confidenceThreshold?: number;
  jumpThresholdMul?: number;
  /** EMA alpha for position smoothing (0 = no update, 1 = raw). */
  emaAlpha?: number;
  /** Alpha applied to scaleRef smoothing. */
  scaleAlpha?: number;
  /** Duration to hold last good landmarks before degrading (ms). */
  holdMs?: number;
  /** Duration before declaring total LOST (ms). */
  lostMs?: number;
  /** Kalman-style velocity damping factor. */
  velocityDamp?: number;
  /** Maximum velocity-extrapolation frames. */
  maxPredictFrames?: number;
};

type KalmanPoint = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;  // acceleration for 2nd-order prediction
  ay: number;
};

export type ProcessorMetrics = {
  ageMs: number;
  lost: boolean;
  holdingPrevious: boolean;
  predicting: boolean;
  jumpRejected: boolean;
  smoothedScale: number;
};

/**
 * Phase 2 – Production LandmarkProcessor.
 *
 * Enhancements:
 * - Second-order Kalman prediction with acceleration term.
 * - Per-point adaptive EMA with distance-proportional alpha.
 * - Velocity-aware jump detection with hysteresis.
 * - Separate EMA for scaleRef with slow-start ramp.
 * - Confidence-gated update with temporal hold.
 * - Multi-stage hold: HOLD → PREDICT → DEGRADE → LOST.
 * - Jitter suppression: dead-zone filter for sub-pixel movements.
 * - Metrics output for diagnostics.
 */
export class LandmarkProcessor {
  private prev: LandmarkResult | null = null;
  private kalman: Record<string, KalmanPoint> = {};
  private smoothedScale = 0;
  private lastGoodAt = 0;
  private consecutiveGood = 0;

  private readonly confidenceThreshold: number;
  private readonly jumpThresholdMul: number;
  private readonly emaAlpha: number;
  private readonly scaleAlpha: number;
  private readonly holdMs: number;
  private readonly lostMs: number;
  private readonly velocityDamp: number;
  private readonly maxPredictFrames: number;

  // Jitter dead-zone: ignore movements smaller than this (in px)
  private readonly deadZonePx = 0.5;

  constructor(options: ProcessorOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.48;
    this.jumpThresholdMul    = options.jumpThresholdMul    ?? 2.0;
    this.emaAlpha            = options.emaAlpha            ?? 0.30;
    this.scaleAlpha          = options.scaleAlpha          ?? 0.20;
    this.holdMs              = options.holdMs              ?? 200;
    this.lostMs              = options.lostMs              ?? 650;
    this.velocityDamp        = options.velocityDamp        ?? 0.72;
    this.maxPredictFrames    = options.maxPredictFrames    ?? 4;
  }

  process(
    raw: LandmarkResult | null,
    now = performance.now(),
  ): { result: LandmarkResult | null; ageMs: number; lost: boolean; metrics: ProcessorMetrics } {
    const age = now - this.lastGoodAt;
    const baseMetrics: ProcessorMetrics = {
      ageMs: age,
      lost: false,
      holdingPrevious: false,
      predicting: false,
      jumpRejected: false,
      smoothedScale: this.smoothedScale,
    };

    // ── Low confidence or missing result ──────────────────────────────────
    if (!raw || raw.confidence < this.confidenceThreshold) {
      this.consecutiveGood = 0;

      if (this.prev && age < this.holdMs) {
        // Stage 1: HOLD – return last good pose unchanged
        return {
          result: this.prev,
          ageMs: age,
          lost: false,
          metrics: { ...baseMetrics, holdingPrevious: true },
        };
      }

      if (this.prev && age < this.holdMs + this.maxPredictFrames * 16.67) {
        // Stage 2: PREDICT – extrapolate with velocity
        const predicted = this._predictAllPoints(age);
        return {
          result: predicted ?? this.prev,
          ageMs: age,
          lost: false,
          metrics: { ...baseMetrics, predicting: true },
        };
      }

      const lostNow = age >= this.lostMs;
      return {
        result: lostNow ? null : this.prev,
        ageMs: age,
        lost: lostNow,
        metrics: { ...baseMetrics, lost: lostNow, holdingPrevious: !lostNow },
      };
    }

    // ── Jump guard with velocity-aware threshold ───────────────────────────
    if (this.prev) {
      const anchorKey = raw.kind === 'face' ? 'NOSE_TIP' : 'WRIST';
      const rawAnchor = raw.named[anchorKey];
      const prevAnchor = this.prev.named[anchorKey];

      if (rawAnchor && prevAnchor) {
        const dist = Math.hypot(rawAnchor.x - prevAnchor.x, rawAnchor.y - prevAnchor.y);
        const expectedVel = Math.hypot(
          this.kalman[anchorKey]?.vx ?? 0,
          this.kalman[anchorKey]?.vy ?? 0,
        );
        const dynamicThreshold = raw.scaleRef * this.jumpThresholdMul + expectedVel * 3;

        if (dist > dynamicThreshold) {
          // Large jump → probably a spurious detection; hold current pose.
          const age2 = now - this.lastGoodAt;
          return {
            result: this.prev,
            ageMs: age2,
            lost: false,
            metrics: { ...baseMetrics, ageMs: age2, jumpRejected: true },
          };
        }
      }
    }

    // ── Update Kalman state and smooth landmarks ───────────────────────────
    this.consecutiveGood++;
    const named: LandmarkResult['named'] = {};

    // Use a ramp-up alpha for the first few frames to converge faster
    const rampFactor = Math.min(1, this.consecutiveGood / 8);
    const baseAlpha = this.emaAlpha;

    for (const [key, point] of Object.entries(raw.named)) {
      if (isPoseMetadata(key)) {
        named[key] = { ...point };
        continue;
      }
      const prev = this.kalman[key];

      if (!prev) {
        this.kalman[key] = { x: point.x, y: point.y, vx: 0, vy: 0, ax: 0, ay: 0 };
        named[key] = { ...point, x: point.x, y: point.y };
        continue;
      }

      // Adaptive alpha: proportional to the normalised distance from estimate.
      const dist = Math.hypot(point.x - prev.x, point.y - prev.y);
      const normDist = Math.min(1, dist / Math.max(1, raw.scaleRef * 0.5));

      // Dead-zone filter: ignore sub-pixel jitter
      if (dist < this.deadZonePx) {
        named[key] = { ...point, x: prev.x, y: prev.y };
        continue;
      }

      const alpha = (baseAlpha + normDist * (1 - baseAlpha) * 0.6) * rampFactor + (1 - rampFactor);

      const newX = prev.x + (point.x - prev.x) * alpha;
      const newY = prev.y + (point.y - prev.y) * alpha;

      const newVx = (newX - prev.x);
      const newVy = (newY - prev.y);

      const vx = newVx * this.velocityDamp;
      const vy = newVy * this.velocityDamp;

      // Second-order: track acceleration for prediction
      const ax = (vx - prev.vx) * 0.5;
      const ay = (vy - prev.vy) * 0.5;

      this.kalman[key] = { x: newX, y: newY, vx, vy, ax, ay };
      named[key] = { ...point, x: newX, y: newY };
    }

    // Prune kalman entries that are no longer in the result
    for (const key of Object.keys(this.kalman)) {
      if (!(key in raw.named)) {
        delete this.kalman[key];
      }
    }

    // ── Smooth scaleRef ───────────────────────────────────────────────────
    const scaleAlpha = this.smoothedScale > 0
      ? this.scaleAlpha * rampFactor + (1 - rampFactor)
      : 1;
    const smoothedScale = this.smoothedScale > 0
      ? this.smoothedScale + (raw.scaleRef - this.smoothedScale) * scaleAlpha
      : raw.scaleRef;
    this.smoothedScale = smoothedScale;

    const result: LandmarkResult = { ...raw, named, scaleRef: smoothedScale };
    this.prev = result;
    this.lastGoodAt = now;

    return {
      result,
      ageMs: 0,
      lost: false,
      metrics: { ...baseMetrics, ageMs: 0, smoothedScale },
    };
  }

  reset(): void {
    this.prev = null;
    this.kalman = {};
    this.smoothedScale = 0;
    this.lastGoodAt = 0;
    this.consecutiveGood = 0;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Predict all tracked points forward using stored velocity + acceleration. */
  private _predictAllPoints(elapsedMs: number): LandmarkResult | null {
    if (!this.prev) return null;
    const dt = Math.min(elapsedMs / 16.67, this.maxPredictFrames);
    const named: LandmarkResult['named'] = {};

    for (const [key, point] of Object.entries(this.prev.named)) {
      const k = this.kalman[key];
      if (!k) { named[key] = point; continue; }

      // 2nd-order prediction: x + v*dt + 0.5*a*dt²
      named[key] = {
        ...point,
        x: k.x + k.vx * dt + 0.5 * k.ax * dt * dt,
        y: k.y + k.vy * dt + 0.5 * k.ay * dt * dt,
      };
    }
    return { ...this.prev, named };
  }
}

function isPoseMetadata(key: string): boolean {
  return (
    key === 'HEAD_ROLL' ||
    key === 'HEAD_YAW' ||
    key === 'HANDEDNESS' ||
    key === 'PALM_NORMAL' ||
    key === 'BANGLE_ROT' ||
    key === 'SHOULDER_ROT' ||
    key === 'WRIST_DIR' ||
    key.endsWith('_WIDTH') ||
    key.startsWith('FINGER_DIR_') ||
    key.startsWith('FINGER_CURL_') ||
    key.startsWith('RING_ROT_')
  );
}

export type { Vec2 };
