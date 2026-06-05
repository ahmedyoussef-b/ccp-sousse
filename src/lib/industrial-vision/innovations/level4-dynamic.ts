// src/lib/industrial-vision/innovations/level4-dynamic.ts

import { MesureCadran, VoyantState } from "../types/industrial.types";

// Innovation #31: Détection de changement d'état des voyants
export class VoyantStateDetector {
  private historique: Map<string, VoyantState[]> = new Map();

  detectChange(previous: VoyantState | null, current: VoyantState): {
    changed: boolean;
    type: string;
    message: string;
  } {
    if (!previous) return { changed: false, type: 'initial', message: '' };

    if (previous.couleur !== current.couleur) {
      let type = 'CHANGEMENT';
      let message = `${current.organe}: ${previous.couleur} → ${current.couleur}`;

      if (previous.couleur === 'vert' && current.couleur === 'rouge') {
        type = 'ALARME';
        message = `⚠️ ALARME: ${current.organe} est passé au ROUGE!`;
      } else if (previous.couleur === 'rouge' && current.couleur === 'vert') {
        type = 'RETOUR_NORMAL';
        message = `✅ ${current.organe} est revenu au VERT`;
      } else if (current.couleur === 'jaune') {
        type = 'ATTENTION';
        message = `⚠️ ATTENTION: ${current.organe} est en JAUNE`;
      }

      return { changed: true, type, message };
    }

    return { changed: false, type: 'stable', message: '' };
  }

  record(organe: string, couleur: VoyantState['couleur'], timestamp: number) {
    if (!this.historique.has(organe)) {
      this.historique.set(organe, []);
    }
    this.historique.get(organe)!.push({ organe, couleur, timestamp });
  }

  getHistory(organe: string): VoyantState[] {
    return this.historique.get(organe) || [];
  }
}

// Innovation #32: Lecture de cadrans analogiques
export class CadranReader {
  lireValeur(cadran: MesureCadran): { valeur: number; interpretation: string } {
    const { valeur, unite } = cadran;

    let interpretation = '';
    if (unite === 'bar') {
      if (valeur > 12) interpretation = 'Pression trop élevée ⚠️';
      else if (valeur < 3) interpretation = 'Pression trop basse ⚠️';
      else interpretation = 'Pression normale ✅';
    } else if (unite === '°C') {
      if (valeur > 70) interpretation = 'Température critique ⚠️';
      else if (valeur > 55) interpretation = 'Température élevée ⚠️';
      else interpretation = 'Température normale ✅';
    }

    return { valeur, interpretation };
  }

  surveillerSeuil(cadran: MesureCadran, seuilBas: number, seuilHaut: number): {
    alerte: 'NORMAL' | 'BASSE' | 'HAUTE';
    valeur: number;
  } {
    if (cadran.valeur > seuilHaut) return { alerte: 'HAUTE', valeur: cadran.valeur };
    if (cadran.valeur < seuilBas) return { alerte: 'BASSE', valeur: cadran.valeur };
    return { alerte: 'NORMAL', valeur: cadran.valeur };
  }
}

// Innovation #33: Fusion voyant + valeur (incohérence)
export function detectIncoherences(
  voyants: VoyantState[],
  mesures: MesureCadran[]
): string[] {
  const incoherences: string[] = [];

  const voyantMap = new Map(voyants.map(v => [v.organe, v]));

  for (const mesure of mesures) {
    const voyant = voyantMap.get(mesure.organe);
    if (!voyant) continue;

    // Règle: voyant vert mais mesure hors norme
    if (voyant.couleur === 'vert') {
      if (mesure.unite === 'bar' && (mesure.valeur > 12 || mesure.valeur < 3)) {
        incoherences.push(`${mesure.organe}: voyant VERT mais ${mesure.valeur} ${mesure.unite} anormal`);
      }
      if (mesure.unite === '°C' && mesure.valeur > 60) {
        incoherences.push(`${mesure.organe}: voyant VERT mais température ${mesure.valeur}°C trop élevée`);
      }
    }

    // Règle: voyant rouge mais mesure normale
    if (voyant.couleur === 'rouge') {
      if (mesure.unite === 'bar' && (3 <= mesure.valeur && mesure.valeur <= 10)) {
        incoherences.push(`${mesure.organe}: voyant ROUGE mais pression ${mesure.valeur} bar normale`);
      }
    }
  }

  return incoherences;
}

// Innovation #34: Analyse de tendance
export class TrendAnalyzer {
  hasData() {
    throw new Error('Method not implemented.');
  }
  private historique: Map<string, { temps: number; valeur: number }[]> = new Map();

  addMeasurement(organe: string, temps: number, valeur: number) {
    if (!this.historique.has(organe)) {
      this.historique.set(organe, []);
    }
    this.historique.get(organe)!.push({ temps, valeur });

    // Garder seulement les 60 dernières mesures
    const history = this.historique.get(organe)!;
    if (history.length > 60) history.shift();
  }

  predictTrend(organe: string, horizonSecondes: number = 10): {
    tendance: 'hausse' | 'baisse' | 'stable';
    pente: number;
    prediction: number;
    criticite: string;
  } | null {
    const history = this.historique.get(organe);
    if (!history || history.length < 5) return null;

    // Régression linéaire simple
    const n = history.length;
    const temps = history.map(h => h.temps);
    const valeurs = history.map(h => h.valeur);

    const meanT = temps.reduce((a, b) => a + b, 0) / n;
    const meanV = valeurs.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (temps[i] - meanT) * (valeurs[i] - meanV);
      den += (temps[i] - meanT) ** 2;
    }

    const pente = num / den;
    const derniereValeur = valeurs[n - 1];
    const prediction = derniereValeur + pente * horizonSecondes;

    let tendance: 'hausse' | 'baisse' | 'stable' = 'stable';
    if (pente > 0.01) tendance = 'hausse';
    else if (pente < -0.01) tendance = 'baisse';

    let criticite = 'normal';
    if (Math.abs(pente) > 0.5) criticite = 'CRITIQUE';
    else if (Math.abs(pente) > 0.1) criticite = 'ATTENTION';

    return { tendance, pente, prediction, criticite };
  }
}

// Innovation #35: Détection de cycles
export class CycleDetector {
  private sequence: { organe: string; etat: string; temps: number }[] = [];

  record(organe: string, etat: string, temps: number) {
    this.sequence.push({ organe, etat, temps });
    if (this.sequence.length > 100) this.sequence.shift();
  }

  detectAnomalies(profilNominal: string[]): string[] {
    const anomalies: string[] = [];
    const etats = this.sequence.map(s => s.etat);

    // Détection de cycles trop longs
    let dureeJaune = 0;
    for (let i = this.sequence.length - 1; i >= 0; i--) {
      if (this.sequence[i].etat === 'jaune') {
        dureeJaune = this.sequence[this.sequence.length - 1].temps - this.sequence[i].temps;
        break;
      }
    }

    if (dureeJaune > 10000) { // 10 secondes
      anomalies.push(`État JAUNE anormalement long: ${(dureeJaune / 1000).toFixed(1)}s`);
    }

    // Vérification du profil
    if (profilNominal.length > 0 && etats.length >= profilNominal.length) {
      const derniersEtats = etats.slice(-profilNominal.length);
      if (JSON.stringify(derniersEtats) !== JSON.stringify(profilNominal)) {
        anomalies.push(`Séquence d'états différente du profil nominal`);
      }
    }

    return anomalies;
  }
}