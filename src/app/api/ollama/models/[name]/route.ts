// app/api/ollama/models/[name]/route.ts
// API pour supprimer un modèle

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    
    await execAsync(`ollama rm ${name}`);
    
    return NextResponse.json({ success: true, message: `Modèle ${name} supprimé` });
  } catch (error) {
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { error: 'Impossible de supprimer le modèle' },
      { status: 500 }
    );
  }
}