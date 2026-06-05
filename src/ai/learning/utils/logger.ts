/**
 * @fileOverview Logger centralisé pour le module Learning
 * @version 1.0.0
 * @description Réutilise le logger RAG pour uniformiser les logs
 */

import { createRAGLogger } from '@/ai/rag/utils/logger';

// Logger principal du module Learning
export const learningLogger = createRAGLogger('[LEARNING]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

// Loggers spécifiques par sous-module
export const analyticsLogger = createRAGLogger('[ANALYTICS]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const collaborativeLogger = createRAGLogger('[COLLAB]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const conceptLogger = createRAGLogger('[CONCEPT]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const crossUserLogger = createRAGLogger('[CROSS-USER]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const curriculumLogger = createRAGLogger('[CURRICULUM]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const episodicLogger = createRAGLogger('[EPISODIC]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const implicitLogger = createRAGLogger('[IMPLICIT-RL]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const distillationLogger = createRAGLogger('[DISTILL]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const metaLogger = createRAGLogger('[META]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const spacedLogger = createRAGLogger('[SPACED]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export const transferLogger = createRAGLogger('[TRANSFER]', {
  maxDataLength: 500,
  enableStructured: process.env.NODE_ENV === 'production'
});

export default {
  learningLogger,
  analyticsLogger,
  collaborativeLogger,
  conceptLogger,
  crossUserLogger,
  curriculumLogger,
  episodicLogger,
  implicitLogger,
  distillationLogger,
  metaLogger,
  spacedLogger,
  transferLogger
};