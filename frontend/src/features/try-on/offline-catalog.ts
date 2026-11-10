import type { JewelleryKind } from '@vj/shared';
import type { ProductDetailDto, ProductListItemDto } from '@vj/types';
import { FALLBACK_CATALOGUE } from './fallback-catalogue';

const CATALOGUE_CACHE_KEY = 'vj_cached_catalogue_v3';

export function cacheCatalogue(products: Array<ProductDetailDto | ProductListItemDto>): void {
  if (typeof localStorage === 'undefined' || !products || products.length === 0) return;
  try {
    const fullProducts: ProductDetailDto[] = products.map((item) => {
      const existing = item as ProductDetailDto;
      const fallbackMatch =
        FALLBACK_CATALOGUE.find((f) => f.id === item.id || f.jewelleryKind === item.jewelleryKind) ||
        FALLBACK_CATALOGUE[0];
      return {
        ...item,
        description: (item as any).description || fallbackMatch.description || '',
        images: (item as any).images ?? (item.primaryImage ? [item.primaryImage] : fallbackMatch.images),
        tryOnAsset: existing.tryOnAsset ?? fallbackMatch.tryOnAsset,
        metadata: (item as any).metadata ?? {},
      };
    });
    localStorage.setItem(CATALOGUE_CACHE_KEY, JSON.stringify(fullProducts));
  } catch {
    // Ignore quota errors in storage
  }
}

export function getCachedOrFallbackCatalogue(): ProductDetailDto[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(CATALOGUE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProductDetailDto[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback on corrupt JSON
    }
  }
  return FALLBACK_CATALOGUE;
}

export function getProductFromCacheOrFallback(idOrSlug: string): ProductDetailDto {
  const catalogue = getCachedOrFallbackCatalogue();
  const match = catalogue.find(
    (p) => p.id === idOrSlug || p.slug === idOrSlug || p.sku === idOrSlug,
  );
  if (match) return match;
  return catalogue[0] || FALLBACK_CATALOGUE[0];
}

export function filterCachedCatalogue(filters: {
  q?: string;
  categoryId?: string;
  jewelleryKind?: JewelleryKind;
}): ProductDetailDto[] {
  const q = filters.q?.trim().toLowerCase();
  return getCachedOrFallbackCatalogue().filter((item) => {
    if (filters.jewelleryKind && item.jewelleryKind !== filters.jewelleryKind) return false;
    if (filters.categoryId && item.category?.id !== filters.categoryId && item.category?.slug !== filters.categoryId) {
      return false;
    }
    if (q) {
      const haystack = `${item.name} ${item.sku} ${item.description ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function asOfflineProductList(items: ProductDetailDto[]) {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: items.length || 12,
      total: items.length,
      totalPages: 1,
    },
  };
}

export const CATEGORY_SLUG_TO_KIND: Record<string, JewelleryKind> = {
  earrings: 'EARRINGS',
  necklace: 'NECKLACE',
  necklaces: 'NECKLACE',
  ring: 'RINGS',
  rings: 'RINGS',
  bangle: 'BANGLES',
  bangles: 'BANGLES',
  'nose-rings': 'NOSE_RING',
  nose_ring: 'NOSE_RING',
  nosering: 'NOSE_RING',
};

export function kindFromCategorySlug(slug?: string | null): JewelleryKind | undefined {
  if (!slug) return undefined;
  return CATEGORY_SLUG_TO_KIND[slug.toLowerCase()];
}
