const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');

// Arquivos que são permitidos para envio via FTP (apenas arquivos públicos da aplicação)
const ALLOWED_FILES = [
    'index.html',
    'index.css',
    'app.js',
    'etiquetas-ui.js',
    'pdf-parser.js',
    'config.js',
    'teste.pdf',
    'favicon.svg',
    'logo.png',
    'api.php',
    '.htaccess',
    '.env'
];

/**
 * Lê e decodifica as credenciais do arquivo .env.ftp ou credencial.txt
 */
function readCredentials() {
    // Tenta ler de variáveis de ambiente primeiro
    let host = process.env.FTP_HOST;
    let user = process.env.FTP_USER;
    let password = process.env.FTP_PASS;
    let port = process.env.FTP_PORT ? parseInt(process.env.FTP_PORT, 10) : 21;

    if (host && user && password) {
        return { host, user, password, port };
    }

    // Tenta ler de arquivo .env.ftp
    const envFtpPath = path.join(__dirname, '.env.ftp');
    if (fs.existsSync(envFtpPath)) {
        const content = fs.readFileSync(envFtpPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('#') || !line.includes('=')) continue;
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
            switch (key.trim()) {
                case 'FTP_HOST': host = value; break;
                case 'FTP_USER': user = value; break;
                case 'FTP_PASS': password = value; break;
                case 'FTP_PORT': port = parseInt(value, 10) || 21; break;
            }
        }
        if (host && user && password) {
            return { host, user, password, port };
        }
    }

    // Fallback para credencial.txt (formato legado)
    const credPath = path.join(__dirname, 'credencial.txt');
    if (!fs.existsSync(credPath)) {
        throw new Error('Credenciais FTP não encontradas. Configure .env.ftp ou credencial.txt.');
    }

    const content = fs.readFileSync(credPath, 'utf8');
    
    const hostMatch = content.match(/Servidor\s+FTP:\s*(\S+)/i);
    const userMatch = content.match(/Nome\s+de\s+usuário\s+do\s+FTP:\s*(\S+)/i);
    const passMatch = content.match(/Senha:\s*(\S+)/i);
    const portMatch = content.match(/porta\s+FTPS\s+explícita:\s*(\d+)/i);

    if (!hostMatch || !userMatch || !passMatch) {
        throw new Error('Formato inválido no credencial.txt.');
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

module.exports = { runDeploy, ALLOWED_FILES };
