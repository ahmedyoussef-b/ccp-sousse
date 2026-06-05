// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SyncStatusIndicator } from '@/components/document/SyncStatusIndicator';

export const metadata: Metadata = {
  title: 'AGENTIC - Assistant IA Industriel',
  description: 'Solution industrielle souveraine, hors ligne et gratuite',
};

// Initialisation asynchrone déportée pour ne pas bloquer le rendu initial
// Les services s'auto-initialisent désormais à la première demande ou en arrière-plan


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased selection:bg-accent/30">
        <div className="min-h-screen bg-background">
          {children}
          <SyncStatusIndicator />
        </div>
        <Toaster />
      </body>
    </html>
  );
}