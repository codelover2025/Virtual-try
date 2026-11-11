'use client';

import { Sparkles } from 'lucide-react';

export interface TryOnLoadingStateProps {
  label?: string;
  subtext?: string;
  className?: string;
}

export function TryOnLoadingState({
  label = 'Calibrating Virtual Fitting Studio…',
  subtext = 'Preparing AI tracking engine and 3D lighting shaders',
  className,
}: TryOnLoadingStateProps) {
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center justify-center rounded-3xl border bg-card/60 backdrop-blur-xl p-10 text-center shadow-xl ${
        className ?? ''
      }`}
    >
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping duration-1000" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <Sparkles className="h-6 w-6 text-primary animate-pulse" />
      </div>

      <h3 className="font-serif text-xl font-light text-foreground">{label}</h3>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-xs">{subtext}</p>
    </div>
  );
}
