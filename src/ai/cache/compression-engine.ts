// src/ai/cache/compression-engine.ts
import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';

/**
 * Innovation 3 : DragonMemory
 * Autoencodeur pour compresser les embeddings de 768 à 64 dimensions
 */
export class CompressionEngine {
  private static instance: CompressionEngine;
  private model: tf.LayersModel | null = null;
  private encoder: tf.LayersModel | null = null;
  private decoder: tf.LayersModel | null = null;
  private modelPath: string;

  private constructor() {
    this.modelPath = path.join(process.cwd(), 'data', 'cache_permanent', 'models', 'compressor');
  }

  public static getInstance(): CompressionEngine {
    if (!CompressionEngine.instance) {
      CompressionEngine.instance = new CompressionEngine();
    }
    return CompressionEngine.instance;
  }

  public async loadModel() {
    if (this.model) return;

    const modelJsonPath = path.join(this.modelPath, 'model.json');
    if (fs.existsSync(modelJsonPath)) {
      try {
        this.model = await tf.loadLayersModel(`file://${modelJsonPath}`);
        
        // Extraction de l'encodeur
        const latentLayerIndex = this.model.layers.findIndex(l => l.name === 'latent' || l.name.includes('dense_1'));
        if (latentLayerIndex !== -1) {
          const latentLayer = this.model.layers[latentLayerIndex];
          this.encoder = tf.model({ inputs: this.model.inputs, outputs: latentLayer.output });
          
          // Extraction du décodeur (Innovation 3: DragonMemory)
          const latentInput = tf.input({ shape: [64], name: 'decoder_input' });
          let decoderOutput = latentInput;
          
          for (let i = latentLayerIndex + 1; i < this.model.layers.length; i++) {
            decoderOutput = this.model.layers[i].apply(decoderOutput) as tf.SymbolicTensor;
          }
          this.decoder = tf.model({ inputs: latentInput, outputs: decoderOutput });
          
          console.log(`[DRAGON-MEMORY] ✅ Encodeur et Décodeur chargés.`);
        }
      } catch (e) {
        console.warn(`[DRAGON-MEMORY] ⚠️ Erreur chargement:`, e);
      }
    } else {
      console.log(`[DRAGON-MEMORY] ℹ️ Modèle inexistant. Création d'un nouveau modèle...`);
      await this.initNewModel();
    }
  }

  /**
   * Initialise un nouvel autoencodeur si aucun n'existe
   */
  private async initNewModel() {
    const inputDim = 384; // Taille des embeddings all-MiniLM-L6-v2
    const latentDim = 64;
    const suffix = Math.random().toString(36).substring(7);

    const input = tf.input({ shape: [inputDim], name: `input_${suffix}` });
    
    // Encodeur
    const encoded = tf.layers.dense({ units: 128, activation: 'relu', name: `enc_1_${suffix}` }).apply(input);
    const latent = tf.layers.dense({ units: latentDim, activation: 'relu', name: 'latent' }).apply(encoded) as tf.SymbolicTensor;
    
    // Décodeur
    const decoded = tf.layers.dense({ units: 128, activation: 'relu', name: `dec_1_${suffix}` }).apply(latent);
    const output = tf.layers.dense({ units: inputDim, activation: 'linear', name: `out_${suffix}` }).apply(decoded) as tf.SymbolicTensor;

    this.model = tf.model({ inputs: input, outputs: output });
    this.model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
    
    this.encoder = tf.model({ inputs: input, outputs: latent });

    // Initialisation du décodeur séparé
    const latentInput = tf.input({ shape: [latentDim], name: `dec_input_${suffix}` });
    const dec1 = tf.layers.dense({ units: 128, activation: 'relu', name: `dec_2_${suffix}` }).apply(latentInput);
    const decOut = tf.layers.dense({ units: inputDim, activation: 'linear', name: `dec_out_${suffix}` }).apply(dec1) as tf.SymbolicTensor;
    this.decoder = tf.model({ inputs: latentInput, outputs: decOut });
    
    console.log(`[DRAGON-MEMORY] ✨ Nouveau modèle initialisé (Dimensions: ${inputDim} -> ${latentDim} -> ${inputDim})`);
  }

  /**
   * Compresse un embedding
   */
  public async compress(embedding: number[]): Promise<number[]> {
    await this.loadModel();
    if (!this.encoder) return embedding;

    return tf.tidy(() => {
      const input = tf.tensor2d([embedding]);
      const compressed = this.encoder!.predict(input) as tf.Tensor;
      return Array.from(compressed.dataSync()) as number[];
    });
  }

  /**
   * Entraîne l'autoencodeur sur un lot d'embeddings
   */
  public async train(embeddings: number[][]) {
    await this.loadModel();
    if (!this.model) return;

    const xs = tf.tensor2d(embeddings);
    console.log(`[DRAGON-MEMORY] 🎓 Entraînement sur ${embeddings.length} exemples...`);
    
    await this.model.fit(xs, xs, {
      epochs: 5,
      batchSize: 32,
      shuffle: true
    });

    // Sauvegarde
    if (!fs.existsSync(this.modelPath)) {
      fs.mkdirSync(this.modelPath, { recursive: true });
    }
    await this.model.save(`file://${this.modelPath}`);
    
    xs.dispose();
    console.log(`[DRAGON-MEMORY] 💾 Modèle entraîné et sauvegardé.`);
  }

  /**
   * Décompresse (reconstruit) un embedding
   */
  public async decompress(latent: number[]): Promise<number[]> {
    await this.loadModel();
    if (!this.decoder) return latent;

    return tf.tidy(() => {
      const input = tf.tensor2d([latent]);
      const decompressed = this.decoder!.predict(input) as tf.Tensor;
      return Array.from(decompressed.dataSync()) as number[];
    });
  }

  public isReady(): boolean {
    return this.encoder !== null;
  }
}

export const compressionEngine = CompressionEngine.getInstance();