/**
 * label-upload.js — Upload, splitting e matching de etiquetas de envio
 * Suporta PDF (multi-página) e ZPL (multi-bloco).
 * Cada etiqueta é vinculada a um pedido (ec) via extração automática ou manual.
 */

// Regex para extração de ec (número do pedido) de various plataformas
const EC_PATTERNS = [
    /Pedido\s*(\d[\d\-\.]+)/i,
    /(\d{3}-\d{7}-\d{7})/,
    /(\d{3}-\d{7,}-\d+)/,
    /No\.\s*Pedido[:\s]*(\d[\d\-]+)/i,
    /Order\s*#?\s*ID[:\s]*(\d[\d\-]+)/i,
    /Order\s*#?(\d[\d\-]+)/i,
    /(?:PED|PEDIDO|ORDER|Nº|N°)[\s:]*([A-Z0-9\-]{5,})/i,
    /SHP[\-]?\d[\d\-]+/i,
    /TTS[\-]?\d[\d\-]+/i
];

// Decodifica texto hex-encoded do modo ^FH da Zebra (_4F_72... -> "Or...")
function decodificarHexZpl(texto) {
    if (!texto) return '';
    return texto.replace(/\\&/g, ' ').replace(/_([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

// Normaliza ec para comparação (remove espaços, traços e pontos)
function normalizarEc(ec) {
    return String(ec || '').trim().replace(/[\s\-\.]/g, '').toUpperCase();
}

function extrairEcDeTexto(texto) {
    if (!texto) return null;
    const candidatos = [texto];
    const decodificado = decodificarHexZpl(texto);
    if (decodificado !== texto) candidatos.push(decodificado);

    for (const candidato of candidatos) {
        for (const pattern of EC_PATTERNS) {
            const match = candidato.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
    }
    return null;
}

// Estado global do módulo de etiquetas
let labelUploadState = {
    etiquetas: [],
    orfas: [],
    vinculadas: [],
    despachanteId: null
};

// Inicializa o módulo de upload de etiquetas
function initLabelUpload() {
    const dropArea = document.getElementById('label-drop-area');
    const fileInput = document.getElementById('label-file-input');
    const btnClear = document.getElementById('btn-clear-etiquetas');

    if (!dropArea || !fileInput) return;

    // Drag and drop
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('highlight');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('highlight'));
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('highlight');
        handleLabelFiles(e.dataTransfer.files);
    });
    dropArea.addEventListener('click', () => {
        if (!fileInput.disabled) fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleLabelFiles(e.target.files);
    });

    if (btnClear) {
        btnClear.addEventListener('click', async () => {
            if (!state.activeDespachanteId) return;
            if (!confirm('Remover todas as etiquetas deste despachante?')) return;
            await db.deleteAllEtiquetas(state.activeDespachanteId);
            await refreshLabelUploadState();
            showToast('Etiquetas Removidas', 'Todas as etiquetas foram removidas.', 'success');
        });
    }
}

// Processa arquivos recebidos (PDF ou ZPL)
async function handleLabelFiles(files) {
    if (!state.activeDespachanteId) {
        showToast('Selecionar Despachante', 'Selecione um despachante antes de carregar etiquetas.', 'error');
        return;
    }

    let totalImportadas = 0;
    let totalOrfas = 0;

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') {
            const result = await processarPdfEtiquetas(file);
            totalImportadas += result.total;
            totalOrfas += result.orfas;
        } else if (ext === 'zpl') {
            const result = await processarZplEtiquetas(file);
            totalImportadas += result.total;
            totalOrfas += result.orfas;
        } else {
            showToast('Formato Inválido', `Arquivo "${file.name}" não é PDF nem ZPL.`, 'error');
        }
    }

    await refreshLabelUploadState();

    if (totalImportadas > 0) {
        const msg = totalOrfas > 0
            ? `${totalImportadas} etiqueta(s) importada(s). ${totalOrfas} sem pedido identificado (vincule manualmente).`
            : `${totalImportadas} etiqueta(s) importada(s) e vinculadas.`;
        showToast('Etiquetas Importadas', msg, totalOrfas > 0 ? 'warning' : 'success');
    }
}

