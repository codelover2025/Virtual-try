'use client';

import { create } from 'zustand';
import type { JewelleryKind } from '@vj/shared';
import { getCachedOrFallbackCatalogue } from '@/features/try-on/offline-catalog';

export const VALID_STUDIO_CATEGORIES = [
  'all',
  'rings',
  'earrings',
  'necklaces',
  'bangles',
  'nose-rings',
] as const;

export type StudioCategory = (typeof VALID_STUDIO_CATEGORIES)[number];

export function deriveCategoryFromProduct(
  product?: {
    id?: string;
    category?: { slug?: string; name?: string } | string | null;
    jewelleryKind?: string;
  } | null,
): string {
  if (!product) return 'all';

  // 1. Check category object or string
  if (typeof product.category === 'string') {
    const s = product.category.toLowerCase().trim();
    if (['rings', 'ring'].includes(s)) return 'rings';
    if (['earrings', 'earring'].includes(s)) return 'earrings';
    if (['necklaces', 'necklace'].includes(s)) return 'necklaces';
    if (['bangles', 'bangle'].includes(s)) return 'bangles';
    if (['nose-rings', 'nosering', 'nose_ring', 'nose-ring', 'nose rings'].includes(s)) return 'nose-rings';
  } else if (product.category && typeof product.category === 'object' && product.category.slug) {
    const s = product.category.slug.toLowerCase().trim();
    if (['rings', 'ring'].includes(s)) return 'rings';
    if (['earrings', 'earring'].includes(s)) return 'earrings';
    if (['necklaces', 'necklace'].includes(s)) return 'necklaces';
    if (['bangles', 'bangle'].includes(s)) return 'bangles';
    if (['nose-rings', 'nosering', 'nose_ring', 'nose-ring'].includes(s)) return 'nose-rings';
    return s;
  }

  // 2. Fallback to jewelleryKind
  if (product.jewelleryKind) {
    const k = product.jewelleryKind.toUpperCase();
    if (k === 'RINGS' || k === 'RING') return 'rings';
    if (k === 'EARRINGS' || k === 'EARRING') return 'earrings';
    if (k === 'NECKLACE' || k === 'NECKLACES') return 'necklaces';
    if (k === 'BANGLES' || k === 'BANGLE') return 'bangles';
    if (k === 'NOSE_RING' || k === 'NOSERING') return 'nose-rings';
  }

  return 'all';
}

export function categorySlugToJewelleryKind(slug?: string | null): JewelleryKind | 'ALL' {
  if (!slug || slug === 'all') return 'ALL';
  const s = slug.toLowerCase().trim();
  switch (s) {
    case 'rings':
    case 'ring':
      return 'RINGS';
    case 'earrings':
    case 'earring':
      return 'EARRINGS';
    case 'necklaces':
    case 'necklace':
      return 'NECKLACE';
    case 'bangles':
    case 'bangle':
      return 'BANGLES';
    case 'nose-rings':
    case 'nose_ring':
    case 'nosering':
    case 'nose-ring':
      return 'NOSE_RING';
    default:
      return 'ALL';
  }
}

export function jewelleryKindToCategorySlug(kind?: string | null): string {
  if (!kind || kind === 'ALL') return 'all';
  const k = kind.toUpperCase();
  if (k === 'RINGS' || k === 'RING') return 'rings';
  if (k === 'EARRINGS' || k === 'EARRING') return 'earrings';
  if (k === 'NECKLACE' || k === 'NECKLACES') return 'necklaces';
  if (k === 'BANGLES' || k === 'BANGLE') return 'bangles';
  if (k === 'NOSE_RING' || k === 'NOSERING') return 'nose-rings';
  return kind.toLowerCase();
}

export function updateStudioQuery(activeCategory: string, selectedItemId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (activeCategory && activeCategory !== 'all') {
      url.searchParams.set('category', activeCategory);
    } else {
      url.searchParams.delete('category');
    }
    if (selectedItemId) {
      url.searchParams.set('item', selectedItemId);
    } else {
      url.searchParams.delete('item');
    }
    const newRelativePathQuery = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, '', newRelativePathQuery);
  } catch {
    // Non-fatal in restricted or test environments
  }
}

export function readInitialStudioState(): { activeCategory: string; selectedItemId: string | null } {
  if (typeof window === 'undefined') {
    return { activeCategory: 'all', selectedItemId: null };
  }
  const params = new URLSearchParams(window.location.search);
  let category = params.get('category')?.toLowerCase().trim() || null;
  const itemId = params.get('item')?.trim() || null;

  const isValidCategory = category && (VALID_STUDIO_CATEGORIES as readonly string[]).includes(category);

  // If item is specified but category is missing or invalid: derive from item
  if (itemId && (!category || !isValidCategory || category === 'all')) {
    const catalogue = getCachedOrFallbackCatalogue();
    const product = catalogue.find((p) => p.id === itemId || p.slug === itemId || p.sku === itemId);
    if (product) {
      category = deriveCategoryFromProduct(product);
    }
  }

  // Fallback category if still invalid/missing
  if (!category || !(VALID_STUDIO_CATEGORIES as readonly string[]).includes(category)) {
    category = 'all';
  }

  return {
    activeCategory: category,
    selectedItemId: itemId,
  };
}

