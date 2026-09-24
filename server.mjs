import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.join(import.meta.dirname, 'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port = Number(process.env.PORT || 3000);
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'}); res.end(body);
  } catch {res.writeHead(404);res.end('Archivo no encontrado');}
}).listen(port, '0.0.0.0', () => console.log(`Alerta RD: http://localhost:${port}`));
