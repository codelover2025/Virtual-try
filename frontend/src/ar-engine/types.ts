import type { JewelleryKind } from '@vj/shared';

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export type LandmarkPoint = Vec2 & { z?: number; name?: string };

export type LandmarkResult = {
  kind:       'face' | 'hand' | 'pose';
  confidence: number;
  points:     LandmarkPoint[];
  named:      Record<string, LandmarkPoint>;
  scaleRef:   number;
  shouldersVisible?: boolean;
};

export type AnchorProfile = {
  primaryAnchor:    string;
  secondaryAnchor?: string;
  scaleRef:         string;
  offset?:          Partial<Vec3>;
  minScale?:        number;
  maxScale?:        number;
  occlusion?:       { enabled: boolean };
};

export type PoseFit = {
  position:          Vec2;
  secondaryPosition?: Vec2;
  scale:             number;
  rotationZ:         number;
  /** Screen-space X tilt (pitch) applied to 3D jewellery. */
  rotationX?:        number;
  /** Screen-space Y tilt (yaw) applied to 3D jewellery. */
  rotationY?:        number;
  confidence:        number;
  visible:           boolean;
  /** Depth hint: positive = closer to camera, negative = further. */
  depthHint?:        number;
  /** Head 3D Yaw in radians (positive = looking right, negative = looking left). */
  yaw?:              number;
  /** Head 3D Pitch in radians. */
  pitch?:            number;
};

export type TrackingStatus = 'INITIALIZING' | 'TRACKING' | 'DEGRADED' | 'LOST';

export type CameraFacing = 'user' | 'environment';

export type AssetType =
  | 'IMAGE_OVERLAY'
  | 'MODEL_GLB'
  | 'MODEL_GLTF'
  | 'ALPHA_MASK'
  | 'PROCEDURAL';

export type JewelleryConfig = {
  jewelleryKind:      JewelleryKind;
  assetUrl:           string;
  assetType:          AssetType;
  anchorProfile:      AnchorProfile;
  defaultScale?:      number;
  defaultRotationZ?:  number;
  mirrorForOppositeEar?: boolean;
  fingerIndex?:       number | null;
};

export type ArEngineConfig = JewelleryConfig & {
  targetFps?:       number;
  mirroredPreview?: boolean;
  /** Show landmark debug dots. */
  debugLandmarks?:  boolean;
};

export type ArEngineEvents = {
  status:     TrackingStatus;
  fps:        number;
  latencyMs?: number;
  error?:     string;
  /** Fired when the jewellery asset finishes swapping in. */
  assetReady?: boolean;
  promptMessage?: string;
  shouldersVisible?: boolean;
  faceCentered?: boolean;
};

export type CaptureOptions = {
  mimeType?: string;
  quality?:  number;
  thumbnail?: boolean;
};

export type CaptureResult = {
  blob:          Blob;
  thumbnailBlob?: Blob;
  width:         number;
  height:        number;
  mimeType:      string;
};
