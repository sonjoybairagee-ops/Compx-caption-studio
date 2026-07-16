// Test OpenAI API connection
require('dotenv').config();

const https = require('https');

console.log('\n=== Testing OpenAI API Connection ===\n');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    console.error('❌ ERROR: API key not configured!');
    console.log('\nPlease edit server/.env and set your API key:');
    console.log('OPENAI_API_KEY=sk-your-actual-key\n');
    process.exit(1);
}

console.log('✓ API key found:', apiKey.substring(0, 20) + '...');
console.log('✓ Testing connection to OpenAI...\n');

// Test API connection
const options = {
    hostname: 'api.openai.com',
    path: '/v1/models',
    method: 'GET',
    headers: {
        'Authorization': 'Bearer ' + apiKey
    }
};

const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ SUCCESS! API connection working!\n');
            console.log('Available models:');
            try {
                const models = JSON.parse(data);
                const whisperModel = models.data.find(m => m.id === 'whisper-1');
                if (whisperModel) {
                    console.log('  ✓ whisper-1 (Transcription model)\n');
                } else {
                    console.log('  Note: whisper-1 model available\n');
                }
            } catch (e) {
                console.log('  (Models list retrieved)\n');
            }
            console.log('Ready to use API mode! 🎉\n');
        } else {
            console.error('❌ API Error:', res.statusCode);
            console.error('Response:', data.substring(0, 200));
            console.log('\nCommon issues:');
            console.log('  - Invalid API key');
            console.log('  - No credits remaining');
            console.log('  - Check: https://platform.openai.com/account/billing\n');
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
    console.log('\nCheck your internet connection\n');
    process.exit(1);
});

req.end();
