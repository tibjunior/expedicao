# Fase 1 — Upload, Separação e Impressão de Etiquetas de Envio

## Visão Geral

O sistema atual recebe etiquetas via API do Tiny (que falha para a maioria dos pedidos — retorna 400). A Fase 1 permite que o operador faça upload de etiquetas de envio (PDF ou ZPL) já baixadas dos marketplaces, o sistema separa por pedido, e imprime na térmica Zebra quando a bipagem é concluída.

**Impressoras:**
- Zebra ZD230 via rede (`192.168.1.210:9100`)
- Zebra ZD220 via USB (fallback browser print)

**Dimensão da etiqueta:** 100mm (largura) × 150mm (altura)

---

## 1. Banco de Dados — Nova tabela `etiquetas`

### 1.1 IndexedDB (modo local)

Bump `dbVersion` de `2` para `3`. Adicionar novo object store:

```
etiquetas: {
    id              INTEGER PRIMARY KEY AUTOINCREMENT
    despachante_id  INTEGER (índice)  — vincula ao despacho ativo
    ec              TEXT              — número do pedido (chave de matching)
    tipo            TEXT              — 'pdf' ou 'zpl'
    conteudo        TEXT              — base64 da página PDF ou texto ZPL cru
    arquivo_origem  TEXT              — nome do arquivo original
    data_upload     TEXT              — timestamp ISO 8601
    impressa        INTEGER           — 0 ou 1
}
```

Índices:
- `despachante_id` (para buscas por despacho)
- `ec` (para buscas por pedido)
- Compound: `(despachante_id, ec)` (único — 1 etiqueta por pedido por despacho)

### 1.2 SQLite (modo remoto — api.php)

Tabela equivalente:

```sql
CREATE TABLE IF NOT EXISTS etiquetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    despachante_id INTEGER NOT NULL,
    ec TEXT,
    tipo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    arquivo_origem TEXT DEFAULT '',
    data_upload TEXT NOT NULL,
    impressa INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_etiquetas_despachante ON etiquetas(despachante_id);
CREATE INDEX IF NOT EXISTS idx_etiquetas_ec ON etiquetas(ec);
CREATE UNIQUE INDEX IF NOT EXISTS idx_etiquetas_desp_ec ON etiquetas(despachante_id, ec);
```

### 1.3 Métodos ExpedicaoDB

Adicionar à classe `ExpedicaoDB` em `app.js`:

```javascript
// === Etiquetas ===
addEtiqueta(despachanteId, ec, tipo, conteudo, arquivoOrigem)
getEtiquetasByDespachante(despachanteId)
getEtiquetaByEc(despachanteId, ec)
marcarEtiquetaImpressa(id)
deleteEtiqueta(id)
deleteAllEtiquetas(despachanteId)
```

Cada método deve suportar tanto IndexedDB (local) quanto `apiPost`/`apiGet` (remoto), seguindo o padrão já existente na classe.

---

## 2. Novo arquivo: `label-upload.js` (~400 linhas)

### 2.1 Upload e splitting de PDF

- Cada página do PDF = 1 etiqueta (padrão de mercado)
- Usa `pdf.js` (já carregado via CDN) para extrair texto de cada página
- Converte cada página para base64
- Tenta extrair o `ec` (número do pedido) com regex flexível

**Regex de extração por plataforma:**

```javascript
const EC_PATTERNS = [
    // Mercado Livre
    /Pedido\s*(\d[\d\-\.]+)/i,
    /(\d{3}-\d{7,}-\d+)/,
    // Shopee
    /No\.\s*Pedido[:\s]*(\d[\d\-]+)/i,
    /SHP[\-]?\d[\d\-]+/i,
    // Amazon
    /Order\s*#?(\d[\d\-]+)/i,
    /(\d{3}-\d{7}-\d{7})/,
    // TikTok
    /TTS[\-]?\d[\d\-]+/i,
    // Magalu
    /Pedido[:\s]*(\d+)/i,
    // Genérico (formato Tiny)
    /(\d{3}-\d{6,}-\d+)/,
    // Fallback: qualquer sequência que pareça número de pedido
    /(?:PED|PEDIDO|ORDER|Nº)[\s:]*([A-Z0-9\-]{5,})/i
];
```

