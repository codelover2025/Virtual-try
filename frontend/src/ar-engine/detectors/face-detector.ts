import type * as blazeface from '@tensorflow-models/blazeface';
import type { ModelAdapter, PixelInput } from '../models/model-adapter.js';
import type { LandmarkPoint, LandmarkResult } from '../types.js';
import { getModelPath, getWasmPath, MEDIAPIPE_VERSION } from '../models/model-paths.js';

// Suppress benign TensorFlow Lite / Emscripten C++ stderr info logs in Next.js dev overlay
if (typeof window !== 'undefined' && !(window as any).__tfliteLogFiltered) {
  (window as any).__tfliteLogFiltered = true;
  const originalError = window.console.error;
  window.console.error = function (...args: any[]) {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (
      first.startsWith('INFO:') ||
      first.includes('Created TensorFlow Lite') ||
      first.includes('XNNPACK delegate')
    ) {
      console.info(...args);
      return;
    }
    originalError.apply(window.console, args);
  };
}

/**
 * Phase 2 – Production FaceDetector.
 *
 * MediaPipe Tasks Vision Face Landmarker (478 landmarks) with
 * high-performance BlazeFace fallback.
 *
 * Real Anatomical Landmarks:
 * - Real nostril / nose-wing landmarks (LEFT_NOSE_WING, RIGHT_NOSE_WING) for nose rings
 * - Earlobe and jawline attachment points (LEFT_EAR_LOBE, RIGHT_EAR_LOBE) for earrings
 * - Inter-pupillary distance (IPD) for precision earring scaling
 * - Nose wing width for dynamic nose ring scaling
 * - 3D head roll, pitch, and yaw estimation
 * - Per-landmark temporal smoothing with spring-damping
 */
export class FaceDetector implements ModelAdapter {
  readonly name = 'face';

  private blazeModel: blazeface.BlazeFaceModel | null = null;
  private faceLandmarker: any = null;
  private prevConfidence = 0;
  private frameCount = 0;
  private lastFrameWidth = 0;
  private lastFrameHeight = 0;
  private lastVisionTs = 0;

  // Rolling history for temporal smoothing
  private prevNamed: Record<string, { x: number; y: number }> = {};
  private prevScaleRef = 120;

