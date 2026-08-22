/**
 * print-server.js — Servidor local de impressão para Zebra ZD230/ZD220
 *
 * Uso:
 *   node print-server.js
 *
 * Endpoints:
 *   POST /print   — Envia ZPL para a impressora
 *   GET  /status  — Verifica status
 *   GET  /printers — Lista impressoras configuradas
 *
 * Requisitos: Node.js 14+
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'print-config.json');
const DEFAULT_CONFIG = {
    printers: {
        zd230: { type: 'tcp', host: '192.168.1.210', port: 9100 },
        zd220: { type: 'usb', command: 'print' }
    },
    default: 'zd230',
    port: 9200
};

let config = DEFAULT_CONFIG;
try {
    if (fs.existsSync(CONFIG_PATH)) {
        config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } else {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        console.log('📄 print-config.json criado com configuração padrão.');
    }
} catch (e) {
    console.error('Erro ao carregar config:', e.message, '(usando padrão)');
}

function sendZplTcp(host, port, zpl) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.connect(port, host, () => {
            client.write(zpl, 'utf8', () => {
                client.end();
                resolve(true);
            });
        });
        client.on('error', (err) => reject(err));
        client.setTimeout(5000, () => {
            client.destroy();
            reject(new Error('Timeout na conexão com a impressora'));
        });
    });
}

function sendZplUsb(command, zpl) {
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        const tmpFile = path.join(__dirname, '_print_tmp.zpl');
        fs.writeFileSync(tmpFile, zpl, 'utf8');
        exec(`${command} "${tmpFile}"`, (err) => {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            if (err) reject(err);
            else resolve(true);
        });
    });
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('JSON inválido')); }
        });
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // GET /status
    if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, printers: config.printers, default: config.default }));
    }

    // GET /printers
    if (req.method === 'GET' && req.url === '/printers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const list = Object.entries(config.printers).map(([name, cfg]) => ({ name, ...cfg }));
        return res.end(JSON.stringify(list));
    }

    // POST /print
    if (req.method === 'POST' && req.url === '/print') {
        try {
            const { zpl, printer } = await parseBody(req);
            if (!zpl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Campo "zpl" obrigatório' }));
            }
            const printerName = printer || config.default;
            const printerConfig = config.printers[printerName];
            if (!printerConfig) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: `Impressora "${printerName}" não encontrada` }));
            }

            if (printerConfig.type === 'tcp') {
                await sendZplTcp(printerConfig.host, printerConfig.port, zpl);
            } else if (printerConfig.type === 'usb') {
                await sendZplUsb(printerConfig.command, zpl);
            }

            console.log(`✅ Enviado para ${printerName} (${printerConfig.type === 'tcp' ? printerConfig.host + ':' + printerConfig.port : 'USB'})`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, printer: printerName }));
        } catch (e) {
            console.error('❌ Erro ao imprimir:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(config.port, () => {
    console.log('');
    console.log('🖨️  ==========================================');
    console.log('   Print Server — Expedição Inteligente');
    console.log('   ==========================================');
    console.log(`   Rodando em: http://localhost:${config.port}`);
    console.log(`   Impressoras: ${Object.keys(config.printers).join(', ')}`);
    console.log(`   Padrão: ${config.default}`);
    console.log('');
    console.log('   POST /print  { "zpl": "...", "printer": "zd230" }');
    console.log('   GET  /status');
    console.log('   ==========================================');
    console.log('');
});
