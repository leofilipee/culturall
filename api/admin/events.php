<?php
declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';

$pdo = culturall_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Require login first. Admin-only actions remain restricted, but organizers
// will be allowed to act on their own events (approve/reject/hide/show/delete if owner).
$currentUser = culturall_require_login();
$hasViewsTable = culturall_table_exists($pdo, 'eventovisualizacao');

$isAdmin = (($currentUser['accountType'] ?? '') === 'admin');
$organizerIdForUser = 0;
if (!$isAdmin) {
    // try to resolve if the user is an organizer
    $orgLookup = $pdo->prepare('SELECT idorganizador, orgemail FROM organizador WHERE orgemail = :email LIMIT 1');
    $orgLookup->execute(['email' => (string) ($currentUser['email'] ?? '')]);
    $row = $orgLookup->fetch(PDO::FETCH_ASSOC);
    if ($row && isset($row['idorganizador'])) {
        $organizerIdForUser = (int) $row['idorganizador'];
    }
}

// If user is admin, try to fetch admin id for auditing (optional)
$adminId = 0;
if ($isAdmin) {
    $adminLookup = $pdo->prepare(
        'SELECT a.idadministrador
         FROM administrador a
         INNER JOIN utilizador u ON u.idutilizador = a.adidutilizador
         WHERE u.utemail = :email
         LIMIT 1'
    );
    $adminLookup->execute(['email' => (string) ($currentUser['email'] ?? '')]);
    $adminId = (int) ($adminLookup->fetchColumn() ?: 0);
}

if ($method === 'GET') {
    $statusFilter = strtolower(trim((string) ($_GET['status'] ?? 'all')));
    $allowed = ['all', 'pendente', 'ativo', 'inativo', 'oculto', 'publicado', 'recusado'];
    if (!in_array($statusFilter, $allowed, true)) {
        $statusFilter = 'all';
    }

    $viewsSelect = $hasViewsTable ? ',
            COUNT(v.ideventovisualizacao) AS totalVisualizacoes' : '';
    $viewsJoin = $hasViewsTable ? '
        LEFT JOIN eventovisualizacao v ON v.evvidevento = e.idevento' : '';

    $sql = 'SELECT '
        . 'e.idevento, '
        . 'e.evtitulo, '
        . 'e.evdescricao, '
        . 'e.evdatainicio, '
        . 'e.evdatafim, '
        . 'e.evvalor, '
        . 'e.evlinkbilhete, '
        . 'e.evestado, '
        . 'e.evdatasubmissao, '
        . 'e.evdataaprovacao, '
        . 'e.evmotivorecusa, '
        . 'e.evrecorrente, '
        . 'e.evperiodicidade, '
        . 'e.evdiasrecorrencia, '
        . 'c.catnome, '
        . 'l.loccidade, '
        . 'l.locdistrito, '
        . 'o.orgnome, '
        . 'o.orgemail' . $viewsSelect . ' '
        . 'FROM evento e '
        . 'INNER JOIN categoria c ON c.idcategoria = e.evidcategoria '
        . 'INNER JOIN localizacao l ON l.idlocalizacao = e.evidlocalizacao '
        . 'INNER JOIN organizador o ON o.idorganizador = e.evidorganizador '
        . $viewsJoin;

    $params = [];
    $whereClauses = [];
    if ($statusFilter !== 'all') {
        $whereClauses[] = 'e.evestado = :status';
        $params['status'] = $statusFilter;
    }

    // If the current user is not an admin, limit results to events owned by that organizer
    if (!$isAdmin && $organizerIdForUser > 0) {
        $whereClauses[] = 'o.idorganizador = :organizerId';
        $params['organizerId'] = $organizerIdForUser;
    }

    if (count($whereClauses) > 0) {
        $sql .= ' WHERE ' . implode(' AND ', $whereClauses);
    }

    if ($hasViewsTable) {
        $sql .= ' GROUP BY e.idevento, e.evtitulo, e.evdescricao, e.evdatainicio, e.evdatafim, e.evvalor, e.evlinkbilhete, e.evestado, e.evdatasubmissao, e.evdataaprovacao, e.evmotivorecusa, e.evrecorrente, e.evperiodicidade, e.evdiasrecorrencia, c.catnome, l.loccidade, l.locdistrito, o.orgnome, o.orgemail';
    }
    $sql .= ' ORDER BY e.evdatasubmissao DESC, e.idevento DESC';
    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    culturall_json_response([
        'ok' => true,
        'events' => array_map(static function (array $row) use ($hasViewsTable): array {
            $priceValue = (float) $row['evvalor'];
            $isFree = abs($priceValue) < 0.001;

            return [
                'id' => (int) $row['idevento'],
                'title' => (string) $row['evtitulo'],
                'description' => (string) ($row['evdescricao'] ?? ''),
                'startDate' => (string) $row['evdatainicio'],
                'dateLabel' => date('d/m/Y H:i', strtotime((string) $row['evdatainicio'])),
                'endDate' => (string) ($row['evdatafim'] ?? ''),
                'price' => $priceValue,
                'priceLabel' => $isFree ? 'Entrada Gratuita' : '€' . number_format($priceValue, 0, ',', '.'),
                'priceType' => $isFree ? 'Gratuito' : 'Pago',
                'ticketUrl' => (string) ($row['evlinkbilhete'] ?? ''),
                'status' => (string) $row['evestado'],
                'statusLabel' => match ((string) $row['evestado']) {
                    'publicado' => 'Ativo',
                        'ativo' => 'Ativo',
                    'pendente' => 'Pendente',
                    'oculto' => 'Oculto',
                    'recusado' => 'Inativo',
                    'inativo' => 'Inativo',
                    default => 'Ativo'
                },
                'submittedAt' => (string) $row['evdatasubmissao'],
                'approvedAt' => (string) ($row['evdataaprovacao'] ?? ''),
                'rejectReason' => (string) ($row['evmotivorecusa'] ?? ''),
                'isRecurring' => (int) ($row['evrecorrente'] ?? 0) === 1,
                'recurringPattern' => (string) ($row['evperiodicidade'] ?? ''),
                'recurringDays' => (string) ($row['evdiasrecorrencia'] ?? ''),
                'category' => (string) $row['catnome'],
                'city' => (string) $row['loccidade'],
                'district' => (string) $row['locdistrito'],
                'organizer' => (string) $row['orgnome'],
                'organizerEmail' => (string) $row['orgemail'],
                'views' => $hasViewsTable ? (int) ($row['totalVisualizacoes'] ?? 0) : 0,
            ];
        }, $statement->fetchAll())
    ]);
}

