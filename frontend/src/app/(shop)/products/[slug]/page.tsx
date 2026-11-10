'use client';

import { useState } from 'react';
import { queryKeys } from '@vj/api-client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Camera,
  Check,
  Diamond,
  Heart,
  HelpCircle,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';
import { Badge, Button, EmptyState, PageLoader, formatPrice, Skeleton } from '@vj/ui';
import { api } from '@/lib/api';

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedMetal, setSelectedMetal] = useState<'yellow' | 'rose' | 'white'>('yellow');

  const productQuery = useQuery({
    queryKey: queryKeys.products.detail(slug),
    queryFn: () => api.catalog.getProduct(slug),
    enabled: Boolean(slug),
  });

  const relatedProductsQuery = useQuery({
    queryKey: queryKeys.products.list({ pageSize: 4 }),
    queryFn: () => api.catalog.listProducts({ pageSize: 4 }),
    enabled: Boolean(productQuery.data),
  });

  if (productQuery.isLoading) return <PageLoader label="Opening piece in Atelier…" />;

  if (productQuery.isError || !productQuery.data) {
    return (
      <EmptyState
        title="Piece not found"
        description="This masterpiece may have been retired or is temporarily unavailable."
        action={
          <Button asChild className="rounded-full">
            <Link href="/products">Return to Catalogue</Link>
          </Button>
        }
      />
    );
  }

  const product = productQuery.data;
  const allImages = [
    ...(product.primaryImage ? [product.primaryImage] : []),
    ...(product.images || []).filter((img) => img.url !== product.primaryImage?.url),
  ];
  const activeImage = allImages[selectedImageIndex]?.url ?? product.primaryImage?.url;

  return (
    <div className="space-y-16 pb-20">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-foreground transition">Catalogue</Link>
        <span>/</span>
        <Link href={`/categories/${product.category.slug}`} className="hover:text-foreground transition">
          {product.category.name}
        </Link>
        <span>/</span>
        <span className="text-foreground truncate">{product.name}</span>
      </nav>

      {/* Main PDP Grid */}
      <div className="grid gap-12 lg:grid-cols-2">
        {/* Left Column: Image Gallery with Thumbnails */}
        <div className="space-y-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm">
            {activeImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImage}
                alt={product.name}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            ) : (
              <Skeleton className="h-full w-full" />
            )}

            {/* Quick AR Badge */}
            <div className="absolute top-4 left-4">
              <Badge className="bg-background/90 text-foreground backdrop-blur-md border border-white/20">
                {product.jewelleryKind.replace(/_/g, ' ')}
              </Badge>
            </div>

            {/* Floating Live Try-On Pill */}
            <div className="absolute bottom-4 right-4">
              <Button asChild size="sm" className="rounded-full shadow-xl shadow-primary/30 gap-1.5 text-xs">
                <Link href={`/try-on/${product.id}`}>
                  <Camera className="h-3.5 w-3.5" />
                  <span>Try On Live</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Thumbnails list */}
          {allImages.length > 1 ? (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {allImages.map((img, idx) => (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border transition-all ${
                    selectedImageIndex === idx
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border/70 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.altText ?? product.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right Column: Piece Atelier Details & Purchasing */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px] tracking-wider uppercase">
                {product.category.name}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">SKU: {product.sku}</span>
            </div>

            <h1 className="mt-3 font-serif text-3xl sm:text-5xl font-light text-foreground leading-tight">
              {product.name}
            </h1>

            {product.priceCents != null ? (
              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-serif text-3xl sm:text-4xl font-normal text-primary">
                  {formatPrice(product.priceCents, product.currency ?? 'INR')}
                </span>
                <span className="text-xs text-muted-foreground">Taxes Included · Complimentary Insured Shipping</span>
              </div>
            ) : null}
          </div>

          {product.description ? (
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {product.description}
            </p>
          ) : null}

          {/* Metal Finish Option Selector */}
          <div className="space-y-3 pt-2 border-t">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Gold / Metal Finish
            </span>
            <div className="flex items-center gap-3">
              {[
                { id: 'yellow', label: '18K Yellow Gold', color: 'bg-amber-400' },
                { id: 'rose', label: '18K Rose Gold', color: 'bg-rose-300' },
                { id: 'white', label: 'Platinum / White Gold', color: 'bg-slate-200' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMetal(m.id as any)}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    selectedMetal === m.id
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${m.color} border border-black/10`} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Section: Try On & Bag */}
          <div className="space-y-4 pt-4 border-t">
            {/* Primary Virtual Try-On Banner & Button */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/20 p-1.5 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Instant Virtual Try-On Available
                  </span>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">30 FPS Live AR</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                See this piece on your face and ears in real-time before purchasing. Calibrated for true-to-life
                dimensions.
              </p>
              <Button asChild size="lg" className="w-full rounded-full shadow-lg shadow-primary/20 text-sm font-medium">
                <Link href={`/try-on/${product.id}`}>
                  <Camera className="mr-2 h-4 w-4" /> Launch Virtual Try-On Mirror
                </Link>
              </Button>
            </div>

            {/* Shopping Bag & Wishlist */}
            <div className="flex gap-3">
              <Button size="lg" variant="secondary" className="flex-1 rounded-full gap-2">
                <ShoppingBag className="h-4 w-4" /> Add to Shopping Bag
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-5">
                <Heart className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Atelier Trust Badges */}
          <div className="grid grid-cols-2 gap-4 pt-6 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span>Certified 100% Conflict-Free Diamond</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-primary shrink-0" />
              <span>Complimentary Insured Delivery</span>
            </div>
            <div className="flex items-center gap-2.5">
              <RotateCcw className="h-4 w-4 text-primary shrink-0" />
              <span>30-Day Hassle-Free Exchange</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Diamond className="h-4 w-4 text-primary shrink-0" />
              <span>Lifetime Cleaning & Inspection</span>
            </div>
          </div>
        </div>
      </div>

      {/* Specifications & Craftsmanship */}
      <div className="rounded-3xl border bg-card p-8 sm:p-12 space-y-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-light text-foreground">
          Atelier Craftsmanship & Specifications
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4 pt-4 border-t">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Jewellery Kind</span>
            <span className="mt-1 font-medium text-foreground capitalize">
              {product.jewelleryKind.replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Certification</span>
            <span className="mt-1 font-medium text-foreground">BIS Hallmarked & IGI Certified</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">AR Calibration</span>
            <span className="mt-1 font-medium text-foreground">Sub-millimeter Ear/Face Anchor</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Packaging</span>
            <span className="mt-1 font-medium text-foreground">Signature Lumière Silk Box</span>
          </div>
        </div>
      </div>

      {/* Related Products Recommendation */}
      {relatedProductsQuery.data?.items?.length ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-light text-foreground">
              You May Also Admire
            </h2>
            <Link href="/products" className="text-xs text-primary hover:underline font-medium">
              View All Catalogue
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {relatedProductsQuery.data.items
              .filter((p) => p.id !== product.id)
              .slice(0, 4)
              .map((item) => (
                <div key={item.id} className="group rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition">
                  <Link href={`/products/${item.slug}`}>
                    <div className="aspect-square bg-muted overflow-hidden">
                      {item.primaryImage?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.primaryImage.url} alt={item.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No image</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      {item.priceCents != null ? (
                        <p className="text-xs font-semibold text-primary mt-1">
                          {formatPrice(item.priceCents, item.currency ?? 'INR')}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
