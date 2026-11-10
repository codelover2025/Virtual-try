'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Moon,
  Sparkles,
  Sun,
  User,
  Search,
  Camera,
  Bookmark,
  ShoppingBag,
  LogOut,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, Input } from '@vj/ui';
import { useAuth } from '@/hooks/use-auth';

const categories = [
  { href: '/products', label: 'All Catalogue' },
  { href: '/categories', label: 'Collections' },
  { href: '/try-on', label: 'Virtual Studio', isStudio: true },
];

export function Navbar() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  function toggleTheme() {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    root.classList.toggle('dark', next);
    window.localStorage.setItem('vj-theme', next ? 'dark' : 'light');
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center gap-2.5 select-none">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <span className="font-serif text-2xl font-light tracking-widest text-foreground block leading-none">
              LUMIÈRE
            </span>
            <span className="text-[9px] uppercase tracking-[0.3em] text-primary font-sans font-semibold">
              High Atelier
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main Storefront">
          {categories.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`text-xs uppercase tracking-widest transition-colors ${
                c.isStudio
                  ? 'flex items-center gap-1.5 font-semibold text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20'
                  : 'font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.isStudio && <Camera className="h-3.5 w-3.5 animate-pulse" />}
              <span>{c.label}</span>
            </Link>
          ))}
        </nav>

        {/* Right Header Utilities: Search, Theme, Auth, Mobile Menu */}
        <div className="flex items-center gap-2.5">
          {/* Search Toggle */}
          {searchOpen ? (
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Input
                placeholder="Search jewellery, solitaires…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-48 sm:w-64 h-9 rounded-full text-xs pr-8"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="rounded-full text-muted-foreground hover:text-foreground h-9 w-9"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}

          {/* Theme Switcher */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full text-muted-foreground hover:text-foreground h-9 w-9"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>

          {/* Virtual Lookbook Link */}
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="rounded-full text-muted-foreground hover:text-foreground h-9 w-9 hidden sm:inline-flex"
            title="My Saved Captures"
          >
            <Link href="/account/captures">
              <Bookmark className="h-4 w-4" />
            </Link>
          </Button>

          {/* Auth State */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex rounded-full text-xs">
                <Link href="/account">
                  <User className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  {user?.fullName?.split(' ')[0] ?? 'Account'}
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void logout()}
                className="text-xs text-muted-foreground hover:text-foreground rounded-full"
              >
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex rounded-full text-xs">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full px-4 text-xs shadow-sm">
                <Link href="/register">Join Atelier</Link>
              </Button>
            </div>
          )}

          {/* Mobile Drawer Trigger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden rounded-full h-9 w-9" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 rounded-l-3xl p-6">
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <SheetTitle className="font-serif text-2xl font-light">Lumière</SheetTitle>
                </div>
              </SheetHeader>

              <nav className="mt-6 flex flex-col gap-4 text-sm">
                <Link
                  href="/try-on"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-2xl bg-primary/10 border border-primary/20 p-3.5 font-medium text-primary shadow-xs"
                >
                  <Camera className="h-5 w-5" />
                  <div>
                    <p className="font-semibold text-sm">Virtual Fitting Studio</p>
                    <p className="text-[11px] text-muted-foreground">Try jewellery on your camera</p>
                  </div>
                </Link>

                <Link
                  href="/products"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2 text-foreground hover:bg-muted font-medium"
                >
                  Catalogue
                </Link>

                <Link
                  href="/categories"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2 text-foreground hover:bg-muted font-medium"
                >
                  Collections
                </Link>

                <Link
                  href="/account/captures"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2 text-foreground hover:bg-muted font-medium"
                >
                  My Virtual Lookbook
                </Link>

                <div className="pt-4 border-t space-y-3">
                  {isAuthenticated ? (
                    <>
                      <Link
                        href="/account"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-foreground hover:bg-muted font-medium"
                      >
                        <User className="h-4 w-4 text-primary" /> Account Profile
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          void logout();
                        }}
                        className="flex items-center gap-2 w-full text-left rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground font-medium"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button asChild variant="outline" className="rounded-full text-xs">
                        <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
                      </Button>
                      <Button asChild className="rounded-full text-xs">
                        <Link href="/register" onClick={() => setOpen(false)}>Join</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
