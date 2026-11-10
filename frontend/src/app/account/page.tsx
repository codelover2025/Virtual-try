'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@vj/ui';
import { useAuth } from '@/hooks/use-auth';
import { User, Sparkles, Camera, Heart, Shield, ArrowRight, Settings } from 'lucide-react';

export default function AccountProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-background to-secondary p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary font-serif text-2xl font-light">
            {user?.fullName ? user.fullName[0]?.toUpperCase() : 'L'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-light text-foreground">{user?.fullName ?? 'Valued Client'}</h1>
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                {user?.roles?.includes('ADMIN') ? 'ATELIER ADMIN' : 'VIP CLIENT'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        </div>

        <Button asChild size="sm" className="rounded-full gap-1.5 self-start sm:self-auto">
          <Link href="/try-on">
            <Camera className="h-4 w-4" /> Enter Try-On Studio
          </Link>
        </Button>
      </div>

      {/* Account Overview Cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="rounded-3xl border">
          <CardHeader className="pb-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Virtual Lookbook</span>
            <CardTitle className="font-serif text-3xl font-light text-primary">Saved Portraits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              View, download, and compare your real-time jewellery try-on snapshots.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4 rounded-full w-full">
              <Link href="/account/captures">
                Open Lookbook <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border">
          <CardHeader className="pb-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Wishlist</span>
            <CardTitle className="font-serif text-3xl font-light text-foreground">Curated Pieces</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Explore your shortlisted diamond earrings, necklaces, and solitaire rings.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4 rounded-full w-full">
              <Link href="/products">
                Browse Catalogue <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border">
          <CardHeader className="pb-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Security</span>
            <CardTitle className="font-serif text-3xl font-light text-foreground">Client Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All live AR tracking is executed strictly on your local browser engine.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-primary font-medium">
              <Shield className="h-4 w-4" />
              <span>Zero cloud video retention</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member Details */}
      <Card className="rounded-3xl border">
        <CardHeader>
          <CardTitle className="font-serif text-xl font-light">Atelier Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Full Name</span>
            <span className="mt-1 font-medium text-foreground">{user?.fullName ?? 'Not specified'}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Registered Email</span>
            <span className="mt-1 font-medium text-foreground">{user?.email ?? 'Not specified'}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Account Roles</span>
            <span className="mt-1 font-medium text-foreground">{user?.roles?.join(', ') || 'CUSTOMER'}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block">Studio Fitting Mode</span>
            <span className="mt-1 font-medium text-foreground">Three.js WebGL + BlazeFace AI</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
