const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');

// Arquivos que são permitidos para envio via FTP (apenas arquivos públicos da aplicação)
const ALLOWED_FILES = [
    'index.html',
    'index.css',
    'app.js',
    'bipagem-utils.js',
    'pdf-parser.js',
    'teste.pdf',
    'favicon.svg',
    'logo.png',
    'api.php',
    '.htaccess',
    '.env',
    'config.js'
];

/**
 * Lê um arquivo no formato .env (CHAVE=valor, uma por linha, # para
 * comentário) e devolve um objeto. Não usa nenhuma lib externa — mesmo
 * princípio "sem build step" do resto do projeto.
 */
function parseEnvFile(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) {
        return env;
    }
    const linhas = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const linhaBruta of linhas) {
        const linha = linhaBruta.trim();
        if (!linha || linha.startsWith('#') || !linha.includes('=')) {
            continue;
        }
        const idx = linha.indexOf('=');
        const chave = linha.slice(0, idx).trim();
        const valor = linha.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        env[chave] = valor;
    }
    return env;
}

/**
 * Gera o conteúdo do config.js a partir do API_TOKEN — o mesmo token que
 * api.php lê do .env. Função pura, testável isoladamente.
 */
function gerarConfigJsContent(apiToken) {
    return `// Gerado automaticamente a partir do .env (npm start / node deploy.js).\n// NÃO editar à mão, NÃO versionar — ver .gitignore.\nconst CONFIG = { API_TOKEN: ${JSON.stringify(apiToken)} };\n`;
}

/**
 * Garante que config.js em disco reflete o API_TOKEN atual do .env.
 * Só escreve se o conteúdo mudou (evita disparar o fs.watch do server.js
 * em loop, já que config.js está em ALLOWED_FILES). Lança erro se não
 * houver API_TOKEN configurado — falha fechada, nunca sobe um config.js
 * com token vazio (foi exatamente isso que quebrou a autenticação em
 * produção antes desta correção).
 */
function sincronizarConfigJs(baseDir = __dirname) {
    const env = { ...parseEnvFile(path.join(baseDir, '.env')), ...process.env };
    const apiToken = env.API_TOKEN;
    if (!apiToken) {
        throw new Error('API_TOKEN ausente. Defina API_TOKEN no .env (raiz do projeto) antes de rodar/dar deploy.');
    }
    const configPath = path.join(baseDir, 'config.js');
    const novoConteudo = gerarConfigJsContent(apiToken);
    const atual = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
    if (atual !== novoConteudo) {
        fs.writeFileSync(configPath, novoConteudo, 'utf8');
    }
    return apiToken;
}

/**
 * Lê e decodifica as credenciais do arquivo credencial.txt
 */
function readCredentials() {
    const credPath = path.join(__dirname, 'credencial.txt');
    if (!fs.existsSync(credPath)) {
        throw new Error('Arquivo credencial.txt não encontrado na raiz do projeto.');
    }

    const content = fs.readFileSync(credPath, 'utf8');
    
    // Captura usando expressões regulares
    const hostMatch = content.match(/Servidor\s+FTP:\s*(\S+)/i);
    const userMatch = content.match(/Nome\s+de\s+usuário\s+do\s+FTP:\s*(\S+)/i);
    const passMatch = content.match(/Senha:\s*(\S+)/i);
    const portMatch = content.match(/porta\s+FTPS\s+explícita:\s*(\d+)/i);

    if (!hostMatch || !userMatch || !passMatch) {
        throw new Error('Formato inválido no credencial.txt. Certifique-se de que contém Servidor FTP, Nome de usuário e Senha.');
    }

    return {
        host: hostMatch[1].trim(),
        user: userMatch[1].trim(),
        password: passMatch[1].trim(),
        port: portMatch ? parseInt(portMatch[1].trim(), 10) : 21
    };
}

/**
 * Executa o deploy dos arquivos permitidos para o FTP
 */
async function runDeploy() {
    console.log('🔄 Iniciando deploy via FTP...');

    try {
        sincronizarConfigJs();
    } catch (e) {
        console.error('❌ Erro ao gerar config.js:', e.message);
        return false;
    }

    let credentials;
    try {
        credentials = readCredentials();
    } catch (e) {
        console.error('❌ Erro ao ler credenciais:', e.message);
        return false;
    }

    const client = new ftp.Client();
    // Ativa log detalhado no console para depuração se necessário
    client.ftp.verbose = false;

    try {
        console.log(`🔌 Conectando a ${credentials.host}:${credentials.port}...`);
        await client.access({
            host: credentials.host,
            user: credentials.user,
            password: credentials.password,
            port: credentials.port,
            secure: false // Conexão FTP padrão (mudar para true se exigir FTPS implícito, mas porta 21 explícita costuma negociar TLS dinamicamente ou usar FTP simples)
        });
        
        console.log('✅ Conexão estabelecida com sucesso!');
        
        // Fazer upload dos arquivos permitidos
        for (const file of ALLOWED_FILES) {
            const localPath = path.join(__dirname, file);
            if (fs.existsSync(localPath)) {
                console.log(`📤 Enviando ${file}...`);
                await client.uploadFrom(localPath, file);
            } else {
                console.warn(`⚠️ Arquivo local ${file} não encontrado. Pulando.`);
            }
        }
        
        console.log('🎉 Deploy concluído com sucesso!');
        return true;
    } catch (err) {
        console.error('❌ Erro no deploy via FTP:', err);
        return false;
    } finally {
        client.close();
        console.log('🔌 Conexão FTP encerrada.');
    }
}

// Se o script for executado diretamente via terminal (ex: node deploy.js)
if (require.main === module) {
    runDeploy();
}

module.exports = { runDeploy, ALLOWED_FILES, parseEnvFile, gerarConfigJsContent, sincronizarConfigJs };