**Fluxo:**
```
PDF recebido
  → pdf.js.getDocument(arrayBuffer)
  → Para cada página (1..N):
      → getPage(i).getTextContent()
      → Extrair texto completo da página
      → Executar EC_PATTERNS para encontrar o ec
      → Converter página para base64 (via canvas → toDataURL)
      → Salvar: { despachante_id, ec, tipo:'pdf', conteudo:base64, arquivo_origem }
```

### 2.2 Upload e splitting de ZPL

- Divide o texto por marcadores `^XA`...`^XZ`
- Cada bloco = 1 etiqueta
- Extrai `ec` dos campos `^FD` ou regex no conteúdo
- Salva como texto cru

**Fluxo:**
```
ZPL recebido
  → Dividir por regex: /\^XA[\s\S]*?\^XZ/g
  → Para cada bloco:
      → Extrair ec via EC_PATTERNS no conteúdo do bloco
      → Salvar: { despachante_id, ec, tipo:'zpl', conteudo:bloco, arquivo_origem }
```

### 2.3 Matching automático + manual

**Automático:**
- Compara `ec` extraído com `state.items` do despachante ativo
- Se encontrar correspondência → vincula automaticamente
- Atualiza a UI com resultado

**Manual (quando automático falha):**
- Etiqueta fica "órfã" (ec = null ou sem match)
- UI mostra a etiqueta + dropdown com todos os `ec` únicos do despachante ativo
- Operador seleciona o pedido correto e clica "Vincular"
- Salva o vínculo no IndexedDB

### 2.4 Preview e ações

- Miniatura da etiqueta (primeira página em miniatura ou trecho ZPL)
- Ações por etiqueta:
  - **Imprimir** — envia para a impressora
  - **Desvincular** — remove o vínculo com o pedido (volta a ser órfã)
  - **Remover** — deleta a etiqueta do banco

### 2.5 Resumo visual

```
✅ 12 vinculadas | ⚠️ 3 órfãs | 🖨️ 8 impressas
```

---

## 3. Mudanças em `app.js`

### 3.1 Modificar `procesarPedidoCompletado()` (linha ~4910)

```javascript
// FLUXO ATUAL:
async function procesarPedidoCompletado(ec, cnpj, itemActivador) {
    // ... validações ...
    const res = await solicitarEtiquetaTiny(ec, cnpj);
    // ...
}

// FLUXO NOVO:
async function procesarPedidoCompletado(ec, cnpj, itemActivador) {
    // ... validações ...
    
    // 1. Buscar etiqueta local primeiro
    const etiquetaLocal = await buscarEtiquetaLocal(ec, state.activeDespachanteId);
    if (etiquetaLocal && etiquetaLocal.ok) {
        await marcarGrupoPedidoExpedido(ec);
        await imprimirEtiquetaArmazenada(etiquetaLocal.etiqueta);
        return etiquetaLocal;
    }
    
    // 2. Fallback: API Tiny
    const res = await solicitarEtiquetaTiny(ec, cnpj);
    // ... resto do fluxo existente ...
}
```

### 3.2 Nova função `buscarEtiquetaLocal(ec, despachanteId)`

```javascript
async function buscarEtiquetaLocal(ec, despachanteId) {
    if (!ec || !despachanteId) return null;
    try {
        const etiqueta = await db.getEtiquetaByEc(despachanteId, ec);
        if (etiqueta) {
            return { ok: true, etiqueta, local: true };
        }
    } catch (e) {
        console.error('Erro ao buscar etiqueta local:', e);
    }
    return null;
}
```

### 3.3 Nova função `imprimirEtiquetaArmazenada(etiqueta)`

