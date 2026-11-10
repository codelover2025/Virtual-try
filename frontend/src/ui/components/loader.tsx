import { cn } from '../lib/utils.js';

export function PageLoader({ className, label = 'Loading…' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)} role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