// Processa PDF de etiquetas — cada página = 1 etiqueta
async function processarPdfEtiquetas(file) {
    const pdfParser = new PdfParser();
    const reader = new FileReader();
    let total = 0, orfas = 0;

    return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const itens = state.items || [];
                const ecsDespachante = new Set(itens.map(i => normalizarEc(i.ec)).filter(ec => ec && ec !== 'SEMPEDIDO'));

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const fullText = textContent.items.map(item => item.str).join(' ');

                    const ec = extrairEcDeTexto(fullText);
                    const ecNorm = ec ? normalizarEc(ec) : null;
                    const itemMatch = ecNorm ? itens.find(i => normalizarEc(i.ec) === ecNorm) : null;
                    const isEcValido = !!itemMatch;

                    // Converte página para base64
                    const canvas = document.createElement('canvas');
                    const viewport = page.getViewport({ scale: 0.5 });
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

                    await db.addEtiqueta(
                        state.activeDespachanteId,
                        isEcValido ? String(itemMatch.ec).trim() : '',
                        'pdf',
                        base64,
                        file.name
                    );
                    total++;
                    if (!isEcValido) orfas++;
                }
                resolve({ total, orfas });
            } catch (err) {
                console.error('Erro ao processar PDF de etiquetas:', err);
                showToast('Erro PDF', `Falha ao processar "${file.name}": ${err.message}`, 'error');
                resolve({ total: 0, orfas: 0 });
            }
        };
        reader.onerror = () => {
            showToast('Erro de Leitura', `Não foi possível ler "${file.name}".`, 'error');
            resolve({ total: 0, orfas: 0 });
        };
        reader.readAsArrayBuffer(file);
    });
}

// Processa ZPL de etiquetas — cada bloco ^XA...^XZ = 1 etiqueta
async function processarZplEtiquetas(file) {
    const reader = new FileReader();
    let total = 0, orfas = 0;

    return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
            try {
                const texto = e.target.result;
                const blocos = texto.match(/\^XA[\s\S]*?\^XZ/g);
                if (!blocos || blocos.length === 0) {
                    showToast('ZPL Inválido', `Nenhum bloco de etiqueta encontrado em "${file.name}".`, 'error');
                    resolve({ total: 0, orfas: 0 });
                    return;
                }

                const itens = state.items || [];
                const ecsDespachante = new Set(itens.map(i => normalizarEc(i.ec)).filter(ec => ec && ec !== 'SEMPEDIDO'));

                for (const bloco of blocos) {
                    const ec = extrairEcDeTexto(bloco);
                    const ecNorm = ec ? normalizarEc(ec) : null;
                    const itemMatch = ecNorm ? itens.find(i => normalizarEc(i.ec) === ecNorm) : null;
                    const isEcValido = !!itemMatch;

                    await db.addEtiqueta(
                        state.activeDespachanteId,
                        isEcValido ? String(itemMatch.ec).trim() : '',
                        'zpl',
                        bloco,
                        file.name
                    );
                    total++;
                    if (!isEcValido) orfas++;
                }
                resolve({ total, orfas });
            } catch (err) {
                console.error('Erro ao processar ZPL:', err);
                showToast('Erro ZPL', `Falha ao processar "${file.name}": ${err.message}`, 'error');
                resolve({ total: 0, orfas: 0 });
            }
        };
        reader.onerror = () => {
            showToast('Erro de Leitura', `Não foi possível ler "${file.name}".`, 'error');
            resolve({ total: 0, orfas: 0 });
        };
        reader.readAsText(file);
    });
}

// Atualiza o estado e renderiza a UI de etiquetas
async function refreshLabelUploadState() {
    if (!state.activeDespachanteId) {
        hideLabelUploadUI();
        return;
    }
    try {
        const etiquetas = await db.getEtiquetasByDespachante(state.activeDespachanteId);
        const itens = state.items || [];
        const ecsDespachante = new Set(itens.map(i => normalizarEc(i.ec)).filter(ec => ec && ec !== 'SEMPEDIDO'));

        labelUploadState.etiquetas = etiquetas || [];
        labelUploadState.despachanteId = state.activeDespachanteId;
        labelUploadState.vinculadas = (etiquetas || []).filter(e => e.ec && ecsDespachante.has(normalizarEc(e.ec)));
        labelUploadState.orfas = (etiquetas || []).filter(e => !e.ec || !ecsDespachante.has(normalizarEc(e.ec)));

        renderLabelUploadSummary();
        renderLabelOrphans();
        renderLabelLinked();
        showLabelUploadUI();
    } catch (e) {
        console.warn('Erro ao carregar etiquetas (ignorado):', e.message);
        hideLabelUploadUI();
    }
}

function showLabelUploadUI() {
    const card = document.getElementById('etiquetas-upload-card');
    const fileInput = document.getElementById('label-file-input');
    if (card) card.style.display = 'block';
    if (fileInput) fileInput.disabled = false;
}

function hideLabelUploadUI() {
    const card = document.getElementById('etiquetas-upload-card');
    if (card) card.style.display = 'none';
}

function renderLabelUploadSummary() {
    const el = document.getElementById('etiquetas-summary');
    if (!el) return;
    const v = labelUploadState.vinculadas.length;
    const o = labelUploadState.orfas.length;
    const imp = labelUploadState.etiquetas.filter(e => e.impressa).length;
    el.innerHTML = `
        <span class="etiqueta-badge linked">✅ ${v} vinculada${v !== 1 ? 's' : ''}</span>
        ${o > 0 ? `<span class="etiqueta-badge orphan">⚠️ ${o} órfã${o !== 1 ? 's' : ''}</span>` : ''}
        ${imp > 0 ? `<span class="etiqueta-badge impressed">🖨️ ${imp} impressa${imp !== 1 ? 's' : ''}</span>` : ''}
    `;
}

