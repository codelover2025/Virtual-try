'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vj/api-client';
import { Button } from '@vj/ui';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { TryOnExperience } from '@/features/try-on/TryOnExperience';
import { TryOnLoadingState } from '@/components/try-on/try-on-loading-state';
import { TryOnErrorState } from '@/components/try-on/try-on-error-state';
import { getProductFromCacheOrFallback } from '@/features/try-on/offline-catalog';

export default function TryOnPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId;

  const productQuery = useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: async () => {
      try {
        return await api.catalog.getProduct(productId);
      } catch {
        const fallback = getProductFromCacheOrFallback(productId);
        if (fallback) return fallback;
        throw new Error('Product not found in catalogue');
      }
    },
    enabled: Boolean(productId),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3.5 sm:px-6 bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href={productQuery.data ? `/products/${productQuery.data.slug}` : '/products'}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Exit Studio
            </Link>
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Virtual Try-On</span>
          </div>
        </div>

        {productQuery.data ? (
          <span className="text-xs text-muted-foreground truncate max-w-xs hidden sm:block">
            {productQuery.data.name}
          </span>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {productQuery.isLoading ? (
          <TryOnLoadingState
            label="Preparing Fitting Room…"
            subtext="Loading piece geometry and setting up your mirror session"
          />
        ) : productQuery.isError ? (
          <TryOnErrorState
            title="Piece Not Found"
            description="We could not load this jewellery item for try-on. It may have been unlisted or unavailable."
            onRetry={() => productQuery.refetch()}
          />
        ) : productQuery.data ? (
          <TryOnExperience product={productQuery.data} />
        ) : (
          <TryOnErrorState
            title="Product Unavailable"
            description="This piece is currently not available for virtual fitting."
          />
        )}
      </main>
    </div>
  );
}
