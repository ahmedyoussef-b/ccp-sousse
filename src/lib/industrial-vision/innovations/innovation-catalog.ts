// src/lib/industrial-vision/innovations/innovation-catalog.ts

import { Innovation } from "../types/industrial.types";

export const INNOVATIONS_CATALOG: Innovation[] = [
  // Niveau 1 - Fonctionnel
  {
    id: 1,
    name: 'Indexation texte → localisation',
    level: 1,
    description: 'Trouve la position spatiale d\'un organe à partir de son nom',
    keywords: ['où', 'position', 'localisation', 'emplacement', 'trouver', 'situer', 'coordonnées', 'x', 'y', 'cadre'],
    categories: ['localisation', 'recherche'],
    requiresData: ['organes'],
    confidence: 0.98
  },
  {
    id: 2,
    name: 'Détection de familles d\'organes',
    level: 1,
    description: 'Regroupe les organes par proximité spatiale ou fonctionnelle',
    keywords: ['groupe', 'ensemble', 'famille', 'proche', 'voisin', 'regroupement', 'cluster', 'lié', 'associé', 'proximité'],
    categories: ['regroupement', 'analyse_spatiale'],
    requiresData: ['organes'],
    confidence: 0.95
  },
  {
    id: 3,
    name: 'Signature spatiale',
    level: 1,
    description: 'Crée une empreinte unique de la disposition des organes',
    keywords: ['similarité', 'comparaison', 'disposition', 'agencement', 'structure', 'identique', 'différent', 'similaire', 'pattern'],
    categories: ['comparaison', 'empreinte'],
    requiresData: ['organes', 'features'],
    confidence: 1.0
  },
  {
    id: 4,
    name: 'Masques Voronoï',
    level: 1,
    description: 'Segmente l\'image en régions fonctionnelles',
    keywords: ['zone', 'région', 'segment', 'découpage', 'territoire', 'aire', 'surface', 'contour', 'délimiter'],
    categories: ['segmentation', 'zonage'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 5,
    name: 'Recherche cross-modale',
    level: 1,
    description: 'Recherche en langage naturel dans les organes',
    keywords: ['recherche', 'trouver', 'chercher', 'query', 'terme', 'mot', 'contenant', 'incluant', 'avec le mot'],
    categories: ['recherche', 'nlp'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 6,
    name: 'Détection d\'anomalies',
    level: 1,
    description: 'Compare l\'image avec une référence pour trouver des écarts',
    keywords: ['anomalie', 'écart', 'différence', 'anormal', 'inhabituel', 'déviation', 'exception', 'problème', 'erreur', 'manquant', 'supplémentaire'],
    categories: ['détection', 'contrôle_qualité'],
    requiresData: ['organes', 'features'],
    confidence: 0
  },
  {
    id: 7,
    name: 'Vision Panoramique',
    level: 1,
    description: 'Assemble plusieurs images pour créer une vue panoramique complète',
    keywords: ['panorama', 'assemblage', 'stitching', 'panoramique', 'vue large', 'fusion', 'images', 'combiner'],
    categories: ['vision', 'reconstruction'],
    requiresData: ['features'],
    confidence: 0.95
  },
  {
    id: 8,
    name: 'Détection d\'organes manquants',
    level: 1,
    description: 'Identifie les organes absents par rapport à une référence',
    keywords: ['manquant', 'absent', 'il manque', 'pas présent', 'disparu', 'manque', 'incomplet', 'complétude', 'faltante'],
    categories: ['complétude', 'validation'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 9,
    name: 'Carte interactive',
    level: 1,
    description: 'Génère une carte HTML cliquable des organes',
    keywords: ['carte', 'interactive', 'html', 'cliquable', 'navigation', 'zoom', 'survol', 'tooltip', 'visualisation', 'afficher'],
    categories: ['visualisation', 'ui'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 10,
    name: 'Versioning sémantique',
    level: 1,
    description: 'Compare deux versions d\'un schéma',
    keywords: ['version', 'évolution', 'changement', 'modification', 'avant', 'après', 'différence version', 'compare version'],
    categories: ['comparaison', 'versioning'],
    requiresData: ['organes'],
    confidence: 0
  },

  // Niveau 2 - Structural
  {
    id: 11,
    name: 'Redondance fonctionnelle',
    level: 2,
    description: 'Détecte les instances multiples du même organe',
    keywords: ['redondance', 'multiple', 'plusieurs', 'copie', 'double', 'triple', 'répétition'],
    categories: ['analyse_structurale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 12,
    name: 'Hiérarchie fonctionnelle',
    level: 2,
    description: 'Construit un arbre de décomposition des systèmes',
    keywords: ['hiérarchie', 'arbre', 'parent', 'enfant', 'sous-système', 'décomposition', 'structure'],
    categories: ['analyse_structurale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 13,
    name: 'Motifs spatiaux répétés',
    level: 2,
    description: 'Trouve des patterns géométriques réguliers',
    keywords: ['motif', 'pattern', 'alignement', 'grille', 'répétition', 'géométrie'],
    categories: ['analyse_spatiale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 14,
    name: 'Flux par orientation',
    level: 2,
    description: 'Infère la direction des fluides selon l\'orientation des organes',
    keywords: ['flux', 'direction', 'sens', 'orientation', 'fluide', 'circulation'],
    categories: ['analyse_technique'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 15,
    name: 'Points d\'ancrage',
    level: 2,
    description: 'Identifie les références spatiales fixes du schéma',
    keywords: ['ancrage', 'référence', 'fixe', 'statique', 'repère'],
    categories: ['analyse_spatiale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 16,
    name: 'Contraintes topologiques',
    level: 2,
    description: 'Extrait des règles de voisinage implicites',
    keywords: ['contrainte', 'voisinage', 'topologie', 'interdit', 'obligatoire', 'proche'],
    categories: ['analyse_structurale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 17,
    name: 'Reconstruction 2.5D',
    level: 2,
    description: 'Ajoute une profondeur approximative aux composants',
    keywords: ['profondeur', '2.5d', 'perspective', 'superposition', 'z-index'],
    categories: ['visualisation_avancée'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 18,
    name: 'Organes fantômes',
    level: 2,
    description: 'Trouve les zones visuellement denses mais non étiquetées',
    keywords: ['fantôme', 'non-étiqueté', 'inconnu', 'suspect', 'oublié'],
    categories: ['détection'],
    requiresData: ['organes', 'features'],
    confidence: 0
  },
  {
    id: 19,
    name: 'Charge cognitive',
    level: 2,
    description: 'Prédit la complexité de lecture pour un opérateur',
    keywords: ['complexité', 'charge', 'lecture', 'dense', 'lisibilité'],
    categories: ['ergonomie'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 20,
    name: 'Quiz automatique',
    level: 2,
    description: 'Génère des questions d\'entraînement sur le schéma',
    keywords: ['quiz', 'test', 'question', 'entraînement', 'formation'],
    categories: ['formation'],
    requiresData: ['organes'],
    confidence: 0
  },

  // Niveau 3 - Cognitif
  {
    id: 21,
    name: 'Stylométrie industrielle',
    level: 3,
    description: 'Identifie l\'auteur ou le standard du schéma par son style',
    keywords: ['style', 'auteur', 'standard', 'dessinateur', 'signature'],
    categories: ['analyse_cognitive'],
    requiresData: ['features'],
    confidence: 0
  },
  {
    id: 22,
    name: 'Ordre de lecture prédit',
    level: 3,
    description: 'Prédit le parcours oculaire d\'un expert',
    keywords: ['lecture', 'parcours', 'regard', 'attention', 'priorité'],
    categories: ['analyse_cognitive'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 23,
    name: 'Détection de contre-sens technique',
    level: 3,
    description: 'Trouve les impossibilités physiques dans le schéma',
    keywords: ['erreur', 'impossible', 'physique', 'contre-sens', 'illogique'],
    categories: ['validation_experte'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 24,
    name: 'Compression sémantique',
    level: 3,
    description: 'Extrait les 5 concepts clés du système',
    keywords: ['résumé', 'essentiel', 'clé', 'principal', 'compression'],
    categories: ['analyse_cognitive'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 25,
    name: 'Échelle métrologique',
    level: 3,
    description: 'Calcule les dimensions réelles à partir des pixels',
    keywords: ['échelle', 'taille', 'réel', 'dimension', 'mesure'],
    categories: ['analyse_technique'],
    requiresData: ['organes', 'features'],
    confidence: 0
  },
  {
    id: 26,
    name: 'Criticité / Vulnérabilité',
    level: 3,
    description: 'Analyse les points de défaillance uniques',
    keywords: ['critique', 'vulnérabilité', 'risque', 'panne', 'impact'],
    categories: ['maintenance_prédictive'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 27,
    name: 'Distance d\'édition structurelle',
    level: 3,
    description: 'Mesure la proximité avec d\'autres systèmes connus',
    keywords: ['distance', 'similarité', 'proche', 'variante', 'comparaison'],
    categories: ['analyse_structurale'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 28,
    name: 'Légende automatique',
    level: 3,
    description: 'Génère une nomenclature ordonnée',
    keywords: ['légende', 'nomenclature', 'liste', 'index', 'numérotation'],
    categories: ['documentation'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 29,
    name: 'Détection de boucles de régulation',
    level: 3,
    description: 'Identifie les cycles de contrôle fermés',
    keywords: ['boucle', 'régulation', 'contrôle', 'cycle', 'feedback'],
    categories: ['analyse_technique'],
    requiresData: ['organes'],
    confidence: 0
  },
  {
    id: 30,
    name: 'Datation par style graphique',
    level: 3,
    description: 'Estime l\'époque de conception du document',
    keywords: ['date', 'époque', 'âge', 'vieux', 'récent', 'historique'],
    categories: ['analyse_cognitive'],
    requiresData: ['features'],
    confidence: 0
  },

  // Niveau 4 - Dynamique
  {
    id: 31,
    name: 'Détection de changement d\'état des voyants',
    level: 4,
    description: 'Surveille les changements de couleur des voyants (vert/jaune/rouge)',
    keywords: ['voyant', 'led', 'changement', 'passe', 'devient', 'vert', 'rouge', 'jaune', 'alarme', 'état', 'couleur', 'clignote', 's\'allume', 's\'éteint'],
    categories: ['détection', 'temps_réel', 'alarme'],
    requiresData: ['voyants', 'temporal'],
    confidence: 0
  },
  {
    id: 32,
    name: 'Lecture de cadrans analogiques',
    level: 4,
    description: 'Lit les valeurs sur des cadrans (pression, température, débit)',
    keywords: ['pression', 'température', 'cadran', 'aiguille', 'valeur', 'mesure', 'bar', 'degre', 'celsius', 'debit', 'lire', 'indique', 'affiche'],
    categories: ['mesure', 'acquisition'],
    requiresData: ['cadrans'],
    confidence: 0
  },
  {
    id: 33,
    name: 'Fusion voyant + valeur',
    level: 4,
    description: 'Détecte les incohérences entre voyants et mesures',
    keywords: ['incohérence', 'contradiction', 'voyant vert mais pression', 'anomalie', 'ne correspond pas', 'illogique', 'inattendu', 'bizarre'],
    categories: ['détection', 'fusion', 'diagnostic'],
    requiresData: ['voyants', 'cadrans'],
    confidence: 0
  },
  {
    id: 34,
    name: 'Analyse de tendance',
    level: 4,
    description: 'Prédit l\'évolution des mesures',
    keywords: ['tendance', 'évolution', 'prédiction', 'future', 'va augmenter', 'va diminuer', 'progression', 'baisse', 'hausse', 'dérive', 'tendance'],
    categories: ['prédiction', 'tendance', 'analyse_temporelle'],
    requiresData: ['cadrans', 'temporal'],
    confidence: 0
  },
  {
    id: 35,
    name: 'Détection de cycles',
    level: 4,
    description: 'Analyse les séquences temporelles anormales',
    keywords: ['cycle', 'répétition', 'séquence', 'alternance', 'pattern', 'régulier', 'périodique', 'boucle'],
    categories: ['analyse_temporelle', 'détection'],
    requiresData: ['voyants', 'temporal'],
    confidence: 0
  },
  {
    id: 36,
    name: 'Corrélation spatio-temporelle',
    level: 4,
    description: 'Trouve des relations causales entre organes',
    keywords: ['corrélation', 'lien', 'relation', 'causalité', 'impact', 'influence', 'quand x alors y', 'provoque', 'déclenche'],
    categories: ['analyse', 'corrélation'],
    requiresData: ['voyants', 'cadrans', 'temporal'],
    confidence: 0
  },
  {
    id: 37,
    name: 'Détection de dérive lente',
    level: 4,
    description: 'Surveille les dégradations progressives',
    keywords: ['dérive', 'lentement', 'progressivement', 'dégradation', 'usure', 'vieillissement', 'augmente doucement', 'diminue doucement'],
    categories: ['maintenance_prédictive', 'détection'],
    requiresData: ['cadrans', 'temporal'],
    confidence: 0
  },
  {
    id: 38,
    name: 'Timeline interactive',
    level: 4,
    description: 'Génère un historique visuel des événements',
    keywords: ['historique', 'timeline', 'chronologie', 'quand', 'moment', 'date', 'séquence temporelle', 'ordre', 'avant après'],
    categories: ['visualisation', 'historique'],
    requiresData: ['voyants', 'cadrans', 'temporal'],
    confidence: 0
  },
  {
    id: 39,
    name: 'Rapport d\'incident automatique',
    level: 4,
    description: 'Documente automatiquement un incident par IA',
    keywords: ['rapport', 'incident', 'compte rendu', 'documenter', 'résumé événement', 'synthèse alerte', 'rapport d\'alerte'],
    categories: ['documentation', 'reporting'],
    requiresData: ['voyants', 'cadrans', 'temporal'],
    confidence: 0
  },
  {
    id: 40,
    name: 'Dashboard temps réel',
    level: 4,
    description: 'Supervision en direct des paramètres',
    keywords: ['supervision', 'dashboard', 'tableau de bord', 'temps réel', 'live', 'monitoring', 'surveillance', 'écran de contrôle'],
    categories: ['visualisation', 'ui', 'temps_réel'],
    requiresData: ['voyants', 'cadrans'],
    confidence: 0
  }
];

// Mots-clés par catégorie pour détection rapide
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  alarme: ['alarme', 'alerte', 'urgent', 'critique', 'danger', 'problème', 'panne', 'défaut'],
  mesure: ['pression', 'température', 'valeur', 'mesure', 'cadran', 'aiguille', 'bar', 'celsius'],
  localisation: ['où', 'position', 'emplacement', 'trouver', 'situer', 'localiser'],
  comparaison: ['comparer', 'différence', 'similaire', 'identique', 'ressemble', 'comme'],
  description: ['décrire', 'description', 'expliquer', 'présenter', 'que montre', 'contenu'],
  tendance: ['tendance', 'évolution', 'augmente', 'diminue', 'hausse', 'baisse', 'dérive'],
  historique: ['historique', 'avant', 'après', 'changement', 'évolution temporelle', 'quand'],
  visualisation: ['afficher', 'montrer', 'voir', 'visualiser', 'carte', 'schéma', 'graphique'],
  diagnostic: ['diagnostic', 'problème', 'anomalie', 'dysfonctionnement', 'état', 'santé']
};