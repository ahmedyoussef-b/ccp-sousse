// src/lib/navigation.ts
'use client';

import { useRouter as useNextRouter, usePathname as useNextPathname } from 'next/navigation';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

// Re-export des hooks Next.js pour qu'ils soient disponibles via @/lib/navigation
export const useRouter = () => useNextRouter();
export const usePathname = () => useNextPathname();

// Votre fonction utilitaire existante
export function navigateBack(router: AppRouterInstance, fallbackPath = '/') {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallbackPath);
  }
}