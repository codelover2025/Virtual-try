import type { ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center', className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
