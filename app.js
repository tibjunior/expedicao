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
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer expedicao_api_token_2026_seguro_aqui'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Erro na API (${action}): ${response.statusText}`);
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
            return this.apiGet('get_logs', { despachante_id: despachanteId || 0 })
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
            if (!this.db) return resolve([]);
            try {
                const transaction = this.db.transaction(['logs'], 'readonly');
                const store = transaction.objectStore('logs');
                
                let request;
                if (despachanteId) {
                    const index = store.index('despachante_id');
                    request = index.getAll(IDBKeyRange.only(despachanteId));
                } else {
                    request = store.getAll();
                }
                
                request.onsuccess = (e) => {
                    let list = e.target.result || [];
                    list.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                    if (!despachanteId) {
                        list = list.slice(0, 100);
                    }
                    resolve(list);
                };
                request.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
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
    sortBy: 'default', // 'default', 'status', 'nota', 'descricao', 'sku', 'quantidade'
    sortOrder: 'asc', // 'asc', 'desc'
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
    // Força sempre o tema escuro padrão solicitado pelo usuário
    state.theme = 'dark';
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');

    // Som
    const savedSound = localStorage.getItem('expedicao_sound');
    state.soundEnabled = savedSound !== 'false'; // Padrão true

    // Perfil Sonoro
    const savedProfile = localStorage.getItem('expedicao_sound_profile') || 'classic';
    state.soundProfile = savedProfile;
    
    // Atualiza a interface
    updateSoundButtonIcon();
}

// Atualiza o ícone do botão de som com base no estado e nas opções do dropdown
function updateSoundButtonIcon() {
    const activeIconEl = document.getElementById('active-sound-icon');
    if (!activeIconEl) return;
    
    // Mapeamento de ícones
    const iconMap = {
        mute: '🔇',
        classic: '🔊',
        retro: '🎮',
        melodic: '🔔',
        synthwave: '🌌'
    };
    
    // Define o ícone exibido no cabeçalho
    if (!state.soundEnabled) {
        activeIconEl.textContent = iconMap.mute;
    } else {
        activeIconEl.textContent = iconMap[state.soundProfile] || '🔊';
    }
    
    // Atualiza a classe active das opções no dropdown
    const soundItems = document.querySelectorAll('.sound-dropdown-item');
    soundItems.forEach(item => {
        const soundType = item.getAttribute('data-sound');
        if (!state.soundEnabled && soundType === 'mute') {
            item.classList.add('active');
        } else if (state.soundEnabled && soundType === state.soundProfile) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Restaura a aba e o despachante ativo a partir do banco e do LocalStorage
function restoreStateFromStorage() {
    const savedTab = localStorage.getItem('expedicao_active_tab') || 'expedicao';
    switchTab(savedTab);
}

// Configura o foco inicial no campo de SKU
function setupAutofocus() {
    // Foco automático inicial desativado conforme solicitação do usuário
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

    // Controle do Dropdown de Abas Customizado
    const dropdownTrigger = document.getElementById('tabs-dropdown-trigger');
    const dropdownContainer = document.getElementById('tabs-dropdown-container');
    if (dropdownTrigger && dropdownContainer) {
        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownContainer.classList.toggle('open');
        });
        
        // Clique fora fecha o dropdown
        document.addEventListener('click', (e) => {
            if (!dropdownContainer.contains(e.target)) {
                dropdownContainer.classList.remove('open');
            }
        });
    }

    // Controle do Dropdown de Ordenação da Fila de Espera
    const sortDropdownTrigger = document.getElementById('sort-dropdown-trigger');
    const sortDropdownContainer = document.getElementById('sort-dropdown-container');
    if (sortDropdownTrigger && sortDropdownContainer) {
        sortDropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdownContainer.classList.toggle('open');
        });
        
        // Clique fora fecha o dropdown
        document.addEventListener('click', (e) => {
            if (!sortDropdownContainer.contains(e.target)) {
                sortDropdownContainer.classList.remove('open');
            }
        });
        
        // Selecionar critério de ordenação
        const sortMenuItems = document.querySelectorAll('.sort-menu-item');
        sortMenuItems.forEach(item => {
            item.addEventListener('click', () => {
                const sortBy = item.getAttribute('data-sort');
                
                if (state.sortBy === sortBy) {
                    // Inverte a direção se clicar na mesma opção
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortBy = sortBy;
                    state.sortOrder = 'asc';
                }
                
                // Atualiza visual
                sortMenuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Fecha menu
                sortDropdownContainer.classList.remove('open');
                
                // Re-renderiza a tabela
                renderTable();
            });
        });
    }

    // Alternância de Tema desativada (Usando apenas Tema Escuro)

    // Controle do Dropdown de Som Customizado
    const soundDropdownTrigger = document.getElementById('sound-dropdown-trigger');
    const soundDropdownContainer = document.getElementById('sound-dropdown-container');
    
    if (soundDropdownTrigger && soundDropdownContainer) {
        soundDropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            soundDropdownContainer.classList.toggle('open');
        });
        
        // Clique fora fecha o dropdown
        document.addEventListener('click', (e) => {
            if (!soundDropdownContainer.contains(e.target)) {
                soundDropdownContainer.classList.remove('open');
            }
        });
        
        // Escuta os cliques nos itens do dropdown de som
        const soundDropdownItems = document.querySelectorAll('.sound-dropdown-item');
        soundDropdownItems.forEach(btn => {
            btn.addEventListener('click', () => {
                const soundType = btn.getAttribute('data-sound');
                
                if (soundType === 'mute') {
                    // Muta
                    state.soundEnabled = false;
                } else {
                    // Ativa e muda perfil
                    state.soundEnabled = true;
                    state.soundProfile = soundType;
                    localStorage.setItem('expedicao_sound_profile', soundType);
                }
                
                localStorage.setItem('expedicao_sound', state.soundEnabled);
                updateSoundButtonIcon();
                
                // Fecha o menu
                soundDropdownContainer.classList.remove('open');
                
                // Toca som de confirmação/teste se não estiver mutado
                if (state.soundEnabled) {
                    playSoundEffect('unit');
                }
            });
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

    // Busca de texto em tempo real (com debounce de 200ms - Fase 2.1)
    let searchDebounceTimeout = null;
    elements.searchInput.addEventListener('input', () => {
        if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            renderTable();
        }, 200);
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
                
                // Mantém a tela no painel do administrador e atualiza logs
                renderLogs();
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
    
    // Foca no input (Desativado conforme solicitação)
    // elements.barcodeInput.focus();
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

    // Se estiver no Modo Guiado de Item Específico, valida contra o item focado
    if (state.focusedItemId) {
        const focusedItem = state.items.find(item => item.id === state.focusedItemId);
        if (!focusedItem) {
            deactivateFocusedItemMode();
        } else {
            // Verifica se o código lido coincide com o EAN ou SKU do item focado
            const isMatch = 
                (focusedItem.temEan && (focusedItem.ean.toUpperCase() === code || focusedItem.ean.replace(/[^0-9]/g, '') === code.replace(/[^0-9]/g, ''))) ||
                (focusedItem.sku.toUpperCase() === code);
                
            if (!isMatch) {
                // Erro de bipagem no modo focado
                triggerInputErrorEffect();
                playSoundEffect('error');
                showToast('Produto Incorreto', `Foco no SKU: ${focusedItem.sku}. Por favor, bipe o produto correto!`, 'error');
                return;
            }
        }
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
            
            // Integração Tiny: solicita etiqueta se habilitado
            if (matchedItem.ec && localStorage.getItem('expedicao_tiny_enabled') === '1') {
                solicitarEtiquetaTiny(matchedItem.ec);
            }
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
        
        // Se o item focado foi concluído no modo guiado, encerra o foco e desativa a câmera
        if (state.focusedItemId && matchedItem.id === state.focusedItemId && matchedItem.expedido) {
            deactivateFocusedItemMode();
            stopCameraScanner();
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
        if (state.filter === 'noean' && item.temEan) return false; // Mostra apenas itens SEM EAN
        
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

    // Ordena os itens com base no critério selecionado no painel
    if (state.sortBy && state.sortBy !== 'default') {
        filteredItems.sort((a, b) => {
            let comparison = 0;
            switch (state.sortBy) {
                case 'status':
                    // Pendente (0) primeiro, Expedido (1) depois
                    const statusA = a.expedido ? 1 : 0;
                    const statusB = b.expedido ? 1 : 0;
                    comparison = statusA - statusB;
                    break;
                case 'nota':
                    comparison = a.nota.localeCompare(b.nota, 'pt-BR') || a.cliente.localeCompare(b.cliente, 'pt-BR');
                    break;
                case 'descricao':
                    comparison = a.descricao.localeCompare(b.descricao, 'pt-BR');
                    break;
                case 'sku':
                    comparison = a.sku.localeCompare(b.sku, 'pt-BR');
                    break;
                case 'quantidade':
                    // Menor quantidade restante primeiro. Se empatar, ordena pela quantidade original
                    comparison = a.quantidade - b.quantidade || a.quantidadeOriginal - b.quantidadeOriginal;
                    break;
            }
            return state.sortOrder === 'asc' ? comparison : -comparison;
        });
    }

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
        tr.classList.add('item-row');
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
        // Mantém a classe de foco ativa no card caso a tabela re-renderize antes do fim da bipagem
        if (state.focusedItemId && item.id === state.focusedItemId) {
            tr.classList.add('focused-row');
        }

        // Clique na linha do item abre a câmera e entra no modo de conferência focado
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.btn-unit-add')) return;
            
            if (item.expedido) {
                showToast('Item já Expedido', 'Este produto já foi totalmente conferido e expedido.', 'info');
                return;
            }
            
            activateFocusedItemMode(item);
        });

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
// 6.2. MODO GUIADO DE ITEM FOCADO
// ==========================================
function activateFocusedItemMode(item) {
    state.focusedItemId = item.id;
    state.focusedItemEan = item.ean;
    state.focusedItemSku = item.sku;
    
    // Destaca a linha visualmente
    document.querySelectorAll('.items-table tr').forEach(tr => {
        tr.classList.remove('focused-row');
    });
    
    const activeTr = document.querySelector(`.items-table tr[data-id="${item.id}"]`);
    if (activeTr) {
        activeTr.classList.add('focused-row');
    }
    
    // Abre a câmera
    startCameraScanner();
    
    showToast('Modo Guiado Ativo', `Bipe especificamente o SKU: ${item.sku}`, 'info');
    
    if (elements.barcodeInput) {
        elements.barcodeInput.placeholder = `Bipe especificamente o SKU: ${item.sku}...`;
    }
}

function deactivateFocusedItemMode() {
    state.focusedItemId = null;
    state.focusedItemEan = null;
    state.focusedItemSku = null;
    
    document.querySelectorAll('.items-table tr').forEach(tr => {
        tr.classList.remove('focused-row');
    });
    
    if (elements.barcodeInput) {
        elements.barcodeInput.placeholder = 'Aguardando leitura de EAN...';
    }
}

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
            
            // Pausa a câmera no momento em que detecta um código, preservando o modo guiado ativo para validação
            stopCameraScanner(true);
            
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

function stopCameraScanner(keepGuidedMode = false) {
    if (!state.scannerActive) return;

    state.scannerActive = false;
    elements.cameraScannerContainer.classList.remove('active');
    elements.barcodeInput.disabled = false;
    
    // Se estava no Modo Guiado de Item Focado e não foi pedido para manter, desativa-o
    if (state.focusedItemId && !keepGuidedMode) {
        deactivateFocusedItemMode();
    }
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error('Erro ao parar scanner:', err);
            html5QrcodeScanner = null;
        });
    }
}

