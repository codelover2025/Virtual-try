'use client';

import Link from 'next/link';
import type { ProductListItemDto } from '@vj/types';
import { Badge } from './badge.js';
import { Card, CardContent, CardFooter } from './card.js';
import { formatPrice, cn } from '../lib/utils.js';

export function ProductCard({ product, className }: { product: ProductListItemDto; className?: string }) {
  const imageUrl = product.primaryImage?.url;
  return (
    <Card className={cn('group overflow-hidden transition-shadow hover:shadow-md', className)}>
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={product.primaryImage?.altText ?? product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>
          )}
          <Badge className="absolute left-3 top-3 bg-background/90 text-foreground" variant="secondary">
            {product.jewelleryKind.replace('_', ' ')}
          </Badge>
        </div>
        <CardContent className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{product.category.name}</p>
          <h3 className="font-medium leading-snug line-clamp-2">{product.name}</h3>
          {product.priceCents != null ? (
            <p className="text-sm font-semibold text-primary">{formatPrice(product.priceCents, product.currency ?? 'INR')}</p>
          ) : null}
        </CardContent>
      </Link>
      <CardFooter className="gap-2 p-4 pt-0">
        <Link
          href={`/try-on/${product.id}`}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try on
        </Link>
      </CardFooter>
    </Card>
  );
}
