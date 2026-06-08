export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const sqlite = getSQLiteCore();
    const results = sqlite.reference.search(query);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error searching reference:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}