// ==========================================
// 8. NOTIFICAÇÕES (TOAST)
// ==========================================
let toastTimeout = null;
let toastCloseListener = null;

/**
 * Exibe um toast flutuante na tela com feedback.
 * @param {string} title Título do toast
 * @param {string} desc Descrição sutil
 * @param {string} type Tipo ('success' ou 'error')
 */
function showToast(title, desc, type = 'success') {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }

    // Se já havia um listener de clique do toast anterior ativo, remove-o preventivamente
    if (toastCloseListener) {
        document.removeEventListener('click', toastCloseListener);
        document.removeEventListener('touchend', toastCloseListener);
        toastCloseListener = null;
    }

    elements.toast.className = `toast show ${type}`;
    elements.toast.querySelector('.toast-title').textContent = title;
    elements.toast.querySelector('.toast-desc').textContent = desc;

    const duration = type === 'error' ? 7000 : 4000;

    // Função de callback para fechar o toast ao tocar em qualquer área da tela
    const closeOnTap = () => {
        elements.toast.classList.remove('show');
        document.removeEventListener('click', closeOnTap);
        document.removeEventListener('touchend', closeOnTap);
        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toastTimeout = null;
        }
        toastCloseListener = null;
    };

    // Registra o evento de clique/toque com um delay sutil para não capturar a própria ação que disparou o toast
    setTimeout(() => {
        if (elements.toast.classList.contains('show')) {
            toastCloseListener = closeOnTap;
            document.addEventListener('click', closeOnTap);
            document.addEventListener('touchend', closeOnTap);
        }
    }, 150);

    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('show');
        if (toastCloseListener) {
            document.removeEventListener('click', toastCloseListener);
            document.removeEventListener('touchend', toastCloseListener);
            toastCloseListener = null;
        }
        toastTimeout = null;
    }, duration);
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
    const modal = document.getElementById('pdf-viewer-modal');
    const iframe = document.getElementById('pdf-iframe');
    
    if (state.pdfBlob) {
        const fileURL = URL.createObjectURL(state.pdfBlob);
        if (modal && iframe) {
            iframe.src = fileURL;
            modal.style.display = 'flex';
        } else {
            // Fallback se o modal não existir
            window.open(fileURL, '_blank');
        }
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
            
            if (modal && iframe) {
                iframe.src = fileURL;
                modal.style.display = 'flex';
            } else {
                window.open(fileURL, '_blank');
            }
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

// Exporta logs no formato CSV profissional com Excel
function exportLogsToCsv() {
    if (state.logs.length === 0) {
        showToast('Erro ao exportar', 'Não há registros no histórico para exportar.', 'error');
        return;
    }
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');
    const despachanteNome = state.activeDespachanteNome || 'Geral';
    
    // Cabeçalho profissional do CSV
    let csvContent = '\uFEFF'; // BOM para UTF-8 no Excel
    
    // Linha de título do relatório
    csvContent += `"RELATÓRIO DE AUDITORIA - EXPEDIÇÃO";;;;\r\n`;
    csvContent += `"Despachante: ${despachanteNome}";;;;\r\n`;
    csvContent += `"Gerado em: ${dateStr} às ${timeStr}";;;;\r\n`;
    csvContent += `"Total de registros: ${state.logs.length}";;;;\r\n`;
    csvContent += `;;;;;;;;\r\n`; // Linha em branco
    
    // Cabeçalho da tabela com formatação
    csvContent += `"Data";"Hora";"Nota Fiscal";"Ação";"EAN / SKU";"Qtd";"Tipo";"Status"\r\n`;
    csvContent += `;;;;;;;;\r\n`; // Separador
    
    // Totais para o resumo
    let totalOK = 0, totalFalha = 0, totalManual = 0, totalInfo = 0;
    
    state.logs.forEach(log => {
        const dateObj = new Date(log.timestamp);
        const logDate = dateObj.toLocaleDateString('pt-BR');
        const logTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Contagem por tipo
        if (log.tipo === 'success') totalOK++;
        else if (log.tipo === 'error') totalFalha++;
        else if (log.tipo === 'manual') totalManual++;
        else totalInfo++;
        
        // Status descritivo
        let status = '✅ OK';
        if (log.tipo === 'error') status = '❌ Falha';
        else if (log.tipo === 'info') status = 'ℹ️ Info';
        else if (log.tipo === 'manual') status = '👤 Manual';
        
        // Formata quantidade com sinal
        const qtdFormatada = log.quantidade > 0 ? `+${log.quantidade}` : log.quantidade.toString();
        
        const line = [
            logDate,
            logTime,
            log.nota,
            log.acao,
            `="${log.ean}"`, // Evita notação científica no Excel
            qtdFormatada,
            log.tipo,
            status
        ].map(val => `"${val.toString().replace(/"/g, '""')}"`).join(';');
        
        csvContent += line + '\r\n';
    });
    
    // Resumo estatístico no final
    csvContent += `;;;;;;;;\r\n`;
    csvContent += `;;;;;;;;\r\n`;
    csvContent += `"📊 RESUMO ESTATÍSTICO";;;;\r\n`;
    csvContent += `"Total de eventos: ${state.logs.length}";;;;\r\n`;
    csvContent += `"✅ Conferências OK: ${totalOK}";;;;\r\n`;
    csvContent += `"❌ Falhas/Erros: ${totalFalha}";;;;\r\n`;
    csvContent += `"👤 Intervenções Manuais: ${totalManual}";;;;\r\n`;
    csvContent += `"ℹ️ Informações: ${totalInfo}";;;;\r\n`;
    csvContent += `;;;;;;;;\r\n`;
    csvContent += `"--- FIM DO RELATÓRIO ---";;;;\r\n`;
    
    // Cria elemento de download e dispara
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const fileName = `auditoria_${despachanteNome.replace(/\s+/g, '_')}_${now.toISOString().slice(0,10)}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Logs Exportados', `Relatório CSV com ${state.logs.length} registros baixado!`, 'success');
    playSoundEffect('confirm');
}

// ==========================================
// 8.10. CONTROLADORES DE ABAS E DESPACHANTES
// ==========================================

// Alterna entre as abas e atualiza a interface
function switchTab(tab, selectedId = null) {
    state.activeTab = tab;
    localStorage.setItem('expedicao_active_tab', tab);
    
    const activeTabTitle = document.getElementById('active-tab-title');
    
    if (tab === 'expedicao') {
        if (activeTabTitle) activeTabTitle.textContent = 'Expedição de Vendas';
        
        if (elements.tabBtnExpedicao) elements.tabBtnExpedicao.classList.add('active');
        if (elements.tabBtnAdministracao) elements.tabBtnAdministracao.classList.remove('active');
        if (elements.tabContentExpedicao) elements.tabContentExpedicao.classList.add('active');
        if (elements.tabContentAdministracao) elements.tabContentAdministracao.classList.remove('active');
        
        loadDespachantesDropdown(selectedId);
        startBackgroundSync();
    } else {
        if (activeTabTitle) activeTabTitle.textContent = 'Administração de Vendas';
        
        if (elements.tabBtnExpedicao) elements.tabBtnExpedicao.classList.remove('active');
        if (elements.tabBtnAdministracao) elements.tabBtnAdministracao.classList.add('active');
        if (elements.tabContentExpedicao) elements.tabContentExpedicao.classList.remove('active');
        if (elements.tabContentAdministracao) elements.tabContentAdministracao.classList.add('active');
        
        stopCameraScanner();
        
        // Busca logs iniciais (globais ou da lista ativa) para preencher a tela antes do primeiro sync
        db.getLogsByDespachante(state.activeDespachanteId || 0).then(logs => {
            state.logs = logs;
            renderLogs();
        });
        
        renderDespachantesTable();
        startBackgroundSync();
    }
    
    // Fecha o menu do dropdown de abas
    const dropdownContainer = document.getElementById('tabs-dropdown-container');
    if (dropdownContainer) {
        dropdownContainer.classList.remove('open');
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
            loadDespachanteData(idToSet);
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
        
        // Foco automático desativado conforme solicitação do usuário
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
let lastAdminDataHash = "";
async function renderDespachantesTable() {
    if (!elements.despachantesTableBody) return;
    if (isRenderingDespachantesTable) return;
    isRenderingDespachantesTable = true;
    
    try {
        const despachantes = await db.getAllDespachantes();
        
        if (despachantes.length === 0) {
            elements.despachantesEmpty.style.display = 'block';
            elements.despachantesTableBody.closest('.table-container').style.display = 'none';
            lastAdminDataHash = "";
            isRenderingDespachantesTable = false;
            return;
        }
        
        // Coleta os metadados do progresso de cada despachante para criar um hash comparativo
        const dataForHash = [];
        const detailsMap = [];
        
        for (const d of despachantes) {
            const itens = await db.getItensByDespachante(d.id);
            const totalLinhas = itens.length;
            const pecasRestantes = itens.reduce((acc, it) => acc + it.quantidade, 0);
            const pecasTotais = itens.reduce((acc, it) => acc + it.quantidadeOriginal, 0);
            const pecasExpedidas = pecasTotais - pecasRestantes;
            
            dataForHash.push(`${d.id}-${d.nome}-${d.concluido}-${pecasExpedidas}/${pecasTotais}`);
            detailsMap.push({ d, totalLinhas, pecasExpedidas, pecasTotais });
        }
        
        const currentHash = dataForHash.join('|');
        // Se as listas e o progresso continuam exatamente idênticos, pula a re-renderização do DOM
        if (currentHash === lastAdminDataHash) {
            isRenderingDespachantesTable = false;
            updateAllTimers(); // Atualiza apenas os relógios dinâmicos
            return;
        }
        
        // Armazena o novo estado no cache e atualiza a interface
        lastAdminDataHash = currentHash;
        elements.despachantesTableBody.innerHTML = '';
        elements.despachantesEmpty.style.display = 'none';
        elements.despachantesTableBody.closest('.table-container').style.display = 'block';
        
        for (const { d, totalLinhas, pecasExpedidas, pecasTotais } of detailsMap) {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            
            // Formata datas
            const dateEntrada = new Date(d.data_criacao);
            const dateEntradaStr = `${dateEntrada.toLocaleDateString('pt-BR')} ${dateEntrada.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
            
            let dateLimiteStr = '---';
            if (d.data_limite) {
                const dateLimite = new Date(d.data_limite);
                dateLimiteStr = `${dateLimite.toLocaleDateString('pt-BR')} ${dateLimite.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
            }
            
            // Ações dependendo do status de conclusão (concluido === 1)
            let acoesHtml = '';
            if (d.concluido === 1) {
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
        if (document.hidden) return;
        
        // ==========================================
        // 1. FLUXO PARA A ABA DE EXPEDIÇÃO
        // ==========================================
        if (state.activeTab === 'expedicao') {
            if (!state.activeDespachanteId) return;
            
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
                console.warn("Erro ao sincronizar expedição em background:", e);
            }
        } 
        // ==========================================
        // 2. FLUXO PARA A ABA DE ADMINISTRAÇÃO
        // ==========================================
        else if (state.activeTab === 'administracao') {
            try {
                // Atualiza a tabela do painel de listas de despacho
                await renderDespachantesTable();
                
                // Atualiza a tabela de Auditoria com os logs correspondentes (globais ou da lista ativa)
                const targetLogId = state.activeDespachanteId || 0;
                const freshLogs = await db.getLogsByDespachante(targetLogId);
                
                let logsChanged = false;
                if (freshLogs.length !== state.logs.length) {
                    logsChanged = true;
                } else {
                    for (let i = 0; i < freshLogs.length; i++) {
                        if (freshLogs[i].id !== state.logs[i].id || freshLogs[i].timestamp !== state.logs[i].timestamp) {
                            logsChanged = true;
                            break;
                        }
                    }
                }
                
                if (logsChanged) {
                    state.logs = freshLogs;
                    renderLogs();
                }
            } catch (e) {
                console.warn("Erro ao sincronizar admin em background:", e);
            }
        }
    }, 2000);
}

function stopBackgroundSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}

// ==========================================
// 9. NOVAS FUNCIONALIDADES
// ==========================================

// -------------------------------------------------------
// 9.1. PALETA DE COMANDOS (Ideia 1)
// -------------------------------------------------------
let paletteOpen = false;

function openPalette() {
    const overlay = document.getElementById('palette-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    paletteOpen = true;
    
    setTimeout(() => {
        const searchInput = document.getElementById('palette-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
            filterPaletteCommands('');
        }
    }, 100);
}

function closePalette() {
    const overlay = document.getElementById('palette-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    paletteOpen = false;
}

function filterPaletteCommands(query) {
    const commands = document.querySelectorAll('.palette-command');
    const q = query.toLowerCase().trim();
    commands.forEach(cmd => {
        const label = cmd.querySelector('.cmd-label')?.textContent?.toLowerCase() || '';
        const key = cmd.querySelector('.cmd-key')?.textContent?.toLowerCase() || '';
        const action = cmd.getAttribute('data-action') || '';
        const match = !q || label.includes(q) || key.includes(q) || action.includes(q);
        cmd.style.display = match ? 'flex' : 'none';
    });
}

function executePaletteAction(action) {
    closePalette();
    switch (action) {
        case 'focus-search':
            document.getElementById('search-input')?.focus();
            break;
        case 'undo':
            undoLastAction();
            break;
        case 'fullscreen':
            toggleFullscreen();
            break;
        case 'filter-all':
            setFilter('all');
            break;
        case 'filter-pending':
            setFilter('pending');
            break;
        case 'filter-completed':
            setFilter('completed');
            break;
        case 'filter-noean':
            setFilter('noean');
            break;
        case 'tab-expedicao':
            switchTab('expedicao');
            break;
        case 'tab-admin':
            switchTab('administracao');
            break;
        case 'camera':
            if (state.activeDespachanteId) startCameraScanner();
            else showToast('Nenhuma Lista', 'Selecione uma lista primeiro.', 'error');
            break;
        case 'focus-barcode':
            if (!elements.barcodeInput.disabled) elements.barcodeInput.focus();
            break;
        case 'export-logs':
            exportLogsToCsv();
            break;
    }
}

function setFilter(filter) {
    state.filter = filter;
    document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === filter);
    });
    renderTable();
}

// Eventos da Paleta
document.addEventListener('DOMContentLoaded', () => {
    // Botão da paleta
    const btnPalette = document.getElementById('btn-palette');
    if (btnPalette) {
        btnPalette.addEventListener('click', openPalette);
    }
    
    // Fechar paleta
    const btnClosePalette = document.getElementById('btn-close-palette');
    if (btnClosePalette) {
        btnClosePalette.addEventListener('click', closePalette);
    }
    
    // Clique fora fecha
    document.getElementById('palette-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePalette();
    });
    
    // Busca na paleta
    const paletteSearch = document.getElementById('palette-search');
    if (paletteSearch) {
        paletteSearch.addEventListener('input', (e) => filterPaletteCommands(e.target.value));
        paletteSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closePalette();
            if (e.key === 'Enter') {
                const visible = document.querySelector('.palette-command[style*="display: flex"], .palette-command:not([style*="display: none"])');
                if (visible) {
                    executePaletteAction(visible.getAttribute('data-action'));
                }
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = [...document.querySelectorAll('.palette-command')].filter(el => el.style.display !== 'none');
                const currentIdx = items.indexOf(document.activeElement?.closest('.palette-command'));
                const nextIdx = e.key === 'ArrowDown' 
                    ? Math.min(currentIdx + 1, items.length - 1) 
                    : Math.max(currentIdx - 1, 0);
                if (items[nextIdx]) {
                    items[nextIdx].querySelector('.cmd-label')?.focus();
                    items[nextIdx].scrollIntoView({ block: 'nearest' });
                }
            }
        });
    }
    
    // Clique nos comandos
    document.querySelectorAll('.palette-command').forEach(cmd => {
        cmd.addEventListener('click', () => {
            executePaletteAction(cmd.getAttribute('data-action'));
        });
    });
});

// -------------------------------------------------------
// 9.2. ATALHOS DE TECLADO GLOBAIS (Ideia 1)
// -------------------------------------------------------
document.addEventListener('keydown', (e) => {
    // Se um modal estiver ativo, não processa atalhos
    if (state.errorModalActive || state.confirmModalActive) return;
    
    // Ctrl+K - Abrir paleta
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openPalette();
        return;
    }
    
    // Se a paleta estiver aberta, não processa outros atalhos
    if (paletteOpen) return;
    
    // Ctrl+Z - Desfazer
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoLastAction();
        return;
    }
    
    // Ctrl+F - Focar na busca
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
        return;
    }
    
    // Ctrl+B - Focar no campo de leitura
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (!elements.barcodeInput.disabled) elements.barcodeInput.focus();
        return;
    }
    
    // Ctrl+C - Abrir câmera
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (state.activeDespachanteId) startCameraScanner();
        return;
    }
    
    // Ctrl+E - Exportar logs
    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        exportLogsToCsv();
        return;
    }
    
    // Ctrl+1 / Ctrl+2 - Alternar abas
    if ((e.ctrlKey || e.metaKey) && (e.key === '1')) {
        e.preventDefault();
        switchTab('expedicao');
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '2')) {
        e.preventDefault();
        switchTab('administracao');
        return;
    }
    
    // Alt+1..4 - Filtros
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const filterMap = { '1': 'all', '2': 'pending', '3': 'completed', '4': 'noean' };
        if (filterMap[e.key]) {
            e.preventDefault();
            setFilter(filterMap[e.key]);
            return;
        }
    }
    
    // F11 - Fullscreen
    if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
    }
});

// -------------------------------------------------------
// 9.3. TELA CHEIA / FULLSCREEN (Ideia 10)
// -------------------------------------------------------
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.() || 
        document.documentElement.webkitRequestFullscreen?.() ||
        document.documentElement.msRequestFullscreen?.();
    } else {
        document.exitFullscreen?.() || 
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnFs = document.getElementById('btn-fullscreen');
    if (btnFs) {
        btnFs.addEventListener('click', toggleFullscreen);
    }
});

// -------------------------------------------------------
// 9.4. BOTÃO DESFAZER (UNDO) (Ideia 4)
// -------------------------------------------------------
let undoStack = []; // Pilha de ações para desfazer

function pushUndoState() {
    // Salva o estado atual dos itens para poder reverter
    const snapshot = state.items.map(item => ({
        id: item.id,
        quantidade: item.quantidade,
        expedido: item.expedido,
        dataExpedicao: item.dataExpedicao
    }));
    undoStack.push(snapshot);
    
    // Mantém no máximo 50 ações na pilha
    if (undoStack.length > 50) undoStack.shift();
    
    // Habilita o botão
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.disabled = false;
}

async function undoLastAction() {
    if (undoStack.length === 0) {
        showToast('Nada para desfazer', 'Nenhuma ação anterior registrada.', 'error');
        return;
    }
    
    const previousState = undoStack.pop();
    
    // Se não houver mais itens na pilha, desabilita o botão
    if (undoStack.length === 0) {
        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) btnUndo.disabled = true;
    }
    
    try {
        // Restaura cada item ao estado anterior
        for (const prev of previousState) {
            const currentItem = state.items.find(item => item.id === prev.id);
            if (currentItem) {
                currentItem.quantidade = prev.quantidade;
                currentItem.expedido = prev.expedido;
                currentItem.dataExpedicao = prev.dataExpedicao;
                
                // Atualiza no IndexedDB
                await db.updateItem(currentItem);
            }
        }
        
        // Remove o último log de auditoria (a ação que estamos desfazendo)
        if (state.logs.length > 0) {
            const lastLog = state.logs[0]; // logs são ordenados do mais recente para o mais antigo
            if (lastLog && lastLog.id) {
                try {
                    const transaction = db.db.transaction(['logs'], 'readwrite');
                    const store = transaction.objectStore('logs');
                    store.delete(lastLog.id);
                } catch (e) {
                    console.warn('Não foi possível remover o log do undo:', e);
                }
            }
        }
        
        // Recarrega os logs
        state.logs = await db.getLogsByDespachante(state.activeDespachanteId);
        
        // Re-renderiza
        renderTable();
        updateProgress();
        renderLogs();
        
        playSoundEffect('cancel');
        showToast('Ação Desfeita', 'Última operação foi revertida com sucesso.', 'success');
        
        // Se o despachante estava concluído e desfizemos, reabre
        if (state.items.some(item => !item.expedido)) {
            const despachante = await db.getDespachante(state.activeDespachanteId);
            if (despachante && despachante.concluido === 1) {
                await db.marcarDespachanteConcluido(state.activeDespachanteId);
                // Na verdade precisamos reverter: marcar como não concluído
                // Como não temos função específica, vamos manipular diretamente
                try {
                    const transaction = db.db.transaction(['despachantes'], 'readwrite');
                    const store = transaction.objectStore('despachantes');
                    const getReq = store.get(state.activeDespachanteId);
                    getReq.onsuccess = () => {
                        const d = getReq.result;
                        if (d) {
                            d.concluido = 0;
                            store.put(d);
                        }
                    };
                } catch (e) {
                    console.warn('Erro ao reabrir despachante:', e);
                }
                elements.expedicaoActiveTimer.setAttribute('data-concluido', '0');
            }
        }
    } catch (e) {
        console.error('Erro ao desfazer ação:', e);
        showToast('Erro ao Desfazer', 'Não foi possível reverter a última ação.', 'error');
    }
}

// Integração: chamar pushUndoState() antes de cada modificação
// Vamos modificar as funções existentes para usar o undo

// Monkey-patch: salva estado antes de processar leitura
const originalProcessBarcode = processBarcodeRead;
processBarcodeRead = async function(rawSku) {
    pushUndoState();
    return originalProcessBarcode.call(this, rawSku);
};

// Monkey-patch: salva estado antes de adicionar unidade manual
const originalManualAdd = window.manualAddUnit;
window.manualAddUnit = async function(id) {
    pushUndoState();
    return originalManualAdd.call(this, id);
};

// Monkey-patch: salva estado antes de confirmar sem EAN
const originalConfirmYes = confirmNoEanYes;
confirmNoEanYes = async function() {
    pushUndoState();
    return originalConfirmYes.call(this);
};

// Evento do botão Undo
document.addEventListener('DOMContentLoaded', () => {
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', undoLastAction);
    }
});

// -------------------------------------------------------
// 9.5. LANTERNA NO SCANNER (Ideia 19)
// -------------------------------------------------------
let torchEnabled = false;
let torchTrack = null;

function toggleTorch() {
    if (!torchTrack) {
        showToast('Câmera não ativa', 'Abra a câmera primeiro para usar a lanterna.', 'error');
        return;
    }
    
    torchEnabled = !torchEnabled;
    
    try {
        // Tenta usar a API ImageCapture para acionar o flash
        if (torchTrack.getCapabilities) {
            const capabilities = torchTrack.getCapabilities();
            if (capabilities.torch) {
                torchTrack.applyConstraints({
                    advanced: [{ torch: torchEnabled }]
                }).then(() => {
                    const btnTorch = document.getElementById('btn-torch');
                    if (btnTorch) {
                        btnTorch.classList.toggle('active', torchEnabled);
                        btnTorch.textContent = torchEnabled ? '🔦 Lanterna ON' : '🔦 Lanterna';
                    }
                }).catch(err => {
                    console.warn('Falha ao alternar lanterna:', err);
                    showToast('Lanterna Indisponível', 'Seu dispositivo não suporta flash ou a câmera não permite.', 'error');
                    torchEnabled = false;
                });
            } else {
                showToast('Lanterna Indisponível', 'Este dispositivo não possui flash na câmera.', 'error');
                torchEnabled = false;
            }
        } else {
            showToast('Lanterna Indisponível', 'API de flash não suportada neste navegador.', 'error');
            torchEnabled = false;
        }
    } catch (e) {
        console.warn('Erro ao controlar lanterna:', e);
        torchEnabled = false;
    }
}

// Modifica o startCameraScanner para capturar a track de vídeo
const originalStartCamera = startCameraScanner;
startCameraScanner = function() {
    if (state.scannerActive) return;
    
    elements.cameraScannerContainer.classList.add('active');
    state.scannerActive = true;
    elements.barcodeInput.disabled = true;
    
    // Reseta estado da lanterna
    torchEnabled = false;
    const btnTorch = document.getElementById('btn-torch');
    if (btnTorch) {
        btnTorch.classList.remove('active');
        btnTorch.textContent = '🔦 Lanterna';
        btnTorch.disabled = false;
    }
    
    html5QrcodeScanner = new Html5Qrcode("camera-reader");
    
    const config = {
        fps: 15,
        qrbox: (width, height) => {
            return { 
                width: Math.min(width * 0.85, 340), 
                height: Math.min(height * 0.55, 75) 
            };
        }
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            if (state.errorModalActive) return;
            stopCameraScanner(true);
            processBarcodeRead(decodedText);
            setTimeout(() => {
                if (!state.errorModalActive && elements.cameraScannerContainer.classList.contains('active')) {
                    startCameraScanner();
                }
            }, 1500);
        },
        (errorMessage) => {}
    ).then(() => {
        // Tenta capturar a track de vídeo para controle da lanterna
        try {
            const videoElement = document.querySelector('#camera-reader video');
            if (videoElement && videoElement.srcObject) {
                const tracks = videoElement.srcObject.getVideoTracks();
                if (tracks.length > 0) {
                    torchTrack = tracks[0];
                }
            }
        } catch (e) {
            console.warn('Não foi possível capturar track de vídeo:', e);
        }
    }).catch(err => {
        console.error('Erro ao iniciar câmera:', err);
        showToast('Erro de Câmera', 'Não foi possível acessar a câmera do dispositivo.', 'error');
        stopCameraScanner();
    });
};

// Modifica stopCameraScanner para limpar a track
const originalStopCamera = stopCameraScanner;
stopCameraScanner = function(keepGuidedMode = false) {
    torchEnabled = false;
    torchTrack = null;
    const btnTorch = document.getElementById('btn-torch');
    if (btnTorch) {
        btnTorch.classList.remove('active');
        btnTorch.textContent = '🔦 Lanterna';
        btnTorch.disabled = true;
    }
    return originalStopCamera.call(this, keepGuidedMode);
};

// Evento do botão da lanterna
document.addEventListener('DOMContentLoaded', () => {
    const btnTorch = document.getElementById('btn-torch');
    if (btnTorch) {
        btnTorch.addEventListener('click', toggleTorch);
    }
});

// -------------------------------------------------------
// 9.6. NOTIFICAÇÕES PUSH (Ideia 15)
// -------------------------------------------------------
function sendPushNotification(title, body) {
    // Verifica se a API de notificação está disponível
    if (!('Notification' in window)) return;
    
    // Verifica permissão
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'favicon.svg',
            tag: 'expedicao-notification'
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, {
                    body: body,
                    icon: 'favicon.svg',
                    tag: 'expedicao-notification'
                });
            }
        });
    }
}

// Dispara notificação quando a lista é finalizada
const originalCheckAllCompleted = checkAllCompleted;
checkAllCompleted = async function() {
    const result = await originalCheckAllCompleted.call(this);
    
    const totalPendentes = state.items.reduce((acc, item) => acc + item.quantidade, 0);
    if (totalPendentes === 0 && state.items.length > 0) {
        sendPushNotification(
            '🎉 Expedição Finalizada!',
            `Lista de "${state.activeDespachanteNome}" concluída com ${state.items.length} itens.`
        );
    }
    return result;
};

// Dispara notificação quando o prazo está próximo (verificado a cada 30s)
let deadlineWarningShown = false;
setInterval(() => {
    if (!state.activeDespachanteId) return;
    
    const timerEl = document.getElementById('expedicao-active-timer');
    if (!timerEl) return;
    
    const isConcluido = timerEl.getAttribute('data-concluido') === '1';
    if (isConcluido) return;
    
    const deadlineStr = timerEl.getAttribute('data-deadline');
    if (!deadlineStr) return;
    
    const deadline = new Date(deadlineStr).getTime();
    const now = new Date().getTime();
    const diff = deadline - now;
    
    // Avisa quando faltar 5 minutos
    if (diff > 0 && diff < 5 * 60 * 1000 && !deadlineWarningShown) {
        deadlineWarningShown = true;
        sendPushNotification(
            '⏰ Prazo Próximo!',
            `Faltam menos de 5 minutos para o prazo limite de "${state.activeDespachanteNome}".`
        );
    }
    
    // Reseta o aviso se o prazo passar ou mudar de despachante
    if (diff > 10 * 60 * 1000) {
        deadlineWarningShown = false;
    }
}, 30000);

// -------------------------------------------------------
// 9.7. MODO OFFLINE COM FILA DE SINCRONIZAÇÃO (Ideia 17)
// -------------------------------------------------------
class OfflineQueue {
    constructor() {
        this.queueName = 'expedicao_offline_queue';
        this.isProcessing = false;
    }
    
    async add(operation) {
        const queue = await this.getQueue();
        queue.push({
            ...operation,
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random()
        });
        await this.saveQueue(queue);
        
        // Tenta processar imediatamente
        this.process();
    }
    
    async getQueue() {
        try {
            const data = localStorage.getItem(this.queueName);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }
    
    async saveQueue(queue) {
        localStorage.setItem(this.queueName, JSON.stringify(queue));
        this.updateBadge();
    }
    
    updateBadge() {
        this.getQueue().then(queue => {
            const badge = document.getElementById('offline-queue-badge');
            if (badge) {
                if (queue.length > 0) {
                    badge.textContent = queue.length;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    }
    
    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        // Verifica se está online
        if (!navigator.onLine) {
            this.isProcessing = false;
            return;
        }
        
        const queue = await this.getQueue();
        if (queue.length === 0) {
            this.isProcessing = false;
            return;
        }
        
        const failedOps = [];
        
        for (const op of queue) {
            try {
                // Tenta executar a operação via API
                if (op.type === 'update_item') {
                    await db.apiPost('update_item', { item: op.data });
                } else if (op.type === 'add_log') {
                    await db.apiPost('add_log', { log: op.data });
                } else if (op.type === 'save_itens') {
                    await db.apiPost('save_itens', { 
                        itens: op.data.itens, 
                        despachante_id: op.data.despachante_id 
                    });
                }
            } catch (e) {
                console.warn('Falha ao sincronizar operação offline:', e);
                failedOps.push(op);
            }
        }
        
        // Salva apenas as que falharam
        await this.saveQueue(failedOps);
        this.isProcessing = false;
        
        if (failedOps.length === 0 && queue.length > 0) {
            showToast('Sincronizado!', `${queue.length} operações enviadas ao servidor.`, 'success');
        }
    }
}

// Instância global da fila offline
const offlineQueue = new OfflineQueue();

// Monitora status da conexão
window.addEventListener('online', () => {
    showToast('Conexão Restaurada', 'Sincronizando dados pendentes...', 'success');
    offlineQueue.process();
    
    // Recarrega dados
    if (state.activeDespachanteId) {
        loadDespachanteData(state.activeDespachanteId);
    }
});

window.addEventListener('offline', () => {
    showToast('Modo Offline', 'Conexão perdida. Operações serão salvas localmente.', 'error');
});

// Integração: toda operação de escrita no banco passa pela fila offline
// quando não está em localhost
const originalUpdateItem = db.updateItem;
db.updateItem = async function(item) {
    if (!this.isLocal && !navigator.onLine) {
        await offlineQueue.add({
            type: 'update_item',
            data: item
        });
    }
    return originalUpdateItem.call(this, item);
};

const originalAddLog = db.addLog;
db.addLog = async function(logEntry) {
    if (!this.isLocal && !navigator.onLine) {
        await offlineQueue.add({
            type: 'add_log',
            data: logEntry
        });
    }
    return originalAddLog.call(this, logEntry);
};

const originalSaveItens = db.saveItens;
db.saveItens = async function(itens, despachanteId) {
    if (!this.isLocal && !navigator.onLine) {
        await offlineQueue.add({
            type: 'save_itens',
            data: { itens, despachante_id: despachanteId }
        });
    }
    return originalSaveItens.call(this, itens, despachanteId);
};

// Adiciona badge de fila offline no header
document.addEventListener('DOMContentLoaded', () => {
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const badge = document.createElement('span');
        badge.id = 'offline-queue-badge';
        badge.style.cssText = 'display:none; background:var(--warning); color:#000; font-size:10px; font-weight:700; padding:2px 6px; border-radius:999px; align-items:center; justify-content:center; min-width:18px; height:18px;';
        badge.title = 'Operações pendentes de sincronização';
        headerActions.insertBefore(badge, headerActions.firstChild);
    }
    
    // Inicializa badge
    offlineQueue.updateBadge();
});

// -------------------------------------------------------
// 9.8. SCANNER MÃOS-LIVRES (Ideia 21)
// -------------------------------------------------------
let handsFreeMode = false;

function toggleHandsFree() {
    handsFreeMode = !handsFreeMode;
    
    if (handsFreeMode) {
        // Se não há lista ativa, não ativa
        if (!state.activeDespachanteId) {
            handsFreeMode = false;
            showToast('Sem lista ativa', 'Selecione uma lista primeiro.', 'error');
            return;
        }
        // Abre a câmera automaticamente
        startCameraScanner();
        showToast('Modo Mãos-Livres Ativo', 'Aproxime o código da câmera. A leitura é automática!', 'success');
        
        // Mostra indicador visual no header
        const indicator = document.getElementById('hands-free-indicator') || createHandsFreeIndicator();
        indicator.style.display = 'flex';
    } else {
        stopCameraScanner();
        showToast('Modo Mãos-Livres Desativado', 'Voltando ao modo manual.', 'info');
        
        const indicator = document.getElementById('hands-free-indicator');
        if (indicator) indicator.style.display = 'none';
    }
}

function createHandsFreeIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'hands-free-indicator';
    indicator.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:100001; background:rgba(16,185,129,0.9); color:#000; padding:8px 18px; border-radius:999px; font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; box-shadow:0 4px 20px rgba(16,185,129,0.4); animation:pulse 2s infinite;';
    indicator.innerHTML = `
        <span style="width:8px;height:8px;background:#fff;border-radius:50%;display:inline-block;animation:pulse 1s infinite;"></span>
        Mãos-Livres Ativo
        <button onclick="toggleHandsFree()" style="background:rgba(0,0,0,0.2);border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font-weight:700;">✕</button>
    `;
    document.body.appendChild(indicator);
    return indicator;
}

// Modifica o scanner para ficar contínuo no modo mãos-livres
const originalStartCameraMao = startCameraScanner;
startCameraScanner = function() {
    if (state.scannerActive) return;
    
    elements.cameraScannerContainer.classList.add('active');
    state.scannerActive = true;
    elements.barcodeInput.disabled = true;
    
    // Reseta estado da lanterna
    torchEnabled = false;
    const btnTorch = document.getElementById('btn-torch');
    if (btnTorch) {
        btnTorch.classList.remove('active');
        btnTorch.textContent = '🔦 Lanterna';
        btnTorch.disabled = false;
    }
    
    html5QrcodeScanner = new Html5Qrcode("camera-reader");
    
    const config = {
        fps: 15,
        qrbox: (width, height) => {
            return { 
                width: Math.min(width * 0.85, 340), 
                height: Math.min(height * 0.55, 75) 
            };
        }
    };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            if (state.errorModalActive) return;
            
            if (handsFreeMode) {
                // Modo mãos-livres: pausa, processa, reinicia automaticamente
                html5QrcodeScanner.pause();
                processBarcodeRead(decodedText);
                setTimeout(() => {
                    if (handsFreeMode && !state.errorModalActive && elements.cameraScannerContainer.classList.contains('active')) {
                        try { html5QrcodeScanner.resume(); } catch(e) {}
                    }
                }, 2000);
            } else {
                // Modo normal: comportamento original
                stopCameraScanner(true);
                processBarcodeRead(decodedText);
                setTimeout(() => {
                    if (!state.errorModalActive && elements.cameraScannerContainer.classList.contains('active')) {
                        startCameraScanner();
                    }
                }, 1500);
            }
        },
        (errorMessage) => {}
    ).then(() => {
        try {
            const videoElement = document.querySelector('#camera-reader video');
            if (videoElement && videoElement.srcObject) {
                const tracks = videoElement.srcObject.getVideoTracks();
                if (tracks.length > 0) {
                    torchTrack = tracks[0];
                }
            }
        } catch (e) {}
    }).catch(err => {
        console.error('Erro ao iniciar câmera:', err);
        showToast('Erro de Câmera', 'Não foi possível acessar a câmera do dispositivo.', 'error');
        stopCameraScanner();
    });
};

// Modifica stopCameraScanner para limpar modo mãos-livres
const originalStopCameraMao = stopCameraScanner;
stopCameraScanner = function(keepGuidedMode = false) {
    torchEnabled = false;
    torchTrack = null;
    const btnTorch = document.getElementById('btn-torch');
    if (btnTorch) {
        btnTorch.classList.remove('active');
        btnTorch.textContent = '🔦 Lanterna';
        btnTorch.disabled = true;
    }
    
    // Limpa indicador mãos-livres se parou a câmera
    if (handsFreeMode && !keepGuidedMode) {
        handsFreeMode = false;
        const indicator = document.getElementById('hands-free-indicator');
        if (indicator) indicator.style.display = 'none';
    }
    
    if (!state.scannerActive) return;
    state.scannerActive = false;
    elements.cameraScannerContainer.classList.remove('active');
    elements.barcodeInput.disabled = false;
    
    if (state.focusedItemId && !keepGuidedMode) {
        deactivateFocusedItemMode();
    }
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error('Erro ao parar scanner:', err);
            html5QrcodeScanner = null;
        });
    }
};

// Adiciona toggle mãos-livres no reader card
document.addEventListener('DOMContentLoaded', () => {
    const readerOptions = document.querySelector('.reader-options');
    if (readerOptions) {
        const btnHandsFree = document.createElement('button');
        btnHandsFree.id = 'btn-hands-free';
        btnHandsFree.className = 'btn btn-outline w-full';
        btnHandsFree.disabled = true;
        btnHandsFree.innerHTML = '✋ Mãos-Livres';
        btnHandsFree.addEventListener('click', toggleHandsFree);
        readerOptions.appendChild(btnHandsFree);
    }
    
    // Habilita botão junto com os outros
    const origLoad = loadDespachanteData;
    loadDespachanteData = async function(id) {
        await origLoad.call(this, id);
        const btnHF = document.getElementById('btn-hands-free');
        if (btnHF) {
            btnHF.disabled = !id;
        }
    };
});

// -------------------------------------------------------
// 9.9. CONFIRMAÇÃO POR VOZ — TTS (Ideia 22)
// -------------------------------------------------------
let ttsEnabled = true;
let ttsVoice = null;
let ttsUtterance = null;

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    localStorage.setItem('expedicao_tts', ttsEnabled ? '1' : '0');
    
    const btnTTS = document.getElementById('btn-tts-toggle');
    if (btnTTS) {
        btnTTS.classList.toggle('active', ttsEnabled);
        btnTTS.querySelector('span').textContent = ttsEnabled ? '🔊' : '🔇';
        btnTTS.title = ttsEnabled ? 'Confirmação por Voz (Clique para desativar)' : 'Confirmação por Voz (Clique para ativar)';
    }
    
    showToast(ttsEnabled ? 'Voz Ativada' : 'Voz Desativada', 
        ttsEnabled ? 'O sistema falará o nome dos produtos após cada leitura.' : 'Confirmação por voz desligada.', 'success');
}

function speakText(text) {
    if (!ttsEnabled) return;
    if (!('speechSynthesis' in window)) return;
    
    // Cancela fala anterior se ainda estiver falando
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    // Seleciona voz em português se disponível
    if (!ttsVoice) {
        const voices = speechSynthesis.getVoices();
        ttsVoice = voices.find(v => v.lang.startsWith('pt')) || voices[0];
    }
    
    ttsUtterance = new SpeechSynthesisUtterance(text);
    ttsUtterance.lang = 'pt-BR';
    ttsUtterance.rate = 1.1;
    ttsUtterance.pitch = 1.0;
    ttsUtterance.volume = 1.0;
    if (ttsVoice) ttsUtterance.voice = ttsVoice;
    
    speechSynthesis.speak(ttsUtterance);
}

// Integra TTS nas funções de feedback
const originalProcessTTS = processBarcodeRead;
processBarcodeRead = async function(rawSku) {
    const result = await originalProcessTTS.call(this, rawSku);
    
    // Fala o último item processado
    if (ttsEnabled && state.items.length > 0) {
        const lastExpedido = state.items.find(item => item.dataExpedicao && new Date(item.dataExpedicao).getTime() > Date.now() - 2000);
        if (lastExpedido) {
            const text = `${lastExpedido.descricao}. Restam ${lastExpedido.quantidade} unidades.`;
            speakText(text);
        }
    }
    return result;
};

const originalManualTTS = window.manualAddUnit;
window.manualAddUnit = async function(id) {
    await originalManualTTS.call(this, id);
    const item = state.items.find(i => i.id === id);
    if (item && ttsEnabled) {
        speakText(`${item.descricao}. Restam ${item.quantidade} unidades.`);
    }
};

// Inicializa TTS
document.addEventListener('DOMContentLoaded', () => {
    // Carrega preferência salva
    const savedTTS = localStorage.getItem('expedicao_tts');
    if (savedTTS === '0') {
        ttsEnabled = false;
    }
    
    const btnTTS = document.getElementById('btn-tts-toggle');
    if (btnTTS) {
        btnTTS.classList.toggle('active', ttsEnabled);
        btnTTS.querySelector('span').textContent = ttsEnabled ? '🔊' : '🔇';
        btnTTS.addEventListener('click', toggleTTS);
    }
    
    // Carrega vozes disponíveis
    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices(); // Força carregamento
        setTimeout(() => {
            ttsVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('pt')) || null;
        }, 500);
    }
});

// -------------------------------------------------------
// 9.10. MODO TURBO (Ideia 28)
// -------------------------------------------------------
let turboMode = false;

function toggleTurboMode() {
    turboMode = !turboMode;
    localStorage.setItem('expedicao_turbo', turboMode ? '1' : '0');
    
    document.body.classList.toggle('turbo-mode', turboMode);
    
    const btnTurbo = document.getElementById('btn-turbo-toggle');
    if (btnTurbo) {
        btnTurbo.classList.toggle('active', turboMode);
        btnTurbo.querySelector('span').textContent = turboMode ? '⚡' : '⚡';
        btnTurbo.title = turboMode ? 'Modo Turbo Ativo (animações desligadas)' : 'Modo Turbo (sem animações)';
    }
    
    showToast(turboMode ? 'Modo Turbo Ativado' : 'Modo Turbo Desativado', 
        turboMode ? 'Animações desligadas para máxima performance.' : 'Animações restauradas.', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTurbo = localStorage.getItem('expedicao_turbo');
    if (savedTurbo === '1') {
        turboMode = true;
        document.body.classList.add('turbo-mode');
    }
    
    const btnTurbo = document.getElementById('btn-turbo-toggle');
    if (btnTurbo) {
        btnTurbo.classList.toggle('active', turboMode);
        btnTurbo.addEventListener('click', toggleTurboMode);
    }
});

// -------------------------------------------------------
// 9.11. EXPORTAR ROMANEIO (Ideia 29)
// -------------------------------------------------------
function printRomaneio() {
    if (!state.activeDespachanteId || state.items.length === 0) {
        showToast('Nada para imprimir', 'Selecione uma lista com itens primeiro.', 'error');
        return;
    }
    
    // Agrupa itens por nota fiscal
    const grupos = {};
    state.items.forEach(item => {
        if (!grupos[item.nota]) grupos[item.nota] = [];
        grupos[item.nota].push(item);
    });
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
    
    // Monta HTML do romaneio
    let itensHtml = '';
    Object.keys(grupos).forEach(nota => {
        const itens = grupos[nota];
        itensHtml += `<tr><td colspan="5" style="font-weight:700;padding-top:8px;font-size:11px;">📄 ${nota}</td></tr>`;
        itens.forEach(item => {
            const status = item.expedido ? '✅' : '⬜';
            itensHtml += `<tr>
                <td>${item.sku}</td>
                <td>${item.descricao.substring(0, 28)}</td>
                <td>${item.quantidade}</td>
                <td>${item.quantidadeOriginal}</td>
                <td>${status}</td>
            </tr>`;
        });
    });
    
    const totalItens = state.items.length;
    const totalPecas = state.items.reduce((acc, item) => acc + item.quantidadeOriginal, 0);
    const expedidas = state.items.reduce((acc, item) => acc + (item.quantidadeOriginal - item.quantidade), 0);
    const pct = totalPecas > 0 ? Math.round((expedidas / totalPecas) * 100) : 0;
    
    const romaneioHtml = `
    <div class="romaneio-page">
        <h1>📋 ROMANEIO</h1>
        <div class="romaneio-sub">
            <strong>${state.activeDespachanteNome}</strong><br>
            ${dateStr}<br>
            ${totalItens} itens · ${expedidas}/${totalPecas} peças (${pct}%)
        </div>
        <table>
            <thead>
                <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Rest.</th>
                    <th>Total</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${itensHtml}
            </tbody>
        </table>
        <div class="romaneio-qr">
            ● Acesse: ${window.location.origin}${window.location.pathname} para conferência digital ●
        </div>
        <div class="romaneio-footer">
            Documento gerado em ${dateStr} · Expedição Inteligente
        </div>
    </div>`;
    
    // Abre nova janela para impressão
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Romaneio - ${state.activeDespachanteNome}</title>
            <style>
                body { margin:0; padding:0; background:#fff; }
                @page { size: 80mm auto; margin: 5mm; }
                @media print {
                    body { margin:0; padding:0; }
                }
            </style>
        </head>
        <body>
            ${romaneioHtml}
            <script>
                window.onload = function() { window.print(); window.close(); }
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Adiciona botão de romaneio
document.addEventListener('DOMContentLoaded', () => {
    const progressCard = document.getElementById('progress-card');
    if (progressCard) {
        const actionsRow = progressCard.querySelector('.despachante-actions-row');
        if (actionsRow) {
            const btnRomaneio = document.createElement('button');
            btnRomaneio.id = 'btn-romaneio';
            btnRomaneio.className = 'btn btn-secondary';
            btnRomaneio.style.cssText = 'flex:1; padding:10px 6px; font-size:12.5px; margin:0; white-space:nowrap;';
            btnRomaneio.textContent = '🖨️ Romaneio';
            btnRomaneio.addEventListener('click', printRomaneio);
            actionsRow.insertBefore(btnRomaneio, actionsRow.children[0]);
        }
    }
});

// -------------------------------------------------------
// 9.12. BACKUP AUTOMÁTICO (Ideia 30)
// -------------------------------------------------------
class BackupManager {
    constructor() {
        this.backupKey = 'expedicao_backup';
        this.restoreKey = 'expedicao_restore_point';
        this.intervalId = null;
    }
    
    start() {
        // Faz backup a cada 5 minutos
        this.intervalId = setInterval(() => this.save(), 5 * 60 * 1000);
        
        // Também salva antes de fechar a janela
        window.addEventListener('beforeunload', () => this.save());
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    
    async save() {
        try {
            if (!state.activeDespachanteId) return;
            
            const backup = {
                timestamp: new Date().toISOString(),
                despachanteId: state.activeDespachanteId,
                despachanteNome: state.activeDespachanteNome,
                items: state.items.map(item => ({
                    id: item.id,
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
                    dataExpedicao: item.dataExpedicao
                })),
                logs: state.logs.slice(0, 50) // Últimos 50 logs
            };
            
            localStorage.setItem(this.backupKey, JSON.stringify(backup));
        } catch (e) {
            console.warn('Erro ao salvar backup automático:', e);
        }
    }
    
    hasBackup() {
        const data = localStorage.getItem(this.backupKey);
        return data && JSON.parse(data).items && JSON.parse(data).items.length > 0;
    }
    
    getBackupInfo() {
        try {
            const data = localStorage.getItem(this.backupKey);
            if (!data) return null;
            const backup = JSON.parse(data);
            return {
                data: backup.timestamp ? new Date(backup.timestamp).toLocaleString('pt-BR') : 'Desconhecida',
                itens: backup.items?.length || 0,
                despachante: backup.despachanteNome || '---'
            };
        } catch {
            return null;
        }
    }
    
    async restore() {
        try {
            const data = localStorage.getItem(this.backupKey);
            if (!data) {
                showToast('Nenhum Backup', 'Não há backup disponível para restaurar.', 'error');
                return false;
            }
            
            const backup = JSON.parse(data);
            
            // Verifica se os itens ainda existem no IndexedDB
            if (backup.despachanteId) {
                const despachante = await db.getDespachante(backup.despachanteId);
                if (despachante) {
                    // Restaura os itens no state
                    state.items = backup.items;
                    state.activeDespachanteId = backup.despachanteId;
                    state.activeDespachanteNome = backup.despachanteNome;
                    state.logs = backup.logs || [];
                    
                    // Re-renderiza
                    renderTable();
                    updateProgress();
                    renderLogs();
                    
                    showToast('Backup Restaurado', `${backup.items.length} itens recuperados do backup automático.`, 'success');
                    return true;
                } else {
                    showToast('Despachante não encontrado', 'O despachante do backup foi removido. Crie uma nova lista.', 'error');
                    return false;
                }
            }
        } catch (e) {
            console.error('Erro ao restaurar backup:', e);
            showToast('Erro na Restauração', 'Não foi possível ler o backup.', 'error');
            return false;
        }
    }
}

const backupManager = new BackupManager();

// Botão de restaurar backup na administração
document.addEventListener('DOMContentLoaded', () => {
    // Adiciona botão de restaurar backup na aba de administração
    const importCard = document.getElementById('import-card');
    if (importCard) {
        const restoreBtn = document.createElement('button');
        restoreBtn.id = 'btn-restore-backup';
        restoreBtn.className = 'btn btn-outline w-full';
        restoreBtn.style.marginTop = '8px';
        restoreBtn.innerHTML = '💾 Restaurar Backup Automático';
        
        // Verifica se há backup e atualiza texto
        function updateRestoreBtn() {
            const info = backupManager.getBackupInfo();
            if (info) {
                restoreBtn.innerHTML = `💾 Restaurar Backup (${info.despachante} - ${info.itens} itens - ${info.data})`;
                restoreBtn.disabled = false;
            } else {
                restoreBtn.innerHTML = '💾 Nenhum Backup Disponível';
                restoreBtn.disabled = true;
            }
        }
        
        restoreBtn.addEventListener('click', async () => {
            await backupManager.restore();
            updateRestoreBtn();
        });
        
        importCard.appendChild(restoreBtn);
        
        // Atualiza a cada 10s
        setInterval(updateRestoreBtn, 10000);
        setTimeout(updateRestoreBtn, 500);
    }
    
    // Inicia backup automático
    backupManager.start();
});

// ==========================================
// 9.13. FLASH VERDE/VERMELHO NA LEITURA (Ideia 3.3)
// ==========================================
let flashEnabled = true;

function showReaderFlash(type) {
    if (!flashEnabled) return;
    
    const flash = document.createElement('div');
    flash.className = `reader-flash ${type}`;
    document.body.appendChild(flash);
    
    setTimeout(() => {
        if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 500);
}

// Integra flash nas funções de leitura
const originalFlashProcess = processBarcodeRead;
processBarcodeRead = async function(rawSku) {
    const result = await originalFlashProcess.call(this, rawSku);
    
    // Verifica se houve match ou erro pelo toast exibido
    // O flash é disparado junto com o feedback
    return result;
};

// Dispara flash manualmente nos pontos certos
const originalShowComplete = checkAllCompleted;
checkAllCompleted = async function() {
    const result = await originalShowComplete.call(this);
    if (state.items.every(item => item.expedido)) {
        showReaderFlash('success');
    }
    return result;
};

// Configuração do flash
function setupFlashConfig() {
    const popupFlash = document.getElementById('popup-config-flash');
    if (popupFlash) {
        const saved = localStorage.getItem('expedicao_flash');
        flashEnabled = saved !== 'false';
        popupFlash.checked = flashEnabled;
        
        popupFlash.addEventListener('change', () => {
            flashEnabled = popupFlash.checked;
            localStorage.setItem('expedicao_flash', flashEnabled ? '1' : '0');
        });
    }
}

document.addEventListener('DOMContentLoaded', setupFlashConfig);

// -------------------------------------------------------
// 9.14. NOTIFICAÇÃO WHATSAPP (Ideia 3.4)
// -------------------------------------------------------
let whatsappEnabled = false;
let whatsappNumber = '';

function sendWhatsApp(message) {
    if (!whatsappEnabled || !whatsappNumber) return;
    
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${whatsappNumber}?text=${encoded}`;
    window.open(url, '_blank');
}

function setupWhatsAppConfig() {
    const popupWA = document.getElementById('popup-config-whatsapp');
    const popupWANumber = document.getElementById('popup-config-whatsapp-number');
    const popupNumberInput = document.getElementById('popup-whatsapp-number-input');
    
    if (popupWA && popupNumberInput) {
        // Carrega configurações salvas
        const saved = localStorage.getItem('expedicao_whatsapp');
        whatsappEnabled = saved === '1';
        popupWA.checked = whatsappEnabled;
        
        const savedNumber = localStorage.getItem('expedicao_whatsapp_number') || '';
        whatsappNumber = savedNumber;
        popupNumberInput.value = savedNumber;
        
        if (popupWANumber) {
            popupWANumber.style.display = whatsappEnabled ? 'block' : 'none';
        }
        
        popupWA.addEventListener('change', () => {
            whatsappEnabled = popupWA.checked;
            localStorage.setItem('expedicao_whatsapp', whatsappEnabled ? '1' : '0');
            if (popupWANumber) {
                popupWANumber.style.display = whatsappEnabled ? 'block' : 'none';
            }
        });
        
        popupNumberInput.addEventListener('input', () => {
            whatsappNumber = popupNumberInput.value.replace(/\D/g, '');
            localStorage.setItem('expedicao_whatsapp_number', whatsappNumber);
        });
    }
}

// Integra WhatsApp no checkAllCompleted
const originalWACheck = checkAllCompleted;
checkAllCompleted = async function() {
    const result = await originalWACheck.call(this);
    
    const totalPendentes = state.items.reduce((acc, item) => acc + item.quantidade, 0);
    if (totalPendentes === 0 && state.items.length > 0 && whatsappEnabled && whatsappNumber) {
        const totalItens = state.items.length;
        const totalPecas = state.items.reduce((acc, item) => acc + item.quantidadeOriginal, 0);
        const nome = state.activeDespachanteNome || 'Despachante';
        
        // Calcula tempo gasto
        const primeiroLog = state.logs[state.logs.length - 1];
        const ultimoLog = state.logs[0];
        let tempoTexto = '';
        if (primeiroLog && ultimoLog) {
            const inicio = new Date(primeiroLog.timestamp);
            const fim = new Date(ultimoLog.timestamp);
            const diffMin = Math.round((fim - inicio) / 60000);
            if (diffMin > 0) {
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                tempoTexto = h > 0 ? `${h}h${m}min` : `${m}min`;
            }
        }
        
        const prazo = document.getElementById('expedicao-active-timer')?.getAttribute('data-deadline') || '';
        const prazoTexto = prazo ? new Date(prazo).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '---';
        
        const mensagem = `🎉 *Expedição Finalizada!*\n\n📋 Lista: ${nome}\n📦 Itens: ${totalItens}\n📦 Peças: ${totalPecas}\n⏱️ Tempo: ${tempoTexto || '---'}\n⏰ Prazo: ${prazoTexto}\n\n✅ Todos os produtos conferidos e expedidos com sucesso!`;
        
        setTimeout(() => {
            if (confirm(`📱 Deseja enviar notificação no WhatsApp para o gestor?`)) {
                sendWhatsApp(mensagem);
            }
        }, 1500);
    }
    
    return result;
};

document.addEventListener('DOMContentLoaded', setupWhatsAppConfig);

// -------------------------------------------------------
// 9.15. CHECKLIST COM FOTO (Ideia 3.5)
// -------------------------------------------------------
let fotoEnabled = false;

function setupFotoConfig() {
    const popupFoto = document.getElementById('popup-config-foto');
    if (popupFoto) {
        const saved = localStorage.getItem('expedicao_foto');
        fotoEnabled = saved === '1';
        popupFoto.checked = fotoEnabled;
        
        popupFoto.addEventListener('change', () => {
            fotoEnabled = popupFoto.checked;
            localStorage.setItem('expedicao_foto', fotoEnabled ? '1' : '0');
        });
    }
}

async function takeFoto(item) {
    if (!fotoEnabled) return null;
    
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) { resolve(null); return; }
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target.result;
                
                // Salva a foto no log do item
                if (item && item.id) {
                    try {
                        const fotos = JSON.parse(localStorage.getItem('expedicao_fotos') || '{}');
                        fotos[item.id] = {
                            data: base64,
                            timestamp: new Date().toISOString(),
                            sku: item.sku,
                            descricao: item.descricao
                        };
                        localStorage.setItem('expedicao_fotos', JSON.stringify(fotos));
                    } catch (e) {
                        console.warn('Erro ao salvar foto:', e);
                    }
                }
                
                resolve(base64);
            };
            reader.readAsDataURL(file);
        };
        
        input.click();
    });
}