```javascript
async function imprimirEtiquetaArmazenada(etiqueta) {
    if (!etiqueta) return;
    
    const autoPrint = localStorage.getItem('expedicao_tiny_auto_imprimir') === '1';
    
    if (etiqueta.tipo === 'pdf') {
        // PDF: decodifica base64 → Blob → popup window
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; background: #fff; }
                    @page { size: 100mm 150mm; margin: 3mm; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        iframe { border: none; width: 100mm; height: 150mm; }
                    }
                </style>
            </head>
            <body>
                <iframe src="data:application/pdf;base64,${etiqueta.conteudo}" 
                        style="width:100mm; height:150mm; border:none;"></iframe>
                <script>
                    window.onload = function() { 
                        setTimeout(function() { window.print(); }, 500); 
                    };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
        
    } else if (etiqueta.tipo === 'zpl') {
        // ZPL: tentar print server primeiro, fallback para browser
        try {
            const response = await fetch('http://localhost:9200/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    zpl: etiqueta.conteudo,
                    printer: localStorage.getItem('expedicao_printer') || 'zd230'
                })
            });
            if (response.ok) {
                await db.marcarEtiquetaImpressa(etiqueta.id);
                return;
            }
        } catch (e) {
            console.warn('Print server indisponível, usando fallback browser:', e);
        }
        
        // Fallback: abrir ZPL em janela (preview)
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Courier New', monospace; font-size: 10px; 
                           white-space: pre; padding: 10px; background: #fff; }
                    @page { size: 100mm 150mm; margin: 3mm; }
                </style>
            </head>
            <body>
                <pre>${escHtml(etiqueta.conteudo)}</pre>
                <script>
                    window.onload = function() { window.print(); };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
    
    // Marcar como impressa
    await db.marcarEtiquetaImpressa(etiqueta.id);
}
```

### 3.4 Bump dbVersion

Na classe `ExpedicaoDB`, mudar `this.dbVersion = 2` para `this.dbVersion = 3` e adicionar a criação do object store `etiquetas` no `onupgradeneeded`:

```javascript
// Tabela Etiquetas
if (!db.objectStoreNames.contains('etiquetas')) {
    const etiquetasStore = db.createObjectStore('etiquetas', { 
        keyPath: 'id', autoIncrement: true 
    });
    etiquetasStore.createIndex('despachante_id', 'despachante_id', { unique: false });
    etiquetasStore.createIndex('ec', 'ec', { unique: false });
}
```

---

## 4. Mudanças em `api.php`

### 4.1 Nova tabela (no bloco de criação de tabelas)

```php
$db->exec("CREATE TABLE IF NOT EXISTS etiquetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    despachante_id INTEGER NOT NULL,
    ec TEXT,
    tipo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    arquivo_origem TEXT DEFAULT '',
    data_upload TEXT NOT NULL,
    impressa INTEGER DEFAULT 0
)");
```

### 4.2 Novos endpoints no switch

