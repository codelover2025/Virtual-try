'use client';

import { JewelleryKind } from '@vj/shared';
import type { CategoryDto } from '@vj/types';
import { Button, Badge } from '@vj/ui';
import { Sparkles, SlidersHorizontal, RotateCcw } from 'lucide-react';

export interface CategoryFilterProps {
  categories: CategoryDto[];
  selectedCategoryId?: string;
  selectedKind?: JewelleryKind;
  onSelectCategory: (id?: string) => void;
  onSelectKind: (kind?: JewelleryKind) => void;
  onReset: () => void;
  className?: string;
}

const jewelleryKinds = Object.values(JewelleryKind);

export function CategoryFilter({
  categories,
  selectedCategoryId,
  selectedKind,
  onSelectCategory,
  onSelectKind,
  onReset,
  className,
}: CategoryFilterProps) {
  const hasActiveFilters = Boolean(selectedCategoryId || selectedKind);

  return (
    <div className={`space-y-6 rounded-2xl border bg-card/80 backdrop-blur-md p-4 sm:p-5 shadow-xs ${className ?? ''}`}>
      {/* Header with Reset */}
      <div className="flex items-center justify-between pb-1 border-b">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</h2>
        </div>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 px-2 text-xs text-primary hover:text-primary/80 gap-1 rounded-full"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </Button>
        ) : null}
      </div>

      {/* Jewellery Categories */}
      <div className="space-y-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-foreground block">
          Collections
        </span>
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant={!selectedCategoryId ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onSelectCategory(undefined)}
            className="justify-between rounded-xl h-8 text-xs font-normal"
          >
            <span>All Collections</span>
            {!selectedCategoryId ? <Badge variant="outline" className="text-[10px] py-0 px-1.5">All</Badge> : null}
          </Button>
          {categories.map((c) => {
            const isSelected = selectedCategoryId === c.id;
            return (
              <Button
                key={c.id}
                type="button"
                variant={isSelected ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onSelectCategory(isSelected ? undefined : c.id)}
                className="justify-between rounded-xl h-8 text-xs font-normal"
              >
                <span className="truncate">{c.name}</span>
                {isSelected ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Jewellery Kind / Type */}
      <div className="space-y-2.5 pt-2 border-t">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Piece Type</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectKind(undefined)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !selectedKind
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All
          </button>
          {jewelleryKinds.map((k) => {
            const isSelected = selectedKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onSelectKind(isSelected ? undefined : k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition capitalize ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {k.replace(/_/g, ' ').toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
