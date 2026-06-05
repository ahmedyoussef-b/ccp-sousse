/**
 * @fileOverview ActionEventBus - Messagerie interne pour le monitoring temps réel.
 * @version 1.0.0
 */

import { EventEmitter } from 'node:events';

export type ActionStatus = 'start' | 'progress' | 'complete' | 'error' | 'blocked' | 'snapshot' | 'prediction';

export interface ActionEvent {
  id: string;
  module: string;
  type: string;
  status: ActionStatus;
  message: string;
  timestamp: number;
  data?: any;
  duration?: number;
}

class ActionEventBus extends EventEmitter {
  private static instance: ActionEventBus;
  private history: ActionEvent[] = [];
  private readonly MAX_HISTORY = 50;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  public static getInstance(): ActionEventBus {
    if (!ActionEventBus.instance) {
      ActionEventBus.instance = new ActionEventBus();
    }
    return ActionEventBus.instance;
  }

  /**
   * Émet un nouvel événement d'action
   */
  public emitAction(event: ActionEvent): void {
    // Ajouter à l'historique pour les nouveaux arrivants (buffer)
    this.history.push(event);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();

    this.emit('action', event);
  }

  /**
   * Récupère les derniers événements
   */
  public getHistory(): ActionEvent[] {
    return [...this.history];
  }
}

export const aiEventBus = ActionEventBus.getInstance();
