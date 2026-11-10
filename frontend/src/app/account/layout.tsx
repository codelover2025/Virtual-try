'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { cn } from '@vj/ui';
import { useAuth } from '@/hooks/use-auth';
import { PageLoader } from '@vj/ui';

const links = [
  { href: '/account', label: 'Profile' },
  { href: '/account/captures', label: 'Captures' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login?next=' + encodeURIComponent(pathname));
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return null;

  return (
    <>
      <Navbar />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-row gap-2 md:flex-col" aria-label="Account">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium',
                pathname === l.href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div>{children}</div>
      </div>
    </>
  );
}
