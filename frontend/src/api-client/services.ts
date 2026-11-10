import type { AuthTokens, AuthUser } from '@vj/types';
import type { CategoryDto, ProductDetailDto, ProductListItemDto } from '@vj/types';
import type { AdminSettingItem, PublicSettingsDto } from '@vj/types';
import type { CaptureDto, CaptureDownloadDto, TryOnSessionDto } from '@vj/types';
import type { JewelleryKind, ProductStatus, TryOnSessionStatus } from '@vj/shared';
import type { ApiClient } from './client.js';
import type { ProductListFilters } from './query-keys.js';

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function createAuthApi(client: ApiClient) {
  return {
    register: (body: { email: string; password: string; fullName: string }) =>
      client.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/register', body),
    login: (body: { email: string; password: string }) =>
      client.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/login', body),
    refresh: (refreshToken: string) =>
      client.post<{ tokens: AuthTokens }>('/auth/refresh', { refreshToken }),
    logout: (refreshToken: string) => client.post<{ ok: boolean }>('/auth/logout', { refreshToken }),
    me: () => client.get<AuthUser>('/auth/me'),
  };
}

export function createCatalogApi(client: ApiClient) {
  return {
    listCategories: (query?: { flat?: boolean; isActive?: boolean }) =>
      client.get<CategoryDto[]>('/categories', query),
    getCategory: (idOrSlug: string) => client.get<CategoryDto>(`/categories/${idOrSlug}`),
    listProducts: async (filters: ProductListFilters = {}): Promise<Paginated<ProductListItemDto>> => {
      const envelope = await client.getWithMeta<ProductListItemDto[]>('/products', {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        categoryId: filters.categoryId,
        jewelleryKind: filters.jewelleryKind,
        q: filters.q,
      });
      const pagination = envelope.meta.pagination ?? {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        total: envelope.data.length,
        totalPages: 1,
      };
      return { items: envelope.data, pagination };
    },
    getProduct: (idOrSlug: string) => client.get<ProductDetailDto>(`/products/${idOrSlug}`),
    getPublicSettings: () => client.get<PublicSettingsDto>('/settings/public'),
  };
}

export interface TryOnAnalyticsEvent {
  type: string;
  value?: string | number;
  meta?: Record<string, unknown>;
}

export interface TryOnProductAsset {
  productId: string;
  jewelleryKind: JewelleryKind;
  asset: {
    id: string;
    assetType: string;
    url: string;
    anchorProfile: Record<string, unknown>;
    defaultScale: number;
    defaultRotationZ: number;
    mirrorForOppositeEar: boolean;
    fingerIndex: number | null;
  };
}

