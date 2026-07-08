/**
 * Lógica principal da aplicação de expedição.
 * Controla o estado, interface, LocalStorage, scanner e áudio.
 */

// Instancia o parser
const parser = new PdfParser();

// Estado Global da SPA
const state = {
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

    // Elementos de Logs de Auditoria
    elements.logsSection = document.getElementById('logs-section');
    elements.logsHeader = document.getElementById('logs-header');
    elements.logsContent = document.getElementById('logs-content');
    elements.logsCountBadge = document.getElementById('logs-count-badge');
    elements.logsBtnGroup = document.getElementById('logs-btn-group');
    elements.btnExportLogs = document.getElementById('btn-export-logs');
    elements.btnClearLogs = document.getElementById('btn-clear-logs');
    elements.logsTableBody = document.getElementById('logs-table-body');
    elements.logsEmpty = document.getElementById('logs-empty');
}

// ==========================================
// 1. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    loadSettings();
    initEventListeners();
    restoreStateFromStorage();
    setupAutofocus();
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

// Restaura os itens do LocalStorage se existirem
function restoreStateFromStorage() {
    // Restaura logs de auditoria
    const savedLogs = localStorage.getItem('expedicao_logs');
    if (savedLogs) {
        try {
            state.logs = JSON.parse(savedLogs);
            renderLogs();
        } catch (e) {
            console.error('Erro ao restaurar logs de auditoria:', e);
        }
    }

    const savedItems = localStorage.getItem('expedicao_items');
    if (savedItems) {
        try {
            state.items = JSON.parse(savedItems);
            if (state.items.length > 0) {
                // Recupera nome do PDF original
                state.pdfName = localStorage.getItem('expedicao_pdf_name');
                if (state.pdfName === 'teste.pdf') {
                    // Pré-carrega teste.pdf em background
                    fetch('./teste.pdf')
                        .then(res => res.blob())
                        .then(blob => {
                            state.pdfBlob = new File([blob], 'teste.pdf', { type: 'application/pdf' });
                        })
                        .catch(err => console.error('Erro ao pre-carregar teste.pdf:', err));
                }
                onDataLoaded();
            }
        } catch (e) {
            console.error('Erro ao restaurar dados do LocalStorage:', e);
            localStorage.removeItem('expedicao_items');
        }
    }
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

    // Drag and Drop do PDF
    elements.dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropArea.classList.add('highlight');
    });

    elements.dropArea.addEventListener('dragleave', () => {
        elements.dropArea.classList.remove('highlight');
    });

    elements.dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropArea.classList.remove('highlight');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            handlePdfFile(files[0]);
        } else {
            showToast('Erro de Arquivo', 'Por favor, arraste um arquivo PDF válido.', 'error');
        }
    });

    elements.dropArea.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePdfFile(e.target.files[0]);
        }
    });

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

    // Limpar expedição
    elements.btnReset.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar a expedição atual? Todos os dados de conferência serão perdidos.')) {
            resetState();
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

    // Atalhos de teclado globais (ex: Enter ou Espaço para fechar modal de erro/confirmar)
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

    // Eventos do Painel de Auditoria Local
    if (elements.logsHeader) {
        elements.logsHeader.addEventListener('click', (e) => {
            if (e.target.closest('.logs-btn')) return;
            elements.logsSection.classList.toggle('open');
        });
    }

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

// Processa o arquivo PDF carregado
async function handlePdfFile(file) {
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
                
                // Salva os itens no estado
                state.items = parsedItems;
                localStorage.setItem('expedicao_items', JSON.stringify(state.items));
                
                // Armazena dados do arquivo PDF
                state.pdfBlob = file;
                state.pdfName = file.name;
                localStorage.setItem('expedicao_pdf_name', file.name);
                
                onDataLoaded();
                playSoundEffect('confirm');
                addLog('Importação PDF', '---', file.name, state.items.length, 'info');
                
                showToast('Sucesso', `${state.items.length} itens extraídos do PDF com sucesso!`, 'success');
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
function processBarcodeRead(rawSku) {
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
        
        localStorage.setItem('expedicao_items', JSON.stringify(state.items));
        renderTable();
        updateProgress();
        highlightRow(matchedItem.id);
        
        // Grava log de auditoria
        addLog('Conferência Bip', matchedItem.nota, matchedItem.ean, unidadesParaExpedir, 'success');
        
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
            addLog('Erro: Já Expedido', '---', code, multiplier, 'error');
            showErrorModal('Produto Já Expedido', 'Este produto já foi totalmente processado e expedido nesta lista.', code);
        } else {
            const pendentesSemEan = state.items.filter(item => !item.expedido && !item.temEan);
            if (pendentesSemEan.length > 0) {
                showNoEanConfirmModal(pendentesSemEan[0]);
            } else {
                addLog('Erro: Não Encontrado', '---', code, multiplier, 'error');
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
function checkAllCompleted() {
    const totalPendentes = state.items.reduce((acc, item) => acc + item.quantidade, 0);
    if (totalPendentes === 0 && state.items.length > 0) {
        playSoundEffect('all_complete');
        showToast('Expedição Finalizada! 🎉', 'Parabéns! Todos os produtos da lista foram conferidos e expedidos.', 'success');
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
window.manualAddUnit = function(id) {
    const item = state.items.find(i => i.id === id);
    if (item && !item.expedido) {
        // Registra a unidade expedida
        item.quantidade -= 1;
        if (item.quantidade <= 0) {
            item.quantidade = 0;
            item.expedido = true;
            item.dataExpedicao = new Date().toISOString();
        }
        
        localStorage.setItem('expedicao_items', JSON.stringify(state.items));
        renderTable();
        updateProgress();
        highlightRow(item.id);
        
        // Adiciona log de auditoria
        addLog('Conferência Manual', item.nota, item.ean || item.sku, 1, 'manual');
        
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

function confirmNoEanYes() {
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
        
        localStorage.setItem('expedicao_items', JSON.stringify(state.items));
        renderTable();
        updateProgress();
        highlightRow(item.id);
        
        // Grava log de auditoria
        addLog('Conferência Sem EAN', item.nota, item.sku, 1, 'manual');
        
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

function confirmNoEanNo() {
    const item = state.confirmTargetItem;
    elements.noEanConfirmModal.style.display = 'none';
    state.confirmModalActive = false;
    state.confirmTargetItem = null;
    
    // Alerta de cancelamento
    playSoundEffect('cancel');
    
    if (item) {
        addLog('Cancelado Sem EAN', item.nota, item.sku, 1, 'info');
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
function addLog(action, note, ean, qty, type = 'info') {
    const logEntry = {
        timestamp: new Date().toISOString(),
        nota: note || '---',
        ean: ean || '---',
        quantidade: qty || 0,
        acao: action,
        tipo: type
    };
    
    state.logs.unshift(logEntry);
    
    // Limita tamanho do histórico local para não estourar LocalStorage
    if (state.logs.length > 500) {
        state.logs.pop();
    }
    
    localStorage.setItem('expedicao_logs', JSON.stringify(state.logs));
    renderLogs();
}

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

// Limpa o log local
function clearLogs() {
    if (confirm('Deseja realmente esvaziar todo o histórico de auditoria local? Esta ação não pode ser desfeita.')) {
        state.logs = [];
        localStorage.removeItem('expedicao_logs');
        renderLogs();
        showToast('Auditoria Limpa', 'Histórico local foi redefinido.', 'success');
        playSoundEffect('cancel');
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
