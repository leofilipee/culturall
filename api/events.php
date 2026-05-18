<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$pdo = culturall_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$hasViewsTable = culturall_table_exists($pdo, 'eventovisualizacao');

$normalizeEventImageSource = static function (mixed $value): ?string {
    $imageSource = trim((string) $value);
    if ($imageSource === '') {
        return null;
    }

    $lowerSource = strtolower($imageSource);
    if (str_starts_with($lowerSource, 'data:image/')) {
        return $imageSource;
    }

    if (preg_match('/^https?:\/\//i', $imageSource) === 1 || str_starts_with($imageSource, '/')) {
        return $imageSource;
    }

    return null;
};

$storeEventImages = static function (PDO $pdo, int $eventId, array $imageSources, bool $replaceExisting = false) use ($normalizeEventImageSource): void {
    $normalizedImages = [];
    foreach ($imageSources as $imageIndex => $imageSource) {
        $normalizedImage = $normalizeEventImageSource($imageSource);
        if ($normalizedImage === null) {
            continue;
        }

        $normalizedImages[] = [
            'index' => (int) $imageIndex,
            'source' => $normalizedImage,
        ];
    }

    if ($replaceExisting) {
        $deleteImages = $pdo->prepare('DELETE FROM imagem WHERE imgidevento = :eventId');
        $deleteImages->execute(['eventId' => $eventId]);
    }

    if (!$normalizedImages) {
        return;
    }

    $insertImage = $pdo->prepare(
        'INSERT INTO imagem (imglegenda, imgurl, imgtipo, imgidevento) VALUES (:caption, :url, :type, :eventId)'
    );

    foreach ($normalizedImages as $normalizedImage) {
        $insertImage->execute([
            'caption' => $normalizedImage['index'] === 0 ? null : null,
            'url' => $normalizedImage['source'],
            'type' => $normalizedImage['index'] === 0 ? 'capa' : 'galeria',
            'eventId' => $eventId,
        ]);
    }
};

if ($method === 'GET') {
    $statusFilter = strtolower(trim((string) ($_GET['status'] ?? 'published')));
    $allowedStatuses = ['published', 'pending', 'hidden', 'rejected', 'all'];
    if (!in_array($statusFilter, $allowedStatuses, true)) {
        $statusFilter = 'published';
    }

    $currentUser = culturall_current_user();
    $scope = strtolower(trim((string) ($_GET['scope'] ?? 'all')));
    $isOwnScope = $scope === 'own' && ($currentUser['accountType'] ?? '') === 'organizador';
    if (($currentUser['accountType'] ?? '') !== 'admin' && $statusFilter === 'all' && !$isOwnScope) {
        $statusFilter = 'published';
    }

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
        . 'l.locmorada, '
        . 'l.loccidade, '
        . 'l.locdistrito, '
        . 'o.orgnome, '
        . 'o.orgemail';

    if ($hasViewsTable) {
        $sql .= ', COUNT(v.ideventovisualizacao) AS totalVisualizacoes';
    }

    $sql .= ', (SELECT img.imgurl FROM imagem img WHERE img.imgidevento = e.idevento AND img.imgtipo = \'capa\' ORDER BY img.idimagem ASC LIMIT 1) AS imagem_capa';
    $sql .= ' FROM evento e INNER JOIN categoria c ON c.idcategoria = e.evidcategoria INNER JOIN localizacao l ON l.idlocalizacao = e.evidlocalizacao INNER JOIN organizador o ON o.idorganizador = e.evidorganizador';

    if ($hasViewsTable) {
        $sql .= ' LEFT JOIN eventovisualizacao v ON v.evvidevento = e.idevento';
    }

    $conditions = [];
    $params = [];

    if ($isOwnScope) {
        $conditions[] = 'o.orgemail = :organizerEmail';
        $params['organizerEmail'] = (string) ($currentUser['email'] ?? '');
    }

    if ($statusFilter !== 'all') {
        if ($statusFilter === 'published') {
            $conditions[] = 'e.evestado IN (:statusPublished, :statusActive)';
            $params['statusPublished'] = 'publicado';
            $params['statusActive'] = 'ativo';
        } else {
            $conditions[] = 'e.evestado = :status';
            $params['status'] = $statusFilter === 'pending' ? 'pendente' : ($statusFilter === 'hidden' ? 'oculto' : 'recusado');
        }
    }

    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }

    if ($hasViewsTable) {
        $sql .= ' GROUP BY e.idevento, e.evtitulo, e.evdescricao, e.evdatainicio, e.evdatafim, e.evvalor, e.evlinkbilhete, e.evestado, e.evdatasubmissao, e.evdataaprovacao, e.evmotivorecusa, e.evrecorrente, e.evperiodicidade, e.evdiasrecorrencia, c.catnome, l.locmorada, l.loccidade, l.locdistrito, o.orgnome, o.orgemail, imagem_capa';
    }
    $sql .= ' ORDER BY e.evdatainicio DESC, e.idevento DESC';

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $events = array_map(static function (array $row) use ($hasViewsTable): array {
        $priceValue = (float) ($row['evvalor'] ?? 0);
        $isFree = abs($priceValue) < 0.001;

        return [
            'id' => (int) $row['idevento'],
            'title' => (string) $row['evtitulo'],
            'description' => (string) ($row['evdescricao'] ?? ''),
            'dateLabel' => date('d/m/Y H:i', strtotime((string) $row['evdatainicio'])),
            'dateBucket' => 'Publicado',
            'eventDate' => (string) $row['evdatainicio'],
            'location' => trim((string) $row['locmorada'] . ', ' . (string) $row['loccidade']),
            'city' => (string) $row['loccidade'],
            'district' => (string) $row['locdistrito'],
            'category' => (string) $row['catnome'],
            'priceLabel' => $isFree ? 'Entrada Gratuita' : '€' . number_format($priceValue, 0, ',', '.'),
            'priceType' => $isFree ? 'Gratuito' : 'Pago',
            'views' => $hasViewsTable ? (int) ($row['totalVisualizacoes'] ?? 0) : 0,
            'ticketUrl' => (string) ($row['evlinkbilhete'] ?? ''),
            'status' => (string) $row['evestado'],
            'statusLabel' => match ((string) $row['evestado']) {
                'publicado' => 'Publicado',
                'aprovado' => 'Publicado',
                'ativo' => 'Publicado',
                'pendente' => 'Pendente',
                'oculto' => 'Oculto',
                'recusado' => 'Recusado',
                default => 'Publicado'
            },
            'isRecurring' => (int) ($row['evrecorrente'] ?? 0) === 1,
            'recurringPattern' => (string) ($row['evperiodicidade'] ?? ''),
            'recurringDays' => (string) ($row['evdiasrecorrencia'] ?? ''),
            'submittedAt' => (string) ($row['evdatasubmissao'] ?? ''),
            'approvedAt' => (string) ($row['evdataaprovacao'] ?? ''),
            'rejectReason' => (string) ($row['evmotivorecusa'] ?? ''),
            'organizer' => (string) $row['orgnome'],
            'organizerEmail' => (string) $row['orgemail'],
            'image' => (string) ($row['imagem_capa'] ?? '')
        ];
    }, $statement->fetchAll());

    culturall_json_response([
        'ok' => true,
        'events' => $events
    ]);
}

