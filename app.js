/**
 * Lógica principal da aplicação de expedição.
 * Controla o estado, interface, LocalStorage, scanner e áudio.
 */

// Instancia o parser
const parser = new PdfParser();

// ==========================================
// BANCO DE DADOS LOCAL (INDEXEDDB RELACIONAL)
// ==========================================
class ExpedicaoDB {
    constructor() {
        this.dbName = 'ExpedicaoWMS';
        this.dbVersion = 1;
        this.db = null;
        // Detecta se está em localhost ou abrindo o arquivo direto
        this.isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    }

    async open() {
        if (!this.isLocal) {
            console.log("Conectado ao Banco SQLite Remoto via api.php");
            return true;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (e) => {
                console.error('Erro ao abrir IndexedDB:', e);
                reject(e);
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Tabela Despachantes
                if (!db.objectStoreNames.contains('despachantes')) {
                    const despachantesStore = db.createObjectStore('despachantes', { keyPath: 'id', autoIncrement: true });
                    despachantesStore.createIndex('nome', 'nome', { unique: false });
                    despachantesStore.createIndex('concluido', 'concluido', { unique: false });
                }

                // Tabela Itens
                if (!db.objectStoreNames.contains('itens')) {
                    const itensStore = db.createObjectStore('itens', { keyPath: 'id', autoIncrement: true });
                    itensStore.createIndex('despachante_id', 'despachante_id', { unique: false });
                }

                // Tabela Logs
                if (!db.objectStoreNames.contains('logs')) {
                    const logsStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    logsStore.createIndex('despachante_id', 'despachante_id', { unique: false });
                }
            };
        });
    }

    async apiPost(action, data) {
        const response = await fetch(`api.php?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error(`Erro na API (${action}): ${response.statusText}`);
        }
        return await response.json();
    }

    async apiGet(action, params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        const url = `api.php?action=${action}${queryParams ? '&' + queryParams : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na API (${action}): ${response.statusText}`);
        }
        return await response.json();
    }

    addDespachante(nome, dataLimite) {
        if (!this.isLocal) {
            return this.apiPost('add_despachante', { nome, data_limite: dataLimite })
                .then(res => parseInt(res.id, 10));
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes'], 'readwrite');
            const store = transaction.objectStore('despachantes');
            const despachante = {
                nome: nome,
                data_criacao: new Date().toISOString(),
                data_limite: dataLimite || '',
                concluido: 0
            };
            const request = store.add(despachante);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }

    getDespachante(id) {
        if (!this.isLocal) {
            return this.apiGet('get_despachante', { id })
                .then(d => {
                    if (d) {
                        d.id = parseInt(d.id, 10);
                        d.concluido = parseInt(d.concluido, 10);
                    }
                    return d;
                });
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes'], 'readonly');
            const store = transaction.objectStore('despachantes');
            const request = store.get(id);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }

    getDespachantesAtivos() {
        if (!this.isLocal) {
            return this.apiGet('get_despachantes_ativos')
                .then(list => {
                    return list.map(d => {
                        d.id = parseInt(d.id, 10);
                        d.concluido = parseInt(d.concluido, 10);
                        return d;
                    });
                });
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes'], 'readonly');
            const store = transaction.objectStore('despachantes');
            const index = store.index('concluido');
            const request = index.getAll(0);
            request.onsuccess = (e) => {
                const list = e.target.result || [];
                list.sort((a,b) => new Date(b.data_criacao) - new Date(a.data_criacao));
                resolve(list);
            };
            request.onerror = (e) => reject(e);
        });
    }

    getAllDespachantes() {
        if (!this.isLocal) {
            return this.apiGet('get_all_despachantes')
                .then(list => {
                    return list.map(d => {
                        d.id = parseInt(d.id, 10);
                        d.concluido = parseInt(d.concluido, 10);
                        return d;
                    });
                });
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes'], 'readonly');
            const store = transaction.objectStore('despachantes');
            const request = store.getAll();
            request.onsuccess = (e) => {
                const list = e.target.result || [];
                list.sort((a,b) => new Date(b.data_criacao) - new Date(a.data_criacao));
                resolve(list);
            };
            request.onerror = (e) => reject(e);
        });
    }

    marcarDespachanteConcluido(id) {
        if (!this.isLocal) {
            return this.apiPost('marcar_despachante_concluido', { id })
                .then(() => true);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes'], 'readwrite');
            const store = transaction.objectStore('despachantes');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const despachante = getReq.result;
                if (despachante) {
                    despachante.concluido = 1;
                    const putReq = store.put(despachante);
                    putReq.onsuccess = () => resolve(true);
                    putReq.onerror = (e) => reject(e);
                } else {
                    resolve(false);
                }
            };
            getReq.onerror = (e) => reject(e);
        });
    }

    deleteDespachante(id) {
        if (!this.isLocal) {
            return this.apiPost('delete_despachante', { id })
                .then(() => true);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['despachantes', 'itens', 'logs'], 'readwrite');
            
            transaction.objectStore('despachantes').delete(id);
            
            const itensStore = transaction.objectStore('itens');
            const itensIndex = itensStore.index('despachante_id');
            const getItensReq = itensIndex.openCursor(IDBKeyRange.only(id));
            getItensReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            
            const logsStore = transaction.objectStore('logs');
            const logsIndex = logsStore.index('despachante_id');
            const getLogsReq = logsIndex.openCursor(IDBKeyRange.only(id));
            getLogsReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = (e) => reject(e);
        });
    }

    saveItens(itens, despachanteId) {
        if (!this.isLocal) {
            return this.apiPost('save_itens', { itens, despachante_id: despachanteId })
                .then(() => true);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['itens'], 'readwrite');
            const store = transaction.objectStore('itens');
            
            itens.forEach(item => {
                const itemDb = {
                    despachante_id: despachanteId,
                    nota: item.nota,
                    ec: item.ec,
                    cliente: item.cliente,
                    canal: item.canal,
                    descricao: item.descricao,
                    sku: item.sku,
                    ean: item.ean,
                    temEan: item.temEan,
                    quantidade: item.quantidade,
                    quantidadeOriginal: item.quantidadeOriginal,
                    expedido: item.expedido,
                    dataExpedicao: item.dataExpedicao || null
                };
                store.add(itemDb);
            });

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = (e) => reject(e);
        });
    }

    getItensByDespachante(despachanteId) {
        if (!this.isLocal) {
            return this.apiGet('get_itens', { despachante_id: despachanteId })
                .then(list => {
                    return list.map(item => {
                        item.id = parseInt(item.id, 10);
                        item.despachante_id = parseInt(item.despachante_id, 10);
                        item.temEan = item.temEan === 1 || item.temEan === true;
                        item.quantidade = parseInt(item.quantidade, 10);
                        item.quantidadeOriginal = parseInt(item.quantidadeOriginal, 10);
                        item.expedido = item.expedido === 1 || item.expedido === true;
                        return item;
                    });
                });
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['itens'], 'readonly');
            const store = transaction.objectStore('itens');
            const index = store.index('despachante_id');
            const request = index.getAll(IDBKeyRange.only(despachanteId));
            request.onsuccess = (e) => resolve(e.target.result || []);
            request.onerror = (e) => reject(e);
        });
    }

    updateItem(item) {
        if (!this.isLocal) {
            return this.apiPost('update_item', { item })
                .then(() => true);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['itens'], 'readwrite');
            const store = transaction.objectStore('itens');
            const request = store.put(item);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e);
        });
    }

    addLog(logEntry) {
        if (!this.isLocal) {
            return this.apiPost('add_log', { log: logEntry })
                .then(() => true);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logs'], 'readwrite');
            const store = transaction.objectStore('logs');
            const request = store.add(logEntry);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e);
        });
    }

    getLogsByDespachante(despachanteId) {
        if (!this.isLocal) {
            return this.apiGet('get_logs', { despachante_id: despachanteId })
                .then(list => {
                    return list.map(log => {
                        log.id = parseInt(log.id, 10);
                        log.despachante_id = parseInt(log.despachante_id, 10);
                        log.quantidade = parseInt(log.quantidade, 10);
                        return log;
                    });
                });
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logs'], 'readonly');
            const store = transaction.objectStore('logs');
            const index = store.index('despachante_id');
            const request = index.getAll(IDBKeyRange.only(despachanteId));
            request.onsuccess = (e) => {
                const list = e.target.result || [];
                list.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(list);
            };
            request.onerror = (e) => reject(e);
        });
    }
}

// Inicializa a instância do banco de dados
const db = new ExpedicaoDB();

// Estado Global da SPA
const state = {
    activeTab: 'expedicao', // 'expedicao', 'administracao'
    activeDespachanteId: null,
    items: [],
    filter: 'all', // 'all', 'pending', 'completed'
    soundEnabled: true,
    soundProfile: 'classic', // 'classic', 'retro', 'melodic', 'synthwave'
    theme: 'dark', // 'dark', 'light'
    scannerActive: false,
    pdfBlob: null,
    pdfName: null,
    errorModalActive: false,
    confirmModalActive: false,
    confirmTargetItem: null,
    logs: []
};

// Instância do Scanner de Câmera
let html5QrcodeScanner = null;

// Elementos do DOM (inicializados dinamicamente após DOMContentLoaded)
const elements = {};

function initElements() {
    elements.themeToggle = document.getElementById('theme-toggle');
    elements.soundToggle = document.getElementById('sound-toggle');
    elements.dropArea = document.getElementById('drop-area');
    elements.fileInput = document.getElementById('pdf-file-input');
    elements.importCard = document.getElementById('import-card');
    elements.readerCard = document.getElementById('reader-card');
    elements.barcodeForm = document.getElementById('barcode-form');
    elements.barcodeInput = document.getElementById('barcode-input');
    elements.btnSubmitSku = document.getElementById('btn-submit-sku');
    elements.btnCameraScan = document.getElementById('btn-camera-scan');
    elements.cameraScannerContainer = document.getElementById('camera-scanner-container');
    elements.btnStopCamera = document.getElementById('btn-stop-camera');
    elements.progressCard = document.getElementById('progress-card');
    elements.overallProgressBar = document.getElementById('overall-progress-bar');
    elements.progressPercentage = document.getElementById('progress-percentage');
    elements.progressCount = document.getElementById('progress-count');
    elements.statTotalPedidos = document.getElementById('stat-total-pedidos');
    elements.statTotalPecas = document.getElementById('stat-total-pecas');
    elements.btnReset = document.getElementById('btn-reset');
    elements.itemsCard = document.getElementById('items-card');
    elements.searchInput = document.getElementById('search-input');
    elements.emptyState = document.getElementById('empty-state');
    elements.tableContainer = document.getElementById('table-container');
    elements.itemsTableBody = document.getElementById('items-table-body');
    elements.toast = document.getElementById('toast');
    elements.filterBtns = document.querySelectorAll('[data-filter]');
    elements.listColumn = document.getElementById('list-column');
    elements.btnViewPdf = document.getElementById('btn-view-pdf');
    elements.errorModal = document.getElementById('error-modal');
    elements.errorModalTitle = document.getElementById('error-modal-title');
    elements.errorModalDesc = document.getElementById('error-modal-desc');
    elements.errorModalCode = document.getElementById('error-modal-code');
    elements.btnCloseErrorModal = document.getElementById('btn-close-error-modal');

    // Elementos do Modal de Confirmação Sem EAN
    elements.noEanConfirmModal = document.getElementById('no-ean-confirm-modal');
    elements.confirmProductDesc = document.getElementById('confirm-product-desc');
    elements.confirmProductSku = document.getElementById('confirm-product-sku');
    elements.btnConfirmNoEanYes = document.getElementById('btn-confirm-no-ean-yes');
    elements.btnConfirmNoEanNo = document.getElementById('btn-confirm-no-ean-no');
    
    // Perfil Sonoro
    elements.soundProfileSelect = document.getElementById('sound-profile-select');

    // Navegação de Abas
    elements.tabBtnExpedicao = document.getElementById('tab-btn-expedicao');
    elements.tabBtnAdministracao = document.getElementById('tab-btn-administracao');
    elements.tabContentExpedicao = document.getElementById('tab-content-expedicao');
    elements.tabContentAdministracao = document.getElementById('tab-content-administracao');

    // Seletor de Despachante (Aba Expedição)
    elements.activeDespachanteSelect = document.getElementById('active-despachante-select');
    elements.despachanteStatusInfo = document.getElementById('despachante-status-info');
    elements.expedicaoActiveTimer = document.getElementById('expedicao-active-timer');

    // Input de Despachante e Prazo Limite (Aba Administração)
    elements.despachanteNameInput = document.getElementById('despachante-name-input');
    elements.despachanteDeadlineInput = document.getElementById('despachante-deadline-input');
    elements.btnLoadTest = document.getElementById('btn-load-test');

    // Logs de Auditoria
    elements.logsCountBadge = document.getElementById('logs-count-badge');
    elements.logsBtnGroup = document.getElementById('logs-btn-group');
    elements.btnExportLogs = document.getElementById('btn-export-logs');
    elements.btnClearLogs = document.getElementById('btn-clear-logs');
    elements.logsTableBody = document.getElementById('logs-table-body');
    elements.logsEmpty = document.getElementById('logs-empty');

    // Painel de Listas de Despacho Ativas (Aba Administração)
    elements.despachantesTableBody = document.getElementById('despachantes-table-body');
    elements.despachantesEmpty = document.getElementById('despachantes-empty');
}

// ==========================================
// 1. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    
    db.open().then(() => {
        loadSettings();
        initEventListeners();
        restoreStateFromStorage();
        setupAutofocus();
    }).catch(err => {
        console.error('Falha critica ao iniciar banco de dados IndexedDB:', err);
        showToast('Erro de Inicialização', 'O banco de dados do armazém falhou ao abrir.', 'error');
    });
});

// Carrega configurações de tema e som salvas
function loadSettings() {
    // Tema
    const savedTheme = localStorage.getItem('expedicao_theme') || 'dark';
    state.theme = savedTheme;
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        elements.themeToggle.querySelector('.icon').textContent = '🌙';
    } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        elements.themeToggle.querySelector('.icon').textContent = '☀';
    }

    // Som
    const savedSound = localStorage.getItem('expedicao_sound');
    state.soundEnabled = savedSound !== 'false'; // Padrão true
    updateSoundButtonIcon();

    // Perfil Sonoro
    const savedProfile = localStorage.getItem('expedicao_sound_profile') || 'classic';
    state.soundProfile = savedProfile;
    if (elements.soundProfileSelect) {
        elements.soundProfileSelect.value = savedProfile;
    }
}

// Atualiza o ícone do botão de som com base no estado
function updateSoundButtonIcon() {
    elements.soundToggle.querySelector('.icon').textContent = state.soundEnabled ? '🔊' : '🔇';
}

// Restaura a aba e o despachante ativo a partir do banco e do LocalStorage
function restoreStateFromStorage() {
    const savedTab = localStorage.getItem('expedicao_active_tab') || 'expedicao';
    switchTab(savedTab);
}

// Configura o foco inicial no campo de SKU
function setupAutofocus() {
    // Foca apenas uma única vez na abertura caso os dados já estejam carregados
    if (state.items.length > 0 && !elements.barcodeInput.disabled) {
        elements.barcodeInput.focus();
    }
}

// ==========================================
// 2. CONFIGURAÇÃO DE EVENTOS (LISTENERS)
// ==========================================
function initEventListeners() {
    // Chaveamento de Abas
    if (elements.tabBtnExpedicao) {
        elements.tabBtnExpedicao.addEventListener('click', () => switchTab('expedicao'));
    }
    if (elements.tabBtnAdministracao) {
        elements.tabBtnAdministracao.addEventListener('click', () => switchTab('administracao'));
    }

    // Alternância de Tema
    elements.themeToggle.addEventListener('click', () => {
        if (state.theme === 'dark') {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            elements.themeToggle.querySelector('.icon').textContent = '🌙';
            state.theme = 'light';
        } else {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            elements.themeToggle.querySelector('.icon').textContent = '☀';
            state.theme = 'dark';
        }
        localStorage.setItem('expedicao_theme', state.theme);
    });

    // Alternância de Som
    elements.soundToggle.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        updateSoundButtonIcon();
        localStorage.setItem('expedicao_sound', state.soundEnabled);
        
        if (state.soundEnabled) {
            playSoundEffect('unit');
        }
    });

    // Seletor de Perfil de Som
    if (elements.soundProfileSelect) {
        elements.soundProfileSelect.addEventListener('change', (e) => {
            state.soundProfile = e.target.value;
            localStorage.setItem('expedicao_sound_profile', state.soundProfile);
            playSoundEffect('unit');
        });
    }

    // Monitora nome do despachante e prazo limite para habilitar área de upload
    function validateImportForm() {
        const nomeVal = elements.despachanteNameInput.value.trim();
        const deadlineVal = elements.despachanteDeadlineInput.value;
        const hasName = nomeVal.length >= 2;
        const hasDeadline = deadlineVal !== '';
        
        if (hasName && hasDeadline) {
            elements.dropArea.classList.remove('disabled-card');
            elements.dropArea.style.opacity = '1';
            elements.dropArea.style.pointerEvents = 'auto';
            elements.dropArea.querySelector('.upload-text').textContent = 'Arraste o PDF de vendas aqui ou clique para selecionar';
            elements.fileInput.disabled = false;
            elements.btnLoadTest.disabled = false;
        } else {
            elements.dropArea.classList.add('disabled-card');
            elements.dropArea.style.opacity = '0.5';
            elements.dropArea.style.pointerEvents = 'none';
            elements.dropArea.querySelector('.upload-text').textContent = 'Preencha o despachante e o prazo limite para liberar';
            elements.fileInput.disabled = true;
            elements.btnLoadTest.disabled = true;
        }
    }

    if (elements.despachanteNameInput) {
        elements.despachanteNameInput.addEventListener('input', validateImportForm);
    }
    if (elements.despachanteDeadlineInput) {
        elements.despachanteDeadlineInput.addEventListener('input', validateImportForm);
        elements.despachanteDeadlineInput.addEventListener('change', validateImportForm);
    }

    // Seleção de Despachante Ativo no Dropdown
    if (elements.activeDespachanteSelect) {
        elements.activeDespachanteSelect.addEventListener('change', (e) => {
            const id = e.target.value ? parseInt(e.target.value, 10) : null;
            loadDespachanteData(id);
        });
    }

    // Drag and Drop do PDF
    elements.dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!elements.fileInput.disabled) {
            elements.dropArea.classList.add('highlight');
        }
    });

    elements.dropArea.addEventListener('dragleave', () => {
        elements.dropArea.classList.remove('highlight');
    });

    elements.dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropArea.classList.remove('highlight');
        if (elements.fileInput.disabled) return;
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            handlePdfFile(files[0]);
        } else {
            showToast('Erro de Arquivo', 'Por favor, arraste um arquivo PDF válido.', 'error');
        }
    });

    elements.dropArea.addEventListener('click', () => {
        if (!elements.fileInput.disabled) {
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePdfFile(e.target.files[0]);
        }
    });

    // Botão de Modelo de Teste
    if (elements.btnLoadTest) {
        elements.btnLoadTest.addEventListener('click', loadLocalTestPdf);
    }

    // Form de Leitura de SKU
    elements.barcodeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const skuInput = elements.barcodeInput.value.trim();
        if (skuInput) {
            processBarcodeRead(skuInput);
            elements.barcodeInput.value = '';
        }
    });

    // Filtros rápidos
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filter = btn.getAttribute('data-filter');
            renderTable();
        });
    });

    // Busca de texto em tempo real
    elements.searchInput.addEventListener('input', () => {
        renderTable();
    });

    // Câmera Scanner
    elements.btnCameraScan.addEventListener('click', startCameraScanner);
    elements.btnStopCamera.addEventListener('click', stopCameraScanner);

    // Limpar/Excluir despachante ativo
    elements.btnReset.addEventListener('click', () => {
        if (!state.activeDespachanteId) return;
        if (confirm(`Tem certeza que deseja deletar permanentemente o despachante "${state.activeDespachanteNome}" e todos os seus itens do banco local?`)) {
            deleteActiveDespachante();
        }
    });

    // Visualizar PDF
    if (elements.btnViewPdf) {
        elements.btnViewPdf.addEventListener('click', viewOriginalPdf);
    }

    // Fechar modal de erro persistente
    if (elements.btnCloseErrorModal) {
        elements.btnCloseErrorModal.addEventListener('click', closeErrorModal);
    }

    // Modal de Confirmação Sem EAN
    if (elements.btnConfirmNoEanYes) {
        elements.btnConfirmNoEanYes.addEventListener('click', confirmNoEanYes);
    }
    if (elements.btnConfirmNoEanNo) {
        elements.btnConfirmNoEanNo.addEventListener('click', confirmNoEanNo);
    }

    // Atalhos de teclado globais
    document.addEventListener('keydown', (e) => {
        if (state.errorModalActive) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault();
                closeErrorModal();
            }
        } else if (state.confirmModalActive) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmNoEanYes();
            } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                confirmNoEanNo();
            }
        }
    });

    if (elements.btnExportLogs) {
        elements.btnExportLogs.addEventListener('click', exportLogsToCsv);
    }

    if (elements.btnClearLogs) {
        elements.btnClearLogs.addEventListener('click', clearLogs);
    }
}

// ==========================================
// 3. CARREGAMENTO E LEITURA DO PDF
// ==========================================

// Faz o fetch do teste.pdf local
async function loadLocalTestPdf() {
    showLoadingState(true);
    try {
        const response = await fetch('./teste.pdf');
        if (!response.ok) {
            throw new Error(`Erro HTTP ao buscar arquivo: ${response.status}`);
        }
        const blob = await response.blob();
        const file = new File([blob], 'teste.pdf', { type: 'application/pdf' });
        await handlePdfFile(file);
    } catch (error) {
        console.error('Falha ao carregar teste.pdf local:', error);
        showToast('Erro ao carregar modelo', 'Não foi possível encontrar o arquivo "teste.pdf" na raiz.', 'error');
        showLoadingState(false);
    }
}

// Processa o arquivo PDF carregado e vincula ao despachante no banco de dados
async function handlePdfFile(file) {
    const despachanteNome = elements.despachanteNameInput.value.trim();
    const despachanteDeadline = elements.despachanteDeadlineInput.value;
    
    if (!despachanteNome) {
        showToast('Despachante Requerido', 'Por favor, insira o nome do despachante responsável.', 'error');
        return;
    }
    if (!despachanteDeadline) {
        showToast('Prazo Requerido', 'Por favor, defina o horário limite de expedição.', 'error');
        return;
    }

    showLoadingState(true);
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            try {
                const parsedItems = await parser.parse(arrayBuffer);
                if (parsedItems.length === 0) {
                    showToast('PDF Vazio', 'Nenhum item válido pôde ser extraído do PDF.', 'error');
                    showLoadingState(false);
                    return;
                }
                
                // Cria despachante no IndexedDB com o prazo limite
                const despachanteId = await db.addDespachante(despachanteNome, despachanteDeadline);
                
                // Vincula os itens do PDF a esse despachante
                await db.saveItens(parsedItems, despachanteId);
                
                // Grava o log de importação vinculando a esse despachante
                const logEntry = {
                    despachante_id: despachanteId,
                    timestamp: new Date().toISOString(),
                    nota: '---',
                    ean: file.name,
                    quantidade: parsedItems.length,
                    acao: 'Importação PDF',
                    tipo: 'info'
                };
                await db.addLog(logEntry);
                
                showLoadingState(false);
                playSoundEffect('confirm');
                showToast('Importado com Sucesso', `${parsedItems.length} itens vinculados ao despachante: ${despachanteNome}`, 'success');
                
                // Limpa os inputs e desativa o drag-drop
                elements.despachanteNameInput.value = '';
                elements.despachanteDeadlineInput.value = '';
                elements.despachanteNameInput.dispatchEvent(new Event('input'));
                
                // Recarrega a tabela de listas de despacho ativas
                renderDespachantesTable();
                
                // Pergunta se deseja chavear para a aba de expedição
                if (confirm(`Lista importada com sucesso para o despachante "${despachanteNome}". Deseja ir para a aba de Expedição de Vendas?`)) {
                    switchTab('expedicao');
                    
                    // Seleciona automaticamente o despachante recém-criado
                    setTimeout(() => {
                        elements.activeDespachanteSelect.value = despachanteId;
                        elements.activeDespachanteSelect.dispatchEvent(new Event('change'));
                    }, 150);
                } else {
                    renderLogs();
                }
            } catch (err) {
                showToast('Erro de Parsing', err.message, 'error');
                showLoadingState(false);
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('Erro ao ler arquivo:', error);
        showToast('Erro de Leitura', 'Falha ao ler o arquivo selecionado.', 'error');
        showLoadingState(false);
    }
}

// Configura o visual de carregando
function showLoadingState(isLoading) {
    if (isLoading) {
        elements.dropArea.style.opacity = '0.5';
        elements.dropArea.style.pointerEvents = 'none';
    } else {
        elements.dropArea.style.opacity = '1';
        elements.dropArea.style.pointerEvents = 'auto';
    }
}

// Executado quando os dados estão carregados com sucesso
function onDataLoaded() {
    showLoadingState(false);
    
    // Atualizar UI de Controles (Oculta Importação, Mostra Leitor e Lista)
    elements.importCard.style.display = 'none';
    elements.importCard.classList.add('disabled-card');
    
    elements.readerCard.style.display = 'block';
    elements.readerCard.classList.remove('disabled-card');
    elements.barcodeInput.disabled = false;
    elements.barcodeInput.placeholder = 'Aponte o leitor e escaneie o EAN...';
    elements.btnSubmitSku.disabled = false;
    elements.btnCameraScan.disabled = false;
    elements.progressCard.style.display = 'block';
    
    // Lista de Itens (Coluna Direita)
    if (elements.listColumn) {
        elements.listColumn.style.display = 'block';
    }
    elements.emptyState.style.display = 'none';
    elements.tableContainer.style.display = 'block';
    
    // Renderiza dados
    renderTable();
    updateProgress();
    
    // Foca no input
    elements.barcodeInput.focus();
}

// ==========================================
// 4. PROCESSAMENTO DO SKU / CÓDIGO DE BARRAS
// ==========================================

/**
 * Processa a leitura de um SKU ou EAN. Procura o item na fila, tica
 * e diminui a contagem restante (suporta leitura em lote com o formato Qtd*EAN).
 * @param {string} rawSku Código lido pelo scanner
 */
async function processBarcodeRead(rawSku) {
    if (!state.activeDespachanteId) {
        showToast('Nenhuma Lista Selecionada', 'Selecione uma lista de despachante ativo no topo da tela.', 'error');
        return;
    }

    let multiplier = 1;
    let code = rawSku.trim().toUpperCase();
    
    // Suporte para bip em lote: ex: 5*7896630342756
    const multRegex = /^(\d+)\s*\*\s*(.+)$/;
    if (multRegex.test(code)) {
        const match = code.match(multRegex);
        multiplier = parseInt(match[1], 10);
        code = match[2].trim().toUpperCase();
    }
    
    if (!code || isNaN(multiplier) || multiplier <= 0) {
        triggerInputErrorEffect();
        playSoundEffect('error');
        showToast('Código Inválido', 'Formato de bip em lote ou código incorreto.', 'error');
        return;
    }

    // Procurar por itens pendentes de forma estrita pelo EAN do produto
    let matchedItem = state.items.find(item => 
        !item.expedido && 
        item.temEan && 
        (item.ean.toUpperCase() === code || item.ean.replace(/[^0-9]/g, '') === code.replace(/[^0-9]/g, ''))
    );
    
    if (matchedItem) {
        // Encontrou um item pendente!
        const unidadesParaExpedir = Math.min(multiplier, matchedItem.quantidade);
        const excesso = multiplier - unidadesParaExpedir;
        
        matchedItem.quantidade -= unidadesParaExpedir;
        
        // Se a quantidade restante zerou, marcar como expedido
        if (matchedItem.quantidade <= 0) {
            matchedItem.quantidade = 0;
            matchedItem.expedido = true;
            matchedItem.dataExpedicao = new Date().toISOString();
        }
        
        // Atualiza item no IndexedDB
        await db.updateItem(matchedItem);
        renderTable();
        updateProgress();
        highlightRow(matchedItem.id);
        
        // Grava log de auditoria no IndexedDB
        const logEntry = {
            despachante_id: state.activeDespachanteId,
            timestamp: new Date().toISOString(),
            nota: matchedItem.nota,
            ean: matchedItem.ean || matchedItem.sku,
            quantidade: unidadesParaExpedir,
            acao: 'Conferência Bip',
            tipo: 'success'
        };
        await db.addLog(logEntry);
        state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
        renderLogs();
        
        // Feedback Sonoro e Visual
        if (matchedItem.expedido) {
            playSoundEffect('complete');
            if (excesso > 0) {
                showToast('Item Concluído', `+${unidadesParaExpedir} de ${matchedItem.descricao} (Excesso de ${excesso} un. ignorado)`, 'success');
            } else {
                showToast('Item Expedido', `Concluído: ${matchedItem.descricao} (Qtd: ${unidadesParaExpedir})`, 'success');
            }
        } else {
            playSoundEffect('unit');
            showToast('Unidade Registrada', `+${unidadesParaExpedir} de ${matchedItem.descricao}. Restam ${matchedItem.quantidade} un.`, 'success');
        }
        
        checkAllCompleted();
    } else {
        // EAN não encontrado na fila de pendentes
        const alreadyExpedidos = state.items.filter(item => 
            item.expedido && 
            item.temEan && 
            (item.ean.toUpperCase() === code || item.ean.replace(/[^0-9]/g, '') === code.replace(/[^0-9]/g, ''))
        );
        
        triggerInputErrorEffect();
        playSoundEffect('error');
        
        if (alreadyExpedidos.length > 0) {
            const errLog = {
                despachante_id: state.activeDespachanteId,
                timestamp: new Date().toISOString(),
                nota: '---',
                ean: code,
                quantidade: multiplier,
                acao: 'Erro: Já Expedido',
                tipo: 'error'
            };
            await db.addLog(errLog);
            state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
            renderLogs();
            showErrorModal('Produto Já Expedido', 'Este produto já foi totalmente processado e expedido nesta lista.', code);
        } else {
            const pendentesSemEan = state.items.filter(item => !item.expedido && !item.temEan);
            
            // Só aciona confirmação se o código parecer um EAN ou for o SKU exato do item sem EAN
            const isEanLike = /^\d{8,14}$/.test(code);
            const matchedSkuItem = pendentesSemEan.find(item => item.sku.toUpperCase() === code);
            
            if (matchedSkuItem) {
                showNoEanConfirmModal(matchedSkuItem);
            } else if (isEanLike && pendentesSemEan.length > 0) {
                showNoEanConfirmModal(pendentesSemEan[0]);
            } else {
                const errLog = {
                    despachante_id: state.activeDespachanteId,
                    timestamp: new Date().toISOString(),
                    nota: '---',
                    ean: code,
                    quantidade: multiplier,
                    acao: 'Erro: Não Encontrado',
                    tipo: 'error'
                };
                await db.addLog(errLog);
                state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
                renderLogs();
                showErrorModal('Código Não Encontrado', 'O código lido não foi encontrado na lista de pendentes.', code);
            }
        }
    }
}

// Animação de sucesso piscando na linha da tabela
function highlightRow(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) {
        row.classList.add('item-pulse-success');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Remove a classe após a animação acabar para permitir re-disparo
        setTimeout(() => {
            row.classList.remove('item-pulse-success');
        }, 800);
    }
}

// Efeito de tremor no input de SKU para erro
function triggerInputErrorEffect() {
    elements.barcodeForm.classList.add('shake-animation');
    setTimeout(() => {
        elements.barcodeForm.classList.remove('shake-animation');
    }, 500);
}

// Verifica se toda a lista de expedição foi concluída
async function checkAllCompleted() {
    const totalPendentes = state.items.reduce((acc, item) => acc + item.quantidade, 0);
    if (totalPendentes === 0 && state.items.length > 0) {
        const despachanteId = state.activeDespachanteId;
        const despachanteNome = state.activeDespachanteNome;
        
        // Marca o despachante como concluído no banco
        await db.marcarDespachanteConcluido(despachanteId);
        
        // Sincroniza o timer ativo para "Concluído"
        elements.expedicaoActiveTimer.setAttribute('data-concluido', '1');
        
        // Grava o log de fechamento da fila
        const endLog = {
            despachante_id: despachanteId,
            timestamp: new Date().toISOString(),
            nota: '---',
            ean: '---',
            quantidade: state.items.length,
            acao: 'Finalização de Lista',
            tipo: 'success'
        };
        await db.addLog(endLog);
        
        playSoundEffect('all_complete');
        showToast('Expedição Finalizada! 🎉', 'Parabéns! Todos os produtos da lista foram conferidos e expedidos.', 'success');
        
        // Aguarda 1 segundo para visualização do estado concluído antes da ação
        setTimeout(() => {
            if (confirm(`Lista de itens finalizada para o despachante "${despachanteNome}". Deseja exportar o resumo da auditoria em CSV?`)) {
                exportLogsToCsv();
            }
            
            // Reseta tela operacional e recarrega dropdown de despachantes
            loadDespachanteData(null);
            loadDespachantesDropdown();
        }, 1000);
    }
}

// ==========================================
// 5. GERAÇÃO DE SINAL DE AUDIO (BEEP)
// ==========================================
/**
 * Gera um som analógico usando Web Audio API do navegador.
 * Evita a necessidade de carregar arquivos MP3 estáticos.
 * @param {number} frequency Frequência em Hz
 * @param {number} duration Duração em ms
 * @param {string} type Tipo de onda ('sine', 'square', 'sawtooth', 'triangle')
 */
function playBeep(frequency, duration, type = 'sine') {
    if (!state.soundEnabled) return;

    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        // Suavizar o início e o fim do áudio para evitar estalos (cliques)
        gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000 - 0.02);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration / 1000);
        
        // Fecha o context após tocar para evitar vazamento de memória
        setTimeout(() => {
            audioCtx.close();
        }, duration + 100);
    } catch (e) {
        console.error('Falha ao reproduzir áudio:', e);
    }
}

/**
 * Toca o efeito sonoro configurado no perfil ativo.
 * @param {string} type Tipo do efeito ('unit', 'complete', 'error', 'all_complete', 'confirm', 'cancel')
 */
function playSoundEffect(type) {
    if (!state.soundEnabled) return;
    
    const profile = state.soundProfile || 'classic';
    
    if (profile === 'classic') {
        if (type === 'unit') {
            playBeep(1000, 100, 'sine');
        } else if (type === 'complete') {
            playBeep(1000, 80, 'sine');
            setTimeout(() => playBeep(1300, 100, 'sine'), 100);
        } else if (type === 'error') {
            playBeep(250, 300, 'sawtooth');
        } else if (type === 'all_complete') {
            setTimeout(() => playBeep(523.25, 120, 'sine'), 100); // C5
            setTimeout(() => playBeep(659.25, 120, 'sine'), 220); // E5
            setTimeout(() => playBeep(783.99, 120, 'sine'), 340); // G5
            setTimeout(() => playBeep(1046.50, 300, 'sine'), 460); // C6
        } else if (type === 'confirm') {
            playBeep(600, 150, 'triangle');
        } else if (type === 'cancel') {
            playBeep(450, 80, 'sine');
        }
    } else if (profile === 'retro') {
        if (type === 'unit') {
            playBeep(1500, 50, 'square');
        } else if (type === 'complete') {
            playBeep(800, 60, 'square');
            setTimeout(() => playBeep(1200, 60, 'square'), 70);
            setTimeout(() => playBeep(1600, 100, 'square'), 140);
        } else if (type === 'error') {
            playBeep(180, 150, 'triangle');
            setTimeout(() => playBeep(120, 200, 'triangle'), 160);
        } else if (type === 'all_complete') {
            const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
            scale.forEach((freq, idx) => {
                setTimeout(() => playBeep(freq, 70, 'square'), idx * 80);
            });
        } else if (type === 'confirm') {
            playBeep(900, 80, 'square');
            setTimeout(() => playBeep(1300, 80, 'square'), 90);
        } else if (type === 'cancel') {
            playBeep(600, 80, 'square');
            setTimeout(() => playBeep(400, 80, 'square'), 90);
        }
    } else if (profile === 'melodic') {
        if (type === 'unit') {
            playBeep(880, 120, 'sine'); // A5
        } else if (type === 'complete') {
            playBeep(880, 100, 'sine');
            setTimeout(() => playBeep(1109.73, 180, 'sine'), 110); // A5 + C#6 (acorde maior)
        } else if (type === 'error') {
            playBeep(330, 250, 'sine'); // E3 baixo e suave
        } else if (type === 'all_complete') {
            setTimeout(() => playBeep(440, 150, 'sine'), 100); // A4
            setTimeout(() => playBeep(554.37, 150, 'sine'), 220); // C#5
            setTimeout(() => playBeep(659.25, 150, 'sine'), 340); // E5
            setTimeout(() => playBeep(880, 350, 'sine'), 460); // A5
        } else if (type === 'confirm') {
            playBeep(783.99, 150, 'sine'); // G5
        } else if (type === 'cancel') {
            playBeep(523.25, 120, 'sine'); // C5
        }
    } else if (profile === 'synthwave') {
        if (type === 'unit') {
            playBeep(330, 150, 'sawtooth'); // Baixo synthwave
        } else if (type === 'complete') {
            playBeep(440, 100, 'sawtooth');
            setTimeout(() => playBeep(554.37, 200, 'sawtooth'), 110);
        } else if (type === 'error') {
            playBeep(220, 200, 'sawtooth');
            setTimeout(() => playBeep(110, 250, 'sawtooth'), 210);
        } else if (type === 'all_complete') {
            setTimeout(() => playBeep(293.66, 150, 'sawtooth'), 100); // D4
            setTimeout(() => playBeep(349.23, 150, 'sawtooth'), 220); // F4
            setTimeout(() => playBeep(440, 150, 'sawtooth'), 340); // A4
            setTimeout(() => playBeep(587.33, 400, 'sawtooth'), 460); // D5
        } else if (type === 'confirm') {
            playBeep(587.33, 150, 'sawtooth');
        } else if (type === 'cancel') {
            playBeep(293.66, 150, 'sawtooth');
        }
    }
}

// ==========================================
// 6. RENDERIZAÇÃO DA TABELA E ESTATÍSTICAS
// ==========================================

// Atualiza o progresso global e contadores
function updateProgress() {
    const totalPecasOriginais = state.items.reduce((acc, item) => acc + item.quantidadeOriginal, 0);
    const pecasExpedidas = state.items.reduce((acc, item) => acc + (item.quantidadeOriginal - item.quantidade), 0);
    const pecasRestantes = totalPecasOriginais - pecasExpedidas;
    
    // Contagem de itens (linhas completas vs total)
    const totalLinhas = state.items.length;
    const linhasCompletadas = state.items.filter(item => item.expedido).length;
    
    const pct = totalPecasOriginais > 0 ? Math.round((pecasExpedidas / totalPecasOriginais) * 100) : 0;
    
    // Atualiza barra de progresso e texto
    elements.overallProgressBar.style.width = `${pct}%`;
    elements.progressPercentage.textContent = `${pct}%`;
    elements.progressCount.textContent = `${linhasCompletadas} / ${totalLinhas} itens concluídos (${pecasExpedidas} de ${totalPecasOriginais} peças)`;
    
    // Stats Boxes
    // Agrupa pedidos únicos para contar total de Notas Fiscais
    const uniqueNotas = [...new Set(state.items.map(item => item.nota))];
    elements.statTotalPedidos.textContent = uniqueNotas.length;
    elements.statTotalPecas.textContent = pecasRestantes;
}

// Renderiza a lista de itens baseada no filtro e pesquisa
function renderTable() {
    const searchVal = elements.searchInput.value.toLowerCase().trim();
    
    // Limpa a tabela
    elements.itemsTableBody.innerHTML = '';
    
    // Filtra itens
    const filteredItems = state.items.filter(item => {
        // Filtro de aba
        if (state.filter === 'pending' && item.expedido) return false;
        if (state.filter === 'completed' && !item.expedido) return false;
        
        // Filtro de pesquisa por texto
        if (searchVal) {
            const matchesSku = item.sku.toLowerCase().includes(searchVal);
            const matchesEan = item.ean ? item.ean.toLowerCase().includes(searchVal) : false;
            const matchesDesc = item.descricao.toLowerCase().includes(searchVal);
            const matchesCliente = item.cliente.toLowerCase().includes(searchVal);
            const matchesNota = item.nota.toLowerCase().includes(searchVal);
            return matchesSku || matchesEan || matchesDesc || matchesCliente || matchesNota;
        }
        
        return true;
    });

    if (filteredItems.length === 0) {
        elements.itemsTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
                    Nenhum item corresponde aos critérios de pesquisa ou filtro ativos.
                </td>
            </tr>
        `;
        return;
    }

    filteredItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', item.id);
        if (item.expedido) {
            tr.classList.add('completed-row');
        } else if (!item.temEan) {
            tr.classList.add('no-ean-row'); // Destaca em vermelho os itens sem EAN real cadastrado
        }

        // Determina classe do canal para o badge
        let canalClass = '';
        const canalLower = item.canal.toLowerCase();
        if (canalLower.includes('shopee')) canalClass = 'shopee';
        else if (canalLower.includes('amazon')) canalClass = 'amazon';
        else if (canalLower.includes('mercadolivre') || canalLower.includes('mercado livre')) canalClass = 'mercadolivre';

        // Linha da tabela
        tr.innerHTML = `
            <td>
                <span class="badge ${item.expedido ? 'badge-completed' : 'badge-pending'}">
                    ${item.expedido ? 'Expedido' : 'Pendente'}
                </span>
            </td>
            <td>
                <div class="meta-cell">
                    <span class="nota-text">${item.nota}</span>
                    <span class="cliente-text" title="${item.cliente}">${item.cliente}</span>
                </div>
            </td>
            <td>
                <div class="product-cell">
                    <span class="product-desc">${item.descricao}</span>
                    <div class="product-details-extra">
                        <span class="badge badge-channel ${canalClass}">${item.canal}</span>
                        ${item.ec ? `<span>Pedido: ${item.ec}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <div class="sku-cell">
                    <span class="sku-badge">${item.sku}</span>
                    ${item.temEan ? `<span class="ean-subtext" style="display:block; font-size:10px; color:var(--text-secondary); margin-top:4px; font-family:monospace; background:rgba(255,255,255,0.05); padding:2px 4px; border-radius:4px; width:fit-content;">EAN: ${item.ean}</span>` : '<span class="ean-subtext text-danger" style="display:block; font-size:10px; color:#ef4444; margin-top:4px; font-weight:700;">Sem EAN no PDF</span>'}
                </div>
            </td>
            <td class="text-center">
                <span class="qty-display">
                    <span class="qty-val-pending">${item.quantidade}</span>
                    <span class="qty-val-total"> / ${item.quantidadeOriginal}</span>
                </span>
                ${item.expedido ? '' : `<button class="btn btn-outline btn-unit-add" onclick="manualAddUnit(${item.id})" style="padding: 2px 6px; font-size: 10px; margin-left: 8px; border-radius: 4px;">+1</button>`}
            </td>
        `;
        elements.itemsTableBody.appendChild(tr);
    });
}

/**
 * Atalho manual na interface para marcar item como lido sem usar o leitor.
 * Muito útil para operadores em contingência.
 * @param {number} id Id do item
 */
window.manualAddUnit = async function(id) {
    const item = state.items.find(i => i.id === id);
    if (item && !item.expedido) {
        // Registra a unidade expedida
        item.quantidade -= 1;
        if (item.quantidade <= 0) {
            item.quantidade = 0;
            item.expedido = true;
            item.dataExpedicao = new Date().toISOString();
        }
        
        // Atualiza item no IndexedDB
        await db.updateItem(item);
        renderTable();
        updateProgress();
        highlightRow(item.id);
        
        // Adiciona log de auditoria no IndexedDB
        const logEntry = {
            despachante_id: state.activeDespachanteId,
            timestamp: new Date().toISOString(),
            nota: item.nota,
            ean: item.ean || item.sku,
            quantidade: 1,
            acao: 'Conferência Manual',
            tipo: 'manual'
        };
        await db.addLog(logEntry);
        state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
        renderLogs();
        
        if (item.expedido) {
            playSoundEffect('complete');
            showToast('Item Expedido', `Concluído: ${item.descricao}`, 'success');
        } else {
            playSoundEffect('unit');
            showToast('Unidade Registrada', `+1 de ${item.descricao}. Restam ${item.quantidade} un.`, 'success');
        }
        checkAllCompleted();
    }
};

// ==========================================
// 7. CONTROLE DA CÂMERA SCANNER (WEBCAM)
// ==========================================
function startCameraScanner() {
    if (state.scannerActive) return;

    elements.cameraScannerContainer.classList.add('active');
    state.scannerActive = true;
    
    // Desabilita input principal para evitar concorrência
    elements.barcodeInput.disabled = true;

    // Inicializa o scanner html5-qrcode
    html5QrcodeScanner = new Html5Qrcode("camera-reader");
    
    const config = {
        fps: 15,
        qrbox: (width, height) => {
            // Retângulo fino horizontal otimizado para códigos de barra lineares
            return { 
                width: Math.min(width * 0.85, 340), 
                height: Math.min(height * 0.55, 75) 
            };
        }
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Prioriza câmera traseira do celular
        config,
        (decodedText) => {
            if (state.errorModalActive) return;
            
            // Pausa a câmera no momento em que detecta um código
            stopCameraScanner();
            
            processBarcodeRead(decodedText);
            
            // Se não disparou erro, re-inicia a câmera após 1.5s
            setTimeout(() => {
                if (!state.errorModalActive && elements.cameraScannerContainer.classList.contains('active')) {
                    startCameraScanner();
                }
            }, 1500);
        },
        (errorMessage) => {
            // Silencia erros normais de busca contínua por frames
        }
    ).catch(err => {
        console.error('Erro ao iniciar câmera:', err);
        showToast('Erro de Câmera', 'Não foi possível acessar a câmera do dispositivo.', 'error');
        stopCameraScanner();
    });
}

function stopCameraScanner() {
    if (!state.scannerActive) return;

    state.scannerActive = false;
    elements.cameraScannerContainer.classList.remove('active');
    elements.barcodeInput.disabled = false;
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
            elements.barcodeInput.focus();
        }).catch(err => {
            console.error('Erro ao parar scanner:', err);
            html5QrcodeScanner = null;
            elements.barcodeInput.focus();
        });
    }
}

// ==========================================
// 8. NOTIFICAÇÕES (TOAST)
// ==========================================
let toastTimeout = null;

/**
 * Exibe um toast flutuante na tela com feedback.
 * @param {string} title Título do toast
 * @param {string} desc Descrição sutil
 * @param {string} type Tipo ('success' ou 'error')
 */
function showToast(title, desc, type = 'success') {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    elements.toast.className = `toast show ${type}`;
    elements.toast.querySelector('.toast-title').textContent = title;
    elements.toast.querySelector('.toast-desc').textContent = desc;

    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 4000);
}

// Limpar todo o estado para importar novo arquivo
function resetState() {
    state.items = [];
    localStorage.removeItem('expedicao_items');
    
    // Limpa metadados do PDF
    state.pdfBlob = null;
    state.pdfName = null;
    localStorage.removeItem('expedicao_pdf_name');
    
    // Reset da UI (Mostra Importação, Oculta Leitor e Lista)
    elements.importCard.style.display = 'block';
    elements.importCard.classList.remove('disabled-card');
    
    elements.readerCard.style.display = 'none';
    elements.readerCard.classList.add('disabled-card');
    elements.barcodeInput.disabled = true;
    elements.barcodeInput.placeholder = 'Aguardando leitura de EAN...';
    elements.btnSubmitSku.disabled = true;
    elements.btnCameraScan.disabled = true;
    
    elements.progressCard.style.display = 'none';
    
    if (elements.listColumn) {
        elements.listColumn.style.display = 'none';
    }
    
    elements.emptyState.style.display = 'flex';
    elements.tableContainer.style.display = 'none';
    elements.searchInput.value = '';
    
    stopCameraScanner();
    addLog('Limpeza de Fila', '---', '---', 0, 'info');
}

/**
 * Abre o PDF original carregado em uma nova aba do navegador para conferência.
 */
async function viewOriginalPdf() {
    if (state.pdfBlob) {
        const fileURL = URL.createObjectURL(state.pdfBlob);
        window.open(fileURL, '_blank');
        return;
    }

    // Se não tiver o blob mas for o teste.pdf, baixa dinamicamente
    if (state.pdfName === 'teste.pdf') {
        showToast('Carregando PDF...', 'Buscando o arquivo de teste para visualização...', 'success');
        try {
            const response = await fetch('./teste.pdf');
            const blob = await response.blob();
            state.pdfBlob = new File([blob], 'teste.pdf', { type: 'application/pdf' });
            const fileURL = URL.createObjectURL(state.pdfBlob);
            window.open(fileURL, '_blank');
        } catch (err) {
            console.error('Falha ao obter teste.pdf:', err);
            showToast('Erro de Conexão', 'Não foi possível buscar o teste.pdf local.', 'error');
        }
        return;
    }

    // Se for arquivo do usuário que sumiu com o refresh do navegador
    showToast('Aviso de Visualização', 'O PDF do seu upload não está mais na memória.', 'error');
    
    // Exibe temporariamente o card de upload para que o operador possa arrastar de novo
    elements.importCard.style.display = 'block';
    elements.importCard.classList.remove('disabled-card');
    showToast('Área de Upload Liberada', 'Arraste o PDF de volta aqui se desejar habilitar a visualização.', 'success');
}

/**
 * Exibe o modal de erro persistente e trava o leitor/câmera para confirmação.
 */
function showErrorModal(title, desc, code) {
    state.errorModalActive = true;
    
    elements.errorModalTitle.textContent = title;
    elements.errorModalDesc.textContent = desc;
    elements.errorModalCode.textContent = code;
    elements.errorModal.style.display = 'flex';
    
    // Desabilita input de SKU para evitar digitações paralelas
    elements.barcodeInput.disabled = true;
    
    // Foca o botão de fechar para permitir a confirmação com Enter ou Espaço
    setTimeout(() => {
        if (elements.btnCloseErrorModal) {
            elements.btnCloseErrorModal.focus();
        }
    }, 100);
}

/**
 * Fecha o modal de erro persistente e reativa a câmera ou o input de leitura.
 */
function closeErrorModal() {
    elements.errorModal.style.display = 'none';
    state.errorModalActive = false;
    
    // Se o contêiner do scanner de câmera estiver aberto, significa que o operador estava usando a câmera.
    // Então, re-iniciamos a câmera automaticamente!
    if (elements.cameraScannerContainer && elements.cameraScannerContainer.classList.contains('active')) {
        state.scannerActive = false;
        startCameraScanner();
    } else {
        // Caso contrário, ele estava usando o leitor físico / teclado.
        // Re-habilita e refoca o input de SKU
        if (state.items.length > 0) {
            elements.barcodeInput.disabled = false;
            elements.barcodeInput.value = '';
            elements.barcodeInput.focus();
        }
    }
}

// ==========================================
// 8.5. MODAL DE CONFIRMAÇÃO SEM EAN
// ==========================================
function showNoEanConfirmModal(item) {
    state.confirmModalActive = true;
    state.confirmTargetItem = item;
    
    // Toca alerta de aviso sutil
    playSoundEffect('confirm');
    
    elements.confirmProductDesc.textContent = item.descricao;
    elements.confirmProductSku.textContent = `SKU: ${item.sku}`;
    elements.noEanConfirmModal.style.display = 'flex';
    
    // Desabilita input principal
    elements.barcodeInput.disabled = true;
    
    // Foca no botão SIM por padrão
    setTimeout(() => {
        if (elements.btnConfirmNoEanYes) {
            elements.btnConfirmNoEanYes.focus();
        }
    }, 100);
}

async function confirmNoEanYes() {
    const item = state.confirmTargetItem;
    elements.noEanConfirmModal.style.display = 'none';
    state.confirmModalActive = false;
    state.confirmTargetItem = null;
    
    if (item) {
        // Registra a unidade expedida
        item.quantidade -= 1;
        if (item.quantidade <= 0) {
            item.quantidade = 0;
            item.expedido = true;
            item.dataExpedicao = new Date().toISOString();
        }
        
        // Atualiza item no IndexedDB
        await db.updateItem(item);
        renderTable();
        updateProgress();
        highlightRow(item.id);
        
        // Grava log de auditoria no IndexedDB
        const logEntry = {
            despachante_id: state.activeDespachanteId,
            timestamp: new Date().toISOString(),
            nota: item.nota,
            ean: item.sku,
            quantidade: 1,
            acao: 'Conferência Sem EAN',
            tipo: 'manual'
        };
        await db.addLog(logEntry);
        state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
        renderLogs();
        
        if (item.expedido) {
            playSoundEffect('complete');
            showToast('Item Expedido', `Concluído: ${item.descricao}`, 'success');
        } else {
            playSoundEffect('unit');
            showToast('Unidade Registrada', `+1 de ${item.descricao}. Restam ${item.quantidade} un.`, 'success');
        }
        checkAllCompleted();
    }
    
    restoreActiveScanner();
}

async function confirmNoEanNo() {
    const item = state.confirmTargetItem;
    elements.noEanConfirmModal.style.display = 'none';
    state.confirmModalActive = false;
    state.confirmTargetItem = null;
    
    // Alerta de cancelamento
    playSoundEffect('cancel');
    
    if (item) {
        // Grava log de auditoria no IndexedDB
        const logEntry = {
            despachante_id: state.activeDespachanteId,
            timestamp: new Date().toISOString(),
            nota: item.nota,
            ean: item.sku,
            quantidade: 1,
            acao: 'Cancelado Sem EAN',
            tipo: 'info'
        };
        await db.addLog(logEntry);
        state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
        renderLogs();
    }
    
    restoreActiveScanner();
}

function restoreActiveScanner() {
    if (elements.cameraScannerContainer && elements.cameraScannerContainer.classList.contains('active')) {
        state.scannerActive = false;
        startCameraScanner();
    } else {
        if (state.items.length > 0) {
            elements.barcodeInput.disabled = false;
            elements.barcodeInput.value = '';
            elements.barcodeInput.focus();
        }
    }
}

// ==========================================
// 8.9. LÓGICA DE AUDITORIA E LOGS LOCAIS
// ==========================================
function renderLogs() {
    if (!elements.logsTableBody) return;
    
    elements.logsTableBody.innerHTML = '';
    
    if (state.logs.length === 0) {
        elements.logsEmpty.style.display = 'block';
        elements.logsCountBadge.textContent = '0';
        elements.logsBtnGroup.style.display = 'none';
        return;
    }
    
    elements.logsEmpty.style.display = 'none';
    elements.logsBtnGroup.style.display = 'flex';
    elements.logsCountBadge.textContent = state.logs.length;
    
    state.logs.forEach(log => {
        const tr = document.createElement('tr');
        
        // Formata data e hora
        const dateObj = new Date(log.timestamp);
        const formatTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const formatDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        // Classes dos badges
        let badgeClass = 'log-info';
        if (log.tipo === 'success') badgeClass = 'log-success';
        else if (log.tipo === 'manual') badgeClass = 'log-manual';
        else if (log.tipo === 'error') badgeClass = 'log-error';
        
        tr.innerHTML = `
            <td>
                <span class="log-time">${formatDate} ${formatTime}</span>
            </td>
            <td>
                <strong>${log.nota}</strong>
            </td>
            <td>
                <span class="log-badge ${badgeClass}">${log.acao}</span>
            </td>
            <td>
                <span style="font-family: monospace;">${log.ean}</span>
            </td>
            <td>
                <strong>${log.quantidade > 0 ? '+' + log.quantidade : log.quantidade}</strong>
            </td>
            <td>
                <span style="font-size: 11px; opacity: 0.8;">${log.tipo === 'success' || log.tipo === 'manual' ? '✅ OK' : log.tipo === 'error' ? '❌ Falha' : 'ℹ️ Info'}</span>
            </td>
        `;
        
        elements.logsTableBody.appendChild(tr);
    });
}

// Limpa os logs do despachante ativo no IndexedDB
async function clearLogs() {
    if (!state.activeDespachanteId) return;
    if (confirm('Deseja realmente esvaziar todo o histórico de auditoria deste despachante?')) {
        try {
            const transaction = db.db.transaction(['logs'], 'readwrite');
            const store = transaction.objectStore('logs');
            const index = store.index('despachante_id');
            const range = IDBKeyRange.only(state.activeDespachanteId);
            
            const getLogsReq = index.openCursor(range);
            getLogsReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            
            transaction.oncomplete = () => {
                state.logs = [];
                renderLogs();
                showToast('Auditoria Limpa', 'Histórico do despachante foi redefinido.', 'success');
                playSoundEffect('cancel');
            };
        } catch (err) {
            console.error('Falha ao limpar logs no IndexedDB:', err);
            showToast('Erro ao Limpar', 'Não foi possível apagar os logs do banco local.', 'error');
        }
    }
}

// Exporta logs no formato CSV compatível com Excel em português
function exportLogsToCsv() {
    if (state.logs.length === 0) {
        showToast('Erro ao exportar', 'Não há registros no histórico para exportar.', 'error');
        return;
    }
    
    // Cabeçalho do CSV
    let csvContent = '\uFEFF'; // Adiciona BOM para abrir corretamente acentuações no Excel (UTF-8)
    csvContent += 'Data/Hora;Nota Fiscal;Ação;EAN/SKU;Qtd;Tipo\r\n';
    
    state.logs.forEach(log => {
        const dateObj = new Date(log.timestamp);
        const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR')}`;
        
        const line = [
            dateStr,
            log.nota,
            log.acao,
            `="${log.ean}"`, // Evita que o Excel converta números longos de EAN em notação científica (ex: 7,89E+12)
            log.quantidade,
            log.tipo
        ].map(val => `"${val.toString().replace(/"/g, '""')}"`).join(';');
        
        csvContent += line + '\r\n';
    });
    
    // Cria elemento de download e dispara
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_expedicao_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Logs Exportados', 'Relatório CSV de auditoria baixado com sucesso!', 'success');
    playSoundEffect('confirm');
}

