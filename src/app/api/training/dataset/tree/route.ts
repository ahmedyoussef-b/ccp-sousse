// app/api/training/dataset/tree/route.ts
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

function buildTree(dirPath: string, relativePath: string = ''): FileNode[] {
  const items: FileNode[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: buildTree(fullPath, relPath)
        });
      } else {
        const stats = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }
    
    // Trier: dossiers d'abord, puis fichiers
    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
    
  } catch (error) {
    console.error('Error building tree:', error);
  }
  
  return items;
}

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'data');
    const tree = buildTree(dataPath);
    
    return NextResponse.json({ tree });
  } catch (error) {
    console.error('Error getting tree:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la lecture de l\'arborescence' },
      { status: 500 }
    );
  }
}