'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@vj/ui';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Atelier Render Error:', error);
  }, [error]);

  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-xs uppercase tracking-widest text-destructive font-mono font-semibold">
          Render Interrupted
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
          Temporary Studio Interruption
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {error.message || 'An unexpected glitch occurred while preparing your virtual jewellery session.'}
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={() => reset()} className="rounded-full shadow-sm">
          <RefreshCw className="mr-2 h-4 w-4" /> Reload Atelier
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" /> Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
