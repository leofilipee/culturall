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
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
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

// Visibilidade escolhida pelo organizador: publicar já, agendar (oculto até evpublicaem) ou ocultar.
// A coluna evpublicaem (UTC) é criada automaticamente na primeira utilização, se ainda não existir.
let publishColumnReady = null;
async function ensurePublishColumn(connection) {
  if (publishColumnReady !== null) return publishColumnReady;
  try {
    const [cols] = await connection.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'evento' AND column_name = 'evpublicaem'");
    if (!Number(cols[0]?.total)) await connection.query('ALTER TABLE evento ADD COLUMN evpublicaem DATETIME NULL');
    publishColumnReady = true;
  } catch (error) {
    console.error('Coluna evpublicaem indisponível (agendamento desativado):', error.message);
    publishColumnReady = false;
  }
  return publishColumnReady;
}

async function releaseScheduledEvents(connection) {
  if (!(await ensurePublishColumn(connection))) return;
  await connection.query("UPDATE evento SET evestado='publicado', evpublicaem=NULL WHERE evestado='oculto' AND evpublicaem IS NOT NULL AND evpublicaem <= UTC_TIMESTAMP()");
}

// Devolve { estado, publicaem } a partir de body.visibility ('publish' | 'schedule' | 'hide'), ou { error }.
function resolveVisibility(body) {
  const visibility = String(body.visibility || '').toLowerCase();
  if (visibility === 'publish') return { estado: 'publicado', publicaem: null };
  if (visibility === 'hide') return { estado: 'oculto', publicaem: null };
  if (visibility === 'schedule') {
    const when = new Date(body.publishAt);
    if (Number.isNaN(when.getTime())) return { error: 'Escolhe a data e hora de publicação.' };
    if (when.getTime() <= Date.now() + 30000) return { error: 'A data de publicação tem de estar no futuro.' };
    return { estado: 'oculto', publicaem: when.toISOString().slice(0, 19).replace('T', ' ') };
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

// Elimina uma conta de utilizador da base de dados. Se for organizador, apaga primeiro os seus eventos
// (a chave estrangeira evento -> organizador é RESTRICT); o resto (favoritos, perfil de organizador,
// preferências, notificações) cai em cascata e as visualizações ficam anónimas.
async function deleteUserAccount(db, userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [organizers] = await connection.query('SELECT idorganizador FROM organizador WHERE orgidutilizador=?', [userId]);
    for (const organizer of organizers) {
      await connection.query('DELETE FROM evento WHERE evidorganizador=?', [organizer.idorganizador]);
    }
    await connection.query('DELETE FROM utilizador WHERE idutilizador=?', [userId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function eventRows(connection, status, ownEmail) {
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
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await connection.query(`
    SELECT e.*, c.catnome, l.locmorada, l.loccidade, l.locdistrito, o.orgnome, o.orgemail,
      (SELECT COUNT(*) FROM eventovisualizacao v WHERE v.evvidevento=e.idevento) AS totalVisualizacoes,
      (SELECT img.imgurl FROM imagem img WHERE img.imgidevento=e.idevento AND img.imgtipo='capa' ORDER BY img.idimagem LIMIT 1) AS imagem_capa
    FROM evento e JOIN categoria c ON c.idcategoria=e.evidcategoria
    JOIN localizacao l ON l.idlocalizacao=e.evidlocalizacao JOIN organizador o ON o.idorganizador=e.evidorganizador
    ${where} ORDER BY e.evdatainicio DESC, e.idevento DESC`, params);
  return rows.map((row) => ({
    id: Number(row.idevento), title: row.evtitulo, description: row.evdescricao || '',
    dateLabel: new Date(row.evdatainicio).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
    dateBucket: 'Publicado', eventDate: row.evdatainicio, startDate: row.evdatainicio, endDate: row.evdatafim || '',
    location: [row.locmorada, row.loccidade].filter(Boolean).join(', '),
    city: row.loccidade, district: row.locdistrito, category: row.catnome, ...formatPrice(row.evvalor),
    views: Number(row.totalVisualizacoes || 0), ticketUrl: row.evlinkbilhete || '', status: row.evestado,
    statusLabel: row.evestado === 'oculto' && row.evpublicaem ? 'Agendado' : statusLabel(row.evestado),
    scheduledFor: row.evestado === 'oculto' && row.evpublicaem ? new Date(`${String(row.evpublicaem instanceof Date ? row.evpublicaem.toISOString() : row.evpublicaem).replace(' ', 'T').replace(/Z$/, '')}Z`).toISOString() : '',
    isRecurring: Boolean(row.evrecorrente), recurringPattern: row.evperiodicidade || '',
    recurringDays: row.evdiasrecorrencia || '', submittedAt: row.evdatasubmissao || '', approvedAt: row.evdataaprovacao || '',
    rejectReason: row.evmotivorecusa || '', organizer: row.orgnome, organizerEmail: row.orgemail, image: row.imagem_capa || ''
  }));
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
      const required = ['title', 'startDate', 'category', 'locationCity', 'locationDistrict'];
      if (required.some((key) => !String(body[key] || '').trim())) return json(res, 422, { ok: false, message: 'Título, data inicial, categoria e localização são obrigatórios.' });
      const [cats] = await db.query('SELECT idcategoria FROM categoria WHERE catnome=? LIMIT 1', [body.category]);
      let categoryId = cats[0]?.idcategoria;
      if (!categoryId) { const [r] = await db.query('INSERT INTO categoria (catnome) VALUES (?)', [body.category]); categoryId = r.insertId; }
      const [locs] = await db.query('SELECT idlocalizacao FROM localizacao WHERE locmorada <=> ? AND loccidade=? AND locdistrito=? LIMIT 1', [body.locationStreet || null, body.locationCity, body.locationDistrict]);
      let locationId = locs[0]?.idlocalizacao;
      if (!locationId) { const [r] = await db.query('INSERT INTO localizacao (locmorada,loccidade,locdistrito) VALUES (?,?,?)', [body.locationStreet || null, body.locationCity, body.locationDistrict]); locationId = r.insertId; }
      const [orgs] = await db.query('SELECT idorganizador FROM organizador WHERE orgidutilizador=? LIMIT 1', [actor.id]);
      if (!orgs[0]) return json(res, 422, { ok: false, message: 'O utilizador autenticado não tem perfil de organizador.' });
      const visibility = resolveVisibility(body);
      if (visibility.error) return json(res, 422, { ok: false, message: visibility.error });
      const [result] = await db.query('INSERT INTO evento (evtitulo,evdescricao,evdatainicio,evdatafim,evvalor,evlinkbilhete,evestado,evrecorrente,evperiodicidade,evdiasrecorrencia,evidcategoria,evidlocalizacao,evidorganizador) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [body.title, body.description || null, body.startDate, body.endDate || null, Number(body.price || 0), body.ticketUrl || null, visibility.estado, body.isRecurring ? 1 : 0, body.recurringPattern || null, body.recurringDays || null, categoryId, locationId, orgs[0].idorganizador]);
      if (visibility.publicaem && (await ensurePublishColumn(db))) await db.query('UPDATE evento SET evpublicaem=? WHERE idevento=?', [visibility.publicaem, result.insertId]);
      if (Array.isArray(body.images)) {
        await saveEventImages(db, result.insertId, body.images);
      }
      return json(res, 201, { ok: true, message: 'Evento criado com sucesso.', eventId: result.insertId });
    }
    if (req.method === 'PATCH') {
      const actor = requireUser(req, res, ['organizador', 'admin']); if (!actor) return;
      const eventId = Number(body.eventId), action = String(body.action || '').toLowerCase();
      const [rows] = await db.query('SELECT e.idevento,o.orgemail FROM evento e JOIN organizador o ON o.idorganizador=e.evidorganizador WHERE e.idevento=?', [eventId]);
      if (!rows[0]) return json(res, 404, { ok: false, message: 'Evento não encontrado.' });
      if (actor.accountType !== 'admin' && actor.email.toLowerCase() !== rows[0].orgemail.toLowerCase()) return json(res, 403, { ok: false, message: 'Sem permissão.' });
      if (action === 'delete') await db.query('DELETE FROM evento WHERE idevento=?', [eventId]);
      else if (action === 'update') {
        const visibility = resolveVisibility(body);
        if (visibility.error) return json(res, 422, { ok: false, message: visibility.error });
        await db.query('UPDATE evento SET evtitulo=?,evdescricao=?,evdatainicio=?,evdatafim=?,evvalor=?,evlinkbilhete=?,evestado=?,evrecorrente=?,evperiodicidade=?,evdiasrecorrencia=? WHERE idevento=?', [
          body.title, body.description || null, body.startDate, body.endDate || null, Number(body.price || 0), body.ticketUrl || null,
          visibility.estado, body.isRecurring ? 1 : 0, body.recurringPattern || null, body.recurringDays || null, eventId
        ]);
        if (await ensurePublishColumn(db)) await db.query('UPDATE evento SET evpublicaem=? WHERE idevento=?', [visibility.publicaem, eventId]);
        // Só substitui as imagens se o organizador enviou novas; caso contrário mantêm-se as atuais.
        if (Array.isArray(body.images) && body.images.some((image) => /^(data:image\/|https?:\/\/|\/)/i.test(String(image)))) {
          await db.query('DELETE FROM imagem WHERE imgidevento=?', [eventId]);
          await saveEventImages(db, eventId, body.images);
        }
      } else {
        await db.query('UPDATE evento SET evestado=? WHERE idevento=?', [action === 'inactivate' ? 'inativo' : action === 'hide' ? 'oculto' : action === 'show' ? 'publicado' : 'pendente', eventId]);
        if (await ensurePublishColumn(db)) await db.query('UPDATE evento SET evpublicaem=NULL WHERE idevento=?', [eventId]);
      }
      return json(res, 200, { ok: true });
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
  if (route === 'favorites') {
    const user = requireUser(req, res); if (!user) return;
    if (user.accountType !== 'lambda') {
      if (req.method === 'GET') return json(res, 200, { ok: true, favorites: [] });
      return json(res, 403, { ok: false, message: 'Este tipo de conta não tem eventos favoritos.' });
    }
    if (req.method === 'GET') { const [rows] = await db.query('SELECT favidevento FROM favorito WHERE favidutilizador=? ORDER BY idfavorito DESC', [user.id]); return json(res, 200, { ok: true, favorites: rows.map((row) => Number(row.favidevento)) }); }
    const eventId = Number(body.eventId); if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    if (req.method === 'DELETE') { await db.query('DELETE FROM favorito WHERE favidutilizador=? AND favidevento=?', [user.id, eventId]); return json(res, 200, { ok: true }); }
    const [found] = await db.query('SELECT idfavorito FROM favorito WHERE favidutilizador=? AND favidevento=?', [user.id, eventId]);
    if (found[0]) { await db.query('DELETE FROM favorito WHERE idfavorito=?', [found[0].idfavorito]); return json(res, 200, { ok: true, favorite: false }); }
    await db.query('INSERT INTO favorito (favidutilizador,favidevento) VALUES (?,?)', [user.id, eventId]); return json(res, 201, { ok: true, favorite: true });
  }
  if (route === 'event-views' && req.method === 'POST') {
    const eventId = Number(body.eventId); if (!eventId) return json(res, 422, { ok: false, message: 'Evento inválido.' });
    const user = currentUser(req); await db.query('INSERT INTO eventovisualizacao (evvidevento,evvidutilizador) VALUES (?,?)', [eventId, user?.id || null]); return json(res, 201, { ok: true });
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
    if (req.method === 'GET') { const [rows] = await db.query('SELECT o.*,COUNT(e.idevento) totalEventos FROM organizador o LEFT JOIN evento e ON e.evidorganizador=o.idorganizador GROUP BY o.idorganizador ORDER BY FIELD(o.orgestado,"pendente","aprovado","suspenso"),o.idorganizador DESC'); return json(res, 200, { ok: true, organizers: rows.map((r) => ({ id: Number(r.idorganizador), name: r.orgnome, email: r.orgemail, registeredAt: r.orginicio, status: r.orgestado, eventCount: Number(r.totalEventos) })) }); }
    if (req.method === 'DELETE') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return json(res, 422, { ok: false, message: 'Email em falta.' });
      const [organizers] = await db.query('SELECT orgidutilizador FROM organizador WHERE LOWER(orgemail)=? LIMIT 1', [email]);
      if (!organizers[0]) return json(res, 404, { ok: false, message: 'Organizador não encontrado.' });
      if (Number(organizers[0].orgidutilizador) === Number(actor.id)) return json(res, 403, { ok: false, message: 'Não podes eliminar a tua própria conta.' });
      await deleteUserAccount(db, organizers[0].orgidutilizador);
      return json(res, 200, { ok: true, email });
    }
    await db.query('UPDATE organizador SET orgestado=? WHERE LOWER(orgemail)=LOWER(?)', [body.status, body.email]); return json(res, 200, { ok: true });
  }
  if (route === 'admin/events') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') return json(res, 200, { ok: true, events: await eventRows(db, req.query.status || 'all', null) });
    const action = String(body.action || '').toLowerCase(), eventId = Number(body.eventId);
    if (action === 'delete') await db.query('DELETE FROM evento WHERE idevento=?', [eventId]);
    else {
      await db.query('UPDATE evento SET evestado=?,evmotivorecusa=? WHERE idevento=?', [action === 'approve' || action === 'show' ? 'publicado' : action === 'hide' ? 'oculto' : 'inativo', body.reason || null, eventId]);
      if (await ensurePublishColumn(db)) await db.query('UPDATE evento SET evpublicaem=NULL WHERE idevento=?', [eventId]);
    }
    return json(res, 200, { ok: true });
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
