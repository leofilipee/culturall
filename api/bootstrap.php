<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Nome alterado para evitar conflito com a função nativa do PHP
function culturall_env(string $key, string $default = ''): string
{
    // Usamos a função nativa getenv() do PHP aqui dentro
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }

    return (string) $value;
}

function culturall_pdo(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Agora usamos a nossa nova função culturall_env
    $host     = culturall_env('MYSQLHOST', culturall_env('DB_HOST', '127.0.0.1'));
    $database = culturall_env('MYSQLDATABASE', culturall_env('DB_NAME', 'culturall'));
    $username = culturall_env('MYSQLUSER', culturall_env('DB_USER', 'root'));
    $password = culturall_env('MYSQLPASSWORD', culturall_env('DB_PASSWORD', 'root'));
    $port     = culturall_env('MYSQLPORT', culturall_env('DB_PORT', '3306'));

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $database);

    try {
        $pdo = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $exception) {
        culturall_json_response([
            'ok' => false,
            'message' => 'Não foi possível ligar à base de dados. Confirma as variáveis: MYSQLHOST, MYSQLPORT, MYSQLDATABASE, MYSQLUSER, MYSQLPASSWORD.'
        ], 500);
    }

    return $pdo;
}

function culturall_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];

    $cacheKey = strtolower($table . '.' . $column);
    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    try {
        $statement = $pdo->prepare(
            'SELECT 1
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :tableName
               AND column_name = :columnName
             LIMIT 1'
        );
        $statement->execute([
            'tableName' => $table,
            'columnName' => $column,
        ]);

        $cache[$cacheKey] = (bool) $statement->fetchColumn();
    } catch (Throwable) {
        $cache[$cacheKey] = false;
    }

    return $cache[$cacheKey];
}

function culturall_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];

    $cacheKey = strtolower($table);
    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    try {
        $statement = $pdo->prepare(
            'SELECT 1
             FROM information_schema.tables
             WHERE table_schema = DATABASE()
               AND table_name = :tableName
             LIMIT 1'
        );
        $statement->execute(['tableName' => $table]);

        $cache[$cacheKey] = (bool) $statement->fetchColumn();
    } catch (Throwable) {
        $cache[$cacheKey] = false;
    }

    return $cache[$cacheKey];
}

function culturall_json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function culturall_require_method(array $allowedMethods): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $allowedMethods, true)) {
        culturall_json_response([
            'ok' => false,
            'message' => 'Método não permitido.'
        ], 405);
    }
}

function culturall_read_json_body(): array
{
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || trim($rawBody) === '') {
        return [];
    }

    $decoded = json_decode($rawBody, true);
    if (!is_array($decoded)) {
        culturall_json_response([
            'ok' => false,
            'message' => 'JSON inválido.'
        ], 400);
    }

    return $decoded;
}

function culturall_role_label(string $tipoutilizador): string
{
    return match ($tipoutilizador) {
        'registado' => 'Utilizador (lambda)',
        'organizador' => 'Organizador',
        'administrador' => 'Administrador',
        default => 'Utilizador'
    };
}

function culturall_account_type(string $tipoutilizador): string
{
    return match ($tipoutilizador) {
        'registado' => 'lambda',
        'organizador' => 'organizador',
        'administrador' => 'admin',
        default => 'lambda'
    };
}

function culturall_user_is_active(mixed $state): bool
{
    if (is_bool($state)) {
        return $state;
    }

    if (is_int($state) || is_float($state)) {
        return (int) $state === 1;
    }

    if ($state === null) {
        return true;
    }

    $normalizedState = strtolower(trim((string) $state));
    return in_array($normalizedState, ['1', 'true', 'ativo', 'active'], true);
}

function culturall_user_status_code(bool $isActive): string
{
    return $isActive ? 'ativo' : 'inativo';
}

function culturall_current_user(): ?array
{
    return $_SESSION['culturall_user'] ?? null;
}

function culturall_require_login(): array
{
    $user = culturall_current_user();
    if (!$user) {
        culturall_json_response([
            'ok' => false,
            'message' => 'Sessão inexistente.'
        ], 401);
    }

    return $user;
}

function culturall_require_roles(array $allowedRoles): array
{
    $user = culturall_require_login();
    if (!in_array($user['accountType'] ?? '', $allowedRoles, true)) {
        culturall_json_response([
            'ok' => false,
            'message' => 'Permissão insuficiente.'
        ], 403);
    }

    return $user;
}

function culturall_store_session_user(array $user): void
{
    $_SESSION['culturall_user'] = $user;
}

function culturall_destroy_session(): void
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }

    session_destroy();
}

function culturall_check_db_warnings(PDO $pdo): void
{
    try {
        $warnings = $pdo->query('SHOW WARNINGS')->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($warnings)) {
            $messages = array_map(static function (array $w) {
                return trim(($w['Level'] ?? '') . ': ' . ($w['Message'] ?? ''));
            }, $warnings);
            throw new RuntimeException('Database warnings: ' . implode(' | ', $messages));
        }
    } catch (Throwable $e) {
        throw $e;
    }
}