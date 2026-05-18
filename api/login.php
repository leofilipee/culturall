<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

culturall_require_method(['POST']);

$payload = culturall_read_json_body();
$email = strtolower(trim((string) ($payload['email'] ?? '')));
$password = (string) ($payload['password'] ?? '');

if ($email === '' || $password === '') {
    culturall_json_response([
        'ok' => false,
        'message' => 'Email e palavra-passe são obrigatórios.'
    ], 422);
}

$pdo = culturall_pdo();
$statement = $pdo->prepare(
    'SELECT u.idutilizador, u.utnome, u.utemail, u.utpasswordhash, u.utestado, t.tutipo, o.orgestado
     FROM utilizador u
     INNER JOIN tipoutilizador t ON t.idtipoutilizador = u.uttipo
     LEFT JOIN organizador o ON o.orgidutilizador = u.idutilizador
     WHERE LOWER(u.utemail) = LOWER(:email)
     LIMIT 1'
);
$statement->execute(['email' => $email]);
$user = $statement->fetch();

if (!$user) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Credenciais inválidas.'
    ], 401);
}

$storedPassword = (string) ($user['utpasswordhash'] ?? '');
$passwordMatches = password_verify($password, $storedPassword) || hash_equals($storedPassword, $password);

if (!$passwordMatches) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Credenciais inválidas.'
    ], 401);
}

if (!culturall_user_is_active($user['utestado'] ?? 'ativo')) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Conta inativa. Contacta o administrador para reativação.'
    ], 403);
}

if (($user['tutipo'] ?? '') === 'organizador' && ($user['orgestado'] ?? 'pendente') === 'pendente') {
    culturall_json_response([
        'ok' => false,
        'message' => 'Conta de organizador pendente de aprovação.'
    ], 403);
}

if (($user['tutipo'] ?? '') === 'organizador' && ($user['orgestado'] ?? 'aprovado') !== 'aprovado') {
    culturall_json_response([
        'ok' => false,
        'message' => 'Conta de organizador inativa ou suspensa.'
    ], 403);
}

$location = '';
if (culturall_column_exists($pdo, 'utilizador', 'utlocalizacao')) {
    $locationStatement = $pdo->prepare('SELECT utlocalizacao FROM utilizador WHERE idutilizador = :userId LIMIT 1');
    $locationStatement->execute(['userId' => (int) $user['idutilizador']]);
    $location = (string) ($locationStatement->fetchColumn() ?: '');
}

$sessionUser = [
    'id' => (int) $user['idutilizador'],
    'email' => (string) $user['utemail'],
    'name' => (string) $user['utnome'],
    'roleLabel' => culturall_role_label((string) $user['tutipo']),
    'accountType' => culturall_account_type((string) $user['tutipo']),
    'location' => $location
];

culturall_store_session_user($sessionUser);

culturall_json_response([
    'ok' => true,
    'user' => $sessionUser
]);