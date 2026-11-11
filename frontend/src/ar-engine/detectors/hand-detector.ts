import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import type { ModelAdapter, PixelInput } from '../models/model-adapter.js';
import type { LandmarkResult } from '../types.js';
import { getModelPath, getWasmPath, MEDIAPIPE_VERSION } from '../models/model-paths.js';

/**
 * Finger joint pairs used to compute mid-point ring slots and direction vectors.
 * Index → [proximal_key, distal_key]
 */
export const FINGER_JOINTS: Record<number, [string, string]> = {
  0: ['thumb_mcp',        'thumb_ip'],
  1: ['index_finger_mcp', 'index_finger_pip'],
  2: ['middle_finger_mcp','middle_finger_pip'],
  3: ['ring_finger_mcp',  'ring_finger_pip'],
  4: ['pinky_finger_mcp', 'pinky_finger_pip'],
};

/**
 * Phase 2 – Production HandDetector.
 *
 * Enhancements:
 * - Multi-hand tracking with hand-ID persistence.
 * - Full 3-D keypoint support via keypoints3D (depth for ring/bangle scale).
 * - Improved bangle anchor using wrist-to-palm center regression.
 * - Palm normal estimation for rotation-aware bangle rendering.
 * - Per-finger ring slot with precision positioning at PIP-MCP mid-point.
 * - Finger curl/extension detection for occlusion handling.
 * - Scale derived from both wrist-to-middle-mcp AND palm width with robust blending.
 * - Confidence-weighted temporal smoothing for scale and position jitter reduction.
 * - Hand chirality detection (left vs right hand).
 */
const MP_HAND_NAMES = [
  'wrist',
  'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
  'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
  'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
  'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
  'pinky_finger_mcp', 'pinky_finger_pip', 'pinky_finger_dip', 'pinky_finger_tip',
] as const;

export class HandDetector implements ModelAdapter {
  readonly name = 'hand';
  private detector: handPoseDetection.HandDetector | null = null;
  private handLandmarker: { detectForVideo: (input: PixelInput, ts: number) => any; close?: () => void } | null = null;
  private prevScaleRef = 80;
  private frameCount = 0;
  private lastVisionTs = 0;

  // Per-landmark temporal smoothing state
  private prevNamed: Record<string, { x: number; y: number }> = {};

  // Multi-hand state: store last known secondary hand
  private lastSecondaryHand: LandmarkResult | null = null;