// ==========================================
// 8.10. CONTROLADORES DE ABAS E DESPACHANTES
// ==========================================

// Alterna entre as abas e atualiza a interface
function switchTab(tab) {
    state.activeTab = tab;
    localStorage.setItem('expedicao_active_tab', tab);
    
    if (tab === 'expedicao') {
        elements.tabBtnExpedicao.classList.add('active');
        elements.tabBtnAdministracao.classList.remove('active');
        elements.tabContentExpedicao.classList.add('active');
        elements.tabContentAdministracao.classList.remove('active');
        
        loadDespachantesDropdown();
    } else {
        elements.tabBtnExpedicao.classList.remove('active');
        elements.tabBtnAdministracao.classList.add('active');
        elements.tabContentExpedicao.classList.remove('active');
        elements.tabContentAdministracao.classList.add('active');
        
        stopCameraScanner();
        renderLogs();
        renderDespachantesTable();
    }
}

// Alimenta o dropdown com a lista de despachantes ativos do banco
async function loadDespachantesDropdown(selectedId = null) {
    if (!elements.activeDespachanteSelect) return;
    
    elements.activeDespachanteSelect.innerHTML = '<option value="">-- Selecione uma lista de despachante --</option>';
    
    try {
        const despachantes = await db.getDespachantesAtivos();
        
        despachantes.forEach(d => {
            const dateStr = new Date(d.data_criacao).toLocaleDateString('pt-BR');
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `${d.nome} (${dateStr})`;
            elements.activeDespachanteSelect.appendChild(opt);
        });
        
        // Se houver um ID ativo salvo ou fornecido, define-o como selecionado
        const idToSet = selectedId || state.activeDespachanteId || parseInt(localStorage.getItem('expedicao_active_despachante_id'), 10);
        if (idToSet && despachantes.some(d => d.id === idToSet)) {
            elements.activeDespachanteSelect.value = idToSet;
            if (!selectedId) {
                // Carrega os dados silenciosamente
                loadDespachanteData(idToSet);
            }
        } else if (!despachantes.some(d => d.id === state.activeDespachanteId)) {
            // Se o despachante ativo sumiu ou foi apagado
            loadDespachanteData(null);
        }
    } catch (e) {
        console.error('Erro ao ler despachantes do IndexedDB:', e);
    }
}

