'use client';

import Link from 'next/link';
import type { CategoryDto } from '@vj/types';
import { cn } from '../lib/utils.js';

export function CategoryCard({ category, className }: { category: CategoryDto; className?: string }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={cn(
        'group relative flex min-h-[140px] flex-col justify-end overflow-hidden rounded-xl border bg-gradient-to-br from-secondary to-background p-5 transition hover:border-primary/40 hover:shadow-md',
        className,
      )}
    >
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Collection</span>
      <span className="mt-1 text-xl font-semibold group-hover:text-primary">{category.name}</span>
      {category.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{category.description}</p>
      ) : null}
    </Link>
  );
}
