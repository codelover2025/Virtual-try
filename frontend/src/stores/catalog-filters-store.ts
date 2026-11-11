'use client';

import type { JewelleryKind } from '@vj/shared';
import { create } from 'zustand';

interface CatalogFiltersState {
  q: string;
  categoryId: string | undefined;
  jewelleryKind: JewelleryKind | undefined;
  setQ: (q: string) => void;
  setCategoryId: (id: string | undefined) => void;
  setJewelleryKind: (kind: JewelleryKind | undefined) => void;
  reset: () => void;
}

export const useCatalogFiltersStore = create<CatalogFiltersState>((set) => ({
  q: '',
  categoryId: undefined,
  jewelleryKind: undefined,
  setQ: (q) => set({ q }),
  setCategoryId: (categoryId) => set({ categoryId }),
  setJewelleryKind: (jewelleryKind) => set({ jewelleryKind }),
  reset: () => set({ q: '', categoryId: undefined, jewelleryKind: undefined }),
}));
