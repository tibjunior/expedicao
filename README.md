# Sistema de Expedição de Vendas

Sistema web SPA (Single Page Application) moderno, elegante e altamente responsivo para expedição e conferência de mercadorias. O sistema permite carregar uma lista de separação em PDF, extrair os itens vendidos, gerenciar a fila de expedição e realizar a conferência dos itens em tempo real utilizando um leitor de código de barras físico (USB) ou a câmera do celular/computador.

---

## 🚀 Funcionalidades Principais

* **Parsing de PDF no Navegador (Mozilla PDF.js)**: Permite carregar o arquivo PDF de separação e extrair os itens vendidos de forma totalmente local no navegador, sem a necessidade de um servidor backend robusto para processamento.
* **Fila de Espera Dinâmica**: Gera uma lista organizada por Nota Fiscal/Pedido, mostrando o canal de venda, nome do cliente, descrição do item, SKU, quantidade total e restante.
* **Conferência via Código de Barras (SKU)**: Campo com foco inteligente otimizado para leitores USB físicos.
* **Leitor de Câmera (Html5-Qrcode)**: Opcionalmente abre a câmera do celular/computador em uma fresta horizontal fina com uma linha laser vermelha pulsante, permitindo a varredura e leitura rápida de códigos de barras (ex: EAN-13) de forma super ergonômica.
* **Fluxo de Tela Otimizado**: No início, a tela exibe apenas a área de importação do PDF. Após carregar, a área de upload é oculta e os painéis de conferência e lista são revelados.
* **Design Otimizado para Celular**: A tabela se transforma em cards confortáveis para celular, o card de upload é ocultado e a interface de leitura fica fixa na base da tela para facilitar a digitação ou abertura da câmera com apenas uma mão.
* **Feedbacks Visuais e Sonoros**: Efeitos de tremor de tela e beep sonoro grave para erros; animações de pulso verde e beeps curtos agudos para leituras corretas.
* **Persistência de Estado (LocalStorage)**: Salva o andamento da expedição na memória do navegador. O progresso é mantido mesmo se o operador atualizar ou fechar a página.
* **Visualização do PDF**: Botão integrado para abrir o arquivo original em uma nova aba do navegador para conferência detalhada.

---

## 📡 Deploy Contínuo via FTP

O servidor local de desenvolvimento possui um monitor de alterações integrado:
* **Auto-Deploy**: Sempre que qualquer arquivo da aplicação (`index.html`, `index.css`, `app.js`, `pdf-parser.js`) for editado e salvo localmente, o servidor realiza automaticamente o upload silencioso da nova versão para o servidor FTP configurado.
* **Segurança**: Os arquivos sensíveis de credenciais (`credencial.txt`) e infraestrutura de desenvolvimento (`server.js`, `package.json`, etc.) **nunca** são enviados via FTP, mantendo o ambiente de produção limpo e seguro.

---

## 🛠️ Tecnologias Utilizadas

1. **Frontend**: HTML5, Vanilla CSS (com variáveis, grid, flexbox e glassmorphism) e JavaScript (ES6+).
2. **Mozilla PDF.js**: Para leitura e extração do texto do PDF com base em coordenadas horizontais e verticais.
3. **Html5-Qrcode**: Biblioteca leve para integração rápida de varredura por webcam/câmera.
4. **Web Audio API**: Para sintetizar beeps analógicos de erro e sucesso em tempo de execução.
5. **Node.js**: Servidor local de desenvolvimento (`server.js`) e motor do deploy FTP (`deploy.js` com o pacote `basic-ftp`).

---

## 📁 Estrutura de Arquivos

```
expedicao/
│   index.html          # Interface visual principal da SPA
│   index.css           # Estilização responsiva e efeitos visuais
│   app.js              # Lógica de estados, LocalStorage, áudio e scanner
│   pdf-parser.js       # Extrator de dados estruturados do PDF
│   server.js           # Servidor local Node.js e watcher de auto-deploy FTP
│   deploy.js           # Script de upload FTP baseado em whitelist
│   teste.pdf           # PDF padrão fornecido para testes
│   credencial.txt      # Credenciais do servidor FTP (ignorado pelo Git)
│   .gitignore          # Arquivos omitidos do repositório
│   package.json        # Dependências e scripts de execução
```

---

## 💻 Como Rodar o Projeto Localmente

1. Certifique-se de ter o **Node.js** instalado na máquina.
2. No diretório do projeto, instale as dependências executando:
   ```bash
   npm install
   ```
3. Inicie o servidor local:
   ```bash
   npm start
   ```
4. Acesse no seu navegador o endereço:
   👉 **[http://localhost:8080/](http://localhost:8080/)**
