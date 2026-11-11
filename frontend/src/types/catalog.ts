import type { AssetType, JewelleryKind, ProductStatus } from '@vj/shared';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: CategoryDto[];
}

export interface ProductImageDto {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface JewelleryAssetDto {
  id: string;
  assetType: AssetType;
  url: string;
  anchorProfile: Record<string, unknown>;
  defaultScale: number;
  defaultRotationZ: number;
  mirrorForOppositeEar: boolean;
  fingerIndex: number | null;
  isActive: boolean;
}

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  jewelleryKind: JewelleryKind;
  status: ProductStatus;
  category: { id: string; name: string; slug: string };
  primaryImage: ProductImageDto | null;
  priceCents: number | null;
  currency: string | null;
}

export interface ProductDetailDto extends ProductListItemDto {
  description: string | null;
  images: ProductImageDto[];
  tryOnAsset: JewelleryAssetDto | null;
  metadata: Record<string, unknown> | null;
}
