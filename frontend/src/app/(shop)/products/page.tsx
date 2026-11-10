'use client';

import { useState } from 'react';
import { queryKeys } from '@vj/api-client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@vj/ui';
import type { ProductListItemDto } from '@vj/types';
import { api } from '@/lib/api';
import { useCatalogFiltersStore } from '@/stores/catalog-filters-store';
import { ProductSearch } from '@/components/catalog/product-search';
import { CategoryFilter } from '@/components/catalog/category-filter';
import { ProductGrid } from '@/components/catalog/product-grid';
import { ProductDetailsDrawer } from '@/components/catalog/product-details-drawer';

export default function ProductsPage() {
  const { q, categoryId, jewelleryKind, setQ, setCategoryId, setJewelleryKind, reset } = useCatalogFiltersStore();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(true),
    queryFn: () => api.catalog.listCategories({ flat: true, isActive: true }),
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ q, categoryId, jewelleryKind, page: 1, pageSize: 48 }),
    queryFn: () => api.catalog.listProducts({ q, categoryId, jewelleryKind, page: 1, pageSize: 48 }),
  });

  const handleQuickView = (product: ProductListItemDto) => {
    setSelectedProductId(product.id);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b pb-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-primary font-semibold font-mono">
            Atelier Showcase
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-light text-foreground mt-1">
            Fine Jewellery Catalogue
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Explore handcrafted pieces calibrated for live virtual try-on.
          </p>
        </div>

        <div className="w-full sm:w-72 md:w-80">
          <ProductSearch
            value={q}
            onChange={setQ}
            placeholder="Search by gemstone, design…"
          />
        </div>
      </div>

      {/* Main Grid with Sidebar Filter */}
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {categoriesQuery.isLoading ? (
            <div className="space-y-3 p-4 border rounded-2xl">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <CategoryFilter
              categories={categoriesQuery.data ?? []}
              selectedCategoryId={categoryId}
              selectedKind={jewelleryKind}
              onSelectCategory={setCategoryId}
              onSelectKind={setJewelleryKind}
              onReset={reset}
            />
          )}
        </aside>

        <section>
          <ProductGrid
            products={productsQuery.data?.items}
            isLoading={productsQuery.isLoading}
            isError={productsQuery.isError}
            onRetry={() => productsQuery.refetch()}
            onQuickView={handleQuickView}
          />
        </section>
      </div>

      {/* Product Details Drawer */}
      <ProductDetailsDrawer
        productId={selectedProductId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div>
  );
}
