export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const JewelleryKind = {
  EARRINGS: 'EARRINGS',
  NECKLACE: 'NECKLACE',
  RINGS: 'RINGS',
  BANGLES: 'BANGLES',
  NOSE_RING: 'NOSE_RING',
  BRACELET: 'BRACELET',
  PENDANT: 'PENDANT',
  MANGALSUTRA: 'MANGALSUTRA',
  SUNGLASSES: 'SUNGLASSES',
  WATCH: 'WATCH',
} as const;
export type JewelleryKind = (typeof JewelleryKind)[keyof typeof JewelleryKind];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const AssetType = {
  IMAGE_OVERLAY: 'IMAGE_OVERLAY',
  IMAGE_2D: 'IMAGE_OVERLAY',
  MODEL_GLB: 'MODEL_GLB',
  MODEL_GLTF: 'MODEL_GLTF',
  MODEL_3D: 'MODEL_GLB',
  PROCEDURAL: 'MODEL_GLB',
  ALPHA_MASK: 'ALPHA_MASK',
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const AnchorType = {
  EAR_LOBE: 'EAR_LOBE',
  NECK_BASE: 'NECK_BASE',
  FINGER_BASE: 'FINGER_BASE',
  WRIST: 'WRIST',
  NOSE_WING: 'NOSE_WING',
} as const;
export type AnchorType = (typeof AnchorType)[keyof typeof AnchorType];

export const TryOnSessionStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
  ERROR: 'ERROR',
} as const;
export type TryOnSessionStatus = (typeof TryOnSessionStatus)[keyof typeof TryOnSessionStatus];

export const CaptureStatus = {
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
  DELETED: 'DELETED',
} as const;
export type CaptureStatus = (typeof CaptureStatus)[keyof typeof CaptureStatus];

export const SettingValueType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
} as const;
export type SettingValueType = (typeof SettingValueType)[keyof typeof SettingValueType];

export const RoleCode = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  CUSTOMER: 'CUSTOMER',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const PermissionCode = {
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_PUBLISH: 'products:publish',
  CATEGORIES_WRITE: 'categories:write',
  ASSETS_WRITE: 'assets:write',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_WRITE: 'roles:write',
  SETTINGS_WRITE: 'settings:write',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  CAPTURES_READ: 'captures:read',
  CAPTURES_DELETE: 'captures:delete',
} as const;
export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];
