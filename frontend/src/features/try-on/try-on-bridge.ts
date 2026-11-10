import type { JewelleryConfig } from '@vj/ar-engine';
import type { JewelleryKind } from '@vj/shared';
import type { JewelleryAssetDto } from '@vj/types';
import { api } from '@/lib/api';
import { assetCache } from '@/lib/asset-cache';

type AssetLike = Pick<
  JewelleryAssetDto,
  | 'url'
  | 'assetType'
  | 'anchorProfile'
  | 'defaultScale'
  | 'defaultRotationZ'
  | 'mirrorForOppositeEar'
> & { fingerIndex?: number | null } | null | undefined;

/** Resolve a catalogue asset through the client cache, falling back to the network URL. */
export async function cachedAssetUrl(url: string): Promise<string> {
  if (!url || url.startsWith('procedural://')) return url;
  try {
    const loaded = await assetCache.preload(url);
    return loaded.objectUrl;
  } catch {
    return url;
  }
}

export function getDefaultProceduralUrl(kind: JewelleryKind): string {
  switch (kind) {
    case 'EARRINGS':
      return 'procedural://earring';
    case 'NECKLACE':
    case 'PENDANT':
    case 'MANGALSUTRA':
      return 'procedural://necklace';
    case 'NOSE_RING':
      return 'procedural://nose_ring';
    case 'RINGS':
      return 'procedural://ring';
    case 'BANGLES':
    case 'BRACELET':
    case 'WATCH':
      return 'procedural://bangle';
    default:
      return `procedural://${kind.toLowerCase()}`;
  }
}

export async function toJewelleryConfig(
  jewelleryKind: JewelleryKind,
  asset: AssetLike,
): Promise<JewelleryConfig> {
  const source = asset?.url || getDefaultProceduralUrl(jewelleryKind);
  return {
    jewelleryKind,
    assetUrl: await cachedAssetUrl(source),
    assetType: asset?.assetType ?? 'PROCEDURAL',
    anchorProfile: (asset?.anchorProfile ?? {}) as JewelleryConfig['anchorProfile'],
    defaultScale: asset?.defaultScale ?? 1,
    defaultRotationZ: asset?.defaultRotationZ ?? 0,
    mirrorForOppositeEar: asset?.mirrorForOppositeEar ?? (jewelleryKind === 'EARRINGS'),
    fingerIndex: asset?.fingerIndex ?? (jewelleryKind === 'RINGS' ? 3 : null),
  };
}

export async function uploadCapture(input: {
  sessionId: string;
  blob: Blob;
  width: number;
  height: number;
}) {
  const mimeType = input.blob.type || 'image/jpeg';
  const ticket = await api.tryOn.requestUploadUrl(input.sessionId, {
    mimeType,
    fileSize: input.blob.size,
  });
  const uploaded = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.headers,
    body: input.blob,
  });
  if (!uploaded.ok) {
    throw new Error(`Capture upload failed (${uploaded.status})`);
  }
  return api.tryOn.registerCapture(input.sessionId, {
    storageKey: ticket.storageKey,
    width: input.width,
    height: input.height,
    mimeType,
    fileSizeBytes: input.blob.size,
  });
}
