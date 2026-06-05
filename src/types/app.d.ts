// Global application-level types to reduce TS friction during incremental fixes

export interface RegionOfInterest { x: number; y: number; w: number; h: number }
export interface AnchorPoint { x: number; y: number }

export interface ImageMetadata {
  id: string;
  filename?: string;
  path?: string;
  date?: string | number;
  tags?: string[];
  location?: string;
  description?: string;
  [key: string]: any;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  badge?: number;
  [key: string]: any;
}

export interface VisionFileNode extends FileNode {
  id?: string;
  images?: ImageMetadata[];
  imageCount?: number;
  localCount?: number;
  parentId?: string | null;
  hasChildren?: boolean;
}

// Make available on global scope for legacy uses
declare global {
  namespace AppTypes {
    type VisionFileNode = VisionFileNode;
    type ImageMetadata = ImageMetadata;
  }
}
