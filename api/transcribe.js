// Vercel serverless function for transcription
const https = require('https');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64, language = 'bn' } = req.body;
    
    if (!audioBase64) {
      return res.status(400).json({ 
        error: 'Audio data required',
        code: 'MISSING_AUDIO'
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'API key not configured',
        code: 'API_KEY_NOT_CONFIGURED'
      });
    }

    // Decode base64 audio
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Create form data
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    form.append('model', 'whisper-1');
    form.append('language', language);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    // Call OpenAI API
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'Authorization': 'Bearer ' + OPENAI_API_KEY
        }
      };

      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      apiReq.on('error', reject);
      form.pipe(apiReq);
    });

    // Convert to our format
    const segments = (result.words || []).map(w => ({
      start: w.start,
      end: w.end,
      text: w.word,
      words: [{ w: w.word, start: w.start, end: w.end }]
    }));

    res.status(200).json({ segments });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ 
      error: error.message,
      code: 'TRANSCRIPTION_ERROR'
    });
  }
};
