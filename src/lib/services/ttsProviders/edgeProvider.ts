// lib/services/ttsProviders/edgeProvider.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

const EDGE_TTS_BIN = 'C:\\Users\\pc\\AppData\\Roaming\\Python\\Python313\\Scripts\\edge-tts.exe';

class EdgeProvider {
  name = 'edge';
  private tempPath: string;

  constructor() {
    this.tempPath = path.join(process.cwd(), 'data/tts/temp');
    try {
      if (!fs.existsSync(this.tempPath)) {
        fs.mkdirSync(this.tempPath, { recursive: true });
      }
    } catch (e) {
      console.warn("Impossible de créer le dossier temporaire Edge TTS:", e);
    }
  }

  /**
   * Vérifier si edge-tts est disponible
   */
  async checkHealth(): Promise<boolean> {
    try {
      await execAsync(`"${EDGE_TTS_BIN}" --list-voices`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir les voix disponibles
   */
  async getVoices(): Promise<any[]> {
    const { stdout } = await execAsync(`"${EDGE_TTS_BIN}" --list-voices`);
    return stdout.split('\n')
      .filter(line => line.includes('fr-FR') || line.includes('en-US'))
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts[0],
          gender: parts[1],
          language: parts[2]
        };
      });
  }

  /**
   * Synthétiser le texte
   */
  async synthesize(text: string, options: {
    voice: string;
    speed?: number;
  }): Promise<Buffer> {
    const { voice, speed = 1.0 } = options;
    
    const outputPath = path.join(this.tempPath, `${crypto.randomUUID()}.mp3`);
    
    try {
      // Nettoyer le texte pour Windows (éviter les problèmes de guillemets)
      const safeText = text.replace(/"/g, ' ');
      
      // Exécuter edge-tts
      const command = `"${EDGE_TTS_BIN}" --text "${safeText}" --voice "${voice}" --write-media "${outputPath}"`;
      
      if (speed !== 1.0) {
        await execAsync(`${command} --rate ${this.speedToRate(speed)}`);
      } else {
        await execAsync(command);
      }
      
      return await fs.promises.readFile(outputPath);
    } finally {
      await fs.promises.unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Convertir vitesse en format edge-tts
   */
  private speedToRate(speed: number): string {
    const rate = Math.round((speed - 1) * 100);
    return rate >= 0 ? `+${rate}%` : `${rate}%`;
  }
}

export default new EdgeProvider();
