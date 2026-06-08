export const runtime = 'edge';

// src/app/api/documents/tree/route.ts
import { NextResponse } from 'next/server';
import { fileService } from '@/lib/document-manager/file-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const tree = await fileService.getTree(refresh);
    return NextResponse.json({ tree });
  } catch (error) {
    console.error('[API][TREE] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