```php
case 'upload_etiqueta':
    // POST — recebe etiqueta e salva
    $input = json_decode(file_get_contents('php://input'), true);
    $despachante_id = intval($input['despachante_id'] ?? 0);
    $ec = sanitize($input['ec'] ?? '');
    $tipo = sanitize($input['tipo'] ?? 'pdf');
    $conteudo = $input['conteudo'] ?? '';
    $arquivo_origem = sanitize($input['arquivo_origem'] ?? '');
    
    $stmt = $db->prepare("INSERT INTO etiquetas 
        (despachante_id, ec, tipo, conteudo, arquivo_origem, data_upload, impressa) 
        VALUES (?, ?, ?, ?, ?, ?, 0)");
    $stmt->execute([$despachante_id, $ec, $tipo, $conteudo, $arquivo_origem, date('c')]);
    echo json_encode(["status" => "ok", "id" => $db->lastInsertId()]);
    break;

case 'get_etiquetas':
    // GET — lista por despachante_id
    $despachante_id = intval($_GET['despachante_id'] ?? 0);
    $stmt = $db->prepare("SELECT id, despachante_id, ec, tipo, arquivo_origem, 
        data_upload, impressa FROM etiquetas WHERE despachante_id = ? ORDER BY id");
    $stmt->execute([$despachante_id]);
    echo json_encode($stmt->fetchAll());
    break;

case 'get_etiqueta_conteudo':
    // GET — retorna conteúdo de uma etiqueta específica
    $id = intval($_GET['id'] ?? 0);
    $stmt = $db->prepare("SELECT * FROM etiquetas WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode($stmt->fetch());
    break;

case 'marcar_etiqueta_impressa':
    // POST — marca como impressa
    $input = json_decode(file_get_contents('php://input'), true);
    $id = intval($input['id'] ?? 0);
    $stmt = $db->prepare("UPDATE etiquetas SET impressa = 1 WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(["status" => "ok"]);
    break;

case 'delete_etiqueta':
    // POST — remove uma etiqueta
    $input = json_decode(file_get_contents('php://input'), true);
    $id = intval($input['id'] ?? 0);
    $stmt = $db->prepare("DELETE FROM etiquetas WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(["status" => "ok"]);
    break;

case 'delete_all_etiquetas':
    // POST — limpa todas de um despachante
    $input = json_decode(file_get_contents('php://input'), true);
    $despachante_id = intval($input['despachante_id'] ?? 0);
    $stmt = $db->prepare("DELETE FROM etiquetas WHERE despachante_id = ?");
    $stmt->execute([$despachante_id]);
    echo json_encode(["status" => "ok"]);
    break;
```

### 4.3 Migration (coluna `etiquetas`)

Adicionar verificação de colunas existentes (mesmo padrão usado para `cnpj` em despachantes):

```php
// Migração: cria tabela etiquetas se não existir (banco antigo)
try {
    $db->exec("CREATE TABLE IF NOT EXISTS etiquetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despachante_id INTEGER NOT NULL,
        ec TEXT,
        tipo TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        arquivo_origem TEXT DEFAULT '',
        data_upload TEXT NOT NULL,
        impressa INTEGER DEFAULT 0
    )");
} catch (PDOException $e) {
    error_log('Falha ao criar tabela etiquetas: ' . $e->getMessage());
}
```

---

## 5. UI — `index.html` + `index.css`

### 5.1 HTML — Nova seção no card de importação

Inserir após a área de upload de PDF (`#pdf-file-input`) e antes do botão de teste:

```html
<!-- Upload de Etiquetas de Envio -->
<div class="card glass-card shadow-lg" id="etiquetas-upload-card" style="margin-top: 16px; padding: 20px; display: none;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <span style="font-size: 20px;">🏷️</span>
        <h2 class="card-title" style="margin: 0; font-size: 16px;">Etiquetas de Envio</h2>
    </div>
    
    <!-- Resumo -->
    <div id="etiquetas-summary" style="font-size: 13px; margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap;">
        <!-- Preenchido via JS -->
    </div>
    
    <!-- Área de upload -->
    <div class="drag-drop-area" id="label-drop-area" style="margin-bottom: 12px;">
        <span class="upload-icon">🏷️</span>
        <p class="upload-text">Arraste PDF ou ZPL de etiquetas aqui ou clique para selecionar</p>
        <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Aceita múltiplos arquivos (.pdf, .zpl)</p>
    </div>
    <input type="file" id="label-file-input" accept=".pdf,.zpl" multiple style="display: none;">
    
    <!-- Etiquetas Órfãs (sem matching automático) -->
    <div id="etiquetas-orphans-section" style="display: none;">
        <h3 style="font-size: 14px; color: var(--text-warning); margin: 12px 0 8px;">⚠️ Etiquetas sem pedido identificado</h3>
        <div id="etiquetas-orphans-list">
            <!-- Preenchido via JS: miniatura + dropdown + botão vincular -->
        </div>
    </div>
    
    <!-- Etiquetas Vinculadas -->
    <div id="etiquetas-linked-section" style="display: none;">
        <h3 style="font-size: 14px; color: var(--text-success); margin: 12px 0 8px;">✅ Etiquetas Vinculadas</h3>
        <div id="etiquetas-linked-list" style="max-height: 300px; overflow-y: auto;">
            <!-- Preenchido via JS -->
        </div>
    </div>
    
    <!-- Botões de ação -->
    <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button class="btn btn-danger-outline" id="btn-clear-etiquetas" style="font-size: 12px;">
            🗑️ Limpar Todas
        </button>
    </div>
</div>
```