// Carrega os itens e histórico vinculados ao despachante selecionado
async function loadDespachanteData(id) {
    if (!id) {
        state.activeDespachanteId = null;
        state.activeDespachanteNome = null;
        state.items = [];
        state.logs = [];
        localStorage.removeItem('expedicao_active_despachante_id');
        
        // Reset timer ativo
        elements.expedicaoActiveTimer.setAttribute('data-deadline', '');
        elements.expedicaoActiveTimer.setAttribute('data-concluido', '0');
        
        // UI Reset
        elements.readerCard.style.display = 'none';
        elements.progressCard.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        elements.tableContainer.style.display = 'none';
        elements.despachanteStatusInfo.style.display = 'none';
        
        stopCameraScanner();
        stopBackgroundSync();
        return;
    }
    
    try {
        const despachante = await db.getDespachante(id);
        if (!despachante) {
            loadDespachanteData(null);
            return;
        }
        
        state.activeDespachanteId = id;
        state.activeDespachanteNome = despachante.nome;
        localStorage.setItem('expedicao_active_despachante_id', id);
        
        // Sincroniza timer ativo
        elements.expedicaoActiveTimer.setAttribute('data-deadline', despachante.data_limite || '');
        elements.expedicaoActiveTimer.setAttribute('data-concluido', despachante.concluido.toString());
        
        // Busca itens e logs
        state.items = await db.getItensByDespachante(id);
        state.logs = await db.getLogsByDespachante(id);
        
        // Habilita e exibe UI
        elements.emptyState.style.display = 'none';
        elements.tableContainer.style.display = 'block';
        
        elements.readerCard.style.display = 'block';
        elements.readerCard.classList.remove('disabled-card');
        elements.barcodeInput.disabled = false;
        elements.barcodeInput.placeholder = 'Aponte o leitor e escaneie o EAN...';
        elements.btnSubmitSku.disabled = false;
        elements.btnCameraScan.disabled = false;
        
        elements.progressCard.style.display = 'block';
        elements.despachanteStatusInfo.style.display = 'flex';
        
        // Renderiza
        renderTable();
        updateProgress();
        renderLogs();
        
        // Inicia sincronização automática em background
        startBackgroundSync();
        
        // Foco automático
        setTimeout(setupAutofocus, 100);
    } catch (e) {
        console.error('Erro ao carregar dados do despachante:', e);
        showToast('Erro de Carregamento', 'Falha ao buscar registros do banco local.', 'error');
    }
}

