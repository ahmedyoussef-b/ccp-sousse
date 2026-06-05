
import visionService from './src/lib/services/visionService.js';

async function test() {
    try {
        console.log('Initializing VisionService...');
        await visionService.init();
        const images = await visionService.listImages();
        console.log(`Found ${images.length} images.`);
        if (images.length > 0) {
            console.log('First image:', JSON.stringify(images[0], null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
