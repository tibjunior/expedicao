<?php
/**
 * API REST do Sistema de Expedição
 * 
 * CORREÇÕES DE SEGURANÇA (Fase 1):
 * 1.1 - Sanitização de inputs (strip_tags + htmlspecialchars)
 * 1.2 - Banco SQLite movido para fora da pasta pública (../)
 * 1.3 - CORS restrito a origens específicas
 * 1.4 - Autenticação por token (API Key via header Authorization)
 * 1.5 - Credenciais movidas para .env (fora da pasta pública)
 */

// ==========================================
// 1.3 - CORS RESTRITO
// ==========================================
$allowed_origins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'https://projetormagcubic.online',
    'https://www.projetormagcubic.online'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    // Se não houver origin (requisição direta), permite localhost como fallback
    header("Access-Control-Allow-Origin: http://localhost:8080");
}
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ==========================================
// 1.4 - AUTENTICAÇÃO POR TOKEN
// ==========================================
// Token lido de variável de ambiente ou arquivo .env
// Para gerar um token seguro: php -r "echo bin2hex(random_bytes(32));"
// Em produção, configure a variável de ambiente API_TOKEN

// Tenta ler de variável de ambiente primeiro
$apiToken = getenv('API_TOKEN');
$bipagemApiKey = getenv('BIPAGEM_API_KEY');

// Se não encontrar, tenta ler de arquivo .env
if (!$apiToken || !$bipagemApiKey) {
    $envFile = __DIR__ . '/.env';
    if (file_exists($envFile)) {
        $envLines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($envLines as $line) {
            if (strpos($line, '#') === 0) continue;
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value, ' "\'');
                if ($key === 'API_TOKEN' && !$apiToken) $apiToken = $value;
                if ($key === 'BIPAGEM_API_KEY' && !$bipagemApiKey) $bipagemApiKey = $value;
            }
        }
    }
}

// Fallback para valores padrão (apenas para desenvolvimento)
if (!$apiToken) $apiToken = 'expedicao_api_token_2026_seguro_aqui';
if (!$bipagemApiKey) $bipagemApiKey = 'bipagem_key_producao_kn8x_aqui';

define('API_TOKEN', $apiToken);
define('BIPAGEM_API_KEY', $bipagemApiKey);

function authenticateRequest() {
    // Tenta getallheaders() primeiro, depois $_SERVER (compatível com CGI/FPM)
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    
    // Tenta múltiplas fontes do header (compatibilidade com CGI/FPM)
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!$authHeader) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    }
    
    // Formato esperado: "Bearer <token>"
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
        if (hash_equals(API_TOKEN, $token)) {
            return true;
        }
    }
    
    // Fallback: header customizado X-API-Token (não é strippeado por CGI)
    $xApiToken = $headers['X-API-Token'] ?? $headers['X-Api-Token'] ?? '';
    if (!$xApiToken) {
        $xApiToken = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    }
    if ($xApiToken && hash_equals(API_TOKEN, trim($xApiToken))) {
        return true;
    }
    
    // Fallback: token via query parameter (sempre funciona em CGI)
    $queryToken = $_GET['token'] ?? '';
    if ($queryToken && hash_equals(API_TOKEN, trim($queryToken))) {
        return true;
    }
    
    // Se não houver token, permite apenas leitura (GET) sem autenticação
    // Para escrita (POST), exige token
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Autenticação necessária. Envie token via header, X-API-Token ou parâmetro ?token="]);
        exit();
    }
    
    return false; // GET sem token é permitido (leitura)
}

/**
 * Autenticação flexível: tenta header Authorization, depois campo 'api_token' no body.
 * Útil para hostings que strippeiam headers em modo CGI/FPM.
 */
function authenticateRequestFlexible() {
    // 1. Tenta autenticação por header Authorization
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!$authHeader) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    }
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
        if (hash_equals(API_TOKEN, $token)) {
            return true;
        }
    }
    
    // 2. Tenta header customizado X-API-Token (CGI-friendly)
    $xApiToken = $headers['X-API-Token'] ?? $headers['X-Api-Token'] ?? '';
    if (!$xApiToken) {
        $xApiToken = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    }
    if ($xApiToken && hash_equals(API_TOKEN, trim($xApiToken))) {
        return true;
    }
    
    // 3. Tenta token via query parameter (sempre funciona em CGI)
    $queryToken = $_GET['token'] ?? '';
    if ($queryToken && hash_equals(API_TOKEN, trim($queryToken))) {
        return true;
    }
    
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Autenticação necessária."]);
    exit();
}

