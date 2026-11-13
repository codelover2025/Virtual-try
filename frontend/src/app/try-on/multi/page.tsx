'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vj/api-client';
import { Button, PageLoader, EmptyState } from '@vj/ui';
import { ArrowLeft, Sparkles, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { TryOnExperience } from '@/features/try-on/TryOnExperience';
import {
  cacheCatalogue,
  getCachedOrFallbackCatalogue,
  getProductFromCacheOrFallback,
} from '@/features/try-on/offline-catalog';

function MultiTryOnStudioContent() {
  const router = useRouter();

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ pageSize: 32 }),
    queryFn: async () => {
      try {
        const res = await api.catalog.listProducts({ pageSize: 32 });
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

  // Default featured piece to a necklace if available, otherwise first item
  const featured = useMemo(() => {
    if (!items.length) return undefined;
    const necklace = items.find(
      (p) => p.jewelleryKind === 'NECKLACE' || p.jewelleryKind === 'PENDANT' || p.jewelleryKind === 'MANGALSUTRA',
    );
    return necklace ?? items[0];
  }, [items]);

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

  const handleExitStudio = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.replace('/try-on');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-4 sm:px-6 bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitStudio}
            className="rounded-full cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Exit Studio
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary font-semibold">
            <Layers className="h-3.5 w-3.5" />
            <span>Multi-Jewellery Studio</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:inline">
            Mix & match necklaces, earrings, rings, and bangles simultaneously
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-full text-xs h-8 px-3"
          >
            <Link href="/try-on">Single Piece Mode</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {productsQuery.isLoading || productDetailQuery.isLoading ? (
          <PageLoader label="Opening Multi-Jewellery Studio…" />
        ) : productDetailQuery.data ? (
          <TryOnExperience
            product={productDetailQuery.data}
            alternativeProducts={productsQuery.data?.items}
            initialKindFilter="ALL"
            mode="multi"
            onClose={handleExitStudio}
          />
        ) : (
          <EmptyState
            title="No pieces available for multi-try-on"
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

export default function MultiTryOnPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening Multi-Jewellery Studio…" />}>
      <MultiTryOnStudioContent />
    </Suspense>
  );
}