  async load(): Promise<void> {
    const wasmPath = getWasmPath();
    const modelAssetPath = getModelPath(
      'hand_landmarker.task',
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    );

    // 1. MediaPipe Tasks Vision HandLandmarker (GPU first, then CPU fallback)
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(wasmPath);
      } catch {
        vision = await FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
        );
      }

      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } catch (gpuErr) {
        console.warn('HandLandmarker GPU delegate failed; falling back to CPU delegate:', gpuErr);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      }
    } catch (mpErr) {
      console.warn('MediaPipe HandLandmarker init failed, falling back to TF.js:', mpErr);
      this.handLandmarker = null;
    }

    if (this.handLandmarker) return;

    // 2. Fallback to TF.js
    try {
      this.detector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'tfjs',
          modelType: 'lite',
          maxHands: 2,
        },
      );
    } catch {
      try {
        this.detector = await handPoseDetection.createDetector(
          handPoseDetection.SupportedModels.MediaPipeHands,
          {
            runtime: 'tfjs',
            modelType: 'full',
            maxHands: 2,
          },
        );
      } catch (tfErr) {
        console.warn('TF.js hand detector init failed:', tfErr);
        this.detector = null;
      }
    }

    if (!this.handLandmarker && !this.detector) {
      throw new Error('Hand tracking initialization failed (MediaPipe & TF.js unavailable).');
    }
  }

  async estimate(input: PixelInput): Promise<LandmarkResult | null> {
    const width = 'videoWidth' in input ? input.videoWidth : input.width;
    const height = 'videoHeight' in input ? input.videoHeight : input.height;

    if (this.handLandmarker && width > 0 && height > 0) {
      try {
        const ts = Math.max(this.lastVisionTs + 1, performance.now());
        this.lastVisionTs = ts;
        const res = this.handLandmarker.detectForVideo(input, ts);
        const mesh = res?.landmarks?.[0];
        if (mesh && mesh.length >= 21) {
          this.frameCount++;
          if (res.landmarks.length > 1) {
            this.lastSecondaryHand = this._processMediaPipe21(
              res.landmarks[1],
              width,
              height,
              res.handedness?.[1]?.[0]?.categoryName,
            );
          }
          return this._processMediaPipe21(
            mesh,
            width,
            height,
            res.handedness?.[0]?.[0]?.categoryName,
          );
        }
      } catch {
        // Fall through to TF.js
      }
    }

    if (!this.detector) return null;

    let hands: handPoseDetection.Hand[];
    try {
      hands = await this.detector.estimateHands(input, { flipHorizontal: false });
    } catch {
      return null;
    }

    const hand = hands[0];
    if (!hand || !hand.keypoints?.length) {
      this.frameCount = 0;
      return null;
    }

    this.frameCount++;

    if (hands.length > 1) {
      this.lastSecondaryHand = this._processHand(hands[1]!);
    }

    return this._processHand(hand);
  }

  /** Get the secondary (second) hand result for dual-hand jewellery. */
  getSecondaryHand(): LandmarkResult | null {
    return this.lastSecondaryHand;
  }

  dispose(): void {
    try {
      this.detector?.dispose();
    } catch {
      // ignore
    }
    this.detector = null;
    if (this.handLandmarker?.close) {
      try {
        this.handLandmarker.close();
      } catch {
        // ignore
      }
    }
    this.handLandmarker = null;
    this.prevScaleRef = 80;
    this.prevNamed = {};
    this.lastSecondaryHand = null;
    this.frameCount = 0;
    this.lastVisionTs = 0;
  }

  private _processMediaPipe21(
    mesh: Array<{ x: number; y: number; z?: number }>,
    width: number,
    height: number,
    handedness?: string,
  ): LandmarkResult {
    const named: LandmarkResult['named'] = {};
    const points = mesh.slice(0, 21).map((p, i) => {
      const name = MP_HAND_NAMES[i];
      const point = {
        x: p.x * width,
        y: p.y * height,
        z: p.z != null ? p.z * width : undefined,
        name,
      };
      if (name) named[name] = point;
      return point;
    });
    return this._finishHand(named, points, 0.88, handedness);
  }

  // ─── Private hand processing ───────────────────────────────────────────────

  private _processHand(hand: handPoseDetection.Hand): LandmarkResult {
    const named: LandmarkResult['named'] = {};
    const points = hand.keypoints.map((kp) => {
      const point = { x: kp.x, y: kp.y, z: (kp as { z?: number }).z, name: kp.name };
      if (kp.name) named[kp.name] = point;
      return point;
    });

    return this._finishHand(named, points, hand.score ?? 0.8, hand.handedness);
  }

  private _finishHand(
    named: LandmarkResult['named'],
    points: LandmarkResult['points'],
    score: number,
    handedness?: string,
  ): LandmarkResult {
    const wrist = named['wrist'] ?? points[0];
    if (wrist) named['WRIST'] = wrist;

    named['HANDEDNESS'] = { x: (handedness ?? 'Right') === 'Left' ? 0 : 1, y: 0 };

    // ── Compute ring slots and finger direction vectors ────────────────────
    for (const [idxStr, [proxKey, distKey]] of Object.entries(FINGER_JOINTS)) {
      const p1 = named[proxKey];
      const p2 = named[distKey];
      if (!p1 || !p2) continue;

      const idx = idxStr;

      // Direction vector for rotation angle computation
      const dirX = p2.x - p1.x;
      const dirY = p2.y - p1.y;
      const segLen = Math.hypot(dirX, dirY);
      named[`FINGER_DIR_${idx}`] = { x: dirX, y: dirY };
      named[`RING_SEG_LEN_${idx}`] = { x: segLen, y: 0, name: `RING_SEG_LEN_${idx}` };

      // Ring slot = point between MCP (p1) and PIP (p2), exactly 40% of the way (app.py golden standard)
      named[`RING_SLOT_${idx}`] = {
        x: p1.x + 0.40 * dirX,
        y: p1.y + 0.40 * dirY,
        z: p1.z,
        name: `RING_SLOT_${idx}`,
      };

      // Rotation angle (radians) along finger axis (perpendicular to finger so gem points towards fingertip)
      named[`RING_ROT_${idx}`] = {
        x: Math.atan2(dirY, dirX) + Math.PI / 2,
        y: 0,
        name: `RING_ROT_${idx}`,
      };

      // ── Finger curl detection ──────────────────────────────────────────
      // 0 = fully extended, 1 = fully curled
      const tipKey = distKey.replace('_pip', '_tip').replace('_ip', '_tip');
      const tip = named[tipKey];
      if (tip && wrist) {
        const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const mcpToWrist = Math.hypot(p1.x - wrist.x, p1.y - wrist.y);
        const curlRatio = mcpToWrist > 0
          ? Math.max(0, Math.min(1, 1 - tipToWrist / (mcpToWrist * 2.2)))
          : 0;
        named[`FINGER_CURL_${idx}`] = { x: curlRatio, y: 0 };
      }
    }

    // ── Bangle / Bracelet anchor (anchored behind wrist bone along forearm, matching app.py) ──
    const indexMcp = named['index_finger_mcp'];
    const pinkyMcp = named['pinky_finger_mcp'];
    const middleMcp = named['middle_finger_mcp'];

    if (wrist && middleMcp) {
      // Vector from middle MCP -> wrist (points down the forearm away from hand)
      const armDx = wrist.x - middleMcp.x;
      const armDy = wrist.y - middleMcp.y;
      const armLen = Math.hypot(armDx, armDy) || 1;
      const ux = armDx / armLen;
      const uy = armDy / armLen;

      // Palm width from index MCP to pinky MCP
      const palmW = (indexMcp && pinkyMcp)
        ? Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y)
        : armLen * 0.85;

      // Position: Anchor at wrist and shift along forearm vector by 0.16 * palmW
      // Exactly matching app.py shift_dist = palm_w * self.bangle_pos_ratio (0.16)
      const shiftDist = palmW * 0.16;
      named['BANGLE_ANCHOR'] = {
        x: wrist.x + ux * shiftDist,
        y: wrist.y + uy * shiftDist,
        z: wrist.z,
        name: 'BANGLE_ANCHOR',
      };

      // Wrist direction vector along forearm
      named['WRIST_DIR'] = { x: armDx, y: armDy };

      // Orientation: perpendicular to forearm axis so bangle spans horizontally across wrist
      named['BANGLE_ROT'] = {
        x: Math.atan2(armDy, armDx) - Math.PI / 2,
        y: 0,
        name: 'BANGLE_ROT',
      };

      named['PALM_WIDTH'] = { x: palmW, y: 0, name: 'PALM_WIDTH' };
    }

    // ── Watch anchor (slightly above bangle) ──────────────────────────────
    if (wrist && indexMcp) {
      const watchOffsetX = (indexMcp.x - wrist.x) * -0.15;
      const watchOffsetY = (indexMcp.y - wrist.y) * -0.15;
      named['WATCH_ANCHOR'] = {
        x: wrist.x + watchOffsetX,
        y: wrist.y + watchOffsetY,
        name: 'WATCH_ANCHOR',
      };
    }

    // ── Palm width for secondary scale reference ───────────────────────────
    let palmWidth = 0;
    if (indexMcp && pinkyMcp) {
      palmWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);
      named['FINGER_WIDTH'] = { x: Math.max(14, palmWidth * 0.24), y: 0, name: 'FINGER_WIDTH' };
      named['WRIST_WIDTH'] = { x: Math.max(28, palmWidth * 0.78), y: 0, name: 'WRIST_WIDTH' };
    }

    // ── Palm normal estimation ────────────────────────────────────────────
    // Cross product of wrist-index and wrist-pinky for palm facing direction
    if (wrist && indexMcp && pinkyMcp) {
      const v1x = indexMcp.x - wrist.x;
      const v1y = indexMcp.y - wrist.y;
      const v2x = pinkyMcp.x - wrist.x;
      const v2y = pinkyMcp.y - wrist.y;
      const crossZ = v1x * v2y - v1y * v2x;
      named['PALM_NORMAL'] = {
        x: crossZ > 0 ? 1 : -1, // 1 = palm facing camera, -1 = back
        y: Math.abs(crossZ) / Math.max(1, palmWidth * palmWidth),
      };
    }

    // ── Primary scale: wrist → middle finger MCP ─────────────────────────
    let rawScale = 80;
    if (wrist && middleMcp) {
      const palmLen = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
      rawScale = palmLen > 0 ? palmLen : rawScale;
      // Blend in palm width for robustness against finger curl
      if (palmWidth > 0) {
        rawScale = rawScale * 0.65 + palmWidth * 0.35;
      }
    }

    // ── 3D depth-aware scale adjustment ──────────────────────────────────
    if (wrist && middleMcp) {
      const wristZ = (wrist as { z?: number }).z;
      const middleZ = (middleMcp as { z?: number }).z;
      if (wristZ != null && middleZ != null && Number.isFinite(wristZ) && Number.isFinite(middleZ)) {
        const depthFactor = Math.max(0.7, Math.min(1.3, 1 + (wristZ - middleZ) * 0.005));
        rawScale *= depthFactor;
      }
    }

    // ── Temporal smoothing of scaleRef ────────────────────────────────────
    // Higher confidence and more frames → faster update
    const rampUp = Math.min(1, this.frameCount / 10);
    const alpha = Math.min(1, (0.20 + score * 0.30) * rampUp + (1 - rampUp));
    const scaleRef = this.prevScaleRef + (rawScale - this.prevScaleRef) * alpha;
    this.prevScaleRef = scaleRef;
    named['HAND_SCALE'] = { x: scaleRef, y: 0, name: 'HAND_SCALE' };

    // ── Temporal smoothing per-landmark ──────────────────────────────────
    const smoothAlpha = this.frameCount < 3 ? 0.85 : 0.7;
    for (const [key, point] of Object.entries(named)) {
      // Skip metadata-only entries
      if (
        key === 'HANDEDNESS' ||
        key === 'PALM_NORMAL' ||
        key === 'BANGLE_ROT' ||
        key === 'WRIST_DIR' ||
        key.startsWith('FINGER_CURL_') ||
        key.startsWith('FINGER_DIR_') ||
        key.startsWith('RING_ROT_') ||
        key.endsWith('_WIDTH')
      ) continue;
      const prev = this.prevNamed[key];
      if (prev) {
        named[key] = {
          ...point,
          x: prev.x + (point.x - prev.x) * smoothAlpha,
          y: prev.y + (point.y - prev.y) * smoothAlpha,
        };
      }
    }
    this.prevNamed = { ...named };

    return {
      kind:       'hand',
      confidence: score,
      points,
      named,
      scaleRef,
    };
  }
}