// Exclui o despachante selecionado do banco de dados
async function deleteActiveDespachante() {
    const id = state.activeDespachanteId;
    if (!id) return;
    
    try {
        await db.deleteDespachante(id);
        showToast('Lista Deletada', 'Os dados do despachante foram removidos do banco.', 'success');
        playSoundEffect('cancel');
        
        // Reseta tela
        loadDespachanteData(null);
        loadDespachantesDropdown();
    } catch (e) {
        console.error('Falha ao excluir despachante:', e);
        showToast('Erro ao Excluir', 'Não foi possível apagar os dados do banco local.', 'error');
    }
}

// ==========================================
// 8.11. PAINEL GERENCIAL DE DESPACHANTES
// ==========================================

// Renderiza a tabela de listas de despacho ativas na aba do administrador
let isRenderingDespachantesTable = false;
async function renderDespachantesTable() {
    if (!elements.despachantesTableBody) return;
    if (isRenderingDespachantesTable) return;
    isRenderingDespachantesTable = true;
    
    elements.despachantesTableBody.innerHTML = '';
    
    try {
        const despachantes = await db.getAllDespachantes();
        
        if (despachantes.length === 0) {
            elements.despachantesEmpty.style.display = 'block';
            elements.despachantesTableBody.closest('.table-container').style.display = 'none';
            isRenderingDespachantesTable = false;
            return;
        }
        
        elements.despachantesEmpty.style.display = 'none';
        elements.despachantesTableBody.closest('.table-container').style.display = 'block';
        
        for (const d of despachantes) {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            
            // Busca itens para saber quantidade
            const itens = await db.getItensByDespachante(d.id);
            const totalLinhas = itens.length;
            const pecasRestantes = itens.reduce((acc, it) => acc + it.quantidade, 0);
            const pecasTotais = itens.reduce((acc, it) => acc + it.quantidadeOriginal, 0);
            const pecasExpedidas = pecasTotais - pecasRestantes;
            
            // Formata datas
            const dateEntrada = new Date(d.data_criacao);
            const dateEntradaStr = `${dateEntrada.toLocaleDateString('pt-BR')} ${dateEntrada.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
            
            let dateLimiteStr = '---';
            if (d.data_limite) {
                const dateLimite = new Date(d.data_limite);
                dateLimiteStr = `${dateLimite.toLocaleDateString('pt-BR')} ${dateLimite.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
            }
            
            // Ações dependendo do status de conclusão
            let acoesHtml = '';
            if (d.concluido) {
                acoesHtml = `
                    <div style="display:flex; justify-content:center; gap: 6px;">
                        <button class="btn btn-outline" onclick="exportarCsvPeloPainel(${d.id})" style="padding: 4px 8px; font-size: 11px; height: auto;">CSV</button>
                        <button class="btn btn-danger-outline" onclick="excluirDespachantePeloPainel(${d.id}, '${d.nome}')" style="padding: 4px 8px; font-size: 11px; height: auto;">Excluir</button>
                    </div>
                `;
            } else {
                acoesHtml = `
                    <div style="display:flex; justify-content:center; gap: 6px;">
                        <button class="btn btn-primary" onclick="selecionarParaExpedir(${d.id})" style="padding: 4px 8px; font-size: 11px; height: auto; box-shadow:none;">Expedir</button>
                        <button class="btn btn-danger-outline" onclick="excluirDespachantePeloPainel(${d.id}, '${d.nome}')" style="padding: 4px 8px; font-size: 11px; height: auto;">Excluir</button>
                    </div>
                `;
            }
            
            tr.innerHTML = `
                <td style="padding: 10px 8px; font-weight: 700;">${d.nome}</td>
                <td style="padding: 10px 8px; text-align: center;">
                    <strong>${pecasExpedidas} / ${pecasTotais}</strong>
                    <span style="display:block; font-size:10px; color:var(--text-muted);">${totalLinhas} itens</span>
                </td>
                <td style="padding: 10px 8px; color: var(--text-secondary);">${dateEntradaStr}</td>
                <td style="padding: 10px 8px; color: var(--text-secondary);">${dateLimiteStr}</td>
                <td style="padding: 10px 8px;">
                    <div class="despachante-timer" data-deadline="${d.data_limite}" data-concluido="${d.concluido}">---</div>
                </td>
                <td style="padding: 10px 8px; text-align: center;">${acoesHtml}</td>
            `;
            
            elements.despachantesTableBody.appendChild(tr);
        }
        
        // Atualiza imediatamente os timers após renderizar
        updateAllTimers();
    } catch (e) {
        console.error('Falha ao renderizar tabela de despachantes:', e);
    } finally {
        isRenderingDespachantesTable = false;
    }
}

