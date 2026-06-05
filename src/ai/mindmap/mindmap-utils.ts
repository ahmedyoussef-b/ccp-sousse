// src/ai/mindmap/mindmap-utils.ts
/**
 * Utilitaires partagés pour le module Mindmap
 * 
 * Centralise les fonctions communes utilisées par le parser, l'image-reader
 * et le text-ai-parser pour éviter la duplication de code.
 * 
 * @module mindmap-utils
 */

import { MindMapNodeType } from './types';

/**
 * Devine le type d'un nœud de mindmap à partir de son libellé.
 * 
 * Utilise des heuristiques basées sur des mots-clés français et anglais
 * couramment trouvés dans la documentation industrielle.
 * 
 * @param label - Le libellé du nœud à analyser
 * @param fallback - Type par défaut si aucun mot-clé n'est détecté (défaut: 'note')
 * @returns Le type de nœud détecté : 'parameter', 'formula', 'dependency', ou 'note'
 * 
 * @example
 * ```typescript
 * guessNodeType('Température entrée TE101');   // → 'parameter'
 * guessNodeType('Calcul du rendement');         // → 'formula'
 * guessNodeType('Pompe de charge');             // → 'dependency'
 * guessNodeType('Consigne de sécurité');        // → 'note'
 * ```
 */
export function guessNodeType(label: string, fallback: string = 'note'): MindMapNodeType {
  const text = label.toLowerCase();
  
  // Paramètres : mesures, valeurs numériques, grandeurs physiques
  if (
    text.includes('température') || 
    text.includes('temp') || 
    text.includes('pression') || 
    text.includes('débit') || 
    text.includes('vitesse') || 
    text.includes('seuil') ||
    text.includes('mesure') ||
    text.includes('niveau') ||
    text.includes('valeur') ||
    text.includes('param') ||
    text.includes('bar') ||
    text.includes('°c') ||
    text.includes('nm³') ||
    /^[a-z0-9]+sy\d+/i.test(label)
  ) {
    return 'parameter';
  }
  
  // Formules : calculs, équations, ratios
  if (
    text.includes('calcul') || 
    text.includes('formule') || 
    text.includes('équation') || 
    text.includes('ratio') || 
    text.includes('rendement') || 
    text.includes('=') || 
    text.includes('+') || 
    text.includes('*')
  ) {
    return 'formula';
  }
  
  // Dépendances : équipements, systèmes, composants
  if (
    text.includes('dépend') || 
    text.includes('pompe') || 
    text.includes('moteur') || 
    text.includes('vanne') || 
    text.includes('compresseur') ||
    text.includes('réservoir') ||
    text.includes('circuit') ||
    text.includes('système') ||
    text.includes('auxiliaire') ||
    text.includes('liaison')
  ) {
    return 'dependency';
  }
  
  return (fallback as MindMapNodeType) || 'note';
}

/**
 * Retourne le style visuel par défaut pour un type de nœud.
 * 
 * Chaque type a une couleur et une forme distinctes pour une reconnaissance
 * visuelle immédiate dans l'interface du mindmap.
 * 
 * @param type - Le type de nœud ('parameter', 'formula', 'dependency', 'note')
 * @returns Un objet de style avec les propriétés color, backgroundColor, borderColor, shape
 * 
 * @example
 * ```typescript
 * getStyleForType('parameter');  // → { color: '#fff', backgroundColor: '#0284c7', ... }
 * getStyleForType('formula');    // → { color: '#fff', backgroundColor: '#7c3aed', ... }
 * ```
 */
export function getStyleForType(type: MindMapNodeType | string): Record<string, any> {
  switch (type) {
    case 'parameter':
      return {
        color: '#ffffff',
        backgroundColor: '#0284c7',  // Bleu
        borderColor: '#38bdf8',
        shape: 'ellipse'
      };
    case 'formula':
      return {
        color: '#ffffff',
        backgroundColor: '#7c3aed',  // Violet
        borderColor: '#a78bfa',
        shape: 'rhombus'
      };
    case 'dependency':
      return {
        color: '#ffffff',
        backgroundColor: '#ea580c',  // Orange
        borderColor: '#f97316',
        shape: 'rectangle'
      };
    case 'note':
    default:
      return {
        color: '#0f172a',
        backgroundColor: '#f1f5f9',  // Gris clair
        borderColor: '#cbd5e1',
        shape: 'rectangle'
      };
  }
}

/**
 * Génère un ID unique court de 8 caractères.
 * Utilisé pour les identifiants temporaires avant persistance.
 * 
 * @returns Une chaîne de 8 caractères hexadécimaux
 */
export function shortId(): string {
  const { v4: uuidv4 } = require('uuid') as { v4: () => string };
  return uuidv4().substring(0, 8);
}