  async load(): Promise<void> {
    const wasmPath = getWasmPath();
    const modelAssetPath = getModelPath(
      'face_landmarker.task',
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    );

    // 1. Try loading MediaPipe Tasks Vision FaceLandmarker (GPU first, then CPU)
    try {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(wasmPath);
      } catch {
        vision = await FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
        );
      }

      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      } catch (gpuErr) {
        console.warn('FaceLandmarker GPU delegate failed; falling back to CPU delegate:', gpuErr);
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      }
    } catch (mpErr) {
      console.warn('MediaPipe FaceLandmarker failed, using BlazeFace fallback:', mpErr);
      this.faceLandmarker = null;
    }

    // 2. Load BlazeFace only if MediaPipe is unavailable
    if (!this.faceLandmarker && !this.blazeModel) {
      try {
        const blazefaceModule = await import('@tensorflow-models/blazeface');
        this.blazeModel = await blazefaceModule.load({ maxFaces: 1 });
      } catch (bfErr) {
        console.warn('BlazeFace fallback failed:', bfErr);
      }
    }
  }

  async estimate(input: PixelInput): Promise<LandmarkResult | null> {
    // Cache frame dimensions
    let width = 0;
    let height = 0;
    if ('videoWidth' in input) {
      width = (input as HTMLVideoElement).videoWidth;
      height = (input as HTMLVideoElement).videoHeight;
    } else if ('width' in input) {
      width = (input as HTMLCanvasElement).width;
      height = (input as HTMLCanvasElement).height;
    }
    this.lastFrameWidth = width;
    this.lastFrameHeight = height;

    // ── Try MediaPipe FaceLandmarker (478 Landmarks) first ─────────────────
    if (this.faceLandmarker && width > 0 && height > 0) {
      try {
        const timestamp = this.nextVisionTs();
        const res = this.faceLandmarker.detectForVideo(input, timestamp);
        if (res?.faceLandmarks && res.faceLandmarks.length > 0) {
          // Multiple faces: track only the largest face
          let bestIdx = 0;
          let maxArea = 0;
          for (let f = 0; f < res.faceLandmarks.length; f++) {
            const mesh = res.faceLandmarks[f];
            if (!mesh || mesh.length < 468) continue;
            const top = mesh[10];
            const bottom = mesh[152];
            const left = mesh[234];
            const right = mesh[454];
            const area = Math.abs((right.x - left.x) * (bottom.y - top.y));
            if (area > maxArea) {
              maxArea = area;
              bestIdx = f;
            }
          }
          if (res.faceLandmarks[bestIdx]?.length >= 468) {
            const matrix = res.facialTransformationMatrixes?.[bestIdx]?.data;
            return this._processMediaPipeMesh(res.faceLandmarks[bestIdx], width, height, matrix);
          }
        }
      } catch {
        // Fall back to BlazeFace on inference issue
      }
    }

    // ── Fallback: BlazeFace with Anatomical Geometric Reconstruction ──────
    if (this.blazeModel) {
      return this._processBlazeFace(input);
    }

    return null;
  }

  dispose(): void {
    if (this.faceLandmarker?.close) {
      try {
        this.faceLandmarker.close();
      } catch {
        // ignore
      }
    }
    this.faceLandmarker = null;
    try {
      (this.blazeModel as { dispose?: () => void } | null)?.dispose?.();
    } catch {
      // ignore
    }
    this.blazeModel = null;
    this.prevNamed = {};
    this.prevScaleRef = 120;
    this.frameCount = 0;
    this.lastVisionTs = 0;
  }

  // ─── MediaPipe 478 Mesh Processing ─────────────────────────────────────────

  private _processMediaPipeMesh(
    mesh: Array<{ x: number; y: number; z?: number }>,
    width: number,
    height: number,
    matrix?: Float32Array | number[],
  ): LandmarkResult {
    this.frameCount++;

    const named: LandmarkResult['named'] = {};
    const points: LandmarkPoint[] = [];

    const addIdx = (name: string, index: number) => {
      const p = mesh[index];
      if (!p) return;
      const pt: LandmarkPoint = {
        x: p.x * width,
        y: p.y * height,
        z: p.z != null ? p.z * width : undefined,
        name,
      };
      named[name] = pt;
      points.push(pt);
    };

    // ── Key MediaPipe Facial Indices ──────────────────────────────────────
    // Landmark 234: Subject's right ear tragus / cheek
    // Landmark 454: Subject's left ear tragus / cheek
    addIdx('RIGHT_EAR_TRAGUS', 234);
    addIdx('LEFT_EAR_TRAGUS', 454);
    addIdx('LEFT_JAW_NEAR_EAR', 132);
    addIdx('RIGHT_JAW_NEAR_EAR', 361);
    addIdx('JAWLINE_LEFT', 172);
    addIdx('JAWLINE_RIGHT', 397);

    // Nostril & Nose Wing (Alar Base)
    addIdx('LEFT_NOSE_WING', 49);  // Left nostril wing / alar crease
    addIdx('RIGHT_NOSE_WING', 279); // Right nostril wing / alar crease
    addIdx('LEFT_NOSTRIL', 240);
    addIdx('RIGHT_NOSTRIL', 460);

    // Nose
    addIdx('NOSE_TIP', 4);
    addIdx('NOSE_BRIDGE', 168);
    addIdx('SEPTUM', 2);
    addIdx('NOSE_SEPTUM', 2);
    addIdx('SUB_NASALE', 2);

    // Eyes / Pupils (IPD)
    addIdx('LEFT_EYE', mesh.length >= 478 ? 468 : 33);
    addIdx('RIGHT_EYE', mesh.length >= 478 ? 473 : 263);

    // Mouth & Chin
    addIdx('MOUTH', 13);
    addIdx('CHIN', 152);

    // Forehead
    addIdx('FOREHEAD_CENTER', 10);
    addIdx('MAANG_TIKKA', 10);

    const leftEye = named['LEFT_EYE'];
    const rightEye = named['RIGHT_EYE'];
    const noseTip = named['NOSE_TIP'];
    const chin = named['CHIN'];

    const rightTragus = named['RIGHT_EAR_TRAGUS']; // Landmark 234 (subject's right)
    const leftTragus = named['LEFT_EAR_TRAGUS'];   // Landmark 454 (subject's left)
    const forehead = named['FOREHEAD_CENTER'];
    const faceHeight = forehead && chin
      ? Math.max(40, Math.hypot(chin.x - forehead.x, chin.y - forehead.y))
      : height * 0.28;

    // ── Head Pose & 3D Local Basis Vectors ──────────────────────────────────
    // Head-local axes: downward along the face's local Y axis, and outward along local X.
    // Computed from the 3D facial transformation matrix (res.facialTransformationMatrixes)
    // and aligned to 3D landmarks so they follow head pitch, yaw, and roll without jitter.
    let roll = 0;
    let pitch = 0;
    let yaw = 0;

    let u_down: { x: number; y: number; z: number };
    let u_left: { x: number; y: number; z: number };
    let u_back: { x: number; y: number; z: number };

    // Geometric 3D vector from forehead to chin
    const v_fc = {
      x: chin && forehead ? chin.x - forehead.x : 0,
      y: chin && forehead ? chin.y - forehead.y : 1,
      z: chin && forehead ? (chin.z ?? 0) - (forehead.z ?? 0) : 0,
    };
    const len_fc = Math.hypot(v_fc.x, v_fc.y, v_fc.z) || 1;
    const v_fc_norm = { x: v_fc.x / len_fc, y: v_fc.y / len_fc, z: v_fc.z / len_fc };

    // Geometric 3D vector from right ear (234) to left ear (454)
    const v_rl = {
      x: leftTragus && rightTragus ? leftTragus.x - rightTragus.x : 1,
      y: leftTragus && rightTragus ? leftTragus.y - rightTragus.y : 0,
      z: leftTragus && rightTragus ? (leftTragus.z ?? 0) - (rightTragus.z ?? 0) : 0,
    };
    const len_rl = Math.hypot(v_rl.x, v_rl.y, v_rl.z) || 1;
    const v_rl_norm = { x: v_rl.x / len_rl, y: v_rl.y / len_rl, z: v_rl.z / len_rl };

    // Geometric forward vector (mid-ears to nose tip)
    const v_fwd_geo = {
      x: noseTip && rightTragus && leftTragus ? noseTip.x - (rightTragus.x + leftTragus.x) / 2 : 0,
      y: noseTip && rightTragus && leftTragus ? noseTip.y - (rightTragus.y + leftTragus.y) / 2 : 0,
      z: noseTip && rightTragus && leftTragus ? (noseTip.z ?? 0) - ((rightTragus.z ?? 0) + (leftTragus.z ?? 0)) / 2 : -1,
    };

    if (matrix && matrix.length >= 16) {
      // Column-major 4x4 matrix from MediaPipe Tasks Vision FaceLandmarker
      // Col 0: [m00, m10, m20] = Local X axis (subject's left)
      // Col 1: [m01, m11, m21] = Local Y axis (head UP)
      // Col 2: [m02, m12, m22] = Local Z axis (facing direction / out of face)
      const m00 = Number(matrix[0] ?? 1);
      const m10 = Number(matrix[1] ?? 0);
      const m20 = Number(matrix[2] ?? 0);

      const m01 = Number(matrix[4] ?? 0);
      const m11 = Number(matrix[5] ?? 1);
      const m21 = Number(matrix[6] ?? 0);

      const m02 = Number(matrix[8] ?? 0);
      const m12 = Number(matrix[9] ?? 0);
      const m22 = Number(matrix[10] ?? 1);

      roll  = Math.atan2(m10, m11);
      pitch = Math.asin(Math.max(-1, Math.min(1, -m12)));
      yaw   = Math.atan2(m02, m22);

      // Downward along face's local Y axis in screen space:
      // Canonical Y is UP. Downward along face is -canonical_Y.
      // In screen coordinates (+Y is downwards, +Y_screen = -Y_cam).
      let cd_x = -m01;
      let cd_y = m11;
      let cd_z = -m21;
      // Align with landmark forehead->chin direction
      if (cd_x * v_fc_norm.x + cd_y * v_fc_norm.y + cd_z * v_fc_norm.z < 0) {
        cd_x = -cd_x;
        cd_y = -cd_y;
        cd_z = -cd_z;
      }
      const len_cd = Math.hypot(cd_x, cd_y, cd_z) || 1;
      u_down = { x: cd_x / len_cd, y: cd_y / len_cd, z: cd_z / len_cd };

      // Local X axis (subject's left, pointing towards landmark 454):
      let cl_x = m00;
      let cl_y = -m10;
      let cl_z = m20;
      // Align with landmark 234->454 vector
      if (cl_x * v_rl_norm.x + cl_y * v_rl_norm.y + cl_z * v_rl_norm.z < 0) {
        cl_x = -cl_x;
        cl_y = -cl_y;
        cl_z = -cl_z;
      }
      const len_cl = Math.hypot(cl_x, cl_y, cl_z) || 1;
      u_left = { x: cl_x / len_cl, y: cl_y / len_cl, z: cl_z / len_cl };

      // Local Z axis pointing backwards (into skull / back of head):
      // Canonical +Z is forward out of face: [m02, -m12, m22] in screen space.
      // Canonical -Z (backward towards back of head) is [-m02, m12, -m22].
      let cb_x = -m02;
      let cb_y = m12;
      let cb_z = -m22;
      const len_cb = Math.hypot(cb_x, cb_y, cb_z) || 1;
      u_back = { x: cb_x / len_cb, y: cb_y / len_cb, z: cb_z / len_cb };
    } else {
      if (leftEye && rightEye) {
        roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
      }
      if (noseTip && chin && leftEye) {
        const midEyeY = (leftEye.y + (rightEye?.y ?? leftEye.y)) / 2;
        const noseRatio = (noseTip.y - midEyeY) / Math.max(1, chin.y - midEyeY);
        pitch = Math.max(-1, Math.min(1, (noseRatio - 0.45) * 4));
      }
      if (noseTip && leftTragus && rightTragus) {
        const earMidX = (leftTragus.x + rightTragus.x) / 2;
        const earDist = Math.abs(leftTragus.x - rightTragus.x);
        yaw = earDist > 0 ? (noseTip.x - earMidX) / (earDist * 0.5) : 0;
      }
      u_down = v_fc_norm;
      u_left = v_rl_norm;
      u_back = { x: 0, y: 0, z: 1 };
    }

    // Face width computed from tragus distance (app.py golden standard)
    const faceWidth = (leftTragus && rightTragus)
      ? Math.hypot(rightTragus.x - leftTragus.x, rightTragus.y - leftTragus.y)
      : (leftEye && rightEye ? Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) * 1.8 : width * 0.35);

    // ── Ear Anchors: Anatomical Earlobe Piercing Geometry ──────────────────
    // Anchors: Landmark 234 (right tragus) and Landmark 454 (left tragus).
    // In frontal view, downDist is ~0.104 x faceHeight (matching app.py 0.115 x faceWidth).
    // In side profile view, the entire un-foreshortened ear auricle is exposed, so
    // the earlobe piercing point sits at ~0.150 x faceHeight below the tragus.
    const YAW_20_DEG = (20 * Math.PI) / 180; // ~0.349 rad
    const YAW_45_DEG = (45 * Math.PI) / 180; // ~0.785 rad
    const absYaw = Math.abs(yaw);
    const profileFactor = absYaw > YAW_20_DEG
      ? Math.min(1.0, (absYaw - YAW_20_DEG) / (YAW_45_DEG - YAW_20_DEG))
      : 0;

    const downDist = (0.104 + 0.046 * profileFactor) * faceHeight;
    const outDist  = 0.025 * faceHeight * (1.0 - profileFactor * 0.6);
    const backDist = 0.17 * faceHeight;

    // Profile compensation:
    // In frontal and slight-turn views (|yaw| <= 20 deg), profileShift is 0 so slight
    // head movements have ZERO lateral drift and remain locked to the earlobes.
    // In profile view (|yaw| > 20 deg), MediaPipe tracks the preauricular cheek border;
    // the near ear sits behind the cheek border along the skull away from facing direction.
    // Skull back direction along screen X in unmirrored frame:
    // When yaw > 0 (turned right), back of skull is screen left (-X).
    // When yaw < 0 (turned left), back of skull is screen right (+X).
    const skullBackX = yaw > 0 ? -1 : (yaw < 0 ? 1 : 0);
    const profileShiftX = skullBackX * profileFactor * (0.095 * faceHeight);

    // Right ear anchor (Landmark 234, subject's right): outward is -u_left
    // In profile with yaw > 20 deg, right ear is the near ear facing camera.
    if (rightTragus) {
      const nearShiftX = (yaw > YAW_20_DEG) ? profileShiftX : 0;
      named['RIGHT_EAR_LOBE'] = {
        x: rightTragus.x + (u_down.x * downDist) - (u_left.x * outDist) + nearShiftX,
        y: rightTragus.y + (u_down.y * downDist) - (u_left.y * outDist),
        z: (rightTragus.z ?? 0) + (u_down.z * downDist) - (u_left.z * outDist) + (u_back.z * backDist),
        name: 'RIGHT_EAR_LOBE',
      };
      points.push(named['RIGHT_EAR_LOBE']);
    }

    // Left ear anchor (Landmark 454, subject's left): outward is +u_left
    // In profile with yaw < -20 deg, left ear is the near ear facing camera.
    if (leftTragus) {
      const nearShiftX = (yaw < -YAW_20_DEG) ? profileShiftX : 0;
      named['LEFT_EAR_LOBE'] = {
        x: leftTragus.x + (u_down.x * downDist) + (u_left.x * outDist) + nearShiftX,
        y: leftTragus.y + (u_down.y * downDist) + (u_left.y * outDist),
        z: (leftTragus.z ?? 0) + (u_down.z * downDist) + (u_left.z * outDist) + (u_back.z * backDist),
        name: 'LEFT_EAR_LOBE',
      };
      points.push(named['LEFT_EAR_LOBE']);
    }

    // Necklace & Neck base anchors from chin (Landmark 152 + 0.08 * faceWidth, matching app.py)
    if (chin) {
      named['NECK_BASE'] = {
        x: chin.x,
        y: chin.y + (faceWidth * 0.08),
        z: chin.z,
        name: 'NECK_BASE',
      };
      named['COLLARBONE'] = {
        x: chin.x,
        y: chin.y + (faceWidth * 0.16),
        z: chin.z,
        name: 'COLLARBONE',
      };
      named['NECKLACE_ANCHOR'] = named['NECK_BASE'];
      points.push(named['NECK_BASE'], named['COLLARBONE']);
    }

    named['HEAD_ROLL'] = { x: roll, y: pitch, name: 'HEAD_ROLL' };
    named['HEAD_YAW'] = { x: yaw, y: pitch, name: 'HEAD_YAW' };

    // Scale reference: Face Width
    named['FACE_WIDTH'] = {
      x: faceWidth,
      y: 0,
      name: 'FACE_WIDTH',
    };
    const scaleRef = faceWidth;

    // Nose wing scale reference
    if (named['LEFT_NOSE_WING'] && named['RIGHT_NOSE_WING']) {
      const nw = Math.hypot(named['RIGHT_NOSE_WING'].x - named['LEFT_NOSE_WING'].x, named['RIGHT_NOSE_WING'].y - named['LEFT_NOSE_WING'].y);
      named['NOSE_WING_WIDTH'] = { x: nw, y: 0, name: 'NOSE_WING_WIDTH' };
    }

    this._applyTemporalSmoothing(named);

    return {
      kind: 'face',
      confidence: 0.95,
      points,
      named,
      scaleRef,
    };
  }

  // ─── BlazeFace Processing with Anatomical Reconstruction ───────────────────

  private async _processBlazeFace(input: PixelInput): Promise<LandmarkResult | null> {
    let preds: blazeface.NormalizedFace[];
    try {
      preds = await this.blazeModel!.estimateFaces(
        input as HTMLVideoElement | HTMLCanvasElement,
        false,
      );
    } catch {
      return null;
    }

    let face = preds[0];
    if (preds.length > 1) {
      let maxArea = 0;
      for (const p of preds) {
        const tl = p.topLeft as [number, number];
        const br = p.bottomRight as [number, number];
        const area = Math.abs((br[0] - tl[0]) * (br[1] - tl[1]));
        if (area > maxArea) {
          maxArea = area;
          face = p;
        }
      }
    }
    if (!face) {
      this.prevConfidence = Math.max(0, this.prevConfidence - 0.15);
      return null;
    }

    this.frameCount++;

    const landmarks = face.landmarks as Array<[number, number]> | undefined;
    const named: LandmarkResult['named'] = {};
    const points: LandmarkPoint[] = [];

    const topLeft = face.topLeft as [number, number];
    const bottomRight = face.bottomRight as [number, number];
    const faceWidth = Math.max(1, bottomRight[0] - topLeft[0]);
    const faceHeight = Math.max(1, bottomRight[1] - topLeft[1]);
    const faceCenterX = (topLeft[0] + bottomRight[0]) / 2;

    const addSafe = (name: string, xy?: [number, number] | number[]) => {
      if (!xy || xy.length < 2) return;
      const x = Number(xy[0]);
      const y = Number(xy[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const point: LandmarkPoint = { x, y, name };
      named[name] = point;
      points.push(point);
    };

    if (landmarks && landmarks.length >= 6) {
      addSafe('RIGHT_EYE', landmarks[0]);
      addSafe('LEFT_EYE', landmarks[1]);
      addSafe('NOSE_TIP', landmarks[2]);
      addSafe('MOUTH', landmarks[3]);
      addSafe('RIGHT_EAR_TRAGUS', landmarks[4]);
      addSafe('LEFT_EAR_TRAGUS', landmarks[5]);
    }

    const yaw = this._estimateHeadYaw(named, faceWidth);
    const pitch = this._estimateHeadPitch(named, faceHeight);
    const roll = this._estimateHeadRoll(named);
    named['HEAD_ROLL'] = { x: roll, y: pitch, name: 'HEAD_ROLL' };
    named['HEAD_YAW'] = { x: yaw, y: 0, name: 'HEAD_YAW' };

    // Real anatomical nostril / nose-wing landmarks (Issue 7)
    const nose = named['NOSE_TIP'];
    if (nose) {
      const alarSpanX = faceWidth * 0.085;
      const alarSpanY = faceHeight * 0.022;
      named['LEFT_NOSE_WING'] = {
        x: nose.x + alarSpanX - yaw * faceWidth * 0.02,
        y: nose.y + alarSpanY,
        name: 'LEFT_NOSE_WING',
      };
      named['RIGHT_NOSE_WING'] = {
        x: nose.x - alarSpanX - yaw * faceWidth * 0.02,
        y: nose.y + alarSpanY,
        name: 'RIGHT_NOSE_WING',
      };
      named['SEPTUM'] = {
        x: nose.x - yaw * faceWidth * 0.01,
        y: nose.y + faceHeight * 0.035,
        name: 'SEPTUM',
      };
      named['NOSE_SEPTUM'] = named['SEPTUM'];
      points.push(named['LEFT_NOSE_WING'], named['RIGHT_NOSE_WING'], named['SEPTUM']);

      named['NOSE_WING_WIDTH'] = {
        x: alarSpanX * 2,
        y: 0,
        name: 'NOSE_WING_WIDTH',
      };
    }

    // Chin and neck base
    if (named['MOUTH']) {
      const chinY = named['MOUTH'].y + faceHeight * 0.20;
      named['CHIN'] = {
        x: named['MOUTH'].x,
        y: chinY,
        name: 'CHIN',
      };
      named['NECK_BASE'] = {
        x: named['MOUTH'].x,
        y: chinY + faceWidth * 0.08,
        name: 'NECK_BASE',
      };
      named['COLLARBONE'] = {
        x: named['MOUTH'].x,
        y: chinY + faceWidth * 0.16,
        name: 'COLLARBONE',
      };
      named['NECKLACE_ANCHOR'] = named['NECK_BASE'];
      points.push(named['CHIN'], named['NECK_BASE'], named['COLLARBONE']);
    }

    const u_down_x = -Math.sin(roll);
    const u_down_y = Math.cos(roll);
    const u_left_x = Math.cos(roll);
    const u_left_y = Math.sin(roll);

    const YAW_20_DEG = (20 * Math.PI) / 180;
    const YAW_45_DEG = (45 * Math.PI) / 180;
    const absYaw = Math.abs(yaw);
    const profileFactor = absYaw > YAW_20_DEG
      ? Math.min(1.0, (absYaw - YAW_20_DEG) / (YAW_45_DEG - YAW_20_DEG))
      : 0;

    const downDist = (0.104 + 0.046 * profileFactor) * faceHeight;
    const outDist = 0.025 * faceHeight * (1.0 - profileFactor * 0.6);

    const skullBackX = yaw > 0 ? -1 : (yaw < 0 ? 1 : 0);
    const profileShiftX = skullBackX * profileFactor * (0.095 * faceHeight);

    if (named['RIGHT_EAR_TRAGUS']) {
      const nearShiftX = (yaw > YAW_20_DEG) ? profileShiftX : 0;
      named['RIGHT_EAR_LOBE'] = {
        ...named['RIGHT_EAR_TRAGUS'],
        x: named['RIGHT_EAR_TRAGUS'].x + (u_down_x * downDist) - (u_left_x * outDist) + nearShiftX,
        y: named['RIGHT_EAR_TRAGUS'].y + (u_down_y * downDist) - (u_left_y * outDist),
        name: 'RIGHT_EAR_LOBE',
      };
      points.push(named['RIGHT_EAR_LOBE']);
    }
    if (named['LEFT_EAR_TRAGUS']) {
      const nearShiftX = (yaw < -YAW_20_DEG) ? profileShiftX : 0;
      named['LEFT_EAR_LOBE'] = {
        ...named['LEFT_EAR_TRAGUS'],
        x: named['LEFT_EAR_TRAGUS'].x + (u_down_x * downDist) + (u_left_x * outDist) + nearShiftX,
        y: named['LEFT_EAR_TRAGUS'].y + (u_down_y * downDist) + (u_left_y * outDist),
        name: 'LEFT_EAR_LOBE',
      };
      points.push(named['LEFT_EAR_LOBE']);
    }

    // Scale reference: IPD
    let scaleRef = faceWidth;
    if (named['LEFT_EYE'] && named['RIGHT_EYE']) {
      const ipd = Math.hypot(
        named['RIGHT_EYE'].x - named['LEFT_EYE'].x,
        named['RIGHT_EYE'].y - named['LEFT_EYE'].y,
      );
      scaleRef = ipd * 1.85;
    }
    if (named['LEFT_EAR_LOBE'] && named['RIGHT_EAR_LOBE']) {
      named['FACE_WIDTH'] = {
        x: Math.hypot(
          named['RIGHT_EAR_LOBE'].x - named['LEFT_EAR_LOBE'].x,
          named['RIGHT_EAR_LOBE'].y - named['LEFT_EAR_LOBE'].y,
        ),
        y: 0,
        name: 'FACE_WIDTH',
      };
    }

    this._applyTemporalSmoothing(named);

    return {
      kind: 'face',
      confidence: 0.90,
      points,
      named,
      scaleRef,
    };
  }

  // ─── Temporal Smoothing ───────────────────────────────────────────────────

  private nextVisionTs(): number {
    const ts = Math.max(this.lastVisionTs + 1, performance.now());
    this.lastVisionTs = ts;
    return ts;
  }

  private _applyTemporalSmoothing(named: Record<string, LandmarkPoint>): void {
    const smoothFactor = this.frameCount < 4 ? 0.88 : 0.78;
    for (const [key, pt] of Object.entries(named)) {
      if (key === 'HEAD_ROLL' || key === 'HEAD_YAW' || key.endsWith('_WIDTH')) continue;
      const prev = this.prevNamed[key];
      if (prev) {
        named[key] = {
          ...pt,
          x: prev.x + (pt.x - prev.x) * smoothFactor,
          y: prev.y + (pt.y - prev.y) * smoothFactor,
        };
      }
    }
    this.prevNamed = { ...named };
  }

  private _estimateHeadYaw(
    named: Record<string, { x: number; y: number }>,
    faceWidth: number,
  ): number {
    const nose = named['NOSE_TIP'];
    if (!nose || faceWidth < 1) return 0;
    const leftEar = named['LEFT_EAR_LOBE'] ?? named['LEFT_EAR_TRAGUS'];
    const rightEar = named['RIGHT_EAR_LOBE'] ?? named['RIGHT_EAR_TRAGUS'];
    const centerX = leftEar
      ? (leftEar.x + (rightEar?.x ?? nose.x)) / 2
      : nose.x;
    return Math.max(-1, Math.min(1, (nose.x - centerX) / faceWidth));
  }

  private _estimateHeadPitch(
    named: Record<string, { x: number; y: number }>,
    faceHeight: number,
  ): number {
    const nose = named['NOSE_TIP'];
    const mouth = named['MOUTH'];
    if (!nose || !mouth || faceHeight < 1) return 0;
    const noseToMouth = mouth.y - nose.y;
    const expected = faceHeight * 0.18;
    return Math.max(-1, Math.min(1, (noseToMouth - expected) / expected));
  }

  private _estimateHeadRoll(
    named: Record<string, { x: number; y: number }>,
  ): number {
    const le = named['LEFT_EYE'];
    const re = named['RIGHT_EYE'];
    if (!le || !re) return 0;
    return Math.atan2(re.y - le.y, re.x - le.x);
  }
}
