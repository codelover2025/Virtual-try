'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@vj/ui';
import Link from 'next/link';

export interface TryOnErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  showBackToCatalogue?: boolean;
  className?: string;
}

export function TryOnErrorState({
  title = 'Studio Camera Unavailable',
  description = 'Could not access device camera or session failed to start. Please check camera permissions in your browser settings.',
  onRetry,
  showBackToCatalogue = true,
  className,
}: TryOnErrorStateProps) {
  return (
    <div
      className={`mx-auto max-w-md rounded-3xl border border-destructive/30 bg-destructive/5 backdrop-blur-md p-8 text-center shadow-lg ${
        className ?? ''
      }`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
        <AlertCircle className="h-7 w-7" />
      </div>

      <h3 className="font-serif text-xl font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{description}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <Button onClick={onRetry} size="sm" className="rounded-full gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </Button>
        ) : null}

        {showBackToCatalogue ? (
          <Button asChild variant="outline" size="sm" className="rounded-full text-xs">
            <Link href="/products">Browse Catalogue</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
