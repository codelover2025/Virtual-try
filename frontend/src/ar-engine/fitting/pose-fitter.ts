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
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
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
  private smoothPos: SpringState | null = null;
  private smoothSecPos: SpringState | null = null;
  private smoothRot = 0;
  private smoothRotX = 0;
  private smoothRotY = 0;
  private smoothScale = 0;
  private visibilityAlpha = 0; // 0 = invisible, 1 = fully visible

  private readonly positionAlpha: number;
  private readonly rotationAlpha: number;
  private readonly scaleAlpha: number;
  private readonly jewelleryKind: string;

  /** Ignore sub-pixel landmark noise so metal does not shimmer. */
  private readonly positionDeadzone = 0.75;

  // Session fine-tune adjustments for edge cases (hair, collar, body variation)
  private fineTuneScaleMul = 1.0;
  private fineTuneOffsetY = 0;

  constructor(
    private readonly profile: AnchorProfile,
    private readonly defaults: PoseFitterOptions,
  ) {
    const kindStr = (defaults.jewelleryKind ?? '').toUpperCase();
    const isNeck =
      kindStr.includes('NECK') ||
      kindStr.includes('PENDANT') ||
      kindStr.includes('MANGALSUTRA');
    this.positionAlpha = defaults.positionAlpha ?? (isNeck ? 0.45 : 0.62);
    this.rotationAlpha = defaults.rotationAlpha ?? (isNeck ? 0.35 : 0.38);
    this.scaleAlpha = defaults.scaleAlpha ?? (isNeck ? 0.28 : 0.28);
    this.jewelleryKind = kindStr;
  }

  setFineTune(scaleMultiplier = 1.0, offsetY = 0): void {
    this.fineTuneScaleMul = Math.max(0.5, Math.min(2.0, scaleMultiplier));
    this.fineTuneOffsetY = offsetY;
  }

  fit(landmarks: LandmarkResult | null): PoseFit {
    const invisible: PoseFit = {
      position: this.smoothPos
        ? { x: this.smoothPos.x, y: this.smoothPos.y }
        : { x: 0, y: 0 },
      scale: this.smoothScale || this.defaults.scale,
      rotationZ: this.smoothRot,
      confidence: 0,
      visible: false,
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

    let primary = landmarks.named[primaryKey];
    let secondary = this.profile.secondaryAnchor
      ? landmarks.named[this.profile.secondaryAnchor]
      : undefined;

    // For earrings: if one ear is not detected (e.g. extreme side view / occlusion)
    // but the other is detected, attach try-on to the detected ear.
    if (this.isEarringFit(primaryKey)) {
      if (!primary && secondary) {
        primary = secondary;
        secondary = undefined;
        primaryKey = this.profile.secondaryAnchor!;
      }
    }

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

    // ── Scale computation ─────────────────────────────────────────────────
    const liveScale = this.resolveLiveScale(landmarks);
    const assetRef = 100;
    let targetScale = this.defaults.scale * (liveScale / assetRef);

    // Depth-aware scale: if z-coordinates are available, adjust by relative depth.
    const primaryZ = (primary as { z?: number }).z;
    if (primaryZ != null && Number.isFinite(primaryZ)) {
      if (landmarks.kind === 'pose') {
        // MediaPipe Pose z-coordinate scaling with depth (closer = larger, farther = smaller)
        const refSpan = landmarks.scaleRef || 240;
        const depthFactor = Math.max(0.65, Math.min(1.45, 1.0 - (primaryZ / refSpan) * 0.75));
        targetScale *= depthFactor;
      } else {
        const refKey =
          landmarks.kind === 'face'
            ? 'NOSE_TIP'
            : 'WRIST';
        const refZ = (landmarks.named[refKey] as { z?: number } | undefined)?.z;
        if (refZ != null && Number.isFinite(refZ)) {
          const depthFactor = Math.max(0.6, Math.min(1.4, 1 + (refZ - primaryZ) * 0.008));
          targetScale *= depthFactor;
        }
      }
    }

    // When user adjusts necklace position, automatically scale chain bigger/smaller:
    // Moving necklace down (positive Y towards chest) -> chain widens & expands.
    // Moving necklace up (negative Y towards throat/choker) -> chain narrows & tightens.
    if (this.isNecklaceFit(primaryKey)) {
      const positionScaleFactor = Math.max(0.60, Math.min(1.50, 1.0 + (this.fineTuneOffsetY / 70)));
      targetScale *= positionScaleFactor;
    }

    const minS = this.profile.minScale ?? 0.2;
    const maxS = this.profile.maxScale ?? 3;
    targetScale = Math.min(maxS, Math.max(minS, targetScale * this.fineTuneScaleMul));

    // ── Offset ────────────────────────────────────────────────────────────
    const isEarring = this.isEarringFit(primaryKey);
    let ox = (this.profile.offset?.x ?? 0) * liveScale;
    let oy = (this.profile.offset?.y ?? 0) * liveScale;

    // ── Rotation ──────────────────────────────────────────────────────────
    // Do not use atan2(secondary - primary) for ears/nose: the inter-ear line
    // and nostril-to-tip vector made jewellery spin like a 2D sticker.
    let targetRotation = this.defaults.rotationZ;
    const headRoll = landmarks.named['HEAD_ROLL']?.x;
    const headYaw = landmarks.named['HEAD_YAW']?.x;
    const headPitch =
      landmarks.named['HEAD_ROLL']?.y ?? landmarks.named['HEAD_YAW']?.y ?? 0;

    if (isEarring) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      // Studs rotate fully with head roll (1.0); drop earrings track head roll with subtle natural hang (0.20, matching app.py dangle_angle = roll * 0.2)
      const isStud = (this.profile as any).earringType === 'STUD';
      targetRotation = isStud ? roll : roll * 0.20;
    } else if (this.isNecklaceFit(primaryKey)) {
      // 3. Rotate the necklace to follow the shoulder line (angle of 11->12)
      const shoulderRot = landmarks.named['SHOULDER_ROT']?.x;
      if (shoulderRot != null && Number.isFinite(shoulderRot)) {
        targetRotation = shoulderRot;
      } else {
        const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
        targetRotation = roll * 0.35;
      }
    } else if (this.isNoseFit(primaryKey)) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      targetRotation = roll;
    } else if (this.isEyewearFit(primaryKey) && secondary) {
      targetRotation = Math.atan2(secondary.y - primary.y, secondary.x - primary.x);
    } else if (this.defaults.fingerIndex != null) {
      const rotKey = `RING_ROT_${this.defaults.fingerIndex}`;
      const dirKey = `FINGER_DIR_${this.defaults.fingerIndex}`;
      const rotPt = landmarks.named[rotKey];
      const dirPt = landmarks.named[dirKey];
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

    // ── Lock-to-body position (dead-zone + adaptive EMA ~0.4, no spring overshoot)
    // Per-side independent positions with sliders working as offsets
    let rawPos: { x: number; y: number; z?: number };
    let rawSec: { x: number; y: number; z?: number } | undefined = undefined;

    if (isEarring) {
      const roll = Number.isFinite(headRoll) ? (headRoll as number) : 0;
      const u_down_x = -Math.sin(roll);
      const u_down_y = Math.cos(roll);
      const u_left_x = Math.cos(roll);
      const u_left_y = Math.sin(roll);

      // Vertical position slider offsets along the face's local Y axis
      const vertSliderX = this.fineTuneOffsetY * u_down_x;
      const vertSliderY = this.fineTuneOffsetY * u_down_y;

      const isLeft = primaryKey === 'LEFT_EAR_LOBE';
      const sideSign = isLeft ? 1 : -1;

      rawPos = {
        x: primary.x + (ox * sideSign * u_left_x) + vertSliderX,
        y: primary.y + (ox * sideSign * u_left_y) + vertSliderY,
        z: primary.z,
      };

      if (secondary) {
        const secSideSign = -sideSign;
        rawSec = {
          x: secondary.x + (ox * secSideSign * u_left_x) + vertSliderX,
          y: secondary.y + (ox * secSideSign * u_left_y) + vertSliderY,
          z: secondary.z,
        };
      }
    } else if (this.isNecklaceFit(primaryKey)) {
      // For necklaces, anchor remains at the anatomical neck base / shoulder line.
      // Vertical adjustment is passed via verticalOffset so the suspension points
      // remain firmly attached to the shoulder line, while the chain drapes down.
      rawPos = { x: primary.x + ox, y: primary.y + oy, z: primary.z };
    } else {
      oy += this.fineTuneOffsetY;
      rawPos = { x: primary.x + ox, y: primary.y + oy, z: primary.z };
    }

    const targetRotX = Number.isFinite(headPitch) ? headPitch * 0.55 : 0;
    const targetRotY = Number.isFinite(headYaw) ? (headYaw as number) * 0.7 : 0;

    if (!this.smoothPos) {
      this.smoothPos = { x: rawPos.x, y: rawPos.y, z: rawPos.z, vx: 0, vy: 0, vz: 0 };
      this.smoothRot = targetRotation;
      this.smoothRotX = targetRotX;
      this.smoothRotY = targetRotY;
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

    if (rawSec) {
      if (!this.smoothSecPos) {
        this.smoothSecPos = { x: rawSec.x, y: rawSec.y, z: rawSec.z, vx: 0, vy: 0, vz: 0 };
      } else {
        this._lockPoint(this.smoothSecPos, rawSec);
      }
    } else {
      this.smoothSecPos = null;
    }

    const yaw = Number.isFinite(headYaw) ? (headYaw as number) : undefined;
    const pitch = Number.isFinite(headPitch) ? headPitch : undefined;

    let ringQuaternion: [number, number, number, number] | undefined = undefined;
    let ringSegment: PoseFit['ringSegment'] = undefined;

    if (landmarks.kind === 'hand') {
      const fIdx = this.defaults.fingerIndex ?? 3;
      const rawQuat = landmarks.named[`RING_QUAT_${fIdx}`] as any;
      if (rawQuat && Number.isFinite(rawQuat.w)) {
        ringQuaternion = [rawQuat.x, rawQuat.y, rawQuat.z, rawQuat.w];
      }

      const mcp = landmarks.named['ring_finger_mcp'];
      const pip = landmarks.named['ring_finger_pip'];
      const p0 = landmarks.named['wrist'];
      const p5 = landmarks.named['index_finger_mcp'];
      const p17 = landmarks.named['pinky_finger_mcp'];
      const segLen = landmarks.named[`RING_SEG_LEN_${fIdx}`]?.x ?? 48;

      // Finger width computed from distance between landmarks 13 and 17 projected perpendicular to finger, with clamp
      let fingerWidth = 32;
      if (mcp && pip && p17) {
        const fx = pip.x - mcp.x;
        const fy = pip.y - mcp.y;
        const fLen = Math.hypot(fx, fy);
        if (fLen > 1e-4) {
          const fnx = fx / fLen;
          const fny = fy / fLen;
          const vx = p17.x - mcp.x;
          const vy = p17.y - mcp.y;
          const dot = vx * fnx + vy * fny;
          const perpx = vx - dot * fnx;
          const perpy = vy - dot * fny;
          const perpDist = Math.hypot(perpx, perpy);
          fingerWidth = Math.max(18, Math.min(85, perpDist));
        }
      } else if (landmarks.named['FINGER_WIDTH']?.x) {
        fingerWidth = Math.max(18, Math.min(85, landmarks.named['FINGER_WIDTH'].x));
      }

      // Palm normal dot product with camera direction (+Z)
      let palmFacingDot = 0;
      if (p0 && p5 && p17) {
        const v1x = p5.x - p0.x;
        const v1y = p5.y - p0.y;
        const v1z = -((p5.z ?? 0) - (p0.z ?? 0));

        const v2x = p17.x - p0.x;
        const v2y = p17.y - p0.y;
        const v2z = -((p17.z ?? 0) - (p0.z ?? 0));

        const cx = v1y * v2z - v1z * v2y;
        const cy = v1z * v2x - v1x * v2z;
        const cz = v1x * v2y - v1y * v2x;
        const cLen = Math.hypot(cx, cy, cz) || 1;

        const isRightHand = (landmarks.named['HANDEDNESS']?.x ?? 1) === 1;
        const rawZ = cz / cLen;
        palmFacingDot = isRightHand ? -rawZ : rawZ;
      }

      if (mcp && pip) {
        ringSegment = {
          mcp: { x: mcp.x, y: mcp.y, z: mcp.z ?? 0 },
          pip: { x: pip.x, y: pip.y, z: pip.z ?? 0 },
          p0: p0 ? { x: p0.x, y: p0.y, z: p0.z ?? 0 } : undefined,
          p5: p5 ? { x: p5.x, y: p5.y, z: p5.z ?? 0 } : undefined,
          p17: p17 ? { x: p17.x, y: p17.y, z: p17.z ?? 0 } : undefined,
          length: segLen,
          width: fingerWidth,
          sizeRatio: this.fineTuneScaleMul,
          palmFacingCamera: palmFacingDot > 0.6,
          palmFacingDot,
        };
      }
    }

    return {
      position: {
        x: this.smoothPos!.x,
        y: this.smoothPos!.y,
        z: this.smoothPos!.z,
      },
      secondaryPosition: this.smoothSecPos
        ? {
          x: this.smoothSecPos.x,
          y: this.smoothSecPos.y,
          z: this.smoothSecPos.z,
        }
        : undefined,
      scale: this.smoothScale,
      rotationZ: this.smoothRot,
      rotationX: this.smoothRotX,
      rotationY: this.smoothRotY,
      confidence: landmarks.confidence * this.visibilityAlpha,
      visible: true,
      depthHint,
      yaw,
      pitch,
      ringQuaternion,
      ringSegment,
      verticalOffset: this.fineTuneOffsetY,
    };
  }

  reset(): void {
    this.smoothPos = null;
    this.smoothSecPos = null;
    this.smoothRot = 0;
    this.smoothRotX = 0;
    this.smoothRotY = 0;
    this.smoothScale = 0;
    this.visibilityAlpha = 0;
  }

  private _lockPoint(state: SpringState, target: { x: number; y: number; z?: number }): void {
    const dx = target.x - state.x;
    const dy = target.y - state.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= this.positionDeadzone) {
      const alpha = Math.min(0.92, this.positionAlpha + dist * 0.003);
      state.x += dx * alpha;
      state.y += dy * alpha;
      state.vx = dx * alpha;
      state.vy = dy * alpha;
    }
    if (target.z !== undefined) {
      if (state.z === undefined) {
        state.z = target.z;
        state.vz = 0;
      } else {
        const dz = target.z - state.z;
        const alphaZ = this.positionAlpha;
        state.z += dz * alphaZ;
        state.vz = dz * alphaZ;
      }
    }
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
