// src/schemas/industrial.schema.ts
import { z } from 'zod';

// ============================================
// 1. ENUMS (définitions complètes)
// ============================================
export const EquipmentTypeEnum = z.enum([
  'turbine_gaz', 'turbine_vapeur', 'alternateur', 'hrsg', 'condenseur',
  'pompe_circulation', 'compresseur', 'vanne_regulation', 'transformateur',
  'systeme_refroidissement'
]);

export const InterventionTypeEnum = z.enum([
  'demarrage', 'arret', 'arret_urgence', 'maintenance_preventive',
  'maintenance_curative', 'inspection', 'depannage', 'parametrage',
  'test_fonctionnel', 'consignation'
]);

export const UrgencyLevelEnum = z.enum(['normale', 'haute', 'critique', 'extreme']);
export const OperationalStateEnum = z.enum(['arret', 'demarrage_en_cours', 'fonctionnement_normal', 'fonctionnement_degrade', 'surveillance', 'maintenance', 'consigne_securite']);
export const DataTypeEnum = z.enum(['temps_reel', 'historique', 'tendances', 'alertes_actives', 'rapports_performance', 'logs_evenements', 'courbes_demarrage']);
export const TechnicalFormatEnum = z.enum(['texte_explicatif', 'liste_etapes', 'checklist', 'diagramme_ascii', 'json_technique', 'alerte_critique', 'rapport_incident']);

// RH
export const EquipeEnum = z.enum(['EQUIPE_A', 'EQUIPE_B', 'EQUIPE_C', 'EQUIPE_D']);
export const PosteEnum = z.enum(['chef_service', 'chef_quart', 'chef_bloc_TG1_CR1', 'chef_bloc_TG2_CR2', 'rondier_gaz_aux', 'rondier_vapeur', 'rondier_TG1_CR1', 'rondier_TG2_CR2']);
export const StatutPresenceEnum = z.enum(['present', 'conge', 'maladie', 'formation', 'astreinte', 'absent_non_justifie']);
export const TypeHeureSupEnum = z.enum(['normale', 'nuit', 'dimanche', 'ferie']);

// Alarmes
export const CompartimentAlarmeEnum = z.enum(['salle_commande', 'salle_turbine_gaz', 'salle_turbine_vapeur', 'local_alternateur', 'local_HV', 'local_BV', 'cheminee', 'poste_gaz', 'salle_auxiliaires', 'CR1', 'CR2']);
export const CauseAlarmeEnum = z.enum(['defaut_capteur', 'depassement_seuil', 'defaut_communication', 'panne_mecanique', 'panne_electrique', 'erreur_humaine', 'condition_process', 'defaut_logiciel', 'maintenance_imprevue']);
export const DegreUrgenceAlarmeEnum = z.enum(['informatif', 'alerte', 'urgence', 'critique', 'catastrophique']);
export const StatutInterventionEnum = z.enum(['ouverte', 'en_cours', 'en_attente_pieces', 'terminee', 'classee_sans_suite']);

// Pupitres et terrain
export const PupitreTypeEnum = z.enum(['pupitre_chef_bloc_TG1_CR1', 'pupitre_chef_bloc_TG2_CR2', 'pupitre_commun_TV', 'pupitre_rondier_gaz', 'pupitre_rondier_vapeur', 'pupitre_auxiliaires']);
export const EtatVoyantEnum = z.enum(['eteint', 'vert_fixe', 'vert_clignotant', 'rouge_fixe', 'rouge_clignotant', 'orange_fixe', 'orange_clignotant', 'bleu_fixe', 'blanc_fixe']);
export const TypeBoutonEnum = z.enum(['marche', 'arret', 'arret_urgence', 'validation', 'augmentation', 'diminution', 'selection', 'test', 'reset', 'acquittement', 'consigne']);
export const RoleTerrainEnum = z.enum(['chef_bloc_TG1_CR1', 'chef_bloc_TG2_CR2', 'rondier_gaz_aux', 'rondier_vapeur', 'rondier_TG1_CR1', 'rondier_TG2_CR2', 'agent_maintenance']);

// ============================================
// 2. SCHÉMAS COMPOSANTS (versions minimales mais suffisantes)
// ============================================
export const IndustrialEquipmentSchema = z.object({
  id: z.string().min(1),
  type: EquipmentTypeEnum,
  tag: z.string().regex(/^[A-Z]{2,3}-\d{3,4}$/),
  nom: z.string().min(1),
  localisation: z.string().optional(),
  puissance_nominale_mw: z.number().positive().optional(),
});

