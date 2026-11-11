'use client';

import Link from 'next/link';
import type { ProductListItemDto } from '@vj/types';
import { Badge, Button, formatPrice, Card, CardContent, CardFooter } from '@vj/ui';
import { Camera, Eye, Sparkles } from 'lucide-react';

export interface CatalogProductCardProps {
  product: ProductListItemDto;
  onQuickView?: (product: ProductListItemDto) => void;
  className?: string;
}

export function CatalogProductCard({
  product,
  onQuickView,
  className,
}: CatalogProductCardProps) {
  const imageUrl = product.primaryImage?.url;

  return (
    <Card className={`group relative overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:shadow-xl hover:border-primary/40 flex flex-col justify-between ${className ?? ''}`}>
      <div>
        {/* Image Container with Hover Overlay */}
        <div className="relative aspect-[4/5] overflow-hidden bg-muted/60">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={product.primaryImage?.altText ?? product.name}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-108"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              <Sparkles className="h-6 w-6 text-muted-foreground/30 animate-pulse" />
            </div>
          )}

          {/* Jewellery Kind Badge */}
          <div className="absolute left-3 top-3 z-10">
            <Badge className="bg-background/90 text-foreground backdrop-blur-md text-[10px] uppercase font-mono tracking-wider border border-border/60">
              {product.jewelleryKind.replace(/_/g, ' ')}
            </Badge>
          </div>

          {/* Hover Action Overlay: Quick View Button */}
          {onQuickView ? (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  onQuickView(product);
                }}
                className="rounded-full shadow-lg gap-1.5 text-xs bg-background/95 hover:bg-background text-foreground"
              >
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span>Quick View</span>
              </Button>
            </div>
          ) : null}
        </div>

        {/* Content Info */}
        <CardContent className="p-4 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            {product.category.name}
          </p>
          <Link href={`/products/${product.slug}`} className="block">
            <h3 className="font-serif text-sm sm:text-base font-normal leading-snug text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {product.name}
            </h3>
          </Link>
          {product.priceCents != null ? (
            <p className="font-serif text-sm sm:text-base font-semibold text-primary pt-0.5">
              {formatPrice(product.priceCents, product.currency ?? 'INR')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic pt-0.5">Price upon request</p>
          )}
        </CardContent>
      </div>

      {/* Footer CTA */}
      <CardFooter className="p-4 pt-0 gap-2">
        <Button
          asChild
          size="sm"
          className="w-full rounded-full gap-1.5 text-xs font-medium shadow-sm shadow-primary/10 hover:shadow-primary/30 transition-shadow"
        >
          <Link href={`/try-on/${product.id}`}>
            <Camera className="h-3.5 w-3.5" />
            <span>Try On Live</span>
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
