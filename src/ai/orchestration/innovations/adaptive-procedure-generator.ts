/**
 * @fileOverview AdaptiveProcedureGenerator - Génération procédurale adaptative
 * @version 1.0.0
 * @description Génère des procédures personnalisées selon le profil, l'historique et le contexte
 * @innovation 3/7
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ProcedureStep {
  id: string;
  order: number;
  title: string;
  description: string;
  warnings?: string[];
  tips?: string[];
  estimatedDuration?: number; // en secondes
  requiresConfirmation?: boolean;
  subSteps?: ProcedureStep[];
  equipment?: string[];
  safetyChecks?: string[];
  optional?: boolean;
}

export interface AdaptiveProcedure {
  id: string;
  title: string;
  equipment: string;
  action: 'start' | 'stop' | 'maintenance' | 'inspection';
  steps: ProcedureStep[];
  totalSteps: number;
  estimatedTotalDuration: number; // en secondes
  warnings: string[];
  prerequisites: string[];
  safetyInstructions: string[];
  confidence: number;
  generatedFor: {
    profile: string;
    context: 'normal' | 'emergency' | 'training';
    experience: 'beginner' | 'intermediate' | 'expert';
  };
  alternatives?: {
    simplified?: ProcedureStep[];
    detailed?: ProcedureStep[];
  };
  qrCode?: string;
  createdAt: number;
}

export interface ProcedureContext {
  isEmergency: boolean;
  previousAttempts: number;
  lastExecutionDate?: number;
  knownMistakes?: string[];
  availableEquipment?: string[];
  timeConstraint?: number; // en secondes
}

// ============================================================================
// PROCÉDURES DE BASE
// ============================================================================

const BASE_PROCEDURES: Record<string, AdaptiveProcedure> = {
  'TG1_start': {
    id: 'TG1_start',
    title: 'Démarrage de la turbine à gaz TG1',
    equipment: 'TG1',
    action: 'start',
    steps: [
      { id: 'step1', order: 1, title: 'Vérifications pré-démarrage', description: 'Vérifier les niveaux d\'huile, de gaz et les alarmes', warnings: ['Ne pas démarrer si alarme critique'], estimatedDuration: 300 },
      { id: 'step2', order: 2, title: 'Mise sous tension auxiliaires', description: 'Activer les pompes à huile et le système de ventilation', requiresConfirmation: true, estimatedDuration: 60 },
      { id: 'step3', order: 3, title: 'Démarrage du groupe', description: 'Lancer la séquence de démarrage depuis la salle de contrôle', warnings: ['Surveiller les vibrations'], estimatedDuration: 120 },
      { id: 'step4', order: 4, title: 'Montée en charge', description: 'Augmenter progressivement la charge selon la rampe définie', subSteps: [
        { id: 'step4a', order: 1, title: 'Palier 25%', description: 'Attendre stabilisation 2 min' },
        { id: 'step4b', order: 2, title: 'Palier 50%', description: 'Attendre stabilisation 2 min' },
        { id: 'step4c', order: 3, title: 'Palier 75%', description: 'Attendre stabilisation 2 min' },
        { id: 'step4d', order: 4, title: 'Palier 100%', description: 'Charge nominale atteinte' }
      ], estimatedDuration: 600 },
      { id: 'step5', order: 5, title: 'Vérifications post-démarrage', description: 'Vérifier températures, pressions et vibrations', safetyChecks: ['Température d\'échappement < 650°C', 'Pression huile > 2.5 bars'] }
    ],
    totalSteps: 5,
    estimatedTotalDuration: 1080,
    warnings: ['Ne pas dépasser la température max', 'Surveiller les fuites de gaz'],
    prerequisites: ['Autorisation de conduite', 'Consigne de démarrage validée'],
    safetyInstructions: ['Tenir l\'arrêt d\'urgence accessible', 'Évacuer la zone si alarme incendie'],
    confidence: 0.95,
    generatedFor: { profile: 'operateur', context: 'normal', experience: 'intermediate' },
    createdAt: Date.now()
  },
  'TG1_stop': {
    id: 'TG1_stop',
    title: 'Arrêt de la turbine à gaz TG1',
    equipment: 'TG1',
    action: 'stop',
    steps: [
      { id: 'step1', order: 1, title: 'Réduction de charge', description: 'Diminuer progressivement la charge', estimatedDuration: 300 },
      { id: 'step2', order: 2, title: 'Déclenchement séquence arrêt', description: 'Lancer séquence d\'arrêt depuis salle de contrôle', requiresConfirmation: true },
      { id: 'step3', order: 3, title: 'Refroidissement', description: 'Laisser tourner auxiliaires pour refroidissement', estimatedDuration: 900 },
      { id: 'step4', order: 4, title: 'Arrêt auxiliaires', description: 'Désactiver pompes et ventilation', estimatedDuration: 60 },
      { id: 'step5', order: 5, title: 'Vérifications post-arrêt', description: 'Vérifier position des vannes et consigner' }
    ],
    totalSteps: 5,
    estimatedTotalDuration: 1260,
    warnings: ['Ne pas couper brutalement la charge', 'Surveiller refroidissement'],
    prerequisites: ['Autorisation d\'arrêt', 'Consigne d\'arrêt validée'],
    safetyInstructions: ['S\'assurer que personne n\'est dans la zone turbine'],
    confidence: 0.95,
    generatedFor: { profile: 'operateur', context: 'normal', experience: 'intermediate' },
    createdAt: Date.now()
  }
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[ADAPTIVE-PROCEDURE]';

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

export class AdaptiveProcedureGenerator {
  private cache = new Map<string, AdaptiveProcedure>();
  private stats = {
    totalGenerations: 0,
    cacheHits: 0,
    averageSteps: 0,
    averageDuration: 0
  };

  /**
   * Génère une procédure adaptative
   */
  async generateProcedure(
    equipment: string,
    action: 'start' | 'stop' | 'maintenance' | 'inspection',
    userProfile: string,
    context: ProcedureContext
  ): Promise<AdaptiveProcedure> {
    const cacheKey = `${equipment}_${action}_${userProfile}_${context.isEmergency ? 'emergency' : 'normal'}`;
    
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      logInfo(`Cache HIT pour ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }
    
    logInfo(`Génération procédure pour ${equipment} - ${action} (profil: ${userProfile})`);
    
    // 1. Récupérer la procédure de base
    const baseKey = `${equipment}_${action}`;
    let procedure = BASE_PROCEDURES[baseKey];
    
    if (!procedure) {
      procedure = this.createDefaultProcedure(equipment, action);
    }
    
    // 2. Adapter selon le profil utilisateur
    procedure = this.adaptToProfile(procedure, userProfile);
    
    // 3. Adapter selon le contexte (urgence, training)
    procedure = this.adaptToContext(procedure, context);
    
    // 4. Adapter selon l'historique (erreurs connues)
    if (context.knownMistakes && context.knownMistakes.length > 0) {
      procedure = this.adaptToHistory(procedure, context.knownMistakes);
    }
    
    // 5. Adapter selon le niveau d'expérience
    const userHistory = await this.getUserHistory(userProfile);
    procedure = this.adaptToExperience(procedure, userHistory.experience);
    
    // 6. Mettre à jour les métadonnées
    procedure.generatedFor = {
      profile: userProfile,
      context: context.isEmergency ? 'emergency' : 'normal',
      experience: userHistory.experience
    };
    procedure.createdAt = Date.now();
    
    // 7. Générer QR code si nécessaire
    if (userProfile === 'technicien_mobile') {
      procedure.qrCode = await this.generateQRCode(procedure);
    }
    
    // 8. Mettre en cache
    this.cache.set(cacheKey, procedure);
    
    this.stats.totalGenerations++;
    this.stats.averageSteps = (this.stats.averageSteps * (this.stats.totalGenerations - 1) + procedure.steps.length) / this.stats.totalGenerations;
    this.stats.averageDuration = (this.stats.averageDuration * (this.stats.totalGenerations - 1) + procedure.estimatedTotalDuration) / this.stats.totalGenerations;
    
    logSuccess(`Procédure générée: ${procedure.steps.length} étapes, ${Math.floor(procedure.estimatedTotalDuration / 60)} min`);
    
    return procedure;
  }

  private createDefaultProcedure(equipment: string, action: 'start' | 'stop' | 'maintenance' | 'inspection'): AdaptiveProcedure {
    const actionText = action === 'start' ? 'démarrage' : action === 'stop' ? 'arrêt' : action;
    
    return {
      id: `${equipment}_${action}`,
      title: `${actionText.toUpperCase()} de ${equipment}`,
      equipment,
      action,
      steps: [
        { id: 'step1', order: 1, title: 'Préparation', description: `Préparer ${equipment} pour ${actionText}`, estimatedDuration: 60 },
        { id: 'step2', order: 2, title: 'Exécution', description: `Exécuter ${actionText} de ${equipment}`, estimatedDuration: 120 },
        { id: 'step3', order: 3, title: 'Vérification', description: `Vérifier le bon ${actionText}`, estimatedDuration: 60 }
      ],
      totalSteps: 3,
      estimatedTotalDuration: 240,
      warnings: ['Suivre les consignes de sécurité'],
      prerequisites: ['Formation requise'],
      safetyInstructions: ['Porter les EPI appropriés'],
      confidence: 0.7,
      generatedFor: { profile: 'default', context: 'normal', experience: 'intermediate' },
      createdAt: Date.now()
    };
  }

  private adaptToProfile(procedure: AdaptiveProcedure, userProfile: string): AdaptiveProcedure {
    const adapted = { ...procedure, steps: [...procedure.steps] };
    
    switch (userProfile) {
      case 'chef_quart':
      case 'superviseur':
        adapted.steps = this.addDetailLevel(adapted.steps, 'detailed');
        adapted.warnings.push('⚠️ Responsable superviseur - Vérifier chaque étape');
        break;
      case 'operateur':
        adapted.steps = this.addDetailLevel(adapted.steps, 'standard');
        break;
      case 'maintenance':
      case 'technicien':
        adapted.steps = this.addTechnicalFocus(adapted.steps);
        adapted.warnings.push('🔧 Opérations de maintenance - Consigner avant intervention');
        break;
      default:
        adapted.steps = this.addDetailLevel(adapted.steps, 'minimal');
    }
    
    return adapted;
  }

  private adaptToContext(procedure: AdaptiveProcedure, context: ProcedureContext): AdaptiveProcedure {
    const adapted = { ...procedure, steps: [...procedure.steps] };
    
    if (context.isEmergency) {
      adapted.steps = this.simplifyForEmergency(adapted.steps);
      adapted.warnings.unshift('🚨 PROCÉDURE D\'URGENCE - Suivre strictement 🚨');
      adapted.estimatedTotalDuration = Math.floor(adapted.estimatedTotalDuration * 0.5);
      adapted.generatedFor.context = 'emergency';
      logInfo('Version urgence générée');
    }
    
    if (context.previousAttempts > 0) {
      adapted.warnings.push(`⚠️ Tentative précédente échouée - Revoir les étapes critiques`);
      adapted.steps = this.highlightCriticalSteps(adapted.steps);
    }
    
    if (context.timeConstraint) {
      adapted.steps = this.simplifyForTime(adapted.steps, context.timeConstraint);
      adapted.warnings.push(`⏱️ Contrainte de temps: ${Math.floor(context.timeConstraint / 60)} min`);
    }
    
    return adapted;
  }

  private adaptToHistory(procedure: AdaptiveProcedure, knownMistakes: string[]): AdaptiveProcedure {
    const adapted = { ...procedure, steps: [...procedure.steps] };
    
    for (const mistake of knownMistakes) {
      adapted.warnings.push(`⚠️ Attention: ${mistake} (erreur fréquente détectée)`);
      
      adapted.steps = adapted.steps.map(step => {
        if (step.description.toLowerCase().includes(mistake.toLowerCase())) {
          return {
            ...step,
            warnings: [...(step.warnings || []), `🚨 Point d'attention: ${mistake}`]
          };
        }
        return step;
      });
    }
    
    return adapted;
  }

  private adaptToExperience(procedure: AdaptiveProcedure, experience: 'beginner' | 'intermediate' | 'expert'): AdaptiveProcedure {
    const adapted = { ...procedure, steps: [...procedure.steps] };
    
    switch (experience) {
      case 'beginner':
        adapted.steps = this.addSubSteps(adapted.steps);
        adapted.warnings.push('📚 Débutant - Lire attentivement chaque étape');
        break;
      case 'expert':
        adapted.steps = this.condenseSteps(adapted.steps);
        adapted.alternatives = {
          detailed: adapted.steps,
          simplified: this.simplifySteps(adapted.steps)
        };
        break;
    }
    
    return adapted;
  }

  private addDetailLevel(steps: ProcedureStep[], level: 'minimal' | 'standard' | 'detailed'): ProcedureStep[] {
    if (level === 'minimal') {
      return steps.map(step => ({
        ...step,
        description: step.title,
        subSteps: undefined,
        tips: undefined
      }));
    }
    
    if (level === 'detailed') {
      return steps.map(step => ({
        ...step,
        description: `${step.description}\n📋 Points de contrôle à valider avant de continuer`,
        requiresConfirmation: true
      }));
    }
    
    return steps;
  }

  private addTechnicalFocus(steps: ProcedureStep[]): ProcedureStep[] {
    return steps.map(step => ({
      ...step,
      description: `${step.description}\n🔧 Équipement concerné: ${step.equipment?.join(', ') || 'Voir documentation technique'}`,
      safetyChecks: [...(step.safetyChecks || []), 'Consignation électrique', 'Sectionnement énergie']
    }));
  }

  private simplifyForEmergency(steps: ProcedureStep[]): ProcedureStep[] {
    const criticalIds = new Set(['step2', 'step3']);
    const filtered = steps.filter(step => criticalIds.has(step.id));
    return filtered.map((step, idx) => ({
      ...step,
      order: idx + 1,
      description: `🚨 ${step.description} (URGENCE)`,
      estimatedDuration: Math.floor((step.estimatedDuration || 60) * 0.5)
    }));
  }

  private simplifyForTime(steps: ProcedureStep[], timeConstraint: number): ProcedureStep[] {
    let accumulated = 0;
    const filtered = steps.filter(step => {
      const duration = step.estimatedDuration || 60;
      if (accumulated + duration <= timeConstraint) {
        accumulated += duration;
        return true;
      }
      return false;
    });
    
    return filtered;
  }

  private addSubSteps(steps: ProcedureStep[]): ProcedureStep[] {
    return steps.map(step => ({
      ...step,
      subSteps: [
        { id: `${step.id}_1`, order: 1, title: 'Préparer', description: `Préparer pour ${step.title}` },
        { id: `${step.id}_2`, order: 2, title: 'Exécuter', description: `Exécuter ${step.title}` },
        { id: `${step.id}_3`, order: 3, title: 'Vérifier', description: `Vérifier ${step.title}` }
      ],
      estimatedDuration: (step.estimatedDuration || 60) * 1.5
    }));
  }

  private condenseSteps(steps: ProcedureStep[]): ProcedureStep[] {
    const grouped: ProcedureStep[] = [];
    for (let i = 0; i < steps.length; i += 2) {
      if (i + 1 < steps.length) {
        grouped.push({
          id: `group_${i}`,
          order: Math.floor(i / 2) + 1,
          title: `${steps[i].title} / ${steps[i+1].title}`,
          description: `${steps[i].description} puis ${steps[i+1].description}`,
          estimatedDuration: (steps[i].estimatedDuration || 60) + (steps[i+1].estimatedDuration || 60)
        });
      } else {
        grouped.push(steps[i]);
      }
    }
    return grouped;
  }

  private simplifySteps(steps: ProcedureStep[]): ProcedureStep[] {
    return steps.map(step => ({
      ...step,
      description: step.title,
      subSteps: undefined,
      tips: undefined
    }));
  }

  private highlightCriticalSteps(steps: ProcedureStep[]): ProcedureStep[] {
    return steps.map(step => ({
      ...step,
      warnings: [...(step.warnings || []), '⭐ ÉTAPE CRITIQUE - Attention particulière']
    }));
  }

  private async getUserHistory(userProfile: string): Promise<{ experience: 'beginner' | 'intermediate' | 'expert' }> {
    return {
      experience: userProfile === 'chef_quart' ? 'expert' : 'intermediate'
    };
  }

  private async generateQRCode(procedure: AdaptiveProcedure): Promise<string> {
    return `https://agentiq.com/procedures/${procedure.id}`;
  }

  formatProcedure(procedure: AdaptiveProcedure): string {
    const durationMin = Math.floor(procedure.estimatedTotalDuration / 60);
    const durationSec = procedure.estimatedTotalDuration % 60;
    
    let output = `# ${procedure.title}\n\n`;
    output += `**Équipement:** ${procedure.equipment}\n`;
    output += `**Action:** ${procedure.action === 'start' ? 'Démarrage' : procedure.action === 'stop' ? 'Arrêt' : procedure.action}\n`;
    output += `**Durée estimée:** ${durationMin}min ${durationSec > 0 ? `${durationSec}s` : ''}\n`;
    output += `**Confiance:** ${(procedure.confidence * 100).toFixed(0)}%\n\n`;
    
    if (procedure.warnings.length > 0) {
      output += `## ⚠️ AVERTISSEMENTS\n`;
      for (const warning of procedure.warnings) {
        output += `- ${warning}\n`;
      }
      output += `\n`;
    }
    
    if (procedure.prerequisites.length > 0) {
      output += `## 📋 PRÉ-REQUIS\n`;
      for (const prereq of procedure.prerequisites) {
        output += `- ${prereq}\n`;
      }
      output += `\n`;
    }
    
    if (procedure.safetyInstructions.length > 0) {
      output += `## 🛡️ CONSIGNES DE SÉCURITÉ\n`;
      for (const safety of procedure.safetyInstructions) {
        output += `- ${safety}\n`;
      }
      output += `\n`;
    }
    
    output += `## 📝 PROCÉDURE\n\n`;
    
    for (const step of procedure.steps) {
      output += `### ${step.order}. ${step.title}\n`;
      output += `${step.description}\n`;
      
      if (step.estimatedDuration) {
        output += `⏱️ Durée: ${Math.floor(step.estimatedDuration / 60)}min ${step.estimatedDuration % 60}s\n`;
      }
      
      if (step.warnings && step.warnings.length > 0) {
        output += `\n⚠️ **Attention:** ${step.warnings.join(', ')}\n`;
      }
      
      if (step.safetyChecks && step.safetyChecks.length > 0) {
        output += `\n✅ **Vérifications sécurité:** ${step.safetyChecks.join(', ')}\n`;
      }
      
      if (step.subSteps && step.subSteps.length > 0) {
        output += `\n**Détail des opérations:**\n`;
        for (const subStep of step.subSteps) {
          output += `   ${subStep.order}. ${subStep.title}: ${subStep.description}\n`;
        }
      }
      
      if (step.requiresConfirmation) {
        output += `\n☐ **Confirmation:** Étape réalisée et vérifiée\n`;
      }
      
      output += `\n`;
    }
    
    if (procedure.qrCode) {
      output += `---\n\n`;
      output += `## 📱 ACCÈS MOBILE\n`;
      output += `Scannez ce QR code pour accéder à la procédure sur mobile:\n`;
      output += `![QR Code](${procedure.qrCode})\n`;
    }
    
    return output;
  }

  getStats(): {
    totalGenerations: number;
    cacheHits: number;
    cacheHitRate: number;
    averageSteps: number;
    averageDuration: number;
  } {
    return {
      totalGenerations: this.stats.totalGenerations,
      cacheHits: this.stats.cacheHits,
      cacheHitRate: this.stats.totalGenerations > 0 ? this.stats.cacheHits / this.stats.totalGenerations : 0,
      averageSteps: Math.round(this.stats.averageSteps),
      averageDuration: Math.round(this.stats.averageDuration)
    };
  }

  reset(): void {
    this.cache.clear();
    this.stats = {
      totalGenerations: 0,
      cacheHits: 0,
      averageSteps: 0,
      averageDuration: 0
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const adaptiveProcedureGenerator = new AdaptiveProcedureGenerator();
export default adaptiveProcedureGenerator;