function showFoto(itemId) {
    try {
        const fotos = JSON.parse(localStorage.getItem('expedicao_fotos') || '{}');
        const foto = fotos[itemId];
        if (!foto) {
            showToast('Sem Foto', 'Este item não possui foto registrada.', 'info');
            return;
        }
        
        // Abre modal com a foto
        const modal = document.getElementById('foto-modal') || createFotoModal();
        const img = modal.querySelector('img');
        if (img) {
            img.src = foto.data;
        }
        modal.style.display = 'flex';
    } catch (e) {
        console.warn('Erro ao carregar foto:', e);
    }
}

function createFotoModal() {
    const modal = document.createElement('div');
    modal.id = 'foto-modal';
    modal.innerHTML = `
        <img src="" alt="Foto do item">
        <button class="foto-close" onclick="document.getElementById('foto-modal').style.display='none'">✕</button>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
    document.body.appendChild(modal);
    return modal;
}

// Integra foto no manualAddUnit e processBarcodeRead
const originalManualFoto = window.manualAddUnit;
window.manualAddUnit = async function(id) {
    const item = state.items.find(i => i.id === id);
    if (item && !item.expedido) {
        // Se for o último item, pergunta se quer tirar foto
        const willComplete = item.quantidade <= 1;
        if (willComplete && fotoEnabled) {
            await takeFoto(item);
        }
    }
    return originalManualFoto.call(this, id);
};

// Adiciona ícone de foto nos logs se houver foto
const originalRenderLogs = renderLogs;
renderLogs = function() {
    originalRenderLogs.call(this);
    
    if (!fotoEnabled || !elements.logsTableBody) return;
    
    try {
        const fotos = JSON.parse(localStorage.getItem('expedicao_fotos') || '{}');
        const rows = elements.logsTableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const eanCell = row.cells[3];
            if (!eanCell) return;
            const eanText = eanCell.textContent.trim();
            
            // Procura nos logs se há foto para este EAN/SKU
            for (const [itemId, foto] of Object.entries(fotos)) {
                if (foto.sku === eanText || foto.descricao === eanText) {
                    const actionCell = row.cells[2];
                    if (actionCell) {
                        const fotoBtn = document.createElement('span');
                        fotoBtn.textContent = ' 📷';
                        fotoBtn.style.cssText = 'cursor:pointer; font-size:14px;';
                        fotoBtn.title = 'Ver foto do item';
                        fotoBtn.onclick = () => showFoto(parseInt(itemId));
                        actionCell.appendChild(fotoBtn);
                    }
                    break;
                }
            }
        });
    } catch (e) {
        console.warn('Erro ao verificar fotos nos logs:', e);
    }
};

document.addEventListener('DOMContentLoaded', setupFotoConfig);

// -------------------------------------------------------
// 9.16. PWA - SERVICE WORKER (Ideia 3.1)
// -------------------------------------------------------
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        // Cria o manifest.json dinamicamente
        const manifest = {
            name: 'Expedição Inteligente',
            short_name: 'Expedição',
            description: 'Sistema de expedição e conferência de vendas',
            start_url: './index.html',
            display: 'standalone',
            background_color: '#0a0b10',
            theme_color: '#6366f1',
            icons: [
                { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }
            ]
        };
        
        // Injeta o manifest no head
        const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        const manifestURL = URL.createObjectURL(manifestBlob);
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = manifestURL;
        document.head.appendChild(link);
        
        // Registra o service worker
        const swCode = `
        const CACHE_NAME = 'expedicao-v1';
        const URLS_TO_CACHE = [
            './',
            './index.html',
            './index.css',
            './app.js',
            './pdf-parser.js',
            './favicon.svg',
            './teste.pdf'
        ];
        
        self.addEventListener('install', (event) => {
            event.waitUntil(
                caches.open(CACHE_NAME).then((cache) => {
                    return cache.addAll(URLS_TO_CACHE);
                })
            );
        });
        
        self.addEventListener('fetch', (event) => {
            event.respondWith(
                caches.match(event.request).then((response) => {
                    if (response) return response;
                    return fetch(event.request).catch(() => {
                        return caches.match('./index.html');
                    });
                })
            );
        });
        
        self.addEventListener('activate', (event) => {
            event.waitUntil(
                caches.keys().then((names) => {
                    return Promise.all(
                        names.filter(name => name !== CACHE_NAME)
                            .map(name => caches.delete(name))
                    );
                })
            );
        });
        `;
        
        const swBlob = new Blob([swCode], { type: 'application/javascript' });
        const swURL = URL.createObjectURL(swBlob);
        
        navigator.serviceWorker.register(swURL, { scope: './' }).then(() => {
            console.log('✅ PWA: Service Worker registrado!');
        }).catch(err => {
            console.warn('❌ PWA: Erro ao registrar Service Worker:', err);
        });
    }
}

// -------------------------------------------------------
// 9.17. RELATÓRIO DE PRODUTIVIDADE (Ideia 3.2)
// -------------------------------------------------------
function generateProductivityReport() {
    if (state.logs.length === 0) {
        showToast('Sem dados', 'Não há logs para gerar relatório.', 'error');
        return;
    }
    
    const now = new Date();
    const hoje = now.toLocaleDateString('pt-BR');
    
    // Calcula métricas
    const logsHoje = state.logs.filter(log => {
        const logDate = new Date(log.timestamp).toLocaleDateString('pt-BR');
        return logDate === hoje;
    });
    
    const totalOK = logsHoje.filter(l => l.tipo === 'success').length;
    const totalErro = logsHoje.filter(l => l.tipo === 'error').length;
    const totalManual = logsHoje.filter(l => l.tipo === 'manual').length;
    const totalGeral = logsHoje.length;
    
    const taxaAcerto = totalGeral > 0 ? Math.round((totalOK / totalGeral) * 100) : 0;
    
    // Calcula itens/hora
    const timestamps = logsHoje.map(l => new Date(l.timestamp).getTime()).sort();
    let itensPorHora = 0;
    if (timestamps.length >= 2) {
        const diffHoras = (timestamps[timestamps.length - 1] - timestamps[0]) / 3600000;
        if (diffHoras > 0) {
            itensPorHora = Math.round(totalGeral / diffHoras);
        }
    }
    
    // Top 5 SKUs
    const skuCount = {};
    logsHoje.forEach(l => {
        if (l.acao === 'Conferência Bip' || l.acao === 'Conferência Manual') {
            const key = `${l.ean}`;
            skuCount[key] = (skuCount[key] || 0) + l.quantidade;
        }
    });
    const topSKUs = Object.entries(skuCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    // Calcula tempo médio por lista
    const listas = {};
    state.logs.forEach(l => {
        const key = new Date(l.timestamp).toLocaleDateString('pt-BR');
        if (!listas[key]) listas[key] = [];
        listas[key].push(new Date(l.timestamp).getTime());
    });
    let tempoMedio = 0;
    let listaCount = 0;
    for (const [, times] of Object.entries(listas)) {
        if (times.length >= 2) {
            const min = Math.min(...times);
            const max = Math.max(...times);
            tempoMedio += (max - min);
            listaCount++;
        }
    }
    if (listaCount > 0) {
        tempoMedio = Math.round(tempoMedio / listaCount / 60000);
    }
    
    // Monta relatório
    let csv = '\uFEFF';
    csv += `"📊 RELATÓRIO DE PRODUTIVIDADE - ${hoje}";;;;\r\n`;
    csv += `"Despachante: ${state.activeDespachanteNome || 'Geral'}";;;;\r\n`;
    csv += `;;;;;;;;\r\n`;
    csv += `"📈 INDICADORES";;;;\r\n`;
    csv += `"Total de operações hoje",${totalGeral};;;\r\n`;
    csv += `"✅ Conferências OK",${totalOK};;;\r\n`;
    csv += `"❌ Erros",${totalErro};;;\r\n`;
    csv += `"👤 Manuais",${totalManual};;;\r\n`;
    csv += `"🎯 Taxa de Acerto",${taxaAcerto}%;;;\r\n`;
    csv += `"⚡ Itens por hora",${itensPorHora};;;\r\n`;
    csv += `"⏱️ Tempo médio por lista",${tempoMedio}min;;;\r\n`;
    csv += `;;;;;;;;\r\n`;
    
    if (topSKUs.length > 0) {
        csv += `"🏆 TOP 5 PRODUTOS";;;;\r\n`;
        csv += `"SKU / EAN";"Qtd";;\r\n`;
        topSKUs.forEach(([sku, qtd], idx) => {
            csv += `"${idx + 1}. ${sku}";${qtd};;\r\n`;
        });
        csv += `;;;;;;;;\r\n`;
    }
    
    csv += `"📋 ÚLTIMOS EVENTOS";;;;\r\n`;
    csv += `"Data";"Hora";"Ação";"EAN/SKU";"Qtd";"Status"\r\n`;
    
    state.logs.slice(0, 30).forEach(log => {
        const d = new Date(log.timestamp);
        const line = [
            d.toLocaleDateString('pt-BR'),
            d.toLocaleTimeString('pt-BR'),
            log.acao,
            `="${log.ean}"`,
            log.quantidade > 0 ? `+${log.quantidade}` : log.quantidade,
            log.tipo === 'success' ? '✅' : log.tipo === 'error' ? '❌' : 'ℹ️'
        ].map(v => `"${v.toString().replace(/"/g, '""')}"`).join(';');
        csv += line + '\r\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produtividade_${now.toISOString().slice(0,10)}.csv`;
    link.click();
    
    showToast('Relatório Gerado', 'Relatório de produtividade baixado com sucesso!', 'success');
}

