import type { JewelleryKind } from '@vj/shared';

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  settings: {
    public: ['settings', 'public'] as const,
    admin: ['settings', 'admin'] as const,
  },
  categories: {
    all: (flat?: boolean) => ['categories', { flat }] as const,
    detail: (idOrSlug: string) => ['categories', idOrSlug] as const,
    admin: ['categories', 'admin'] as const,
  },
  products: {
    list: (filters: ProductListFilters) => ['products', 'list', filters] as const,
    detail: (idOrSlug: string) => ['products', idOrSlug] as const,
    adminAssets: (productId: string) => ['products', productId, 'assets'] as const,
  },
  tryOn: {
    session: (sessionId: string) => ['try-on', 'session', sessionId] as const,
  },
  captures: {
    mine: (page: number) => ['captures', 'mine', page] as const,
    detail: (id: string) => ['captures', id] as const,
  },
  analytics: {
    overview: (from?: string, to?: string) => ['analytics', 'overview', { from, to }] as const,
  },
  users: {
    list: (page: number) => ['users', 'list', page] as const,
  },
  audit: {
    list: (page: number) => ['audit', 'list', page] as const,
  },
};

export interface ProductListFilters {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  jewelleryKind?: JewelleryKind;
  q?: string;
}
