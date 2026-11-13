import type { LandmarkResult, PoseFit, Vec2 } from '../types.js';

export interface ViewportMappingOptions {
  videoWidth: number;
  videoHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  isMirrored?: boolean;
  fit?: 'cover' | 'contain' | 'none';
}

export interface MappedCoordinateResult extends Vec2 {
  z?: number;
  visible?: boolean;
}

/**
 * Universal Landmark-to-Canvas Mapping Function:
 * Maps normalized landmarks (or raw video pixel coordinates) to canvas pixels,
 * accounting for object-cover center cropping, aspect ratio differences, and mirroring.
 */
export function mapNormalizedToCanvas(
  point: { x: number; y: number; z?: number },
  options: ViewportMappingOptions,
  isNormalized = true,
): MappedCoordinateResult {
  const {
    videoWidth,
    videoHeight,
    canvasWidth,
    canvasHeight,
    isMirrored = false,
    fit = 'cover',
  } = options;

  if (videoWidth <= 0 || videoHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: point.x, y: point.y, z: point.z, visible: true };
  }

  // Normalized [0, 1] relative to video frame
  const nx = isNormalized ? point.x : point.x / videoWidth;
  const ny = isNormalized ? point.y : point.y / videoHeight;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === 'cover') {
    scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
    const renderedW = videoWidth * scale;
    const renderedH = videoHeight * scale;
    offsetX = (canvasWidth - renderedW) / 2;
    offsetY = (canvasHeight - renderedH) / 2;
  } else if (fit === 'contain') {
    scale = Math.min(canvasWidth / videoWidth, canvasHeight / videoHeight);
    const renderedW = videoWidth * scale;
    const renderedH = videoHeight * scale;
    offsetX = (canvasWidth - renderedW) / 2;
    offsetY = (canvasHeight - renderedH) / 2;
  } else {
    // none: stretch to canvas
    const effNx = isMirrored ? (1 - nx) : nx;
    return {
      x: effNx * canvasWidth,
      y: ny * canvasHeight,
      z: point.z,
      visible: true,
    };
  }

  // Horizontal mirroring for front camera preview
  const effectiveNx = isMirrored ? (1 - nx) : nx;

  const x = offsetX + effectiveNx * videoWidth * scale;
  const y = offsetY + ny * videoHeight * scale;
  const z = point.z !== undefined ? point.z * scale : undefined;

  const visible = x >= -50 && x <= canvasWidth + 50 && y >= -50 && y <= canvasHeight + 50;

  return { x, y, z, visible };
}

/**
 * Transforms a fitted pose into visual canvas coordinate space using the unified mapping function.
 */
export function mapPoseToCanvas(
  pose: PoseFit,
  options: ViewportMappingOptions,
  isNormalized = false,
): PoseFit {
  const mappedPos = mapNormalizedToCanvas(pose.position, options, isNormalized);
  const mappedSecPos = pose.secondaryPosition
    ? mapNormalizedToCanvas(pose.secondaryPosition, options, isNormalized)
    : undefined;

  const scaleFactor = options.fit === 'none'
    ? options.canvasWidth / options.videoWidth
    : Math.max(options.canvasWidth / options.videoWidth, options.canvasHeight / options.videoHeight);

  return {
    ...pose,
    position: { x: mappedPos.x, y: mappedPos.y, z: mappedPos.z },
    secondaryPosition: mappedSecPos
      ? { x: mappedSecPos.x, y: mappedSecPos.y, z: mappedSecPos.z }
      : undefined,
    scale: pose.scale * scaleFactor,
    rotationZ: options.isMirrored ? -pose.rotationZ : pose.rotationZ,
    rotationY: options.isMirrored && pose.rotationY !== undefined ? -pose.rotationY : pose.rotationY,
    yaw: options.isMirrored && pose.yaw !== undefined ? -pose.yaw : pose.yaw,
    visible: pose.visible && mappedPos.visible !== false,
    ringSegment: pose.ringSegment
      ? {
          ...pose.ringSegment,
          mcp: mapNormalizedToCanvas(pose.ringSegment.mcp, options, isNormalized) as any,
          pip: mapNormalizedToCanvas(pose.ringSegment.pip, options, isNormalized) as any,
          p0: pose.ringSegment.p0 ? (mapNormalizedToCanvas(pose.ringSegment.p0, options, isNormalized) as any) : undefined,
          p5: pose.ringSegment.p5 ? (mapNormalizedToCanvas(pose.ringSegment.p5, options, isNormalized) as any) : undefined,
          p17: pose.ringSegment.p17 ? (mapNormalizedToCanvas(pose.ringSegment.p17, options, isNormalized) as any) : undefined,
          length: pose.ringSegment.length * scaleFactor,
          width: pose.ringSegment.width * scaleFactor,
        }
      : undefined,
  };
}

/**
 * Transforms a point from raw camera coordinates to visual screen coordinates.
 */
export function transformToScreen(point: Vec2, frameWidth: number, isMirrored: boolean): Vec2 {
  if (!isMirrored) {
    return { x: point.x, y: point.y };
  }
  return {
    x: frameWidth - point.x,
    y: point.y,
  };
}

/**
 * Transforms a fitted pose into visual screen coordinate space.
 */
export function transformPoseToScreen(pose: PoseFit, frameWidth: number, isMirrored: boolean): PoseFit {
  if (!isMirrored) return { ...pose };

  return {
    ...pose,
    position: {
      x: frameWidth - pose.position.x,
      y: pose.position.y,
    },
    secondaryPosition: pose.secondaryPosition
      ? {
          x: frameWidth - pose.secondaryPosition.x,
          y: pose.secondaryPosition.y,
        }
      : undefined,
    rotationZ: -pose.rotationZ,
  };
}

export interface EarMappingResult {
  physicalLeftEar: {
    rawCoordinate: Vec2;
    screenCoordinate: Vec2;
    physicalSide: 'LEFT';
    screenSide: 'LEFT' | 'RIGHT';
  };
  physicalRightEar: {
    rawCoordinate: Vec2;
    screenCoordinate: Vec2;
    physicalSide: 'RIGHT';
    screenSide: 'LEFT' | 'RIGHT';
  };
}

/**
 * Resolves physical ear mapping across front-facing and rear-facing camera modes.
 */
export function resolvePhysicalEarMapping(
  leftEarPoint: Vec2,
  rightEarPoint: Vec2,
  frameWidth: number,
  isMirrored: boolean,
): EarMappingResult {
  const leftScreen = transformToScreen(leftEarPoint, frameWidth, isMirrored);
  const rightScreen = transformToScreen(rightEarPoint, frameWidth, isMirrored);

  const midX = frameWidth / 2;

  return {
    physicalLeftEar: {
      rawCoordinate: leftEarPoint,
      screenCoordinate: leftScreen,
      physicalSide: 'LEFT',
      screenSide: leftScreen.x < midX ? 'LEFT' : 'RIGHT',
    },
    physicalRightEar: {
      rawCoordinate: rightEarPoint,
      screenCoordinate: rightScreen,
      physicalSide: 'RIGHT',
      screenSide: rightScreen.x < midX ? 'LEFT' : 'RIGHT',
    },
  };
}
