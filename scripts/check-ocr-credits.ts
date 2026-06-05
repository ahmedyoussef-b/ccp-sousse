// scripts/check-ocr-credits.ts
/**
 * Script de suivi des crédits OCR.space
 * 500 requêtes gratuites par mois
 */

import fs from 'fs';
import path from 'path';

const CREDITS_FILE = path.join(process.cwd(), '.ocr_credits.json');

export interface CreditUsage {
  totalRequests: number;
  lastReset: string;
  estimatedRemaining: number;
}

/**
 * Récupère le statut actuel des crédits
 */
export async function getCreditStatus(): Promise<CreditUsage> {
  let usage: CreditUsage = { 
    totalRequests: 0, 
    lastReset: new Date().toISOString(), 
    estimatedRemaining: 500 
  };
  
  if (fs.existsSync(CREDITS_FILE)) {
    try {
      usage = JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf-8'));
    } catch {
      // Fichier corrompu, réinitialiser
      usage = { totalRequests: 0, lastReset: new Date().toISOString(), estimatedRemaining: 500 };
    }
  }
  
  const now = new Date();
  const lastReset = new Date(usage.lastReset);
  
  // Reset mensuel approximatif (changement de mois)
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    usage.totalRequests = 0;
    usage.lastReset = now.toISOString();
    usage.estimatedRemaining = 500;
    saveCreditUsage(usage);
  } else {
    usage.estimatedRemaining = 500 - usage.totalRequests;
  }
  
  return usage;
}

/**
 * Incrémente le compteur de crédits utilisés
 */
export async function incrementCreditCounter(): Promise<number> {
  let usage = await getCreditStatus();
  usage.totalRequests++;
  usage.estimatedRemaining = 500 - usage.totalRequests;
  
  saveCreditUsage(usage);
  
  // Avertir si crédit faible
  if (usage.estimatedRemaining <= 50) {
    console.warn(`\n⚠️ ALERTE CRÉDITS OCR.SPACE ⚠️`);
    console.warn(`   Plus que ${usage.estimatedRemaining} requêtes disponibles ce mois`);
    console.warn(`   Plan gratuit: 500 requêtes/mois`);
    console.warn(`   Considérer un plan payant ou optimiser les requêtes.\n`);
  }
  
  return usage.estimatedRemaining;
}

/**
 * Sauvegarde l'utilisation des crédits
 */
function saveCreditUsage(usage: CreditUsage): void {
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(usage, null, 2));
}

/**
 * Réinitialise le compteur (usage manuel)
 */
export async function resetCreditCounter(): Promise<void> {
  const usage: CreditUsage = {
    totalRequests: 0,
    lastReset: new Date().toISOString(),
    estimatedRemaining: 500
  };
  saveCreditUsage(usage);
  console.log('[OCR] Compteur de crédits réinitialisé');
}

// Exécution directe pour afficher le statut
if (require.main === module) {
  getCreditStatus().then(status => {
    console.log('\n📊 STATUT CRÉDITS OCR.SPACE');
    console.log('='.repeat(40));
    console.log(`   Requêtes utilisées ce mois: ${status.totalRequests}/500`);
    console.log(`   Restant: ${status.estimatedRemaining}`);
    console.log(`   Dernier reset: ${new Date(status.lastReset).toLocaleDateString()}`);
    console.log(`   Utilisation: ${((status.totalRequests / 5).toFixed(1))}%`);
    
    if (status.estimatedRemaining < 50) {
      console.log('\n⚠️ Crédit faible! Optimisez vos requêtes ou passez à un plan payant.');
    }
  }).catch(console.error);
}