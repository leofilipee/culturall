const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const PASSWORD_HASH_ROUNDS = 12;
let pool;

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function mysqlSslConfig() {
  if (env('MYSQL_SSL', 'true') !== 'true') {
    return undefined;
  }

  const configuredCa = env('MYSQL_SSL_CA');
  const ca = configuredCa
    ? (configuredCa.startsWith('base64:')
      ? Buffer.from(configuredCa.slice('base64:'.length), 'base64').toString('utf8')
      : configuredCa.replace(/\\n/g, '\n'))
    : undefined;

  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {})
  };
}

function getPool() {
  if (!pool) {
    const host = env('MYSQL_HOST', env('MYSQLHOST', env('DB_HOST')));
    const database = env('MYSQL_DATABASE', env('MYSQLDATABASE', env('DB_NAME', 'culturall')));
    const user = env('MYSQL_USER', env('MYSQLUSER', env('DB_USER')));
    const password = env('MYSQL_PASSWORD', env('MYSQLPASSWORD', env('DB_PASSWORD')));
    if (!host || !user || !password) {
      throw new Error('Configure MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD e SESSION_SECRET na Vercel.');
    }
    pool = mysql.createPool({
      host,
      port: Number(env('MYSQL_PORT', env('MYSQLPORT', env('DB_PORT', '3306')))),
      database,
      user,
      password,
      waitForConnections: true,
      connectionLimit: 3,
      ssl: mysqlSslConfig()
    });
  }
  return pool;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    // Um corpo inválido (por exemplo, de um sendBeacon truncado) não deve rebentar o pedido.
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function queryParam(req, name) {
  const fromQuery = req.query?.[name];
  if (fromQuery !== undefined) return Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
  try { return new URL(req.url, 'http://localhost').searchParams.get(name) ?? undefined; } catch { return undefined; }
}

function sessionSecret() {
  const secret = env('SESSION_SECRET');
  if (!secret && env('VERCEL')) throw new Error('SESSION_SECRET não está configurado.');
  return secret || 'local-development-only-change-me';
}

function encodeSession(user) {
  const value = Buffer.from(JSON.stringify(user)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }));
}

function currentUser(req) {
  const token = readCookies(req).culturall_session;
  if (!token) return null;
  const [value, signature] = token.split('.');
  if (!value || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { return null; }
}

function setSession(res, user) {
  const secure = env('VERCEL') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `culturall_session=${encodeURIComponent(encodeSession(user))}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=604800`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'culturall_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function requireUser(req, res, roles = []) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { ok: false, message: 'Sessão inexistente.' });
    return null;
  }
  if (roles.length && !roles.includes(user.accountType)) {
    json(res, 403, { ok: false, message: 'Permissão insuficiente.' });
    return null;
  }
  return user;
}

function roleLabel(type) {
  return type === 'organizador' ? 'Organizador' : type === 'administrador' ? 'Administrador' : 'Utilizador (lambda)';
}

function accountType(type) {
  return type === 'organizador' ? 'organizador' : type === 'administrador' ? 'admin' : 'lambda';
}

function isActive(value) {
  return ['1', 1, true, 'true', 'ativo', 'active'].includes(value) || value == null;
}

/* ============================================================
 * Constantes e utilitários partilhados
 * ============================================================ */
const TIMEZONE = 'Europe/Lisbon';

const DISTRICTS = ['Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra', 'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre', 'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo', 'Vila Real', 'Viseu', 'Outros'];

const CATEGORIES = ['Arte e Exposições', 'Bem Estar', 'Cinema', 'Comédia', 'Concertos', 'Dança', 'Festivais', 'Gastronomia', 'Literatura', 'Mercados e Feiras', 'Moda', 'Outros', 'Família', 'Teatro'];

const ORGANIZER_TYPES = ['empresa', 'associacao', 'municipio', 'espaco_cultural', 'independente'];

// Tipos de interação registados em eventointeracao. O clique em "Ver Bilhetes" só é registado por /api/go.
const INTERACTION_TYPES = ['visualizacao', 'clique_bilhete', 'favorito_add', 'favorito_remove', 'partilha', 'calendario'];
const CLIENT_TRACKABLE = ['visualizacao', 'favorito_add', 'favorito_remove', 'partilha', 'calendario'];
const INTERACTION_SOURCES = ['lista', 'mapa', 'destaques', 'pesquisa', 'relacionados', 'perfil', 'partilha', 'calendario', 'direto'];
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl\/|wget|python-requests|httpclient|node-fetch|axios|go-http-client/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// As interações são guardadas na hora de Lisboa (evidatahora), para que ano/semestre/trimestre/mês
// coincidam com o calendário de quem lê o dashboard, sem depender de tabelas de fusos horários na BD.
const lisbonFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function lisbonTimestamp(date = new Date()) {
  return lisbonFormatter.format(date).replace('T', ' ');
}

function utcTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function detectDevice(userAgent = '') {
  if (/ipad|tablet|playbook|silk/i.test(userAgent) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function cleanSessionId(value) {
  const text = String(value || '');
  return SESSION_ID_PATTERN.test(text) ? text : null;
}

function cleanSource(value, fallback = 'direto') {
  const text = String(value || '').toLowerCase();
  return INTERACTION_SOURCES.includes(text) ? text : fallback;
}

// Só aceita endereços http(s); evita "javascript:", "data:" e afins nos links de bilhetes e de websites.
function cleanHttpUrl(value, maxLength = 2048) {
  const raw = String(value || '').trim();
  if (!raw) return { url: null };
  if (raw.length > maxLength) return { error: 'O endereço é demasiado longo.' };
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'O endereço tem de começar por http:// ou https://.' };
    return { url: parsed.href };
  } catch {
    return { error: 'Endereço inválido.' };
  }
}

function normalizeDateTime(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const normalized = `${match[1]} ${match[2]}:${match[3] || '00'}`;
  return Number.isNaN(new Date(normalized.replace(' ', 'T')).getTime()) ? null : normalized;
}

function matchCanonical(list, value) {
  const text = String(value || '').trim().toLowerCase();
  return list.find((item) => item.toLowerCase() === text) || null;
}

// Valida e normaliza os campos de um evento (criação e edição). Devolve { error } ou os valores limpos.
function validateEventInput(body) {
  const title = String(body.title || '').trim();
  if (!title || title.length > 150) return { error: 'O título é obrigatório (máx. 150 caracteres).' };

  let description;
  if (body.description !== undefined) {
    description = String(body.description || '').trim();
    if (description.length > 1000) return { error: 'A descrição não pode ter mais de 1000 caracteres.' };
    description = description || null;
  }

  const startDate = normalizeDateTime(body.startDate);
  if (!startDate) return { error: 'Data de início inválida.' };
  let endDate = null;
  if (String(body.endDate || '').trim()) {
    endDate = normalizeDateTime(body.endDate);
    if (!endDate) return { error: 'Data de fim inválida.' };
    if (endDate < startDate) return { error: 'A data de fim não pode ser anterior à data de início.' };
  }

  const price = Number(body.price ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: 'Preço inválido.' };

  // Eventos gratuitos não têm bilheteira: o link é descartado. Os pagos precisam de um link http(s) válido.
  let ticketUrl = null;
  if (price > 0) {
    const checked = cleanHttpUrl(body.ticketUrl);
    if (checked.error || !checked.url) return { error: 'Indica um link de bilhetes válido (http:// ou https://) para eventos pagos.' };
    ticketUrl = checked.url;
  }

  const category = matchCanonical(CATEGORIES, body.category);
  if (!category) return { error: 'Categoria inválida.' };

  const city = String(body.locationCity || '').trim();
  if (!city || city.length > 100) return { error: 'Indica a cidade do evento (máx. 100 caracteres).' };
  const district = matchCanonical(DISTRICTS, body.locationDistrict);
  if (!district) return { error: 'Escolhe o distrito do evento.' };
  const street = String(body.locationStreet || '').trim();
  if (street.length > 150) return { error: 'O local/morada não pode ter mais de 150 caracteres.' };

  let latitude = null;
  let longitude = null;
  if (body.latitude !== undefined && body.latitude !== null && body.latitude !== '') {
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { error: 'Coordenadas inválidas.' };
  }

  const recurringPattern = ['semanal', 'quinzenal', 'mensal'].includes(body.recurringPattern) ? body.recurringPattern : null;
  const recurringDays = String(body.recurringDays || '').slice(0, 100) || null;

  return {
    title, description, startDate, endDate, price, ticketUrl, category, city, district, street: street || null,
    latitude, longitude, isRecurring: Boolean(body.isRecurring), recurringPattern, recurringDays
  };
}

async function resolveCategoryId(db, name) {
  const [rows] = await db.query('SELECT idcategoria FROM categoria WHERE catnome=? LIMIT 1', [name]);
  if (rows[0]) return rows[0].idcategoria;
  const [result] = await db.query('INSERT INTO categoria (catnome) VALUES (?)', [name]);
  return result.insertId;
}

async function resolveLocationId(db, input) {
  const lat = input.latitude === null ? null : input.latitude.toFixed(6);
  const lng = input.longitude === null ? null : input.longitude.toFixed(6);
  const [rows] = await db.query('SELECT idlocalizacao FROM localizacao WHERE locmorada <=> ? AND loccidade=? AND locdistrito=? AND loclatitude <=> ? AND loclongitude <=> ? LIMIT 1', [input.street, input.city, input.district, lat, lng]);
  if (rows[0]) return rows[0].idlocalizacao;
  const [result] = await db.query('INSERT INTO localizacao (locmorada,loccidade,locdistrito,loclatitude,loclongitude) VALUES (?,?,?,?,?)', [input.street, input.city, input.district, lat, lng]);
  return result.insertId;
}

/* ============================================================
 * Esquema da base de dados (migração idempotente)
 * ============================================================
 * O mesmo conteúdo está em bdd/Migration_2026_11_04_analytics.sql. Aqui é aplicado automaticamente
 * na primeira utilização de cada instância, para a ordem entre o deploy e a migração não importar.
 * Requer permissões de CREATE/ALTER. Se faltarem, os endpoints devolvem 503 com instruções. */
let schemaPromise = null;

