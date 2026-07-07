/**
 * Módulo de extração e parsing de PDF para a fila de expedição.
 * Utiliza o PDF.js (Mozilla) carregado no navegador.
 * Extrai textos e imagens (fotos dos produtos) correlacionando-as por coordenada vertical Y.
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
     * Carrega o ArrayBuffer de um PDF, extrai todos os itens e suas respectivas fotos.
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<Array>} Lista de itens extraídos com imagens em Base64
     */
    async parse(arrayBuffer) {
        if (!this.pdfjsLib) {
            throw new Error('Biblioteca PDF.js não inicializada.');
        }

        try {
            const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const allItems = [];
            
            // Estado do cabeçalho da Nota que persiste entre as páginas do PDF
            const currentHeader = {
                nota: null,
                ec: null,
                cliente: null,
                canal: null
            };

            // Processar página por página para manter as imagens alinhadas corretamente com os produtos
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                
                // 1. Extrai o texto estruturado com coordenada Y
                const pageTextLines = await this.getPageTextLinesWithY(page);
                
                // 2. Extrai metadados e IDs das imagens da página com suas coordenadas Y
                const pageImages = await this.getPageImages(page);
                
                // 3. Converte os dados de texto e associa à foto mais próxima na mesma página
                const pageItems = await this.parsePageLinesToItems(pageTextLines, pageImages, page, currentHeader);
                
                allItems.push(...pageItems);
            }

            // Recalcula os IDs para ficarem sequenciais e contínuos de 1 a N
            allItems.forEach((item, index) => {
                item.id = index + 1;
            });

            return allItems;
        } catch (error) {
            console.error('Erro no parsing do PDF:', error);
            throw new Error('Falha ao processar o PDF. Certifique-se de que é um documento válido.');
        }
    }

    /**
     * Extrai as linhas de texto da página, mantendo a coordenada Y de cada linha.
     * @param {Object} page Objeto da página do PDF.js
     * @returns {Promise<Array>} Lista de objetos contendo texto e coordenada Y
     */
    async getPageTextLinesWithY(page) {
        const textContent = await page.getTextContent();
        const items = textContent.items;
        
        // Agrupar itens por coordenada Y (linhas)
        const linesMap = {};
        for (const item of items) {
            if (!item.str.trim()) continue;
            // Arredonda a coordenada Y para agrupar pequenos desalinhamentos
            const y = Math.round(item.transform[5] * 10) / 10;
            if (!linesMap[y]) {
                linesMap[y] = [];
            }
            linesMap[y].push(item);
        }
        
        // Ordena as linhas do topo para a base (coordenada Y maior fica no topo)
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
                    
                    // Insere tabulações em colunas separadas
                    if (distance > 15) {
                        lineText += '\t';
                    } else if (distance > 2) {
                        lineText += ' ';
                    }
                }
                lineText += item.str;
            }
            lines.push({ text: lineText, y: y });
        }
        return lines;
    }

    /**
     * Localiza todas as imagens desenhadas na página e suas coordenadas Y.
     * @param {Object} page Objeto da página do PDF.js
     * @returns {Promise<Array>} Lista de metadados das imagens na página
     */
    async getPageImages(page) {
        const images = [];
        try {
            const operatorList = await page.getOperatorList();
            const fnArray = operatorList.fnArray;
            const argsArray = operatorList.argsArray;
            
            let lastY = 0;
            
            for (let j = 0; j < fnArray.length; j++) {
                const fn = fnArray[j];
                
                // Monitora a matriz de transformação do elemento gráfico
                if (fn === this.pdfjsLib.OPS.transform) {
                    const args = argsArray[j];
                    if (args && args.length >= 6) {
                        lastY = args[5]; // Posição vertical Y da transformação gráfica
                    }
                } 
                // Captura a renderização da imagem
                else if (fn === this.pdfjsLib.OPS.paintImageXObject || fn === this.pdfjsLib.OPS.paintInlineImageXObject) {
                    const args = argsArray[j];
                    if (args && args.length > 0) {
                        const imgKey = args[0];
                        images.push({ key: imgKey, y: lastY });
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao ler operadores de imagem da página:', err);
        }
        return images;
    }

    /**
     * Obtém uma imagem da página do PDF, desenha-a em um canvas e a converte para uma miniatura em Base64.
     * @param {Object} page Objeto da página do PDF.js
     * @param {string} imgKey Chave identificadora da imagem na página
     * @returns {Promise<string|null>} String Base64 formatada em JPEG de tamanho reduzido (miniatura)
     */
    convertPdfImageToBase64(page, imgKey) {
        return new Promise((resolve) => {
            try {
                // Solicita a imagem do cache de objetos da página
                page.objs.get(imgKey, (imgObj) => {
                    if (!imgObj) {
                        resolve(null);
                        return;
                    }
                    
                    const width = imgObj.width;
                    const height = imgObj.height;
                    const data = imgObj.data; // Uint8ClampedArray contendo bytes de pixel RGBA/RGB
                    
                    if (!data || width <= 0 || height <= 0) {
                        resolve(null);
                        return;
                    }
                    
                    // Cria canvas auxiliar
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // Converte pixels brutos para o canvas dependendo do formato de bytes
                    if (data.length === width * height * 4) {
                        const imgData = new ImageData(data, width, height);
                        ctx.putImageData(imgData, 0, 0);
                    } else if (data.length === width * height * 3) {
                        // Converte formato RGB para RGBA
                        const imgData = ctx.createImageData(width, height);
                        let j = 0;
                        for (let i = 0; i < data.length; i += 3) {
                            imgData.data[j] = data[i];
                            imgData.data[j+1] = data[i+1];
                            imgData.data[j+2] = data[i+2];
                            imgData.data[j+3] = 255;
                            j += 4;
                        }
                        ctx.putImageData(imgData, 0, 0);
                    } else {
                        resolve(null);
                        return;
                    }
                    
                    // OTIMIZAÇÃO CRÍTICA: Redimensiona para uma miniatura de no máximo 80px
                    // Isso mantém as strings base64 leves e evita estourar o limite de 5MB do LocalStorage
                    const thumbCanvas = document.createElement('canvas');
                    const maxDim = 80;
                    let thumbWidth = width;
                    let thumbHeight = height;
                    
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            thumbWidth = maxDim;
                            thumbHeight = Math.round((height * maxDim) / width);
                        } else {
                            thumbHeight = maxDim;
                            thumbWidth = Math.round((width * maxDim) / height);
                        }
                    }
                    
                    thumbCanvas.width = thumbWidth;
                    thumbCanvas.height = thumbHeight;
                    const thumbCtx = thumbCanvas.getContext('2d');
                    thumbCtx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);
                    
                    // Exporta em JPEG comprimido (qualidade 0.7) para economizar armazenamento
                    const base64Url = thumbCanvas.toDataURL('image/jpeg', 0.7);
                    resolve(base64Url);
                });
            } catch (err) {
                console.error('Erro ao converter imagem do PDF:', err);
                resolve(null);
            }
        });
    }

    /**
     * Mapeia as linhas de texto da página e associa com as fotos de produto por proximidade de coordenada Y.
     * @param {Array} lines Linhas de texto com Y
     * @param {Array} pageImages Imagens com Y
     * @param {Object} page Página PDFjs
     * @param {Object} currentHeader Cabeçalho da nota
     * @returns {Promise<Array>} Itens extraídos da página
     */
    async parsePageLinesToItems(lines, pageImages, page, currentHeader) {
        const items = [];
        const ICON_CANAL = '\uf0d1';
        const ICON_CLIENTE = '\uf606';
        const ICON_CHECKBOX = '\uf0c8';

        for (let i = 0; i < lines.length; i++) {
            const lineObj = lines[i];
            const line = lineObj.text.trim();
            const lineY = lineObj.y;
            
            // Ignorar elementos gerais
            if (line.includes('Separação de mercadorias') || 
                (line.includes('--') && line.includes('of')) || 
                line === ICON_CHECKBOX) {
                continue;
            }
            
            // Detectar início de Nota
            if (line.startsWith('Nota')) {
                const notaMatch = line.match(/^Nota(\d+)/);
                currentHeader.nota = notaMatch ? 'Nota' + notaMatch[1] : '';
                
                const ecMatch = line.match(/Nº\s+EC\s+(\S+)/);
                currentHeader.ec = ecMatch ? ecMatch[1] : '';
                
                const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
                let remainingParts = parts.filter(p => !p.startsWith('Nota') && !p.includes('Nº EC'));
                
                currentHeader.cliente = '';
                currentHeader.canal = '';
                
                if (remainingParts.length > 0) {
                    const canalIndex = remainingParts.findIndex(p => 
                        p.startsWith(ICON_CANAL) || 
                        p.includes('Shopee') || 
                        p.includes('Amazon') || 
                        p.includes('Transportadora')
                    );
                    
                    if (canalIndex !== -1) {
                        currentHeader.canal = remainingParts[canalIndex].replace(ICON_CANAL, '').trim();
                        remainingParts.splice(canalIndex, 1);
                    }
                    if (remainingParts.length > 0) {
                        currentHeader.cliente = remainingParts.join(' ').replace(new RegExp(ICON_CLIENTE, 'g'), '').replace(/\s+/g, ' ').trim();
                    }
                }
                continue;
            }
            
            // Detectar canal e cliente secundários
            if (line.includes(ICON_CANAL)) {
                const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
                const canalPart = parts.find(p => p.includes(ICON_CANAL));
                if (canalPart) {
                    currentHeader.canal = canalPart.replace(ICON_CANAL, '').trim();
                }
                const clientePart = parts.find(p => !p.includes(ICON_CANAL));
                if (clientePart) {
                    currentHeader.cliente = clientePart.replace(new RegExp(ICON_CLIENTE, 'g'), '').replace(/\s+/g, ' ').trim();
                }
                continue;
            }
            
            // Ignorar cabeçalho da tabela de produtos
            if (line.startsWith('Produto') && line.includes('SKU/GTIN')) {
                continue;
            }
            
            // Regex para quantidades no final (ex: 1,00 UN)
            const qtyRegex = /(\d+,\d+)\s*(?:UN|Un|un|uN)$/;
            if (qtyRegex.test(line)) {
                const match = line.match(qtyRegex);
                const qtdStr = match[1];
                const quantidade = parseFloat(qtdStr.replace(',', '.'));
                const cleanLine = line.replace(qtyRegex, '').trim();
                
                let ean = '';
                let sku = '';
                let descricao = '';
                
                // Se a linha limpa contiver apenas dígitos (EAN)
                if (/^\d{8,14}$/.test(cleanLine)) {
                    ean = cleanLine;
                    
                    const prevLineObj = i > 0 ? lines[i - 1] : null;
                    const prevLine = prevLineObj ? prevLineObj.text.trim() : '';
                    const prevPrevLineObj = i > 1 ? lines[i - 2] : null;
                    const prevPrevLine = prevPrevLineObj ? prevPrevLineObj.text.trim() : '';
                    
                    const isPrevShort = prevLine.length > 0 && prevLine.length < 25 && !prevLine.includes('\t');
                    
                    if (isPrevShort && prevPrevLine && !prevPrevLine.startsWith('Nota') && !prevPrevLine.includes('Produto')) {
                        sku = prevLine;
                        descricao = prevPrevLine;
                        
                        if (descricao.endsWith(sku)) {
                            descricao = descricao.substring(0, descricao.length - sku.length).trim();
                        }
                    } else if (prevLine) {
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
                    ean = sku;
                }
                
                // Mapear a imagem correspondente por coordenada Y
                let matchedImageBase64 = null;
                if (pageImages && pageImages.length > 0) {
                    // Filtra imagens fora da zona do logotipo superior (Y < 780)
                    const productImages = pageImages.filter(img => img.y < 780);
                    
                    if (productImages.length > 0) {
                        let closestImg = null;
                        let minDistance = Infinity;
                        
                        for (const img of productImages) {
                            const dist = Math.abs(img.y - lineY);
                            if (dist < minDistance && dist < 70) { // Tolerância de até 70 pontos
                                minDistance = dist;
                                closestImg = img;
                            }
                        }
                        
                        if (closestImg) {
                            matchedImageBase64 = await this.convertPdfImageToBase64(page, closestImg.key);
                            
                            // Remove a imagem para evitar dupla associação
                            const imgIdx = pageImages.findIndex(img => img.key === closestImg.key);
                            if (imgIdx !== -1) {
                                pageImages.splice(imgIdx, 1);
                            }
                        }
                    }
                }
                
                items.push({
                    id: 0, // Recalculado globalmente no final
                    nota: currentHeader.nota,
                    ec: currentHeader.ec || 'Sem Pedido',
                    cliente: currentHeader.cliente || 'Desconhecido',
                    canal: currentHeader.canal || 'Outros',
                    descricao: descricao.trim(),
                    sku: sku.trim(),
                    ean: ean.trim(),
                    imagem: matchedImageBase64,
                    quantidade: quantidade,
                    quantidadeOriginal: quantidade,
                    expedido: false
                });
            }
        }
        return items;
    }
}
