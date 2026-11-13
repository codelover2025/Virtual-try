import { JewelleryKind } from '@vj/shared';
import type { AnchorProfile } from '../types.js';

export type DetectorKind = 'face' | 'hand' | 'pose';

export type AnchorRegistration = {
  detector: DetectorKind;
  defaultProfile: AnchorProfile;
};

const registry = new Map<string, AnchorRegistration>();

function register(kind: string, value: AnchorRegistration) {
  registry.set(kind, value);
}

register(JewelleryKind.EARRINGS, {
  detector: 'face',
  defaultProfile: {
    primaryAnchor: 'LEFT_EAR_LOBE',
    secondaryAnchor: 'RIGHT_EAR_LOBE',
    scaleRef: 'FACE_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.35,
    maxScale: 2.5,
  },
});

register(JewelleryKind.NECKLACE, {
  detector: 'pose',
  defaultProfile: {
    primaryAnchor: 'NECK_BASE',
    scaleRef: 'SHOULDER_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.35,
    maxScale: 3.5,
  },
});

register(JewelleryKind.NOSE_RING, {
  detector: 'face',
  defaultProfile: {
    primaryAnchor: 'LEFT_NOSE_WING',
    secondaryAnchor: 'NOSE_TIP',
    scaleRef: 'NOSE_WING_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.2,
    maxScale: 1.8,
  },
});

register(JewelleryKind.SUNGLASSES, {
  detector: 'face',
  defaultProfile: {
    primaryAnchor: 'LEFT_EYE',
    secondaryAnchor: 'RIGHT_EYE',
    scaleRef: 'FACE_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.6,
    maxScale: 2.2,
  },
});

register(JewelleryKind.PENDANT, {
  detector: 'pose',
  defaultProfile: {
    primaryAnchor: 'NECK_BASE',
    scaleRef: 'SHOULDER_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.35,
    maxScale: 3.5,
  },
});

register(JewelleryKind.MANGALSUTRA, {
  detector: 'pose',
  defaultProfile: {
    primaryAnchor: 'NECK_BASE',
    scaleRef: 'SHOULDER_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.35,
    maxScale: 3.5,
  },
});

register(JewelleryKind.RINGS, {
  detector: 'hand',
  defaultProfile: {
    primaryAnchor: 'RING_SLOT_3',
    scaleRef: 'HAND_SCALE',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.3,
    maxScale: 2,
  },
});

register(JewelleryKind.BANGLES, {
  detector: 'hand',
  defaultProfile: {
    primaryAnchor: 'BANGLE_ANCHOR',
    scaleRef: 'PALM_WIDTH',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.4,
    maxScale: 2.5,
  },
});

register(JewelleryKind.BRACELET, {
  detector: 'hand',
  defaultProfile: {
    primaryAnchor: 'WRIST',
    scaleRef: 'HAND_SCALE',
    offset: { x: 0, y: 0.02, z: 0 },
    minScale: 0.5,
    maxScale: 2.5,
  },
});

register(JewelleryKind.WATCH, {
  detector: 'hand',
  defaultProfile: {
    primaryAnchor: 'WRIST',
    scaleRef: 'HAND_SCALE',
    offset: { x: 0, y: 0, z: 0 },
    minScale: 0.5,
    maxScale: 2.5,
  },
});

export const AnchorRegistry = {
  get(kind: string): AnchorRegistration {
    const k = (kind ?? '').toUpperCase().trim();
    let found = registry.get(k);
    if (!found) {
      if (k === 'RING') found = registry.get(JewelleryKind.RINGS);
      else if (k === 'BANGLE') found = registry.get(JewelleryKind.BANGLES);
      else if (k === 'EARRING') found = registry.get(JewelleryKind.EARRINGS);
      else if (k === 'NECKLACES') found = registry.get(JewelleryKind.NECKLACE);
      else if (k === 'NOSE_RINGS' || k === 'NOSERING') found = registry.get(JewelleryKind.NOSE_RING);
    }
    if (!found) {
      found = registry.get(JewelleryKind.EARRINGS)!;
    }
    return found;
  },
  register,
  mergeProfile(kind: string, override?: Partial<AnchorProfile> & Record<string, unknown>): AnchorProfile {
    const base = this.get(kind).defaultProfile;
    const cleaned = sanitizeAnchorOverride(override);
    return {
      ...base,
      ...cleaned,
      offset: { ...base.offset, ...cleaned.offset },
    };
  },
};

function sanitizeAnchorOverride(
  override?: Partial<AnchorProfile> & Record<string, unknown>,
): Partial<AnchorProfile> {
  if (!override) return {};
  const out: Partial<AnchorProfile> = {};
  const type = String(override.anchorType ?? '').toUpperCase();
  const fingerIndex = Number(override.fingerIndex);

  if (type === 'WRIST' || type === 'FOREARM') out.primaryAnchor = 'BANGLE_ANCHOR';
  else if (type === 'FINGER_BASE' || type === 'PROXIMAL_PHALANX') {
    out.primaryAnchor = `RING_SLOT_${Number.isFinite(fingerIndex) ? fingerIndex : 3}`;
  } else if (type === 'NOSE_WING' || type === 'NOSTRIL') {
    const side = String(override.side ?? 'LEFT').toUpperCase();
    out.primaryAnchor = side === 'RIGHT' ? 'RIGHT_NOSE_WING' : 'LEFT_NOSE_WING';
  } else if (type === 'SEPTUM' || type === 'NOSE_SEPTUM') {
    out.primaryAnchor = 'SEPTUM';
    out.secondaryAnchor = 'NOSE_TIP';
  }
  else if (type === 'EAR_LOBE' || type === 'EARLOBE') {
    out.primaryAnchor = 'LEFT_EAR_LOBE';
    out.secondaryAnchor = 'RIGHT_EAR_LOBE';
  } else if (type === 'NECK_BASE' || type === 'SUPRASTERNAL_NOTCH' || type === 'COLLARBONE') {
    out.primaryAnchor = 'NECK_BASE';
  }

  if (typeof override.primaryAnchor === 'string') out.primaryAnchor = override.primaryAnchor;
  if (typeof override.secondaryAnchor === 'string') out.secondaryAnchor = override.secondaryAnchor;
  if (typeof override.scaleRef === 'string') out.scaleRef = override.scaleRef;
  if (override.offset && typeof override.offset === 'object') out.offset = override.offset;
  if (typeof override.minScale === 'number') out.minScale = override.minScale;
  if (typeof override.maxScale === 'number') out.maxScale = override.maxScale;
  return out;
}