if ($method === 'POST') {
    $user = culturall_require_roles(['organizador', 'admin']);
    $payload = culturall_read_json_body();

    $normalizeDateTime = static function (string $value): ?string {
        $trimmedValue = trim($value);
        if ($trimmedValue === '') {
            return null;
        }

        try {
            $dateTime = new DateTimeImmutable($trimmedValue);
            return $dateTime->format('Y-m-d H:i:s');
        } catch (Throwable) {
            return null;
        }
    };

    $title = trim((string) ($payload['title'] ?? ''));
    $description = trim((string) ($payload['description'] ?? ''));
    $startDate = trim((string) ($payload['startDate'] ?? ''));
    $endDate = trim((string) ($payload['endDate'] ?? ''));
    $price = (float) ($payload['price'] ?? 0);
    $ticketUrl = trim((string) ($payload['ticketUrl'] ?? ''));
    $categoryName = trim((string) ($payload['category'] ?? ''));
    $locationStreet = trim((string) ($payload['locationStreet'] ?? ''));
    $locationCity = trim((string) ($payload['locationCity'] ?? ''));
    $locationDistrict = trim((string) ($payload['locationDistrict'] ?? ''));
    $imageUrls = $payload['images'] ?? [];
    $isRecurring = !empty($payload['isRecurring']);
    $recurringPattern = trim((string) ($payload['recurringPattern'] ?? ''));
    $recurringDays = trim((string) ($payload['recurringDays'] ?? ''));

    if ($title === '' || $startDate === '' || $categoryName === '' || $locationCity === '' || $locationDistrict === '') {
        culturall_json_response([
            'ok' => false,
            'message' => 'Título, data inicial, categoria e localização são obrigatórios.'
        ], 422);
    }

    $normalizedStartDate = $normalizeDateTime($startDate);
    $normalizedEndDate = $normalizeDateTime($endDate);

    if ($normalizedStartDate === null) {
        culturall_json_response([
            'ok' => false,
            'message' => 'A data inicial não é válida.'
        ], 422);
    }

    $pdo->beginTransaction();

    try {
        $categoryId = null;
        $categoryStatement = $pdo->prepare('SELECT idcategoria FROM categoria WHERE catnome = :name LIMIT 1');
        $categoryStatement->execute(['name' => $categoryName]);
        $categoryId = $categoryStatement->fetchColumn() ?: null;

        if (!$categoryId) {
            $insertCategory = $pdo->prepare('INSERT INTO categoria (catnome) VALUES (:name)');
            $insertCategory->execute(['name' => $categoryName]);
            $categoryId = (int) $pdo->lastInsertId();
        }

        $locationId = null;
        $locationStatement = $pdo->prepare(
            'SELECT idlocalizacao FROM localizacao WHERE locmorada <=> :street AND loccidade = :city AND locdistrito = :district LIMIT 1'
        );
        $locationStatement->execute([
            'street' => $locationStreet !== '' ? $locationStreet : null,
            'city' => $locationCity,
            'district' => $locationDistrict,
        ]);
        $locationId = $locationStatement->fetchColumn() ?: null;

        if (!$locationId) {
            $insertLocation = $pdo->prepare(
                'INSERT INTO localizacao (locmorada, loccidade, locdistrito) VALUES (:street, :city, :district)'
            );
            $insertLocation->execute([
                'street' => $locationStreet !== '' ? $locationStreet : null,
                'city' => $locationCity,
                'district' => $locationDistrict,
            ]);
            $locationId = (int) $pdo->lastInsertId();
        }

        $organizerStatement = $pdo->prepare('SELECT idorganizador FROM organizador WHERE orgidutilizador = :userId LIMIT 1');
        $organizerStatement->execute(['userId' => (int) $user['id']]);
        $organizerId = (int) ($organizerStatement->fetchColumn() ?: 0);

        if ($organizerId <= 0) {
            throw new RuntimeException('O utilizador autenticado não tem perfil de organizador.');
        }

        $insertEvent = $pdo->prepare(
            'INSERT INTO evento (
                evtitulo, evdescricao, evdatainicio, evdatafim, evvalor, evlinkbilhete, evestado,
                evdatasubmissao, evrecorrente, evperiodicidade, evdiasrecorrencia,
                evidcategoria, evidlocalizacao, evidorganizador
             ) VALUES (
                :title, :description, :startDate, :endDate, :price, :ticketUrl, :status,
                NOW(), :isRecurring, :recurringPattern, :recurringDays,
                :categoryId, :locationId, :organizerId
             )'
        );
        $insertEvent->execute([
            'title' => $title,
            'description' => $description !== '' ? $description : null,
            'startDate' => $normalizedStartDate,
            'endDate' => $normalizedEndDate,
            'price' => $price,
            'ticketUrl' => $ticketUrl !== '' ? $ticketUrl : null,
            'status' => 'pendente',
            'isRecurring' => $isRecurring ? 1 : 0,
            'recurringPattern' => $recurringPattern !== '' ? $recurringPattern : null,
            'recurringDays' => $recurringDays !== '' ? $recurringDays : null,
            'categoryId' => $categoryId,
            'locationId' => $locationId,
            'organizerId' => $organizerId,
        ]);

        $eventId = (int) $pdo->lastInsertId();

        if (is_array($imageUrls) && $imageUrls !== []) {
            $storeEventImages($pdo, $eventId, $imageUrls, false);
        }

        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        culturall_json_response([
            'ok' => false,
            'message' => $exception->getMessage()
        ], 500);
    }

    culturall_json_response([
        'ok' => true,
        'message' => 'Evento criado com sucesso.',
        'eventId' => $eventId
    ], 201);
}

