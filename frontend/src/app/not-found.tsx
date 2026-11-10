import Link from 'next/link';
import { Button } from '@vj/ui';
import { Sparkles, Camera, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="pointer-events-none absolute h-[350px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.15),transparent_70%)] blur-3xl" />

      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-8 w-8" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-xs uppercase tracking-widest text-primary font-mono font-semibold">
          Error 404 · Uncharted Domain
        </span>
        <h1 className="font-serif text-3xl sm:text-5xl font-light text-foreground">
          Piece Not in Atelier
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          The piece or showroom salon you are looking for has either retired or does not exist.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button asChild className="rounded-full shadow-sm">
          <Link href="/products">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Showroom
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/try-on">
            <Camera className="mr-2 h-4 w-4 text-primary" /> Open Try-On Studio
          </Link>
        </Button>
      </div>
    </div>
  );
}
