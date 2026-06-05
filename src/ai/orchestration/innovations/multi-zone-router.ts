/**
 * @fileOverview MultiZoneRouter - Routage intelligent multi-zones
 * @version 1.1.0
 * @description Utilise getRelevantZones() de chromadb-schema.ts existant
 * @innovation 2/7
 */

import type { ClassifiedQuery, QueryCategory } from './hybrid-classifier';
import { getRelevantZones, type ZoneType } from '@/ai/vector/chromadb-schema';

// ============================================================================
// TYPES
// ============================================================================

export interface ZoneScore {
  zone: ZoneType;
  score: number;           // Score de pertinence (0-100)
  reason: string;          // Pourquoi cette zone est pertinente
  matchedKeywords: string[];
}

export interface ZoneRoutingResult {
  zones: ZoneType[];
  scores: ZoneScore[];
  primaryZone: ZoneType;
  secondaryZones: ZoneType[];
  fusionStrategy: 'merge' | 'priority' | 'weighted' | 'cross_reference';
  confidence: number;
}

// ============================================================================
// CONFIGURATION (uniquement pour les stratégies)
// ============================================================================

// Mapping profil utilisateur → zones prioritaires (complément à getRelevantZones)
const PROFILE_ZONES_MAP: Record<string, ZoneType[]> = {
  'chef_bloc_TG1': ['TG1', 'B1_HRSG_TG1', 'B0_AUXILIAIRES', 'SHARED'],
  'chef_bloc_TG2': ['TG2', 'B2_HRSG_TG2', 'B0_AUXILIAIRES', 'SHARED'],
  'operateur_TV': ['B3_TV_PE', 'B0_AUXILIAIRES', 'SHARED'],
  'chef_quart': ['B0_AUXILIAIRES', 'RH', 'SHARED', 'MAINTENANCE', 'TG1', 'TG2', 'B3_TV_PE'],
  'superviseur': ['SHARED', 'MAINTENANCE', 'RH', 'B0_AUXILIAIRES', 'TG1', 'TG2', 'B3_TV_PE'],
  'maintenance': ['MAINTENANCE', 'TG1', 'TG2', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'SHARED'],
  'technicien': ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES'],
  'ingenieur': ['SHARED', 'MAINTENANCE', 'TG1', 'TG2', 'B3_TV_PE', 'B0_AUXILIAIRES']
};

// Mapping catégorie de question → stratégie de fusion
const CATEGORY_FUSION_STRATEGY: Record<QueryCategory, 'merge' | 'priority' | 'weighted' | 'cross_reference'> = {
  'PROFILE_RH': 'priority',
  'PROCEDURE': 'weighted',
  'IMAGE_DIRECT': 'priority',
  'IMAGE_DESCRIBE': 'priority',
  'IMAGE_INFO': 'cross_reference',
  'GENERAL': 'merge'
};

// Catégories qui boostent VISION
const VISION_BOOST_CATEGORIES: QueryCategory[] = ['IMAGE_DIRECT', 'IMAGE_DESCRIBE', 'IMAGE_INFO'];

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[MULTI-ZONE-ROUTER]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}


// ============================================================================
// SERVICE
// ============================================================================

export class MultiZoneRouter {
  private stats = {
    totalRoutes: 0,
    avgZonesPerRoute: 0,
    primaryZoneConfidence: 0
  };

