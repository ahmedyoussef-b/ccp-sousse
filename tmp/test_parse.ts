import { MindMapParser } from '../src/ai/mindmap/mindmap-parser';
import * as fs from 'fs';

const jsonData = {
  "identification_schema": "Architecture des Systèmes d'Air Comprimé (SAP & SAR)",
  "source": "NotebookLM Mind Map (5).png [1]",
  "donnees_techniques": {
    "systeme_sap_air_service": {
      "role": [
        "Production air comprimé de service",
        "Distribution pour le cycle combiné de Sousse"
      ],
      "architecture_materielle": {
        "compresseur": "101 CO (type à vis lubrifiées)",
        "capacite_stockage": "Réservoir 101 BA de 6 m3",
        "reseau": "Circuit de distribution général"
      },
      "parametres_exploitation": {
        "debit_nominal": "340 Nm3/h",
        "pression_service": "10 bar eff.",
        "puissance_moteur": "55 kW"
      }
    },
    "systeme_sar_air_regulation": {
      "role": [
        "Séchage et filtration du fluide",
        "Production d'air de régulation instrumentée"
      ],
      "equipements_critiques": {
        "redondance_compresseurs": "2 unités (101/201 CO)",
        "reservoirs": "2 unités (Régulation / Sec)",
        "traitement_air": "Ensemble de séchage (2 sécheurs)",
        "filtration": "Dispositifs de filtration fine"
      },
      "logique_operationnelle": [
        "Mode un compresseur en base",
        "Mode second compresseur en secours",
        "Cycle de régénération automatisé des sécheurs"
      ]
    },
    "strategie_de_controle": {
      "modes_de_pilotage": [
        "Local via armoire de contrôle",
        "Distance via Salle de commande/TAS"
      ],
      "logique_automatisation_pression": {
        "prise_de_charge_100_pct": "P < 6,2 bar",
        "marche_a_vide_0_pct": "P > 7 bar",
        "securite_economie": "Arrêt automatique après 10 min de marche à vide"
      },
      "surveillance_et_alarmes": [
        "Sécurité anti-redémarrage par pressostat PSL 101",
        "Monitoring des défauts électriques moteurs",
        "Seuil de température haute sur sortie air"
      ]
    },
    "analyse_de_surete_electrique": {
      "scenario_perte_48vcc_controle": {
        "vanne_interconnexion_uv_001": "Maintien en position actuelle",
        "electrovannes": "Position de sécurité fermée"
      },
      "scenario_perte_380vca_puissance": {
        "actionneurs_moteurs": "Arrêt immédiat compresseurs et ventilateurs",
        "electrovannes": "Position de sécurité fermée"
      }
    },
    "interfaces_systemes_aval": [
      "SVA (Vapeur auxiliaire)",
      "SXS (Drains et exhaures)",
      "JPT (Protection incendie transformateurs)"
    ]
  }
};

const parser = MindMapParser.getInstance();
const result = parser.parse(JSON.stringify(jsonData), 'json');

console.log(JSON.stringify(result, null, 2));
