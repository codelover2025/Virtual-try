'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vj/api-client';
import { Button, PageLoader, EmptyState } from '@vj/ui';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { JewelleryKind } from '@vj/shared';
import { api } from '@/lib/api';
import { TryOnExperience } from '@/features/try-on/TryOnExperience';
import {
  cacheCatalogue,
  getCachedOrFallbackCatalogue,
  getProductFromCacheOrFallback,
  kindFromCategorySlug,
} from '@/features/try-on/offline-catalog';

function TryOnStudioContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category')?.toLowerCase();
  const rawKindParam = searchParams.get('kind')?.toUpperCase();

  const normalizedKind: JewelleryKind | undefined =
    rawKindParam === 'EARRING'
      ? 'EARRINGS'
      : rawKindParam === 'RING'
        ? 'RINGS'
        : (rawKindParam as JewelleryKind | undefined);

  const validKinds: JewelleryKind[] = [
    'EARRINGS',
    'NECKLACE',
    'RINGS',
    'BANGLES',
    'NOSE_RING',
    'BRACELET',
    'PENDANT',
    'MANGALSUTRA',
    'SUNGLASSES',
    'WATCH',
  ];

  const targetKind: JewelleryKind | undefined =
    normalizedKind && validKinds.includes(normalizedKind)
      ? normalizedKind
      : categoryParam
        ? kindFromCategorySlug(categoryParam)
        : undefined;

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ pageSize: 24 }),
    queryFn: async () => {
      try {
        const res = await api.catalog.listProducts({ pageSize: 24 });
        cacheCatalogue(res.items);
        return res;
      } catch {
        const fallback = getCachedOrFallbackCatalogue();
        return {
          items: fallback,
          total: fallback.length,
          page: 1,
          pageSize: fallback.length,
          totalPages: 1,
        };
      }
    },
  });

  const items = productsQuery.data?.items ?? [];

  // Find a product matching the category/kind if requested, otherwise first product
  const featured = useMemo(() => {
    if (!items.length) return undefined;
    if (targetKind) {
      const match = items.find((p) => p.jewelleryKind === targetKind);
      if (match) return match;
    }
    return items[0];
  }, [items, targetKind]);

  const productDetailQuery = useQuery({
    queryKey: queryKeys.products.detail(featured?.id ?? ''),
    queryFn: async () => {
      try {
        return await api.catalog.getProduct(featured!.id);
      } catch {
        const fallback = getProductFromCacheOrFallback(featured!.id);
        if (fallback) return fallback;
        throw new Error('Product not found in catalogue');
      }
    },
    enabled: Boolean(featured?.id),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-4 sm:px-6 bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/products">
              <ArrowLeft className="mr-2 h-4 w-4" /> Exit Studio
            </Link>
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Virtual Fitting Studio</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground hidden sm:block">
          Select any piece to preview live on your camera
        </p>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {productsQuery.isLoading || productDetailQuery.isLoading ? (
          <PageLoader label="Opening Virtual Studio…" />
        ) : productDetailQuery.data ? (
          <TryOnExperience
            key={productDetailQuery.data.id}
            product={productDetailQuery.data}
            alternativeProducts={productsQuery.data?.items}
            initialKindFilter={targetKind ?? 'ALL'}
          />
        ) : (
          <EmptyState
            title="No pieces available for try-on"
            description="Our studio is currently updating the virtual collection. Please browse our catalogue."
            action={
              <Button asChild>
                <Link href="/products">Browse Catalogue</Link>
              </Button>
            }
          />
        )}
      </main>
    </div>
  );
}

export default function TryOnStudioHubPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening Virtual Studio…" />}>
      <TryOnStudioContent />
    </Suspense>
  );
}