export interface CaptureUploadTicket {
  uploadUrl: string;
  storageKey: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface AssetUploadResult {
  storageKey: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export function createTryOnApi(client: ApiClient) {
  return {
    startSession: (body: { productId: string; clientInfo?: Record<string, unknown> }) =>
      client.post<TryOnSessionDto>('/try-on/sessions', body),
    patchSession: (
      sessionId: string,
      body: {
        status?: TryOnSessionStatus;
        metrics?: Record<string, unknown>;
        events?: TryOnAnalyticsEvent[];
      },
    ) => client.patch<TryOnSessionDto>(`/try-on/sessions/${sessionId}`, body),
    heartbeat: (sessionId: string) =>
      client.post<{ ok: boolean; status: TryOnSessionStatus }>(`/try-on/sessions/${sessionId}/heartbeat`),
    recordEvents: (sessionId: string, events: TryOnAnalyticsEvent[]) =>
      client.post<void>(`/try-on/sessions/${sessionId}/events/batch`, { events }),
    getProductAsset: (productId: string) =>
      client.get<TryOnProductAsset | null>(`/try-on/products/${productId}/asset`),
    getProductAssets: (productIds: string[]) =>
      client.post<TryOnProductAsset[]>('/try-on/products/assets', { productIds }),
    getSession: (sessionId: string) => client.get<TryOnSessionDto>(`/try-on/sessions/${sessionId}`),
    requestUploadUrl: (
      sessionId: string,
      body: { mimeType: string; fileSize: number },
    ) => client.post<CaptureUploadTicket>(`/try-on/sessions/${sessionId}/upload-url`, body),
    registerCapture: (
      sessionId: string,
      body: {
        storageKey: string;
        width: number;
        height: number;
        mimeType: string;
        fileSizeBytes: number;
      },
    ) => client.post<CaptureDto>(`/try-on/sessions/${sessionId}/captures`, body),
    listCaptures: async (page = 1): Promise<Paginated<CaptureDto>> => {
      const envelope = await client.getWithMeta<CaptureDto[]>('/try-on/captures', { page });
      const pagination = envelope.meta.pagination ?? {
        page,
        pageSize: 20,
        total: envelope.data.length,
        totalPages: 1,
      };
      return { items: envelope.data, pagination };
    },
    getCapture: (captureId: string) => client.get<CaptureDto>(`/try-on/captures/${captureId}`),
    getCaptureDownload: (captureId: string) =>
      client.get<CaptureDownloadDto>(`/try-on/captures/${captureId}/download`),
    deleteCapture: (captureId: string) =>
      client.delete<{ ok: boolean }>(`/try-on/captures/${captureId}`),
  };
}

export function createAdminApi(client: ApiClient) {
  return {
    listAdminCategories: () => client.get<CategoryDto[]>('/admin/categories'),
    createCategory: (body: {
      name: string;
      slug: string;
      parentId?: string | null;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) => client.post<CategoryDto>('/admin/categories', body),
    updateCategory: (id: string, body: Record<string, unknown>) =>
      client.patch<CategoryDto>(`/admin/categories/${id}`, body),
    deleteCategory: (id: string) => client.delete<{ ok: boolean }>(`/admin/categories/${id}`),

    createProduct: (body: {
      categoryId: string;
      sku: string;
      name: string;
      slug: string;
      description?: string;
      jewelleryKind: JewelleryKind;
      status?: ProductStatus;
      priceCents?: number;
      currency?: string;
      metadata?: Record<string, unknown>;
    }) => client.post<ProductDetailDto>('/admin/products', body),
    updateProduct: (id: string, body: Record<string, unknown>) =>
      client.patch<ProductDetailDto>(`/admin/products/${id}`, body),
    publishProduct: (id: string) => client.post<ProductDetailDto>(`/admin/products/${id}/publish`),
    deleteProduct: (id: string) => client.delete<{ ok: boolean }>(`/admin/products/${id}`),

    uploadAssetFile: async (file: File | Blob, filename?: string): Promise<AssetUploadResult> => {
      const formData = new FormData();
      if (typeof File !== 'undefined' && file instanceof File) {
        formData.append('file', file);
      } else {
        formData.append('file', file, filename || 'asset.glb');
      }
      return client.post<AssetUploadResult>('/uploads/asset', formData);
    },
    listProductAssets: (productId: string) =>
      client.get<unknown[]>(`/admin/products/${productId}/assets`),
    createProductAsset: (productId: string, body: Record<string, unknown>) =>
      client.post<unknown>(`/admin/products/${productId}/assets`, body),
    activateProductAsset: (productId: string, assetId: string) =>
      client.post<unknown>(`/admin/products/${productId}/assets/${assetId}/activate`),

    getAdminSettings: () => client.get<AdminSettingItem[]>('/admin/settings'),
    upsertSetting: (
      key: string,
      body: {
        value: unknown;
        valueType: string;
        description?: string;
        isPublic?: boolean;
      },
    ) => client.put<AdminSettingItem>(`/admin/settings/${encodeURIComponent(key)}`, body),
    getAnalyticsOverview: (from?: string, to?: string) =>
      client.get<Record<string, unknown>>('/admin/analytics/overview', { from, to }),
  };
}

export function createApiServices(client: ApiClient) {
  return {
    auth: createAuthApi(client),
    catalog: createCatalogApi(client),
    tryOn: createTryOnApi(client),
    admin: createAdminApi(client),
  };
}