### 5.2 JavaScript — Element bindings

Adicionar ao bloco de element bindings em `app.js`:

```javascript
elements.etiquetasUploadCard = document.getElementById('etiquetas-upload-card');
elements.labelDropArea = document.getElementById('label-drop-area');
elements.labelFileInput = document.getElementById('label-file-input');
elements.etiquetasSummary = document.getElementById('etiquetas-summary');
elements.etiquetasOrphansSection = document.getElementById('etiquetas-orphans-section');
elements.etiquetasOrphansList = document.getElementById('etiquetas-orphans-list');
elements.etiquetasLinkedSection = document.getElementById('etiquetas-linked-section');
elements.etiquetasLinkedList = document.getElementById('etiquetas-linked-list');
elements.btnClearEtiquetas = document.getElementById('btn-clear-etiquetas');
```

### 5.3 CSS — Estilos (em `index.css`)

```css
/* 8.20. UPLOAD DE ETIQUETAS DE ENVIO */
#etiquetas-upload-card {
    border-top: 2px solid var(--accent-color);
}

.etiqueta-thumb {
    width: 60px;
    height: 80px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-muted);
}

.etiqueta-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.etiqueta-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    margin-bottom: 6px;
    background: rgba(15, 23, 42, 0.3);
}

.etiqueta-item.orphans {
    border-color: var(--text-warning);
}

.etiqueta-item.linked {
    border-color: var(--text-success);
}

.etiqueta-item.impressed {
    opacity: 0.7;
}

.etiqueta-info {
    flex: 1;
    min-width: 0;
}

.etiqueta-ec {
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
}

.etiqueta-meta {
    font-size: 11px;
    color: var(--text-muted);
}

.etiqueta-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.etiqueta-actions button {
    padding: 3px 8px;
    font-size: 11px;
    height: auto;
}

.etiqueta-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}

.etiqueta-badge.linked {
    background: rgba(34, 197, 94, 0.15);
    color: var(--text-success);
}

.etiqueta-badge.orphan {
    background: rgba(234, 179, 8, 0.15);
    color: var(--text-warning);
}

.etiqueta-badge.impressed {
    background: rgba(99, 102, 241, 0.15);
    color: var(--accent-color);
}

/* Botão de impressão na tabela de itens */
.btn-print-etiqueta {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    opacity: 0.6;
    transition: opacity 0.2s;
}

.btn-print-etiqueta:hover {
    opacity: 1;
}

@media print {
    @page {
        size: 100mm 150mm;
        margin: 3mm;
    }
    body * {
        visibility: hidden;
    }
    .print-area, .print-area * {
        visibility: visible;
    }
    .print-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100mm;
        height: 150mm;
    }
}
```

---

## 6. Print Server Local — `print-server.js`

### 6.1 Servidor HTTP + TCP para Zebra