export const OperationalContextSchema = z.object({
  etat_usine: z.enum(['en_service', 'arret_programme', 'arret_force', 'demarrage']),
  puissance_actuelle_mw: z.number().min(0).max(2000).optional(),
});

export const SecurityContextSchema = z.object({
  role_operateur: z.enum(['conducteur', 'chef_salle', 'mainteneur', 'ingenieur_procedes', 'responsable_hse', 'externe']),
  niveau_habilitation: z.enum(['lecture', 'execution', 'modification', 'supervision']),
});

export const EmployeSchema = z.object({
  id: z.string().uuid(),
  nom: z.string(),
  prenom: z.string(),
  poste: PosteEnum,
  equipe: EquipeEnum,
  badge: z.string().regex(/^\d{5}$/),
  telephone_pro: z.string().regex(/^0[67]\d{8}$/),
  competences: z.array(z.string()),
  date_embauche: z.string().date(),
  chef_direct: z.string().uuid().optional()
});

export const AbsenceSchema = z.object({
  employe_id: z.string().uuid(),
  type: StatutPresenceEnum,
  debut: z.string().datetime(),
  fin: z.string().datetime(),
  approuve_par: z.string().uuid(),
  motif: z.string().optional()
});

export const HeureSupSchema = z.object({
  employe_id: z.string().uuid(),
  date: z.string().date(),
  duree_heures: z.number().positive(),
  type: TypeHeureSupEnum,
  validee: z.boolean().default(false)
});

export const AlarmeDetailleeSchema = z.object({
  code: z.string().regex(/^AL-[A-Z]{2,3}-\d{6}$/),
  compartiment: CompartimentAlarmeEnum,
  equipement_tag: z.string().regex(/^[A-Z]{2,3}-\d{3,4}$/),
  date_emission: z.string().datetime(),
  degre_urgence: DegreUrgenceAlarmeEnum,
  cause_probable: CauseAlarmeEnum,
  description_courte: z.string().max(200),
  consigne_immediate: z.string(),
});

export const InterventionAlarmeSchema = z.object({
  alarme_code: z.string(),
  date_debut: z.string().datetime(),
  equipe_intervenante: EquipeEnum,
  intervenants: z.array(z.string().uuid()),
  actions_menées: z.array(z.string()),
  cause_identifiee: CauseAlarmeEnum,
  solution_appliquee: z.string(),
  statut: StatutInterventionEnum,
});

export const CapturePupitreSchema = z.object({
  image_base64: z.string().regex(/^data:image\/(jpeg|png);base64,/),
  timestamp: z.string().datetime(),
  utilisateur_id: z.string().uuid(),
  role_terrain: RoleTerrainEnum,
  pupitre_type: PupitreTypeEnum,
  localisation: z.string().optional(),
  commentaire: z.string().max(500).optional(),
});

export const AnalysePupitreSchema = z.object({
  capture_id: z.string().uuid(),
  date_analyse: z.string().datetime(),
  voyants_detectes: z.array(z.object({
    composant_id: z.string(),
    etiquette: z.string(),
    etat_detecte: EtatVoyantEnum,
    confiance: z.number().min(0).max(1),
    action_recommandee: z.string().optional()
  })),
  boutons_identifies: z.array(z.any()),
  etat_global: z.enum(['normal', 'attention', 'danger', 'indetermine']),
  messages_utilisateur: z.array(z.string()),
  situations_detectees: z.array(z.string()),
  references_bdd: z.array(z.string())
});

export const DemandeGuideSchema = z.object({
  analyse_pupitre_id: z.string().uuid(),
  situation_code: z.string().optional(),
  question_agent: z.string().optional(),
  niveau_detail: z.enum(['concis', 'détaillé', 'urgence']).default('concis'),
  inclure_schema: z.boolean().default(false),
  langue: z.enum(['fr', 'en']).default('fr')
});

