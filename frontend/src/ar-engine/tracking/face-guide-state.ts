import type { Vec2 } from '../types.js';

export interface FrameDimensions {
  width: number;
  height: number;
}

export type FaceGuideStatus =
  | 'NO_FACE'      // Not tracking or no landmarks
  | 'OFF_CENTER'   // Face detected but outside centered viewport window
  | 'STABILIZING'  // Face detected and centered, but has not reached 300ms stability threshold
  | 'ALIGNED';     // Face detected, centered, and stable >= 300ms -> guide can be hidden

/**
 * Evaluates whether a face coordinate is centered within the camera viewport.
 * Window: [0.30..0.70] horizontally, [0.15..0.70] vertically.
 */
export function isFaceCentered(
  point: Vec2 | null | undefined,
  bounds: FrameDimensions,
): boolean {
  if (!point || bounds.width <= 0 || bounds.height <= 0) return false;
  const nx = point.x / bounds.width;
  const ny = point.y / bounds.height;
  return nx >= 0.30 && nx <= 0.70 && ny >= 0.15 && ny <= 0.70;
}

/**
 * Determines the face-guide state machine output based on tracking status,
 * centered position, and elapsed stability duration.
 */
export function evaluateFaceGuideStatus(params: {
  isTracking: boolean;
  isCentered: boolean;
  stabilityDurationMs: number;
}): FaceGuideStatus {
  if (!params.isTracking) {
    return 'NO_FACE';
  }
  if (!params.isCentered) {
    return 'OFF_CENTER';
  }
  if (params.stabilityDurationMs < 300) {
    return 'STABILIZING';
  }
  return 'ALIGNED';
}

/**
 * Whether the "ALIGN FACE" guide and oval should be hidden.
 * Only hidden when state is 'ALIGNED' (face detected, centered, stable >= 300ms).
 */
export function shouldHideFaceGuide(params: {
  isTracking: boolean;
  isCentered: boolean;
  stabilityDurationMs: number;
}): boolean {
  return evaluateFaceGuideStatus(params) === 'ALIGNED';
}
