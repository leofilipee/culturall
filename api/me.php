<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

culturall_require_method(['GET', 'PATCH']);

$user = culturall_current_user();

if (!$user) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Sessão inexistente.'
    ], 401);
}

$pdo = culturall_pdo();
$databaseLocation = (string) ($user['location'] ?? '');

if (culturall_column_exists($pdo, 'utilizador', 'utlocalizacao')) {
    $locationStatement = $pdo->prepare('SELECT utlocalizacao FROM utilizador WHERE idutilizador = :userId LIMIT 1');
    $locationStatement->execute(['userId' => (int) $user['id']]);
    $databaseLocation = (string) ($locationStatement->fetchColumn() ?: '');

    if ($databaseLocation !== ($user['location'] ?? '')) {
        $user = [
            ...$user,
            'location' => $databaseLocation,
        ];
        culturall_store_session_user($user);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PATCH') {
    $payload = culturall_read_json_body();
    $location = trim((string) ($payload['location'] ?? ''));

    if (culturall_column_exists($pdo, 'utilizador', 'utlocalizacao')) {
        $statement = $pdo->prepare('UPDATE utilizador SET utlocalizacao = :location WHERE idutilizador = :userId');
        $statement->execute([
            'location' => $location !== '' ? $location : null,
            'userId' => (int) $user['id'],
        ]);
    }

    $updatedUser = [
        ...$user,
        'location' => $location,
    ];

    culturall_store_session_user($updatedUser);

    culturall_json_response([
        'ok' => true,
        'user' => $updatedUser
    ]);
}

culturall_json_response([
    'ok' => true,
    'user' => $user
]);