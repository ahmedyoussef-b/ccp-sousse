export const runtime = 'edge';

// app/api/vision/folders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const folders = await visionService.listFolders();
    return NextResponse.json({ success: true, folders });
  } catch (error) {
    console.error('❌ Erreur liste dossiers vision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, parentId } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Nom de dossier requis' }, { status: 400 });
    }

    const newFolder = await visionService.createFolder({ name, parentId: parentId || 'root' });
    return NextResponse.json({ success: true, folder: newFolder });
  } catch (error) {
    console.error('❌ Erreur création dossier vision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID de dossier requis' }, { status: 400 });
    }

    const success = await visionService.deleteFolder(id);
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Impossible de supprimer le dossier' }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Erreur suppression dossier vision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
