const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet');
const dns = require('dns');

// Force IPv4 for ECONNRESET issues
dns.setDefaultResultOrder('ipv4first');

async function downloadModel() {
  console.log('Downloading MobileNet...');
  try {
    const model = await mobilenet.load({ version: 1, alpha: 1.0 });
    console.log('Model loaded in memory. Saving to local disk...');
    await model.model.save('file://./public/models/mobilenet');
    console.log('Model successfully saved to ./public/models/mobilenet');
  } catch (err) {
    console.error('Error downloading model:', err);
  }
}

downloadModel();
