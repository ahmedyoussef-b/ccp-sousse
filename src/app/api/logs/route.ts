export const runtime = 'edge';

// src/app/api/logs/route.ts
// API pour consulter les traces

import { requestLogger } from '@/lib/logger/request-logger';
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'traces';
  const limit = parseInt(searchParams.get('limit') || '50');
  const minDuration = parseInt(searchParams.get('minDuration') || '0');
  const successOnly = searchParams.get('successOnly') === 'true';
  
  if (action === 'statistics') {
    const stats = requestLogger.getStatistics();
    return NextResponse.json(stats);
  }
  
  if (action === 'trace') {
    const traceId = searchParams.get('id');
    if (!traceId) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }
    
    // Chercher dans les fichiers
    const logsDir = path.join(process.cwd(), 'data', 'logs', 'traces');
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir);
      for (const file of files) {
        const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const trace = JSON.parse(line);
          if (trace.id === traceId) {
            return NextResponse.json(trace);
          }
        }
      }
    }
    
    return NextResponse.json({ error: 'Trace non trouvée' }, { status: 404 });
  }
  
  if (action === 'slow') {
    const traces = requestLogger.getTraces(limit, { minDuration: minDuration || 30000 });
    return NextResponse.json({ traces, count: traces.length });
  }
  
  // action = 'traces' par défaut
  const traces = requestLogger.getTraces(limit, { successOnly });
  return NextResponse.json({ traces, count: traces.length });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const olderThan = parseInt(searchParams.get('olderThan') || '7');
  
  const logsDir = path.join(process.cwd(), 'data', 'logs', 'traces');
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const cutoff = now - olderThan * 24 * 60 * 60 * 1000;
    
    let deleted = 0;
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    
    return NextResponse.json({ deleted });
  }
  
  return NextResponse.json({ deleted: 0 });
}