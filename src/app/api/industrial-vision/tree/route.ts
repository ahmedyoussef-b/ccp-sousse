export const runtime = 'edge';

//src/app/api/industrial-vision/tree/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

// Configuration des chemins
const DATA_BASE_PATH = path.join(process.cwd(), 'data');
const REFERENCES_BASE_PATH = path.join(DATA_BASE_PATH, 'industrial-references');
const CAPTURES_BASE_PATH = path.join(DATA_BASE_PATH, 'industrial-captures');
const REFERENCE_TYPES = ['marche_normale', 'arret_normale', 'defaut'];

// Types
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: TreeNode[];
  metadata?: any;
  fileType?: string;
}

interface TreeStats {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  byExtension: Record<string, number>;
}

// Initialisation des dossiers
async function ensureDirectories() {
  const dirs = [
    REFERENCES_BASE_PATH,
    ...REFERENCE_TYPES.map(t => path.join(REFERENCES_BASE_PATH, t)),
    CAPTURES_BASE_PATH
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
  }
}

// Formater la taille en unité lisible
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Récupérer les métadonnées d'un fichier image
async function getImageMetadata(filePath: string): Promise<any | null> {
  const jsonPath = filePath.replace(/\.(jpg|jpeg|png)$/i, '.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const content = await fsPromises.readFile(jsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Construire l'arborescence
async function buildTree(
  dirPath: string, 
  basePath: string = dirPath,
  includeMetadata: boolean = false,
  maxDepth: number = -1,
  currentDepth: number = 0
): Promise<TreeNode> {
  const name = path.basename(dirPath);
  const relativePath = path.relative(basePath, dirPath);
  const displayPath = relativePath === '' ? dirPath : path.join(basePath, relativePath);
  
  const node: TreeNode = {
    name: name,
    path: displayPath,
    type: 'directory',
    children: []
  };
  
  // Vérifier la profondeur maximale
  if (maxDepth !== -1 && currentDepth >= maxDepth) {
    return node;
  }
  
  try {
    const items = await fsPromises.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = await fsPromises.stat(itemPath);
      
      if (stat.isDirectory()) {
        const childNode = await buildTree(
          itemPath, 
          basePath, 
          includeMetadata, 
          maxDepth, 
          currentDepth + 1
        );
        node.children!.push(childNode);
      } else {
        const extension = path.extname(item).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension);
        
        const fileNode: TreeNode = {
          name: item,
          path: itemPath,
          type: 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          fileType: extension.slice(1) || 'unknown'
        };
        
        // Inclure les métadonnées si demandé et si c'est une image
        if (includeMetadata && isImage) {
          fileNode.metadata = await getImageMetadata(itemPath);
        }
        
        node.children!.push(fileNode);
      }
    }
    
    // Trier: dossiers d'abord, puis fichiers par nom
    node.children!.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
  } catch (error) {
    console.error(`Erreur lecture ${dirPath}:`, error);
  }
  
  return node;
}

// Calculer les statistiques de l'arborescence
function calculateStats(node: TreeNode): TreeStats {
  const stats: TreeStats = {
    totalFiles: 0,
    totalDirectories: 0,
    totalSize: 0,
    byExtension: {}
  };
  
  function traverse(n: TreeNode) {
    if (n.type === 'directory') {
      stats.totalDirectories++;
      if (n.children) {
        n.children.forEach(child => traverse(child));
      }
    } else {
      stats.totalFiles++;
      stats.totalSize += n.size || 0;
      
      const ext = n.fileType || 'unknown';
      stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
    }
  }
  
  traverse(node);
  return stats;
}

