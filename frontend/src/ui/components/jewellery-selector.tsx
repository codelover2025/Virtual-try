'use client';

import * as React from 'react';
import { cn, formatPrice } from '../lib/utils.js';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import type { JewelleryKind } from '@vj/shared';

export interface JewellerySelectorItem {
  id: string;
  name: string;
  slug?: string;
  jewelleryKind: JewelleryKind;
  priceCents?: number | null;
  currency?: string | null;
  primaryImage?: { url: string; altText?: string | null } | null;
  imageUrl?: string;
}

export interface JewellerySelectorProps {
  items: JewellerySelectorItem[];
  selectedId?: string | null;
  loadingId?: string | null;
  onSelect: (item: JewellerySelectorItem) => void;
  className?: string;
  title?: string;
}

export function JewellerySelector({
  items,
  selectedId,
  loadingId,
  onSelect,
  className,
  title = 'Switch Piece in Studio',
}: JewellerySelectorProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className={cn('w-full rounded-2xl border bg-card/90 backdrop-blur-md p-3 shadow-lg', className)}>
      {title ? (
        <div className="flex items-center justify-between px-1 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>{title}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{items.length} available</span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex items-center gap-3 overflow-x-auto pb-1 pt-1 scrollbar-thin scrollbar-thumb-muted-foreground/20"
      >
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          const isLoading = loadingId === item.id;
          const image = item.primaryImage?.url || item.imageUrl;

          return (
            <button
              key={item.id}
              type="button"
              data-testid="jewellery-selector-item"
              onClick={() => onSelect(item)}
              disabled={isLoading}
              className={cn(
                'group relative flex-shrink-0 flex items-center gap-2.5 rounded-xl border p-1.5 transition-all text-left duration-200 select-none',
                isSelected
                  ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30'
                  : 'border-border/70 bg-background/80 hover:border-primary/50 hover:bg-muted/50',
                isLoading ? 'opacity-70 cursor-wait' : '',
              )}
            >
              <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-muted flex-shrink-0">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    ✦
                  </div>
                )}
                {isLoading ? (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                ) : isSelected ? (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary font-bold drop-shadow" />
                  </div>
                ) : null}
              </div>

              <div className="pr-2 max-w-[120px]">
                <p className="text-xs font-medium truncate text-foreground leading-tight group-hover:text-primary transition-colors">
                  {item.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    {item.jewelleryKind.replace(/_/g, ' ')}
                  </span>
                  {item.priceCents != null ? (
                    <span className="text-[11px] font-semibold text-primary">
                      {formatPrice(item.priceCents, item.currency ?? 'INR')}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
