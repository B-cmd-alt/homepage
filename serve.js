// Local preview: node serve.js, then open http://localhost:8000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain',
};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(__dirname, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, content) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}).listen(PORT, () => console.log(`Preview at http://localhost:${PORT} (Ctrl+C to stop)`));
