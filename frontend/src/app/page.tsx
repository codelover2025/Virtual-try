'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Diamond,
  Eye,
  Gem,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
  SlidersHorizontal,
  Layers,
  Heart,
} from 'lucide-react';
import { Button, Badge, formatPrice } from '@vj/ui';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { FALLBACK_CATALOGUE } from '@/features/try-on/fallback-catalogue';
import { getCachedOrFallbackCatalogue } from '@/features/try-on/offline-catalog';

const stats = [
  { value: '30 FPS', label: 'Real-Time On-Device AR' },
  { value: '100%', label: 'Private — Zero Video Uploads' },
  { value: '0.1mm', label: 'Sub-Millimeter Fit Tracking' },
  { value: '5 Types', label: 'Earrings, Necklaces, Rings & More' },
];

const categorySpotlights = [
  {
    kind: 'EARRINGS',
    name: 'Earrings & Drops',
    description: 'Chandelier drops and solitaire studs anchored seamlessly to bilateral earlobes with head tilt rotation.',
    icon: Sparkles,
    badge: 'Dual Earlobe Tracking',
    image: '/static/Image/Earring/earring_1.png',
    slug: 'earrings',
  },
  {
    kind: 'NECKLACE',
    name: 'Necklaces & Chokers',
    description: 'Handcrafted bridal chokers and royal collars calibrated across shoulders using MediaPipe Pose.',
    icon: Gem,
    badge: 'Biacromial Pose Anchor',
    image: '/static/Image/Necklace/necklace_1.png',
    slug: 'necklaces',
  },
  {
    kind: 'RINGS',
    name: 'Solitaires & Bands',
    description: 'Brilliant-cut diamond solitaires and platinum bands fitted directly on the ring finger via hand landmarking.',
    icon: Diamond,
    badge: 'Hand Landmark Fitting',
    image: '/static/Image/Ring/ring_1.png',
    slug: 'rings',
  },
  {
    kind: 'BANGLES',
    name: 'Bangles & Kadas',
    description: 'Carved gold kadas and bridal bangles tracking wrist contours with continuous scale stabilization.',
    icon: Layers,
    badge: 'Wrist Contour Fitting',
    image: '/static/Image/Bangle/bangle_1.png',
    slug: 'bangles',
  },
  {
    kind: 'NOSE_RING',
    name: 'Nose Rings & Septums',
    description: 'Delicate septum loops and bridal naths anchored to real nostril alar groove landmarks.',
    icon: Zap,
    badge: 'Alar Groove Tracking',
    image: '/assets/nosering-septum.svg',
    slug: 'nose-rings',
  },
];

