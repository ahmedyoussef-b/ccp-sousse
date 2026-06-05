import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  try {
    const sqlite = getSQLiteCore();
    const stats = sqlite.reference.getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching reference stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
