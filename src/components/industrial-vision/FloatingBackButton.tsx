// src/components/industrial-vision/FloatingBackButton.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowLeft } from 'lucide-react';
import { navigateBack } from '@/lib/navigation';

export function FloatingBackButton() {
  const router = useRouter();
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {showScrollTop && (
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full shadow-lg"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
      
      <Button
        size="icon"
        variant="outline"
        className="rounded-full shadow-lg bg-background"
        onClick={() => navigateBack(router, '/industrial-vision')}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}