function renderLabelOrphans() {
    const section = document.getElementById('etiquetas-orphans-section');
    const list = document.getElementById('etiquetas-orphans-list');
    if (!section || !list) return;

    if (labelUploadState.orfas.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const itens = state.items || [];
    const ecsDespachante = [...new Set(itens.map(i => String(i.ec).trim()).filter(ec => ec && ec !== 'Sem Pedido'))];

    list.innerHTML = labelUploadState.orfas.map(et => {
        const preview = et.tipo === 'pdf'
            ? `<img src="data:image/jpeg;base64,${et.conteudo}" class="etiqueta-thumb" alt="Etiqueta">`
            : `<div class="etiqueta-thumb" style="font-size:8px;overflow:hidden;white-space:nowrap;padding:4px;">${escHtml((et.conteudo || '').substring(0, 60))}...</div>`;

        const optionsHtml = ecsDespachante.map(ec =>
            `<option value="${escHtml(ec)}">${escHtml(ec)}</option>`
        ).join('');
        return `<div class="etiqueta-item orphans" data-id="${et.id}">
            ${preview}
            <div class="etiqueta-info">
                <div class="etiqueta-meta">${escHtml(et.arquivo_origem)} • ${et.tipo.toUpperCase()}</div>
                <div style="margin-top:4px;display:flex;gap:4px;align-items:center;">
                    <select class="input-despachante orphan-select" data-id="${et.id}" style="font-size:11px;padding:4px 6px;flex:1;">
                        <option value="">-- Selecionar pedido --</option>
                        ${optionsHtml}
                    </select>
                    <button class="btn btn-primary btn-vincular-orphan" data-id="${et.id}" style="padding:4px 8px;font-size:11px;height:auto;">Vincular</button>
                </div>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.btn-vincular-orphan').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const select = list.querySelector(`.orphan-select[data-id="${id}"]`);
            const ec = select ? select.value : '';
            if (!ec) { showToast('Selecionar Pedido', 'Selecione um pedido para vincular.', 'error'); return; }
            const etiqueta = labelUploadState.etiquetas.find(e => e.id === id);
            if (etiqueta) {
                etiqueta.ec = ec;
                await db.updateEtiquetaEc(id, ec);
                await refreshLabelUploadState();
                showToast('Vinculada', `Etiqueta vinculada ao pedido ${ec}.`, 'success');
            }
        });
    });
}

function renderLabelLinked() {
    const section = document.getElementById('etiquetas-linked-section');
    const list = document.getElementById('etiquetas-linked-list');
    if (!section || !list) return;

    if (labelUploadState.vinculadas.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    list.innerHTML = labelUploadState.vinculadas.map(et => {
        const preview = et.tipo === 'pdf'
            ? `<img src="data:image/jpeg;base64,${et.conteudo}" class="etiqueta-thumb" alt="Etiqueta">`
            : `<div class="etiqueta-thumb" style="font-size:8px;overflow:hidden;white-space:nowrap;padding:4px;">${escHtml((et.conteudo || '').substring(0, 60))}...</div>`;
        const impBadge = et.impressa ? '<span class="etiqueta-badge impressed" style="margin-left:6px;">🖨️</span>' : '';

        return `<div class="etiqueta-item linked ${et.impressa ? 'impressed' : ''}" data-id="${et.id}">
            ${preview}
            <div class="etiqueta-info">
                <div class="etiqueta-ec">${escHtml(et.ec)}${impBadge}</div>
                <div class="etiqueta-meta">${escHtml(et.arquivo_origem)} • ${et.tipo.toUpperCase()}</div>
            </div>
            <div class="etiqueta-actions">
                <button class="btn btn-outline btn-print-label" data-id="${et.id}" title="Imprimir">🖨️</button>
                <button class="btn btn-danger-outline btn-delete-label" data-id="${et.id}" title="Remover">✕</button>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.btn-print-label').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const etiqueta = labelUploadState.etiquetas.find(e => e.id === id);
            if (etiqueta) await imprimirEtiquetaArmazenada(etiqueta);
        });
    });

    list.querySelectorAll('.btn-delete-label').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            if (confirm('Remover esta etiqueta?')) {
                await db.deleteEtiqueta(id);
                await refreshLabelUploadState();
                showToast('Etiqueta Removida', 'Etiqueta removida com sucesso.', 'success');
            }
        });
    });
}

// Expõe funções globais
window.initLabelUpload = initLabelUpload;
window.refreshLabelUploadState = refreshLabelUploadState;
window.handleLabelFiles = handleLabelFiles;
