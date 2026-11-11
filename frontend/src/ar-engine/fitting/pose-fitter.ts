import type { AnchorProfile, LandmarkResult, PoseFit, Vec2 } from '../types.js';

export type PoseFitterOptions = {
  scale: number;
  rotationZ: number;
  fingerIndex?: number | null;
  /** EMA alpha for position smoothing across frames. */
  positionAlpha?: number;
  /** EMA alpha for rotation smoothing. */
  rotationAlpha?: number;
  /** EMA alpha for scale smoothing. */
  scaleAlpha?: number;
  /** Jewellery kind used to pick hang vs rigid rotation. */
  jewelleryKind?: string;
};

type SpringState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/**
 * Phase 2 – Production PoseFitter.
 *
 * Enhancements:
 * - Tight lock-to-body tracking (dead-zone + adaptive EMA). Spring lag was
 *   making jewellery slide like an animation instead of sitting on anatomy.
 * - Depth-aware scale from 3D keypoints when available.
 * - Gravity hang for drop earrings; rigid head follow for nose rings / glasses.
 * - Anatomical rotation clamp per jewellery type.
 * - Ring-specific anchor respects fingerIndex.
 * - Bangle/wrist-rotation from WRIST_DIR + BANGLE_ROT vectors.
 * - Depth-hint output for Three.js z-positioning.
 * - Visibility hysteresis: fade out over a few frames rather than instant cut.
 */
export class PoseFitter {
  private smoothPos:    SpringState | null = null;
  private smoothSecPos: SpringState | null = null;
  private smoothRot    = 0;
  private smoothRotX   = 0;
  private smoothRotY   = 0;
  private smoothScale  = 0;
  private visibilityAlpha = 0; // 0 = invisible, 1 = fully visible

  private readonly positionAlpha: number;
  private readonly rotationAlpha: number;
  private readonly scaleAlpha: number;
  private readonly jewelleryKind: string;

  /** Ignore sub-pixel landmark noise so metal does not shimmer. */
  private readonly positionDeadzone = 0.75;

  // Session fine-tune adjustments for edge cases (hair, collar, body variation)
  private fineTuneScaleMul = 1.0;
  private fineTuneOffsetY  = 0;

  constructor(
    private readonly profile: AnchorProfile,
    private readonly defaults: PoseFitterOptions,
  ) {
    this.positionAlpha = defaults.positionAlpha ?? 0.62;
    this.rotationAlpha = defaults.rotationAlpha ?? 0.38;
    this.scaleAlpha    = defaults.scaleAlpha    ?? 0.28;
    this.jewelleryKind = (defaults.jewelleryKind ?? '').toUpperCase();
  }

  setFineTune(scaleMultiplier = 1.0, offsetY = 0): void {
    this.fineTuneScaleMul = Math.max(0.5, Math.min(2.0, scaleMultiplier));
    this.fineTuneOffsetY  = offsetY;
  }

