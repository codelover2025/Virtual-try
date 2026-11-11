'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vj/api-client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Badge,
  Button,
  formatPrice,
  Skeleton,
  EmptyState,
  toast,
} from '@vj/ui';
import { Camera, ShoppingBag, ExternalLink, Sparkles, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

export interface ProductDetailsDrawerProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDetailsDrawer({
  productId,
  open,
  onOpenChange,
}: ProductDetailsDrawerProps) {
  const [selectedImgIndex, setSelectedImgIndex] = useState(0);

  const productQuery = useQuery({
    queryKey: queryKeys.products.detail(productId ?? ''),
    queryFn: () => api.catalog.getProduct(productId!),
    enabled: Boolean(productId && open),
  });

  const product = productQuery.data;
  const images = product
    ? [
        ...(product.primaryImage ? [product.primaryImage] : []),
        ...(product.images || []).filter((img) => img.url !== product.primaryImage?.url),
      ]
    : [];
  const activeImage = images[selectedImgIndex]?.url ?? product?.primaryImage?.url;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-6 flex flex-col justify-between"
      >
        <div className="space-y-6">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider border-primary/40 text-primary">
                Atelier Quick View
              </Badge>
              {product ? (
                <span className="text-[11px] font-mono text-muted-foreground">SKU: {product.sku}</span>
              ) : null}
            </div>
            <SheetTitle className="font-serif text-2xl font-light leading-snug">
              {product?.name ?? 'Loading Piece…'}
            </SheetTitle>
          </SheetHeader>

          {productQuery.isLoading ? (
            <div className="space-y-4 pt-2">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ) : productQuery.isError ? (
            <EmptyState
              title="Unable to load piece details"
              description="Please check your connection and try again."
              action={
                <Button size="sm" onClick={() => productQuery.refetch()} variant="secondary">
                  Retry
                </Button>
              }
            />
          ) : product ? (
            <div className="space-y-5">
              {/* Product Image Stage */}
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-muted/30">
                {activeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeImage}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    <Sparkles className="h-6 w-6 text-primary/40" />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <Badge className="bg-background/90 text-foreground backdrop-blur-md text-[10px]">
                    {product.jewelleryKind.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>

              {/* Thumbnails */}
              {images.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => setSelectedImgIndex(idx)}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border transition ${
                        selectedImgIndex === idx
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border/60 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={product.name} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Price & Category */}
              <div className="flex items-baseline justify-between border-b pb-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground block">
                    {product.category.name}
                  </span>
                  {product.priceCents != null ? (
                    <span className="font-serif text-2xl font-semibold text-primary">
                      {formatPrice(product.priceCents, product.currency ?? 'INR')}
                    </span>
                  ) : (
                    <span className="text-sm italic text-muted-foreground">Price upon request</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>BIS Certified</span>
                </div>
              </div>

              {/* Description */}
              {product.description ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Drawer Footer Actions */}
        {product ? (
          <div className="pt-6 space-y-2 border-t mt-6">
            <Button
              asChild
              className="w-full rounded-full gap-2 text-xs font-medium shadow-md shadow-primary/20"
              onClick={() => onOpenChange(false)}
            >
              <Link href={`/try-on/${product.id}`}>
                <Camera className="h-4 w-4" />
                <span>Launch Virtual Try-On</span>
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 rounded-full gap-1.5 text-xs"
                onClick={() => toast.success(`Added ${product.name} to shopping bag`)}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Add to Bag</span>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full text-xs" onClick={() => onOpenChange(false)}>
                <Link href={`/products/${product.slug}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
