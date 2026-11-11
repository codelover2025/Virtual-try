export interface PublicSettingsDto {
  guestTryOnEnabled: boolean;
  brandName: string;
  supportEmail: string | null;
}

export interface AdminSettingItem {
  key: string;
  value: unknown;
  valueType: string;
  description: string | null;
  updatedAt: string;
}
