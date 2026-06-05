import { NextResponse } from 'next/server';
import { zeroShotAnomaly } from '@/ai/innovations/01-zero-shot-anomaly';
import { computerUseAgent } from '@/ai/innovations/02-computer-use-agent';
import { dualConsensusVision } from '@/ai/innovations/03-dual-consensus-vision';
import { autoFolderClassifier } from '@/ai/innovations/04-auto-folder-classifier';
import { hybridVisionSearch } from '@/ai/innovations/05-hybrid-vision-search';
import { fewShotDefectTrainer } from '@/ai/innovations/06-few-shot-defect-trainer';
import { panoramicStitching } from '@/ai/innovations/07-panoramic-stitching';
import { confidenceFeedback } from '@/ai/innovations/08-confidence-feedback';

export async function GET() {
  try {
    
    // Innovation 1 - Zero-Shot Anomaly
    let zeroShotCount = 0;
    try {
      const subspaces = await zeroShotAnomaly.listSubspaces();
      zeroShotCount = subspaces.length;
    } catch (e) { zeroShotCount = 0; }
    
    // Innovation 2 - Computer-Use Agent
    let computerUseCount = 0;
    try {
      const stats = await computerUseAgent.getStats();
      computerUseCount = stats.totalAnalyses || 0;
    } catch (e) { computerUseCount = 0; }
    
    // Innovation 3 - Dual Consensus
    let dualConsensusCount = 0;
    try {
      const stats = await dualConsensusVision.getStats();
      dualConsensusCount = stats.totalReadings || 0;
    } catch (e) { dualConsensusCount = 0; }
    
    // Innovation 4 - Auto Folder
    let autoFolderCount = 0;
    try {
      const stats = await autoFolderClassifier.getStats();
      autoFolderCount = stats.totalClassifications || 0;
    } catch (e) { autoFolderCount = 0; }
    
    // Innovation 5 - Hybrid Search
    let hybridSearchCount = 0;
    try {
      const stats = await hybridVisionSearch.getStats();
      hybridSearchCount = stats.searchesCount || 0;
    } catch (e) { hybridSearchCount = 0; }
    
    // Innovation 6 - Few-Shot Trainer
    let fewShotCount = 0;
    try {
      const stats = await fewShotDefectTrainer.getStats();
      fewShotCount = stats.detectorsCount || 0;
    } catch (e) { fewShotCount = 0; }
    
    // Innovation 7 - Panoramic Stitching
    let panoramicCount = 0;
    try {
      const stats = await panoramicStitching.getStats();
      panoramicCount = stats.totalStitches || 0;
    } catch (e) { panoramicCount = 0; }
    
    // Innovation 8 - Confidence Feedback
    let confidenceCount = 0;
    try {
      const stats = confidenceFeedback.getStats();
      confidenceCount = stats.totalFeedbacks || 0;
    } catch (e) { confidenceCount = 0; }
    
    const totalInteractions = 
      zeroShotCount + computerUseCount + dualConsensusCount + 
      autoFolderCount + hybridSearchCount + fewShotCount + 
      panoramicCount + confidenceCount;
    
    return NextResponse.json({
      innovation_1: { count: zeroShotCount },
      innovation_2: { count: computerUseCount },
      innovation_3: { count: dualConsensusCount },
      innovation_4: { count: autoFolderCount },
      innovation_5: { count: hybridSearchCount },
      innovation_6: { count: fewShotCount },
      innovation_7: { count: panoramicCount },
      innovation_8: { count: confidenceCount },
      global: {
        totalInnovations: 8,
        activeInnovations: 8,
        totalInteractions: totalInteractions
      }
    });
  } catch (error) {
    console.error('Erreur stats:', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}