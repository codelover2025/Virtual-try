import type { LandmarkResult } from '../types.js';

export type BodyModelMeasurements = {
  faceWidth: number;
  interpupillaryDistance: number;
  faceHeight: number;
  earDistance: number;
  shoulderWidth: number;
  neckLength: number;
  fingerWidth: number;
  wristWidth: number;
};

/**
 * Universal Fit Body Model Estimator.
 *
 * Computes smoothed, relative biometric proportions every frame:
 * - Face width, IPD (interpupillary distance), Face height, Ear-to-ear distance
 * - Shoulder width (biacromial span), Neck length
 * - Wrist width, Finger width
 *
 * All jewellery sizing and offsets scale relative to these smoothed biometric ratios,
 * ensuring proper fit across all face shapes, sizes, distances, and demographics.
 */
export class BodyModelEstimator {
  private smoothed: BodyModelMeasurements = {
    faceWidth: 140,
    interpupillaryDistance: 64,
    faceHeight: 180,
    earDistance: 135,
    shoulderWidth: 320,
    neckLength: 85,
    fingerWidth: 20,
    wristWidth: 60,
  };

  private readonly alpha: number;

  constructor(alpha = 0.25) {
    this.alpha = alpha;
  }

  estimate(landmarks: LandmarkResult | null): BodyModelMeasurements {
    if (!landmarks || !landmarks.named) {
      return { ...this.smoothed };
    }

    const named = landmarks.named;

    if (landmarks.kind === 'face') {
      const leftEye = named['LEFT_EYE'];
      const rightEye = named['RIGHT_EYE'];
      if (leftEye && rightEye) {
        const ipd = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
        this.updateVal('interpupillaryDistance', ipd);
      }

      const leftEar = named['LEFT_EAR_LOBE'];
      const rightEar = named['RIGHT_EAR_LOBE'];
      if (leftEar && rightEar) {
        const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);
        this.updateVal('earDistance', earDist);
        this.updateVal('faceWidth', earDist * 1.05);
      }

      const forehead = named['FOREHEAD_CENTER'] ?? named['MAANG_TIKKA'];
      const chin = named['CHIN'];
      if (forehead && chin) {
        const fh = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
        this.updateVal('faceHeight', fh);
      }

      const neckAnchor = named['NECKLACE_ANCHOR'];
      if (chin && neckAnchor) {
        const nl = Math.hypot(neckAnchor.x - chin.x, neckAnchor.y - chin.y);
        this.updateVal('neckLength', nl);
      }
    } else if (landmarks.kind === 'pose') {
      const leftShoulder = named['LEFT_SHOULDER'];
      const rightShoulder = named['RIGHT_SHOULDER'];
      if (leftShoulder && rightShoulder) {
        const sw = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
        this.updateVal('shoulderWidth', sw);
      }
      const chin = named['CHIN'] ?? named['NOSE'];
      const neckBase = named['NECK_BASE'] ?? named['COLLARBONE'];
      if (chin && neckBase) {
        const nl = Math.hypot(neckBase.x - chin.x, neckBase.y - chin.y);
        this.updateVal('neckLength', nl);
      }
    } else if (landmarks.kind === 'hand') {
      const wrist = named['WRIST'];
      const bangle = named['BANGLE_ANCHOR'];
      if (wrist && bangle) {
        const ww = Math.hypot(bangle.x - wrist.x, bangle.y - wrist.y) * 2;
        this.updateVal('wristWidth', ww);
      }
      const slot1 = named['RING_SLOT_1'];
      const slot2 = named['RING_SLOT_2'];
      if (slot1 && slot2) {
        const fw = Math.hypot(slot2.x - slot1.x, slot2.y - slot1.y);
        this.updateVal('fingerWidth', fw);
      }
    }

    return { ...this.smoothed };
  }

  private updateVal(key: keyof BodyModelMeasurements, val: number): void {
    if (Number.isFinite(val) && val > 0) {
      this.smoothed[key] = this.smoothed[key] * (1 - this.alpha) + val * this.alpha;
    }
  }

  getMeasurements(): BodyModelMeasurements {
    return { ...this.smoothed };
  }

  reset(): void {
    this.smoothed = {
      faceWidth: 140,
      interpupillaryDistance: 64,
      faceHeight: 180,
      earDistance: 135,
      shoulderWidth: 320,
      neckLength: 85,
      fingerWidth: 20,
      wristWidth: 60,
    };
  }
}
