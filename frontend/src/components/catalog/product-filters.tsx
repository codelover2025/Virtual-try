'use client';

import { JewelleryKind } from '@vj/shared';
import { useDebounce } from '@vj/hooks';
import { useEffect, useState } from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@vj/ui';
import type { CategoryDto } from '@vj/types';
import { useCatalogFiltersStore } from '@/stores/catalog-filters-store';

const kinds = Object.values(JewelleryKind);

export function ProductFilters({ categories }: { categories: CategoryDto[] }) {
  const { q, categoryId, jewelleryKind, setQ, setCategoryId, setJewelleryKind, reset } = useCatalogFiltersStore();
  const [localQ, setLocalQ] = useState(q);
  const debouncedQ = useDebounce(localQ, 350);

  useEffect(() => {
    setQ(debouncedQ);
  }, [debouncedQ, setQ]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filters</h2>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          placeholder="Gold, floral, stud…"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={categoryId ?? 'all'} onValueChange={(v) => setCategoryId(v === 'all' ? undefined : v)}>
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={jewelleryKind ?? 'all'}
          onValueChange={(v) => setJewelleryKind(v === 'all' ? undefined : (v as typeof JewelleryKind.EARRINGS))}
        >
          <SelectTrigger>
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {k.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
