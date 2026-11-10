'use client';

import { queryKeys } from '@vj/api-client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { EmptyState, PageLoader, ProductCard } from '@vj/ui';
import Link from 'next/link';
import { Button } from '@vj/ui';
import { api } from '@/lib/api';

export default function CategoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const categoryQuery = useQuery({
    queryKey: queryKeys.categories.detail(slug),
    queryFn: () => api.catalog.getCategory(slug),
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ categoryId: categoryQuery.data?.id, page: 1 }),
    queryFn: () => api.catalog.listProducts({ categoryId: categoryQuery.data?.id, page: 1, pageSize: 24 }),
    enabled: Boolean(categoryQuery.data?.id),
  });

  if (categoryQuery.isLoading) return <PageLoader />;
  if (categoryQuery.isError || !categoryQuery.data) {
    return (
      <EmptyState
        title="Category not found"
        action={
          <Button asChild>
            <Link href="/products">Browse all</Link>
          </Button>
        }
      />
    );
  }

  const category = categoryQuery.data;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Collection</p>
        <h1 className="font-serif text-4xl font-semibold">{category.name}</h1>
        {category.description ? <p className="mt-3 max-w-2xl text-muted-foreground">{category.description}</p> : null}
      </header>
      {productsQuery.isLoading ? (
        <PageLoader label="Loading pieces…" />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
          {productsQuery.data?.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