// Funções globais atreladas à tela do Painel Gerencial
window.selecionarParaExpedir = function(id) {
    switchTab('expedicao');
    setTimeout(() => {
        elements.activeDespachanteSelect.value = id;
        elements.activeDespachanteSelect.dispatchEvent(new Event('change'));
    }, 100);
};

window.excluirDespachantePeloPainel = async function(id, nome) {
    if (confirm(`Tem certeza de que deseja excluir permanentemente o despachante "${nome}" e todos os seus itens do banco local?`)) {
        try {
            await db.deleteDespachante(id);
            showToast('Removido', 'Lista de despacho excluída com sucesso.', 'success');
            playSoundEffect('cancel');
            
            renderDespachantesTable();
            loadDespachantesDropdown();
        } catch (e) {
            console.error('Erro ao excluir despachante pelo painel:', e);
            showToast('Erro ao Excluir', 'Não foi possível apagar os dados do banco local.', 'error');
        }
    }
};

window.exportarCsvPeloPainel = async function(id) {
    try {
        const despachante = await db.getDespachante(id);
        const logs = await db.getLogsByDespachante(id);
        if (logs.length === 0) {
            showToast('Erro', 'Não há registros para este despachante.', 'error');
            return;
        }
        
        let csvContent = '\uFEFF';
        csvContent += 'Data/Hora;Nota Fiscal;Ação;EAN/SKU;Qtd;Tipo\r\n';
        
        logs.forEach(log => {
            const dateObj = new Date(log.timestamp);
            const dateStr = `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR')}`;
            const line = [
                dateStr,
                log.nota,
                log.acao,
                `="${log.ean}"`,
                log.quantidade,
                log.tipo
            ].map(val => `"${val.toString().replace(/"/g, '""')}"`).join(';');
            csvContent += line + '\r\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `auditoria_${despachante.nome.replace(/\s+/g, '_')}_id_${id}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Logs Exportados', 'Resumo CSV baixado com sucesso.', 'success');
        playSoundEffect('confirm');
    } catch (e) {
        console.error('Erro ao exportar logs pelo painel:', e);
        showToast('Erro ao exportar', 'Falha ao processar logs do despachante.', 'error');
    }
};

// Temporizador dinâmico para os prazos limite
function updateAllTimers() {
    const timers = document.querySelectorAll('.despachante-timer');
    timers.forEach(el => {
        const isConcluido = el.getAttribute('data-concluido') === '1';
        if (isConcluido) {
            el.innerHTML = '<span style="color: var(--success); font-weight: 700;">Concluído ✅</span>';
            return;
        }
        
        const deadlineStr = el.getAttribute('data-deadline');
        if (!deadlineStr) {
            el.textContent = '---';
            return;
        }
        
        const deadline = new Date(deadlineStr).getTime();
        const now = new Date().getTime();
        const diff = deadline - now;
        
        if (diff <= 0) {
            el.innerHTML = '<span class="text-danger" style="color: #ef4444; font-weight: 700; display: inline-block;">Atrasado! 🚨</span>';
        } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            const hStr = hours.toString().padStart(2, '0');
            const mStr = minutes.toString().padStart(2, '0');
            const sStr = seconds.toString().padStart(2, '0');
            
            let color = '#60a5fa'; // Azul claro
            if (diff < 1000 * 60 * 15) {
                color = '#ef4444'; // Vermelho se faltar menos de 15 min
            } else if (diff < 1000 * 60 * 60) {
                color = '#f59e0b'; // Amarelo se faltar menos de 1 hora
            }
            
            el.innerHTML = `<span style="color: ${color}; font-family: monospace; font-weight: 700;">${hStr}:${mStr}:${sStr}</span>`;
        }
    });
}

