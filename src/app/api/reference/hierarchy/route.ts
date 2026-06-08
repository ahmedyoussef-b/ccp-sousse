export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  try {
    const sqlite = getSQLiteCore();
    const hierarchy = sqlite.reference.getHierarchy();
    return NextResponse.json({ zones: hierarchy });
  } catch (error) {
    console.error('Error fetching hierarchy:', error);
    return NextResponse.json({ error: 'Failed to fetch hierarchy' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sqlite = getSQLiteCore();
    const body = await req.json();
    const { action, type, data } = body;

    switch (action) {
      case 'save':
        if (type === 'zone') sqlite.reference.saveZone(data);
        else if (type === 'circuit') sqlite.reference.saveCircuit(data);
        else if (type === 'parametre') sqlite.reference.saveParametre(data);
        else if (type === 'alias') sqlite.reference.saveAlias(data);
        break;
      case 'delete':
        if (type === 'zone') sqlite.reference.deleteZone(data.id);
        else if (type === 'circuit') sqlite.reference.deleteCircuit(data.id);
        else if (type === 'parametre') sqlite.reference.deleteParametre(data.id);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating hierarchy:', error);
    return NextResponse.json({ error: 'Failed to update hierarchy' }, { status: 500 });
  }
}