if ($method === 'PATCH') {
    $payload = culturall_read_json_body();
    $eventId = (int) ($payload['eventId'] ?? 0);
    $action = strtolower(trim((string) ($payload['action'] ?? '')));
    $reason = trim((string) ($payload['reason'] ?? ''));

    if ($eventId <= 0 || !in_array($action, ['approve', 'reject', 'hide', 'show', 'delete'], true)) {
        culturall_json_response([
            'ok' => false,
            'message' => 'Pedido inválido.'
        ], 422);
    }

    $pdo->beginTransaction();

    try {
        $lookup = $pdo->prepare('SELECT idevento, evidorganizador FROM evento WHERE idevento = :eventId LIMIT 1');
        $lookup->execute(['eventId' => $eventId]);
        $found = $lookup->fetch(PDO::FETCH_ASSOC);
        if (!$found) {
            throw new RuntimeException('Evento não encontrado.');
        }

        // If the current user is not an admin, ensure they are the organizer owner of the event
        $eventOrganizerId = (int) ($found['evidorganizador'] ?? 0);
        if (!$isAdmin) {
            if ($organizerIdForUser <= 0 || $eventOrganizerId !== $organizerIdForUser) {
                culturall_json_response([
                    'ok' => false,
                    'message' => 'Permissão insuficiente para gerir este evento.'
                ], 403);
            }
        }

        if ($action === 'delete') {
            $delete = $pdo->prepare('DELETE FROM evento WHERE idevento = :eventId');
            $delete->execute(['eventId' => $eventId]);
            $pdo->commit();

            culturall_json_response(['ok' => true]);
        }

        $status = match ($action) {
            'approve', 'show' => 'publicado',
            'hide' => 'oculto',
            'reject' => 'inativo',
            default => 'publicado'
        };

        // Ensure the status to be written is allowed by the DB enum to avoid
        // SQL warnings/truncation when attempting to set unsupported values.
        $allowedEventStates = ['pendente', 'ativo', 'inativo', 'publicado', 'oculto', 'recusado'];
        if (!in_array($status, $allowedEventStates, true)) {
            culturall_json_response([
                'ok' => false,
                'message' => 'Estado inválido para o evento.'
            ], 422);
        }

        if ($action === 'reject') {
            $update = $pdo->prepare(
                'UPDATE evento
                 SET evestado = :status,
                     evmotivorecusa = :reason,
                     evidadministradoraprovador = :adminId
                 WHERE idevento = :eventId'
            );

            $update->execute([
                'status' => $status,
                'reason' => $reason !== '' ? $reason : 'Recusado pelo administrador.',
                'adminId' => $adminId,
                'eventId' => $eventId,
            ]);
        } else {
            $update = $pdo->prepare(
                'UPDATE evento
                 SET evestado = :status,
                     evdataaprovacao = CASE WHEN :approvedFlag = 1 THEN NOW() ELSE evdataaprovacao END,
                     evidadministradoraprovador = :adminId
                 WHERE idevento = :eventId'
            );

            $update->execute([
                'status' => $status,
                'approvedFlag' => in_array($action, ['approve', 'show'], true) ? 1 : 0,
                'adminId' => $adminId,
                'eventId' => $eventId,
            ]);
        }

        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        culturall_json_response([
            'ok' => false,
            'message' => $exception->getMessage()
        ], 500);
    }

    culturall_json_response(['ok' => true]);
}

culturall_json_response([
    'ok' => false,
    'message' => 'Método não suportado.'
], 405);