// Adiciona botão de relatório na administração
document.addEventListener('DOMContentLoaded', () => {
    const logsCardHeader = document.querySelector('.logs-card-header .logs-btn-group');
    if (logsCardHeader) {
        const btnRelatorio = document.createElement('button');
        btnRelatorio.className = 'logs-btn';
        btnRelatorio.innerHTML = '📊 Produtividade';
        btnRelatorio.addEventListener('click', generateProductivityReport);
        logsCardHeader.appendChild(btnRelatorio);
    }
});

// -------------------------------------------------------
// 9.20. INTEGRAÇÃO TINY — IMPRESSÃO DE ETIQUETAS
// -------------------------------------------------------
let tinyPrintedOrders = new Set(); // Rastreia pedidos que já tiveram etiqueta impressa

async function solicitarEtiquetaTiny(numeroPedido) {
    const endpoint = localStorage.getItem('expedicao_tiny_endpoint') || '';
    const token = localStorage.getItem('expedicao_tiny_token') || '';
    
    if (!endpoint || !token) {
        console.warn('Tiny: endpoint ou token não configurados');
        return;
    }
    
    // Verifica se já foi impressa (deduplicação)
    if (tinyPrintedOrders.has(numeroPedido)) {
        console.log(`Tiny: etiqueta já solicitada para ${numeroPedido}`);
        return;
    }
    
    try {
        showToast('Imprimindo Etiqueta', `Solicitando etiqueta para pedido ${numeroPedido}...`, 'success');
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                numero_pedido: numeroPedido
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        // Tenta ler como PDF
        const blob = await response.blob();
        
        if (blob.type === 'application/pdf') {
            // Abre PDF em nova aba para impressão
            const fileURL = URL.createObjectURL(blob);
            window.open(fileURL, '_blank');
        } else {
            // Se não for PDF, tenta ler como JSON (pode ser uma URL)
            const text = await blob.text();
            const data = JSON.parse(text);
            
            if (data.url) {
                window.open(data.url, '_blank');
            } else if (data.pdf_base64) {
                // Converte base64 para blob e abre
                const binaryString = atob(data.pdf_base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
                const fileURL = URL.createObjectURL(pdfBlob);
                window.open(fileURL, '_blank');
            } else {
                throw new Error('Formato de resposta não reconhecido');
            }
        }
        
        // Marca como impresso
        tinyPrintedOrders.add(numeroPedido);
        showToast('Etiqueta Gerada', `Etiqueta do pedido ${numeroPedido} aberta para impressão!`, 'success');
        
    } catch (error) {
        console.error('Erro ao solicitar etiqueta Tiny:', error);
        showToast('Erro na Etiqueta', `Não foi possível gerar a etiqueta: ${error.message}`, 'error');
    }
}

// -------------------------------------------------------
// 9.19. MENU POPUP DE CONFIGURAÇÕES (HEADER)
// -------------------------------------------------------
function initSettingsPopup() {
    const btnOpen = document.getElementById('btn-open-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const popup = document.getElementById('settings-popup');
    
    if (!btnOpen || !popup) return;
    
    const openPopup = () => {
        popup.style.display = 'flex';
        syncSettingsPopup();
    };
    
    const closePopup = () => {
        popup.style.display = 'none';
    };
    
    btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        openPopup();
    });
    
    if (btnClose) {
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closePopup();
        });
    }
    
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target !== btnOpen) {
            closePopup();
        }
    });
    
    popup.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Botão Paleta de Comandos no popup
    const btnConfigPalette = document.getElementById('btn-config-palette');
    if (btnConfigPalette) {
        btnConfigPalette.addEventListener('click', () => {
            openPalette();
            closePopup();
        });
    }
    
    // Botão Tela Cheia no popup
    const btnConfigFullscreen = document.getElementById('btn-config-fullscreen');
    if (btnConfigFullscreen) {
        btnConfigFullscreen.addEventListener('click', () => {
            toggleFullscreen();
        });
    }
    
    // Botões de som no popup
    const soundButtons = popup.querySelectorAll('.config-sound-buttons .btn');
    soundButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const soundType = btn.getAttribute('data-sound');
            
            // Atualiza classe active
            soundButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (soundType === 'mute') {
                state.soundEnabled = false;
            } else {
                state.soundEnabled = true;
                state.soundProfile = soundType;
                localStorage.setItem('expedicao_sound_profile', soundType);
            }
            
            localStorage.setItem('expedicao_sound', state.soundEnabled);
            updateSoundButtonIcon();
            
            // Toca som de confirmação
            if (state.soundEnabled) {
                playSoundEffect('unit');
            }
        });
    });
    
    // Toggle TTS no popup
    const popupTts = document.getElementById('popup-config-tts');
    if (popupTts) {
        const savedTTS = localStorage.getItem('expedicao_tts');
        ttsEnabled = savedTTS !== '0';
        popupTts.checked = ttsEnabled;
        
        popupTts.addEventListener('change', () => {
            ttsEnabled = popupTts.checked;
            localStorage.setItem('expedicao_tts', ttsEnabled ? '1' : '0');
            
            const btnTTS = document.getElementById('btn-tts-toggle');
            if (btnTTS) {
                btnTTS.classList.toggle('active', ttsEnabled);
                btnTTS.querySelector('span').textContent = ttsEnabled ? '🔊' : '🔇';
            }
            
            showToast(ttsEnabled ? 'Voz Ativada' : 'Voz Desativada', 
                ttsEnabled ? 'O sistema falará o nome dos produtos após cada leitura.' : 'Confirmação por voz desligada.', 'success');
        });
    }
    
    // Toggle Turbo no popup
    const popupTurbo = document.getElementById('popup-config-turbo');
    if (popupTurbo) {
        const savedTurbo = localStorage.getItem('expedicao_turbo');
        turboMode = savedTurbo === '1';
        popupTurbo.checked = turboMode;
        
        popupTurbo.addEventListener('change', () => {
            turboMode = popupTurbo.checked;
            localStorage.setItem('expedicao_turbo', turboMode ? '1' : '0');
            
            document.body.classList.toggle('turbo-mode', turboMode);
            
            const btnTurbo = document.getElementById('btn-turbo-toggle');
            if (btnTurbo) {
                btnTurbo.classList.toggle('active', turboMode);
                btnTurbo.querySelector('span').textContent = turboMode ? '⚡' : '⚡';
            }
            
            showToast(turboMode ? 'Modo Turbo Ativado' : 'Modo Turbo Desativado', 
                turboMode ? 'Animações desligadas para máxima performance.' : 'Animações restauradas.', 'success');
        });
    }
    
    // Configurações Tiny - Impressão de Etiquetas
    const popupTinyEnabled = document.getElementById('popup-config-tiny-enabled');
    const popupTinyEndpoint = document.getElementById('popup-tiny-endpoint');
    const popupTinyToken = document.getElementById('popup-tiny-token');
    const popupTinySection = document.getElementById('popup-config-tiny-section');
    
    if (popupTinyEnabled && popupTinyEndpoint && popupTinyToken) {
        // Carregar configurações salvas
        const tinyEnabled = localStorage.getItem('expedicao_tiny_enabled') === '1';
        const tinyEndpoint = localStorage.getItem('expedicao_tiny_endpoint') || '';
        const tinyToken = localStorage.getItem('expedicao_tiny_token') || '';
        
        popupTinyEnabled.checked = tinyEnabled;
        popupTinyEndpoint.value = tinyEndpoint;
        popupTinyToken.value = tinyToken;
        
        if (popupTinySection) {
            popupTinySection.style.display = tinyEnabled ? 'block' : 'none';
        }
        
        // Toggle para mostrar/esconder seção
        popupTinyEnabled.addEventListener('change', () => {
            const enabled = popupTinyEnabled.checked;
            localStorage.setItem('expedicao_tiny_enabled', enabled ? '1' : '0');
            
            if (popupTinySection) {
                popupTinySection.style.display = enabled ? 'block' : 'none';
            }
        });
        
        // Salvar endpoint
        popupTinyEndpoint.addEventListener('input', () => {
            localStorage.setItem('expedicao_tiny_endpoint', popupTinyEndpoint.value.trim());
        });
        
        // Salvar token
        popupTinyToken.addEventListener('input', () => {
            localStorage.setItem('expedicao_tiny_token', popupTinyToken.value.trim());
        });
    }
}