// Inicializa o contador regressivo global de 1 segundo
setInterval(updateAllTimers, 1000);

// ==========================================
// 8.12. SINCRONIZADOR ONLINE DE BACKGROUND
// ==========================================
let syncIntervalId = null;

function startBackgroundSync() {
    stopBackgroundSync(); // Evita timers duplicados
    
    // Sincronização inteligente a cada 2 segundos
    syncIntervalId = setInterval(async () => {
        // Interrompe se a janela estiver minimizada, se não houver despachante ativo ou se não estiver na tela de expedição
        if (document.hidden) return;
        if (!state.activeDespachanteId) return;
        if (state.activeTab !== 'expedicao') return;
        
        try {
            const freshItems = await db.getItensByDespachante(state.activeDespachanteId);
            
            // Compara as quantidades locais vs remotas para detectar mudanças
            let hasChanges = false;
            if (freshItems.length !== state.items.length) {
                hasChanges = true;
            } else {
                for (let i = 0; i < freshItems.length; i++) {
                    const localItem = state.items[i];
                    const serverItem = freshItems[i];
                    if (
                        localItem.id === serverItem.id && 
                        (localItem.quantidade !== serverItem.quantidade || localItem.expedido !== serverItem.expedido)
                    ) {
                        hasChanges = true;
                        break;
                    }
                }
            }
            
            // Só atualiza a tela se detectou mudanças reais feitas por outro operador
            if (hasChanges) {
                state.items = freshItems;
                renderTable();
                updateProgress();
                
                // Recarrega os logs também
                state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
                renderLogs();
                
                // Verifica conclusão total da fila
                const totalPendentes = state.items.reduce((acc, item) => acc + item.quantidade, 0);
                if (totalPendentes === 0 && state.items.length > 0) {
                    checkAllCompleted();
                }
            }
        } catch (e) {
            console.warn("Erro ao sincronizar em background:", e);
        }
    }, 2000);
}

function stopBackgroundSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}

// Pausa a sincronização quando a janela do navegador perde o foco (economiza CPU/Servidor)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopBackgroundSync();
    } else {
        startBackgroundSync();
    }
});
