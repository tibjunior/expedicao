<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Arquivo do banco SQLite na raiz
$db_file = __DIR__ . '/expedicao.db';
try {
    $db = new PDO("sqlite:" . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Erro na conexão com banco: " . $e->getMessage()]);
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
    echo json_encode(["status" => "error", "message" => "Erro ao criar tabelas: " . $e->getMessage()]);
    exit();
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'get_despachantes_ativos':
        try {
            $stmt = $db->prepare("SELECT * FROM despachantes WHERE concluido = 0 ORDER BY data_criacao DESC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'get_all_despachantes':
        try {
            $stmt = $db->prepare("SELECT * FROM despachantes ORDER BY data_criacao DESC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
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
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
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
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'get_logs':
        try {
            $despachante_id = isset($_GET['despachante_id']) ? intval($_GET['despachante_id']) : 0;
            $stmt = $db->prepare("SELECT * FROM logs WHERE despachante_id = :despachante_id ORDER BY timestamp DESC");
            $stmt->execute([':despachante_id' => $despachante_id]);
            echo json_encode($stmt->fetchAll());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'add_despachante':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $nome = isset($input['nome']) ? trim($input['nome']) : '';
            $data_limite = isset($input['data_limite']) ? trim($input['data_limite']) : '';
            
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
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'save_itens':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
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
                $stmt->execute([
                    ':despachante_id' => $despachante_id,
                    ':nota' => $item['nota'],
                    ':ec' => isset($item['ec']) ? $item['ec'] : '',
                    ':cliente' => $item['cliente'],
                    ':canal' => $item['canal'],
                    ':descricao' => $item['descricao'],
                    ':sku' => $item['sku'],
                    ':ean' => $item['ean'],
                    ':temEan' => $item['temEan'] ? 1 : 0,
                    ':quantidade' => intval($item['quantidade']),
                    ':quantidadeOriginal' => intval($item['quantidadeOriginal']),
                    ':expedido' => $item['expedido'] ? 1 : 0,
                    ':dataExpedicao' => isset($item['dataExpedicao']) ? $item['dataExpedicao'] : null
                ]);
            }
            $db->commit();
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'update_item':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $item = isset($input['item']) ? $input['item'] : null;
            
            if (!$item || !isset($item['id'])) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Item inválido."]);
                break;
            }
            
            $stmt = $db->prepare("UPDATE itens SET quantidade = :quantidade, expedido = :expedido, dataExpedicao = :dataExpedicao WHERE id = :id");
            $stmt->execute([
                ':id' => intval($item['id']),
                ':quantidade' => intval($item['quantidade']),
                ':expedido' => $item['expedido'] ? 1 : 0,
                ':dataExpedicao' => $item['dataExpedicao']
            ]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'add_log':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $log = isset($input['log']) ? $input['log'] : null;
            
            if (!$log || !isset($log['despachante_id'])) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Log inválido."]);
                break;
            }
            
            $stmt = $db->prepare("INSERT INTO logs (despachante_id, timestamp, nota, ean, quantidade, acao, tipo) 
                                  VALUES (:despachante_id, :timestamp, :nota, :ean, :quantidade, :acao, :tipo)");
            $stmt->execute([
                ':despachante_id' => intval($log['despachante_id']),
                ':timestamp' => $log['timestamp'],
                ':nota' => $log['nota'],
                ':ean' => $log['ean'],
                ':quantidade' => intval($log['quantidade']),
                ':acao' => $log['acao'],
                ':tipo' => $log['tipo']
            ]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'marcar_despachante_concluido':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            $stmt = $db->prepare("UPDATE despachantes SET concluido = 1 WHERE id = :id");
            $stmt->execute([':id' => $id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'delete_despachante':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id = isset($input['id']) ? intval($input['id']) : 0;
            
            $db->beginTransaction();
            // Deleta o despachante
            $stmt = $db->prepare("DELETE FROM despachantes WHERE id = :id");
            $stmt->execute([':id' => $id]);
            
            // Deleta itens
            $stmt = $db->prepare("DELETE FROM itens WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $id]);
            
            // Deleta logs
            $stmt = $db->prepare("DELETE FROM logs WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $id]);
            
            $db->commit();
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    case 'clear_logs':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $despachante_id = isset($input['despachante_id']) ? intval($input['despachante_id']) : 0;
            
            $stmt = $db->prepare("DELETE FROM logs WHERE despachante_id = :despachante_id");
            $stmt->execute([':despachante_id' => $despachante_id]);
            echo json_encode(["status" => "success"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Ação inválida."]);
        break;
}
