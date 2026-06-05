// scripts/train-compressor.js
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

async function train() {
  const EMB_PATH = path.join(__dirname, '../data/cache_permanent/index/embeddings.json');
  const MODEL_DIR = path.join(__dirname, '../data/cache_permanent/models/compressor');

  if (!fs.existsSync(EMB_PATH)) {
    console.error('Embeddings index not found.');
    return;
  }

  console.log('🚀 Loading embeddings...');
  const index = JSON.parse(fs.readFileSync(EMB_PATH, 'utf-8'));
  const vectors = Object.values(index);

  if (vectors.length < 50) {
    console.log('⚠️ Not enough vectors to train (need at least 50).');
    return;
  }

  const inputDim = vectors[0].length;
  const latentDim = 64;

  const dataset = tf.tensor2d(vectors);

  console.log(`🔨 Building Autoencoder (${inputDim} -> ${latentDim})...`);
  
  const model = tf.sequential();
  
  // Encoder
  model.add(tf.layers.dense({ units: 256, activation: 'relu', inputShape: [inputDim] }));
  model.add(tf.layers.dense({ units: latentDim, activation: 'relu', name: 'latent' }));
  
  // Decoder
  model.add(tf.layers.dense({ units: 256, activation: 'relu' }));
  model.add(tf.layers.dense({ units: inputDim, activation: 'sigmoid' }));

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError'
  });

  console.log('🏃 Training...');
  await model.fit(dataset, dataset, {
    epochs: 50,
    batchSize: 32,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0) console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(6)}`);
      }
    }
  });

  console.log(`💾 Saving model to ${MODEL_DIR}...`);
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
  await model.save(`file://${MODEL_DIR}`);

  console.log('✅ Done!');
}

train().catch(console.error);
