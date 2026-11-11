import type { AssetType, CaptureStatus, JewelleryKind, TryOnSessionStatus } from '@vj/shared';

export interface TryOnAssetSummary {
  id: string;
  url: string;
  assetType: AssetType;
  anchorProfile: Record<string, unknown>;
  defaultScale: number;
  defaultRotationZ: number;
  mirrorForOppositeEar: boolean;
  fingerIndex?: number | null;
}

export interface TryOnSessionDto {
  sessionId: string;
  productId: string;
  jewelleryKind: JewelleryKind;
  asset: TryOnAssetSummary;
  status: TryOnSessionStatus;
}

export interface CaptureDto {
  id: string;
  status: CaptureStatus;
  url: string;
  thumbUrl?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
}

export interface CaptureDownloadDto {
  downloadUrl: string;
  fileName: string;
  expiresIn: number;
}
