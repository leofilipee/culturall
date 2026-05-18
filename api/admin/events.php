<?php
declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';

$pdo = culturall_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$adminUser = culturall_require_roles(['admin']);
$hasViewsTable = culturall_table_exists($pdo, 'eventovisualizacao');

$adminLookup = $pdo->prepare(
    'SELECT a.idadministrador
     FROM administrador a
     INNER JOIN utilizador u ON u.idutilizador = a.adidutilizador
     WHERE u.utemail = :email
     LIMIT 1'
);
$adminLookup->execute(['email' => (string) ($adminUser['email'] ?? '')]);
$adminId = (int) ($adminLookup->fetchColumn() ?: 0);

if ($method === 'GET') {
    $statusFilter = strtolower(trim((string) ($_GET['status'] ?? 'all')));
    $allowed = ['all', 'pendente', 'ativo', 'inativo', 'oculto', 'publicado', 'aprovado', 'recusado'];
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
    if ($statusFilter !== 'all') {
        $sql .= ' WHERE e.evestado = :status';
        $params['status'] = $statusFilter;
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
                    'aprovado' => 'Ativo',
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
        $lookup = $pdo->prepare('SELECT idevento FROM evento WHERE idevento = :eventId LIMIT 1');
        $lookup->execute(['eventId' => $eventId]);
        if (!$lookup->fetchColumn()) {
            throw new RuntimeException('Evento não encontrado.');
        }

        if ($action === 'delete') {
            $delete = $pdo->prepare('DELETE FROM evento WHERE idevento = :eventId');
            $delete->execute(['eventId' => $eventId]);
            $pdo->commit();

            culturall_json_response(['ok' => true]);
        }

        $status = match ($action) {
            'approve', 'show' => 'ativo',
            'hide' => 'oculto',
            'reject' => 'inativo',
            default => 'ativo'
        };

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