async function applySchema(db) {
  const ignoreExisting = (error) => {
    if ([1050, 1060, 1061].includes(error?.errno)) return; // tabela/coluna/índice já existe (corrida entre instâncias)
    throw error;
  };
  const run = (sql) => db.query(sql).catch(ignoreExisting);

  const [tables] = await db.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('eventointeracao','eventovisualizacao')");
  const hasTable = (name) => tables.some((row) => row.t === name);
  const [columns] = await db.query("SELECT table_name AS t, column_name AS c, character_maximum_length AS len FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('evento','localizacao','favorito','organizador')");
  const hasColumn = (table, column) => columns.some((row) => row.t === table && row.c === column);

  const additions = [
    ['evento', 'evpublicaem', 'DATETIME NULL'],
    ['evento', 'evdatapublicacao', 'DATETIME NULL'],
    ['localizacao', 'loclatitude', 'DECIMAL(9,6) NULL'],
    ['localizacao', 'loclongitude', 'DECIMAL(9,6) NULL'],
    ['favorito', 'favdata', 'DATETIME NULL'],
    ['organizador', 'orgtipo', 'VARCHAR(30) NULL'],
    ['organizador', 'orgconcelho', 'VARCHAR(100) NULL'],
    ['organizador', 'orgtembilheteira', 'VARCHAR(10) NULL'],
    ['organizador', 'orginteressebilheteira', 'VARCHAR(10) NULL']
  ];
  const added = new Set();
  for (const [table, column, definition] of additions) {
    if (!hasColumn(table, column)) {
      await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      added.add(column);
    }
  }

  const ticketColumn = columns.find((row) => row.t === 'evento' && row.c === 'evlinkbilhete');
  if (ticketColumn && Number(ticketColumn.len) < 2048) {
    await db.query('ALTER TABLE evento MODIFY COLUMN evlinkbilhete VARCHAR(2048) NULL');
  }

  if (added.has('evdatapublicacao')) {
    // 'ativo' e 'publicado' significavam o mesmo; passa a existir só 'publicado'. A data de publicação dos
    // eventos já existentes é aproximada pela data de aprovação ou de submissão.
    await db.query("UPDATE evento SET evestado='publicado' WHERE evestado='ativo'");
    await db.query("UPDATE evento SET evdatapublicacao = COALESCE(evdataaprovacao, evdatasubmissao) WHERE evdatapublicacao IS NULL AND evestado='publicado'");
  }

  // Aprovação obrigatória: os eventos criados antes desta regra (e já visíveis ou ocultos) contam como aprovados.
  // O limite de data evita aprovar, no futuro, rascunhos novos que o organizador tenha ocultado.
  await db.query("UPDATE evento SET evdataaprovacao = COALESCE(evdatapublicacao, evdatasubmissao) WHERE evdataaprovacao IS NULL AND evestado IN ('publicado','ativo','oculto','inativo') AND evdatasubmissao < '2026-11-07 00:00:00'");

  // Pedidos de alteração: quando um organizador edita um evento já aprovado, a versão pública mantém-se e as
  // alterações ficam aqui até um administrador as aprovar (ou o organizador cancelar o pedido).
  await run(`CREATE TABLE IF NOT EXISTS eventoalteracao (
    idalteracao INT NOT NULL AUTO_INCREMENT,
    alidevento INT NOT NULL,
    aldados LONGTEXT NOT NULL,
    aldata DATETIME NOT NULL,
    almotivo VARCHAR(300) NULL,
    PRIMARY KEY (idalteracao),
    UNIQUE KEY uq_al_evento (alidevento)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Sem chaves estrangeiras de propósito: o histórico de interações tem de sobreviver ao apagar de eventos e contas.
  // Os atributos do evento (organizador, categoria, distrito, preço) ficam copiados no momento da interação.
  await run(`CREATE TABLE IF NOT EXISTS eventointeracao (
    ideventointeracao BIGINT NOT NULL AUTO_INCREMENT,
    evitipo ENUM('visualizacao','clique_bilhete','favorito_add','favorito_remove','partilha','calendario') NOT NULL,
    eviidevento INT NOT NULL,
    eviidutilizador INT NULL,
    evisessao VARCHAR(64) NULL,
    evidatahora DATETIME NOT NULL,
    evidispositivo VARCHAR(10) NULL,
    eviorigem VARCHAR(30) NULL,
    eviidorganizador INT NULL,
    evicategoria VARCHAR(100) NULL,
    evidistrito VARCHAR(100) NULL,
    evipreco DECIMAL(10,2) NULL,
    evisimulado TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (ideventointeracao),
    KEY idx_evi_evento_tipo_data (eviidevento, evitipo, evidatahora),
    KEY idx_evi_data (evidatahora),
    KEY idx_evi_organizador_data (eviidorganizador, evidatahora),
    KEY idx_evi_sessao (evisessao, eviidevento, evitipo),
    KEY idx_evi_utilizador (eviidutilizador)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  if (!hasTable('eventointeracao') && hasTable('eventovisualizacao')) {
    // Passa o histórico de visualizações antigas para a tabela nova (uma vez; a marca "legacy-<id>" evita duplicados).
    await db.query(`INSERT INTO eventointeracao (evitipo, eviidevento, eviidutilizador, evisessao, evidatahora, eviorigem, eviidorganizador, evicategoria, evidistrito, evipreco)
      SELECT 'visualizacao', v.evvidevento, v.evvidutilizador, CONCAT('legacy-', v.ideventovisualizacao), v.evvdatahora, 'legado', e.evidorganizador, c.catnome, l.locdistrito, e.evvalor
      FROM eventovisualizacao v
      JOIN evento e ON e.idevento = v.evvidevento
      JOIN categoria c ON c.idcategoria = e.evidcategoria
      JOIN localizacao l ON l.idlocalizacao = e.evidlocalizacao
      WHERE NOT EXISTS (SELECT 1 FROM eventointeracao i WHERE i.evisessao = CONCAT('legacy-', v.ideventovisualizacao))`);
  }
  return true;
}

function ensureSchema(db) {
  if (!schemaPromise) {
    schemaPromise = applySchema(db).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

// Visibilidade escolhida pelo organizador: publicar já, agendar (oculto até evpublicaem) ou ocultar.
// evpublicaem fica em UTC. Quando o evento é libertado, o momento fica guardado em evdatapublicacao.
async function releaseScheduledEvents(connection) {
  await connection.query("UPDATE evento SET evdatapublicacao=evpublicaem WHERE evestado='oculto' AND evpublicaem IS NOT NULL AND evpublicaem <= UTC_TIMESTAMP()");
  await connection.query("UPDATE evento SET evestado='publicado', evpublicaem=NULL WHERE evestado='oculto' AND evpublicaem IS NOT NULL AND evpublicaem <= UTC_TIMESTAMP()");
}

/* ============================================================
 * Registo de interações
 * ============================================================ */
// Regista uma interação (visualização, clique em bilhetes, favorito, partilha, calendário).
// Não conta: bots, eventos inexistentes ou não publicados, o próprio organizador e administradores,
// e repetições (mesma sessão e evento) dentro de uma janela curta.
async function recordInteraction(db, req, { type, eventId, user, sessionId, source }) {
  if (!INTERACTION_TYPES.includes(type) || !Number.isInteger(eventId) || eventId <= 0) return { counted: false, reason: 'invalido' };
  const userAgent = String(req.headers['user-agent'] || '');
  if (!userAgent || BOT_PATTERN.test(userAgent)) return { counted: false, reason: 'bot' };

  const [rows] = await db.query(`SELECT e.evestado, e.evvalor, e.evidorganizador, o.orgidutilizador, c.catnome, l.locdistrito
    FROM evento e
    JOIN organizador o ON o.idorganizador = e.evidorganizador
    JOIN categoria c ON c.idcategoria = e.evidcategoria
    JOIN localizacao l ON l.idlocalizacao = e.evidlocalizacao
    WHERE e.idevento = ? LIMIT 1`, [eventId]);
  const event = rows[0];
  if (!event || !['publicado', 'ativo'].includes(event.evestado)) return { counted: false, reason: 'evento' };
  if (user && (user.accountType === 'admin' || Number(event.orgidutilizador) === Number(user.id))) return { counted: false, reason: 'proprio' };

  const session = cleanSessionId(sessionId);
  if (session) {
    const windowSeconds = type === 'visualizacao' ? 1800 : 10;
    const since = lisbonTimestamp(new Date(Date.now() - windowSeconds * 1000));
    const [recent] = await db.query('SELECT 1 FROM eventointeracao WHERE evisessao=? AND eviidevento=? AND evitipo=? AND evidatahora >= ? LIMIT 1', [session, eventId, type, since]);
    if (recent[0]) return { counted: false, reason: 'repetido' };
  }

  await db.query(`INSERT INTO eventointeracao (evitipo, eviidevento, eviidutilizador, evisessao, evidatahora, evidispositivo, eviorigem, eviidorganizador, evicategoria, evidistrito, evipreco)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [type, eventId, user?.id || null, session, lisbonTimestamp(), detectDevice(userAgent), cleanSource(source), event.evidorganizador, event.catnome, event.locdistrito, Number(event.evvalor || 0)]);
  return { counted: true };
}

// Nunca deixa uma falha de registo estragar a ação do utilizador.
async function recordInteractionSafe(db, req, details) {
  try {
    return await recordInteraction(db, req, details);
  } catch (error) {
    console.error('Falha ao registar interação:', error.message);
    return { counted: false, reason: 'erro' };
  }
}

// Devolve { estado, publicaem } a partir de body.visibility ('publish' | 'schedule' | 'hide'), ou { error }.
// Um organizador só pode pôr um evento visível se este já foi aprovado por um administrador; caso contrário, "publicar"
// e "agendar" submetem o evento para aprovação (estado 'pendente'). O agendamento fica guardado e aplica-se após a aprovação.
function resolveVisibility(body, { isAdmin = false, approved = false } = {}) {
  const visibility = String(body.visibility || '').toLowerCase();
  const canGoLive = isAdmin || approved;
  if (visibility === 'publish') return canGoLive ? { estado: 'publicado', publicaem: null } : { estado: 'pendente', publicaem: null };
  if (visibility === 'hide') return { estado: 'oculto', publicaem: null };
  if (visibility === 'schedule') {
    const when = new Date(body.publishAt);
    if (Number.isNaN(when.getTime())) return { error: 'Escolhe a data e hora de publicação.' };
    if (when.getTime() <= Date.now() + 30000) return { error: 'A data de publicação tem de estar no futuro.' };
    return { estado: canGoLive ? 'oculto' : 'pendente', publicaem: when.toISOString().slice(0, 19).replace('T', ' ') };
  }
  return { estado: 'pendente', publicaem: null };
}

function statusLabel(status) {
  return ({ publicado: 'Publicado', ativo: 'Publicado', pendente: 'Pendente', oculto: 'Oculto', recusado: 'Recusado', inativo: 'Inativo' })[status] || 'Publicado';
}

function formatPrice(value) {
  const price = Number(value || 0);
  return { price, priceLabel: price === 0 ? 'Entrada Gratuita' : `€${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(price)}`, priceType: price === 0 ? 'Gratuito' : 'Pago' };
}

async function verifyPassword(password, storedPassword) {
  const stored = String(storedPassword || '');
  if (!stored) return { valid: false, legacy: false };

  if (/^\$2[aby]\$\d{2}\$/.test(stored)) {
    return { valid: await bcrypt.compare(password, stored), legacy: false };
  }

  // Seed data from older installations stored passwords as plain text.
  // Accept it once so existing accounts can be migrated without a database reset.
  const valid = password.length === stored.length
    && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(stored));
  return { valid, legacy: valid };
}

// Guarda as imagens de um evento (a primeira é a capa/miniatura, as restantes são galeria).
async function saveEventImages(connection, eventId, images) {
  let saved = 0;
  for (const image of images) {
    if (!/^(data:image\/|https?:\/\/|\/)/i.test(String(image))) continue;
    await connection.query('INSERT INTO imagem (imgurl,imgtipo,imgidevento) VALUES (?,?,?)', [image, saved === 0 ? 'capa' : 'galeria', eventId]);
    saved += 1;
  }
  return saved;
}

// Aplica o conteúdo (campos + imagens) de um evento. Usado nas edições diretas e na aprovação de pedidos de alteração.
async function applyEventContent(db, eventId, input, images) {
  const categoryId = await resolveCategoryId(db, input.category);
  const locationId = await resolveLocationId(db, input);
  const fields = ['evtitulo=?', 'evdatainicio=?', 'evdatafim=?', 'evvalor=?', 'evlinkbilhete=?', 'evrecorrente=?', 'evperiodicidade=?', 'evdiasrecorrencia=?', 'evidcategoria=?', 'evidlocalizacao=?'];
  const values = [input.title, input.startDate, input.endDate, input.price, input.ticketUrl, input.isRecurring ? 1 : 0, input.recurringPattern, input.recurringDays, categoryId, locationId];
  // A descrição só muda se for enviada (antes, editar um evento apagava-a).
  if (input.description !== undefined) { fields.push('evdescricao=?'); values.push(input.description); }
  await db.query(`UPDATE evento SET ${fields.join(',')} WHERE idevento=?`, [...values, eventId]);
  // Só substitui as imagens se foram enviadas novas; caso contrário mantêm-se as atuais.
  if (Array.isArray(images) && images.some((image) => /^(data:image\/|https?:\/\/|\/)/i.test(String(image)))) {
    await db.query('DELETE FROM imagem WHERE imgidevento=?', [eventId]);
    await saveEventImages(db, eventId, images);
  }
}

async function getChangeRequest(db, eventId) {
  const [rows] = await db.query('SELECT aldados, aldata, almotivo FROM eventoalteracao WHERE alidevento=?', [eventId]);
  if (!rows[0]) return null;
  let data = null;
  try { data = JSON.parse(rows[0].aldados); } catch { data = null; }
  return data ? { input: data.input, images: Array.isArray(data.images) ? data.images : [], requestedAt: rows[0].aldata, rejectReason: rows[0].almotivo || '' } : null;
}

// Elimina uma conta de utilizador da base de dados. Se for organizador, apaga primeiro os seus eventos
// (a chave estrangeira evento -> organizador é RESTRICT); o resto (favoritos, perfil de organizador,
// preferências, notificações) cai em cascata e as visualizações ficam anónimas.
async function deleteUserAccount(db, userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [organizers] = await connection.query('SELECT idorganizador FROM organizador WHERE orgidutilizador=?', [userId]);
    for (const organizer of organizers) {
      await connection.query('DELETE FROM eventoalteracao WHERE alidevento IN (SELECT idevento FROM evento WHERE evidorganizador=?)', [organizer.idorganizador]);
      await connection.query('DELETE FROM evento WHERE evidorganizador=?', [organizer.idorganizador]);
    }
    // O histórico de interações fica (é agregado e anónimo), mas deixa de apontar para a conta apagada.
    await connection.query('UPDATE eventointeracao SET eviidutilizador=NULL WHERE eviidutilizador=?', [userId]);
    await connection.query('DELETE FROM utilizador WHERE idutilizador=?', [userId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function eventRows(connection, status, ownEmail, eventId = null) {
  await releaseScheduledEvents(connection);
  const params = [];
  const conditions = [];
  if (status && status !== 'all') {
    if (status === 'published') {
      conditions.push("e.evestado IN ('publicado', 'ativo')");
    } else {
      conditions.push('e.evestado = ?');
      params.push(status === 'pending' ? 'pendente' : status === 'hidden' ? 'oculto' : status === 'rejected' ? 'recusado' : status);
    }
  }
  if (ownEmail) {
    conditions.push('o.orgemail = ?');
    params.push(ownEmail);
  }
  if (eventId) {
    conditions.push('e.idevento = ?');
    params.push(eventId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // A capa já não viaja em base64 na lista (pesava vários MB): devolve-se só o id da imagem e o browser
  // vai buscá-la a /api/event-cover, que é colocada em cache.
  const [rows] = await connection.query(`
    SELECT e.*, c.catnome, l.locmorada, l.loccidade, l.locdistrito, l.loclatitude, l.loclongitude, o.orgnome, o.orgemail,
      (SELECT COUNT(*) FROM eventointeracao v WHERE v.eviidevento=e.idevento AND v.evitipo='visualizacao' AND v.evisimulado=0) AS totalVisualizacoes,
      (SELECT COUNT(*) FROM eventoalteracao al WHERE al.alidevento=e.idevento AND al.almotivo IS NULL) AS alteracaoPendente,
      (SELECT al.almotivo FROM eventoalteracao al WHERE al.alidevento=e.idevento LIMIT 1) AS alteracaoMotivo,
      (SELECT COUNT(*) FROM eventoalteracao al WHERE al.alidevento=e.idevento) AS alteracaoExiste,
      (SELECT img.idimagem FROM imagem img WHERE img.imgidevento=e.idevento AND img.imgtipo='capa' ORDER BY img.idimagem LIMIT 1) AS capa_id
    FROM evento e JOIN categoria c ON c.idcategoria=e.evidcategoria
    JOIN localizacao l ON l.idlocalizacao=e.evidlocalizacao JOIN organizador o ON o.idorganizador=e.evidorganizador
    ${where} ORDER BY e.evdatainicio DESC, e.idevento DESC`, params);
  return rows.map((row) => ({
    id: Number(row.idevento), title: row.evtitulo, description: row.evdescricao || '',
    dateLabel: new Date(row.evdatainicio).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
    dateBucket: 'Publicado', eventDate: row.evdatainicio, startDate: row.evdatainicio, endDate: row.evdatafim || '',
    location: [row.locmorada, row.loccidade].filter(Boolean).join(', '),
    street: row.locmorada || '', latitude: row.loclatitude === null ? null : Number(row.loclatitude), longitude: row.loclongitude === null ? null : Number(row.loclongitude),
    city: row.loccidade, district: row.locdistrito, category: row.catnome, ...formatPrice(row.evvalor),
    views: Number(row.totalVisualizacoes || 0), ticketUrl: row.evlinkbilhete || '',
    hasTicket: Number(row.evvalor || 0) > 0 && Boolean(cleanHttpUrl(row.evlinkbilhete).url),
    publishedAt: row.evdatapublicacao || '', status: row.evestado,
    statusLabel: row.evestado === 'oculto' && row.evpublicaem ? 'Agendado' : statusLabel(row.evestado),
    scheduledFor: ['oculto', 'pendente'].includes(row.evestado) && row.evpublicaem ? new Date(`${String(row.evpublicaem instanceof Date ? row.evpublicaem.toISOString() : row.evpublicaem).replace(' ', 'T').replace(/Z$/, '')}Z`).toISOString() : '',
    isRecurring: Boolean(row.evrecorrente), recurringPattern: row.evperiodicidade || '',
    recurringDays: row.evdiasrecorrencia || '', submittedAt: row.evdatasubmissao || '', approvedAt: row.evdataaprovacao || '',
    rejectReason: row.evmotivorecusa || '',
    hasPendingChange: Number(row.alteracaoPendente || 0) > 0,
    changeRejectReason: Number(row.alteracaoExiste || 0) > 0 && Number(row.alteracaoPendente || 0) === 0 ? (row.alteracaoMotivo || '') : '',
    organizer: row.orgnome, organizerEmail: row.orgemail,
    image: row.capa_id ? `/api/event-cover?id=${Number(row.idevento)}&v=${Number(row.capa_id)}` : ''
  }));
}

/* ============================================================
 * Analytics (dashboard de administrador e de organizador)
 * ============================================================
 * Todas as datas são "datas de Lisboa" (ver lisbonTimestamp). Os períodos são sempre alinhados aos limites do
 * agrupamento escolhido (semana a começar à segunda, mês, trimestre, semestre, ano), para que cada barra
 * represente um período completo e a comparação com o período anterior seja justa.
 * Definições: CTR = cliques em "Ver Bilhetes" / visualizações de eventos pagos. Eventos gratuitos não têm
 * bilheteira, por isso ficam fora do CTR. Não existe conversão em compra (a compra acontece fora da plataforma). */
const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'semester', 'year'];
const DEFAULT_BUCKETS = { day: 30, week: 12, month: 12, quarter: 8, semester: 6, year: 5 };
const MAX_BUCKETS = 400;
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ymd = (date) => date.toISOString().slice(0, 10);
const parseYmd = (text) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return ymd(date) === text ? date : null;
};
const shiftDays = (date, days) => new Date(date.getTime() + days * 86400000);

function shiftMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function bucketStart(date, granularity) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (granularity === 'day') return date;
  if (granularity === 'week') return shiftDays(date, -((date.getUTCDay() + 6) % 7));
  if (granularity === 'month') return new Date(Date.UTC(year, month, 1));
  if (granularity === 'quarter') return new Date(Date.UTC(year, month - (month % 3), 1));
  if (granularity === 'semester') return new Date(Date.UTC(year, month < 6 ? 0 : 6, 1));
  return new Date(Date.UTC(year, 0, 1));
}

function addBuckets(start, granularity, count) {
  if (granularity === 'day') return shiftDays(start, count);
  if (granularity === 'week') return shiftDays(start, 7 * count);
  const months = { month: 1, quarter: 3, semester: 6, year: 12 }[granularity];
  return shiftMonths(start, months * count);
}

function bucketKey(start, granularity) {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  if (granularity === 'day' || granularity === 'week') return ymd(start);
  if (granularity === 'month') return `${year}-${String(month + 1).padStart(2, '0')}`;
  if (granularity === 'quarter') return `${year}-T${Math.floor(month / 3) + 1}`;
  if (granularity === 'semester') return `${year}-S${month < 6 ? 1 : 2}`;
  return String(year);
}

function bucketLabel(start, granularity) {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const dd = String(start.getUTCDate()).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  if (granularity === 'day') return `${dd}/${mm}`;
  if (granularity === 'week') return `Sem. ${dd}/${mm}`;
  if (granularity === 'month') return `${SHORT_MONTHS[month]} ${year}`;
  if (granularity === 'quarter') return `T${Math.floor(month / 3) + 1} ${year}`;
  if (granularity === 'semester') return `S${month < 6 ? 1 : 2} ${year}`;
  return String(year);
}

// Expressão SQL que produz a mesma chave que bucketKey().
function bucketSql(granularity) {
  switch (granularity) {
    case 'day': return "DATE_FORMAT(evidatahora, '%Y-%m-%d')";
    case 'week': return "DATE_FORMAT(DATE_SUB(DATE(evidatahora), INTERVAL WEEKDAY(evidatahora) DAY), '%Y-%m-%d')";
    case 'month': return "DATE_FORMAT(evidatahora, '%Y-%m')";
    case 'quarter': return "CONCAT(YEAR(evidatahora), '-T', QUARTER(evidatahora))";
    case 'semester': return "CONCAT(YEAR(evidatahora), '-S', IF(MONTH(evidatahora) <= 6, 1, 2))";
    default: return 'CAST(YEAR(evidatahora) AS CHAR)';
  }
}

const AGGREGATES = `
  SUM(evitipo = 'visualizacao') AS views,
  SUM(evitipo = 'visualizacao' AND evipreco > 0) AS paidViews,
  SUM(evitipo = 'clique_bilhete') AS clicks,
  SUM(evitipo = 'favorito_add') AS favAdd,
  SUM(evitipo = 'favorito_remove') AS favRemove,
  SUM(evitipo = 'partilha') AS shares,
  SUM(evitipo = 'calendario') AS calendar`;

function metricsFrom(row = {}) {
  const views = Number(row.views || 0);
  const paidViews = Number(row.paidViews || 0);
  const clicks = Number(row.clicks || 0);
  const favoritesAdded = Number(row.favAdd || 0);
  const favoritesRemoved = Number(row.favRemove || 0);
  return {
    views, paidViews, clicks,
    ctr: paidViews > 0 ? clicks / paidViews : null,
    favoritesAdded, favoritesRemoved, favoritesNet: favoritesAdded - favoritesRemoved,
    shares: Number(row.shares || 0), calendar: Number(row.calendar || 0)
  };
}

function analyticsRange(query, now) {
  const granularity = GRANULARITIES.includes(query.granularity) ? query.granularity : 'month';
  const today = parseYmd(lisbonTimestamp(now).slice(0, 10));
  const toInput = query.to ? parseYmd(query.to) : today;
  if (!toInput) return { error: 'Data final inválida (usa AAAA-MM-DD).' };
  let fromInput;
  if (query.from) {
    fromInput = parseYmd(query.from);
    if (!fromInput) return { error: 'Data inicial inválida (usa AAAA-MM-DD).' };
  } else {
    fromInput = addBuckets(bucketStart(toInput, granularity), granularity, -(DEFAULT_BUCKETS[granularity] - 1));
  }
  if (fromInput > toInput) return { error: 'A data inicial não pode ser posterior à data final.' };

  const firstStart = bucketStart(fromInput, granularity);
  const lastStart = bucketStart(toInput, granularity);
  const buckets = [];
  for (let start = firstStart; start <= lastStart && buckets.length <= MAX_BUCKETS; start = addBuckets(start, granularity, 1)) {
    buckets.push(start);
  }
  if (buckets.length > MAX_BUCKETS) return { error: 'Intervalo demasiado grande para este agrupamento. Escolhe um período mais curto ou um agrupamento maior.' };

  const count = buckets.length;
  const from = firstStart;
  const to = shiftDays(addBuckets(lastStart, granularity, 1), -1);
  const previousFrom = addBuckets(firstStart, granularity, -count);
  const previousTo = shiftDays(firstStart, -1);
  return { granularity, buckets, count, from, to, previousFrom, previousTo, incomplete: to > today };
}

async function handleAnalytics(db, req, res, actor) {
  const isAdmin = actor.accountType === 'admin';
  const range = analyticsRange({
    granularity: queryParam(req, 'granularity'), from: queryParam(req, 'from'), to: queryParam(req, 'to')
  }, new Date());
  if (range.error) return json(res, 422, { ok: false, message: range.error });

  // Âmbito: o organizador só vê as interações dos seus próprios eventos; o administrador vê tudo e pode filtrar.
  const scope = [];
  const scopeParams = [];
  let organizerId = null;
  if (!isAdmin) {
    const [orgs] = await db.query('SELECT idorganizador FROM organizador WHERE orgidutilizador=? LIMIT 1', [actor.id]);
    if (!orgs[0]) return json(res, 404, { ok: false, message: 'Perfil de organizador não encontrado.' });
    organizerId = Number(orgs[0].idorganizador);
    scope.push('eviidorganizador = ?'); scopeParams.push(organizerId);
  } else if (queryParam(req, 'organizerId')) {
    organizerId = Number(queryParam(req, 'organizerId'));
    if (!Number.isInteger(organizerId) || organizerId <= 0) return json(res, 422, { ok: false, message: 'Organizador inválido.' });
    scope.push('eviidorganizador = ?'); scopeParams.push(organizerId);
  }
  const eventIdParam = queryParam(req, 'eventId');
  let eventId = null;
  if (eventIdParam) {
    eventId = Number(eventIdParam);
    if (!Number.isInteger(eventId) || eventId <= 0) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    scope.push('eviidevento = ?'); scopeParams.push(eventId);
  }
  if (isAdmin) {
    const category = queryParam(req, 'category');
    if (category) {
      const canonical = matchCanonical(CATEGORIES, category);
      if (!canonical) return json(res, 422, { ok: false, message: 'Categoria inválida.' });
      scope.push('evicategoria = ?'); scopeParams.push(canonical);
    }
    const district = queryParam(req, 'district');
    if (district) {
      const canonical = matchCanonical(DISTRICTS, district);
      if (!canonical) return json(res, 422, { ok: false, message: 'Distrito inválido.' });
      scope.push('evidistrito = ?'); scopeParams.push(canonical);
    }
  }
  // Dados simulados (futuros dados de teste) só são visíveis para o administrador, e só a pedido.
  const dataMode = isAdmin && ['todos', 'simulado'].includes(queryParam(req, 'data')) ? queryParam(req, 'data') : 'real';
  const dataFilter = dataMode === 'real' ? 'evisimulado = 0' : dataMode === 'simulado' ? 'evisimulado = 1' : '1 = 1';

  const periodWhere = (from, to) => ({
    sql: ['evidatahora >= ?', 'evidatahora < ?', dataFilter, ...scope].join(' AND '),
    params: [`${ymd(from)} 00:00:00`, `${ymd(shiftDays(to, 1))} 00:00:00`, ...scopeParams]
  });
  const current = periodWhere(range.from, range.to);
  const previous = periodWhere(range.previousFrom, range.previousTo);

  const totalsQuery = async (where) => {
    const [rows] = await db.query(`SELECT ${AGGREGATES},
      COUNT(DISTINCT CASE WHEN evitipo = 'visualizacao' THEN evisessao END) AS sessionsViewed,
      COUNT(DISTINCT CASE WHEN evitipo = 'clique_bilhete' THEN evisessao END) AS sessionsClicked
      FROM eventointeracao WHERE ${where.sql}`, where.params);
    return { ...metricsFrom(rows[0]), sessionsViewed: Number(rows[0]?.sessionsViewed || 0), sessionsClicked: Number(rows[0]?.sessionsClicked || 0) };
  };

  const groupBy = async (column, limit = 20) => {
    const [rows] = await db.query(`SELECT ${column} AS label, ${AGGREGATES} FROM eventointeracao
      WHERE ${current.sql} AND ${column} IS NOT NULL GROUP BY ${column} ORDER BY views DESC, clicks DESC LIMIT ${limit}`, current.params);
    return rows.map((row) => ({ label: row.label, ...metricsFrom(row) }));
  };

  const [totals, previousTotals, seriesRows, topRows, byCategory, byDistrict, byDevice, bySource] = await Promise.all([
    totalsQuery(current),
    totalsQuery(previous),
    db.query(`SELECT ${bucketSql(range.granularity)} AS bucket, ${AGGREGATES} FROM eventointeracao WHERE ${current.sql} GROUP BY bucket`, current.params).then(([rows]) => rows),
    db.query(`SELECT i.eviidevento AS id, MAX(e.evtitulo) AS title, MAX(i.evipreco) AS price, ${AGGREGATES}
      FROM eventointeracao i LEFT JOIN evento e ON e.idevento = i.eviidevento
      WHERE ${current.sql.replace(/\b(evidatahora|evisimulado|eviidorganizador|eviidevento|evicategoria|evidistrito)\b/g, 'i.$1')}
      GROUP BY i.eviidevento ORDER BY views DESC, clicks DESC LIMIT 10`, current.params).then(([rows]) => rows),
    groupBy('evicategoria'), groupBy('evidistrito'), groupBy('evidispositivo'), groupBy('eviorigem')
  ]);

  const byBucket = new Map(seriesRows.map((row) => [String(row.bucket), metricsFrom(row)]));
  const series = range.buckets.map((start) => {
    const key = bucketKey(start, range.granularity);
    return { key, label: bucketLabel(start, range.granularity), start: ymd(start), ...(byBucket.get(key) || metricsFrom()) };
  });

  const topEvents = topRows.map((row) => ({
    id: Number(row.id), title: row.title || '(evento eliminado)', paid: Number(row.price || 0) > 0, ...metricsFrom(row)
  }));

  // Estado atual do catálogo (não depende do período).
  const catalogParams = [];
  let catalogWhere = '';
  if (organizerId) { catalogWhere = 'WHERE evidorganizador = ?'; catalogParams.push(organizerId); }
  const [catalogRows] = await db.query(`SELECT
      COUNT(*) AS total,
      SUM(evestado IN ('publicado','ativo')) AS published,
      SUM(evestado IN ('publicado','ativo') AND evvalor = 0) AS free,
      SUM(evestado IN ('publicado','ativo') AND evvalor > 0) AS paid,
      SUM(evestado IN ('publicado','ativo') AND evvalor > 0 AND evlinkbilhete IS NOT NULL AND evlinkbilhete <> '') AS paidWithLink
    FROM evento ${catalogWhere}`, catalogParams);
  const catalog = {
    total: Number(catalogRows[0]?.total || 0), published: Number(catalogRows[0]?.published || 0), free: Number(catalogRows[0]?.free || 0),
    paid: Number(catalogRows[0]?.paid || 0), paidWithLink: Number(catalogRows[0]?.paidWithLink || 0)
  };

  const payload = {
    ok: true,
    scope: isAdmin ? 'admin' : 'organizador',
    dataMode,
    range: {
      granularity: range.granularity, from: ymd(range.from), to: ymd(range.to), buckets: range.count,
      previousFrom: ymd(range.previousFrom), previousTo: ymd(range.previousTo), incomplete: range.incomplete
    },
    filters: { organizerId, eventId },
    totals, previousTotals, series, topEvents,
    breakdown: { category: byCategory, district: byDistrict, device: byDevice, source: bySource },
    catalog,
    definitions: {
      ctr: 'Cliques em "Ver Bilhetes" a dividir pelas visualizações de eventos pagos. Eventos gratuitos não têm bilheteira e ficam fora do cálculo.',
      conversion: 'A compra acontece fora da plataforma, por isso a conversão em compra não é medida.'
    }
  };

  if (isAdmin) {
    const [byOrganizer] = await db.query(`SELECT i.eviidorganizador AS id, MAX(o.orgnome) AS name, ${AGGREGATES}
      FROM eventointeracao i LEFT JOIN organizador o ON o.idorganizador = i.eviidorganizador
      WHERE ${current.sql.replace(/\b(evidatahora|evisimulado|eviidorganizador|eviidevento|evicategoria|evidistrito)\b/g, 'i.$1')}
      AND i.eviidorganizador IS NOT NULL GROUP BY i.eviidorganizador ORDER BY views DESC LIMIT 15`, current.params);
    payload.byOrganizer = byOrganizer.map((row) => ({ id: Number(row.id), name: row.name || '(organizador eliminado)', ...metricsFrom(row) }));

    // Perfil das entidades organizadoras: apoia a decisão sobre uma bilheteira integrada (têm bilheteira? teriam interesse?).
    const [surveyRows] = await db.query("SELECT orgtipo, orgtembilheteira, orginteressebilheteira, COUNT(*) AS n FROM organizador WHERE orgestado = 'aprovado' GROUP BY orgtipo, orgtembilheteira, orginteressebilheteira");
    const survey = { organizers: 0, type: {}, hasTicketing: {}, interest: {} };
    for (const row of surveyRows) {
      const n = Number(row.n);
      survey.organizers += n;
      const add = (bucket, key) => { bucket[key || 'nr'] = (bucket[key || 'nr'] || 0) + n; };
      add(survey.type, row.orgtipo); add(survey.hasTicketing, row.orgtembilheteira); add(survey.interest, row.orginteressebilheteira);
    }
    payload.organizerSurvey = survey;
  } else {
    const [mine] = await db.query("SELECT idevento AS id, evtitulo AS title, evestado AS status, evvalor AS price FROM evento WHERE evidorganizador = ? ORDER BY evdatainicio DESC, idevento DESC", [organizerId]);
    payload.events = mine.map((row) => ({ id: Number(row.id), title: row.title, status: row.status, paid: Number(row.price || 0) > 0 }));

    // Comparação com a plataforma (sem este organizador). Só é devolvida com amostra suficiente (k-anonimato),
    // para não permitir identificar outro organizador.
    const [benchmarkRows] = await db.query(`SELECT COUNT(DISTINCT eviidevento) AS events, ${AGGREGATES}
      FROM eventointeracao WHERE evidatahora >= ? AND evidatahora < ? AND evisimulado = 0 AND eviidorganizador <> ?`,
    [`${ymd(range.from)} 00:00:00`, `${ymd(shiftDays(range.to, 1))} 00:00:00`, organizerId]);
    const others = metricsFrom(benchmarkRows[0]);
    const otherEvents = Number(benchmarkRows[0]?.events || 0);
    const eligible = otherEvents >= 3 && others.paidViews >= 30;
    payload.benchmark = eligible
      ? { eligible: true, platformCtr: others.ctr, platformViewsPerEvent: others.views / otherEvents }
      : { eligible: false };
  }
  return json(res, 200, payload);
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const queryRoute = Array.isArray(req.query?.route)
    ? req.query.route.join('/')
    : String(req.query?.route || '');
  const requestPath = String(req.url || '').split('?')[0];
  const pathRoute = requestPath.replace(/^\/+/, '').replace(/^api\/+/i, '');
  const route = (pathRoute || queryRoute).replace(/^\/+|\/+$/g, '');
  const db = getPool();
  const body = parseBody(req);

  // A migração do esquema (ver ensureSchema) corre uma vez por instância. Sem permissões de ALTER, responde 503 com instruções.
  if (!['me', 'logout', 'login', 'register'].includes(route)) {
    try {
      await ensureSchema(db);
    } catch (error) {
      console.error('Falha ao aplicar a migração do esquema:', error.message);
      return json(res, 503, { ok: false, message: 'A base de dados precisa da migração bdd/Migration_2026_11_04_analytics.sql. Executa-a (por exemplo no TiDB Cloud) e tenta novamente.' });
    }
  }

  if (route === 'me') {
    const user = requireUser(req, res);
    if (!user) return;
    if (req.method === 'PATCH') {
      const location = String(body.location || '').trim();
      await db.query('UPDATE utilizador SET utlocalizacao=? WHERE idutilizador=?', [location || null, user.id]);
      const updated = { ...user, location };
      setSession(res, updated);
      return json(res, 200, { ok: true, user: updated });
    }
    return json(res, 200, { ok: true, user });
  }
  if (route === 'logout') { clearSession(res); return json(res, 200, { ok: true }); }
  if (route === 'login' && req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const [rows] = await db.query(`SELECT u.*, t.tutipo, o.orgestado FROM utilizador u JOIN tipoutilizador t ON t.idtipoutilizador=u.uttipo LEFT JOIN organizador o ON o.orgidutilizador=u.idutilizador WHERE LOWER(u.utemail)=? LIMIT 1`, [email]);
    const row = rows[0];
    if (!row) return json(res, 401, { ok: false, message: 'Credenciais inválidas.' });
    const password = String(body.password || '');
    const passwordCheck = await verifyPassword(password, row.utpasswordhash);
    if (!passwordCheck.valid) return json(res, 401, { ok: false, message: 'Credenciais inválidas.' });
    if (passwordCheck.legacy) {
      const migratedPassword = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
      await db.query('UPDATE utilizador SET utpasswordhash=? WHERE idutilizador=?', [migratedPassword, row.idutilizador]);
    }
    if (!isActive(row.utestado)) return json(res, 403, { ok: false, message: 'Conta inativa. Contacta o administrador para reativação.' });
    if (row.tutipo === 'organizador' && row.orgestado !== 'aprovado') return json(res, 403, { ok: false, message: row.orgestado === 'pendente' ? 'Conta de organizador pendente de aprovação.' : 'Conta de organizador inativa ou suspensa.' });
    const user = { id: Number(row.idutilizador), email: row.utemail, name: row.utnome, roleLabel: roleLabel(row.tutipo), accountType: accountType(row.tutipo), location: row.utlocalizacao || '' };
    setSession(res, user); return json(res, 200, { ok: true, user });
  }
  if (route === 'register' && req.method === 'POST') {
    const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
    if (!name || !email || !password || password !== body.confirmPassword) return json(res, 422, { ok: false, message: 'Nome, email e palavras-passe são obrigatórios e devem coincidir.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) return json(res, 422, { ok: false, message: 'Email inválido ou palavra-passe demasiado curta.' });
    const type = body.accountType === 'organizador' ? 'organizador' : 'registado';
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.query('SELECT idutilizador FROM utilizador WHERE LOWER(utemail)=? LIMIT 1', [email]);
      if (existing[0]) { await connection.rollback(); return json(res, 409, { ok: false, message: 'Já existe uma conta com este email.' }); }
      const [types] = await connection.query('SELECT idtipoutilizador FROM tipoutilizador WHERE tutipo=? LIMIT 1', [type]);
      let typeId = types[0]?.idtipoutilizador;
      if (!typeId) { const [insertType] = await connection.query('INSERT INTO tipoutilizador (tutipo) VALUES (?)', [type]); typeId = insertType.insertId; }
      const [insert] = await connection.query('INSERT INTO utilizador (utnome,utemail,utpasswordhash,utinicio,uttipo,utestado) VALUES (?,?,?,CURDATE(),?,"ativo")', [name, email, await bcrypt.hash(password, PASSWORD_HASH_ROUNDS), typeId]);
      if (type === 'organizador') await connection.query('INSERT INTO organizador (orgnome,orgemail,orginicio,orgestado,orgidutilizador) VALUES (?,?,CURDATE(),"pendente",?)', [name, email, insert.insertId]);
      await connection.commit();
      if (type === 'organizador') return json(res, 201, { ok: true, pending: true, message: 'Conta de organizador criada e pendente de aprovação.' });
      const user = { id: Number(insert.insertId), email, name, roleLabel: roleLabel(type), accountType: accountType(type), location: '' };
      setSession(res, user); return json(res, 201, { ok: true, message: 'Conta criada com sucesso.', user });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  if (route === 'events') {
    const user = currentUser(req);
    if (req.method === 'GET') {
      const requested = String(req.query.status || 'published').toLowerCase();
      const own = req.query.scope === 'own' && user?.accountType === 'organizador' ? user.email : null;
      const status = requested === 'all' && user?.accountType !== 'admin' && !own ? 'published' : requested;
      return json(res, 200, { ok: true, events: await eventRows(db, status, own) });
    }
    if (req.method === 'POST') {
      const actor = requireUser(req, res, ['organizador', 'admin']); if (!actor) return;
      const input = validateEventInput(body);
      if (input.error) return json(res, 422, { ok: false, message: input.error });
      const [orgs] = await db.query('SELECT idorganizador FROM organizador WHERE orgidutilizador=? LIMIT 1', [actor.id]);
      if (!orgs[0]) return json(res, 422, { ok: false, message: 'O utilizador autenticado não tem perfil de organizador.' });
      const isAdminActor = actor.accountType === 'admin';
      const visibility = resolveVisibility(body, { isAdmin: isAdminActor });
      if (visibility.error) return json(res, 422, { ok: false, message: visibility.error });
      const categoryId = await resolveCategoryId(db, input.category);
      const locationId = await resolveLocationId(db, input);
      const publishedNow = visibility.estado === 'publicado' ? utcTimestamp() : null;
      const approvedNow = isAdminActor && ['publicado', 'oculto'].includes(visibility.estado) ? utcTimestamp() : null;
      const [result] = await db.query('INSERT INTO evento (evtitulo,evdescricao,evdatainicio,evdatafim,evvalor,evlinkbilhete,evestado,evpublicaem,evdatapublicacao,evdataaprovacao,evrecorrente,evperiodicidade,evdiasrecorrencia,evidcategoria,evidlocalizacao,evidorganizador) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [input.title, input.description ?? null, input.startDate, input.endDate, input.price, input.ticketUrl, visibility.estado, visibility.publicaem, publishedNow, approvedNow, input.isRecurring ? 1 : 0, input.recurringPattern, input.recurringDays, categoryId, locationId, orgs[0].idorganizador]);
      if (Array.isArray(body.images)) {
        await saveEventImages(db, result.insertId, body.images);
      }
      return json(res, 201, {
        ok: true,
        eventId: result.insertId,
        status: visibility.estado,
        message: visibility.estado === 'pendente'
          ? 'Evento enviado para aprovação. A aprovação pode demorar de 1 a 3 dias.'
          : 'Evento criado com sucesso.'
      });
    }
    if (req.method === 'PATCH') {
      const actor = requireUser(req, res, ['organizador', 'admin']); if (!actor) return;
      const eventId = Number(body.eventId), action = String(body.action || '').toLowerCase();
      const [rows] = await db.query('SELECT e.idevento,e.evdataaprovacao,o.orgemail FROM evento e JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE e.idevento=?', [eventId]);
      if (!rows[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
      if (actor.accountType !== 'admin' && actor.email.toLowerCase() !== rows[0].orgemail.toLowerCase()) return json(res, 403, { ok: false, message: 'Sem permissão.' });
      const isAdminActor = actor.accountType === 'admin';
      const approved = Boolean(rows[0].evdataaprovacao);
      // "Mostrar" por parte do organizador só é imediato se o evento já foi aprovado; senão volta à fila de aprovação.
      const simpleStates = { inactivate: 'inativo', hide: 'oculto', show: (isAdminActor || approved) ? 'publicado' : 'pendente' };
      if (action === 'delete') { await db.query('DELETE FROM eventoalteracao WHERE alidevento=?', [eventId]); await db.query('DELETE FROM evento WHERE idevento=?', [eventId]); }
      else if (action === 'update') {
        const input = validateEventInput(body);
        if (input.error) return json(res, 422, { ok: false, message: input.error });
        const visibility = resolveVisibility(body, { isAdmin: isAdminActor, approved });
        if (visibility.error) return json(res, 422, { ok: false, message: visibility.error });
        const stateFields = ['evestado=?', 'evpublicaem=?'];
        const stateValues = [visibility.estado, visibility.publicaem];
        if (visibility.estado === 'pendente') stateFields.push('evmotivorecusa=NULL');
        if (approved && !isAdminActor) {
          // Evento já aprovado: o estado (publicar/agendar/ocultar) aplica-se já, mas as alterações ao conteúdo
          // só entram em vigor depois de um administrador as aprovar. Até lá, a versão atual mantém-se.
          await db.query(`UPDATE evento SET ${stateFields.join(',')} WHERE idevento=?`, [...stateValues, eventId]);
          const images = Array.isArray(body.images) ? body.images.filter((image) => /^(data:image\/|https?:\/\/|\/)/i.test(String(image))) : [];
          await db.query('REPLACE INTO eventoalteracao (alidevento, aldados, aldata, almotivo) VALUES (?,?,?,NULL)', [eventId, JSON.stringify({ input, images }), utcTimestamp()]);
        } else {
          await db.query(`UPDATE evento SET ${stateFields.join(',')} WHERE idevento=?`, [...stateValues, eventId]);
          await applyEventContent(db, eventId, input, body.images);
          if (isAdminActor) await db.query('DELETE FROM eventoalteracao WHERE alidevento=?', [eventId]);
        }
        if (visibility.estado === 'publicado') await db.query('UPDATE evento SET evdatapublicacao=COALESCE(evdatapublicacao, ?) WHERE idevento=?', [utcTimestamp(), eventId]);
        if (isAdminActor && ['publicado', 'oculto'].includes(visibility.estado)) await db.query('UPDATE evento SET evdataaprovacao=COALESCE(evdataaprovacao, ?) WHERE idevento=?', [utcTimestamp(), eventId]);
      } else if (action === 'cancel_change') {
        await db.query('DELETE FROM eventoalteracao WHERE alidevento=?', [eventId]);
      } else if (action === 'cancel_request') {
        const [cur] = await db.query('SELECT evestado FROM evento WHERE idevento=?', [eventId]);
        if (cur[0]?.evestado !== 'pendente') return json(res, 409, { ok: false, message: 'Este evento já não está à espera de aprovação.' });
        await db.query("UPDATE evento SET evestado='oculto', evpublicaem=NULL WHERE idevento=?", [eventId]);
        return json(res, 200, { ok: true, status: 'oculto', message: 'Pedido de aprovação cancelado. O evento ficou oculto e podes voltar a submetê-lo quando quiseres.' });
      } else if (simpleStates[action]) {
        await db.query('UPDATE evento SET evestado=?, evpublicaem=NULL WHERE idevento=?', [simpleStates[action], eventId]);
        if (isAdminActor && simpleStates[action] === 'publicado') await db.query('UPDATE evento SET evdataaprovacao=COALESCE(evdataaprovacao, ?) WHERE idevento=?', [utcTimestamp(), eventId]);
        if (simpleStates[action] === 'publicado') await db.query('UPDATE evento SET evdatapublicacao=COALESCE(evdatapublicacao, ?) WHERE idevento=?', [utcTimestamp(), eventId]);
      } else {
        return json(res, 422, { ok: false, message: 'Ação inválida.' });
      }
      const [after] = await db.query('SELECT evestado FROM evento WHERE idevento=?', [eventId]);
      return json(res, 200, { ok: true, status: after[0]?.evestado ?? null, message: action === 'update' && approved && !isAdminActor
        ? 'Pedido de alteração enviado. A versão atual mantém-se até um administrador aprovar as mudanças (pode demorar de 1 a 3 dias).'
        : after[0]?.evestado === 'pendente' ? 'Evento enviado para aprovação. A aprovação pode demorar de 1 a 3 dias.' : undefined, changeRequested: action === 'update' && approved && !isAdminActor });
    }
  }
  if (route === 'event-images' && req.method === 'GET') {
    const eventId = Number(req.query?.eventId || new URL(req.url, 'http://localhost').searchParams.get('eventId'));
    if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const user = currentUser(req);
    await releaseScheduledEvents(db);
    const [events] = await db.query('SELECT e.evestado, o.orgemail FROM evento e JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE e.idevento=?', [eventId]);
    if (!events[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
    const isPublic = ['publicado', 'ativo'].includes(events[0].evestado);
    const isOwner = user && (user.accountType === 'admin' || String(user.email || '').toLowerCase() === String(events[0].orgemail || '').toLowerCase());
    if (!isPublic && !isOwner) return json(res, 403, { ok: false, message: 'Sem permissão.' });
    const [rows] = await db.query("SELECT imgurl FROM imagem WHERE imgidevento=? ORDER BY (imgtipo='capa') DESC, idimagem ASC", [eventId]);
    return json(res, 200, { ok: true, images: rows.map((row) => row.imgurl) });
  }
  // Capa do evento servida como imagem (e não em base64 dentro da lista de eventos). O parâmetro v é o id
  // da imagem: muda quando a capa muda, por isso a resposta pode ficar em cache "para sempre".
  if (route === 'event-cover' && req.method === 'GET') {
    const eventId = Number(queryParam(req, 'id'));
    if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const user = currentUser(req);
    const [covers] = await db.query("SELECT img.imgurl, e.evestado, o.orgemail FROM imagem img JOIN evento e ON e.idevento=img.imgidevento JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE img.imgidevento=? AND img.imgtipo='capa' ORDER BY img.idimagem LIMIT 1", [eventId]);
    const cover = covers[0];
    if (!cover) return json(res, 404, { ok: false, message: 'Sem imagem.' });
    const isPublic = ['publicado', 'ativo'].includes(cover.evestado);
    const isOwner = user && (user.accountType === 'admin' || String(user.email || '').toLowerCase() === String(cover.orgemail || '').toLowerCase());
    if (!isPublic && !isOwner) return json(res, 403, { ok: false, message: 'Sem permissão.' });
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'private, no-store');
    const source = String(cover.imgurl || '');
    if (/^(https?:\/\/|\/(?!\/))/i.test(source)) {
      res.setHeader('Location', source);
      res.statusCode = 302;
      return res.end();
    }
    const dataUrl = source.match(/^data:(image\/[a-z0-9.+-]+)((?:;[^,;]*)*),([\s\S]*)$/i);
    if (!dataUrl) return json(res, 404, { ok: false, message: 'Imagem inválida.' });
    const buffer = /;base64/i.test(dataUrl[2]) ? Buffer.from(dataUrl[3], 'base64') : Buffer.from(decodeURIComponent(dataUrl[3]), 'utf8');
    res.setHeader('Content-Type', dataUrl[1].toLowerCase());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.statusCode = 200;
    return res.end(buffer);
  }
  if (route === 'favorites') {
    const user = requireUser(req, res); if (!user) return;
    if (user.accountType !== 'lambda') {
      if (req.method === 'GET') return json(res, 200, { ok: true, favorites: [] });
      return json(res, 403, { ok: false, message: 'Este tipo de conta não tem eventos favoritos.' });
    }
    if (req.method === 'GET') { const [rows] = await db.query('SELECT favidevento FROM favorito WHERE favidutilizador=? ORDER BY idfavorito DESC', [user.id]); return json(res, 200, { ok: true, favorites: rows.map((row) => Number(row.favidevento)) }); }
    const eventId = Number(body.eventId); if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const interaction = (type) => recordInteractionSafe(db, req, { type, eventId, user, sessionId: body.sessionId, source: body.source });
    if (req.method === 'DELETE') {
      const [removed] = await db.query('DELETE FROM favorito WHERE favidutilizador=? AND favidevento=?', [user.id, eventId]);
      if (removed.affectedRows) await interaction('favorito_remove');
      return json(res, 200, { ok: true });
    }
    const [targets] = await db.query('SELECT idevento FROM evento WHERE idevento=?', [eventId]);
    if (!targets[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
    const [found] = await db.query('SELECT idfavorito FROM favorito WHERE favidutilizador=? AND favidevento=?', [user.id, eventId]);
    if (found[0]) { await db.query('DELETE FROM favorito WHERE idfavorito=?', [found[0].idfavorito]); await interaction('favorito_remove'); return json(res, 200, { ok: true, favorite: false }); }
    await db.query('INSERT INTO favorito (favidutilizador,favidevento,favdata) VALUES (?,?,?)', [user.id, eventId, lisbonTimestamp()]);
    await interaction('favorito_add');
    return json(res, 201, { ok: true, favorite: true });
  }
  // Registo de interações enviado pelo browser. O clique em "Ver Bilhetes" não passa por aqui (ver /api/go),
  // e favoritos de contas com sessão são registados pela própria rota /api/favorites.
  if (route === 'track' && req.method === 'POST') {
    const eventId = Number(body.eventId);
    const type = String(body.type || '');
    if (!eventId || !CLIENT_TRACKABLE.includes(type)) return json(res, 422, { ok: false, message: 'Pedido inválido.' });
    const user = currentUser(req);
    if (user && type.startsWith('favorito_')) return json(res, 202, { ok: true, counted: false });
    const result = await recordInteractionSafe(db, req, { type, eventId, user, sessionId: body.sessionId, source: body.source });
    return json(res, 202, { ok: true, counted: result.counted });
  }
  // Compatibilidade com a versão anterior do front-end.
  if (route === 'event-views' && req.method === 'POST') {
    const eventId = Number(body.eventId); if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const result = await recordInteractionSafe(db, req, { type: 'visualizacao', eventId, user: currentUser(req), sessionId: body.sessionId, source: body.source });
    return json(res, 201, { ok: true, counted: result.counted });
  }
  // Botão "Ver Bilhetes": regista o clique e redireciona para a bilheteira do organizador.
  if (route === 'go' && ['GET', 'HEAD'].includes(req.method)) {
    const eventId = Number(queryParam(req, 'id'));
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const redirect = (location) => { res.setHeader('Location', location); res.statusCode = 302; return res.end(); };
    if (!eventId) return redirect('/');
    const [targets] = await db.query('SELECT evlinkbilhete, evvalor, evestado FROM evento WHERE idevento=?', [eventId]);
    const target = targets[0];
    const ticketUrl = target && ['publicado', 'ativo'].includes(target.evestado) && Number(target.evvalor) > 0 ? cleanHttpUrl(target.evlinkbilhete).url : null;
    if (!ticketUrl) return redirect(`/event.html?id=${eventId}`);
    if (req.method === 'GET') {
      await recordInteractionSafe(db, req, { type: 'clique_bilhete', eventId, user: currentUser(req), sessionId: queryParam(req, 's'), source: queryParam(req, 'src') });
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    return redirect(ticketUrl);
  }
  if (route === 'analytics' && req.method === 'GET') {
    const actor = requireUser(req, res, ['admin', 'organizador']); if (!actor) return;
    return handleAnalytics(db, req, res, actor);
  }
  if (route === 'organizer/profile') {
    const actor = requireUser(req, res, ['organizador']); if (!actor) return;
    if (req.method === 'PATCH') {
      const hasValue = (key) => body[key] !== undefined;
      const blank = (key) => body[key] === '' || body[key] === null;
      const updates = [];
      const values = [];
      const fail = (message) => json(res, 422, { ok: false, message });
      if (hasValue('type')) {
        const type = blank('type') ? null : String(body.type);
        if (type !== null && !ORGANIZER_TYPES.includes(type)) return fail('Tipo de entidade inválido.');
        updates.push('orgtipo=?'); values.push(type);
      }
      if (hasValue('hasTicketing')) {
        const value = blank('hasTicketing') ? null : String(body.hasTicketing);
        if (value !== null && !['sim', 'nao'].includes(value)) return fail('Resposta inválida sobre bilheteira própria.');
        updates.push('orgtembilheteira=?'); values.push(value);
      }
      if (hasValue('interest')) {
        const value = blank('interest') ? null : String(body.interest);
        if (value !== null && !['sim', 'talvez', 'nao'].includes(value)) return fail('Resposta inválida sobre o interesse numa bilheteira integrada.');
        updates.push('orginteressebilheteira=?'); values.push(value);
      }
      if (hasValue('council')) {
        const council = String(body.council || '').trim();
        if (council.length > 100) return fail('O concelho não pode ter mais de 100 caracteres.');
        updates.push('orgconcelho=?'); values.push(council || null);
      }
      if (hasValue('description')) {
        const description = String(body.description || '').trim();
        if (description.length > 500) return fail('A descrição não pode ter mais de 500 caracteres.');
        updates.push('orgdescricao=?'); values.push(description || null);
      }
      if (hasValue('website')) {
        const website = cleanHttpUrl(body.website, 255);
        if (website.error) return fail('O website tem de ser um endereço http:// ou https:// válido.');
        updates.push('orgwebsite=?'); values.push(website.url);
      }
      if (updates.length) await db.query(`UPDATE organizador SET ${updates.join(', ')} WHERE orgidutilizador=?`, [...values, actor.id]);
    }
    const [profiles] = await db.query('SELECT orgnome, orgdescricao, orgwebsite, orgtipo, orgconcelho, orgtembilheteira, orginteressebilheteira FROM organizador WHERE orgidutilizador=? LIMIT 1', [actor.id]);
    if (!profiles[0]) return json(res, 404, { ok: false, message: 'Perfil de organizador não encontrado.' });
    const profile = profiles[0];
    return json(res, 200, { ok: true, profile: { name: profile.orgnome, description: profile.orgdescricao || '', website: profile.orgwebsite || '', type: profile.orgtipo || '', council: profile.orgconcelho || '', hasTicketing: profile.orgtembilheteira || '', interest: profile.orginteressebilheteira || '' } });
  }
  if (route === 'admin/users') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') {
      const [rows] = await db.query(`
        SELECT
          u.idutilizador,
          u.utnome,
          u.utemail,
          u.utinicio,
          u.utestado,
          COALESCE(t.tutipo, 'registado') AS tutipo,
          (SELECT COUNT(*) FROM favorito f WHERE f.favidutilizador = u.idutilizador) AS totalFavoritos
        FROM utilizador u
        LEFT JOIN tipoutilizador t ON t.idtipoutilizador = u.uttipo
        ORDER BY u.idutilizador DESC
      `);
      return json(res, 200, {
        ok: true,
        total: rows.length,
        users: rows.map((r) => ({
          id: Number(r.idutilizador),
          name: r.utnome,
          email: r.utemail,
          registeredAt: r.utinicio,
          status: isActive(r.utestado) ? 'ativo' : 'inativo',
          estado: isActive(r.utestado),
          isActive: isActive(r.utestado),
          type: r.tutipo,
          roleLabel: roleLabel(r.tutipo),
          favoriteCount: Number(r.totalFavoritos)
        }))
      });
    }
    if (req.method === 'DELETE') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return json(res, 422, { ok: false, message: 'Email em falta.' });
      const [users] = await db.query('SELECT u.idutilizador, t.tutipo FROM utilizador u LEFT JOIN tipoutilizador t ON t.idtipoutilizador=u.uttipo WHERE LOWER(u.utemail)=? LIMIT 1', [email]);
      if (!users[0]) return json(res, 404, { ok: false, message: 'Utilizador não encontrado.' });
      if (Number(users[0].idutilizador) === Number(actor.id)) return json(res, 403, { ok: false, message: 'Não podes eliminar a tua própria conta.' });
      if (users[0].tutipo === 'administrador') return json(res, 403, { ok: false, message: 'Não é possível eliminar contas de administrador.' });
      await deleteUserAccount(db, users[0].idutilizador);
      return json(res, 200, { ok: true, email });
    }
    const active = body.estado ?? body.isActive ?? ['ativo', 'active', '1', 'true'].includes(String(body.status).toLowerCase()); await db.query('UPDATE utilizador SET utestado=? WHERE LOWER(utemail)=LOWER(?)', [active ? 'ativo' : 'inativo', body.email]); return json(res, 200, { ok: true, email: body.email, status: active ? 'ativo' : 'inativo', estado: Boolean(active), isActive: Boolean(active) });
  }
  if (route === 'admin/organizers') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') {
      const [rows] = await db.query('SELECT o.*,COUNT(e.idevento) totalEventos FROM organizador o LEFT JOIN evento e ON e.evidorganizador=o.idorganizador GROUP BY o.idorganizador ORDER BY FIELD(o.orgestado,"pendente","aprovado","suspenso"),o.idorganizador DESC');
      return json(res, 200, { ok: true, organizers: rows.map((r) => ({ id: Number(r.idorganizador), name: r.orgnome, email: r.orgemail, registeredAt: r.orginicio, status: r.orgestado, eventCount: Number(r.totalEventos), description: r.orgdescricao || '', website: r.orgwebsite || '', type: r.orgtipo || '', council: r.orgconcelho || '', hasTicketing: r.orgtembilheteira || '', interest: r.orginteressebilheteira || '' })) });
    }
    if (req.method === 'DELETE') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return json(res, 422, { ok: false, message: 'Email em falta.' });
      const [organizers] = await db.query('SELECT orgidutilizador FROM organizador WHERE LOWER(orgemail)=? LIMIT 1', [email]);
      if (!organizers[0]) return json(res, 404, { ok: false, message: 'Organizador não encontrado.' });
      if (Number(organizers[0].orgidutilizador) === Number(actor.id)) return json(res, 403, { ok: false, message: 'Não podes eliminar a tua própria conta.' });
      await deleteUserAccount(db, organizers[0].orgidutilizador);
      return json(res, 200, { ok: true, email });
    }
    if (!['pendente', 'aprovado', 'suspenso'].includes(body.status)) return json(res, 422, { ok: false, message: 'Estado inválido.' });
    await db.query('UPDATE organizador SET orgestado=? WHERE LOWER(orgemail)=LOWER(?)', [body.status, body.email]); return json(res, 200, { ok: true });
  }
  if (route === 'admin/events') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') return json(res, 200, { ok: true, events: await eventRows(db, req.query.status || 'all', null) });
    const action = String(body.action || '').toLowerCase(), eventId = Number(body.eventId);
    const states = { approve: 'publicado', show: 'publicado', hide: 'oculto', reject: 'recusado', inactivate: 'inativo' };
    if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    if (action === 'delete') { await db.query('DELETE FROM eventoalteracao WHERE alidevento=?', [eventId]); await db.query('DELETE FROM evento WHERE idevento=?', [eventId]); }
    else if (action === 'approve_change' || action === 'reject_change') {
      const change = await getChangeRequest(db, eventId);
      if (!change || !change.input) return json(res, 404, { ok: false, message: 'Não há nenhum pedido de alteração para este evento.' });
      if (action === 'approve_change') {
        await applyEventContent(db, eventId, change.input, change.images);
        await db.query('DELETE FROM eventoalteracao WHERE alidevento=?', [eventId]);
      } else {
        const reason = String(body.reason || '').trim().slice(0, 300) || 'Sem motivo indicado.';
        await db.query('UPDATE eventoalteracao SET almotivo=? WHERE alidevento=?', [reason, eventId]);
      }
    } else if (states[action]) {
      const now = utcTimestamp();
      const [current] = await db.query('SELECT evpublicaem FROM evento WHERE idevento=?', [eventId]);
      if (!current[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
      // Se o organizador agendou a publicação, a aprovação mantém o agendamento (o evento fica oculto até à data).
      const scheduled = ['approve', 'show'].includes(action) && current[0].evpublicaem && new Date(`${new Date(current[0].evpublicaem).toISOString().slice(0, 19)}Z`).getTime() > Date.now();
      const nextState = scheduled ? 'oculto' : states[action];
      await db.query('UPDATE evento SET evestado=?, evpublicaem=?, evmotivorecusa=? WHERE idevento=?', [nextState, scheduled ? current[0].evpublicaem : null, action === 'reject' ? (String(body.reason || '').trim().slice(0, 300) || null) : null, eventId]);
      if (['approve', 'show'].includes(action)) await db.query('UPDATE evento SET evdataaprovacao=COALESCE(evdataaprovacao, ?) WHERE idevento=?', [now, eventId]);
      if (action === 'reject') await db.query('UPDATE evento SET evdataaprovacao=NULL WHERE idevento=?', [eventId]);
      if (nextState === 'publicado') await db.query('UPDATE evento SET evdatapublicacao=COALESCE(evdatapublicacao, ?) WHERE idevento=?', [now, eventId]);
    } else {
      return json(res, 422, { ok: false, message: 'Ação inválida.' });
    }
    return json(res, 200, { ok: true });
  }
  // Revisão de um evento (administrador ou dono): o evento em qualquer estado e, se existir, o pedido de alteração
  // já com a "versão proposta" montada e a lista de diferenças.
  if (route === 'event-review' && req.method === 'GET') {
    const actor = requireUser(req, res, ['admin', 'organizador']); if (!actor) return;
    const eventId = Number(req.query?.id || new URL(req.url, 'http://localhost').searchParams.get('id'));
    if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const [found] = await db.query('SELECT 1 FROM evento WHERE idevento=?', [eventId]);
    if (!found[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
    const ownEmail = actor.accountType === 'admin' ? null : actor.email;
    const [event] = await eventRows(db, 'all', ownEmail, eventId);
    if (!event) return json(res, 403, { ok: false, message: 'Sem permissão.' });
    const change = await getChangeRequest(db, eventId);
    let proposed = null;
    let diff = [];
    if (change?.input) {
      const input = change.input;
      const label = (key) => ({ title: 'Título', description: 'Descrição', startDate: 'Início', endDate: 'Fim', price: 'Preço', ticketUrl: 'Link de bilhetes', category: 'Categoria', city: 'Cidade', district: 'Distrito', street: 'Morada / local', isRecurring: 'Evento periódico', recurringPattern: 'Periodicidade', recurringDays: 'Dias' })[key];
      const fmtDate = (value) => (value ? new Date(value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
      const current = { title: event.title, description: event.description, startDate: fmtDate(event.startDate), endDate: fmtDate(event.endDate), price: event.priceLabel, ticketUrl: event.ticketUrl, category: event.category, city: event.city, district: event.district, street: event.street, isRecurring: event.isRecurring ? 'Sim' : 'Não', recurringPattern: event.recurringPattern, recurringDays: event.recurringDays };
      const next = { title: input.title, description: input.description === undefined ? event.description : (input.description || ''), startDate: fmtDate(input.startDate), endDate: fmtDate(input.endDate), price: formatPrice(input.price).priceLabel, ticketUrl: input.ticketUrl || '', category: input.category, city: input.city, district: input.district, street: input.street || '', isRecurring: input.isRecurring ? 'Sim' : 'Não', recurringPattern: input.recurringPattern || '', recurringDays: input.recurringDays || '' };
      for (const key of Object.keys(current)) {
        if (String(current[key] ?? '').trim() !== String(next[key] ?? '').trim()) diff.push({ field: key, label: label(key), from: String(current[key] ?? '') || '—', to: String(next[key] ?? '') || '—' });
      }
      if (change.images.length) diff.push({ field: 'images', label: 'Imagens', from: 'Atuais', to: `${change.images.length} nova(s) imagem(ns)` });
      proposed = {
        ...event, title: input.title, description: input.description === undefined ? event.description : (input.description || ''),
        startDate: input.startDate, eventDate: input.startDate, endDate: input.endDate || '', ...formatPrice(input.price),
        ticketUrl: input.ticketUrl || '', hasTicket: Number(input.price || 0) > 0 && Boolean(input.ticketUrl), category: input.category, city: input.city, district: input.district,
        street: input.street || '', location: [input.street, input.city].filter(Boolean).join(', '), isRecurring: Boolean(input.isRecurring),
        recurringPattern: input.recurringPattern || '', recurringDays: input.recurringDays || '',
        dateLabel: new Date(input.startDate).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
        image: change.images[0] || event.image, images: change.images
      };
    }
    return json(res, 200, { ok: true, event, change: change ? { requestedAt: change.requestedAt, rejectReason: change.rejectReason, diff, proposed } : null });
  }
  // Sino de notificações do administrador: o que está à espera de revisão.
  if (route === 'admin/notifications' && req.method === 'GET') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    const [events] = await db.query("SELECT e.idevento AS id, e.evtitulo AS title, e.evdatasubmissao AS at, o.orgnome AS organizer FROM evento e JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE e.evestado='pendente' ORDER BY e.evdatasubmissao DESC LIMIT 20");
    const [changes] = await db.query("SELECT e.idevento AS id, e.evtitulo AS title, al.aldata AS at, o.orgnome AS organizer FROM eventoalteracao al JOIN evento e ON e.idevento=al.alidevento JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE al.almotivo IS NULL ORDER BY al.aldata DESC LIMIT 20");
    const [organizers] = await db.query("SELECT idorganizador AS id, orgnome AS name, orgemail AS email, orginicio AS at FROM organizador WHERE orgestado='pendente' ORDER BY orginicio DESC LIMIT 20");
    const [counts] = await db.query("SELECT (SELECT COUNT(*) FROM evento WHERE evestado='pendente') AS events, (SELECT COUNT(*) FROM eventoalteracao WHERE almotivo IS NULL) AS changes, (SELECT COUNT(*) FROM organizador WHERE orgestado='pendente') AS organizers");
    const pendingEvents = Number(counts[0].events), pendingChanges = Number(counts[0].changes), pendingOrganizers = Number(counts[0].organizers);
    return json(res, 200, {
      ok: true, pendingEvents, pendingChanges, pendingOrganizers, total: pendingEvents + pendingChanges + pendingOrganizers,
      events: events.map((row) => ({ id: Number(row.id), title: row.title, organizer: row.organizer, at: row.at })),
      changes: changes.map((row) => ({ id: Number(row.id), title: row.title, organizer: row.organizer, at: row.at })),
      organizers: organizers.map((row) => ({ id: Number(row.id), name: row.name, email: row.email, at: row.at }))
    });
  }
  return json(res, 404, { ok: false, message: 'Endpoint não encontrado.' });
}

module.exports = async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      json(res, 500, {
        ok: false,
        message: 'Erro interno do servidor.',
        detail: error instanceof Error ? error.message : 'Erro desconhecido.'
      });
    }
  }
};
