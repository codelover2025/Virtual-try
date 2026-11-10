'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vj/api-client';
import { Sparkles, ArrowRight, Gem } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton } from '@vj/ui';
import { api } from '@/lib/api';

const categoryImages: Record<string, string> = {
  earrings: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=80',
  necklaces: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80',
  rings: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80',
  bridal: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80',
  bracelets: 'https://images.unsplash.com/photo-1611591475822-1d5475143a5c?auto=format&fit=crop&w=800&q=80',
  solitaires: 'https://images.unsplash.com/photo-1598560917505-59a3ad559071?auto=format&fit=crop&w=800&q=80',
};

export default function CategoriesShowcasePage() {
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(false),
    queryFn: () => api.catalog.listCategories({ flat: true, isActive: true }),
  });

  return (
    <div className="space-y-12 pb-16">
      {/* Category Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-background to-secondary p-8 sm:p-14 shadow-lg">
        <div className="max-w-2xl space-y-4">
          <Badge variant="outline" className="border-primary/40 text-primary">
            High Jewellery Ateliers
          </Badge>
          <h1 className="font-serif text-3xl sm:text-5xl font-light text-foreground">
            Explore Curated Collections
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Every collection is meticulously designed and calibrated for real-time virtual fitting. Select a category
            to discover signature pieces crafted with certified diamonds and pure hallmarked gold.
          </p>
        </div>
      </div>

      {/* Categories Grid */}
      {categoriesQuery.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-3xl" />
          ))}
        </div>
      ) : categoriesQuery.isError ? (
        <EmptyState
          title="Could not load categories"
          description="Please check your connection and try again."
          action={
            <Button onClick={() => categoriesQuery.refetch()} variant="secondary">
              Retry
            </Button>
          }
        />
      ) : categoriesQuery.data?.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categoriesQuery.data.map((cat) => {
            const fallbackImage =
              categoryImages[cat.slug.toLowerCase()] ||
              categoryImages.earrings;

            return (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className="group relative flex flex-col justify-end overflow-hidden rounded-3xl border border-border/80 bg-card aspect-[4/3] p-6 shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fallbackImage}
                  alt={cat.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                <div className="relative z-10 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary drop-shadow">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Lumière Collection</span>
                  </div>
                  <h3 className="font-serif text-2xl font-light text-white group-hover:text-primary transition-colors">
                    {cat.name}
                  </h3>
                  {cat.description ? (
                    <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                      {cat.description}
                    </p>
                  ) : null}
                  <div className="pt-2 flex items-center gap-2 text-xs font-medium text-white/90 group-hover:text-primary transition">
                    <span>Browse Collection</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No categories found"
          description="Please check back shortly as we update our collections."
        />
      )}
    </div>
  );
}