const journeySteps = [
  {
    step: '01',
    title: 'Select Fine Jewellery',
    description: 'Explore our master catalogue of certified gemstones, bridal necklaces, solitaire rings, and royal kadas.',
    icon: Gem,
  },
  {
    step: '02',
    title: 'Activate Live Studio',
    description: 'Launch your camera in one tap. On-device vision maps facial earlobes, pose landmarks, or hand joints.',
    icon: Camera,
  },
  {
    step: '03',
    title: 'Real-Time Fitting & Capture',
    description: 'Turn, tilt, and smile. Photorealistic Three.js shaders reflect ambient lighting and download high-res snapshots.',
    icon: Sparkles,
  },
];

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [products, setProducts] = useState(FALLBACK_CATALOGUE);

  // Sync with client cache after mount to prevent SSR hydration mismatch
  useEffect(() => {
    const cached = getCachedOrFallbackCatalogue();
    if (cached && cached.length > 0) {
      setProducts(cached);
    }
  }, []);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'ALL') return products;
    return products.filter((p) => p.jewelleryKind === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 1. Header with logo and navigation */}
      <Navbar />

      <main className="flex-1 space-y-24 pb-24 overflow-hidden">
        {/* 2. Hero Section */}
        <section className="relative overflow-hidden border-b bg-gradient-to-b from-background via-background/95 to-secondary/20 pt-12 pb-20 lg:pt-20 lg:pb-32">
          {/* Ambient Gold Glow */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.2),transparent_70%)] blur-3xl" />

          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            {/* Left Hero Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>STUDIO-GRADE VIRTUAL JEWELLERY ATELIER</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.08] text-foreground">
                See every piece <br />
                <span className="font-normal italic text-primary">on you</span> before <br />
                you fall in love.
              </h1>

              <p className="max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                Experience photorealistic augmented reality for certified diamond earrings, royal chokers,
                solitaire rings, bangles, and nose rings. Sub-millimeter fit calibrated in real-time right inside your browser.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 py-6 text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105 transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <Link href="/try-on">
                    <Camera className="mr-2 h-4 w-4" aria-hidden="true" /> Open Virtual Studio
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full px-7 py-6 text-sm font-medium hover:border-primary/50 transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <Link href="/products">
                    Explore Catalogue <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>On-Device Privacy</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>Zero-Latency 3D WebGL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Diamond className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>100% Certified Gemstones</span>
                </div>
              </div>
            </motion.div>

            {/* Right Hero Visual: Interactive Studio Simulator Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="relative"
            >
              <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card via-background to-secondary shadow-2xl">
                {/* Simulated Camera Feed Viewfinder */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-950 to-black text-white p-6 flex flex-col justify-between">
                  {/* Viewfinder Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 font-mono text-[11px] border border-white/10">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                      <span>LUMIÈRE AR · 30 FPS</span>
                    </div>
                    <div className="text-[11px] font-mono text-white/60">VISION: ACTIVE</div>
                  </div>

                  {/* Center AR Fitting Illusion */}
                  <div className="relative flex flex-col items-center justify-center my-auto text-center">
                    <div className="relative flex items-center justify-center h-48 w-48 rounded-full border border-dashed border-primary/50 animate-[spin_20s_linear_infinite]">
                      <div className="absolute top-2 h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary" />
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <Sparkles className="h-10 w-10 text-primary drop-shadow-[0_0_15px_rgba(212,175,55,0.8)] animate-pulse" aria-hidden="true" />
                      <span className="mt-3 font-serif text-lg font-light tracking-wide text-white">
                        Sub-Millimeter Fit
                      </span>
                      <span className="text-[11px] text-white/60 uppercase tracking-widest font-mono">
                        Target: Earring / Neck / Hand
                      </span>
                    </div>
                  </div>

                  {/* Viewfinder Bottom Banner */}
                  <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Live Camera Ready</p>
                      <p className="text-[11px] text-white/60">Experience fine jewellery pieces</p>
                    </div>
                    <Button asChild size="sm" className="rounded-full text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Link href="/try-on">
                        Explore Studio <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Floating Luxury Badges */}
              <div className="absolute -bottom-6 -left-6 hidden sm:flex items-center gap-3 rounded-2xl border border-primary/20 bg-card/90 backdrop-blur-md p-4 shadow-xl">
                <div className="rounded-full bg-primary/20 p-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-foreground">True-to-Scale Accuracy</p>
                  <p className="text-muted-foreground">Calibrated for natural proportions</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 3. Real-Time Metrics Banner */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-6 rounded-3xl border bg-card/60 backdrop-blur-sm p-6 sm:grid-cols-4 sm:p-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center sm:text-left">
                <p className="font-serif text-3xl sm:text-4xl font-light text-primary">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Featured Category Collections */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="outline" className="border-primary/40 text-primary">
              Multi-Category AR Fitting
            </Badge>
            <h2 className="font-serif text-3xl sm:text-5xl font-light text-foreground">
              Curated Showroom Collections
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              Each collection is paired with specialized computer vision anchors: from bilateral earlobes and pose shoulders to finger joints and nostril grooves.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {categorySpotlights.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.kind}
                  href={`/try-on?category=${cat.slug}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-card p-6 shadow-sm hover:shadow-xl hover:border-primary/50 transition-all duration-300"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary group-hover:scale-110 transition-transform">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono tracking-wider">
                        {cat.badge}
                      </Badge>
                    </div>

                    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted/30 p-4 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cat.image}
                        alt={`${cat.name} illustration`}
                        className="h-28 w-28 object-contain transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>

                    <div>
                      <h3 className="font-serif text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                        {cat.name}
                      </h3>
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {cat.description}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 5. Product Showcase Grid from the Catalogue */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-6">
            <div className="space-y-2">
              <Badge variant="outline" className="border-primary/40 text-primary">
                Instant Virtual Fitting
              </Badge>
              <h2 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
                Masterpiece Catalogue
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Select any piece to immediately test the real-time 3D drape on your camera.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'ALL', label: 'All Pieces' },
                { id: 'EARRINGS', label: 'Earrings' },
                { id: 'NECKLACE', label: 'Necklaces' },
                { id: 'RINGS', label: 'Rings' },
                { id: 'BANGLES', label: 'Bangles' },
                { id: 'NOSE_RING', label: 'Nose Rings' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`rounded-full px-4 py-2 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                    selectedCategory === tab.id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const imageUrl = product.primaryImage?.url || '/assets/earrings-drop.svg';
              return (
                <Link
                  key={product.id}
                  href={`/try-on/${product.id}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-card shadow-sm hover:shadow-xl hover:border-primary/50 transition-all duration-300 cursor-pointer"
                >
                  <div>
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/5] overflow-hidden bg-muted/40 p-6 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt={product.primaryImage?.altText || product.name}
                        className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-108"
                      />
                      <div className="absolute top-3 left-3">
                        <Badge className="bg-background/90 text-foreground backdrop-blur-md text-[10px] uppercase font-mono tracking-wider border border-border/60">
                          {product.jewelleryKind.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{product.sku}</span>
                        <span className="text-primary font-medium">{product.category?.name}</span>
                      </div>
                      <h3 className="font-serif text-base font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {product.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  </div>

                  {/* Card Footer with Price */}
                  <div className="p-5 pt-0 border-t mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Price</p>
                      <p className="font-serif text-base font-semibold text-primary">
                        {formatPrice(product.priceCents, product.currency || undefined)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1 font-medium">
                      View Atelier <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="flex justify-center pt-6">
            <Button asChild variant="outline" size="lg" className="rounded-full px-8">
              <Link href="/products">
                View Full Showroom Catalogue <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        {/* 6. Three-Step Studio Journey */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="outline" className="border-primary/40 text-primary">
              Seamless Workflow
            </Badge>
            <h2 className="font-serif text-3xl sm:text-5xl font-light text-foreground">
              The Haute Joaillerie Atelier, in Your Browser
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              No app store downloads, zero personal video uploads. Experience luxury jewellery virtually as if standing before a Parisian mirror.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {journeySteps.map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.step}
                  className="group relative rounded-3xl border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-3xl font-light text-primary/40 group-hover:text-primary transition-colors">
                      {st.step}
                    </span>
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary group-hover:scale-110 transition-transform">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="mt-6 font-serif text-xl font-medium text-foreground">{st.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{st.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7. Trust & Guarantee Banner */}
        <section className="border-y bg-secondary/30 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-8 md:grid-cols-4">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Diamond className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-serif text-base font-medium">100% Certified Gemstones</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Every piece is verified by GIA and IGI international grading laboratories.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Lock className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-serif text-base font-medium">Private AR Experience</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Video feeds never leave your device. Zero cloud transmission of personal camera data.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <RotateCcw className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-serif text-base font-medium">30-Day Atelier Exchange</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Complimentary insured return and exchange policy on all fine jewellery.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Eye className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-serif text-base font-medium">Virtual Lookbook</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Capture snapshots, compare pieces side-by-side, and download high-res images.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 8. VIP Concierge Atelier Banner */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-r from-card via-background to-secondary p-8 sm:p-14 shadow-2xl">
            <div className="max-w-2xl space-y-4">
              <Badge variant="outline" className="border-primary/40 text-primary">
                Private Atelier Concierge
              </Badge>
              <h2 className="font-serif text-3xl sm:text-4xl font-light text-foreground">
                Require bespoke sizing or bridal consultation?
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Connect with our master gemologists for high-definition 1-on-1 virtual walkthroughs, custom gemstone sourcing, and tailored bridal sets.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <Button asChild className="rounded-full px-6">
                  <Link href="/try-on">Enter AR Atelier</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full px-6">
                  <Link href="/products">Browse All Collections</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <Footer />
    </div>
  );
}
