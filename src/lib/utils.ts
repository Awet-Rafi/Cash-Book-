import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: 'USD' | 'SSP' = 'USD') {
  const roundedAmount = Math.round(amount);
  if (currency === 'SSP') {
    return `${roundedAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} SSP`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundedAmount);
}

export function safeTimestamp(timestamp: any): string {
  if (!timestamp) return "";
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  return new Date(timestamp).toISOString();
}
