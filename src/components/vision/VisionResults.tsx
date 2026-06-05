'use client';

import { VisionSearchResult } from '@/types/vision';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  Tag, 
  Calendar, 
  Loader2,
  Image,
  Search,
  Sparkles,
  TrendingUp,
  Info,
  Target,
  Activity,
  Layers,
  MapPin
} from 'lucide-react';
import { ConfidenceMetadata } from '@/ai/innovations/types';
import PartLocationResult from './PartLocationResult';
import { ImageMetadata, PartLocationResult as PartLocationResultType } from './shared/types/type';
import FormattedDescription from './shared/components/FormattedDescription';
import { cn } from '@/lib/utils';

// Types étendus pour la recherche hybride
interface EnhancedVisionSearchResult extends VisionSearchResult {
  searchMetadata?: {
    mode: 'vision' | 'text' | 'hybrid' | 'part';
    durationMs: number;
    filtersApplied?: string[];
    totalResults: number;
  };
  matchedTextFields?: string[];
  suggestedTags?: string[];
  confidence?: ConfidenceMetadata;
  partLocation?: PartLocationResultType;
  advancedDetails?: any;
  match?: {
    id: string;
    similarity: number;
    metadata: any;
    thumbnail?: string;
    advancedDetails?: any;
  };
}

interface VisionResultsProps {
  result: VisionSearchResult | EnhancedVisionSearchResult;
  userImageSrc: string;
  onConfirm: () => void;
  onRegisterNow: () => void;
  onRegisterLater: () => void;
  onRetry: () => void;
  isProcessing?: boolean;
  searchQuery?: string;
  searchMode?: 'vision' | 'text' | 'hybrid' | 'part';
}

// ========================================================================
// COMPOSANT D'AFFICHAGE DE LA CONFIANCE
// ========================================================================
function ConfidenceIndicator({ confidence }: { confidence?: ConfidenceMetadata }) {
  if (!confidence) return null;
  
  const percent = Math.round(confidence.score * 100);
  const { icon, color, bgColor, borderColor, message, suggestion } = (() => {
    if (percent >= 100) {
      return {
        icon: <Sparkles className="w-5 h-5 text-blue-400" />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        message: `IDENTITÉ NUMÉRIQUE CERTIFIÉE`,
        suggestion: 'Signature structurelle identique à 100%'
      };
    }
    switch (confidence.level) {
      case 'high':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-400" />,
          color: 'text-green-400',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
          message: `FIABILITÉ ÉLEVÉE (${percent}%)`,
          suggestion: 'Résultat validé par analyse vectorielle'
        };
      case 'medium':
        return {
          icon: <Info className="w-5 h-5 text-yellow-400" />,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          message: `VÉRIFICATION REQUISE (${percent}%)`,
          suggestion: 'Similarité structurelle partielle détectée'
        };
      case 'low':
        return {
          icon: <XCircle className="w-5 h-5 text-red-400" />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          message: `CORRESPONDANCE FAIBLE (${percent}%)`,
          suggestion: 'Incohérences visuelles majeures détectées'
        };
    }
  })();

  return (
    <div className={`mt-4 p-4 rounded-xl border ${bgColor} ${borderColor} backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-black/20`}>
      <div className="flex items-center gap-3">
        <div className="p-2 bg-black/20 rounded-lg">{icon}</div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className={`text-sm font-bold tracking-wider ${color}`}>{message}</span>
            <span className="text-xs text-gray-500 font-mono">CONF_LVL_{confidence.level.toUpperCase()}</span>
          </div>
          <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-out ${
                percent >= 85 ? 'bg-green-500' : percent >= 65 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2 italic flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-gray-500" />
        {suggestion}
      </p>
    </div>
  );
}

