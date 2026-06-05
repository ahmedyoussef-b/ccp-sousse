// src/components/industrial-vision/VisionNavigation.tsx

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Grid3x3, Database, Brain, Gauge, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigateBack } from '@/lib/navigation';

interface VisionNavigationProps {
  currentPage: string;
  className?: string;
}

const navItems = [
  { label: 'Dashboard', href: '/industrial-vision', icon: Home },
  { label: 'Innovations', href: '/industrial-vision/innovations', icon: Gauge },
  { label: 'Références', href: '/industrial-vision/references', icon: Database },
  { label: 'RAG Vision', href: '/industrial-vision/rag', icon: Brain },
  { label: 'Analyse', href: '/industrial-vision/analyze', icon: Camera }
];

export function VisionNavigation({ currentPage, className }: VisionNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className={cn("mb-6", className)}>
      {/* Bouton retour mobile */}
      <div className="md:hidden mb-3">
        <Button variant="outline" size="sm" onClick={() => navigateBack(router, '/industrial-vision')} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Button>
      </div>

      {/* Navigation desktop */}
      <div className="hidden md:flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="gap-1">
            <Home className="h-3.5 w-3.5" />
            Accueil
          </Button>
          <span className="text-gray-500">/</span>
          <Button variant="ghost" size="sm" onClick={() => router.push('/industrial-vision')} className="gap-1">
            <Grid3x3 className="h-3.5 w-3.5" />
            Vision Industrielle
          </Button>
          <span className="text-gray-500">/</span>
          <span className="text-sm font-medium text-cyan-400">{currentPage}</span>
        </div>

        <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              onClick={() => router.push(item.href)}
              className={cn(
                "text-xs gap-1",
                pathname === item.href && "bg-cyan-500/10 text-cyan-400"
              )}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}