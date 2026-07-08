const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');

// Arquivos que são permitidos para envio via FTP (apenas arquivos públicos da aplicação)
const ALLOWED_FILES = [
    'index.html',
    'index.css',
    'app.js',
    'pdf-parser.js',
    'teste.pdf',
    'favicon.svg'
];

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