// GET - Récupérer l'arborescence
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'references', 'captures', 'all'
    const includeMetadata = searchParams.get('metadata') === 'true';
    const maxDepth = parseInt(searchParams.get('depth') || '-1');
    const format = searchParams.get('format') || 'json'; // 'json', 'tree', 'simple'
    
    await ensureDirectories();
    
    let tree: TreeNode;
    let stats: TreeStats;
    let title: string;
    
    switch (type) {
      case 'references':
        tree = await buildTree(REFERENCES_BASE_PATH, REFERENCES_BASE_PATH, includeMetadata, maxDepth);
        title = 'Références industrielles';
        break;
      case 'captures':
        tree = await buildTree(CAPTURES_BASE_PATH, CAPTURES_BASE_PATH, includeMetadata, maxDepth);
        title = 'Captures d\'écran';
        break;
      case 'all':
      default:
        // Créer un nœud racine contenant les deux dossiers
        const referencesTree = await buildTree(REFERENCES_BASE_PATH, DATA_BASE_PATH, includeMetadata, maxDepth);
        const capturesTree = await buildTree(CAPTURES_BASE_PATH, DATA_BASE_PATH, includeMetadata, maxDepth);
        
        tree = {
          name: 'data',
          path: DATA_BASE_PATH,
          type: 'directory',
          children: [referencesTree, capturesTree]
        };
        title = 'Structure complète des données';
        break;
    }
    
    stats = calculateStats(tree);
    
    // Format de sortie
    if (format === 'tree') {
      // Format texte arborescent
      const treeString = generateTreeString(tree);
      return new NextResponse(treeString, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    if (format === 'simple') {
      // Format simplifié (liste de chemins)
      const paths = getAllPaths(tree);
      return NextResponse.json({
        success: true,
        paths: paths,
        count: paths.length
      });
    }
    
    // Format JSON par défaut
    return NextResponse.json({
      success: true,
      title: title,
      tree: tree,
      stats: {
        ...stats,
        totalSizeFormatted: formatSize(stats.totalSize)
      },
      config: {
        basePath: DATA_BASE_PATH,
        referencesPath: REFERENCES_BASE_PATH,
        capturesPath: CAPTURES_BASE_PATH,
        referenceTypes: REFERENCE_TYPES
      }
    });
    
  } catch (error) {
    console.error('Erreur GET /api/industrial-vision/tree:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST - Créer un nouveau dossier ou fichier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, path: targetPath, name } = body;
    
    if (!action || !targetPath) {
      return NextResponse.json(
        { success: false, error: 'Action et chemin requis' },
        { status: 400 }
      );
    }
    
    // Vérifier que le chemin est dans data/
    if (!targetPath.startsWith(DATA_BASE_PATH)) {
      return NextResponse.json(
        { success: false, error: 'Chemin non autorisé' },
        { status: 403 }
      );
    }
    
    switch (action) {
      case 'mkdir': {
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'Nom du dossier requis' },
            { status: 400 }
          );
        }
        const newDirPath = path.join(targetPath, name);
        if (fs.existsSync(newDirPath)) {
          return NextResponse.json(
            { success: false, error: 'Le dossier existe déjà' },
            { status: 409 }
          );
        }
        await fsPromises.mkdir(newDirPath, { recursive: true });
        return NextResponse.json({
          success: true,
          message: `Dossier créé: ${newDirPath}`,
          path: newDirPath
        });
      }
      
      case 'rename': {
        const { newName } = body;
        if (!newName) {
          return NextResponse.json(
            { success: false, error: 'Nouveau nom requis' },
            { status: 400 }
          );
        }
        const parentDir = path.dirname(targetPath);
        const newPath = path.join(parentDir, newName);
        await fsPromises.rename(targetPath, newPath);
        return NextResponse.json({
          success: true,
          message: `Renommé en: ${newPath}`,
          newPath: newPath
        });
      }
      
      case 'delete': {
        const stat = await fsPromises.stat(targetPath);
        if (stat.isDirectory()) {
          await fsPromises.rm(targetPath, { recursive: true, force: true });
        } else {
          await fsPromises.unlink(targetPath);
          // Supprimer aussi le fichier JSON associé si c'est une image
          const jsonPath = targetPath.replace(/\.(jpg|jpeg|png)$/i, '.json');
          if (fs.existsSync(jsonPath)) {
            await fsPromises.unlink(jsonPath);
          }
        }
        return NextResponse.json({
          success: true,
          message: `Supprimé: ${targetPath}`
        });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `Action inconnue: ${action}` },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Erreur POST /api/industrial-vision/tree:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Fonction utilitaire: générer une chaîne arborescente textuelle
function generateTreeString(node: TreeNode, prefix: string = '', isLast: boolean = true): string {
  let result = '';
  
  // Choix des caractères d'arborescence
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = isLast ? '    ' : '│   ';
  
  // Ajouter le nœud courant
  const icon = node.type === 'directory' ? '📁' : '📄';
  const sizeInfo = node.size ? ` (${formatSize(node.size)})` : '';
  result += prefix + connector + icon + ' ' + node.name + sizeInfo + '\n';
  
  // Traiter les enfants
  if (node.children && node.children.length > 0) {
    const lastIndex = node.children.length - 1;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isChildLast = i === lastIndex;
      result += generateTreeString(child, prefix + childPrefix, isChildLast);
    }
  }
  
  return result;
}

// Fonction utilitaire: récupérer tous les chemins absolus
function getAllPaths(node: TreeNode, currentPath: string = ''): string[] {
  const paths: string[] = [];
  const fullPath = currentPath ? path.join(currentPath, node.name) : node.name;
  
  if (node.type === 'file') {
    paths.push(node.path);
  }
  
  if (node.children) {
    for (const child of node.children) {
      paths.push(...getAllPaths(child, fullPath));
    }
  }
  
  return paths;
}

