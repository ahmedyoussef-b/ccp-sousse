// lib/services/ttsProviders/piperProvider.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

class PiperProvider {
  name = 'piper';
  private modelsPath: string;
  private tempPath: string;

  constructor() {
    this.modelsPath = path.join(process.cwd(), 'data/tts/models');
    this.tempPath = path.join(process.cwd(), 'data/tts/temp');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.modelsPath, this.tempPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
          console.warn(`Impossible de créer le dossier TTS: ${dir}`);
        }
      }
    });
  }

  /**
   * Vérifier si Piper est disponible
   */
  async checkHealth(): Promise<boolean> {
    try {
      await execAsync('piper --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir les voix disponibles
   */
  async getVoices(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.modelsPath)) return [];
      const files = await fs.promises.readdir(this.modelsPath);
      return files
        .filter(f => f.endsWith('.onnx'))
        .map(f => f.replace('.onnx', ''));
    } catch {
      return [];
    }
  }

  /**
   * Synthétiser le texte
   */
  async synthesize(text: string, options: {
    voice: string;
    speed?: number;
  }): Promise<Buffer> {
    const { voice, speed = 1.0 } = options;
    
    const modelPath = path.join(this.modelsPath, `${voice}.onnx`);
    const configPath = path.join(this.modelsPath, `${voice}.json`);
    
    if (!fs.existsSync(modelPath)) {
      await this.downloadModel(voice);
    }

    const outputPath = path.join(this.tempPath, `${crypto.randomUUID()}.wav`);
    
    try {
      // Nettoyer le texte pour éviter les injections de commande
      const safeText = text.replace(/"/g, '\\"');
      const command = `echo "${safeText}" | piper --model "${modelPath}" --config "${configPath}" --output-file "${outputPath}"`;
      
      await execAsync(command);

      if (speed !== 1.0) {
        try {
          const speededPath = path.join(this.tempPath, `${crypto.randomUUID()}.wav`);
          await execAsync(`sox "${outputPath}" "${speededPath}" speed ${speed}`);
          const audio = await fs.promises.readFile(speededPath);
          await fs.promises.unlink(speededPath).catch(() => {});
          return audio;
        } catch (soxError) {
          console.warn("SOX non disponible pour le changement de vitesse, retour audio original.");
          return await fs.promises.readFile(outputPath);
        }
      } else {
        return await fs.promises.readFile(outputPath);
      }
    } catch (e: any) {
      throw new Error(`Erreur Piper: ${e.message}`);
    } finally {
      await fs.promises.unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Télécharger un modèle
   */
  private async downloadModel(voice: string): Promise<void> {
    console.log(`📥 Téléchargement du modèle Piper: ${voice}`);
    
    const modelPath = path.join(this.modelsPath, `${voice}.onnx`);
    const configPath = path.join(this.modelsPath, `${voice}.json`);
    
    const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
    const modelUrl = `${baseUrl}/${voice.replace(/_/g, '-').split('-').slice(0, 2).join('-')}/${voice.replace(/_/g, '-')}/${voice}.onnx`;
    const configUrl = `${baseUrl}/${voice.replace(/_/g, '-').split('-').slice(0, 2).join('-')}/${voice.replace(/_/g, '-')}/${voice}.json`;
    
    try {
      const modelResponse = await fetch(modelUrl);
      if (!modelResponse.ok) throw new Error("Échec téléchargement modèle ONNX");
      const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
      await fs.promises.writeFile(modelPath, modelBuffer);
      
      const configResponse = await fetch(configUrl);
      if (!configResponse.ok) throw new Error("Échec téléchargement config JSON");
      const configBuffer = Buffer.from(await configResponse.arrayBuffer());
      await fs.promises.writeFile(configPath, configBuffer);
      
      console.log(`✅ Modèle téléchargé: ${voice}`);
    } catch (e: any) {
      throw new Error(`Impossible de télécharger le modèle ${voice}: ${e.message}`);
    }
  }
}

export default new PiperProvider();