// ==========================================
// 1.2 - BANCO FORA DA PASTA PÚBLICA
// ==========================================
$db_file = __DIR__ . '/../expedicao.db';

// Se o banco antigo existir na raiz, migra para o novo local
$old_db = __DIR__ . '/expedicao.db';
if (file_exists($old_db) && !file_exists($db_file)) {
    rename($old_db, $db_file);
}

try {
    $db = new PDO("sqlite:" . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Erro na conexão com banco."]);
    exit();
}

// Inicializa as tabelas se não existirem
try {
    $db->exec("CREATE TABLE IF NOT EXISTS despachantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        data_criacao TEXT NOT NULL,
        data_limite TEXT,
        cnpj TEXT DEFAULT '',
        concluido INTEGER DEFAULT 0
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despachante_id INTEGER NOT NULL,
        nota TEXT,
        ec TEXT,
        cliente TEXT,
        canal TEXT,
        descricao TEXT,
        sku TEXT,
        ean TEXT,
        temEan INTEGER,
        quantidade INTEGER,
        quantidadeOriginal INTEGER,
        expedido INTEGER,
        dataExpedicao TEXT
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despachante_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        nota TEXT,
        ean TEXT,
        quantidade INTEGER,
        acao TEXT,
        tipo TEXT
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS lojas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cnpj TEXT NOT NULL
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS etiquetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despachante_id INTEGER NOT NULL,
        ec TEXT,
        tipo TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        arquivo_origem TEXT DEFAULT '',
        data_upload TEXT NOT NULL,
        impressa INTEGER DEFAULT 0
    )");
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Erro ao criar tabelas."]);
    exit();
}

// Migração: adiciona a coluna cnpj em despachantes caso o banco já exista
try {
    $despachantesCols = $db->query("PRAGMA table_info(despachantes)")->fetchAll();
    $hasCnpj = false;
    foreach ($despachantesCols as $col) {
        if (isset($col['name']) && $col['name'] === 'cnpj') { $hasCnpj = true; break; }
    }
    if (!$hasCnpj) {
        $db->exec("ALTER TABLE despachantes ADD COLUMN cnpj TEXT DEFAULT ''");
    }
} catch (PDOException $e) {
    // Em caso de falha na migração, apenas registra e segue (banco continua utilizável)
    error_log('Falha ao migrar coluna cnpj em despachantes: ' . $e->getMessage());
}

// ==========================================
// 1.1 - FUNÇÃO DE SANITIZAÇÃO
// ==========================================
function sanitize($value) {
    if ($value === null) return null;
    $value = strip_tags($value);           // Remove tags HTML/JS
    $value = htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'); // Codifica caracteres especiais
    return trim($value);
}

function sanitizeArray($item) {
    $clean = [];
    foreach ($item as $key => $value) {
        if (is_string($value)) {
            $clean[$key] = sanitize($value);
        } else {
            $clean[$key] = $value; // Inteiros/booleanos não precisam sanitização
        }
    }
    return $clean;
}

// ==========================================
// ROTEAMENTO DAS AÇÕES
// ==========================================
$action = isset($_GET['action']) ? sanitize($_GET['action']) : '';

switch ($action) {
    // --- ROTAS DE LEITURA (GET - permitidas sem token) ---
    case 'get_despachantes_ativos':
        try {
            $stmt = $db->prepare("SELECT * FROM despachantes WHERE concluido = 0 ORDER BY data_criacao DESC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar despachantes."]);
        }
        break;

    case 'get_all_despachantes':
        try {
            $stmt = $db->prepare("SELECT * FROM despachantes ORDER BY data_criacao DESC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar despachantes."]);
        }
        break;

    case 'get_despachante':
        try {
            $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
            $stmt = $db->prepare("SELECT * FROM despachantes WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode($stmt->fetch() ?: null);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar despachante."]);
        }
        break;

    case 'get_itens':
        try {
            $despachante_id = isset($_GET['despachante_id']) ? intval($_GET['despachante_id']) : 0;
            $stmt = $db->prepare("SELECT * FROM itens WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $despachante_id]);
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar itens."]);
        }
        break;

    case 'get_logs':
        try {
            $despachante_id = isset($_GET['despachante_id']) ? intval($_GET['despachante_id']) : 0;
            if ($despachante_id > 0) {
                $stmt = $db->prepare("SELECT * FROM logs WHERE despachante_id = :despachante_id ORDER BY timestamp DESC");
                $stmt->execute([':despachante_id' => $despachante_id]);
            } else {
                $stmt = $db->prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar logs."]);
        }
        break;

    case 'get_all_lojas':
        try {
            $stmt = $db->prepare("SELECT * FROM lojas ORDER BY nome ASC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar lojas."]);
        }
        break;

    // --- ROTAS DE ESCRITA (POST - exigem autenticação) ---
    case 'add_despachante':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            $nome = isset($input['nome']) ? sanitize(trim($input['nome'])) : '';
            $data_limite = isset($input['data_limite']) ? sanitize(trim($input['data_limite'])) : '';
            $cnpj = isset($input['cnpj']) ? sanitize(trim($input['cnpj'])) : '';
            
            if (empty($nome)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Nome do despachante obrigatório."]);
                break;
            }
            
            $stmt = $db->prepare("INSERT INTO despachantes (nome, data_criacao, data_limite, cnpj, concluido) VALUES (:nome, :data_criacao, :data_limite, :cnpj, 0)");
            $stmt->execute([
                ':nome' => $nome,
                ':data_criacao' => date('c'),
                ':data_limite' => $data_limite,
                ':cnpj' => $cnpj
            ]);
            echo json_encode(["status" => "success", "id" => $db->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao adicionar despachante."]);
        }
        break;

    case 'bipagem_expedicao':
    // Endpoint público — proxy para API Tiny
    // Autenticação com Tiny é feita via token_tiny no body
    try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            // Pedidos en formato string (por plataforma: Shopee, MercadoLivre "702-3112191-8144262",
            // Amazon, Magalu...). NO usar intval/parseInt — truncaría y enviaría el pedido equivocado.
            $pedidos = [];
            if (isset($input['pedidos']) && is_array($input['pedidos'])) {
                foreach ($input['pedidos'] as $p) {
                    $pedidoStr = sanitize(trim((string)$p));
                    if ($pedidoStr !== '') {
                        $pedidos[] = $pedidoStr;
                    }
                }
            }
            $cnpj = isset($input['cnpj']) ? sanitize(trim($input['cnpj'])) : '';
            // Token recebido do frontend (vem do localStorage do device confiável)
            $bearerToken = isset($input['token']) ? sanitize(trim($input['token'])) : BIPAGEM_API_KEY;
            
            // Validação básica
            if (empty($pedidos)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Nenhum pedido informado."]);
                break;
            }
            
            if (count($pedidos) > 50) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Máximo de 50 pedidos por chamada."]);
                break;
            }
            
            if (!$bearerToken) {
                http_response_code(401);
                echo json_encode(["status" => "error", "message" => "Token de autenticação não informado."]);
                break;
            }
            
            // Prepara o payload para a API Tiny (sem o token)
            // Só inclui 'cnpj' quando houver valor — a API rejeita string vazia
            $payload = [
                'pedidos' => $pedidos
            ];
            if (!empty($cnpj)) {
                $payload['cnpj'] = $cnpj;
            }
            
            // Chama a API Tiny via CURL (server-side, evita problemas de CORS)
            $ch = curl_init('https://dashvturbo.kn8x.com.br/api/bipagem/expedicao');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $bearerToken
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            // Registra no log do servidor quando a API retornar erro (para diagnóstico)
            if ($httpCode >= 400) {
                $logdados = [
                    'http' => $httpCode,
                    'pedidos' => $pedidos,
                    'cnpj' => ($cnpj ?: '(vazio)'),
                    'resposta' => substr((string)$response, 0, 500)
                ];
                error_log('[BIPAGEM] ' . json_encode($logdados, JSON_UNESCAPED_UNICODE));
            }
            
            // Encaminha o código HTTP da API Tiny para o frontend
            http_response_code($httpCode);
            
            if ($response === false) {
                echo json_encode(["status" => "error", "message" => "Erro ao comunicar com a API Tiny."]);
                break;
            }
            
            // Retorna a resposta exatamente como a API Tiny devolveu
            // Isso inclui os status por pedido e as etiquetas
            echo $response;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro interno no servidor."]);
        }
        break;

    case 'add_loja':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            $nome = isset($input['nome']) ? sanitize(trim($input['nome'])) : '';
            $cnpj = isset($input['cnpj']) ? sanitize(trim($input['cnpj'])) : '';
            
            if (empty($nome) || empty($cnpj)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Nome e CNPJ da loja são obrigatórios."]);
                break;
            }
            
            $stmt = $db->prepare("INSERT INTO lojas (nome, cnpj) VALUES (:nome, :cnpj)");
            $stmt->execute([':nome' => $nome, ':cnpj' => $cnpj]);
            echo json_encode(["status" => "success", "id" => $db->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao adicionar loja."]);
        }
        break;

    case 'delete_loja':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Id da loja inválido."]);
                break;
            }
            
            $stmt = $db->prepare("DELETE FROM lojas WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao deletar loja."]);
        }
        break;

    case 'save_itens':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            $itens = isset($input['itens']) ? $input['itens'] : [];
            $despachante_id = isset($input['despachante_id']) ? intval($input['despachante_id']) : 0;
            
            if ($despachante_id <= 0 || empty($itens)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Dados inválidos."]);
                break;
            }
            
            $db->beginTransaction();
            $stmt = $db->prepare("INSERT INTO itens (despachante_id, nota, ec, cliente, canal, descricao, sku, ean, temEan, quantidade, quantidadeOriginal, expedido, dataExpedicao) 
                                  VALUES (:despachante_id, :nota, :ec, :cliente, :canal, :descricao, :sku, :ean, :temEan, :quantidade, :quantidadeOriginal, :expedido, :dataExpedicao)");
            
            foreach ($itens as $item) {
                $itemSanitized = sanitizeArray($item);
                $stmt->execute([
                    ':despachante_id' => $despachante_id,
                    ':nota' => $itemSanitized['nota'] ?? '',
                    ':ec' => $itemSanitized['ec'] ?? '',
                    ':cliente' => $itemSanitized['cliente'] ?? '',
                    ':canal' => $itemSanitized['canal'] ?? '',
                    ':descricao' => $itemSanitized['descricao'] ?? '',
                    ':sku' => $itemSanitized['sku'] ?? '',
                    ':ean' => $itemSanitized['ean'] ?? '',
                    ':temEan' => isset($item['temEan']) ? ($item['temEan'] ? 1 : 0) : 0,
                    ':quantidade' => intval($item['quantidade'] ?? 0),
                    ':quantidadeOriginal' => intval($item['quantidadeOriginal'] ?? 0),
                    ':expedido' => isset($item['expedido']) ? ($item['expedido'] ? 1 : 0) : 0,
                    ':dataExpedicao' => $itemSanitized['dataExpedicao'] ?? null
                ]);
            }
            $db->commit();
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao salvar itens."]);
        }
        break;

    case 'update_item':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            $item = isset($input['item']) ? $input['item'] : null;
            
            if (!$item || !isset($item['id'])) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Item inválido."]);
                break;
            }
            
            $itemSanitized = sanitizeArray($item);
            
            $stmt = $db->prepare("UPDATE itens SET quantidade = :quantidade, expedido = :expedido, dataExpedicao = :dataExpedicao WHERE id = :id");
            $stmt->execute([
                ':id' => intval($item['id']),
                ':quantidade' => intval($item['quantidade'] ?? 0),
                ':expedido' => isset($item['expedido']) ? ($item['expedido'] ? 1 : 0) : 0,
                ':dataExpedicao' => $itemSanitized['dataExpedicao'] ?? null
            ]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao atualizar item."]);
        }
        break;

    case 'add_log':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "JSON inválido."]);
                break;
            }
            
            $log = isset($input['log']) ? $input['log'] : null;
            
            if (!$log || !isset($log['despachante_id'])) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Log inválido."]);
                break;
            }
            
            $logSanitized = sanitizeArray($log);
            
            $stmt = $db->prepare("INSERT INTO logs (despachante_id, timestamp, nota, ean, quantidade, acao, tipo) 
                                  VALUES (:despachante_id, :timestamp, :nota, :ean, :quantidade, :acao, :tipo)");
            $stmt->execute([
                ':despachante_id' => intval($log['despachante_id']),
                ':timestamp' => $logSanitized['timestamp'] ?? date('c'),
                ':nota' => $logSanitized['nota'] ?? '',
                ':ean' => $logSanitized['ean'] ?? '',
                ':quantidade' => intval($log['quantidade'] ?? 0),
                ':acao' => $logSanitized['acao'] ?? '',
                ':tipo' => $logSanitized['tipo'] ?? 'info'
            ]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao adicionar log."]);
        }
        break;

    case 'marcar_despachante_concluido':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID inválido."]);
                break;
            }
            
            $stmt = $db->prepare("UPDATE despachantes SET concluido = 1 WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao marcar concluído."]);
        }
        break;

    case 'reabrir_despachante':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID inválido."]);
                break;
            }
            
            $stmt = $db->prepare("UPDATE despachantes SET concluido = 0 WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao reabrir despachante."]);
        }
        break;

    case 'delete_log':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID inválido."]);
                break;
            }
            
            $stmt = $db->prepare("DELETE FROM logs WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao deletar log."]);
        }
        break;

    case 'delete_despachante':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            $db->beginTransaction();
            $stmt = $db->prepare("DELETE FROM despachantes WHERE id = :id");
            $stmt->execute([':id' => $id]);
            
            $stmt = $db->prepare("DELETE FROM itens WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $id]);
            
            $stmt = $db->prepare("DELETE FROM logs WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $id]);
            
            $db->commit();
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao deletar despachante."]);
        }
        break;

    case 'clear_logs':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $despachante_id = isset($input['despachante_id']) ? intval($input['despachante_id']) : 0;
            
            $stmt = $db->prepare("DELETE FROM logs WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $despachante_id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao limpar logs."]);
        }
        break;

    // ===== Etiquetas de Envio =====
    case 'upload_etiqueta':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $despachante_id = intval($input['despachante_id'] ?? 0);
            $ec = sanitize($input['ec'] ?? '');
            $tipo = sanitize($input['tipo'] ?? 'pdf');
            $conteudo = $input['conteudo'] ?? '';
            $arquivo_origem = sanitize($input['arquivo_origem'] ?? '');
            
            $stmt = $db->prepare("INSERT INTO etiquetas 
                (despachante_id, ec, tipo, conteudo, arquivo_origem, data_upload, impressa) 
                VALUES (:did, :ec, :tipo, :conteudo, :arquivo, :data, 0)");
            $stmt->execute([
                ':did' => $despachante_id,
                ':ec' => $ec,
                ':tipo' => $tipo,
                ':conteudo' => $conteudo,
                ':arquivo' => $arquivo_origem,
                ':data' => date('c')
            ]);
            echo json_encode(["status" => "ok", "id" => $db->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao salvar etiqueta."]);
        }
        break;

    case 'get_etiquetas':
        authenticateRequest();
        try {
            $despachante_id = intval($_GET['despachante_id'] ?? 0);
            $stmt = $db->prepare("SELECT id, despachante_id, ec, tipo, arquivo_origem, data_upload, impressa 
                FROM etiquetas WHERE despachante_id = :did ORDER BY id");
            $stmt->execute([':did' => $despachante_id]);
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar etiquetas."]);
        }
        break;

    case 'get_etiqueta_by_ec':
        authenticateRequest();
        try {
            $despachante_id = intval($_GET['despachante_id'] ?? 0);
            $ec = sanitize($_GET['ec'] ?? '');
            $stmt = $db->prepare("SELECT * FROM etiquetas WHERE despachante_id = :did AND ec = :ec LIMIT 1");
            $stmt->execute([':did' => $despachante_id, ':ec' => $ec]);
            $row = $stmt->fetch();
            echo json_encode($row ?: null);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao buscar etiqueta."]);
        }
        break;

    case 'marcar_etiqueta_impressa':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = intval($input['id'] ?? 0);
            $stmt = $db->prepare("UPDATE etiquetas SET impressa = 1 WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "ok"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao atualizar etiqueta."]);
        }
        break;

    case 'delete_etiqueta':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = intval($input['id'] ?? 0);
            $stmt = $db->prepare("DELETE FROM etiquetas WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "ok"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao remover etiqueta."]);
        }
        break;

    case 'delete_all_etiquetas':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $despachante_id = intval($input['despachante_id'] ?? 0);
            $stmt = $db->prepare("DELETE FROM etiquetas WHERE despachante_id = :did");
            $stmt->execute([':did' => $despachante_id]);
            echo json_encode(["status" => "ok"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao limpar etiquetas."]);
        }
        break;

    case 'vincular_etiqueta':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $despachante_id = intval($input['despachante_id'] ?? 0);
            $ec = sanitize($input['ec'] ?? '');
            $stmt = $db->prepare("UPDATE etiquetas SET ec = :ec WHERE despachante_id = :did AND (ec = '' OR ec IS NULL) LIMIT 1");
            $stmt->execute([':did' => $despachante_id, ':ec' => $ec]);
            echo json_encode(["status" => "ok"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao vincular etiqueta."]);
        }
        break;

    case 'update_etiqueta_ec':
        authenticateRequest();
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = intval($input['id'] ?? 0);
            $ec = sanitize($input['ec'] ?? '');
            $stmt = $db->prepare("UPDATE etiquetas SET ec = :ec WHERE id = :id");
            $stmt->execute([':id' => $id, ':ec' => $ec]);
            echo json_encode(["status" => "ok"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao atualizar etiqueta."]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Ação inválida."]);
        break;
}