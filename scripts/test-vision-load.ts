import visionService from '../src/lib/services/visionService';

async function test() {
  console.log('--- Vision Model Initialization Test ---');
  try {
    // @ts-ignore
    await visionService.initVisionModel();
    console.log('✅ Success: Model initialized');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failure:', err);
    process.exit(1);
  }
}

test();
