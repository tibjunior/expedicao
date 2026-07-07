const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
    // Decodifica a URL para lidar com espaços e acentos
    let decodedUrl = decodeURIComponent(req.url);
    let filePath = path.join(__dirname, decodedUrl);
    
    // Se for a raiz, serve o index.html
    if (decodedUrl === '/') {
        filePath = path.join(__dirname, 'index.html');
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Arquivo Não Encontrado');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('500 Erro Interno: ' + error.code);
            }
        } else {
            // Adiciona cabeçalhos CORS básicos
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('👀 Observando alterações nos arquivos para auto-deploy FTP...');
});

// ==========================================
// MONITORAMENTO DE ARQUIVOS E DEPLOY AUTOMÁTICO
// ==========================================
const { runDeploy, ALLOWED_FILES } = require('./deploy');
let deployTimeout = null;

fs.watch(__dirname, (eventType, filename) => {
    // Verifica se o arquivo modificado é um dos permitidos no deploy
    if (filename && ALLOWED_FILES.includes(filename)) {
        // Aplica um debounce de 1000ms para evitar múltiplos disparos rápidos (comum ao salvar)
        clearTimeout(deployTimeout);
        deployTimeout = setTimeout(() => {
            console.log(`\n🔔 Alteração detectada no arquivo: ${filename}`);
            runDeploy();
        }, 1000);
    }
});
