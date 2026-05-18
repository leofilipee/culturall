<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

culturall_require_method(['POST']);

$payload = culturall_read_json_body();
$eventId = (int) ($payload['eventId'] ?? 0);

if ($eventId <= 0) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Evento inválido.'
    ], 422);
}

$pdo = culturall_pdo();
$hasViewsTable = culturall_table_exists($pdo, 'eventovisualizacao');

if (!$hasViewsTable) {
    culturall_json_response([
        'ok' => true
    ]);
}

$eventStatement = $pdo->prepare('SELECT idevento FROM evento WHERE idevento = :eventId LIMIT 1');
$eventStatement->execute(['eventId' => $eventId]);

if (!$eventStatement->fetchColumn()) {
    culturall_json_response([
        'ok' => false,
        'message' => 'Evento não encontrado.'
    ], 404);
}

$user = culturall_current_user();
$userId = $user ? (int) $user['id'] : null;

$insertStatement = $pdo->prepare(
    'INSERT INTO eventovisualizacao (evvidevento, evvidutilizador) VALUES (:eventId, :userId)'
);
$insertStatement->execute([
    'eventId' => $eventId,
    'userId' => $userId,
]);

culturall_json_response([
    'ok' => true
], 201);