  fit(landmarks: LandmarkResult | null): PoseFit {
    const invisible: PoseFit = {
      position: this.smoothPos
        ? { x: this.smoothPos.x, y: this.smoothPos.y }
        : { x: 0, y: 0 },
      scale:     this.smoothScale || this.defaults.scale,
      rotationZ: this.smoothRot,
      confidence: 0,
      visible:   false,
    };

    if (!landmarks) {
      // Fade out visibility gradually
      this.visibilityAlpha = Math.max(0, this.visibilityAlpha - 0.15);
      if (this.visibilityAlpha > 0.05 && this.smoothPos) {
        return {
          ...invisible,
          visible: true,
          confidence: this.visibilityAlpha * 0.3,
        };
      }
      return invisible;
    }

    // If profile relies on shoulder/neck anchor and shoulders are not visible,
    // do not drop visibility if face landmarks provide a valid head/neck estimate.
    if (
      landmarks.shouldersVisible === false &&
      (this.profile.primaryAnchor === 'NECK_BASE' ||
        this.profile.primaryAnchor === 'COLLARBONE' ||
        this.profile.primaryAnchor === 'NECKLACE_ANCHOR' ||
        this.profile.scaleRef === 'SHOULDER_WIDTH')
    ) {
      if (!landmarks.named['FACE_WIDTH'] && !landmarks.named['NOSE']) {
        this.visibilityAlpha = 0;
        return invisible;
      }
      this.visibilityAlpha = Math.min(this.visibilityAlpha + 0.15, 0.85);
    }

    // ── Primary anchor selection ──────────────────────────────────────────
    let primaryKey = this.profile.primaryAnchor;
    if (this.defaults.fingerIndex != null && this.defaults.fingerIndex >= 0) {
      primaryKey = `RING_SLOT_${this.defaults.fingerIndex}`;
    }

    const primary = landmarks.named[primaryKey];
    if (!primary) {
      this.visibilityAlpha = Math.max(0, this.visibilityAlpha - 0.1);
      return invisible;
    }

    // Hide rings when the finger is tightly curled (occlusion).
    const curl = this.defaults.fingerIndex != null
      ? landmarks.named[`FINGER_CURL_${this.defaults.fingerIndex}`]
      : undefined;
    if (curl && curl.x > 0.75) {
      this.visibilityAlpha = Math.max(0, this.visibilityAlpha - 0.22);
      if (this.visibilityAlpha < 0.18) {
        return { ...invisible, visible: false };
      }
    } else {
      this.visibilityAlpha = Math.min(1, this.visibilityAlpha + 0.25);
    }

    // ── Secondary anchor ──────────────────────────────────────────────────
    const secondary = this.profile.secondaryAnchor
      ? landmarks.named[this.profile.secondaryAnchor]
      : undefined;

    // ── Scale computation ─────────────────────────────────────────────────
    const liveScale = this.resolveLiveScale(landmarks);
    const assetRef  = 100;
    let targetScale = this.defaults.scale * (liveScale / assetRef);

    // Depth-aware scale: if z-coordinates are available, adjust by relative depth.
    const primaryZ = (primary as { z?: number }).z;
    if (primaryZ != null && Number.isFinite(primaryZ)) {
      const refKey =
        landmarks.kind === 'face'
          ? 'NOSE_TIP'
          : landmarks.kind === 'pose'
            ? 'NECK_BASE'
            : 'WRIST';
      const refZ = (landmarks.named[refKey] as { z?: number } | undefined)?.z;
      if (refZ != null && Number.isFinite(refZ)) {
        const depthFactor = Math.max(0.6, Math.min(1.4, 1 + (refZ - primaryZ) * 0.008));
        targetScale *= depthFactor;
      }
    }

    const minS = this.profile.minScale ?? 0.2;
    const maxS = this.profile.maxScale ?? 3;
    targetScale = Math.min(maxS, Math.max(minS, targetScale * this.fineTuneScaleMul));

    // ── Offset ────────────────────────────────────────────────────────────
    const ox = (this.profile.offset?.x ?? 0) * liveScale;
    const oy = (this.profile.offset?.y ?? 0) * liveScale + this.fineTuneOffsetY;

    // ── Rotation ──────────────────────────────────────────────────────────
    // Do not use atan2(secondary - primary) for ears/nose: the inter-ear line
    // and nostril-to-tip vector made jewellery spin like a 2D sticker.
    let targetRotation = this.defaults.rotationZ;
    const headRoll = landmarks.named['HEAD_ROLL']?.x;
    const headYaw = landmarks.named['HEAD_YAW']?.x;
    const headPitch =
      landmarks.named['HEAD_ROLL']?.y ?? landmarks.named['HEAD_YAW']?.y ?? 0;

    if (this.isEarringFit(primaryKey)) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      // Studs rotate fully with head roll (1.0); drop earrings track head roll with subtle natural hang (0.20, matching app.py dangle_angle = roll * 0.2)
      const isStud = (this.profile as any).earringType === 'STUD';
      targetRotation = isStud ? roll : roll * 0.20;
    } else if (this.isNecklaceFit(primaryKey)) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      targetRotation = roll * 0.40; // matching app.py angle = rot * 0.4
    } else if (this.isNoseFit(primaryKey)) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      targetRotation = roll;
    } else if (this.isEyewearFit(primaryKey) && secondary) {
      targetRotation = Math.atan2(secondary.y - primary.y, secondary.x - primary.x);
    } else if (this.defaults.fingerIndex != null) {
      const rotKey  = `RING_ROT_${this.defaults.fingerIndex}`;
      const dirKey  = `FINGER_DIR_${this.defaults.fingerIndex}`;
      const rotPt   = landmarks.named[rotKey];
      const dirPt   = landmarks.named[dirKey];
      if (rotPt) {
        targetRotation = rotPt.x; // pre-computed perpendicular angle
      } else if (dirPt) {
        targetRotation = Math.atan2(dirPt.y, dirPt.x) + Math.PI / 2;
      }
    } else if (landmarks.kind === 'pose') {
      const shoulderRot = landmarks.named['SHOULDER_ROT'];
      if (shoulderRot && Number.isFinite(shoulderRot.x)) {
        targetRotation = shoulderRot.x;
      }
    } else if (landmarks.kind === 'hand') {
      // Bangle/bracelet: prefer BANGLE_ROT, fallback to WRIST_DIR
      const bangleRot = landmarks.named['BANGLE_ROT'];
      const wristDir = landmarks.named['WRIST_DIR'];
      if (bangleRot) {
        targetRotation = bangleRot.x;
      } else if (wristDir) {
        targetRotation = Math.atan2(wristDir.y, wristDir.x) - Math.PI / 2;
      }
    } else if (landmarks.kind === 'face') {
      if (Number.isFinite(headRoll)) targetRotation = (headRoll as number) * 0.40;
    }

    if (landmarks.kind === 'face') {
      const maxRot = (80 * Math.PI) / 180;
      targetRotation = Math.max(-maxRot, Math.min(maxRot, targetRotation));
    } else {
      if (targetRotation > Math.PI) targetRotation -= 2 * Math.PI;
      if (targetRotation < -Math.PI) targetRotation += 2 * Math.PI;
    }

    // ── Depth hint ────────────────────────────────────────────────────────
    let depthHint = 0;
    if (primaryZ != null && Number.isFinite(primaryZ)) {
      depthHint = primaryZ;
    }

    // ── Lock-to-body position (dead-zone + adaptive EMA, no spring overshoot)
    const rawPos = { x: primary.x + ox, y: primary.y + oy };
    const targetRotX = Number.isFinite(headPitch) ? headPitch * 0.55 : 0;
    const targetRotY = Number.isFinite(headYaw) ? (headYaw as number) * 0.7 : 0;

    if (!this.smoothPos) {
      this.smoothPos   = { x: rawPos.x, y: rawPos.y, vx: 0, vy: 0 };
      this.smoothRot   = targetRotation;
      this.smoothRotX  = targetRotX;
      this.smoothRotY  = targetRotY;
      this.smoothScale = targetScale;
    } else {
      this._lockPoint(this.smoothPos, rawPos);

      const ra = this.rotationAlpha;
      let rotDiff = targetRotation - this.smoothRot;
      if (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
      if (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
      this.smoothRot += rotDiff * ra;
      this.smoothRotX += (targetRotX - this.smoothRotX) * ra;
      this.smoothRotY += (targetRotY - this.smoothRotY) * ra;

      this.smoothScale += (targetScale - this.smoothScale) * this.scaleAlpha;
    }

    if (secondary) {
      const secOx = this.isEarringFit(primaryKey) ? ox : -ox;
      const rawSec = { x: secondary.x + secOx, y: secondary.y + oy };
      if (!this.smoothSecPos) {
        this.smoothSecPos = { x: rawSec.x, y: rawSec.y, vx: 0, vy: 0 };
      } else {
        this._lockPoint(this.smoothSecPos, rawSec);
      }
    } else {
      this.smoothSecPos = null;
    }

    const yaw = Number.isFinite(headYaw) ? (headYaw as number) : undefined;
    const pitch = Number.isFinite(headPitch) ? headPitch : undefined;

    return {
      position:          { x: this.smoothPos!.x, y: this.smoothPos!.y },
      secondaryPosition: this.smoothSecPos
        ? { x: this.smoothSecPos.x, y: this.smoothSecPos.y }
        : undefined,
      scale:             this.smoothScale,
      rotationZ:         this.smoothRot,
      rotationX:         this.smoothRotX,
      rotationY:         this.smoothRotY,
      confidence:        landmarks.confidence * this.visibilityAlpha,
      visible:           true,
      depthHint,
      yaw,
      pitch,
    };
  }

  reset(): void {
    this.smoothPos     = null;
    this.smoothSecPos  = null;
    this.smoothRot     = 0;
    this.smoothRotX    = 0;
    this.smoothRotY    = 0;
    this.smoothScale   = 0;
    this.visibilityAlpha = 0;
  }

  private _lockPoint(state: SpringState, target: Vec2): void {
    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const dist = Math.hypot(dx, dy);
    if (dist < this.positionDeadzone) return;
    const alpha = Math.min(0.92, this.positionAlpha + dist * 0.003);
    state.x += dx * alpha;
    state.y += dy * alpha;
    state.vx = dx * alpha;
    state.vy = dy * alpha;
  }

  private resolveLiveScale(landmarks: LandmarkResult): number {
    const key = this.profile.scaleRef;
    const named = key ? landmarks.named[key] : undefined;
    const namedVal = named && Number.isFinite(named.x) && named.x > 1 ? named.x : 0;
    const faceScale = landmarks.scaleRef || 100;

    // Nose-wing width is ~20-40px. Using it as liveScale/100 makes the hoop vanish.
    // Keep face-distance scale and only nudge by the alar-width ratio.
    if (key === 'NOSE_WING_WIDTH' && namedVal > 0) {
      const typical = Math.max(16, faceScale * 0.22);
      const fit = Math.max(0.75, Math.min(1.35, namedVal / typical));
      return faceScale * fit;
    }

    if (namedVal > 1) return namedVal;
    return faceScale;
  }

  private isEarringFit(primaryKey: string): boolean {
    if (this.jewelleryKind.includes('EARRING')) return true;
    return primaryKey === 'LEFT_EAR_LOBE' || primaryKey === 'RIGHT_EAR_LOBE';
  }

  private isNecklaceFit(primaryKey: string): boolean {
    if (
      this.jewelleryKind.includes('NECK') ||
      this.jewelleryKind.includes('PENDANT') ||
      this.jewelleryKind.includes('MANGALSUTRA')
    ) {
      return true;
    }
    return primaryKey === 'NECK_BASE' || primaryKey === 'COLLARBONE' || primaryKey === 'NECKLACE_ANCHOR';
  }

  private isNoseFit(primaryKey: string): boolean {
    if (this.jewelleryKind.includes('NOSE')) return true;
    return (
      primaryKey === 'LEFT_NOSE_WING' ||
      primaryKey === 'RIGHT_NOSE_WING' ||
      primaryKey === 'SEPTUM' ||
      primaryKey === 'NOSE_SEPTUM' ||
      primaryKey === 'SUB_NASALE'
    );
  }

  private isEyewearFit(primaryKey: string): boolean {
    if (this.jewelleryKind.includes('SUNGLASS')) return true;
    return primaryKey === 'LEFT_EYE' || primaryKey === 'RIGHT_EYE';
  }
}
