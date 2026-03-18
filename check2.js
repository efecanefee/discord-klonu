const https = require('https');
https.get('https://sandalyecimetin.vercel.app/', (res) => {
    let html = '';
    res.on('data', c => html += c);
    res.on('end', () => {
        const match = html.match(/<script type="module" crossorigin src="(.*?)">/);
        if (match) {
            const jsUrl = 'https://sandalyecimetin.vercel.app' + match[1];
            https.get(jsUrl, (res2) => {
                let js = '';
                res2.on('data', c => js += c);
                res2.on('end', () => {
                    if (js.includes('localhost:5098')) console.log('FOUND: localhost:5098');
                    if (js.includes('discord-klonu.onrender.com')) console.log('FOUND: discord-klonu.onrender.com');
                    if (js.includes('sandalyecimetin-api.onrender.com')) console.log('FOUND: sandalyecimetin-api.onrender.com');
                });
            });
        }
    });
});
