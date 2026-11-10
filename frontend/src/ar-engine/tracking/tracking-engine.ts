import type { PoseFit, TrackingStatus } from '../types.js';

export type TrackingEngineOptions = {
  loseAfterMs?: number;
  degradeAfterMs?: number;
  minConfidence?: number;
  /** Grace window after LOST before re-initializing (prevents flicker). */
  reacquireDelayMs?: number;
  /** Number of consecutive high-confidence frames needed to enter TRACKING. */
  acquireFrames?: number;
  initTimeoutMs?: number;
};

export type TrackingMetrics = {
  status: TrackingStatus;
  meanConfidence: number;
  trackingDurationMs: number;
  lostCount: number;
  reacquireCount: number;
  frameCount: number;
  consecutiveTracking: number;
};

/**
 * Phase 2 – Production TrackingEngine.
 *
 * Enhancements:
 * - Multi-frame acquire gate: requires N consecutive good frames before TRACKING.
 * - Confidence hysteresis with separate enter/exit thresholds.
 * - Reacquire delay to prevent rapid flicker.
 * - Per-session tracking metrics for analytics.
 * - Tracking duration accumulator.
 * - Lost/reacquire counters.
 * - Status change callbacks with previous status context.
 */
export class TrackingEngine {
  private status: TrackingStatus = 'INITIALIZING';
  private lastVisibleAt = 0;
  private lastReacquiredAt = 0;
  private confidenceAccum = 0;
  private frameCount = 0;
  private initStartAt = 0;
  private readonly initTimeoutMs: number;

  // Multi-frame acquire gate
  private consecutiveGood = 0;
  private consecutiveTracking = 0;

  // Analytics
  private trackingStartAt = 0;
  private totalTrackingMs = 0;
  private lostCount = 0;
  private reacquireCount = 0;

  private readonly loseAfterMs: number;
  private readonly degradeAfterMs: number;
  private readonly minConfidence: number;
  private readonly reacquireDelayMs: number;
  private readonly acquireFrames: number;

  private onStatusChange?: (status: TrackingStatus, prev: TrackingStatus) => void;

  constructor(options: TrackingEngineOptions = {}) {
    this.loseAfterMs       = options.loseAfterMs       ?? 700;
    this.degradeAfterMs    = options.degradeAfterMs    ?? 220;
    this.minConfidence     = options.minConfidence     ?? 0.48;
    this.reacquireDelayMs  = options.reacquireDelayMs  ?? 150;
    this.acquireFrames     = options.acquireFrames     ?? 2;
    this.initTimeoutMs     = options.initTimeoutMs     ?? 2500;
    this.initStartAt       = performance.now();
  }

  setStatusChangeCallback(cb: (status: TrackingStatus, prev?: TrackingStatus) => void): void {
    this.onStatusChange = cb;
  }

  update(pose: PoseFit, now = performance.now()): TrackingStatus {
    this.frameCount++;
    this.confidenceAccum += pose.confidence;

    const highConf  = pose.visible && pose.confidence >= this.minConfidence;
    const passEntry = pose.visible && pose.confidence >= this.minConfidence + 0.05; // hysteresis
    const elapsed   = now - this.lastVisibleAt;

    if (highConf) {
      this.lastVisibleAt = now;
      this.consecutiveGood++;

      if (this.status === 'TRACKING') {
        this.consecutiveTracking++;
        return this.status;
      }

      // Multi-frame acquire gate: need N consecutive good frames
      const hasEnoughFrames = this.consecutiveGood >= this.acquireFrames;
      const reacquireOk = now - this.lastReacquiredAt >= this.reacquireDelayMs;
      const eligibleForTracking = passEntry && hasEnoughFrames && (
        this.status === 'INITIALIZING' || reacquireOk
      );

      if (eligibleForTracking) {
        this.lastReacquiredAt = now;
        if (this.status === 'LOST' || this.status === 'DEGRADED') {
          this.reacquireCount++;
        }
        this.trackingStartAt = now;
        this.consecutiveTracking = 0;
        this._setStatus('TRACKING');
      }
      return this.status;
    }

    // Reset consecutive good counter on bad frame
    this.consecutiveGood = 0;
    this.consecutiveTracking = 0;

    if (this.status === 'INITIALIZING') {
      if (now - this.initStartAt >= this.initTimeoutMs) {
        this._setStatus('LOST');
      }
      return this.status;
    }

    // Accumulate tracking duration when transitioning away
    if (this.status === 'TRACKING' && this.trackingStartAt > 0) {
      this.totalTrackingMs += now - this.trackingStartAt;
      this.trackingStartAt = 0;
    }

    if (elapsed >= this.loseAfterMs) {
      if (this.status !== 'LOST') {
        this.lostCount++;
      }
      this._setStatus('LOST');
    } else if (elapsed >= this.degradeAfterMs) {
      this._setStatus('DEGRADED');
    }

    return this.status;
  }

  getStatus(): TrackingStatus {
    return this.status;
  }

  /** Mean confidence over all frames since last reset. */
  getMeanConfidence(): number {
    if (this.frameCount === 0) return 0;
    return this.confidenceAccum / this.frameCount;
  }

  /** Get comprehensive tracking metrics for analytics. */
  getMetrics(): TrackingMetrics {
    return {
      status: this.status,
      meanConfidence: this.getMeanConfidence(),
      trackingDurationMs: this.totalTrackingMs +
        (this.status === 'TRACKING' && this.trackingStartAt > 0
          ? performance.now() - this.trackingStartAt
          : 0),
      lostCount: this.lostCount,
      reacquireCount: this.reacquireCount,
      frameCount: this.frameCount,
      consecutiveTracking: this.consecutiveTracking,
    };
  }

  reset(): void {
    this.status             = 'INITIALIZING';
    this.lastVisibleAt      = 0;
    this.lastReacquiredAt   = 0;
    this.confidenceAccum    = 0;
    this.frameCount         = 0;
    this.consecutiveGood    = 0;
    this.consecutiveTracking = 0;
    this.trackingStartAt    = 0;
    this.totalTrackingMs    = 0;
    this.lostCount          = 0;
    this.reacquireCount     = 0;
    this.initStartAt        = performance.now();
  }

  private _setStatus(next: TrackingStatus): void {
    if (this.status === next) return;
    const prev = this.status;
    this.status = next;
    this.onStatusChange?.(next, prev);
  }
}
