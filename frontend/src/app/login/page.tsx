'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Badge, toast } from '@vj/ui';
import { Navbar } from '@/components/layout/navbar';
import { useAuth } from '@/hooks/use-auth';
import { Sparkles, Lock, ArrowRight, ShieldCheck, User } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, loginPending } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await login({ email, password });
      toast.success('Welcome back to Lumière');
      router.push('/account');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid credentials. Please verify your email and password.';
      setErrorMsg(message);
      toast.error(message);
    }
  }

  function fillDemoAdmin() {
    setEmail('admin@vj.local');
    setPassword('Admin@12345');
    toast.info('Demo Admin credentials filled');
  }

  function fillDemoCustomer() {
    setEmail('customer@lumiere.local');
    setPassword('Customer@12345');
    toast.info('Demo Customer credentials filled');
  }

  return (
    <>
      <Navbar />
      <div className="relative mx-auto flex min-h-[80vh] max-w-lg items-center px-4 py-16">
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-[350px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.15),transparent_70%)] blur-2xl" />

        <Card className="w-full overflow-hidden rounded-3xl border border-primary/20 bg-card/90 shadow-2xl backdrop-blur-md">
          <CardHeader className="text-center pb-2 pt-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <CardTitle className="font-serif text-3xl font-light text-foreground">
              Sign In to Atelier
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Access your personalized virtual try-on lookbook and saved pieces.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 pt-4">
            {errorMsg ? (
              <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive text-center">
                {errorMsg}
              </div>
            ) : null}

            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Password
                  </Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-full py-6 text-sm font-medium shadow-md shadow-primary/20"
                disabled={loginPending}
              >
                {loginPending ? 'Authenticating…' : 'Sign In'}
              </Button>
            </form>

            {/* Quick Demo Credentials for Testing */}
            <div className="mt-6 rounded-2xl border bg-muted/40 p-3 text-center">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Quick Demo Access
              </span>
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillDemoAdmin}
                  className="rounded-full text-xs h-7"
                >
                  <Lock className="mr-1 h-3 w-3" /> Fill Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillDemoCustomer}
                  className="rounded-full text-xs h-7"
                >
                  <User className="mr-1 h-3 w-3" /> Fill Customer
                </Button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 text-center text-xs text-muted-foreground">
              <p>
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-semibold text-primary hover:underline">
                  Create free account
                </Link>
              </p>
              <p>
                Or continue exploring without signing in:{' '}
                <Link href="/products" className="text-foreground hover:underline">
                  Browse Catalogue
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
