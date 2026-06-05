// src/middleware/logging-middleware.ts
// Capture toutes les requêtes API

import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const url = request.url;
  const method = request.method;
  
  // Ne loguer que les requêtes API
  if (!url.includes('/api/')) {
    return NextResponse.next();
  }
  
  console.log(`[REQUEST] ${method} ${url.substring(0, 100)} - DÉBUT`);
  
  const response = NextResponse.next();
  
  const duration = Date.now() - startTime;
  console.log(`[REQUEST] ${method} ${url.substring(0, 100)} - FIN (${duration}ms)`);
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};