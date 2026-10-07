const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

let pool;

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
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
      ssl: env('MYSQL_SSL', 'true') === 'true' ? { rejectUnauthorized: true } : undefined
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

function statusLabel(status) {
  return ({ publicado: 'Publicado', ativo: 'Publicado', pendente: 'Pendente', oculto: 'Oculto', recusado: 'Recusado', inativo: 'Inativo' })[status] || 'Publicado';
}

function formatPrice(value) {
  const price = Number(value || 0);
  return { price, priceLabel: price === 0 ? 'Entrada Gratuita' : `€${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(price)}`, priceType: price === 0 ? 'Gratuito' : 'Pago' };
}

async function eventRows(connection, status, ownEmail) {
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
    statusLabel: statusLabel(row.evestado), isRecurring: Boolean(row.evrecorrente), recurringPattern: row.evperiodicidade || '',
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
    if (!row || !(await bcrypt.compare(String(body.password || ''), row.utpasswordhash).catch(() => row.utpasswordhash === body.password))) return json(res, 401, { ok: false, message: 'Credenciais inválidas.' });
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
      const [insert] = await connection.query('INSERT INTO utilizador (utnome,utemail,utpasswordhash,utinicio,uttipo,utestado) VALUES (?,?,?,CURDATE(),?,"ativo")', [name, email, await bcrypt.hash(password, 10), typeId]);
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
      const [result] = await db.query('INSERT INTO evento (evtitulo,evdescricao,evdatainicio,evdatafim,evvalor,evlinkbilhete,evestado,evrecorrente,evperiodicidade,evdiasrecorrencia,evidcategoria,evidlocalizacao,evidorganizador) VALUES (?,?,?,?,?,?, "pendente",?,?,?,?,?,?)', [body.title, body.description || null, body.startDate, body.endDate || null, Number(body.price || 0), body.ticketUrl || null, body.isRecurring ? 1 : 0, body.recurringPattern || null, body.recurringDays || null, categoryId, locationId, orgs[0].idorganizador]);
      if (Array.isArray(body.images)) {
        for (const [index, image] of body.images.entries()) {
          if (/^(data:image\/|https?:\/\/|\/)/i.test(String(image))) {
            await db.query('INSERT INTO imagem (imgurl,imgtipo,imgidevento) VALUES (?,?,?)', [image, index === 0 ? 'capa' : 'galeria', result.insertId]);
          }
        }
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
        await db.query('UPDATE evento SET evtitulo=?,evdescricao=?,evdatainicio=?,evdatafim=?,evvalor=?,evlinkbilhete=?,evestado="pendente",evrecorrente=?,evperiodicidade=?,evdiasrecorrencia=? WHERE idevento=?', [
          body.title, body.description || null, body.startDate, body.endDate || null, Number(body.price || 0), body.ticketUrl || null,
          body.isRecurring ? 1 : 0, body.recurringPattern || null, body.recurringDays || null, eventId
        ]);
      } else await db.query('UPDATE evento SET evestado=? WHERE idevento=?', [action === 'inactivate' ? 'inativo' : action === 'hide' ? 'oculto' : action === 'show' ? 'publicado' : 'pendente', eventId]);
      return json(res, 200, { ok: true });
    }
  }
  if (route === 'favorites') {
    const user = requireUser(req, res); if (!user) return;
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
    if (req.method === 'GET') { const [rows] = await db.query('SELECT u.*,t.tutipo,(SELECT COUNT(*) FROM favorito f WHERE f.favidutilizador=u.idutilizador) totalFavoritos FROM utilizador u JOIN tipoutilizador t ON t.idtipoutilizador=u.uttipo ORDER BY u.idutilizador DESC'); return json(res, 200, { ok: true, users: rows.map((r) => ({ id: Number(r.idutilizador), name: r.utnome, email: r.utemail, registeredAt: r.utinicio, status: isActive(r.utestado) ? 'ativo' : 'inativo', estado: isActive(r.utestado), isActive: isActive(r.utestado), type: r.tutipo, roleLabel: roleLabel(r.tutipo), favoriteCount: Number(r.totalFavoritos) })) }); }
    const active = body.estado ?? body.isActive ?? ['ativo', 'active', '1', 'true'].includes(String(body.status).toLowerCase()); await db.query('UPDATE utilizador SET utestado=? WHERE LOWER(utemail)=LOWER(?)', [active ? 'ativo' : 'inativo', body.email]); return json(res, 200, { ok: true, email: body.email, status: active ? 'ativo' : 'inativo', estado: Boolean(active), isActive: Boolean(active) });
  }
  if (route === 'admin/organizers') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') { const [rows] = await db.query('SELECT o.*,COUNT(e.idevento) totalEventos FROM organizador o LEFT JOIN evento e ON e.evidorganizador=o.idorganizador GROUP BY o.idorganizador ORDER BY FIELD(o.orgestado,"pendente","aprovado","suspenso"),o.idorganizador DESC'); return json(res, 200, { ok: true, organizers: rows.map((r) => ({ id: Number(r.idorganizador), name: r.orgnome, email: r.orgemail, registeredAt: r.orginicio, status: r.orgestado, eventCount: Number(r.totalEventos) })) }); }
    await db.query('UPDATE organizador SET orgestado=? WHERE LOWER(orgemail)=LOWER(?)', [body.status, body.email]); return json(res, 200, { ok: true });
  }
  if (route === 'admin/events') {
    const actor = requireUser(req, res, ['admin']); if (!actor) return;
    if (req.method === 'GET') return json(res, 200, { ok: true, events: await eventRows(db, req.query.status || 'all', null) });
    const action = String(body.action || '').toLowerCase(), eventId = Number(body.eventId);
    if (action === 'delete') await db.query('DELETE FROM evento WHERE idevento=?', [eventId]);
    else await db.query('UPDATE evento SET evestado=?,evmotivorecusa=? WHERE idevento=?', [action === 'approve' || action === 'show' ? 'publicado' : action === 'hide' ? 'oculto' : 'inativo', body.reason || null, eventId]);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { ok: false, message: 'Endpoint não encontrado.' });
}

module.exports = async (req, res) => {
  try { await handler(req, res); } catch (error) { console.error(error); json(res, 500, { ok: false, message: 'Erro interno do servidor.' }); }
};