```javascript
/**
 * print-server.js — Servidor local de impressão para Zebra ZD230/ZD220
 * 
 * Uso: node print-server.js
 * 
 * Endpoints:
 *   POST /print         — Envia ZPL para a impressora
 *   GET  /status        — Verifica status do servidor e impressora
 *   POST /config        — Atualiza configuração da impressora
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

// Carrega configuração
let config = DEFAULT_CONFIG;
try {
    if (fs.existsSync(CONFIG_PATH)) {
        config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } else {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
} catch (e) {
    console.error('Erro ao carregar config, usando padrão:', e.message);
}

// Envia ZPL via TCP para Zebra
function sendZplTcp(host, port, zpl) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.connect(port, host, () => {
            client.write(zpl, 'utf8', () => {
                client.end();
                resolve(true);
            });
        });
        client.on('error', reject);
        client.setTimeout(5000, () => {
            client.destroy();
            reject(new Error('Timeout na conexão com a impressora'));
        });
    });
}

// Envia ZPL via USB (comando do sistema)
function sendZplUsb(command, zpl) {
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        // Salva ZPL temporário e imprima via comando do OS
        const tmpFile = path.join(__dirname, '_print_tmp.zpl');
        fs.writeFileSync(tmpFile, zpl, 'utf8');
        exec(`${command} "${tmpFile}"`, (err) => {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            if (err) reject(err);
            else resolve(true);
        });
    });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    // CORS headers
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
        return res.end(JSON.stringify({ 
            ok: true, 
            printers: config.printers,
            default: config.default 
        }));
    }

    // POST /print
    if (req.method === 'POST' && req.url === '/print') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { zpl, printer } = JSON.parse(body);
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
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, printer: printerName }));
            } catch (e) {
                console.error('Erro ao imprimir:', e.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(config.port, () => {
    console.log(`🖨️  Print server rodando em http://localhost:${config.port}`);
    console.log(`   Impressoras configuradas: ${Object.keys(config.printers).join(', ')}`);
    console.log(`   Impressora padrão: ${config.default}`);
});
```

### 6.2 Configuração — `print-config.json`

```json
{
    "printers": {
        "zd230": {
            "type": "tcp",
            "host": "192.168.1.210",
            "port": 9100
        },
        "zd220": {
            "type": "usb",
            "command": "print"
        }
    },
    "default": "zd230",
    "port": 9200
}
```

---

## 7. Script de Inicialização — `start-print-server.bat`

Para facilitar a inicialização no PC da produção:

```batch
@echo off
echo Iniciando Print Server para Zebra...
echo Pressione Ctrl+C para parar.
echo.
node print-server.js
pause
```

---

## 8. Integração com a Tabela de Bipagem

### 8.1 Botão de impressão por item

Na função `renderTable()` em `app.js`, adicionar ícone de impressão ao lado de itens que têm etiqueta vinculada:

```javascript
// Na renderização de cada linha da tabela
const temEtiqueta = state.etiquetasVinculadas && 
    state.etiquetasVinculadas.some(e => e.ec === item.ec);

const printBtn = temEtiqueta 
    ? `<button class="btn-print-etiqueta" data-ec="${escHtml(item.ec)}" 
         title="Imprimir etiqueta deste pedido">🖨️</button>` 
    : '';
```

### 8.2 Event listener para o botão

```javascript
// Delegação de eventos na tabela
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-print-etiqueta');
    if (btn) {
        const ec = btn.getAttribute('data-ec');
        imprimirEtiquetaPorEc(ec);
    }
});

async function imprimirEtiquetaPorEc(ec) {
    if (!ec || !state.activeDespachanteId) return;
    const etiqueta = await db.getEtiquetaByEc(state.activeDespachanteId, ec);
    if (etiqueta) {
        await imprimirEtiquetaArmazenada(etiqueta);
    } else {
        showToast('Sem Etiqueta', `Nenhuma etiqueta vinculada ao pedido ${ec}.`, 'warning');
    }
}
```

---

## 9. Ordem de Implementação

| # | Tarefa | Arquivos | Dependências |
|---|--------|----------|--------------|
| 1 | Bump dbVersion + object store `etiquetas` | `app.js` | Nenhuma |
| 2 | Métodos CRUD de etiquetas na ExpedicaoDB | `app.js` | #1 |
| 3 | Tabela SQLite + endpoints em api.php | `api.php` | Nenhuma |
| 4 | Criar `label-upload.js` (upload, splitting, matching) | `label-upload.js` | #1, #2 |
| 5 | UI de upload de etiquetas | `index.html`, `index.css` | #4 |
| 6 | Integrar `buscarEtiquetaLocal()` no fluxo de bipagem | `app.js` | #2, #4 |
| 7 | Botão de impressão na tabela de itens | `app.js` | #6 |
| 8 | Criar `print-server.js` + `print-config.json` | `print-server.js`, `print-config.json` | Nenhuma |
| 9 | Criar `start-print-server.bat` | `start-print-server.bat` | #8 |
| 10 | Teste com etiquetas reais | Todos | Todos |

---

## 10. Fluxo Completo (Happy Path)

```
1. Operador cadastra impressoras nas Configurações (Nome + IP/Porta)
2. Operador cria despachante (nome + prazo + loja)
3. Operador faz upload do PDF de vendas → itens são importados
4. Operador baixa etiquetas do marketplace (PDF ou ZPL)
5. Operador faz upload das etiquetas na seção "Etiquetas de Envio"
6. Sistema separa por página/bloco, extrai ec, vincula aos pedidos automaticamente
7. Etiquetas sem matching → dropdown para vinculação manual
8. Operador bipe os produtos (fluxo normal)
9. Quando o último produto de um pedido é bipado:
   a. Sistema busca etiqueta local → encontrou → imprime na impressora configurada
   b. Se não encontrou →Toast de erro: "Faça upload das etiquetas antes de expedir"