// ============================================
// 3. SCHÉMA PRINCIPAL (avec TOUTES les propriétés utilisées dans route.ts)
// ============================================
export const ChatRequestSchema = z.object({
  // Champs de base
  message: z.string().optional(),
  userId: z.string().default('anonymous'),
  sessionId: z.string().optional(),
  mode: z.enum(['auto', 'legacy', 'smart', 'procedure']).optional().default('auto'),
  documentContext: z.string().optional(),
  userProfile: z.object({
    id: z.string().optional(),
    expertise: z.enum(['débutant', 'intermédiaire', 'expert']).optional(),
    domain: z.string().optional(),
    preferences: z.record(z.any()).optional()
  }).optional(),
  history: z.array(z.any()).optional().default([]),
  stream: z.boolean().optional().default(false),
  useCache: z.boolean().optional().default(true),
  image: z.string().optional(),

  // Section RH
  gestion_rh: z.object({
    requete_type: z.enum(['planning_equipe', 'demande_conge', 'declarer_maladie', 'heures_sup', 'remplacement', 'effectif_present', 'astreinte']).optional(),
    equipe_concernee: EquipeEnum.optional(),
    employe: EmployeSchema.optional(),
    absence: AbsenceSchema.optional(),
    heure_sup: HeureSupSchema.optional(),
  }).optional(),

  // Section Alarmes
  alarmes: z.object({
    requete_type: z.enum(['consulter_alarme', 'traiter_alarme', 'diagnostiquer_cause', 'historique_alarmes', 'statistiques_alarmes', 'analyse_causes_racines']).optional(),
    alarme: AlarmeDetailleeSchema.optional(),
    intervention: InterventionAlarmeSchema.optional(),
    action_immediate: z.enum(['acquitter', 'escalader', 'declencher_procedure', 'demander_support_chef']).optional()
  }).optional(),

  // Section Assistance terrain (pupitres)
  assistance_terrain: z.object({
    type_requete: z.enum(['capture_pupitre', 'analyser_pupitre', 'demander_guide', 'etat_pupitre', 'valider_action']),
    capture: CapturePupitreSchema.optional(),
    analyse_existante: AnalysePupitreSchema.optional(),
    demande_guide: DemandeGuideSchema.optional(),
    consultation_distance: z.object({
      pupitre_type: PupitreTypeEnum,
      timestamp_souhaite: z.string().datetime().optional(),
      inclure_derniere_capture: z.boolean().default(true)
    }).optional()
  }).optional(),

  // Section IA
  ia: z.object({
    mode: z.enum(['auto', 'precis', 'rapide', 'securitaire']).optional().default('auto'),
    model: z.enum(['gemma2:2b', 'tinyllama:latest', 'gemma:2b']).optional(),
    temperature: z.number().min(0).max(1).optional().default(0.2),
    maxTokens: z.number().min(100).max(4000).optional().default(1500),
    responseFormat: z.enum(['détaillé', 'concis', 'technique', 'pédagogique']).optional().default('technique'),
    strictness: z.number().min(0.5).max(1).optional().default(0.85),
    priorit_securite: z.boolean().optional().default(true)
  }).optional(),

  // Section Procédure
  procedure: z.object({
    mode: z.enum(['proposal', 'guide', 'steps', 'next_step', 'prev_step', 'complete']).optional(),
    id_procedure: z.string().optional(),
    etape_actuelle: z.number().optional(),
    action: z.enum(['next', 'prev', 'reset', 'complete', 'show_steps', 'start_guide']).optional(),
  }).optional(),
});

// ============================================
// 4. TYPES INFÉRÉS (exportés pour route.ts)
// ============================================
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type Employe = z.infer<typeof EmployeSchema>;
export type Absence = z.infer<typeof AbsenceSchema>;
export type HeureSup = z.infer<typeof HeureSupSchema>;
export type Equipe = z.infer<typeof EquipeEnum>;
export type DegreUrgenceAlarme = z.infer<typeof DegreUrgenceAlarmeEnum>;
export type AlarmeDetaillee = z.infer<typeof AlarmeDetailleeSchema>;
export type InterventionAlarme = z.infer<typeof InterventionAlarmeSchema>;
export type RoleTerrain = z.infer<typeof RoleTerrainEnum>;
export type PupitreType = z.infer<typeof PupitreTypeEnum>;
export type AnalysePupitre = z.infer<typeof AnalysePupitreSchema>;
export type CapturePupitre = z.infer<typeof CapturePupitreSchema>;
export type DemandeGuide = z.infer<typeof DemandeGuideSchema>;