function applySettingsFromPopup() {
    // As configurações agora são gerenciadas diretamente pelo popup,
    // então não precisamos mais sincronizar com elementos antigos.
    // Apenas garantimos que ops listeners de change/input dos setups
    // foram disparados para salvar no localStorage.
    
    const popupWA = document.getElementById('popup-config-whatsapp');
    const popupWANumber = document.getElementById('popup-config-whatsapp-number');
    const popupNumberInput = document.getElementById('popup-whatsapp-number-input');
    
    if (popupWA && popupNumberInput) {
        // Dispara eventos para atualizar variáveis globais e localStorage
        popupWA.dispatchEvent(new Event('change'));
        popupNumberInput.dispatchEvent(new Event('input'));
        if (popupWANumber) {
            popupWANumber.style.display = popupWA.checked ? 'block' : 'none';
        }
    }
    
    const popupFoto = document.getElementById('popup-config-foto');
    if (popupFoto) {
        popupFoto.dispatchEvent(new Event('change'));
    }
    
    const popupFlash = document.getElementById('popup-config-flash');
    if (popupFlash) {
        popupFlash.dispatchEvent(new Event('change'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Eventos dos inputs do popup
    const popupConfigs = ['popup-config-whatsapp', 'popup-config-foto', 'popup-config-flash'];
    popupConfigs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                applySettingsFromPopup();
            });
        }
    });
    
    const popupNumberInput = document.getElementById('popup-whatsapp-number-input');
    if (popupNumberInput) {
        popupNumberInput.addEventListener('input', () => {
            applySettingsFromPopup();
        });
    }
});

// -------------------------------------------------------
// 9.18. INICIALIZAÇÃO DA FASE 3
// -------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // PWA
    registerServiceWorker();

    // Injeta flash nas funções de feedback
    const origSuccess = showToast;
    showToast = function(title, desc, type = 'success') {
        if (flashEnabled) {
            if (type === 'success') showReaderFlash('success');
            else if (type === 'error') showReaderFlash('error');
        }
        return origSuccess.call(this, title, desc, type);
    };

    initSettingsPopup();
});

// Pausa a sincronização quando a janela do navegador perde o foco (economiza CPU/Servidor)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopBackgroundSync();
        backupManager.save(); // Salva backup ao sair
    } else {
        startBackgroundSync();
        offlineQueue.process();
    }
});