10. Operador pode re-imprimir a qualquer momento via ícone 🖨️ na tabela
```

**Nota:** A API do Tiny não é mais utilizada para etiquetas. O sistema funciona exclusivamente com upload manual de etiquetas.

---

## 11. Tratamento de Erros

| Erro | Ação |
|------|------|
| PDF vazio / sem páginas | Toast de erro: "Nenhuma etiqueta encontrada no arquivo" |
| ZPL inválido (sem `^XA`/`^XZ`) | Toast: "Arquivo ZPL inválido" |
| Não conseguiu extrair ec | Etiqueta fica órfã → dropdown manual |
| Print server indisponível | Fallback para browser print |
| Impressora offline | Toast de erro + etiqueta fica na fila |
| Ec duplicado no despachante | Último upload sobrescreve (ou alerta) |
| Arquivo não é PDF nem ZPL | Toast: "Formato não suportado. Use .pdf ou .zpl" |

---

## 12. Compatibilidade

- **Navegadores**: Chrome, Edge, Firefox (pdf.js funciona em todos)
- **Modo local**: IndexedDB (funciona sem servidor)
- **Modo remoto**: SQLite via api.php (HostGator)
- **Print server**: Node.js 14+ (Windows/Linux)
- **Impressoras**: Zebra ZD230 (TCP/IP), Zebra ZD220 (USB), qualquer impressora configurada no OS (browser print)

---

## 13. Alterações Implementadas

### 13.1 Removido: Fallback Tiny API
- A função `procesarPedidoCompletado()` não chama mais `solicitarEtiquetaTiny()`
- Se não houver etiqueta local, mostra toast de erro orientando o operador a fazer upload
- A API do Tiny continua disponível para outros usos, mas não para etiquetas

### 13.2 Adicionado: Gerenciamento de Impressoras
- Seção "🖨️ Impressoras" no popup de Configurações
- Cadastro de impressoras com nome, tipo (TCP/USB), IP e porta
- Definição de impressora padrão
- Remoção de impressoras
- Configuração persistida em `localStorage`

### 13.3 Adicionado: Busca de Etiquetas Antes da Expedição
- Ao selecionar despachante, o sistema carrega e exibe status das etiquetas
- Função `buscarEtiquetasParaDespachante()` verifica quais pedidos têm etiqueta
- UI mostra resumo: ✅ vinculadas, ⚠️ órfãs, 🖨️ impressas
- Dropdown manual para vincular etiquetas órfãs a pedidos

### 13.4 Arquivos Criados/Modificados
| Arquivo | Ação |
|---------|------|
| `app.js` | Modificado — DB v3, métodos etiquetas, remover fallback Tiny, impressão local |
| `label-upload.js` | **Criado** — Upload, splitting PDF/ZPL, matching, UI |
| `index.html` | Modificado — UI upload etiquetas, seção impressoras |
| `index.css` | Modificado — Estilos para etiquetas |
| `PLANO_ETIQUETAS.md` | Modificado — Documentação atualizada |
