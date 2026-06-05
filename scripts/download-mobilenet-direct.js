const fs = require('fs');
const path = require('path');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

async function downloadMobileNet() {
  const modelUrl = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v1_1.0_224/model.json';
  const outDir = path.join(__dirname, '../public/models/mobilenet');
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Downloading ${modelUrl}...`);
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Failed to fetch model.json: ${response.statusText}`);
  
  const modelJson = await response.json();
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(modelJson, null, 2));

  // Extract binary file paths
  const weightsManifest = modelJson.weightsManifest;
  for (const manifest of weightsManifest) {
    for (const pathStr of manifest.paths) {
      const binUrl = `https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v1_1.0_224/${pathStr}`;
      console.log(`Downloading ${binUrl}...`);
      const binRes = await fetch(binUrl);
      if (!binRes.ok) throw new Error(`Failed to fetch ${pathStr}: ${binRes.statusText}`);
      
      const arrayBuffer = await binRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(path.join(outDir, pathStr), buffer);
    }
  }
  console.log('MobileNet downloaded successfully!');
}

downloadMobileNet().catch(console.error);