if ($method === 'PATCH') {
    $user = culturall_require_roles(['organizador', 'admin']);
    $payload = culturall_read_json_body();
    $action = strtolower(trim((string) ($payload['action'] ?? '')));
    $eventId = (int) ($payload['eventId'] ?? 0);

    if ($eventId <= 0 || $action === '') {
        culturall_json_response(['ok' => false, 'message' => 'Pedido inválido.'], 422);
    }

    try {
        // verify ownership or admin
        $stmt = $pdo->prepare('SELECT e.idevento, o.orgemail FROM evento e INNER JOIN organizador o ON o.idorganizador = e.evidorganizador WHERE e.idevento = :eventId LIMIT 1');
        $stmt->execute(['eventId' => $eventId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Evento não encontrado.');
        }

        $isAdmin = ($user['accountType'] ?? '') === 'admin';
        $isOwner = isset($user['email']) && strtolower($user['email']) === strtolower((string) ($row['orgemail'] ?? ''));
        if (!$isAdmin && !$isOwner) {
            culturall_json_response(['ok' => false, 'message' => 'Sem permissão.'], 403);
        }

        if ($action === 'delete') {
            $delete = $pdo->prepare('DELETE FROM evento WHERE idevento = :eventId');
            $delete->execute(['eventId' => $eventId]);
            culturall_json_response(['ok' => true]);
        }

        $allowedEventStates = ['pendente', 'ativo', 'inativo', 'publicado', 'oculto', 'recusado'];

        if ($action === 'inactivate') {
            $status = 'inativo';
            if (!in_array($status, $allowedEventStates, true)) {
                culturall_json_response(['ok' => false, 'message' => 'Estado inválido para o evento.'], 422);
            }
            $update = $pdo->prepare('UPDATE evento SET evestado = :status WHERE idevento = :eventId');
            $update->execute(['status' => $status, 'eventId' => $eventId]);
            culturall_json_response(['ok' => true]);
        }

        if ($action === 'update') {
            // organizer edits: update fields and set status back to pendente for re-approval
            $title = trim((string) ($payload['title'] ?? ''));
            $description = trim((string) ($payload['description'] ?? ''));
            $startDate = trim((string) ($payload['startDate'] ?? ''));
            $endDate = trim((string) ($payload['endDate'] ?? ''));
            $price = (float) ($payload['price'] ?? 0);
            $ticketUrl = trim((string) ($payload['ticketUrl'] ?? ''));
            $categoryName = trim((string) ($payload['category'] ?? ''));
            $locationStreet = trim((string) ($payload['locationStreet'] ?? ''));
            $locationCity = trim((string) ($payload['locationCity'] ?? ''));
            $locationDistrict = trim((string) ($payload['locationDistrict'] ?? ''));

            $pdo->beginTransaction();
            // update category/location if necessary (reuse logic from POST)
            $categoryId = null;
            $categoryStatement = $pdo->prepare('SELECT idcategoria FROM categoria WHERE catnome = :name LIMIT 1');
            $categoryStatement->execute(['name' => $categoryName]);
            $categoryId = $categoryStatement->fetchColumn() ?: null;
            if (!$categoryId) {
                $insertCategory = $pdo->prepare('INSERT INTO categoria (catnome) VALUES (:name)');
                $insertCategory->execute(['name' => $categoryName]);
                $categoryId = (int) $pdo->lastInsertId();
            }

            $locationId = null;
            $locationStatement = $pdo->prepare('SELECT idlocalizacao FROM localizacao WHERE locmorada <=> :street AND loccidade = :city AND locdistrito = :district LIMIT 1');
            $locationStatement->execute([
                'street' => $locationStreet !== '' ? $locationStreet : null,
                'city' => $locationCity,
                'district' => $locationDistrict,
            ]);
            $locationId = $locationStatement->fetchColumn() ?: null;
            if (!$locationId) {
                $insertLocation = $pdo->prepare('INSERT INTO localizacao (locmorada, loccidade, locdistrito) VALUES (:street, :city, :district)');
                $insertLocation->execute([
                    'street' => $locationStreet !== '' ? $locationStreet : null,
                    'city' => $locationCity,
                    'district' => $locationDistrict,
                ]);
                $locationId = (int) $pdo->lastInsertId();
            }

            $update = $pdo->prepare('UPDATE evento SET evtitulo = :title, evdescricao = :description, evdatainicio = :startDate, evdatafim = :endDate, evvalor = :price, evlinkbilhete = :ticketUrl, evidcategoria = :categoryId, evidlocalizacao = :locationId, evestado = :status WHERE idevento = :eventId');
            $update->execute([
                'title' => $title !== '' ? $title : null,
                'description' => $description !== '' ? $description : null,
                'startDate' => $startDate !== '' ? $startDate : null,
                'endDate' => $endDate !== '' ? $endDate : null,
                'price' => $price,
                'ticketUrl' => $ticketUrl !== '' ? $ticketUrl : null,
                'categoryId' => $categoryId,
                'locationId' => $locationId,
                'status' => 'pendente',
                'eventId' => $eventId,
            ]);

            if (isset($payload['images']) && is_array($payload['images']) && $payload['images'] !== []) {
                $storeEventImages($pdo, $eventId, $payload['images'], true);
            }

            $pdo->commit();
            culturall_json_response(['ok' => true]);
        }

        culturall_json_response(['ok' => false, 'message' => 'Ação não suportada.'], 422);
    } catch (Throwable $e) {
        culturall_json_response(['ok' => false, 'message' => $e->getMessage()], 500);
    }
}

culturall_json_response([
    'ok' => false,
    'message' => 'Método não suportado.'
], 405);