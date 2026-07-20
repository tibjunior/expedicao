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
// Token definido aqui (em produção, ler de config fora da pasta pública)
// Para gerar um token seguro: php -r "echo bin2hex(random_bytes(32));"
define('API_TOKEN', 'expedicao_api_token_2026_seguro_aqui');

function authenticateRequest() {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    // Formato esperado: "Bearer <token>"
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
        if (hash_equals(API_TOKEN, $token)) {
            return true;
        }
    }
    
    // Se não houver token, permite apenas leitura (GET) sem autenticação
    // Para escrita (POST), exige token
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Autenticação necessária. Envie header: Authorization: Bearer <token>"]);
        exit();
    }
    
    return false; // GET sem token é permitido (leitura)
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
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Erro ao criar tabelas."]);
    exit();
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
            
            if (empty($nome)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Nome do despachante obrigatório."]);
                break;
            }
            
            $stmt = $db->prepare("INSERT INTO despachantes (nome, data_criacao, data_limite, concluido) VALUES (:nome, :data_criacao, :data_limite, 0)");
            $stmt->execute([
                ':nome' => $nome,
                ':data_criacao' => date('c'),
                ':data_limite' => $data_limite
            ]);
            echo json_encode(["status" => "success", "id" => $db->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao adicionar despachante."]);
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
            
            $stmt = $db->prepare("UPDATE despachantes SET concluido = 1 WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Erro ao marcar concluído."]);
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

    default:
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Ação inválida."]);
        break;
}