// ========================================================================
// COMPOSANT D'AFFICHAGE DES MÉTADONNÉES DE RECHERCHE
// ========================================================================
function SearchMetadataBadge({ metadata }: { metadata?: EnhancedVisionSearchResult['searchMetadata'] }) {
  if (!metadata) return null;
  
  const modeConfig = {
    vision: { label: 'ANALYSE VECTORIELLE', icon: Image, color: 'border-blue-500/40 text-blue-400 bg-blue-500/5' },
    text: { label: 'INDEXATION LEXICALE', icon: Search, color: 'border-purple-500/40 text-purple-400 bg-purple-500/5' },
    hybrid: { label: 'SYSTÈME HYBRIDE', icon: Sparkles, color: 'border-green-500/40 text-green-400 bg-green-500/5' },
    part: { label: 'SPATIAL MATCHING', icon: Target, color: 'border-orange-500/40 text-orange-400 bg-orange-500/5' }
  };
  
  const config = modeConfig[metadata.mode] || modeConfig.vision;
  const Icon = config.icon;
  
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
      <Badge variant="outline" className={`gap-1.5 px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono uppercase tracking-tighter">
        <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {metadata.totalResults} HITS</span>
        <span className="flex items-center gap-1"><Loader2 className="w-3 h-3" /> {metadata.durationMs}ms</span>
        {metadata.filtersApplied && metadata.filtersApplied.length > 0 && (
          <span className="flex items-center gap-1 text-cyan-400"><Info className="w-3 h-3" /> FILTERS: {metadata.filtersApplied.length}</span>
        )}
      </div>
    </div>
  );
}

// ========================================================================
// COMPOSANT D'AFFICHAGE DU DÉTAIL DE COMPARAISON PROFONDE
// ========================================================================
function DeepComparisonDetails({ details }: { details?: any }) {
  if (!details) return null;
  const { breakdown, metadata } = details;
  
  return (
    <div className="mt-4 p-4 bg-black/20 border border-white/5 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-cyan-400" />
          Moteur de Comparaison Unifié
        </h4>
        <Badge className={`text-[9px] uppercase ${
          metadata.matchLevel === 'exact' ? 'bg-blue-500/20 text-blue-400' :
          metadata.matchLevel === 'high' ? 'bg-green-500/20 text-green-400' :
          'bg-yellow-500/20 text-yellow-400'
        }`}>
          Niveau: {metadata.matchLevel}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Sémantique', value: breakdown.semantic, desc: 'Embedding Distance' },
          { label: 'Structurel', value: breakdown.structural, desc: 'Patch Matching' },
          { label: 'Textuel', value: breakdown.textual, desc: 'OCR Levenshtein' },
          { label: 'Géométrique', value: breakdown.geometric, desc: 'Stitch Alignment' },
          { label: 'Confiance', value: breakdown.confidence, desc: 'Calibrated Score' },
        ].map((item, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex justify-between items-end">
              <span className="text-[9px] text-gray-500 font-bold uppercase">{item.label}</span>
              <span className={`text-xs font-mono font-bold ${
                item.value >= 0.7 ? 'text-green-400' : 
                item.value >= 0.4 ? 'text-yellow-400' : 'text-gray-600'
              }`}>
                {Math.round(item.value * 100)}%
              </span>
            </div>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${
                  item.value >= 0.7 ? 'bg-green-500' : 
                  item.value >= 0.4 ? 'bg-yellow-500' : 'bg-gray-600'
                }`}
                style={{ width: `${item.value * 100}%` }}
              />
            </div>
            <span className="text-[8px] text-gray-600 truncate">{item.desc}</span>
          </div>
        ))}
      </div>

      {metadata.details && metadata.details.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {metadata.details.map((detail, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-cyan-400/80 bg-cyan-400/5 px-2 py-0.5 rounded border border-cyan-400/10">
              <CheckCircle className="w-2.5 h-2.5" />
              {detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========================================================================
// COMPOSANT PRINCIPAL
// ========================================================================
export default function VisionResults({ 
  result,
  userImageSrc,
  onConfirm,
  onRegisterNow,
  onRegisterLater,
  onRetry,
  isProcessing = false,
  searchQuery,
  searchMode
}: VisionResultsProps) {
  
  const enhancedResult = result as EnhancedVisionSearchResult;
  const hasConfidence = !!enhancedResult.confidence;
  const searchMetadata = enhancedResult.searchMetadata;
  const actualMode = searchMode || searchMetadata?.mode || (result.found ? 'vision' : 'vision');
  
  // ========================================================================
  // CAS SPÉCIAL : PART MATCHING (Localisation dans pupitre)
  // ========================================================================
  if (actualMode === 'part' && enhancedResult.partLocation) {
    return (
      <PartLocationResult
        result={enhancedResult.partLocation}
        queryImageSrc={userImageSrc}
        onRetry={onRetry}
        onRegisterGlobal={onRegisterNow}
        isProcessing={isProcessing}
      />
    );
  }
  
  // ========================================================================
  // CAS 1 : IMAGE TROUVÉE (AVEC DONNÉES) - Demander confirmation
  // ========================================================================
  // 🔥 CORRECTION : Vérifier que result.data existe bien
  if (result.found && result.data && result.data.image) {
    const matchSimilarity = result.match?.similarity || 0;
    const isExactMatch = matchSimilarity >= 0.99;
    const matchedTextFields = enhancedResult.matchedTextFields || [];
    
    return (
      <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
        {/* En-tête avec mode de recherche et stats */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Résultats du Diagnostic
          </h2>
          <SearchMetadataBadge metadata={searchMetadata} />
        </div>
        
        {/* Statut principal */}
        <div className={`relative overflow-hidden p-8 rounded-2xl border backdrop-blur-xl transition-all duration-500 ${
          isExactMatch 
            ? 'bg-blue-600/10 border-blue-500/40 shadow-lg shadow-blue-500/10'
            : 'bg-green-600/10 border-green-500/40 shadow-lg shadow-green-500/10'
        }`}>
          {/* Décoration en arrière-plan */}
          <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full blur-3xl opacity-20 ${
            isExactMatch ? 'bg-blue-400' : 'bg-green-400'
          }`} />
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className={`p-4 rounded-full mb-4 ${isExactMatch ? 'bg-blue-500/20' : 'bg-green-500/20'}`}>
              {isExactMatch ? (
                <CheckCircle className="w-10 h-10 text-blue-400 animate-pulse" />
              ) : (
                <CheckCircle className="w-10 h-10 text-green-400" />
              )}
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-2">
              {isExactMatch 
                ? 'MATCH PARFAIT DÉTECTÉ'
                : 'CORRESPONDANCE PROBABLE'
              }
            </h3>
            <p className="text-gray-400 max-w-lg">
              {isExactMatch 
                ? 'L\'analyse vectorielle confirme une identité visuelle complète avec l\'unité référencée.'
                : 'Une image présentant des caractéristiques hautement similaires a été identifiée.'
              }
            </p>
            
            {searchQuery && (
              <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm text-purple-300">
                <Search className="w-4 h-4" />
                <span>Requête: <span className="font-bold italic">"{searchQuery}"</span></span>
              </div>
            )}
          </div>
        </div>
        
        {/* 🔥 NOUVEAU: Détails de comparaison approfondie pour le meilleur match */}
        {enhancedResult.match?.advancedDetails && (
          <DeepComparisonDetails details={enhancedResult.match.advancedDetails} />
        )}

        {/* Description de la référence trouvée */}
        {enhancedResult.match?.metadata?.description && (
          <div className="p-5 bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-2xl shadow-xl shadow-black/20">
             <h4 className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase mb-4 flex items-center gap-2">
               <FileText className="h-4 w-4" />
               Synthèse de Référence : {result.data.filename}
             </h4>
             <FormattedDescription text={enhancedResult.match.metadata.description} />
          </div>
        )}

        {/* Analyse de confiance */}
        {hasConfidence && <ConfidenceIndicator confidence={enhancedResult.confidence} />}

        {/* Comparaison visuelle Premium */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Photo de l'utilisateur */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl z-10" />
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-tighter text-gray-500 uppercase">Input Stream</span>
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 text-[10px]">Utilisateur</Badge>
              </div>
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40">
                {userImageSrc ? (
                  <img 
                    src={userImageSrc}
                    alt="Capture source"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <Image className="w-12 h-12 opacity-50" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Image de la base */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl z-10" />
            <div className={`p-4 bg-white/5 border rounded-2xl overflow-hidden shadow-xl transition-colors duration-300 ${
              isExactMatch ? 'border-blue-500/30' : 'border-green-500/30'
            }`}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-tighter text-gray-500 uppercase">Reference Database</span>
                <Badge variant="secondary" className={`${isExactMatch ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'} text-[10px]`}>
                  {Math.round(matchSimilarity * 100)}% Match
                </Badge>
              </div>
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40">
                <img 
                  src={`data:image/jpeg;base64,${result.data.image}`}
                  alt={result.data.filename}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute bottom-2 right-2 flex gap-1 z-20">
                   {matchedTextFields.slice(0, 2).map((field, i) => (
                     <Badge key={i} className="bg-purple-600/60 backdrop-blur-md border-none text-[8px] uppercase">
                       {field}
                     </Badge>
                   ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contrôles de validation */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`h-14 px-10 text-lg font-bold rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl ${
              isExactMatch 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20' 
                : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-500/20'
            }`}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            CONFIRMER L'UNITÉ
          </Button>
          <Button
            onClick={onRegisterNow}
            variant="outline"
            disabled={isProcessing}
            className="h-14 px-10 text-lg font-bold border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 shadow-xl shadow-red-500/5"
          >
            <XCircle className="w-5 h-5 mr-2" />
            REJET / ERREUR
          </Button>
        </div>

        {/* Carrousel de correspondances secondaires (Expert) */}
        {result.matches && result.matches.length > 1 && (
          <div className="pt-6 border-t border-white/10">
            <h4 className="text-xs font-bold text-gray-500 tracking-[0.2em] mb-4 uppercase flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              Candidats Alternatifs
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {result.matches.slice(1, 7).map((match, idx) => (
                <div 
                  key={idx} 
                  className="p-3 bg-white/5 border border-white/10 rounded-xl transition-all hover:bg-white/10 hover:border-white/20 cursor-help"
                  title={`ID: ${match.id}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono text-gray-500">#{idx+1}</span>
                    <span className="text-[10px] font-bold text-cyan-400">{Math.round(match.similarity * 100)}%</span>
                  </div>
                  <div className="w-full bg-black/40 h-1 rounded-full">
                    <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${match.similarity * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" />
          </div>
        )}
      </div>
    );
  }
  
  // ========================================================================
  // CAS 1bis : IMAGE TROUVÉE MAIS SANS DONNÉES (problème de chargement)
  // ========================================================================
  if (result.found && !result.data) {
    return (
      <div className="space-y-6">
        <div className="text-center p-6 bg-yellow-600/10 border border-yellow-500/30 rounded-lg">
          <CheckCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-white mb-2">
            ✅ Image similaire trouvée
          </h2>
          <p className="text-gray-400">
            Une image similaire a été trouvée à {Math.round((result.match?.similarity || 0) * 100)}%
          </p>
          <p className="text-sm text-gray-500 mt-2">
            ⚠️ L'image ne peut pas être affichée, mais vous pouvez continuer.
          </p>
        </div>
        
        <div className="flex justify-center gap-3">
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 px-8 py-6 text-lg"
          >
            ✅ OUI, c'est bien ça
          </Button>
          <Button
            onClick={onRegisterNow}
            variant="outline"
            disabled={isProcessing}
            className="px-8 py-6 text-lg"
          >
            📸 Enregistrer quand même
          </Button>
          <Button
            onClick={onRetry}
            variant="ghost"
            disabled={isProcessing}
          >
            🔄 Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // CAS 2 : IMAGE NON TROUVÉE - Proposer l'enregistrement
  // ========================================================================
  const suggestedTags = enhancedResult.suggestedTags || [];
  
  return (
    <div className="space-y-6">
      {/* En-tête avec mode de recherche */}
      {actualMode !== 'vision' && (
        <div className="flex justify-end">
          <SearchMetadataBadge metadata={searchMetadata} />
        </div>
      )}
      
      {/* Message */}
      <div className="text-center p-6 bg-yellow-600/10 border border-yellow-500/30 rounded-lg">
        <XCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-white mb-2">
          Aucune image similaire trouvée
        </h2>
        <p className="text-gray-400">
          {searchQuery 
            ? `Aucun résultat pour "${searchQuery}"`
            : 'Souhaitez-vous enregistrer cette photo dans la base ?'
          }
        </p>
        {searchQuery && (
          <p className="text-sm text-gray-500 mt-2">
            💡 Essayez une autre recherche ou enregistrez cette image
          </p>
        )}
      </div>

      {/* Aperçu de la photo utilisateur */}
      <Card className="bg-white/5 border-gray-700 max-w-md mx-auto">
        <CardContent className="p-4">
          <p className="text-sm text-gray-400 mb-2">📸 Votre photo</p>
          {userImageSrc ? (
            <img 
              src={userImageSrc}
              alt="Votre capture"
              className="w-full rounded-lg"
            />
          ) : (
            <div className="w-full aspect-video bg-black/40 rounded-lg flex items-center justify-center text-gray-500">
              <Image className="w-12 h-12 opacity-50" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions de tags si disponibles */}
      {suggestedTags.length > 0 && (
        <Card className="bg-gray-800/30 border-gray-700">
          <CardContent className="p-4">
            <p className="text-sm text-gray-400 mb-2 flex items-center gap-1">
              <Tag className="h-4 w-4" />
              Tags suggérés
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.map((tag: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="bg-purple-600/20 text-purple-400">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Options d'enregistrement */}
      <div className="space-y-3">
        <Button
          onClick={onRegisterNow}
          disabled={isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-700 py-6 text-lg"
        >
          📸 Enregistrer maintenant
        </Button>
        
        <Button
          onClick={onRegisterLater}
          variant="outline"
          disabled={isProcessing}
          className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 py-6 text-lg"
        >
          ⏳ Enregistrer plus tard
        </Button>
        
        <Button
          onClick={onRetry}
          variant="ghost"
          disabled={isProcessing}
          className="w-full text-gray-400"
        >
          🔄 Prendre une autre photo
        </Button>
      </div>

      {isProcessing && (
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" />
        </div>
      )}
    </div>
  );
}

// ========================================================================
// COMPOSANT D'AFFICHAGE DES MÉTADONNÉES (après confirmation OUI)
// ========================================================================
interface MetadataDisplayProps {
  data: ImageMetadata;
  confidence?: ConfidenceMetadata;
  onClose: () => void;
}

export function MetadataDisplay({ data, confidence, onClose }: MetadataDisplayProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-green-400">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter italic">Informations de l'équipement</h2>
        </div>
        <Button 
          variant="outline" 
          onClick={onClose} 
          className="border-white/10 hover:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest h-10 px-6"
        >
          Fermer l'analyse
        </Button>
      </div>

      {/* Score de confiance */}
      {confidence && <ConfidenceIndicator confidence={confidence} />}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Image de la base - Panneau Gauche */}
        <div className="lg:w-[450px] shrink-0">
          <Card className="bg-black/40 border-white/10 overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <p className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase">Visualisation Référence</p>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black rounded border border-indigo-500/20 uppercase">Source DB</span>
                <FileText className="w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>
            <div className="relative aspect-[4/3] bg-[#0a0a0a] flex items-center justify-center group">
              <img 
                src={`data:image/jpeg;base64,${data.image}`}
                alt={data.filename}
                className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>
          </Card>
        </div>

        {/* Métadonnées - Panneau Droite (Étendu Horizontalement) */}
        <div className="flex-1">
          <Card className="bg-black/40 border-white/10 shadow-2xl h-full">
            <CardContent className="p-0">
              {/* Grille horizontale des attributs */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-white/5 border-b border-white/5">
                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Nom du Fichier</p>
                      <p className="text-sm font-bold text-white truncate max-w-[150px]">{data.filename}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-purple-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Date d'Acquisition</p>
                      <p className="text-sm font-bold text-white">
                        {data.date ? new Date(data.date).toLocaleString('fr-FR') : 'Date inconnue'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-orange-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Localisation</p>
                      <p className="text-sm font-bold text-white">{data.location || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <Tag className="w-4 h-4 text-green-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Tags (BM25)</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {data.tags && data.tags.length > 0 ? (
                          data.tags.map((tag: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-600/10 text-blue-400 text-[9px] font-bold rounded-md border border-blue-500/20">
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-600">Aucun tag</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <Activity className="w-4 h-4 text-orange-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">État Équipement</p>
                      <p className={cn(
                        "text-sm font-bold uppercase",
                        data.equipmentState === 'critical' ? 'text-red-400' : 
                        data.equipmentState === 'degraded' ? 'text-amber-400' : 'text-green-400'
                      )}>
                        {data.equipmentState || 'Normal'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-[#1a1a1a]/50 hover:bg-white/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <Layers className="w-4 h-4 text-cyan-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Zone Industrielle</p>
                      <p className="text-sm font-bold text-white">{data.zone || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Technique - Pleine Largeur */}
              {data.description && (
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <p className="text-[10px] font-black text-gray-500 tracking-[0.4em] uppercase whitespace-nowrap">
                      Rapport d'Analyse RAG
                    </p>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <FormattedDescription text={data.description} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}