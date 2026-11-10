'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, toast } from '@vj/ui';
import { Navbar } from '@/components/layout/navbar';
import { useAuth } from '@/hooks/use-auth';
import { Sparkles, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { register, registerPending } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await register({ fullName, email, password });
      toast.success('Your Atelier account has been created');
      router.push('/account');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try a different email.';
      setErrorMsg(message);
      toast.error(message);
    }
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
              Create Atelier Account
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Join Lumière to save try-on portraits, track custom requests, and curate your wishlist.
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
                <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Eleanor Vance"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl"
                />
              </div>

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
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-full py-6 text-sm font-medium shadow-md shadow-primary/20"
                disabled={registerPending}
              >
                {registerPending ? 'Creating Account…' : 'Create Free Account'}
              </Button>
            </form>

            <div className="mt-6 flex flex-col gap-2 text-center text-xs text-muted-foreground">
              <p>
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </p>
              <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Encrypted credentials · On-device vision privacy</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
