export const runtime = 'edge';

// app/api/training/dataset/prepare/route.ts
// API préparation dataset avec versionnement automatique

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Interfaces pour les types
interface TrainingExample {
  id?: string;
  question: string;
  response: string;
  quality?: number;
  source?: string;
  createdAt?: string;
  tags?: string[];
}

interface PreparationStats {
  totalExamples: number;
  validExamples: number;
  rejectedExamples: number;
  avgQuality: number;
  fileSizeKB: number;
  sourcesCount: number;
  preparationTime: number;
}

export async function POST() {
  const startTime = Date.now();
  
  try {
    // 1. SNAPSHOT AUTOMATIQUE AVANT PRÉPARATION
    console.log('📸 Création snapshot avant préparation...');
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'auto-versioning.ps1');
      if (fs.existsSync(scriptPath)) {
        await execAsync(`powershell -File "${scriptPath}" -Trigger before-prepare -Comment "Auto-snapshot avant préparation du ${new Date().toLocaleDateString()}"`);
        console.log('✅ Snapshot créé avec succès');
      } else {
        console.log('⚠️ Script de versionnement non trouvé, skip snapshot');
      }
    } catch (versionError) {
      console.error('Erreur versionnement:', versionError);
      // Non bloquant - on continue la préparation
    }

    // Chemins des fichiers
    const datasetPath = path.join(process.cwd(), 'data', 'training', 'dataset.jsonl');
    const examplesPath = path.join(process.cwd(), 'data', 'training', 'examples.json');
    const importsDir = path.join(process.cwd(), 'data', 'training', 'imports');
    const reportPath = path.join(process.cwd(), 'data', 'training', 'preparation_report.json');
    
    // Vérifier et créer le dossier si nécessaire
    const dir = path.dirname(datasetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 2. COLLECTE DES DONNÉES MULTI-SOURCES
    let allExamples: TrainingExample[] = [];
    let sourcesStats = {
      main: 0,
      imports: 0,
      totalFiles: 0
    };
    
    // 2.1 Charger les exemples principaux (examples.json)
    if (fs.existsSync(examplesPath)) {
      const data = fs.readFileSync(examplesPath, 'utf-8');
      const mainExamples = JSON.parse(data);
      allExamples.push(...mainExamples);
      sourcesStats.main = mainExamples.length;
      console.log(`📁 Examples.json: ${mainExamples.length} exemples`);
    }
    
    // 2.2 Scanner le dossier imports/ pour les fichiers JSON externes
    if (fs.existsSync(importsDir)) {
      const importFiles = fs.readdirSync(importsDir).filter(f => f.endsWith('.json'));
      sourcesStats.totalFiles = importFiles.length;
      
      for (const file of importFiles) {
        const filePath = path.join(importsDir, file);
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const importedData = JSON.parse(fileContent);
          
          // Normaliser les données importées
          const normalized = normalizeImportedData(importedData, file);
          if (normalized.length > 0) {
            allExamples.push(...normalized);
            sourcesStats.imports += normalized.length;
            console.log(`📄 ${file}: ${normalized.length} exemples importés`);
            
            // Déplacer le fichier traité vers archive
            const archiveDir = path.join(process.cwd(), 'data', 'training', 'archive');
            if (!fs.existsSync(archiveDir)) {
              fs.mkdirSync(archiveDir, { recursive: true });
            }
            const archivePath = path.join(archiveDir, `${path.basename(file, '.json')}_${Date.now()}.json`);
            fs.renameSync(filePath, archivePath);
          }
        } catch (fileError) {
          console.error(`Erreur lecture ${file}:`, fileError);
        }
      }
    }
    
    // 3. VALIDATION ET NETTOYAGE DES DONNÉES
    const validationResults = validateExamples(allExamples);
    const validExamples = validationResults.valid;
    const rejectedExamples = validationResults.rejected;
    
    // 4. CALCUL DES STATISTIQUES
    const avgQuality = validExamples.length > 0
      ? validExamples.reduce((acc, ex) => acc + (ex.quality || 5), 0) / validExamples.length
      : 0;
    
    // 5. CONVERSION EN FORMAT JSONL POUR COLAB
    const jsonlContent = validExamples.map((ex: TrainingExample) => 
      JSON.stringify({
        instruction: ex.question,
        response: ex.response,
        quality: ex.quality || 5,
        source: ex.source || 'unknown',
        tags: ex.tags || []
      })
    ).join('\n');
    
    fs.writeFileSync(datasetPath, jsonlContent, 'utf-8');
    
    // 6. GÉNÉRATION DU RAPPORT
    const stats: PreparationStats = {
      totalExamples: allExamples.length,
      validExamples: validExamples.length,
      rejectedExamples: rejectedExamples.length,
      avgQuality: parseFloat(avgQuality.toFixed(2)),
      fileSizeKB: parseFloat((fs.statSync(datasetPath).size / 1024).toFixed(1)),
      sourcesCount: sourcesStats.main + sourcesStats.imports,
      preparationTime: Date.now() - startTime
    };
    
    const report = {
      timestamp: new Date().toISOString(),
      stats: stats,
      sources: sourcesStats,
      rejectedList: rejectedExamples.slice(0, 10), // Limiter à 10 pour la lisibilité
      outputFile: datasetPath,
      version: "1.0.0"
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    
    // 7. MISE À JOUR examples.json (fusion avec nouveaux imports)
    if (sourcesStats.imports > 0) {
      // Fusionner avec les exemples existants (sans doublons)
      const existingIds = new Set(allExamples.map(ex => ex.question.toLowerCase()));
      const newExamples = validExamples.filter(ex => !existingIds.has(ex.question.toLowerCase()));
      
      if (newExamples.length > 0) {
        const updatedExamples = [...allExamples, ...newExamples];
        fs.writeFileSync(examplesPath, JSON.stringify(updatedExamples, null, 2), 'utf-8');
        console.log(`✅ ${newExamples.length} nouveaux exemples ajoutés à examples.json`);
      }
    }
    
    // 8. LOG DE SUCCÈS
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    PRÉPARATION TERMINÉE                         ║
╠════════════════════════════════════════════════════════════════╣
║  📊 Exemples valides: ${validExamples.length}
║  ❌ Rejetés: ${rejectedExamples.length}
║  ⭐ Qualité moyenne: ${stats.avgQuality}/5
║  💾 Taille dataset: ${stats.fileSizeKB} KB
║  ⏱️  Temps: ${stats.preparationTime}ms
╚════════════════════════════════════════════════════════════════╝
    `);
    
    // 9. DÉCLENCHEUR POST-PRÉPARATION (optionnel)
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'auto-versioning.ps1');
      if (fs.existsSync(scriptPath)) {
        await execAsync(`powershell -File "${scriptPath}" -Trigger on-import`);
      }
    } catch (postError) {
      console.error('Erreur post-versionnement:', postError);
    }
    
    return NextResponse.json({
      success: true,
      stats: stats,
      message: `Dataset préparé avec succès: ${validExamples.length} exemples prêts pour Colab`,
      reportPath: reportPath
    });
    
  } catch (error) {
    console.error('Erreur préparation dataset:', error);
    
    // Log d'erreur
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      stack: error instanceof Error ? error.stack : undefined
    };
    
    const errorLogPath = path.join(process.cwd(), 'data', 'training', 'logs', 'preparation_errors.json');
    const logsDir = path.dirname(errorLogPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    let existingErrors = [];
    if (fs.existsSync(errorLogPath)) {
      existingErrors = JSON.parse(fs.readFileSync(errorLogPath, 'utf-8'));
    }
    existingErrors.push(errorLog);
    fs.writeFileSync(errorLogPath, JSON.stringify(existingErrors.slice(-50), null, 2)); // Garder les 50 dernières erreurs
    
    return NextResponse.json(
      { 
        error: 'Erreur lors de la préparation du dataset',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 500 }
    );
  }
}

// Fonction de normalisation des données importées
function normalizeImportedData(data: any, _sourceFile: string): TrainingExample[] {
  const results: TrainingExample[] = [];
  
  // Si c'est un tableau, traiter chaque élément
  const items = Array.isArray(data) ? data : [data];
  
  for (const item of items) {
    // Format standard: { question, response }
    if (item.question && item.response) {
      results.push({
        question: item.question.trim(),
        response: item.response.trim(),
        quality: item.quality || 5,
        source: 'import',
        tags: item.tags || [],
        createdAt: new Date().toISOString()
      });
    }
    // Format procédure avec steps
    else if (item.steps && Array.isArray(item.steps)) {
      const procedureExamples = extractFromProcedure(item);
      results.push(...procedureExamples);
    }
    // Format instruction/response
    else if (item.instruction && item.response) {
      results.push({
        question: item.instruction.trim(),
        response: item.response.trim(),
        quality: item.quality || 5,
        source: 'import',
        tags: item.tags || [],
        createdAt: new Date().toISOString()
      });
    }
  }
  
  return results;
}

// Extraction depuis une procédure structurée
function extractFromProcedure(procedure: any): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const procName = procedure.name || procedure.title || 'Procédure';
  
  // Question générale sur la procédure
  if (procedure.description) {
    examples.push({
      question: `Quelle est la procédure pour ${procName} ?`,
      response: procedure.description,
      quality: 5,
      source: 'procedure',
      tags: ['procedure', procName.toLowerCase().replace(/\s/g, '_')],
      createdAt: new Date().toISOString()
    });
  }
  
  // Parcourir les étapes
  if (procedure.steps) {
    for (const step of procedure.steps) {
      if (step.title) {
        const details = step.details || step.description || `Suivre l'étape: ${step.title}`;
        examples.push({
          question: `Dans ${procName}, comment réaliser : ${step.title} ?`,
          response: details,
          quality: 4,
          source: 'procedure',
          tags: ['procedure', 'step'],
          createdAt: new Date().toISOString()
        });
      }
      
      // Sous-étapes
      if (step.steps && Array.isArray(step.steps)) {
        for (const subStep of step.steps) {
          if (subStep.title) {
            const subDetails = subStep.details || subStep.description || `Vérifier: ${subStep.title}`;
            examples.push({
              question: `Dans ${procName}, que faut-il vérifier pour : ${subStep.title} ?`,
              response: subDetails,
              quality: 4,
              source: 'procedure',
              tags: ['procedure', 'substep'],
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }
  }
  
  return examples;
}

// Validation des exemples
function validateExamples(examples: TrainingExample[]): { valid: TrainingExample[], rejected: any[] } {
  const valid: TrainingExample[] = [];
  const rejected: any[] = [];
  
  for (const ex of examples) {
    // Vérifier les champs obligatoires
    if (!ex.question || ex.question.trim().length < 3) {
      rejected.push({ reason: 'Question trop courte ou absente', example: ex });
      continue;
    }
    
    if (!ex.response || ex.response.trim().length < 5) {
      rejected.push({ reason: 'Réponse trop courte ou absente', example: ex });
      continue;
    }
    
    // Nettoyer et valider
    valid.push({
      ...ex,
      question: ex.question.trim(),
      response: ex.response.trim(),
      quality: Math.min(5, Math.max(1, ex.quality || 5)) // Entre 1 et 5
    });
  }
  
  return { valid, rejected };
}