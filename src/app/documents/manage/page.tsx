'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Page obsolète - Redirection vers le hub central /admin
 */
export default function DeprecatedManagePage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return null;
}
