const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEnvFile, gerarConfigJsContent, sincronizarConfigJs } = require('./deploy.js');

function criarDirTemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'expedicao-deploy-test-'));
}

test('parseEnvFile le pares CHAVE=valor', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN=abc123\nOUTRA=xyz\n');
    const env = parseEnvFile(path.join(dir, '.env'));
    assert.equal(env.API_TOKEN, 'abc123');
    assert.equal(env.OUTRA, 'xyz');
});

test('parseEnvFile ignora comentarios e linhas em branco', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), '# comentario\n\nAPI_TOKEN=abc123\n# outro comentario\n');
    const env = parseEnvFile(path.join(dir, '.env'));
    assert.deepEqual(env, { API_TOKEN: 'abc123' });
});

test('parseEnvFile remove aspas ao redor do valor', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN="abc 123"\nOUTRA=\'xyz\'\n');
    const env = parseEnvFile(path.join(dir, '.env'));
    assert.equal(env.API_TOKEN, 'abc 123');
    assert.equal(env.OUTRA, 'xyz');
});

test('parseEnvFile devolve objeto vazio quando o arquivo nao existe', () => {
    const dir = criarDirTemp();
    assert.deepEqual(parseEnvFile(path.join(dir, '.env')), {});
});

test('gerarConfigJsContent produz JS valido com o token embutido', () => {
    const conteudo = gerarConfigJsContent('meu-token-secreto');
    const sandbox = {};
    // eslint-disable-next-line no-new-func
    new Function('exports', conteudo + '\nexports.CONFIG = CONFIG;')(sandbox);
    assert.equal(sandbox.CONFIG.API_TOKEN, 'meu-token-secreto');
});

test('gerarConfigJsContent escapa valores com aspas/caracteres especiais sem quebrar o JS', () => {
    const tokenMalicioso = '"; alert(1); //';
    const conteudo = gerarConfigJsContent(tokenMalicioso);
    const sandbox = {};
    new Function('exports', conteudo + '\nexports.CONFIG = CONFIG;')(sandbox);
    assert.equal(sandbox.CONFIG.API_TOKEN, tokenMalicioso);
});

test('sincronizarConfigJs escreve config.js a partir do .env', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN=token-do-env\n');
    const tokenUsado = sincronizarConfigJs(dir);
    assert.equal(tokenUsado, 'token-do-env');
    const conteudo = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
    assert.match(conteudo, /token-do-env/);
});

test('sincronizarConfigJs lanca erro quando API_TOKEN nao esta configurado em lugar nenhum', () => {
    const dir = criarDirTemp();
    const tokenOriginal = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
        assert.throws(() => sincronizarConfigJs(dir), /API_TOKEN ausente/);
        assert.equal(fs.existsSync(path.join(dir, 'config.js')), false);
    } finally {
        if (tokenOriginal !== undefined) process.env.API_TOKEN = tokenOriginal;
    }
});

test('sincronizarConfigJs nao reescreve config.js quando o conteudo ja esta atualizado', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN=token-estavel\n');
    sincronizarConfigJs(dir);
    const configPath = path.join(dir, 'config.js');
    const mtimeAntes = fs.statSync(configPath).mtimeMs;

    // Roda de novo com o mesmo .env — se reescrever, o mtime muda (e o
    // fs.watch do server.js entraria em loop, já que config.js está em
    // ALLOWED_FILES). Sincroniza em rajada pra evitar falso-negativo de
    // resolucao de clock do FS.
    for (let i = 0; i < 5; i++) {
        sincronizarConfigJs(dir);
    }
    const mtimeDepois = fs.statSync(configPath).mtimeMs;
    assert.equal(mtimeDepois, mtimeAntes);
});

test('sincronizarConfigJs prioriza process.env sobre o .env em disco (mesma prioridade do api.php)', () => {
    const dir = criarDirTemp();
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN=token-do-arquivo\n');
    const tokenOriginal = process.env.API_TOKEN;
    process.env.API_TOKEN = 'token-da-env-var';
    try {
        const tokenUsado = sincronizarConfigJs(dir);
        assert.equal(tokenUsado, 'token-da-env-var');
    } finally {
        if (tokenOriginal === undefined) delete process.env.API_TOKEN;
        else process.env.API_TOKEN = tokenOriginal;
    }
});
