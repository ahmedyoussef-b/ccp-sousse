
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function test() {
  try {
    const form = new FormData();
    // Use any image file if exists, or just a dummy buffer
    form.append('image', Buffer.alloc(100), { filename: 'test.jpg', contentType: 'image/jpeg' });
    
    console.log('Sending request to /api/vision/suggestions...');
    const response = await fetch('http://localhost:3000/api/vision/suggestions', {
      method: 'POST',
      body: form
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Data:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
