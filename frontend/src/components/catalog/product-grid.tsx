'use client';

import type { ProductListItemDto } from '@vj/types';
import { Skeleton, EmptyState, Button } from '@vj/ui';
import { Sparkles } from 'lucide-react';
import { CatalogProductCard } from './product-card';

export interface ProductGridProps {
  products?: ProductListItemDto[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onQuickView?: (product: ProductListItemDto) => void;
  className?: string;
}

export function ProductGrid({
  products,
  isLoading,
  isError,
  onRetry,
  onQuickView,
  className,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 lg:gap-6 ${className ?? ''}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border bg-card p-3">
            <Skeleton className="aspect-[4/5] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load catalogue"
        description="We encountered an issue fetching pieces. Please check your internet connection and try again."
        action={
          <Button onClick={onRetry} variant="secondary" className="rounded-full">
            Retry Loading
          </Button>
        }
      />
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState
        title="No pieces found"
        description="We couldn't find any jewellery matching your active filters. Try refining your search query or resetting filters."
      />
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 lg:gap-6 ${className ?? ''}`}>
      {products.map((product) => (
        <CatalogProductCard
          key={product.id}
          product={product}
          onQuickView={onQuickView}
        />
      ))}
    </div>
  );
}
