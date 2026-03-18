const https = require('https');
https.get('https://sandalyecimetin.vercel.app/assets/index-DuvwpVnC.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (data.includes('localhost:5098')) console.log('Contains localhost:5098');
        if (data.includes('discord-klonu.onrender.com')) console.log('Contains discord-klonu.onrender.com');
        if (data.includes('sandalyecimetin-api.onrender.com')) console.log('Contains sandalyecimetin-api.onrender.com');
    });
});
