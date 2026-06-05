// src/app/api/chromadb/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { chromaDBAudit } from '@/lib/logger/chromadb-audit';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'stats';
  const limit = parseInt(searchParams.get('limit') || '50');
  const minDuration = parseInt(searchParams.get('minDuration') || '0');
  
  if (action === 'stats') {
    const hours = parseInt(searchParams.get('hours') || '24');
    const stats = chromaDBAudit.getStats(hours);
    return NextResponse.json(stats);
  }
  
  if (action === 'slow') {
    const operations = chromaDBAudit.getSlowOperations(minDuration, limit);
    return NextResponse.json({ operations, count: operations.length });
  }
  
  if (action === 'errors') {
    const errors = chromaDBAudit.getErrors(limit);
    return NextResponse.json({ errors, count: errors.length });
  }
  
  if (action === 'collection') {
    const collection = searchParams.get('name');
    if (!collection) {
      return NextResponse.json({ error: 'Collection name required' }, { status: 400 });
    }
    const operations = chromaDBAudit.getOperationsByCollection(collection, limit);
    return NextResponse.json({ operations, count: operations.length });
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}