  /**
   * Détecte les zones pertinentes pour une requête
   * Utilise getRelevantZones() de chromadb-schema.ts
   */
  async detectRelevantZones(
    query: string,
    classified: ClassifiedQuery,
    userProfile?: string
  ): Promise<ZoneRoutingResult> {
    this.stats.totalRoutes++;
    
    logInfo(`🔍 Détection des zones pour: "${query.substring(0, 60)}..."`);
    
    // 🔥 1. UTILISER LA FONCTION EXISTANTE DE chromadb-schema.ts
    let zones = getRelevantZones(query) as ZoneType[];
    
    logInfo(`📊 getRelevantZones() retourné: ${zones.join(', ')}`);
    
    // 2. Appliquer les priorités profil utilisateur (complément)
    let profileZones: ZoneType[] = [];
    if (userProfile && PROFILE_ZONES_MAP[userProfile]) {
      profileZones = PROFILE_ZONES_MAP[userProfile];
      logInfo(`👤 Profil ${userProfile} → zones prioritaires: ${profileZones.join(', ')}`);
      
      // Fusionner avec les zones détectées
      const mergedZones = new Set<ZoneType>([...zones, ...profileZones]);
      zones = Array.from(mergedZones);
    }
    
    // 3. Vérifier cohérence RH
    const isEmployeeQuery = /ahmed|abbès|abbes|rh|employé|salarié|collaborateur|qui est|profil|profile|cv/i.test(query);
    if (zones.includes('RH') && classified.category !== 'PROFILE_RH' && !isEmployeeQuery) {
      zones = zones.filter(z => z !== 'RH');
      logInfo(`⚠️ Zone RH exclue (catégorie: ${classified.category})`);
    } else if (isEmployeeQuery) {
      if (!zones.includes('RH')) {
        zones = ['RH', ...zones];
      } else {
        zones = ['RH', ...zones.filter(z => z !== 'RH')];
      }
      logInfo(`👤 Zone RH priorisée en tête (requête employé détectée)`);
    }
    
    // 4. Priorité VISION pour les catégories image
    if (VISION_BOOST_CATEGORIES.includes(classified.category)) {
      if (!zones.includes('VISION')) {
        zones = ['VISION', ...zones];
        logInfo(`🖼️ Zone VISION ajoutée en priorité`);
      } else {
        zones = ['VISION', ...zones.filter(z => z !== 'VISION')];
        logInfo(`🖼️ Zone VISION déplacée en tête`);
      }
    }
    
    // 5. Garantir SHARED
    if (!zones.includes('SHARED')) {
      zones.push('SHARED');
      logInfo(`📁 Zone SHARED ajoutée`);
    }
    
    // 6. Déterminer zone primaire et secondaires
    const primaryZone = zones[0];
    const secondaryZones = zones.slice(1, 4);
    
    // 7. Générer les scores pour les logs (basés sur l'ordre)
    const scores: ZoneScore[] = zones.map((zone, idx) => ({
      zone,
      score: Math.max(50, 100 - (idx * 15)),
      reason: idx === 0 ? 'Zone primaire' : 'Zone secondaire',
      matchedKeywords: []
    }));
    
    // 8. Déterminer la stratégie de fusion
    const fusionStrategy = CATEGORY_FUSION_STRATEGY[classified.category] || 'merge';
    
    // 9. Calculer la confiance
    let confidence = classified.confidence;
    if (primaryZone !== 'SHARED' && classified.confidence > 0.6) {
      confidence = Math.min(0.95, confidence + 0.1);
    }
    if (classified.category === 'IMAGE_DIRECT' && primaryZone === 'VISION') {
      confidence = Math.min(0.95, confidence + 0.15);
    }
    
    // Mettre à jour les stats
    this.stats.avgZonesPerRoute = (this.stats.avgZonesPerRoute * (this.stats.totalRoutes - 1) + zones.length) / this.stats.totalRoutes;
    this.stats.primaryZoneConfidence = (this.stats.primaryZoneConfidence * (this.stats.totalRoutes - 1) + confidence) / this.stats.totalRoutes;
    
    logSuccess(`Zones finales: ${zones.join(', ')} (confiance: ${(confidence * 100).toFixed(0)}%)`);
    
    return {
      zones,
      scores,
      primaryZone,
      secondaryZones,
      fusionStrategy,
      confidence
    };
  }

  /**
   * Vérifie si une zone est accessible par l'utilisateur
   */
  hasZoneAccess(userProfile: string, zone: ZoneType): boolean {
    const profileZones = PROFILE_ZONES_MAP[userProfile];
    if (!profileZones) return true;
    return profileZones.includes(zone) || zone === 'SHARED';
  }

  /**
   * Filtre les zones selon le profil utilisateur
   */
  filterByProfile(zones: ZoneType[], userProfile: string): ZoneType[] {
    const profileZones = PROFILE_ZONES_MAP[userProfile];
    if (!profileZones) return zones;
    return zones.filter(zone => profileZones.includes(zone) || zone === 'SHARED');
  }

  /**
   * Récupère toutes les zones depuis la source unique
   */
  getAllZones(): ZoneType[] {
    const { getAllZones } = require('@/ai/vector/chromadb-schema');
    return getAllZones() as ZoneType[];
  }

  /**
   * Récupère les statistiques
   */
  getStats(): {
    totalRoutes: number;
    avgZonesPerRoute: number;
    primaryZoneConfidence: number;
  } {
    return { ...this.stats };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = {
      totalRoutes: 0,
      avgZonesPerRoute: 0,
      primaryZoneConfidence: 0
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const multiZoneRouter = new MultiZoneRouter();
export default multiZoneRouter;