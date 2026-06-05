// src/components/admin/components/ImageGrid.tsx
'use client';

import { useState, useEffect, memo, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  ImageOff, 
  Eye, 
  Edit2, 
  Trash2, 
  Check, 
  Search, 
  AlertCircle,
  FileImage,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisionFileNode, ImageMetadata } from '@/components/vision/shared/hooks/useFileSystemTree';

interface ImageCardProps {
  image: ImageMetadata;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onView: (image: ImageMetadata) => void;
  onEdit: (image: ImageMetadata) => void;
  onDelete: (image: ImageMetadata) => void;
  onSearchSimilar?: (image: ImageMetadata) => void;
}

const ImageCard = memo(({ 
  image, 
  isSelected, 
  onSelect, 
  onView, 
  onEdit, 
  onDelete,
  onSearchSimilar
}: ImageCardProps) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !imgSrc && !error) {
        setImgSrc(`/api/vision/images/${image.id}?type=thumbnail`);
      }
    }, { threshold: 0.1 });

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [image.id, imgSrc, error]);

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "group relative overflow-hidden bg-[#121212]/40 backdrop-blur-xl border border-white/5 hover:border-purple-500/50 transition-all duration-500 rounded-[2rem]",
        isSelected && "border-purple-500 ring-2 ring-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.2)]"
      )}
    >
      {/* Image Preview */}
      <div 
        className="aspect-[16/10] relative cursor-pointer overflow-hidden bg-black/40"
        onClick={() => onView(image)}
      >
        {imgSrc ? (
          <img 
            src={imgSrc} 
            alt={image.filename}
            className={cn(
              "w-full h-full object-cover transition-transform duration-700 group-hover:scale-110",
              loading && "opacity-0",
              !loading && "opacity-100"
            )}
            onLoad={() => setLoading(false)}
            onError={() => {
              console.error(`Failed to load: ${imgSrc}`);
              setError(true);
              setLoading(false);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500/30" />
          </div>
        )}

        {loading && imgSrc && (
           <div className="absolute inset-0 flex items-center justify-center bg-black/40">
             <Loader2 className="w-6 h-6 animate-spin text-purple-500/30" />
           </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500/50 mb-2" />
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Échec du chargement</p>
          </div>
        )}

        {/* Premium Overlay Actions */}
        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-4">
          <div className="flex gap-2">
            <Button 
              size="icon" 
              variant="secondary" 
              className="h-10 w-10 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 transform -translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-[0ms]"
              onClick={(e) => { e.stopPropagation(); onView(image); }}
            >
              <Eye className="h-5 w-5" />
            </Button>
            <Button 
              size="icon" 
              variant="secondary" 
              className="h-10 w-10 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 transform -translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-[50ms]"
              onClick={(e) => { e.stopPropagation(); onEdit(image); }}
            >
              <Edit2 className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex gap-2">
             {onSearchSimilar && (
              <Button 
                size="sm"
                className="rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black uppercase text-[9px] px-4 h-9 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-[100ms] gap-2"
                onClick={(e) => { e.stopPropagation(); onSearchSimilar(image); }}
              >
                <Search className="h-3 w-3" />
                Similaires
              </Button>
            )}
            <Button 
              size="icon" 
              variant="destructive" 
              className="h-9 w-9 rounded-2xl bg-red-600/40 hover:bg-red-600/60 backdrop-blur-xl border border-red-500/20 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-[150ms]"
              onClick={(e) => { e.stopPropagation(); onDelete(image); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Selection Checkbox */}
        <div 
          className={cn(
            "absolute top-4 left-4 w-6 h-6 rounded-xl border-2 transition-all duration-300 flex items-center justify-center",
            isSelected 
              ? "bg-purple-600 border-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.5)]" 
              : "border-white/20 bg-black/40 opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => { e.stopPropagation(); onSelect(image.id); }}
        >
          {isSelected && <Check className="w-4 h-4 text-white stroke-[3px]" />}
        </div>

        {/* Image ID/Counter if needed */}
        <div className="absolute bottom-4 left-4">
           <Badge className="bg-black/60 backdrop-blur-md border border-white/5 text-[9px] font-black tracking-tighter py-0.5 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
             ID: {image.id.slice(0, 8)}
           </Badge>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[12px] font-black uppercase tracking-tight text-white/90 truncate leading-tight flex-1">
            {image.filename}
          </h4>
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {image.tags?.slice(0, 3).map((tag: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[8px] font-black uppercase tracking-tighter border-purple-500/20 bg-purple-500/5 text-purple-400/80 px-1.5 h-4">
              {tag}
            </Badge>
          ))}
          {(image.tags?.length || 0) > 3 && (
            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter border-white/5 bg-white/5 text-gray-500 px-1.5 h-4">
              +{(image.tags?.length || 0) - 3}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar className="w-3 h-3" />
            <span className="text-[9px] font-bold tracking-widest">{new Date(image.date || image.createdAt || Date.now()).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <FileImage className="w-3 h-3" />
            <span className="text-[9px] font-bold tracking-widest uppercase">
              {image.imageType === 'global' ? 'Pupitre' : 'Simple'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
});

interface ImageGridProps {
  folder: VisionFileNode | null;
  searchQuery: string;
  selectedImageIds: Set<string>;
  onSelectImage: (id: string) => void;
  onViewImage: (image: ImageMetadata) => void;
  onEditImage: (image: ImageMetadata) => void;
  onDeleteImage: (image: ImageMetadata) => void;
  onSearchSimilar?: (image: ImageMetadata) => void;
}

export function ImageGrid({ 
  folder, 
  searchQuery, 
  selectedImageIds, 
  onSelectImage,
  onViewImage,
  onEditImage,
  onDeleteImage,
  onSearchSimilar
}: ImageGridProps) {
  
  const filteredImages = useMemo(() => {
    if (!folder) return [];
    
    const images = folder.images || [];
    
    if (!searchQuery) return images;
    
    const query = searchQuery.toLowerCase();
    return images.filter((img: ImageMetadata) => 
      img.filename.toLowerCase().includes(query) ||
      img.description?.toLowerCase().includes(query) ||
      img.tags?.some((tag: string) => tag.toLowerCase().includes(query)) ||
      img.id.toLowerCase().includes(query)
    );
  }, [folder, searchQuery]);

  if (!folder) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-20 py-20">
        <div className="p-12 bg-white/5 rounded-[4rem] border border-white/5">
           <FileImage className="w-32 h-32 text-gray-400" />
        </div>
        <h3 className="text-2xl font-black uppercase tracking-tighter">Sélectionnez un dossier</h3>
        <p className="text-gray-500 text-sm font-medium">Explorez l'arborescence pour afficher les images</p>
      </div>
    );
  }

  if (filteredImages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-20 py-20">
        <div className="p-12 bg-white/5 rounded-[4rem] border border-white/5">
           <ImageOff className="w-32 h-32 text-gray-400" />
        </div>
        <h3 className="text-2xl font-black uppercase tracking-tighter">Aucune image</h3>
        <p className="text-gray-500 text-sm font-medium">
          {searchQuery ? `Aucun résultat pour "${searchQuery}"` : "Ce dossier est vide"}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-10 animate-in fade-in duration-700">
      {filteredImages.map((image: ImageMetadata) => (
        <ImageCard 
          key={image.id}
          image={image}
          isSelected={selectedImageIds.has(image.id)}
          onSelect={onSelectImage}
          onView={onViewImage}
          onEdit={onEditImage}
          onDelete={onDeleteImage}
          onSearchSimilar={onSearchSimilar}
        />
      ))}
    </div>
  );
}