/**
 * Módulo de extração e parsing de PDF para a fila de expedição.
 * Utiliza o PDF.js (Mozilla) carregado no navegador.
 */
class PdfParser {
    constructor() {
        // Configura o worker do PDF.js caso esteja disponível globalmente
        if (window.pdfjsLib) {
            this.pdfjsLib = window.pdfjsLib;
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        } else {
            console.error('PDF.js não está carregado globalmente. Verifique a conexão com a CDN.');
        }
    }

    /**
     * Carrega o ArrayBuffer de um PDF e extrai todos os itens.
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<Array>} Lista de itens extraídos
     */
    async parse(arrayBuffer) {
        if (!this.pdfjsLib) {
            throw new Error('Biblioteca PDF.js não inicializada.');
        }

        try {
            const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            
            // Extrair o texto de todas as páginas mantendo a organização de linhas
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const pageText = await this.getPageTextByLayout(page);
                fullText += pageText + '\n';
            }

            return this.parseTextToItems(fullText);
        } catch (error) {
            console.error('Erro no parsing do PDF:', error);
            throw new Error('Falha ao processar o PDF. Certifique-se de que é um documento válido.');
        }
    }

    /**
     * Reconstrói as linhas de texto da página com base na sua posição Y e X na tela.
     * Isso é essencial para que o layout tabular do PDF de expedição seja mantido.
     * @param {Object} page Objeto da página do PDF.js
     * @returns {Promise<string>} Texto formatado por linhas
     */
    async getPageTextByLayout(page) {
        const textContent = await page.getTextContent();
        const items = textContent.items;
        
        // Agrupar itens por coordenada Y (linhas)
        // O transform[5] indica a posição Y no PDF.js (de baixo para cima)
        const linesMap = {};
        for (const item of items) {
            if (!item.str.trim()) continue;
            // Arredonda para 1 casa decimal para agrupar pequenos desvios de linha
            const y = Math.round(item.transform[5] * 10) / 10;
            if (!linesMap[y]) {
                linesMap[y] = [];
            }
            linesMap[y].push(item);
        }
        
        // Ordena as chaves Y do topo para a base (valores Y maiores estão no topo da página)
        const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
        
        const lines = [];
        for (const y of sortedY) {
            // Ordena os itens horizontais (X) da esquerda para a direita (transform[4])
            const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
            
            let lineText = '';
            for (let i = 0; i < lineItems.length; i++) {
                const item = lineItems[i];
                if (i > 0) {
                    const prevItem = lineItems[i - 1];
                    const prevXEnd = prevItem.transform[4] + prevItem.width;
                    const distance = item.transform[4] - prevXEnd;
                    
                    // Se houver um espaçamento horizontal grande entre textos, insere uma tabulação (comportamento de coluna)
                    if (distance > 15) {
                        lineText += '\t';
                    } else if (distance > 2) {
                        lineText += ' ';
                    }
                }
                lineText += item.str;
            }
            lines.push(lineText);
        }
        return lines.join('\n');
    }

    /**
     * Converte o texto estruturado em objetos de itens limpos.
     * @param {string} text Texto completo extraído das páginas
     * @returns {Array} Lista de itens de expedição
     */
    parseTextToItems(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
        let currentNota = null;
        let currentEc = null;
        let currentCliente = null;
        let currentCanal = null;
        const items = [];

        // Ícones em unicode conhecidos do PDF
        const ICON_CANAL = '\uf0d1'; // Ícone do caminhão
        const ICON_CLIENTE = '\uf606'; // Ícone de sorriso
        const ICON_CHECKBOX = '\uf0c8'; // Checkbox vazio

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Ignorar rodapés e cabeçalhos de página
            if (line.includes('Separação de mercadorias') || 
                (line.includes('--') && line.includes('of')) || 
                line === ICON_CHECKBOX) {
                continue;
            }
            
            // Detectar início de Nota
            if (line.startsWith('Nota')) {
                const notaMatch = line.match(/^Nota(\d+)/);
                currentNota = notaMatch ? 'Nota' + notaMatch[1] : '';
                
                const ecMatch = line.match(/Nº\s+EC\s+(\S+)/);
                currentEc = ecMatch ? ecMatch[1] : '';
                
                const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
                let remainingParts = parts.filter(p => !p.startsWith('Nota') && !p.includes('Nº EC'));
                
                currentCliente = '';
                currentCanal = '';
                
                if (remainingParts.length > 0) {
                    // Busca por canal conhecido na linha
                    const canalIndex = remainingParts.findIndex(p => 
                        p.startsWith(ICON_CANAL) || 
                        p.includes('Shopee') || 
                        p.includes('Amazon') || 
                        p.includes('Transportadora')
                    );
                    
                    if (canalIndex !== -1) {
                        let canalVal = remainingParts[canalIndex].replace(ICON_CANAL, '').trim();
                        if (canalVal === 'Transportadora') canalVal = 'MercadoLivre';
                        currentCanal = canalVal;
                        remainingParts.splice(canalIndex, 1);
                    }
                    if (remainingParts.length > 0) {
                        currentCliente = remainingParts.join(' ').replace(new RegExp(ICON_CLIENTE, 'g'), '').replace(/\s+/g, ' ').trim();
                    }
                }
                continue;
            }
            
            // Detectar linha secundária de Cliente/Canal (quando quebrada do cabeçalho da nota)
            if (line.includes(ICON_CANAL)) {
                const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
                const canalPart = parts.find(p => p.includes(ICON_CANAL));
                if (canalPart) {
                    let canalVal = canalPart.replace(ICON_CANAL, '').trim();
                    if (canalVal === 'Transportadora') canalVal = 'MercadoLivre';
                    currentCanal = canalVal;
                }
                const clientePart = parts.find(p => !p.includes(ICON_CANAL));
                if (clientePart) {
                    currentCliente = clientePart.replace(new RegExp(ICON_CLIENTE, 'g'), '').replace(/\s+/g, ' ').trim();
                }
                continue;
            }
            
            // Ignorar o cabeçalho de produtos
            if (line.startsWith('Produto') && line.includes('SKU/GTIN')) {
                continue;
            }
            
            // Regex para capturar quantidades no final da linha (ex: 1,00 UN ou 2,00 Un)
            const qtyRegex = /(\d+,\d+)\s*(?:UN|Un|un|uN)$/;
            if (qtyRegex.test(line)) {
                const match = line.match(qtyRegex);
                const qtdStr = match[1];
                const quantidade = parseFloat(qtdStr.replace(',', '.'));
                const cleanLine = line.replace(qtyRegex, '').trim();
                
                let ean = '';
                let sku = '';
                let descricao = '';
                
                // Se a linha atual (sem a quantidade) contém apenas dígitos (ex: EAN de 8 a 14 dígitos)
                if (/^\d{8,14}$/.test(cleanLine)) {
                    ean = cleanLine;
                    
                    // O SKU e a descrição devem estar nas linhas anteriores
                    const prevLine = i > 0 ? lines[i - 1].trim() : '';
                    const prevPrevLine = i > 1 ? lines[i - 2].trim() : '';
                    
                    // Se a linha imediatamente anterior for muito curta (ex: SKU isolado como '4275' ou 'AX900')
                    const isPrevShort = prevLine.length > 0 && prevLine.length < 25 && !prevLine.includes('\t');
                    
                    if (isPrevShort && prevPrevLine && !prevPrevLine.startsWith('Nota') && !prevPrevLine.includes('Produto')) {
                        sku = prevLine;
                        descricao = prevPrevLine;
                        
                        // Limpa o SKU do final da descrição se estiver duplicado
                        if (descricao.endsWith(sku)) {
                            descricao = descricao.substring(0, descricao.length - sku.length).trim();
                        }
                    } else if (prevLine) {
                        // Linha anterior longa contendo descrição + SKU conjugados
                        const prevTabs = prevLine.split('\t').map(p => p.trim()).filter(Boolean);
                        if (prevTabs.length >= 2) {
                            descricao = prevTabs[0];
                            sku = prevTabs[1];
                        } else {
                            const prevSpaces = prevLine.split(/\s+/);
                            if (prevSpaces.length >= 2) {
                                sku = prevSpaces[prevSpaces.length - 1];
                                descricao = prevSpaces.slice(0, -1).join(' ');
                            } else {
                                sku = prevLine;
                                descricao = prevLine;
                            }
                        }
                    } else {
                        sku = ean;
                        descricao = 'Produto Sem Descrição';
                    }
                } else {
                    // Linha única (sem EAN numérico separado)
                    const tabs = cleanLine.split('\t').map(p => p.trim()).filter(Boolean);
                    if (tabs.length >= 2) {
                        descricao = tabs[0];
                        sku = tabs[1];
                    } else {
                        const spaces = cleanLine.split(/\s+/);
                        if (spaces.length >= 2) {
                            sku = spaces[spaces.length - 1];
                            descricao = spaces.slice(0, -1).join(' ');
                        } else {
                            sku = cleanLine;
                            descricao = cleanLine;
                        }
                    }
                    ean = sku; // Sem EAN separado, o buscador assume o SKU
                }
                
                items.push({
                    id: items.length + 1,
                    nota: currentNota,
                    ec: currentEc || 'Sem Pedido',
                    cliente: currentCliente || 'Desconhecido',
                    canal: currentCanal || 'Outros',
                    descricao: descricao.trim(),
                    sku: sku.trim(),
                    ean: ean.trim(),
                    quantidade: quantidade,
                    quantidadeOriginal: quantidade, // Mantém para progresso
                    expedido: false
                });
            }
        }
        
        return items;
    }
}
