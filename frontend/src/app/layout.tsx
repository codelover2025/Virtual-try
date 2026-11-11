import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/ui/styles/globals.css';
import { AppProviders } from '@/providers/app-providers';
import { ThemeProvider } from '@/providers/theme-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistSerif = Geist_Mono({
  variable: '--font-geist-serif',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Lumière — Virtual Jewellery Try-On',
    template: '%s · Lumière',
  },
  description: 'Shop premium jewellery and try pieces on instantly with your camera.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistSerif.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
