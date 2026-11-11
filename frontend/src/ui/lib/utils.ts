import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number | null | undefined, currency = 'INR'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(cents / 100);
}
