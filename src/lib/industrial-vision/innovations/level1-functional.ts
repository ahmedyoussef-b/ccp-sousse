// src/lib/industrial-vision/innovations/level1-functional.ts

import { OrganePosition, VoyantState } from "../types/industrial.types";

// Innovation #1: Indexation texte → localisation
export function indexTextToPosition(organes: OrganePosition[]): Map<string, OrganePosition> {
  const index = new Map();
  for (const organe of organes) {
    index.set(organe.nom, organe);
  }
  return index;
}

// Innovation #2: Détection de familles d'organes
export function detectFamilies(organes: OrganePosition[]): Map<string, string[]> {
  // Regroupement par proximité spatiale
  const families = new Map<string, string[]>();
  const seuilDistance = 150;
  
  for (let i = 0; i < organes.length; i++) {
    const famille = [organes[i].nom];
    for (let j = i + 1; j < organes.length; j++) {
      const dx = organes[i].bbox[0] - organes[j].bbox[0];
      const dy = organes[i].bbox[1] - organes[j].bbox[1];
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < seuilDistance) {
        famille.push(organes[j].nom);
      }
    }
    if (famille.length > 1) {
      families.set(`famille_${i}`, famille);
    }
  }
  return families;
}

// Innovation #3: Signature spatiale
export function computeSpatialSignature(organes: OrganePosition[]): number[] {
  const signature: number[] = [];
  for (let i = 0; i < organes.length; i++) {
    for (let j = i + 1; j < organes.length; j++) {
      const dx = organes[i].bbox[0] - organes[j].bbox[0];
      const dy = organes[i].bbox[1] - organes[j].bbox[1];
      const angle = Math.atan2(dy, dx);
      const distance = Math.sqrt(dx*dx + dy*dy);
      signature.push(angle, distance);
    }
  }
  return signature;
}

// Innovation #4: Masques Voronoï
export function computeVoronoiMask(organes: OrganePosition[], _width: number, _height: number): Map<string, number[][]> {
  // Simplifié: retourne les régions associées
  const regions = new Map();
  for (const organe of organes) {
    regions.set(organe.nom, [[organe.bbox[0], organe.bbox[1]]]);
  }
  return regions;
}

// Innovation #5: Recherche cross-modale
export function crossModalSearch(query: string, organes: OrganePosition[]): OrganePosition[] {
  const keywords = query.toLowerCase().split(' ');
  return organes.filter(org => {
    const nomLower = org.nom.toLowerCase();
    return keywords.some(kw => nomLower.includes(kw));
  });
}

// Innovation #6: Détection d'anomalies
export function detectAnomalies(organes: OrganePosition[], reference: OrganePosition[]): string[] {
  const anomalies: string[] = [];
  const refNames = new Set(reference.map(r => r.nom));
  const currentNames = new Set(organes.map(o => o.nom));
  
  const manquants = [...refNames].filter(n => !currentNames.has(n));
  const ajoutes = [...currentNames].filter(n => !refNames.has(n));
  
  if (manquants.length) anomalies.push(`Organes manquants: ${manquants.join(', ')}`);
  if (ajoutes.length) anomalies.push(`Organes ajoutés: ${ajoutes.join(', ')}`);
  
  return anomalies;
}

// Innovation #7: Alt text automatique
export function generateAltText(organes: OrganePosition[], voyants: VoyantState[]): string {
  const organesListe = organes.map(o => o.nom).join(', ');
  const voyantsActifs = voyants.filter(v => v.couleur !== 'eteint');
  const etat = voyantsActifs.length ? `avec ${voyantsActifs.length} voyants actifs` : 'tous voyants éteints';
  return `Schéma industriel montrant ${organesListe}, ${etat}.`;
}

// Innovation #8: Détection d'organes manquants
export function detectMissingOrgans(organes: OrganePosition[], expected: string[]): string[] {
  const present = new Set(organes.map(o => o.nom));
  return expected.filter(e => !present.has(e));
}

// Innovation #9: Carte interactive (génération HTML)
export function generateInteractiveMap(organes: OrganePosition[], imagePath: string): string {
  let html = `<!DOCTYPE html>
  <html><head><style>
    area { cursor: pointer; }
    #info { position: fixed; bottom: 10px; left: 10px; background: white; padding: 10px; border-radius: 5px; }
  </style></head>
  <body>
    <img src="${imagePath}" usemap="#industrial-map" width="800">
    <map name="industrial-map">`;
  
  for (const org of organes) {
    const [x1, y1, x2, y2] = org.bbox;
    html += `<area shape="rect" coords="${x1},${y1},${x2},${y2}" 
                   onmouseover="showInfo('${org.nom}')" title="${org.nom}">`;
  }
  
  html += `</map><div id="info"></div>
  <script>
    function showInfo(org) { document.getElementById('info').innerHTML = '📍 ' + org; }
  </script>
  </body></html>`;
  
  return html;
}

// Innovation #10: Versioning sémantique
export function semanticVersioning(organes1: OrganePosition[], organes2: OrganePosition[]): string {
  const sig1 = JSON.stringify(organes1.map(o => o.nom).sort());
  const sig2 = JSON.stringify(organes2.map(o => o.nom).sort());
  
  if (sig1 === sig2) return 'identical';
  
  const set1 = new Set(organes1.map(o => o.nom));
  const set2 = new Set(organes2.map(o => o.nom));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const ratio = intersection.size / Math.max(set1.size, set2.size);
  
  if (ratio > 0.8) return 'minor_change';
  if (ratio > 0.5) return 'major_change';
  return 'different';
}