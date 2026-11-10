'use client';

import Link from 'next/link';
import { Sparkles, Diamond, ShieldCheck, Camera, ArrowRight } from 'lucide-react';
import { Button, Input, toast } from '@vj/ui';
import { useState } from 'react';

export function Footer() {
  const [email, setEmail] = useState('');

  function onSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    toast.success('Thank you for subscribing to Lumière Atelier journal');
    setEmail('');
  }

  return (
    <footer className="border-t border-border/80 bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">
          {/* Col 1: Brand & Manifesto */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 select-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-serif text-2xl font-light tracking-widest text-foreground">
                LUMIÈRE
              </span>
            </Link>
            <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
              Pioneering haute joaillerie through precision augmented reality. Discover conflict-free diamond
              masterpieces, bespoke bridal solitaires, and try them on live before acquisition.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1">
                <Diamond className="h-3.5 w-3.5 text-primary" /> Certified Gemstones
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> On-Device Vision
              </span>
            </div>
          </div>

          {/* Col 2: Showroom Collections */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground">Showroom</p>
            <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
              <li>
                <Link href="/products" className="hover:text-primary transition">
                  Complete Catalogue
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-primary transition">
                  Curated Collections
                </Link>
              </li>
              <li>
                <Link href="/try-on" className="hover:text-primary transition flex items-center gap-1.5 text-primary font-medium">
                  <Camera className="h-3 w-3" /> Virtual Fitting Studio
                </Link>
              </li>
              <li>
                <Link href="/account/captures" className="hover:text-primary transition">
                  My Saved Lookbook
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Client Services */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground">Concierge</p>
            <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
              <li>
                <Link href="/account" className="hover:text-primary transition">
                  Atelier Account
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-primary transition">
                  Client Portal
                </Link>
              </li>
              <li>
                <a
                  href={process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary transition"
                >
                  Executive Console (Admin)
                </a>
              </li>
              <li>
                <span className="text-muted-foreground">Complimentary Insured Shipping</span>
              </li>
            </ul>
          </div>

          {/* Col 4: Newsletter */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground">Atelier Gazette</p>
            <p className="text-xs text-muted-foreground">
              Receive private invitations to new fine jewellery debuts, AR studio releases, and bespoke trunk shows.
            </p>
            <form onSubmit={onSubscribe} className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter your email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-full text-xs h-9"
              />
              <Button type="submit" size="sm" className="rounded-full text-xs px-4 shrink-0">
                Join
              </Button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t pt-8 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Lumière Virtual Jewellery Studio. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="hover:text-foreground transition cursor-pointer">Privacy & Vision Policy</span>
            <span className="hover:text-foreground transition cursor-pointer">Terms of Service</span>
            <span className="hover:text-foreground transition cursor-pointer">Atelier Certification</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
