'use client';

import { JewelleryKind } from '@vj/shared';
import { Button } from '@vj/ui';

export interface TryOnCategorySwitchProps {
  categories: JewelleryKind[];
  selectedCategory: JewelleryKind | 'ALL';
  onSelectCategory: (category: JewelleryKind | 'ALL') => void;
  className?: string;
}

export function TryOnCategorySwitch({
  categories,
  selectedCategory,
  onSelectCategory,
  className,
}: TryOnCategorySwitchProps) {
  if (categories.length <= 1) return null;

  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none ${className ?? ''}`}>
      <Button
        type="button"
        size="sm"
        variant={selectedCategory === 'ALL' ? 'default' : 'outline'}
        onClick={() => onSelectCategory('ALL')}
        className="h-7 rounded-full text-xs px-3 font-medium shrink-0"
      >
        All Pieces
      </Button>
      {categories.map((kind) => {
        const isSelected = selectedCategory === kind;
        return (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            onClick={() => onSelectCategory(kind)}
            className="h-7 rounded-full text-xs px-3 font-medium shrink-0 capitalize"
          >
            {kind.replace(/_/g, ' ').toLowerCase()}
          </Button>
        );
      })}
    </div>
  );
}
