'use client';

import type { useRouter } from 'next/navigation';

type AppRouterInstance = ReturnType<typeof useRouter>;

export function navigateBack(router: AppRouterInstance, fallbackPath = '/') {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallbackPath);
  }
}