export interface StudioStoreState {
  activeCategory: string;
  selectedItemId: string | null;
  isStudioOpen: boolean;
  switcherScrollPos: number;

  setActiveCategory: (category: string) => void;
  setSelectedItemId: (id: string | null) => void;
  setStudioOpen: (open: boolean) => void;
  setSwitcherScrollPos: (pos: number) => void;

  openStudio: (options?: {
    itemId?: string;
    item?: any;
    category?: string;
  } | string) => void;
  closeStudio: () => void;
  selectPieceInStudio: (piece: { id: string; category?: any; jewelleryKind?: any }) => void;
  initFromUrl: () => void;
}

const initialValues = readInitialStudioState();

export const useStudioStore = create<StudioStoreState>((set, get) => ({
  activeCategory: initialValues.activeCategory,
  selectedItemId: initialValues.selectedItemId,
  isStudioOpen: false,
  switcherScrollPos: 0,

  setActiveCategory: (category: string) => {
    const state = get();
    updateStudioQuery(category, state.selectedItemId);
    set({ activeCategory: category });
  },

  setSelectedItemId: (id: string | null) => {
    const state = get();
    updateStudioQuery(state.activeCategory, id);
    set({ selectedItemId: id });
  },

  setStudioOpen: (open: boolean) => {
    set({ isStudioOpen: open });
  },

  setSwitcherScrollPos: (pos: number) => {
    set({ switcherScrollPos: pos });
  },

  openStudio: (options) => {
    let targetItemId: string | null = null;
    let targetCategory: string | null = null;
    let targetProduct: any = null;

    if (typeof options === 'string') {
      targetItemId = options;
    } else if (options && typeof options === 'object') {
      targetItemId = options.itemId || options.item?.id || null;
      targetProduct = options.item || null;
      targetCategory = options.category || null;
    }

    const state = get();
    let nextCategory = state.activeCategory;
    let nextItemId = targetItemId ?? state.selectedItemId;

    if (targetItemId || targetProduct) {
      // 3. DERIVE CATEGORY FROM THE ITEM:
      // When the studio opens with an item, set activeCategory = item.category
      // so the tab always matches the opened piece, including when it was opened from "All Pieces".
      const catalogue = getCachedOrFallbackCatalogue();
      const resolvedProduct =
        targetProduct ||
        catalogue.find((p) => p.id === targetItemId || p.slug === targetItemId);

      if (resolvedProduct) {
        nextCategory = deriveCategoryFromProduct(resolvedProduct);
      } else if (targetCategory) {
        nextCategory = targetCategory;
      }

      // Add a fallback: if activeCategory is missing or invalid, use the selected item's category, not 'all'.
      if (!nextCategory || nextCategory === 'all' || !(VALID_STUDIO_CATEGORIES as readonly string[]).includes(nextCategory)) {
        if (resolvedProduct) {
          nextCategory = deriveCategoryFromProduct(resolvedProduct);
        }
      }
    } else {
      // 2. OPEN / CLOSE HANDLERS:
      // On "Open Virtual Studio": do not modify activeCategory. Set selectedItemId only.
      if (!nextItemId) {
        const catalogue = getCachedOrFallbackCatalogue();
        const kind = categorySlugToJewelleryKind(state.activeCategory);
        const match = kind !== 'ALL' ? catalogue.find((p) => p.jewelleryKind === kind) : catalogue[0];
        if (match) {
          nextItemId = match.id;
        }
      }
    }

    // 6. DEBUG: console.log activeCategory and selectedItemId on studio open
    console.log('[Studio] OPEN - activeCategory:', nextCategory, 'selectedItemId:', nextItemId);

    updateStudioQuery(nextCategory, nextItemId);
    set({
      activeCategory: nextCategory,
      selectedItemId: nextItemId,
      isStudioOpen: true,
    });
  },

  closeStudio: () => {
    const state = get();
    // 2. OPEN / CLOSE HANDLERS:
    // On close: do not call setCategory('all') or reset any filter. Only hide the studio (setStudioOpen(false)).
    console.log('[Studio] CLOSE - activeCategory:', state.activeCategory, 'selectedItemId:', state.selectedItemId);

    updateStudioQuery(state.activeCategory, state.selectedItemId);
    set({
      isStudioOpen: false,
    });
  },

  selectPieceInStudio: (piece) => {
    // 5. SESSION CONTINUITY:
    // While the studio is open, switching pieces inside the studio updates
    // selectedItemId and activeCategory together. When the user closes the
    // studio, the page reflects the last piece they tried.
    const newCategory = deriveCategoryFromProduct(piece);
    console.log('[Studio] Switched piece inside studio:', {
      activeCategory: newCategory,
      selectedItemId: piece.id,
    });

    updateStudioQuery(newCategory, piece.id);
    set({
      activeCategory: newCategory,
      selectedItemId: piece.id,
    });
  },

  initFromUrl: () => {
    const fromUrl = readInitialStudioState();
    const state = get();
    // Only update if URL actually has state or differs
    if (fromUrl.activeCategory !== state.activeCategory || fromUrl.selectedItemId !== state.selectedItemId) {
      set({
        activeCategory: fromUrl.activeCategory,
        selectedItemId: fromUrl.selectedItemId ?? state.selectedItemId,
      });
    }
  },
}));

