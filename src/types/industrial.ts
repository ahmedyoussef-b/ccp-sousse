// src/types/industrial.ts
// Réexportation de tous les types industriels depuis le schéma principal
// Ce fichier permet d'importer les types sans dépendre directement de Zod.

import { z } from 'zod';
import {
  // Enums (valeurs Zod)
  EquipmentTypeEnum,
  InterventionTypeEnum,
  UrgencyLevelEnum,
  OperationalStateEnum,
  DataTypeEnum,
  TechnicalFormatEnum,
  EquipeEnum,
  PosteEnum,
  StatutPresenceEnum,
  TypeHeureSupEnum,
  CompartimentAlarmeEnum,
  CauseAlarmeEnum,
  DegreUrgenceAlarmeEnum,
  StatutInterventionEnum,
  PupitreTypeEnum,
  EtatVoyantEnum,
  TypeBoutonEnum,
  RoleTerrainEnum,

  // Schémas
  IndustrialEquipmentSchema,
  OperationalContextSchema,
  SecurityContextSchema,
  EmployeSchema,
  AbsenceSchema,
  HeureSupSchema,
  AlarmeDetailleeSchema,
  InterventionAlarmeSchema,
  CapturePupitreSchema,
  AnalysePupitreSchema,
  DemandeGuideSchema,

  // Requête principale
  ChatRequestSchema,
} from '@/schemas/industrial.schema';

// ============================================
// Types inférés (sans suffixe Enum/Schema)
// ============================================
export type EquipmentType = z.infer<typeof EquipmentTypeEnum>;
export type InterventionType = z.infer<typeof InterventionTypeEnum>;
export type UrgencyLevel = z.infer<typeof UrgencyLevelEnum>;
export type OperationalState = z.infer<typeof OperationalStateEnum>;
export type DataType = z.infer<typeof DataTypeEnum>;
export type TechnicalFormat = z.infer<typeof TechnicalFormatEnum>;
export type Equipe = z.infer<typeof EquipeEnum>;
export type Poste = z.infer<typeof PosteEnum>;
export type StatutPresence = z.infer<typeof StatutPresenceEnum>;
export type TypeHeureSup = z.infer<typeof TypeHeureSupEnum>;
export type CompartimentAlarme = z.infer<typeof CompartimentAlarmeEnum>;
export type CauseAlarme = z.infer<typeof CauseAlarmeEnum>;
export type DegreUrgenceAlarme = z.infer<typeof DegreUrgenceAlarmeEnum>;
export type StatutIntervention = z.infer<typeof StatutInterventionEnum>;
export type PupitreType = z.infer<typeof PupitreTypeEnum>;
export type EtatVoyant = z.infer<typeof EtatVoyantEnum>;
export type TypeBouton = z.infer<typeof TypeBoutonEnum>;
export type RoleTerrain = z.infer<typeof RoleTerrainEnum>;

// Schémas
export type IndustrialEquipment = z.infer<typeof IndustrialEquipmentSchema>;
export type OperationalContext = z.infer<typeof OperationalContextSchema>;
export type SecurityContext = z.infer<typeof SecurityContextSchema>;
export type Employe = z.infer<typeof EmployeSchema>;
export type Absence = z.infer<typeof AbsenceSchema>;
export type HeureSup = z.infer<typeof HeureSupSchema>;
export type AlarmeDetaillee = z.infer<typeof AlarmeDetailleeSchema>;
export type InterventionAlarme = z.infer<typeof InterventionAlarmeSchema>;
export type CapturePupitre = z.infer<typeof CapturePupitreSchema>;
export type AnalysePupitre = z.infer<typeof AnalysePupitreSchema>;
export type DemandeGuide = z.infer<typeof DemandeGuideSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ============================================
// Réexportation des schémas Zod (optionnel)
// ============================================
export {
  EquipmentTypeEnum,
  InterventionTypeEnum,
  UrgencyLevelEnum,
  OperationalStateEnum,
  DataTypeEnum,
  TechnicalFormatEnum,
  EquipeEnum,
  PosteEnum,
  StatutPresenceEnum,
  TypeHeureSupEnum,
  CompartimentAlarmeEnum,
  CauseAlarmeEnum,
  DegreUrgenceAlarmeEnum,
  StatutInterventionEnum,
  PupitreTypeEnum,
  EtatVoyantEnum,
  TypeBoutonEnum,
  RoleTerrainEnum,
  IndustrialEquipmentSchema,
  OperationalContextSchema,
  SecurityContextSchema,
  EmployeSchema,
  AbsenceSchema,
  HeureSupSchema,
  AlarmeDetailleeSchema,
  InterventionAlarmeSchema,
  CapturePupitreSchema,
  AnalysePupitreSchema,
  DemandeGuideSchema,
  ChatRequestSchema,
};