document.addEventListener('DOMContentLoaded', () => {

  const weekdayOptions = [
    { value: 'Seg', label: 'Seg' },
    { value: 'Ter', label: 'Ter' },
    { value: 'Qua', label: 'Qua' },
    { value: 'Qui', label: 'Qui' },
    { value: 'Sex', label: 'Sex' },
    { value: 'Sáb', label: 'Sáb' },
    { value: 'Dom', label: 'Dom' }
  ];

  const pageType = document.body.dataset.page ?? 'home';
  const iconCalendar = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path></svg>';
  const iconLocation = '<svg viewBox="0 0 24 24"><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>';
  const iconLogin = '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"></path><path d="M15 12H4"></path><path d="M20 4v16"></path></svg>';
  const iconLogout = '<svg viewBox="0 0 24 24"><path d="M14 17l5-5-5-5"></path><path d="M19 12H8"></path><path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3"></path></svg>';
  const defaultEventImage = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Imagem indisponível"><rect width="1200" height="800" fill="#111111"/><g fill="none" stroke="#f2e6d8" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"><rect x="300" y="220" width="600" height="360" rx="26"/><circle cx="470" cy="350" r="48"/><path d="M330 540l140-140 110 110 90-90 200 200"/></g><text x="600" y="670" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#f2e6d8" opacity="0.9">Imagem indisponível</text></svg>');
  const pageConfig = {
    home: {
      title: 'Todos os Eventos',
      subtitle: 'eventos mais vistos e em destaque',
      chip: 'Ordenado por data',
      empty: 'Nenhum evento corresponde aos filtros atuais.'
    },
    events: {
      title: 'Eventos Disponíveis',
      subtitle: 'eventos futuros em geral',
      chip: 'Apenas eventos com data futura',
      empty: 'Não existem eventos disponíveis neste momento.'
    },
    favorites: {
      title: 'Favoritos',
      subtitle: 'lista de eventos assinalados',
      chip: 'Marcados com favorito',
      empty: 'Ainda não tens eventos favoritos guardados.'
    }
  };

  // A sessão fica guardada no browser (apenas dados de apresentação, nunca credenciais)
  // para o cabeçalho aparecer logo com o utilizador ao mudar de página. O cookie HttpOnly
  // continua a ser a autoridade: o /api/me confirma (ou limpa) a sessão em segundo plano.
  const sessionCacheKey = 'culturall:session';

  const readCachedSession = () => {
    try {
      const cached = JSON.parse(localStorage.getItem(sessionCacheKey) ?? 'null');
      return cached && typeof cached === 'object' && cached.email && cached.accountType ? cached : null;
    } catch {
      return null;
    }
  };

  const writeCachedSession = (session) => {
    try {
      if (session) {
        localStorage.setItem(sessionCacheKey, JSON.stringify(session));
      } else {
        localStorage.removeItem(sessionCacheKey);
      }
    } catch {
      // Sem armazenamento disponível: a sessão só fica em memória nesta página.
    }
  };

  let currentSession = readCachedSession();
  let sessionLoaded = false;

  const getSession = () => currentSession;

  const setSession = (session) => {
    currentSession = session;
    writeCachedSession(session);
  };

  const clearSession = () => {
    currentSession = null;
    writeCachedSession(null);
  };

  const loadSessionFromApi = async () => {
    try {
      const response = await requestJson('/api/me');
      setSession(response?.user ?? null);
    } catch (error) {
      // Só termina a sessão se o servidor disser que ela não existe; falhas de rede mantêm a sessão em cache.
      if (error?.status === 401 || error?.status === 403) {
        clearSession();
      }
    } finally {
      sessionLoaded = true;
    }
  };

  const syncLogoutRequest = () => {
    void fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    }).catch(() => {
      // Mantém o logout funcional mesmo sem backend disponível.
    });
  };

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      ...options
    });

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const error = new Error(payload?.message ?? 'Pedido inválido.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    // Uma ação de administração bem-sucedida pode ter mudado o que está pendente: o sino atualiza-se.
    if (String(url).startsWith('/api/admin/') && String(options.method ?? 'GET').toUpperCase() !== 'GET') {
      window.dispatchEvent(new CustomEvent('culturall:admin-changed'));
    }

    return payload;
  };

  /* ---------- Segurança de HTML e registo de interações ---------- */
  // Todo o texto vindo da base de dados (títulos, descrições, nomes…) passa por aqui antes de entrar em innerHTML.
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
  const esc = escapeHtml;

  // Respostas do perfil do organizador (apoiam a análise de viabilidade da bilheteira integrada).
  const organizerTypeLabels = {
    empresa: 'Empresa / promotora',
    associacao: 'Associação / coletivo',
    municipio: 'Município / entidade pública',
    espaco_cultural: 'Espaço cultural (teatro, sala, galeria)',
    independente: 'Artista / produtor independente'
  };
  const yesNoLabels = { sim: 'Sim', nao: 'Não' };
  const interestLabels = { sim: 'Sim', talvez: 'Talvez', nao: 'Não' };

  // Identificador anónimo por separador do browser (sessionStorage). Serve apenas para não contar a mesma pessoa
  // várias vezes e para ligar visualização -> clique; não identifica ninguém.
  let memoryTrackingSessionId = '';
  const createTrackingSessionId = () => {
    try {
      return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(36).padStart(2, '0')).join('');
    } catch {
      return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }
  };

  const getTrackingSessionId = () => {
    try {
      let id = sessionStorage.getItem('culturall:sid');
      if (!id) {
        id = createTrackingSessionId();
        sessionStorage.setItem('culturall:sid', id);
      }
      return id;
    } catch {
      memoryTrackingSessionId = memoryTrackingSessionId || createTrackingSessionId();
      return memoryTrackingSessionId;
    }
  };

  // Eventos de teste (demo-events.js) não existem na base de dados e por isso não são registados.
  const isTrackableEventId = (eventId) => /^\d+$/.test(String(eventId));

  const trackInteraction = (eventId, type, source) => {
    if (!isTrackableEventId(eventId)) {
      return;
    }

    const payload = JSON.stringify({ eventId: Number(eventId), type, sessionId: getTrackingSessionId(), source: source || 'direto' });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }))) {
        return;
      }
    } catch {
      // Cai para o fetch abaixo.
    }

    fetch('/api/track', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }).catch(() => {
      // O registo de estatísticas nunca deve afetar a navegação.
    });
  };

  const serverEventsState = {
    loaded: false,
    items: []
  };

  const serverFavoritesState = {
    loaded: false,
    ids: [],
    source: 'cache'
  };

  const adminEventsState = {
    loaded: false,
    items: []
  };

  const organizerEventsState = {
    loaded: false,
    items: []
  };

  // Revisão de um evento (administrador ou dono): evento em qualquer estado + pedido de alteração, se existir.
  let eventReviewState = null;
  let eventReviewVersion = null;

  let rerenderListingPage = null;

  const normalizeEventId = (value) => String(value);

  const normalizeAdminEventStatus = (status) => {
    const normalizedStatus = String(status ?? '').toLowerCase();
    if (normalizedStatus === 'pendente' || normalizedStatus === 'pending') {
      return 'pending';
    }

    if (['publicado', 'published', 'ativo', 'active', 'approved'].includes(normalizedStatus)) {
      return 'active';
    }

    if (['inativo', 'inactive', 'recusado', 'rejected'].includes(normalizedStatus)) {
      return 'inactive';
    }

    if (normalizedStatus === 'oculto' || normalizedStatus === 'hidden') {
      return 'hidden';
    }

    return 'pending';
  };

  const normalizeAdminEventStatusLabel = (status) => {
    const normalizedStatus = normalizeAdminEventStatus(status);
    if (normalizedStatus === 'pending') {
      return 'Pendente';
    }

    if (normalizedStatus === 'active') {
      return 'Ativo';
    }

    if (normalizedStatus === 'inactive') {
      return 'Inativo';
    }

    if (normalizedStatus === 'hidden') {
      return 'Oculto';
    }

    return 'Inativo';
  };

  const normalizePublicEventStatus = (status) => {
    const normalizedStatus = String(status ?? '').toLowerCase();
    if (['publicado', 'published', 'ativo', 'active', 'approved'].includes(normalizedStatus)) {
      return 'active';
    }

    if (['pendente', 'pending'].includes(normalizedStatus)) {
      return 'pending';
    }

    if (['oculto', 'hidden'].includes(normalizedStatus)) {
      return 'hidden';
    }

    if (['inativo', 'inactive', 'recusado', 'rejected'].includes(normalizedStatus)) {
      return 'inactive';
    }

    return 'active';
  };

  const formatApiDateLabel = (value) => {
    if (!value) {
      return 'Data indisponível';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return 'Data indisponível';
    }

    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(parsedDate);
  };

  const formatApiDateTime = (date) => {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const normalizeServerEvent = (event) => {
    const priceValue = Number(event.price ?? 0);
    const isFree = Math.abs(priceValue) < 0.001;
    const eventDate = event.startDate ?? event.eventDate ?? new Date().toISOString();
    const location = event.location ?? [event.locationStreet, event.city].filter(Boolean).join(', ');

    return {
      ...event,
      id: normalizeEventId(event.id),
      title: String(event.title ?? ''),
      category: String(event.category ?? 'Outros'),
      description: String(event.description ?? ''),
      dateLabel: event.dateLabel ?? formatApiDateLabel(eventDate),
      endDate: event.endDate ?? '',
      endDateLabel: event.endDateLabel ?? (event.endDate ? formatApiDateLabel(event.endDate) : ''),
      dateBucket: event.dateBucket ?? getDateBucketForDateTime(new Date(eventDate).getTime(), Boolean(event.isRecurring)),
      eventDate,
      location: location || String(event.city ?? ''),
      city: String(event.city ?? ''),
      district: String(event.district ?? getDistrictKey(location) ?? 'Outros'),
      priceLabel: event.priceLabel ?? (isFree ? 'Entrada Gratuita' : `€${priceValue.toFixed(0)}`),
      priceType: event.priceType ?? (isFree ? 'Gratuito' : 'Pago'),
      views: Number(event.views ?? 0),
      image: event.image || defaultEventImage,
      ticketUrl: event.ticketUrl ?? '',
      // Só eventos pagos com link de bilheteira têm o botão "Ver Bilhetes"; os gratuitos não têm bilheteira.
      hasTicket: event.hasTicket ?? (!isFree && /^https?:\/\//i.test(String(event.ticketUrl ?? ''))),
      status: normalizePublicEventStatus(event.status),
      statusLabel: event.statusLabel ?? getEventStatusLabel(normalizePublicEventStatus(event.status)),
      organizer: event.organizer ?? '',
      organizerEmail: event.organizerEmail ?? '',
      isRecurring: Boolean(event.isRecurring),
      recurringPattern: event.recurringPattern ?? '',
      recurringDays: event.recurringDays ?? '',
      submittedAt: event.submittedAt ?? '',
      approvedAt: event.approvedAt ?? '',
      rejectReason: event.rejectReason ?? ''
    };
  };

  const loadServerEvents = async (status = 'published') => {
    try {
      const response = await requestJson(`/api/events?status=${encodeURIComponent(status)}`);
      if (Array.isArray(response.events)) {
        serverEventsState.items = response.events.map(normalizeServerEvent);
      }
    } catch {
      serverEventsState.items = [];
    } finally {
      // Enquanto a base de dados não tiver eventos, usa os eventos de teste (demo-events.js).
      if (serverEventsState.items.length === 0 && Array.isArray(window.CULTURALL_DEMO_EVENTS)) {
        serverEventsState.items = window.CULTURALL_DEMO_EVENTS.map(normalizeServerEvent);
      }
      serverEventsState.loaded = true;
      rerenderListingPage?.();
      publishBridge();
    }
  };

  const loadServerFavorites = async () => {
    try {
      const response = await requestJson('/api/favorites');
      const favoriteIds = Array.isArray(response.favorites) ? response.favorites.map(normalizeEventId) : [];
      serverFavoritesState.ids = favoriteIds;
      serverFavoritesState.source = 'server';
    } catch {
      serverFavoritesState.ids = [];
      serverFavoritesState.source = 'server';
    } finally {
      serverFavoritesState.loaded = true;
      rerenderListingPage?.();
    }
  };

  const loadAdminEvents = async () => {
    try {
      const response = await requestJson('/api/admin/events?status=all');
      adminEventsState.items = Array.isArray(response.events)
        ? response.events.map((event) => ({
            ...event,
            organizerName: event.organizerName ?? event.organizer ?? '',
            status: normalizeAdminEventStatus(event.status),
            statusLabel: normalizeAdminEventStatusLabel(event.status)
          }))
        : [];
    } catch {
      adminEventsState.items = [];
    } finally {
      adminEventsState.loaded = true;
    }
  };

  // Cancelar o pedido de aprovação de um evento novo ("cancel_request") ou um pedido de alteração ("cancel_change").
  const cancelOrganizerRequest = async (eventId, action, onDone) => {
    const question = action === 'cancel_request'
      ? 'Cancelar o pedido de aprovação? O evento fica oculto e podes voltar a submetê-lo mais tarde.'
      : 'Cancelar o pedido de alteração? O evento mantém a versão atual e as alterações pedidas são descartadas.';
    if (!window.confirm(question)) {
      return;
    }

    try {
      const response = await requestJson('/api/events', { method: 'PATCH', body: JSON.stringify({ eventId: Number(eventId), action }) });
      showToast(response?.message ?? (action === 'cancel_change' ? 'Pedido de alteração cancelado.' : 'Pedido cancelado.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível cancelar o pedido.');
    }

    if (typeof onDone === 'function') {
      await onDone();
    }
  };

  /* ---------- Ordenar e filtrar listas ---------- */
  // "dd/mm/aa(aa)[, hh:mm]", ISO ou milissegundos -> timestamp (ou null).
  const parseListDate = (text) => {
    const value = String(text ?? '').trim();
    if (/^\d{10,}$/.test(value)) {
      return Number(value);
    }

    const pt = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (pt) {
      const year = Number(pt[3]) < 100 ? 2000 + Number(pt[3]) : Number(pt[3]);
      return new Date(year, Number(pt[2]) - 1, Number(pt[1]), Number(pt[4] ?? 0), Number(pt[5] ?? 0)).getTime();
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  // Barra de ordenação + filtros para uma lista que se volta a desenhar (tabela ou cartões). Funciona sobre o DOM:
  // volta a aplicar-se sozinha sempre que a lista muda. `fields[chave](elemento)` devolve o texto de cada coluna.
  const attachListControls = ({ container, anchor, getItems, fields, sorts = [], filters = [], noun = 'resultados', pagination = 'more' }) => {
    if (!container || !anchor || anchor.previousElementSibling?.classList.contains('list-controls')) {
      return;
    }

    const pageSize = 12;
    const state = { sort: '', filters: {}, limit: pageSize, page: 1 };
    const numbered = pagination === 'pages';
    const moreWrap = document.createElement('div');
    moreWrap.className = 'load-more-wrap';
    moreWrap.hidden = true;
    moreWrap.innerHTML = numbered ? '<nav class="pager" aria-label="Páginas"></nav>' : '<button type="button" class="load-more-btn"></button>';
    const moreButton = numbered ? null : moreWrap.firstElementChild;
    const pager = numbered ? moreWrap.firstElementChild : null;
    let originalCounter = 0;
    let applying = false;
    const bar = document.createElement('div');
    bar.className = 'list-controls';
    bar.innerHTML = `
      ${sorts.length ? `<label class="list-control"><span>Ordenar por</span>
        <select data-list-sort><option value="">Ordem original</option>${sorts.map((sort) => `<option value="${esc(sort.value)}">${esc(sort.label)}</option>`).join('')}</select></label>` : ''}
      ${filters.map((filter) => `<label class="list-control"><span>${esc(filter.label)}</span>
        <select data-list-filter="${esc(filter.id)}"><option value="">Todos</option></select></label>`).join('')}
      <button type="button" class="list-controls-reset" hidden>Limpar</button>
      <span class="list-count" role="status" aria-live="polite"></span>
    `;
    anchor.before(bar);
    anchor.after(moreWrap);
    const sortSelect = bar.querySelector('[data-list-sort]');
    const resetButton = bar.querySelector('.list-controls-reset');
    const countEl = bar.querySelector('.list-count');

    const toNumber = (text) => {
      const number = parseFloat(String(text ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
      return Number.isNaN(number) ? null : number;
    };

    const apply = () => {
      if (applying) {
        return;
      }

      applying = true;
      observer.disconnect();
      try {
        const items = getItems();
        items.forEach((item) => {
          if (item.dataset.listOrig === undefined) {
            item.dataset.listOrig = String(originalCounter += 1);
          }
        });

        filters.forEach((filter) => {
          const select = bar.querySelector(`[data-list-filter="${filter.id}"]`);
          const values = [...new Set(items.map((item) => String(fields[filter.key](item) ?? '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));
          if (state.filters[filter.id] && !values.includes(state.filters[filter.id])) {
            state.filters[filter.id] = '';
          }

          select.innerHTML = `<option value="">Todos</option>${values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
          select.value = state.filters[filter.id] ?? '';
        });

        let visible = 0;
        items.forEach((item) => {
          const matches = filters.every((filter) => !state.filters[filter.id] || String(fields[filter.key](item) ?? '').trim() === state.filters[filter.id]);
          item.classList.toggle('list-hidden', !matches);
          if (matches) {
            visible += 1;
          }
        });

        const sort = sorts.find((candidate) => candidate.value === state.sort);
        const ordered = items.slice().sort((a, b) => {
          if (!sort) {
            return Number(a.dataset.listOrig) - Number(b.dataset.listOrig);
          }

          const left = fields[sort.key](a);
          const right = fields[sort.key](b);
          let result;
          if (sort.type === 'date' || sort.type === 'number') {
            const l = sort.type === 'date' ? parseListDate(left) : toNumber(left);
            const r = sort.type === 'date' ? parseListDate(right) : toNumber(right);
            // Sem valor vai sempre para o fim.
            if (l === null && r === null) return 0;
            if (l === null) return 1;
            if (r === null) return -1;
            result = (l - r) * sort.dir;
          } else {
            result = String(left ?? '').localeCompare(String(right ?? ''), 'pt', { sensitivity: 'base', numeric: true }) * sort.dir;
          }

          return result || Number(a.dataset.listOrig) - Number(b.dataset.listOrig);
        });
        ordered.forEach((item) => container.appendChild(item));

        // Paginação: "Ver mais" (mostra mais 12 de cada vez) ou páginas numeradas (1, 2, 3…).
        const visibleItems = ordered.filter((item) => !item.classList.contains('list-hidden'));
        if (numbered) {
          const pages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
          state.page = Math.min(Math.max(1, state.page), pages);
          visibleItems.forEach((item, index) => {
            item.classList.toggle('list-hidden', Math.floor(index / pageSize) + 1 !== state.page);
          });
          moreWrap.hidden = pages <= 1;
          const around = [1, pages, state.page - 1, state.page, state.page + 1].filter((n) => n >= 1 && n <= pages);
          const numbersToShow = [...new Set(around)].sort((a, b) => a - b);
          let previous = 0;
          const buttons = numbersToShow.map((n) => {
            const gap = n - previous > 1 ? '<span class="pager-gap" aria-hidden="true">…</span>' : '';
            previous = n;
            return `${gap}<button type="button" class="pager-btn${n === state.page ? ' active' : ''}" data-page="${n}" aria-label="Página ${n}"${n === state.page ? ' aria-current="page"' : ''}>${n}</button>`;
          }).join('');
          pager.innerHTML = `<button type="button" class="pager-btn" data-page="${state.page - 1}" aria-label="Página anterior"${state.page === 1 ? ' disabled' : ''}>‹</button>${buttons}<button type="button" class="pager-btn" data-page="${state.page + 1}" aria-label="Página seguinte"${state.page === pages ? ' disabled' : ''}>›</button>`;
        } else {
          visibleItems.forEach((item, index) => {
            if (index >= state.limit) {
              item.classList.add('list-hidden');
            }
          });
          const remaining = Math.max(0, visible - state.limit);
          moreWrap.hidden = remaining === 0;
          moreButton.textContent = `Ver mais (${remaining} ${remaining === 1 ? 'restante' : 'restantes'})`;
        }

        const filtered = Boolean(state.sort) || filters.some((filter) => state.filters[filter.id]);
        resetButton.hidden = !filtered;
        const nounFor = (count) => (count === 1 ? noun.replace(/s$/, '') : noun);
        countEl.textContent = items.length === 0 ? '' : visible === items.length ? `${items.length} ${nounFor(items.length)}` : `${visible} de ${items.length} ${nounFor(items.length)}`;
        bar.hidden = items.length === 0;
      } finally {
        observer.observe(container, { childList: true });
        applying = false;
      }
    };

    const observer = new MutationObserver(apply);
    bar.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-list-sort]')) {
        state.sort = target.value;
      } else if (target.matches('[data-list-filter]')) {
        state.filters[target.dataset.listFilter] = target.value;
      }

      state.limit = pageSize;
      state.page = 1;
      apply();
    });
    moreButton?.addEventListener('click', () => {
      state.limit += pageSize;
      apply();
    });
    pager?.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-page]') : null;
      if (!button || button.disabled) {
        return;
      }

      state.page = Number(button.dataset.page);
      apply();
      anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    resetButton.addEventListener('click', () => {
      state.sort = '';
      state.filters = {};
      state.limit = pageSize;
      state.page = 1;
      if (sortSelect) {
        sortSelect.value = '';
      }

      apply();
    });
    apply();
  };

  // Atalhos para tabelas (colunas por índice) e para listas de cartões (atributos data-*).
  const tableListControls = (table, columns, sorts, filters, noun, pagination = 'more') => {
    if (!table?.tBodies[0]) {
      return;
    }

    const body = table.tBodies[0];
    const cell = (index) => (row) => (row.cells[index]?.querySelector('.organizer-badge, .admin-pill')?.textContent ?? row.cells[index]?.textContent ?? '').trim();
    const fields = Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, cell(index)]));
    attachListControls({
      container: body,
      anchor: table.closest('.admin-table-wrap, .organizer-panel') ?? table,
      getItems: () => Array.from(body.rows).filter((row) => !row.querySelector('td[colspan]')),
      fields,
      sorts,
      filters,
      noun,
      pagination
    });
  };

  const loadOrganizerEvents = async () => {
    try {
      const response = await requestJson('/api/events?scope=own&status=all');
      organizerEventsState.items = Array.isArray(response.events) ? response.events : [];
    } catch {
      organizerEventsState.items = [];
    } finally {
      organizerEventsState.loaded = true;
    }
  };

  const getEventStatusLabel = (status) => {
    if (status === 'hidden') {
      return 'Oculto';
    }

    if (status === 'pending') {
      return 'Pendente';
    }

    if (status === 'active') {
      return 'Ativo';
    }

    if (status === 'inactive') {
      return 'Inativo';
    }

    return 'Ativo';
  };

  const readFilesAsDataUrls = async (files) => Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  })));

  const isLikelyImageFile = (file) => {
    if (!(file instanceof File)) {
      return false;
    }

    if (typeof file.type === 'string' && file.type.startsWith('image/')) {
      return true;
    }

    return /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?|heic|heif)$/i.test(file.name ?? '');
  };

  const getAllEvents = () => {
    return serverEventsState.loaded ? [...serverEventsState.items] : [];
  };

  const getVisibleEvents = () => getAllEvents().filter((event) => normalizePublicEventStatus(event.status) === 'active');

  // Eventos que já terminaram deixam de aparecer nas listas públicas (ficam em "Arquivados" para o administrador e o organizador).
  const getUpcomingEvents = () => getVisibleEvents().filter((event) => !isPastEvent(event));

  // O evento pertence ao organizador com sessão iniciada?
  const isOwnEvent = (event, session = getSession()) => Boolean(
    session?.accountType === 'organizador'
    && event?.organizerEmail
    && String(event.organizerEmail).toLowerCase() === String(session.email ?? '').toLowerCase()
  );

  // Favoritos de visitantes (sem sessão) ficam guardados no browser.
  const localFavoritesKey = 'culturall:favorites';

  const readLocalFavorites = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(localFavoritesKey) ?? '[]');
      return Array.isArray(stored) ? stored.map(normalizeEventId) : [];
    } catch {
      return [];
    }
  };

  const writeLocalFavorites = (favoriteIds) => {
    try {
      localStorage.setItem(localFavoritesKey, JSON.stringify(favoriteIds.map(normalizeEventId)));
    } catch {
      // Sem armazenamento disponível: os favoritos duram apenas esta visita.
    }
  };

  const getFavoriteIds = () => {
    const session = getSession();
    if (session && serverFavoritesState.loaded) {
      return [...serverFavoritesState.ids];
    }

    if (!session) {
      return readLocalFavorites();
    }

    return [];
  };

  const setFavoriteIds = (favoriteIds) => {
    if (!getSession()) {
      writeLocalFavorites(favoriteIds);
      return;
    }

    serverFavoritesState.ids = favoriteIds.map(normalizeEventId);
  };

  const updateFavoritesBadge = () => {
    const count = getFavoriteIds().length;
    document.querySelectorAll('.favorites-btn').forEach((button) => {
      let badge = button.querySelector('.favorites-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'favorites-count';
        button.append(badge);
      }

      badge.textContent = count > 9 ? '9+' : String(count);
      badge.hidden = count === 0;
    });
  };

  const isFavorite = (eventId) => getFavoriteIds().includes(normalizeEventId(eventId));

  const toggleFavorite = async (eventId, source = 'direto') => {
    const session = getSession();
    if (!roleCanFavorite(session)) {
      return getFavoriteIds();
    }

    const normalizedEventId = normalizeEventId(eventId);
    const favoriteIds = getFavoriteIds();
    const updatedFavoriteIds = favoriteIds.includes(normalizedEventId)
      ? favoriteIds.filter((favoriteId) => favoriteId !== normalizedEventId)
      : [...favoriteIds, normalizedEventId];

    setFavoriteIds(updatedFavoriteIds);

    if (!session) {
      // Sem conta, o favorito fica só neste browser; o servidor só regista a interação.
      trackInteraction(eventId, favoriteIds.includes(normalizedEventId) ? 'favorito_remove' : 'favorito_add', source);
    }

    if (session) {
      try {
        const response = await requestJson('/api/favorites', {
          method: 'POST',
          body: JSON.stringify({ eventId: Number(eventId), sessionId: getTrackingSessionId(), source })
        });

        if (typeof response.favorite === 'boolean') {
          const nextFavoriteIds = response.favorite
            ? [...new Set([...favoriteIds, normalizedEventId])]
            : favoriteIds.filter((favoriteId) => favoriteId !== normalizedEventId);

          serverFavoritesState.ids = nextFavoriteIds.map(normalizeEventId);
          setFavoriteIds(nextFavoriteIds);
        }
      } catch {
        serverFavoritesState.ids = favoriteIds.map(normalizeEventId);
        setFavoriteIds(favoriteIds);
      }
    }

    updateFavoritesBadge();
    const badge = document.querySelector('.favorites-btn');
    if (badge) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }

    return updatedFavoriteIds;
  };

  const getEventDateTime = (event) => new Date(event.eventDate).getTime();

  const getDateKey = (date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  };

  const getEventDateKey = (event) => getDateKey(new Date(event.eventDate));

  const getSelectedDateKey = (value) => {
    if (!value) {
      return '';
    }

    const parsedDate = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? '' : getDateKey(parsedDate);
  };

  const compareEventsByDate = (firstEvent, secondEvent) => {
    const todayKey = getDateKey(new Date());
    const firstDateKey = getEventDateKey(firstEvent);
    const secondDateKey = getEventDateKey(secondEvent);
    const firstIsPast = firstDateKey < todayKey;
    const secondIsPast = secondDateKey < todayKey;

    if (firstIsPast !== secondIsPast) {
      return firstIsPast ? 1 : -1;
    }

    const firstTime = getEventDateTime(firstEvent);
    const secondTime = getEventDateTime(secondEvent);

    if (firstIsPast) {
      return secondTime - firstTime;
    }

    return firstTime - secondTime;
  };

  const addDaysToKey = (dateKey, daysToAdd) => {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + daysToAdd);
    return getDateKey(date);
  };

  const isSameMonth = (dateKey, referenceKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    const referenceDate = new Date(`${referenceKey}T00:00:00`);
    return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
  };

  const isSameYear = (dateKey, referenceKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    const referenceDate = new Date(`${referenceKey}T00:00:00`);
    return date.getFullYear() === referenceDate.getFullYear();
  };

  const normalizeLocation = (value) => (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const districtRegionMap = {
    Aveiro: 'centro',
    Beja: 'alentejo',
    Braga: 'norte',
    Bragança: 'norte',
    'Castelo Branco': 'centro',
    Coimbra: 'centro',
    Évora: 'alentejo',
    Faro: 'algarve',
    Guarda: 'centro',
    Leiria: 'centro',
    Lisboa: 'litoral',
    Portalegre: 'alentejo',
    Porto: 'norte',
    Santarém: 'centro',
    Setúbal: 'litoral',
    'Viana do Castelo': 'norte',
    'Vila Real': 'norte',
    Viseu: 'centro',
    Outros: 'outros'
  };

  const districtOptionList = Object.keys(districtRegionMap);

  const districtAliases = [
    { district: 'Aveiro', aliases: ['aveiro'] },
    { district: 'Beja', aliases: ['beja'] },
    { district: 'Braga', aliases: ['braga', 'guimaraes'] },
    { district: 'Bragança', aliases: ['braganca'] },
    { district: 'Castelo Branco', aliases: ['castelo branco', 'covilha'] },
    { district: 'Coimbra', aliases: ['coimbra', 'figueira da foz'] },
    { district: 'Évora', aliases: ['evora'] },
    { district: 'Faro', aliases: ['faro', 'lagos', 'tavira'] },
    { district: 'Guarda', aliases: ['guarda'] },
    { district: 'Leiria', aliases: ['leiria'] },
    { district: 'Lisboa', aliases: ['lisboa', 'loures', 'oeiras', 'alfama'] },
    { district: 'Portalegre', aliases: ['portalegre'] },
    { district: 'Porto', aliases: ['porto', 'maia', 'vila nova de gaia'] },
    { district: 'Santarém', aliases: ['santarem'] },
    { district: 'Setúbal', aliases: ['setubal', 'costa da caparica', 'almada', 'sesimbra'] },
    { district: 'Viana do Castelo', aliases: ['viana do castelo'] },
    { district: 'Vila Real', aliases: ['vila real', 'chaves'] },
    { district: 'Viseu', aliases: ['viseu'] },
    { district: 'Outros', aliases: ['funchal', 'ponta delgada', 'madeira', 'açores', 'azores'] }
  ];

  const getDistrictKey = (value) => {
    const normalizedValue = normalizeLocation(value);
    if (!normalizedValue) {
      return null;
    }

    return districtAliases.find(({ aliases }) => aliases.some((alias) => normalizedValue === alias || normalizedValue.includes(alias)))?.district ?? null;
  };

  const getEventDistrict = (event) => event.district ?? getDistrictKey(`${event.city ?? ''} ${event.location ?? ''}`) ?? 'Outros';

  const isUpcomingEvent = (event) => getEventDateTime(event) >= Date.now();

  // Um evento acabou quando passou a data de fim; sem data de fim, quando o dia do início já passou.
  const isPastEvent = (event) => {
    if (event.isRecurring) {
      return false;
    }

    const end = event.endDate ? new Date(event.endDate).getTime() : NaN;
    if (!Number.isNaN(end)) {
      return end < Date.now();
    }

    return getEventDateKey(event) < getDateKey(new Date());
  };

  const getDateBucketForDateTime = (dateTime, isRecurring = false) => {
    if (isRecurring) {
      return 'Periódicos';
    }

    const eventDateKey = getDateKey(new Date(dateTime));
    const todayKey = getDateKey(new Date());

    if (eventDateKey === todayKey) {
      return 'Hoje';
    }

    if (eventDateKey <= addDaysToKey(todayKey, 6)) {
      return 'Esta semana';
    }

    if (isSameMonth(eventDateKey, todayKey)) {
      return 'Este mês';
    }

    if (isSameYear(eventDateKey, todayKey)) {
      return 'Este ano';
    }

    return 'Este ano';
  };

  const formatRecurringLabel = (days, timeValue) => {
    const dayLabel = days.length > 0 ? days.join(', ') : 'Dias por definir';
    return `${dayLabel} às ${timeValue}`;
  };

  // Administradores e organizadores não têm favoritos (nem botão, nem página).
  const roleCanFavorite = (session = getSession()) => !session || session.accountType === 'lambda';

  const applyFavoritesVisibility = (rootDocument = document) => {
    const visible = roleCanFavorite();
    rootDocument.querySelectorAll('.favorites-btn, .mobile-bottom-nav a[href="favorites.html"]').forEach((element) => {
      element.style.display = visible ? '' : 'none';
    });
  };

  const getFavoriteAriaLabel = (eventId) => (isFavorite(eventId) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos');

  const getFavoriteDetailLabel = (eventId) => (isFavorite(eventId) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos');

  // Sino de notificações do administrador: contas de organizador e eventos à espera de aprovação.
  const ensureAdminBell = (rootDocument = document) => {
    const actions = rootDocument.querySelector('.topbar-actions');
    if (!actions || actions.querySelector('.admin-bell')) {
      return;
    }

    const bell = rootDocument.createElement('div');
    bell.className = 'admin-bell';
    bell.innerHTML = `
      <button class="admin-bell-btn" type="button" aria-label="Notificações" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z"></path><path d="M10 19a2 2 0 0 0 4 0"></path></svg>
        <span class="admin-bell-badge" hidden>0</span>
      </button>
      <div class="admin-bell-menu" role="menu" hidden></div>
    `;
    actions.prepend(bell);

    const button = bell.querySelector('.admin-bell-btn');
    const badge = bell.querySelector('.admin-bell-badge');
    const menu = bell.querySelector('.admin-bell-menu');
    const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

    const render = (data) => {
      const total = Number(data?.total ?? 0);
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? '99+' : String(total);
      button.setAttribute('aria-label', total ? `Notificações: ${total} por tratar` : 'Notificações: nada pendente');

      if (!total) {
        menu.innerHTML = '<p class="admin-bell-empty">Tudo em dia. Não há nada pendente.</p>';
        return;
      }

      const events = Array.isArray(data.events) ? data.events : [];
      const changes = Array.isArray(data.changes) ? data.changes : [];
      const organizers = Array.isArray(data.organizers) ? data.organizers : [];
      const eventLink = (item, kind) => `
        <a role="menuitem" class="admin-bell-item" href="event.html?id=${encodeURIComponent(item.id)}&src=admin">
          <strong>${kind}</strong>
          <span>${esc(item.title)}${item.organizer ? ` · ${esc(item.organizer)}` : ''}</span>
        </a>`;
      const more = (shown, total, tab) => (Number(total) > shown
        ? `<a role="menuitem" class="admin-bell-more" href="profile.html?tab=${tab}">Ver todos (${Number(total)})</a>` : '');
      menu.innerHTML = `
        <p class="admin-bell-title">Por tratar</p>
        ${events.slice(0, 4).map((item) => eventLink(item, 'Evento por aprovar')).join('')}
        ${more(Math.min(events.length, 4), data.pendingEvents, 'moderation')}
        ${changes.slice(0, 4).map((item) => eventLink(item, 'Pedido de alteração')).join('')}
        ${more(Math.min(changes.length, 4), data.pendingChanges, 'moderation')}
        ${data.pendingOrganizers ? `
          <a role="menuitem" class="admin-bell-item" href="profile.html?tab=organizers">
            <strong>${plural(Number(data.pendingOrganizers), 'conta de organizador por validar', 'contas de organizador por validar')}</strong>
            <span>${organizers.slice(0, 3).map((item) => esc(item.name || item.email)).join(' · ')}</span>
          </a>` : ''}
      `;
    };

    const refresh = async () => {
      try {
        render(await requestJson('/api/admin/notifications'));
      } catch {
        // Sem rede ou sem permissão: o sino fica como está.
      }
    };

    const setOpen = (open) => {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };

    button.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation();
      const willOpen = menu.hidden;
      setOpen(willOpen);
      if (willOpen) {
        void refresh();
      }
    });
    rootDocument.addEventListener('click', (clickEvent) => {
      if (!bell.contains(clickEvent.target)) {
        setOpen(false);
      }
    });
    rootDocument.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        setOpen(false);
      }
    });
    window.addEventListener('culturall:admin-changed', () => void refresh());
    window.setInterval(() => {
      if (!rootDocument.hidden) {
        void refresh();
      }
    }, 60000);

    menu.innerHTML = '<p class="admin-bell-empty">A carregar…</p>';
    void refresh();
  };

  const syncLoginHeaderState = (rootDocument = document) => {
    const session = getSession();
    const loginToggleBtn = rootDocument.getElementById('loginToggleBtn');
    const accountChip = rootDocument.getElementById('accountChip');

    // O sino do administrador aparece em todas as páginas com barra de topo (a do perfil tem ids próprios).
    if (session?.accountType === 'admin') {
      ensureAdminBell(rootDocument);
    }

    if (!loginToggleBtn || !accountChip) {
      return;
    }

    loginToggleBtn.hidden = false;
    loginToggleBtn.replaceChildren();
    loginToggleBtn.insertAdjacentHTML('afterbegin', session ? iconLogout : iconLogin);
    loginToggleBtn.append(document.createTextNode(session ? 'Sair' : 'Entrar'));

    if (session) {
      accountChip.hidden = false;
      accountChip.style.display = 'inline-flex';
      accountChip.textContent = `${session.name}`;
      applyFavoritesVisibility(rootDocument);
      loginToggleBtn.href = '#';
      loginToggleBtn.setAttribute('aria-label', 'Terminar sessão');
      loginToggleBtn.dataset.logged = 'true';
      return;
    }

    accountChip.hidden = true;
    accountChip.style.display = 'none';
    accountChip.textContent = '';
    applyFavoritesVisibility(rootDocument);
    loginToggleBtn.href = 'login.html';
    loginToggleBtn.setAttribute('aria-label', 'Entrar');
    loginToggleBtn.dataset.logged = 'false';
  };

  const getListingEvents = () => {
    if (pageType === 'favorites') {
      return getFavoriteIds()
        .map((favoriteId) => getUpcomingEvents().find((event) => event.id === favoriteId))
        .filter(Boolean);
    }

    return getUpcomingEvents();
  };

  const getEventById = (eventId) => getAllEvents().find((event) => normalizeEventId(event.id) === normalizeEventId(eventId)) ?? null;

  // "source" diz de onde veio a visita (lista, mapa, destaques, pesquisa, relacionados, partilha…) e alimenta as estatísticas.
  const getEventDetailUrl = (eventId, source) => `event.html?id=${encodeURIComponent(eventId)}${source ? `&src=${encodeURIComponent(source)}` : ''}`;

  const formatEventDetailDate = (event) => {
    const eventDate = new Date(event.eventDate);
    return new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(eventDate);
  };

  const buildRelatedEventCard = (event, index) => buildEventCard(event, index);

  const monthShortLabels = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  // Etiqueta de tempo: "Hoje", "Amanhã", "Daqui a 5 dias", "A decorrer", "Terminado".
  const getEventTiming = (event) => {
    const start = new Date(event.eventDate);
    const end = event.endDate ? new Date(event.endDate) : null;
    const now = Date.now();
    const timing = {
      day: String(start.getDate()).padStart(2, '0'),
      month: monthShortLabels[start.getMonth()] ?? '',
      label: '',
      tone: ''
    };

    if (Number.isNaN(start.getTime())) {
      return timing;
    }

    if (event.isRecurring) {
      return { ...timing, label: 'Periódico', tone: 'recurring' };
    }

    if (end && start.getTime() <= now && end.getTime() >= now) {
      return { ...timing, label: 'A decorrer', tone: 'live' };
    }

    const todayKey = getDateKey(new Date());
    const eventKey = getDateKey(start);
    if (eventKey < todayKey || (end && end.getTime() < now) || (!end && start.getTime() < now && eventKey !== todayKey)) {
      return { ...timing, label: 'Terminado', tone: 'past' };
    }

    if (eventKey === todayKey) {
      return { ...timing, label: 'Hoje', tone: 'soon' };
    }

    const days = Math.round((new Date(`${eventKey}T00:00:00`) - new Date(`${todayKey}T00:00:00`)) / 86400000);
    if (days === 1) {
      return { ...timing, label: 'Amanhã', tone: 'soon' };
    }

    if (days <= 7) {
      return { ...timing, label: `Daqui a ${days} dias`, tone: 'soon' };
    }

    return { ...timing, label: '', tone: '' };
  };

  const buildEventCard = (event, index = 0) => {
    const timing = getEventTiming(event);
    const isFree = event.priceType === 'Gratuito';
    return `
    <article class="event-card" style="--stagger:${Math.min(index, 8)}" tabindex="0" role="link" aria-label="Abrir evento ${esc(event.title)}" data-event-id="${esc(event.id)}" data-event-link="${esc(getEventDetailUrl(event.id))}" data-category="${esc(event.category)}" data-ts="${esc(String(new Date(event.eventDate).getTime() || ''))}" data-date="${esc(event.dateBucket)}" data-location="${esc(getEventDistrict(event))}" data-price="${esc(event.priceType)}" data-title="${esc(event.title.toLowerCase())}">
      <div class="event-media">
        <div class="event-date-badge" aria-hidden="true"><strong>${timing.day}</strong><span>${timing.month}</span></div>
        <div class="event-media-actions">
          <button class="share-btn" type="button" aria-label="Partilhar evento" data-event-id="${esc(event.id)}">
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4"></path><path d="m15.4 6.5-6.8 4"></path></svg>
          </button>
          ${roleCanFavorite() ? `<button class="favorite-btn${isFavorite(event.id) ? ' active' : ''}" type="button" aria-label="${getFavoriteAriaLabel(event.id)}" aria-pressed="${isFavorite(event.id) ? 'true' : 'false'}" data-event-id="${esc(event.id)}">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
          </button>` : ''}
          ${isOwnEvent(event) ? `<button class="edit-event-btn" type="button" aria-label="Editar evento" title="Editar evento" data-edit-event="${esc(event.id)}">
            <svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"></path><path d="m13.5 6.5 3 3"></path></svg>
          </button>` : ''}
        </div>
        ${timing.label ? `<span class="event-timing ${timing.tone}">${timing.tone === 'live' ? '<i></i>' : ''}${timing.label}</span>` : ''}
        <img src="${esc(event.image)}" alt="${esc(event.title)}" loading="lazy" />
      </div>
      <div class="event-body">
        <span class="event-pill" data-category="${esc(event.category)}">${esc(event.category)}</span>
        <h2 class="event-title">${esc(event.title)}</h2>
        <div class="meta-list">
          <div class="meta-item">${iconCalendar}<span>${esc(event.dateLabel)}${event.endDateLabel ? ' — ' + esc(event.endDateLabel) : ''}</span></div>
          <div class="meta-item">${iconLocation}<span>${esc(event.location)}</span></div>
        </div>
        <div class="price-row">
          <span class="price ${isFree ? 'free' : ''}">${isFree ? 'Gratuito' : esc(event.priceLabel)}</span>
          <span class="tagline"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>${event.views.toLocaleString('pt-PT')}</span>
        </div>
      </div>
    </article>
  `;
  };

  // Abre o evento diretamente no Google Calendar, já preenchido (título, data, local e descrição).
  const calendarWeekdayCodes = { Seg: 'MO', Ter: 'TU', Qua: 'WE', Qui: 'TH', Sex: 'FR', 'Sáb': 'SA', Dom: 'SU' };

  const openEventInCalendar = (event, source = 'direto') => {
    const toCalendarDate = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const start = new Date(event.eventDate);
    if (Number.isNaN(start.getTime())) {
      showToast('Não foi possível abrir o calendário para este evento');
      return;
    }

    const end = event.endDate && !Number.isNaN(new Date(event.endDate).getTime())
      ? new Date(event.endDate)
      : new Date(start.getTime() + 2 * 3600000);
    const detailUrl = new URL(getEventDetailUrl(event.id, 'calendario'), window.location.href).href;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${toCalendarDate(start)}/${toCalendarDate(end)}`,
      details: `${event.description ? `${event.description}\n\n` : ''}Mais informações: ${detailUrl}`,
      location: event.location ?? ''
    });

    if (event.isRecurring) {
      const days = String(event.recurringDays ?? '').split(',').map((day) => calendarWeekdayCodes[day.trim()]).filter(Boolean);
      params.set('recur', `RRULE:FREQ=WEEKLY${days.length > 0 ? `;BYDAY=${days.join(',')}` : ''}`);
    }

    // Com a opção 'noopener', window.open devolve sempre null (parecia bloqueado mesmo quando abria); por isso
    // abre-se normalmente e remove-se a ligação ao separador original logo a seguir.
    const calendarWindow = window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
    if (calendarWindow) {
      calendarWindow.opener = null;
    }
    if (!calendarWindow) {
      showToast('O browser bloqueou a abertura do calendário. Permite pop-ups para este site.');
      return;
    }

    trackInteraction(event.id, 'calendario', source);
    showToast('A abrir o Google Calendar…');
  };

  // Parágrafos: uma linha em branco separa parágrafos; quebras simples mantêm-se como quebra de linha.
  const renderDescriptionHtml = (text) => {
    const clean = String(text ?? '').replace(/\r\n?/g, '\n').trim();
    if (!clean) {
      return '<p>Descrição indisponível no momento. Este evento faz parte da seleção cultural da plataforma.</p>';
    }

    return clean
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${esc(block).replace(/\n/g, '<br />')}</p>`)
      .join('');
  };

  const renderEventDetailPage = () => {
    const detailRoot = document.getElementById('eventDetailRoot');
    if (!detailRoot) {
      return;
    }

    const url = new URL(window.location.href);
    const eventId = url.searchParams.get('id');
    const session = getSession();
    const isAdminViewer = session?.accountType === 'admin';
    const review = eventReviewState && String(eventReviewState.event?.id) === String(eventId) ? eventReviewState : null;
    const change = review?.change ?? null;
    // O organizador também consegue abrir os seus eventos que ainda não são públicos (pendentes, ocultos, agendados…) e o administrador qualquer um.
    const ownRaw = eventId && session?.accountType === 'organizador'
      ? organizerEventsState.items.find((item) => normalizeEventId(item.id) === normalizeEventId(eventId) && isOwnEvent(item, session))
      : null;
    // Pedido de alteração: o administrador abre por defeito a versão proposta; o dono abre a versão atual.
    if (!eventReviewVersion) {
      eventReviewVersion = isAdminViewer ? 'proposta' : 'atual';
    }
    const showProposed = Boolean(change?.proposed) && !change.rejectReason && eventReviewVersion === 'proposta';
    const baseEvent = eventId ? (getEventById(eventId) ?? (review ? normalizeServerEvent(review.event) : null) ?? (ownRaw ? normalizeServerEvent(ownRaw) : null)) : null;
    const event = baseEvent && showProposed ? normalizeServerEvent(change.proposed) : baseEvent;

    if (!event) {
      window.location.href = 'index.html';
      return;
    }

    const isOwner = Boolean(ownRaw) || isOwnEvent(event, session);
    const ownRecord = ownRaw ?? (isOwner ? (review?.event ?? organizerEventsState.items.find((item) => normalizeEventId(item.id) === normalizeEventId(event.id))) : null);
    const adminRecord = isAdminViewer ? (review?.event ?? null) : null;
    const adminStatus = String(adminRecord?.status ?? '');
    const adminNeedsReview = isAdminViewer && Boolean(adminRecord) && (adminStatus === 'pendente' || (Boolean(change) && !change.rejectReason));
    const changeIsPending = Boolean(change) && !change.rejectReason;
    const ownerStatus = String(ownRecord?.status ?? (isOwner ? 'publicado' : ''));
    const ownerIsLive = ['publicado', 'ativo'].includes(ownerStatus);
    let ownerView = 'organizador';
    try {
      const requestedView = url.searchParams.get('view') ?? localStorage.getItem('culturall:ownerView');
      ownerView = requestedView === 'utilizador' ? 'utilizador' : 'organizador';
    } catch {
      // Sem localStorage, abre na visão de organizador.
    }

    const knownSources = ['lista', 'mapa', 'destaques', 'pesquisa', 'relacionados', 'perfil', 'partilha', 'calendario'];
    const requestedSource = url.searchParams.get('src');
    const detailSource = knownSources.includes(requestedSource) ? requestedSource : 'direto';
    // As visitas do próprio organizador à sua página não contam para as estatísticas.
    // Eventos que já terminaram deixam de contar visitas e interações.
    const eventEnded = isPastEvent(event);
    if (!isOwner && !isAdminViewer && !eventEnded) {
      trackInteraction(event.id, 'visualizacao', detailSource);
    }

    // Eventos pagos com bilheteira passam por /api/go (regista o clique e redireciona). Os de teste (demo) vão direto.
    const ticketHref = !event.hasTicket
      ? ''
      : (isOwner || isAdminViewer || showProposed || !isTrackableEventId(event.id))
        ? event.ticketUrl
        : isTrackableEventId(event.id)
        ? `/api/go?id=${encodeURIComponent(event.id)}&s=${encodeURIComponent(getTrackingSessionId())}&src=${encodeURIComponent(detailSource)}`
        : event.ticketUrl;

    const relatedEvents = getUpcomingEvents()
      .filter((item) => item.id !== event.id)
      .filter((item) => item.category === event.category || getEventDistrict(item) === getEventDistrict(event))
      .slice(0, 3);

    const versionSwitchHtml = change?.proposed && !change.rejectReason ? `
      <div class="version-switch" role="group" aria-label="Versão do evento a mostrar">
        <button type="button" data-review-version="atual" aria-pressed="${!showProposed}">Versão atual</button>
        <button type="button" data-review-version="proposta" aria-pressed="${showProposed}">Versão proposta</button>
      </div>` : '';
    const diffHtml = change?.diff?.length ? `
      <ul class="change-diff" aria-label="O que muda">
        ${change.diff.map((item) => `<li><strong>${esc(item.label)}</strong><span class="from">${esc(String(item.from).slice(0, 160))}</span><span class="arrow" aria-hidden="true">→</span><span class="to">${esc(String(item.to).slice(0, 160))}</span></li>`).join('')}
      </ul>` : '';

    detailRoot.innerHTML = `
      <div class="event-detail-page" data-owner-view="${isOwner ? ownerView : ''}">
        <header class="topbar event-detail-topbar">
          <a class="topbar-brand" href="index.html" aria-label="Cultur'All início">
            <span>Cultur'</span><span>All</span>
          </a>

          <div class="search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
            <input id="searchInput" type="search" placeholder="Pesquisar eventos..." aria-label="Pesquisar eventos" />
          </div>

          <div class="topbar-actions">
            <a class="account-chip" id="accountChip" href="profile.html" hidden></a>
            <a class="favorites-btn" href="favorites.html" aria-label="Favoritos">
              <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
            </a>
            <a class="login-btn" id="loginToggleBtn" href="login.html">
              <svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"></path><path d="M15 12H4"></path><path d="M20 4v16"></path></svg>
              Entrar
            </a>
          </div>
        </header>

        <main class="event-detail-main">
          <section class="event-detail-back-row">
            <a class="event-detail-back-link" href="index.html">
              <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
              Voltar aos eventos
            </a>
          </section>

          ${isOwner ? `
          <section class="owner-bar" aria-label="Opções do organizador">
            <div class="owner-switch" role="group" aria-label="Escolher visão da página">
              <span class="owner-switch-thumb" aria-hidden="true"></span>
              <button type="button" data-owner-view="organizador" aria-pressed="${ownerView === 'organizador'}">Organizador</button>
              <button type="button" data-owner-view="utilizador" aria-pressed="${ownerView === 'utilizador'}">Utilizador</button>
            </div>
            <p class="owner-bar-hint" id="ownerViewHint"></p>
          </section>

          <section class="owner-panel" id="ownerPanel" aria-label="Gestão do evento">
            <div class="owner-panel-top">
              <span class="organizer-badge ${ownerStatus === 'oculto' && ownRecord?.scheduledFor ? 'scheduled' : esc(ownerStatus)}">${esc(ownRecord?.statusLabel ?? 'Publicado')}</span>
              <a class="event-detail-action primary owner-edit-btn" href="profile.html?edit=${encodeURIComponent(event.id)}">
                <svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"></path><path d="m13.5 6.5 3 3"></path></svg>
                Editar evento
              </a>
            </div>
            ${ownerStatus === 'pendente' ? `<p class="owner-note">Este evento está a aguardar aprovação dos administradores (pode demorar de 1 a 3 dias). Só depois fica visível na plataforma.</p>
              <div class="owner-request-actions"><button type="button" class="owner-cancel-btn" data-owner-cancel="cancel_request">Cancelar pedido de aprovação</button></div>` : ''}
            ${changeIsPending ? `<div class="owner-note owner-change-note">
                <p><strong>Pedido de alteração em análise</strong> (1 a 3 dias). Enquanto isso, o público continua a ver a versão atual. Se voltares a editar, este pedido é substituído.</p>
                ${versionSwitchHtml}${diffHtml}
                <div class="owner-request-actions"><button type="button" class="owner-cancel-btn" data-owner-cancel="cancel_change">Cancelar pedido de alteração</button></div>
              </div>` : ''}
            ${change?.rejectReason ? `<div class="owner-note is-danger">
                <p><strong>Alteração recusada:</strong> ${esc(change.rejectReason)} A versão atual mantém-se.</p>
                <div class="owner-request-actions"><button type="button" class="owner-cancel-btn" data-owner-cancel="cancel_change">Dispensar aviso</button></div>
              </div>` : ''}
            ${ownerStatus === 'recusado' ? `<p class="owner-note is-danger">Este evento foi recusado${ownRecord?.rejectReason ? `: ${esc(ownRecord.rejectReason)}` : '.'} Edita-o para o voltar a submeter.</p>` : ''}
            ${ownerStatus === 'oculto' ? `<p class="owner-note">Este evento está oculto${ownRecord?.scheduledFor ? ` e será publicado automaticamente em ${esc(formatApiDateLabel(ownRecord.scheduledFor))}` : ''}. Só tu o consegues ver.</p>` : ''}
            ${ownerStatus === 'inativo' ? '<p class="owner-note">Este evento está inativo e não aparece na plataforma.</p>' : ''}
            ${ownerIsLive || ownerStatus === 'oculto' || ownerStatus === 'inativo' ? `
            <dl class="owner-stats" id="ownerStats" aria-label="Estatísticas do evento">
              <div><dt>Visualizações</dt><dd data-stat="views">—</dd></div>
              <div><dt>Cliques em bilhetes</dt><dd data-stat="clicks">—</dd></div>
              <div><dt>Favoritos</dt><dd data-stat="favoritesNet">—</dd></div>
              <div><dt>Partilhas</dt><dd data-stat="shares">—</dd></div>
            </dl>` : ''}
          </section>` : ''}

          ${adminNeedsReview ? `
          <section class="owner-panel admin-review-panel" id="adminReviewPanel" aria-label="Revisão do evento">
            <div class="owner-panel-top">
              <div>
                <span class="organizer-badge ${esc(adminStatus)}">${esc(adminRecord.statusLabel ?? 'Pendente')}</span>
                <strong class="admin-review-heading">Estás a rever este evento como administrador</strong>
              </div>
              <span class="owner-bar-hint">Organizador: ${esc(adminRecord.organizer || adminRecord.organizerEmail || '')}</span>
            </div>
            ${adminStatus === 'pendente' ? '<p class="owner-note">Evento novo, a aguardar aprovação. É assim que ficará na plataforma.</p>' : ''}
            ${changeIsPending ? `<div class="owner-note owner-change-note">
                <p><strong>Pedido de alteração.</strong> O evento já está publicado. ${showProposed ? 'Estás a ver a versão proposta.' : 'Estás a ver a versão atual.'}</p>
                ${versionSwitchHtml}${diffHtml}
              </div>` : ''}
            <label class="admin-review-reason" id="adminReviewReasonWrap" hidden>
              <span>Motivo da recusa (o organizador vai vê-lo)</span>
              <textarea id="adminReviewReason" rows="2" maxlength="300" placeholder="Ex.: a descrição não corresponde ao evento."></textarea>
            </label>
            <div class="admin-review-buttons">
              ${adminStatus === 'pendente' ? `
                <button type="button" class="admin-approve-btn" data-review-action="approve">✓ Aprovar evento</button>
                <button type="button" class="admin-reject-btn" data-review-action="reject">✕ Recusar evento</button>` : ''}
              ${changeIsPending ? `
                <button type="button" class="admin-approve-btn" data-review-action="approve_change">✓ Aprovar alteração</button>
                <button type="button" class="admin-reject-btn" data-review-action="reject_change">✕ Recusar alteração</button>` : ''}
            </div>
          </section>` : ''}

          <section class="event-detail-head">
            <span class="event-pill" data-category="${esc(event.category)}">${esc(event.category)}</span>
            <h1>${esc(event.title)}</h1>
            ${(() => {
              const timing = getEventTiming(event);
              return timing.label ? `<span class="event-timing ${timing.tone}">${timing.tone === 'live' ? '<i></i>' : ''}${timing.label}</span>` : '';
            })()}
          </section>

          <section class="event-gallery" id="eventGallery" aria-label="Imagens do evento"></section>

          <section class="event-detail-content">
            <article class="event-detail-card event-detail-about">
              <h2>Sobre o Evento</h2>
              <div class="event-description">${renderDescriptionHtml(event.description)}</div>
            </article>

            <aside class="event-detail-card event-detail-info">
              <h2>Informações</h2>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Data e Hora</span>
                <strong>${formatEventDetailDate(event)}${event.endDate ? ' — ' + formatApiDateLabel(event.endDate) : ''}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Localização</span>
                <strong>${esc(event.location)}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Organizador</span>
                <strong>${esc(event.organizer || 'Organização do evento')}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Preço</span>
                <strong class="event-detail-price ${event.priceType === 'Gratuito' ? 'free' : ''}">${esc(event.priceLabel)}</strong>
              </div>

              ${eventEnded ? '<p class="event-ended-note" role="status">Este evento já terminou.</p>' : ''}
              ${ticketHref ? (eventEnded
                ? '<button class="event-detail-action primary" id="eventDetailTicketBtn" type="button" disabled aria-disabled="true">Ver Bilhetes</button>'
                : `<a class="event-detail-action primary" id="eventDetailTicketBtn" href="${esc(ticketHref)}" target="_blank" rel="noopener noreferrer">Ver Bilhetes</a>`) : ''}
              ${roleCanFavorite(session) ? `<button class="event-detail-action secondary" id="eventDetailFavoriteBtn" type="button" data-event-id="${esc(event.id)}"${eventEnded ? ' disabled aria-disabled="true"' : ''}>${getFavoriteDetailLabel(event.id)}</button>` : ''}
              <div class="event-detail-extra-actions">
                <button class="event-detail-action ghost" id="eventDetailCalendarBtn" type="button"${eventEnded ? ' disabled aria-disabled="true"' : ''}>
                  <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path><path d="M12 12v5"></path><path d="M9.5 14.5h5"></path></svg>
                  Calendário
                </button>
                <button class="event-detail-action ghost share-btn" type="button" data-event-id="${esc(event.id)}"${eventEnded ? ' disabled aria-disabled="true"' : ''}>
                  <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4"></path><path d="m15.4 6.5-6.8 4"></path></svg>
                  Partilhar
                </button>
              </div>
            </aside>
          </section>

          <section class="event-detail-related">
            <h2>Eventos Relacionados</h2>
            <div class="cards-grid event-detail-related-grid" id="relatedEventsGrid">
              ${relatedEvents.map(buildRelatedEventCard).join('')}
            </div>
          </section>
        </main>

        <nav class="mobile-bottom-nav" aria-label="Navegação inferior">
          <a class="active" href="index.html#inicio">
            <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
            Início
          </a>
          ${!roleCanFavorite(session) ? '' : `
          <a href="favorites.html">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
            Favoritos
          </a>
          `}
          <a href="profile.html">
            <svg viewBox="0 0 24 24"><path d="M4 20c1.8-4 4.9-6 8-6s6.2 2 8 6"></path><circle cx="12" cy="8" r="4"></circle></svg>
            Perfil
          </a>
        </nav>
      </div>
    `;

    if (isOwner) {
      const pageEl = detailRoot.querySelector('.event-detail-page');
      const hintEl = document.getElementById('ownerViewHint');
      const applyOwnerView = (view) => {
        pageEl.dataset.ownerView = view;
        detailRoot.querySelectorAll('[data-owner-view]').forEach((button) => {
          if (button.tagName === 'BUTTON') {
            button.setAttribute('aria-pressed', String(button.dataset.ownerView === view));
          }
        });
        if (hintEl) {
          hintEl.textContent = view === 'organizador'
            ? 'Estás a ver a página como organizador, com as tuas ferramentas de gestão.'
            : 'Estás a ver a página tal como os utilizadores a veem.';
        }
        try {
          localStorage.setItem('culturall:ownerView', view);
        } catch {
          // Preferência não guardada.
        }
      };

      detailRoot.querySelectorAll('button[data-owner-view]').forEach((button) => {
        button.addEventListener('click', () => applyOwnerView(button.dataset.ownerView));
      });
      applyOwnerView(ownerView);

      const ownerStatsEl = document.getElementById('ownerStats');
      if (ownerStatsEl && isTrackableEventId(event.id)) {
        void requestJson(`/api/analytics?eventId=${encodeURIComponent(event.id)}&granularity=year&from=2020-01-01`)
          .then((response) => {
            ownerStatsEl.querySelectorAll('[data-stat]').forEach((cell) => {
              cell.textContent = String(Number(response.totals?.[cell.dataset.stat] ?? 0));
            });
          })
          .catch(() => {
            // Mantém os traços se as estatísticas não carregarem.
          });
      }
    }

    // Alternar entre versão atual e proposta (administrador e dono).
    detailRoot.querySelectorAll('[data-review-version]').forEach((button) => {
      button.addEventListener('click', () => {
        eventReviewVersion = button.dataset.reviewVersion;
        renderEventDetailPage();
      });
    });

    detailRoot.querySelectorAll('[data-owner-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        void cancelOrganizerRequest(event.id, button.dataset.ownerCancel, () => window.location.reload());
      });
    });

    if (adminNeedsReview) {
      const reasonWrap = document.getElementById('adminReviewReasonWrap');
      const reasonInput = document.getElementById('adminReviewReason');
      let pendingReject = null;
      detailRoot.querySelectorAll('[data-review-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.reviewAction;
          const isReject = action === 'reject' || action === 'reject_change';
          // Recusar pede primeiro o motivo; só o segundo clique confirma.
          if (isReject && pendingReject !== action) {
            pendingReject = action;
            reasonWrap.hidden = false;
            reasonInput.focus();
            button.textContent = 'Confirmar recusa';
            return;
          }

          button.disabled = true;
          void requestJson('/api/admin/events', {
            method: 'PATCH',
            body: JSON.stringify({ eventId: Number(event.id), action, reason: reasonInput?.value.trim() ?? '' })
          }).then(() => {
            showToast(action.startsWith('approve') ? 'Aprovado.' : 'Recusado.');
            window.setTimeout(() => { window.location.href = 'profile.html?tab=moderation'; }, 600);
          }).catch((error) => {
            button.disabled = false;
            showToast(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
          });
        });
      });
    }

    const eventDetailFavoriteBtn = document.getElementById('eventDetailFavoriteBtn');
    if (eventDetailFavoriteBtn) {
      const updateDetailFavoriteLabel = () => {
        const isEventFavorite = isFavorite(event.id);
        eventDetailFavoriteBtn.textContent = isEventFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos';
        eventDetailFavoriteBtn.setAttribute('aria-pressed', String(isEventFavorite));
      };

      updateDetailFavoriteLabel();

      eventDetailFavoriteBtn.addEventListener('click', async () => {
        await toggleFavorite(event.id, detailSource);
        updateDetailFavoriteLabel();
      });
    }

    const eventDetailCalendarBtn = document.getElementById('eventDetailCalendarBtn');
    if (eventDetailCalendarBtn) {
      eventDetailCalendarBtn.addEventListener('click', () => openEventInCalendar(event, detailSource));
    }

    const detailExtraActions = detailRoot.querySelector('.event-detail-extra-actions');
    detailExtraActions?.querySelector('.share-btn')?.addEventListener('click', () => {
      void shareEvent(event.id, detailSource);
    });

    syncLoginHeaderState(detailRoot.ownerDocument);
    bindEventCardActions(document.getElementById('relatedEventsGrid'), { source: 'relacionados' });
    updateFavoritesBadge();
    initEventGallery(event);
  };

  /* ---------- Carrossel de imagens 16:9 do evento + lightbox ---------- */
  const openImageLightbox = (images, startIndex, title) => {
    const previouslyFocused = document.activeElement;
    let index = startIndex;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Imagem de ${title}`);
    overlay.innerHTML = `
      <button class="lightbox-close" type="button" aria-label="Fechar imagem">×</button>
      ${images.length > 1 ? `
        <button class="lightbox-nav prev" type="button" aria-label="Imagem anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></button>
        <button class="lightbox-nav next" type="button" aria-label="Imagem seguinte"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg></button>
      ` : ''}
      <figure class="lightbox-figure">
        <img class="lightbox-img" alt="" />
        ${images.length > 1 ? '<figcaption class="lightbox-count"></figcaption>' : ''}
      </figure>
    `;

    const imageElement = overlay.querySelector('.lightbox-img');
    const countElement = overlay.querySelector('.lightbox-count');
    const show = (nextIndex) => {
      index = (nextIndex + images.length) % images.length;
      imageElement.src = images[index];
      imageElement.alt = `${title} — imagem ${index + 1} de ${images.length}`;
      if (countElement) {
        countElement.textContent = `${index + 1} / ${images.length}`;
      }
    };

    const close = () => {
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 200);
      previouslyFocused instanceof HTMLElement && previouslyFocused.focus?.();
    };

    function onKeydown(keyEvent) {
      if (keyEvent.key === 'Escape') {
        close();
      } else if (keyEvent.key === 'ArrowRight' && images.length > 1) {
        show(index + 1);
      } else if (keyEvent.key === 'ArrowLeft' && images.length > 1) {
        show(index - 1);
      }
    }

    overlay.addEventListener('click', (clickEvent) => {
      const target = clickEvent.target instanceof Element ? clickEvent.target : null;
      if (target?.closest('.lightbox-nav.prev')) {
        show(index - 1);
      } else if (target?.closest('.lightbox-nav.next')) {
        show(index + 1);
      } else if (!target?.closest('.lightbox-img') && !target?.closest('.lightbox-count')) {
        close();
      }
    });

    document.addEventListener('keydown', onKeydown);
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    show(index);
    overlay.querySelector('.lightbox-close')?.focus();
    requestAnimationFrame(() => overlay.classList.add('open'));
  };

  const renderEventGallery = (event, images) => {
    const gallery = document.getElementById('eventGallery');
    if (!gallery) {
      return;
    }

    const slides = images.length > 0 ? images : [defaultEventImage];
    const buildSlide = (src, slideIndex, hidden) => `
      <button class="gallery-slide" type="button" data-gallery-index="${slideIndex}" ${hidden ? 'aria-hidden="true" tabindex="-1"' : `aria-label="Ampliar imagem ${slideIndex + 1} de ${slides.length}"`}>
        <img src="${src}" alt="${hidden ? '' : `${event.title} — imagem ${slideIndex + 1}`}" ${slideIndex === 0 && !hidden ? '' : 'loading="lazy"'} draggable="false" />
      </button>
    `;

    if (slides.length === 1) {
      gallery.classList.add('is-single');
      gallery.innerHTML = `<div class="gallery-viewport"><div class="gallery-single">${buildSlide(slides[0], 0, false)}</div></div>`;
    } else {
      // Repete o conjunto até a "metade" da faixa ser mais larga que o ecrã, para o movimento ser contínuo e sem saltos.
      const repeats = Math.max(1, Math.ceil(6 / slides.length));
      const half = Array.from({ length: repeats }, () => slides.map((src, slideIndex) => ({ src, slideIndex }))).flat();
      gallery.classList.remove('is-single');
      gallery.innerHTML = `
        <div class="gallery-viewport">
          <div class="gallery-track" style="--slides:${half.length}">
            ${half.map(({ src, slideIndex }) => buildSlide(src, slideIndex, false)).join('')}
            ${half.map(({ src, slideIndex }) => buildSlide(src, slideIndex, true)).join('')}
          </div>
        </div>
      `;
    }

    gallery.onclick = (clickEvent) => {
      const slide = clickEvent.target instanceof Element ? clickEvent.target.closest('[data-gallery-index]') : null;
      if (slide) {
        openImageLightbox(slides, Number(slide.getAttribute('data-gallery-index')) || 0, event.title);
      }
    };
  };

  const initEventGallery = (event) => {
    // Mostra já a imagem principal e completa o carrossel com as restantes imagens do evento.
    renderEventGallery(event, event.image && event.image !== defaultEventImage ? [event.image] : []);

    // Versão proposta: as imagens novas ainda não estão guardadas, vêm no próprio pedido.
    if (Array.isArray(event.images) && event.images.length > 0) {
      renderEventGallery(event, event.images);
      return;
    }

    const numericId = Number(event.id);
    if (event.isDemo || !Number.isFinite(numericId)) {
      return;
    }

    void requestJson(`/api/event-images?eventId=${encodeURIComponent(numericId)}`)
      .then((response) => {
        if (Array.isArray(response.images) && response.images.length > 1) {
          renderEventGallery(event, response.images);
        }
      })
      .catch(() => {
        // Mantém a imagem principal se a galeria não puder ser carregada.
      });
  };

  const showToast = (message) => {
    let toast = document.getElementById('culturallToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'culturallToast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }

    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2600);
  };

  const buildEventShareText = (event) => [
    event.title,
    event.dateLabel,
    event.location,
    `Ver mais: ${new URL(getEventDetailUrl(event.id, 'partilha'), window.location.href).href}`
  ].join('\n');

  const shareEvent = async (eventId, source = 'direto') => {
    const eventToShare = getAllEvents().find((item) => item.id === eventId);
    if (!eventToShare) {
      return;
    }

    const shareData = {
      title: eventToShare.title,
      text: buildEventShareText(eventToShare),
      url: new URL(getEventDetailUrl(eventToShare.id, 'partilha'), window.location.href).href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        trackInteraction(eventToShare.id, 'partilha', source);
        return;
      } catch {
        // Partilha cancelada: não conta.
        return;
      }
    }

    const shareText = `${shareData.title}\n${shareData.text}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        trackInteraction(eventToShare.id, 'partilha', source);
        return;
      }
    } catch {
      // Fallback abaixo.
    }

    const fallbackField = document.createElement('textarea');
    fallbackField.value = shareText;
    fallbackField.setAttribute('readonly', 'true');
    fallbackField.style.position = 'absolute';
    fallbackField.style.left = '-9999px';
    document.body.appendChild(fallbackField);
    fallbackField.select();
    document.execCommand('copy');
    fallbackField.remove();
    trackInteraction(eventToShare.id, 'partilha', source);
  };

  const bindEventCardActions = (container, options = {}) => {
    if (!container) {
      return;
    }

    // Origem da visita, para as estatísticas: pesquisa ativa, página de favoritos, ou lista normal.
    const resolveCardSource = () => {
      if (options.source) {
        return options.source;
      }

      if (document.getElementById('searchInput')?.value.trim()) {
        return 'pesquisa';
      }

      return pageType === 'favorites' ? 'perfil' : 'lista';
    };

    const withCardSource = (link) => `${link}${link.includes('?') ? '&' : '?'}src=${encodeURIComponent(resolveCardSource())}`;

    container.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const favoriteButton = target.closest('.favorite-btn');
      if (favoriteButton) {
        const eventId = favoriteButton.dataset.eventId;
        if (!eventId) {
          return;
        }

        void (async () => {
          await toggleFavorite(eventId, resolveCardSource());
          const isEventFavorite = isFavorite(eventId);
          favoriteButton.classList.toggle('active', isEventFavorite);
          favoriteButton.setAttribute('aria-label', getFavoriteAriaLabel(eventId));
          favoriteButton.setAttribute('aria-pressed', String(isEventFavorite));
          if (typeof options.onFavoriteToggled === 'function') {
            options.onFavoriteToggled(eventId);
          }
          if (typeof options.onRender === 'function') {
            options.onRender();
          }
        })();
        return;
      }

      const editButton = target.closest('[data-edit-event]');
      if (editButton) {
        window.location.href = `profile.html?edit=${encodeURIComponent(editButton.dataset.editEvent)}`;
        return;
      }

      const shareButton = target.closest('.share-btn');
      if (shareButton) {
        const eventId = shareButton.dataset.eventId;
        if (eventId) {
          void shareEvent(eventId, resolveCardSource());
        }
        return;
      }

      if (target.closest('button, a')) {
        return;
      }

      const card = target.closest('.event-card[data-event-link]');
      const link = card?.dataset.eventLink;
      if (!link) {
        return;
      }

      window.location.href = withCardSource(link);
    });

    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('button, a')) {
        return;
      }

      const card = target.closest('.event-card[data-event-link]');
      const link = card?.dataset.eventLink;
      if (!link) {
        return;
      }

      event.preventDefault();
      window.location.href = withCardSource(link);
    });
  };

  // Ponte para enhancements.js (destaques, mapa, chips e observatório).
  const publishBridge = () => {
    window.CulturAll = {
      getEvents: () => getVisibleEvents(),
      getUpcomingEvents,
      getEventDetailUrl,
      getEventDistrict,
      getEventTiming,
      isPastEvent,
      isFavorite,
      canFavorite: () => roleCanFavorite(),
      toggleFavorite,
      trackInteraction,
      updateFavoritesBadge,
      showToast
    };
    document.dispatchEvent(new CustomEvent('culturall:events-ready'));
  };

  const renderListingPage = () => {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) {
      return;
    }

    const session = getSession();
    if (pageType === 'favorites' && !roleCanFavorite(session)) {
      window.location.replace('index.html');
      return;
    }

    if (pageType === 'favorites' && session && !serverFavoritesState.loaded) {
      void loadServerFavorites();
    }

    bindEventCardActions(cardsGrid, { onRender: () => rerenderListingPage?.() });

    // Favoritos: ordenar por nome/data e filtrar por categoria.
    if (pageType === 'favorites') {
      attachListControls({
        container: cardsGrid,
        anchor: cardsGrid,
        getItems: () => Array.from(cardsGrid.querySelectorAll(':scope > .event-card:not(.skeleton-card)')),
        fields: { title: (card) => card.dataset.title ?? '', category: (card) => card.dataset.category ?? '', date: (card) => card.dataset.ts ?? '' },
        sorts: [
          { value: 'title-asc', label: 'Nome (A–Z)', key: 'title', type: 'text', dir: 1 },
          { value: 'title-desc', label: 'Nome (Z–A)', key: 'title', type: 'text', dir: -1 },
          { value: 'date-asc', label: 'Data (mais próxima)', key: 'date', type: 'date', dir: 1 },
          { value: 'date-desc', label: 'Data (mais distante)', key: 'date', type: 'date', dir: -1 }
        ],
        filters: [{ id: 'category', label: 'Categoria', key: 'category' }],
        noun: 'favoritos'
      });
    }

    const emptyState = document.getElementById('emptyState');
    const resultsCount = document.getElementById('resultsCount');
    const resultsLabel = document.getElementById('resultsLabel');
    const sectionTitle = document.getElementById('sectionTitle');
    const viewChip = document.getElementById('viewChip');
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const dateFilter = document.getElementById('dateFilter');
    const dateCustomControls = document.getElementById('dateCustomControls');
    const datePickerInput = document.getElementById('datePickerInput');
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');
    const applyDateBtn = document.getElementById('applyDateBtn');
    const sortFilter = document.getElementById('sortFilter');
    const locationFilter = document.getElementById('locationFilter');
    const priceFilter = document.getElementById('priceFilter');
    const ownEventsGroup = document.getElementById('ownEventsGroup');
    const ownEventsToggle = document.getElementById('ownEventsToggle');
    const loginToggleBtn = document.getElementById('loginToggleBtn');
    const accountChip = document.getElementById('accountChip');
    const filtersShell = document.getElementById('filtersShell');
    const filtersToggleBtn = document.getElementById('filtersToggleBtn');
    const filtersBackdrop = document.getElementById('filtersBackdrop');
    const page = pageConfig[pageType] ?? pageConfig.home;
    let appliedSpecificDate = '';
    let activeDateFilter = 'Todos';
    let dateControlsOpen = false;
    const sortChipLabels = {
      views: 'Ordenado por visualizações',
      proximity: 'Ordenado por proximidade',
      date: 'Ordenado por data'
    };

    if (sectionTitle) {
      sectionTitle.textContent = page.title;
    }

    if (resultsLabel) {
      resultsLabel.textContent = pageType === 'home' ? 'eventos encontrados' : pageType === 'events' ? 'eventos disponíveis' : 'favoritos encontrados';
    }

    if (viewChip) {
      viewChip.textContent = page.chip;
    }

    const getUserLocation = () => (getSession()?.location ?? '').trim().toLowerCase();

    const getProximityScore = (event, userLocation) => {
      if (!userLocation) {
        return Number.POSITIVE_INFINITY;
      }

      const userDistrict = getDistrictKey(userLocation);
      if (!userDistrict) {
        return Number.POSITIVE_INFINITY;
      }

      const eventDistrict = getEventDistrict(event);
      if (eventDistrict === userDistrict) {
        return 0;
      }

      const eventRegion = districtRegionMap[eventDistrict] ?? null;
      const userRegion = districtRegionMap[userDistrict] ?? null;
      if (eventRegion && userRegion && eventRegion === userRegion) {
        return 1;
      }

      return 2;
    };

    const getCurrentSort = () => sortFilter?.value ?? 'date';

    const updateSortChip = () => {
      if (!viewChip) {
        return;
      }

      const currentSort = getCurrentSort();
      if (currentSort === 'proximity' && !getUserLocation()) {
        viewChip.textContent = 'Ordenado por proximidade (defina a localização no perfil)';
        return;
      }

      viewChip.textContent = sortChipLabels[currentSort] ?? sortChipLabels.views;
    };

    const renderLoginState = () => {
      const session = getSession();
      if (!loginToggleBtn || !accountChip) {
        return;
      }

      loginToggleBtn.hidden = false;
      loginToggleBtn.replaceChildren();
      loginToggleBtn.insertAdjacentHTML('afterbegin', session ? iconLogout : iconLogin);
      loginToggleBtn.append(document.createTextNode(session ? 'Sair' : 'Entrar'));

      if (session) {
        accountChip.hidden = false;
        accountChip.style.display = 'inline-flex';
        accountChip.textContent = `${session.name}`;
        applyFavoritesVisibility();
        loginToggleBtn.href = '#';
        loginToggleBtn.setAttribute('aria-label', 'Terminar sessão');
        loginToggleBtn.dataset.logged = 'true';
        return;
      }

      accountChip.hidden = true;
      accountChip.style.display = 'none';
      accountChip.textContent = '';
      applyFavoritesVisibility();
      loginToggleBtn.href = 'login.html';
      loginToggleBtn.setAttribute('aria-label', 'Entrar');
      loginToggleBtn.dataset.logged = 'false';
    };

    const updateDateControls = () => {
      if (!dateCustomControls || !dateFilter) {
        return;
      }

      const shouldShow = dateFilter.value === 'Escolher data' && dateControlsOpen;
      dateCustomControls.hidden = !shouldShow;
      dateCustomControls.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    };

    const openDateControls = () => {
      if (!dateFilter || dateFilter.value !== 'Escolher data') {
        return;
      }

      dateControlsOpen = true;
      updateDateControls();
    };

    const closeDateControls = () => {
      dateControlsOpen = false;
      updateDateControls();
    };

    const matchesDateFilter = (event, selectedDate) => {
      if (selectedDate === 'Todos') {
        return true;
      }

      const eventDateKey = getEventDateKey(event);
      const todayKey = getDateKey(new Date());

      if (selectedDate === 'Hoje') {
        return eventDateKey === todayKey;
      }

      if (selectedDate === 'Periódicos') {
        return Boolean(event.isRecurring);
      }

      if (selectedDate === 'Esta semana') {
        return eventDateKey >= todayKey && eventDateKey <= addDaysToKey(todayKey, 6);
      }

      if (selectedDate === 'Este mês') {
        return isSameMonth(eventDateKey, todayKey);
      }

      if (selectedDate === 'Este ano') {
        return isSameYear(eventDateKey, todayKey);
      }

      if (selectedDate === 'Escolher data') {
        return !appliedSpecificDate || eventDateKey === appliedSpecificDate;
      }

      return true;
    };

    const LISTING_PAGE_SIZE = 12;
    let visibleCount = LISTING_PAGE_SIZE;
    let lastListSignature = '';
    let loadMoreWrap = null;

    const renderCards = () => {
      const query = searchInput.value.trim().toLowerCase();
      const selectedCategory = categoryFilter?.value ?? 'Todos';
      const selectedDate = activeDateFilter;
      const selectedLocation = locationFilter?.value ?? 'Todos';
      const selectedPrice = priceFilter?.value ?? 'Todos';
      const ownOnly = Boolean(ownEventsToggle?.checked);
      const currentSort = getCurrentSort();
      const userLocation = getUserLocation();

      const sourceEvents = getListingEvents();
      const filtered = sourceEvents.filter((event) => {
        const matchesQuery = !query || [event.title, event.category, event.location, event.dateLabel, event.priceLabel].join(' ').toLowerCase().includes(query);
        const matchesCategory = selectedCategory === 'Todos' || event.category === selectedCategory;
        const matchesDate = matchesDateFilter(event, selectedDate);
        const matchesLocation = selectedLocation === 'Todos' || getEventDistrict(event) === selectedLocation;
        const matchesPrice = selectedPrice === 'Todos' || event.priceType === selectedPrice;
        const matchesOwner = !ownOnly || isOwnEvent(event);
        return matchesQuery && matchesCategory && matchesDate && matchesLocation && matchesPrice && matchesOwner;
      }).sort((firstEvent, secondEvent) => {
        if (currentSort === 'date') {
          return compareEventsByDate(firstEvent, secondEvent);
        }

        if (currentSort === 'proximity') {
          const firstScore = getProximityScore(firstEvent, userLocation);
          const secondScore = getProximityScore(secondEvent, userLocation);
          if (firstScore !== secondScore) {
            return firstScore - secondScore;
          }

          return secondEvent.views - firstEvent.views;
        }

        return secondEvent.views - firstEvent.views;
      });

      const upcomingEvents = filtered;

      resultsCount.textContent = upcomingEvents.length;
      if (resultsLabel && pageType === 'home') {
        const total = upcomingEvents.length;
        resultsLabel.textContent = total === 1 ? 'evento encontrado' : 'eventos encontrados';
      }
      // Só desenha um bloco de cartões de cada vez (os filtros e o mapa continuam a usar a lista completa).
      const paging = pageType !== 'favorites';
      const signature = [query, selectedCategory, selectedDate, selectedLocation, selectedPrice, ownOnly, currentSort].join('|');
      if (signature !== lastListSignature) {
        lastListSignature = signature;
        visibleCount = LISTING_PAGE_SIZE;
      }

      const shownUpcoming = paging ? upcomingEvents.slice(0, visibleCount) : upcomingEvents;
      cardsGrid.innerHTML = shownUpcoming.map(buildEventCard).join('');

      const remainingCards = upcomingEvents.length - shownUpcoming.length;
      if (paging) {
        if (!loadMoreWrap) {
          loadMoreWrap = document.createElement('div');
          loadMoreWrap.className = 'load-more-wrap';
          loadMoreWrap.innerHTML = '<button type="button" class="load-more-btn" data-load-more></button>';
          cardsGrid.after(loadMoreWrap);
          loadMoreWrap.addEventListener('click', (clickEvent) => {
            if (clickEvent.target instanceof Element && clickEvent.target.closest('[data-load-more]')) {
              visibleCount += LISTING_PAGE_SIZE;
              renderCards();
            }
          });
        }

        loadMoreWrap.hidden = remainingCards <= 0;
        loadMoreWrap.firstElementChild.textContent = `Ver mais eventos (${remainingCards} ${remainingCards === 1 ? 'restante' : 'restantes'})`;
      }

      if (emptyState) {
        emptyState.hidden = upcomingEvents.length > 0;
        emptyState.innerHTML = `
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path><path d="m10 13 4 4"></path><path d="m14 13-4 4"></path></svg>
          <strong>${page.empty}</strong>
          ${pageType === 'favorites'
            ? '<span>Toca no coração de um evento para o guardares aqui.</span><a class="empty-state-btn" href="index.html#eventos">Explorar eventos</a>'
            : '<span>Experimenta alargar a data ou escolher outra categoria.</span><button class="empty-state-btn" type="button" data-reset-filters>Limpar filtros</button>'}
        `;
      }

      updateFavoritesBadge();
      document.dispatchEvent(new CustomEvent('culturall:cards-rendered', {
        detail: { events: upcomingEvents }
      }));
    };

    rerenderListingPage = renderCards;

    // Organizador com sessão: caixa para ver só os eventos publicados por si (a preferência fica guardada neste browser).
    if (ownEventsGroup && ownEventsToggle && session?.accountType === 'organizador') {
      ownEventsGroup.hidden = false;
      try {
        ownEventsToggle.checked = localStorage.getItem('culturall:ownOnly') === '1';
      } catch {
        // Sem localStorage, começa desligado.
      }

      ownEventsToggle.addEventListener('change', () => {
        try {
          localStorage.setItem('culturall:ownOnly', ownEventsToggle.checked ? '1' : '0');
        } catch {
          // Preferência não guardada.
        }
      });
    }

    [searchInput, categoryFilter, dateFilter, locationFilter, priceFilter, ownEventsToggle].forEach((element) => {
      if (!element) {
        return;
      }

      element.addEventListener('input', renderCards);
      element.addEventListener('change', renderCards);
    });

    if (sortFilter) {
      sortFilter.addEventListener('change', () => {
        updateSortChip();
        renderCards();
      });
    }

    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        if (dateFilter.value === 'Escolher data') {
          openDateControls();
          return;
        }

        activeDateFilter = dateFilter.value;
        dateControlsOpen = false;
        updateDateControls();

        appliedSpecificDate = '';
        if (datePickerInput) {
          datePickerInput.value = '';
        }

        renderCards();
      });

      dateFilter.addEventListener('focus', () => {
        if (dateFilter.value === 'Escolher data' && !dateControlsOpen) {
          openDateControls();
        }
      });

      dateFilter.addEventListener('click', () => {
        if (dateFilter.value === 'Escolher data' && !dateControlsOpen) {
          requestAnimationFrame(openDateControls);
        }
      });

      updateDateControls();
    }

    const openDatePicker = () => {
      if (!datePickerInput) {
        return;
      }

      if (typeof datePickerInput.showPicker === 'function') {
        datePickerInput.showPicker();
        return;
      }

      datePickerInput.click();
    };

    if (openDatePickerBtn) {
      openDatePickerBtn.addEventListener('click', openDatePicker);
    }

    if (applyDateBtn) {
      applyDateBtn.addEventListener('click', () => {
        if (!datePickerInput?.value) {
          closeDateControls();
          return;
        }

        activeDateFilter = 'Escolher data';
        appliedSpecificDate = getSelectedDateKey(datePickerInput.value);
        closeDateControls();
        renderCards();
      });
    }

    updateSortChip();

    document.addEventListener('click', (event) => {
      if (!dateControlsOpen || dateFilter?.value !== 'Escolher data') {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('.date-filter-group')) {
        return;
      }

      closeDateControls();
    });

    if (filtersToggleBtn && filtersShell && filtersBackdrop) {
      const closeFilters = () => {
        filtersShell.classList.remove('open');
        filtersToggleBtn.setAttribute('aria-expanded', 'false');
        filtersBackdrop.hidden = true;
      };

      const openFilters = () => {
        filtersShell.classList.add('open');
        filtersToggleBtn.setAttribute('aria-expanded', 'true');
        filtersBackdrop.hidden = false;
      };

      filtersToggleBtn.addEventListener('click', () => {
        if (filtersShell.classList.contains('open')) {
          closeFilters();
          return;
        }

        openFilters();
      });

      filtersBackdrop.addEventListener('click', closeFilters);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeFilters();
        }
      });

      [categoryFilter, dateFilter, locationFilter, priceFilter, sortFilter].forEach((element) => {
        if (!element) {
          return;
        }

        element.addEventListener('change', () => {
          if (window.innerWidth <= 900) {
            closeFilters();
          }
        });
      });
    }

    if (loginToggleBtn) {
      loginToggleBtn.addEventListener('click', (event) => {
        const session = getSession();
        if (!session) {
          return;
        }

        event.preventDefault();
        syncLogoutRequest();
        clearSession();
        renderLoginState();
      });
    }

    renderLoginState();
    renderCards();
  };

  const renderLoginPage = () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
      return;
    }

    const loginPanel = document.getElementById('loginPanel');
    const authMessage = document.getElementById('authMessage');
    const registerPanel = document.getElementById('registerPanel');
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');
    const backHomeBtn = document.getElementById('backHomeBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const registerNameInput = document.getElementById('registerNameInput');
    const registerEmailInput = document.getElementById('registerEmailInput');
    const registerPasswordInput = document.getElementById('registerPasswordInput');
    const registerConfirmPasswordInput = document.getElementById('registerConfirmPasswordInput');
    const registerAccountTypeInputs = Array.from(document.querySelectorAll('input[name="registerAccountType"]'));

    const updateAuthMessage = (message) => {
      if (authMessage) {
        authMessage.textContent = message;
      }
    };

    const updateRegisterMessage = (message) => {
      if (registerMessage) {
        registerMessage.textContent = message;
      }
    };

    const authStage = document.getElementById('authStage');

    // O painel vermelho desliza para um dos lados; o lado tapado fica inerte (sem foco nem leitor de ecrã).
    const setAuthMode = (mode, { focus = true } = {}) => {
      const isRegisterMode = mode === 'register';

      if (authStage) {
        authStage.dataset.mode = isRegisterMode ? 'register' : 'login';
      }

      if (loginPanel) {
        loginPanel.inert = isRegisterMode;
      }

      if (registerPanel) {
        registerPanel.inert = !isRegisterMode;
      }

      updateAuthMessage('');
      updateRegisterMessage('');

      if (focus) {
        // Espera pelo fim da animação para o foco não fazer a página saltar.
        window.setTimeout(() => (isRegisterMode ? registerNameInput : emailInput)?.focus({ preventScroll: true }), 350);
      }
    };

    const getSelectedRegisterAccountType = () => registerAccountTypeInputs.find((input) => input.checked)?.value ?? 'lambda';

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      try {
        const response = await requestJson('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (!response?.user) {
          throw new Error('O servidor não devolveu a sessão do utilizador.');
        }

        setSession(response.user);
        serverFavoritesState.loaded = false;

        try {
          await loadServerFavorites();
        } catch {
          // Mantém a navegação funcional mesmo se os favoritos não carregarem de imediato.
        }

        updateAuthMessage(`Sessão iniciada como ${response.user.roleLabel}.`);
        window.location.href = 'profile.html';
        return;
      } catch (error) {
        const remoteStatus = error instanceof Error ? error.status : undefined;
        const remoteMessage = error instanceof Error ? error.message : '';

        if (remoteStatus === 401 || remoteStatus === 403) {
          updateAuthMessage(remoteMessage || 'Não foi possível iniciar sessão.');
          return;
        }

        updateAuthMessage(remoteMessage || 'Não foi possível ligar ao servidor de autenticação.');
      }
    });

    if (backHomeBtn) {
      backHomeBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }

    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', () => setAuthMode('login'));
    }

    if (showRegisterBtn) {
      showRegisterBtn.addEventListener('click', () => setAuthMode('register'));
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = registerNameInput?.value.trim() ?? '';
        const email = registerEmailInput?.value.trim().toLowerCase() ?? '';
        const password = registerPasswordInput?.value ?? '';
        const confirmPassword = registerConfirmPasswordInput?.value ?? '';
        const accountType = getSelectedRegisterAccountType();

        try {
          const response = await requestJson('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, confirmPassword, accountType })
          });

          if (response?.pending) {
            const pendingMessage = response.message ?? 'Conta criada e pendente de aprovação.';
            setAuthMode('login');
            updateAuthMessage(pendingMessage);
            updateRegisterMessage('');
            registerForm.reset();
            registerAccountTypeInputs.forEach((input) => {
              input.checked = input.value === 'lambda';
            });
            return;
          }

          if (!response?.user) {
            throw new Error('O servidor não devolveu a nova conta.');
          }

          setSession(response.user);
          serverFavoritesState.loaded = false;

          try {
            await loadServerFavorites();
          } catch {
            // Mantém a navegação funcional mesmo se a API de favoritos falhar.
          }

          updateRegisterMessage(response.message ?? 'Conta criada com sucesso.');
          updateAuthMessage('');
          window.location.href = 'profile.html';
        } catch (error) {
          updateRegisterMessage(error instanceof Error ? error.message : 'Não foi possível criar a conta.');
        }
      });
    }

    setAuthMode('login');
  };

  // Observatório Cultural: gráficos e indicadores que antes viviam em stats.html e agora são o Dashboard do perfil.
  const buildObservatoryMarkup = () => `
    <div class="observatory">
      <section class="stats-intro">
        <h2>Como se distribui a cultura em Portugal?</h2>
        <p>Onde acontecem os eventos, de que tipo são, em que meses se concentram e o que mais interessa ao público.</p>
        <p class="stats-note" id="statsNote"></p>
      </section>

      <section class="kpi-grid" aria-label="Indicadores principais">
        <article class="kpi"><span>Eventos</span><strong id="kpiTotal">—</strong><small>na plataforma</small></article>
        <article class="kpi"><span>Próximos</span><strong id="kpiUpcoming">—</strong><small>ainda por acontecer</small></article>
        <article class="kpi"><span>Distritos</span><strong id="kpiDistricts">—</strong><small>com pelo menos um evento</small></article>
        <article class="kpi"><span>Gratuitos</span><strong id="kpiFree">—</strong><small>do total de eventos</small></article>
        <article class="kpi"><span>Visualizações</span><strong id="kpiViews">—</strong><small>soma de todos os eventos</small></article>
      </section>

      <section class="stats-grid">
        <article class="stats-card">
          <header>
            <div><h2>Eventos por distrito</h2><p>Onde há mais oferta cultural?</p></div>
            <button class="table-toggle" type="button" data-toggle-table aria-pressed="false">Ver tabela</button>
          </header>
          <div class="chart-box tall"><canvas id="chartDistrict" role="img" aria-label="Gráfico de barras: número de eventos por distrito"></canvas></div>
          <table class="stats-table" id="tableDistrict"><thead><tr><th>Distrito</th><th>Eventos</th></tr></thead><tbody></tbody></table>
        </article>

        <article class="stats-card">
          <header>
            <div><h2>Eventos por categoria</h2><p>Que tipos de evento dominam a agenda?</p></div>
            <button class="table-toggle" type="button" data-toggle-table aria-pressed="false">Ver tabela</button>
          </header>
          <div class="chart-box tall"><canvas id="chartCategory" role="img" aria-label="Gráfico de barras: número de eventos por categoria"></canvas></div>
          <table class="stats-table" id="tableCategory"><thead><tr><th>Categoria</th><th>Eventos</th></tr></thead><tbody></tbody></table>
        </article>

        <article class="stats-card">
          <header>
            <div><h2>Eventos por mês</h2><p>Em que altura do ano se concentra a agenda?</p></div>
            <button class="table-toggle" type="button" data-toggle-table aria-pressed="false">Ver tabela</button>
          </header>
          <div class="chart-box"><canvas id="chartMonth" role="img" aria-label="Gráfico de barras: número de eventos por mês do ano atual"></canvas></div>
          <table class="stats-table" id="tableMonth"><thead><tr><th>Mês</th><th>Eventos</th></tr></thead><tbody></tbody></table>
        </article>

        <article class="stats-card">
          <header>
            <div><h2>Eventos mais vistos</h2><p>O que desperta mais interesse no público?</p></div>
            <button class="table-toggle" type="button" data-toggle-table aria-pressed="false">Ver tabela</button>
          </header>
          <div class="chart-box"><canvas id="chartViews" role="img" aria-label="Gráfico de barras: eventos com mais visualizações"></canvas></div>
          <table class="stats-table" id="tableViews"><thead><tr><th>Evento</th><th>Visualizações</th></tr></thead><tbody></tbody></table>
        </article>
      </section>
    </div>
  `;

  const mountObservatory = (root) => {
    if (!root) {
      return;
    }

    if (window.CulturAllObservatory) {
      window.CulturAllObservatory.mount(root);
      return;
    }

    document.addEventListener('culturall:enhancements-ready', () => window.CulturAllObservatory?.mount(root), { once: true });
  };

  const mountAnalytics = (root, scope) => {
    if (!root) {
      return;
    }

    if (window.CulturAllAnalytics) {
      window.CulturAllAnalytics.mount(root, { scope });
      return;
    }

    document.addEventListener('culturall:enhancements-ready', () => window.CulturAllAnalytics?.mount(root, { scope }), { once: true });
  };

  const renderProfilePage = () => {
    const profileRoot = document.getElementById('profileRoot');
    if (!profileRoot) {
      return;
    }

    const session = getSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    const profileAccountChip = document.getElementById('profileAccountChip');
    const profileLogoutBtn = document.getElementById('profileLogoutBtn');
    const profileMobileNav = document.getElementById('profileMobileNav');
    applyFavoritesVisibility();

    if (profileAccountChip) {
      profileAccountChip.textContent = session.name;
      profileAccountChip.hidden = false;
      profileAccountChip.style.display = 'inline-flex';
    }

    if (profileLogoutBtn) {
      profileLogoutBtn.addEventListener('click', () => {
        syncLogoutRequest();
        clearSession();
        if (profileAccountChip) {
          profileAccountChip.hidden = true;
          profileAccountChip.style.display = 'none';
          profileAccountChip.textContent = '';
        }
        window.location.href = 'index.html';
      });
    }

    if (session.accountType === 'lambda') {
      const initials = session.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase();

      profileRoot.innerHTML = `
        <div class="page">
          <div class="profile-hero">
            <h1>A Minha Área</h1>
            <p>Gerir os seus favoritos e histórico</p>
          </div>

          <div class="profile-tabs" role="tablist" aria-label="Separadores da área pessoal">
            <button class="profile-tab-btn active" type="button" data-profile-tab="wallet">Carteira</button>
            <button class="profile-tab-btn" type="button" data-profile-tab="history">Histórico</button>
          </div>

          <div class="profile-panels">
            <section class="profile-panel active" data-profile-pane="wallet" id="carteira">
              <h2 class="profile-section-title">Eventos Futuros</h2>
              <p class="profile-section-subtitle"><span id="savedEventsCount">1</span> evento nos favoritos</p>

              <div class="profile-grid">
                <div class="saved-event-wrap" id="savedEventCard"></div>

                <div class="profile-summary-card">
                  <div class="profile-summary-row">
                    <div class="profile-avatar" id="profileAvatar">${esc(initials)}</div>
                    <div>
                      <strong id="profileName">${esc(session.name)}</strong>
                      <p id="profileRole">${esc(session.roleLabel)}</p>
                      <p id="profileEmail">${esc(session.email)}</p>
                    </div>
                  </div>

                  <div class="profile-location-box">
                    <label for="profileLocationInput">Localização para proximidade</label>
                    <div class="profile-location-row">
                      <input id="profileLocationInput" type="text" placeholder="Ex.: Lisboa" value="${esc(session.location ?? '')}" />
                      <button id="profileLocationSaveBtn" type="button">Guardar</button>
                    </div>
                  </div>

                  <div class="profile-stat-grid">
                    <div class="profile-stat">
                      <strong id="profileFavoritesStat">0</strong>
                      <span>favoritos guardados</span>
                    </div>
                    <div class="profile-stat">
                      <strong id="profileUpcomingStat">0</strong>
                      <span>eventos futuros</span>
                    </div>
                    <div class="profile-stat">
                      <strong id="profileAvailableStat">0</strong>
                      <span>eventos disponíveis</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="profile-panel" data-profile-pane="history" id="historico">
              <h2 class="profile-section-title">Histórico</h2>
              <p class="profile-section-subtitle">Últimas interações na conta</p>

              <div class="profile-history-list" id="historyList"></div>
            </section>
          </div>
        </div>
      `;

      profileMobileNav.innerHTML = `
        <a href="index.html">
          <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
          Início
        </a>
        ${!roleCanFavorite(session) ? '' : `
        <a href="favorites.html">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
          Favoritos
        </a>
        `}
        <a class="active" href="profile.html">
          <svg viewBox="0 0 24 24"><path d="M4 20c1.8-4 4.9-6 8-6s6.2 2 8 6"></path><circle cx="12" cy="8" r="4"></circle></svg>
          Perfil
        </a>
      `;

      const savedEventCard = document.getElementById('savedEventCard');
      const historyList = document.getElementById('historyList');
      const profileLocationInput = document.getElementById('profileLocationInput');
      const profileLocationSaveBtn = document.getElementById('profileLocationSaveBtn');
      const profileFavoritesStat = document.getElementById('profileFavoritesStat');
      const profileUpcomingStat = document.getElementById('profileUpcomingStat');
      const profileAvailableStat = document.getElementById('profileAvailableStat');
      const tabButtons = Array.from(document.querySelectorAll('[data-profile-tab]'));
      const panes = Array.from(document.querySelectorAll('[data-profile-pane]'));

      const renderSavedEvents = () => {
        if (!savedEventCard) {
          return;
        }

        const favoriteIds = getFavoriteIds();
        const favoriteEvents = favoriteIds
          .map((favoriteId) => getVisibleEvents().find((event) => event.id === favoriteId))
          .filter(Boolean);

        if (savedEventCard) {
          savedEventCard.innerHTML = favoriteEvents.length > 0
            ? buildEventCard(favoriteEvents[0])
            : '<p style="text-align: center; color: #666; padding: 20px;">Nenhum evento nos favoritos neste momento</p>';
          bindEventCardActions(savedEventCard);
        }

        const savedEventsCount = document.getElementById('savedEventsCount');
        if (savedEventsCount) {
          savedEventsCount.textContent = String(favoriteEvents.length);
        }

        if (profileFavoritesStat) {
          profileFavoritesStat.textContent = String(favoriteEvents.length);
        }

        if (profileUpcomingStat) {
          profileUpcomingStat.textContent = String(getVisibleEvents().filter((event) => isUpcomingEvent(event)).length);
        }

        if (profileAvailableStat) {
          profileAvailableStat.textContent = String(getVisibleEvents().length);
        }
      };

      // Clear placeholder elements
      if (savedEventCard) {
        savedEventCard.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum evento nos favoritos neste momento</p>';
      }

      if (historyList) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhuma atividade registada</p>';
      }

      renderSavedEvents();

      if (!serverFavoritesState.loaded) {
        void loadServerFavorites().then(renderSavedEvents);
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          tabButtons.forEach((item) => item.classList.toggle('active', item === button));
          panes.forEach((pane) => pane.classList.toggle('active', pane.dataset.profilePane === button.dataset.profileTab));
        });
      });

      if (profileLocationSaveBtn && profileLocationInput) {
        profileLocationSaveBtn.addEventListener('click', () => {
          const updatedLocation = profileLocationInput.value.trim();
          void (async () => {
            try {
              const response = await requestJson('/api/me', {
                method: 'PATCH',
                body: JSON.stringify({ location: updatedLocation })
              });

              if (response?.user) {
                setSession(response.user);
              }

              profileLocationSaveBtn.textContent = 'Guardado';
              window.setTimeout(() => {
                profileLocationSaveBtn.textContent = 'Guardar';
              }, 1200);
            } catch (error) {
              profileLocationSaveBtn.textContent = error instanceof Error ? error.message : 'Não foi possível guardar';
              window.setTimeout(() => {
                profileLocationSaveBtn.textContent = 'Guardar';
              }, 1600);
            }
          })();
        });
      }

      return;
    }

    if (session.accountType === 'admin') {
      const adminDashboard = {
        stats: [],
        users: [],
        pendingEvents: [],
        publishedEvents: [],
        organizers: []
      };

      let adminUsers = adminDashboard.users.map((user) => ({
        ...user,
        isActive: String(user.status ?? '').toLowerCase() === 'ativo'
      }));

      const normalizeOrganizerStatus = (status) => {
        const normalizedStatus = String(status ?? '').toLowerCase();
        if (normalizedStatus === 'aprovado' || normalizedStatus === 'approved') {
          return 'aprovado';
        }

        if (normalizedStatus === 'pendente' || normalizedStatus === 'pending') {
          return 'pendente';
        }

        return 'suspenso';
      };

      const getOrganizerStatusLabel = (status) => {
        const normalizedStatus = normalizeOrganizerStatus(status);
        if (normalizedStatus === 'aprovado') {
          return 'Aprovado';
        }

        if (normalizedStatus === 'pendente') {
          return 'Pendente';
        }

        return 'Suspenso';
      };

      const formatAdminDate = (dateValue) => {
        if (!dateValue) {
          return '—';
        }

        const parsedDate = new Date(dateValue);
        if (Number.isNaN(parsedDate.getTime())) {
          return '—';
        }

        return new Intl.DateTimeFormat('pt-PT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(parsedDate);
      };

      const normalizeUserActiveState = (value) => {
        if (typeof value === 'boolean') {
          return value;
        }

        if (typeof value === 'number') {
          return value === 1;
        }

        const normalizedValue = String(value ?? '').trim().toLowerCase();
        return ['1', 'true', 'ativo', 'active'].includes(normalizedValue);
      };

      const getUserStatusLabel = (isActive) => (isActive ? 'Ativo' : 'Inativo');

      const isAdminUserActive = (user) => normalizeUserActiveState(
        user?.isActive ?? user?.estado ?? user?.status
      );

      const mapAdminUser = (user) => {
        const isActive = isAdminUserActive(user);
        return {
          name: user.name,
          email: user.email,
          type: user.type ?? 'registado',
          registered: user.registered ?? formatAdminDate(user.registeredAt),
          events: user.events ?? user.favoriteCount ?? 0,
          isActive,
          status: getUserStatusLabel(isActive)
        };
      };

      const mapAdminOrganizer = (organizer) => {
        const statusCode = normalizeOrganizerStatus(organizer.status);
        return {
          name: organizer.name,
          email: organizer.email,
          type: organizer.type ?? '',
          council: organizer.council ?? '',
          hasTicketing: organizer.hasTicketing ?? '',
          interest: organizer.interest ?? '',
          registered: organizer.registered ?? formatAdminDate(organizer.registeredAt),
          created: organizer.created ?? organizer.eventCount ?? 0,
          statusCode,
          status: getOrganizerStatusLabel(statusCode),
          action: statusCode === 'aprovado' ? 'Suspender' : 'Aprovar'
        };
      };

      let adminOrganizers = adminDashboard.organizers.map(mapAdminOrganizer);

      const loadAdminUsers = async () => {
        try {
          const response = await requestJson('/api/admin/users');
          if (Array.isArray(response.users)) {
            adminUsers = response.users.map(mapAdminUser);
            renderAdminUsersTable();
          }
        } catch (error) {
          const tableBody = profileRoot.querySelector('[data-admin-pane="users"] tbody');
          if (tableBody) {
            tableBody.innerHTML = `
              <tr>
                <td colspan="6" class="admin-table-empty">
                  ${esc(error instanceof Error && error.message
                    ? error.message
                    : 'Não foi possível carregar os utilizadores.')}
                </td>
              </tr>
            `;
          }
        }
      };

      const loadAdminOrganizers = async () => {
        try {
          const response = await requestJson('/api/admin/organizers');
          if (Array.isArray(response.organizers)) {
            adminOrganizers = response.organizers.map((organizer) => mapAdminOrganizer({
              name: organizer.name,
              email: organizer.email,
              registeredAt: organizer.registeredAt,
              eventCount: organizer.eventCount,
              status: organizer.status,
              type: organizer.type,
              council: organizer.council,
              hasTicketing: organizer.hasTicketing,
              interest: organizer.interest
            }));
            renderAdminOrganizersTable();
          }
        } catch (error) {
          const tableBody = profileRoot.querySelector('[data-admin-pane="organizers"] tbody');
          if (tableBody) {
            tableBody.innerHTML = `
              <tr>
                <td colspan="5" class="admin-table-empty">
                  ${esc(error instanceof Error && error.message
                    ? error.message
                    : 'Não foi possível carregar os organizadores.')}
                </td>
              </tr>
            `;
          }
        }
      };

      const adminUserProfileModal = document.createElement('div');
      adminUserProfileModal.className = 'admin-modal';
      adminUserProfileModal.hidden = true;
      adminUserProfileModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-modal-close></div>
        <section class="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="adminUserModalTitle">
          <button class="admin-modal-x" type="button" data-admin-modal-close aria-label="Fechar">×</button>
          <h2 id="adminUserModalTitle">Perfil do Utilizador</h2>
          <div class="admin-user-profile">
            <div class="admin-user-avatar" id="adminUserAvatar"></div>
            <div class="admin-user-profile-info">
              <div><span>Nome</span><strong id="adminUserName"></strong></div>
              <div><span>Email</span><strong id="adminUserEmail"></strong></div>
              <div><span>Data de Registo</span><strong id="adminUserRegistered"></strong></div>
              <div><span>Eventos Participados</span><strong id="adminUserEvents"></strong></div>
              <div><span>Estado</span><strong id="adminUserStatus"></strong></div>
            </div>
          </div>
          <button class="admin-modal-close-btn" type="button" data-admin-modal-close>Fechar</button>
        </section>
      `;

      const adminOrganizerProfileModal = document.createElement('div');
      adminOrganizerProfileModal.className = 'admin-modal';
      adminOrganizerProfileModal.hidden = true;
      adminOrganizerProfileModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-organizer-close></div>
        <section class="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="adminOrganizerModalTitle">
          <button class="admin-modal-x" type="button" data-admin-organizer-close aria-label="Fechar">×</button>
          <h2 id="adminOrganizerModalTitle">Perfil do Organizador</h2>
          <div class="admin-user-profile">
            <div class="admin-user-avatar" id="adminOrganizerAvatar"></div>
            <div class="admin-user-profile-info">
              <div><span>Nome</span><strong id="adminOrganizerName"></strong></div>
              <div><span>Email</span><strong id="adminOrganizerEmail"></strong></div>
              <div><span>Data de Registo</span><strong id="adminOrganizerRegistered"></strong></div>
              <div><span>Eventos Criados</span><strong id="adminOrganizerCreated"></strong></div>
              <div><span>Tipo de entidade</span><strong id="adminOrganizerType"></strong></div>
              <div><span>Concelho</span><strong id="adminOrganizerCouncil"></strong></div>
              <div><span>Bilheteira própria</span><strong id="adminOrganizerTicketing"></strong></div>
              <div><span>Interesse em bilheteira integrada</span><strong id="adminOrganizerInterest"></strong></div>
              <div><span>Estado</span><strong id="adminOrganizerStatus"></strong></div>
            </div>
          </div>
          <button class="admin-modal-close-btn" type="button" data-admin-organizer-close>Fechar</button>
        </section>
      `;

      const adminOrganizerActionModal = document.createElement('div');
      adminOrganizerActionModal.className = 'admin-modal';
      adminOrganizerActionModal.hidden = true;
      adminOrganizerActionModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-organizer-action-close></div>
        <section class="admin-modal-card confirm" role="dialog" aria-modal="true" aria-labelledby="adminOrganizerActionModalTitle">
          <button class="admin-modal-x" type="button" data-admin-organizer-action-close aria-label="Fechar">×</button>
          <h2 id="adminOrganizerActionModalTitle">Gerir organizador?</h2>
          <p id="adminOrganizerActionModalText"></p>
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-admin-organizer-action-close>Cancelar</button>
            <button class="admin-modal-primary danger" type="button" id="adminOrganizerActionConfirmBtn">Confirmar</button>
          </div>
        </section>
      `;

      const adminDeactivateModal = document.createElement('div');
      adminDeactivateModal.className = 'admin-modal';
      adminDeactivateModal.hidden = true;
      adminDeactivateModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-confirm-close></div>
        <section class="admin-modal-card confirm" role="dialog" aria-modal="true" aria-labelledby="adminDeactivateModalTitle">
          <button class="admin-modal-x" type="button" data-admin-confirm-close aria-label="Fechar">×</button>
          <h2 id="adminDeactivateModalTitle">Inativar conta?</h2>
          <p id="adminDeactivateModalText"></p>
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-admin-confirm-close>Cancelar</button>
            <button class="admin-modal-primary danger" type="button" id="adminDeactivateConfirmBtn">Sim, inativar</button>
          </div>
        </section>
      `;

      const adminEventActionModal = document.createElement('div');
      adminEventActionModal.className = 'admin-modal';
      adminEventActionModal.hidden = true;
      adminEventActionModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-event-close></div>
        <section class="admin-modal-card confirm" role="dialog" aria-modal="true" aria-labelledby="adminEventActionModalTitle">
          <button class="admin-modal-x" type="button" data-admin-event-close aria-label="Fechar">×</button>
          <h2 id="adminEventActionModalTitle">Gerir evento?</h2>
          <p id="adminEventActionModalText"></p>
          <label class="admin-modal-reason" id="adminEventActionReasonWrap" hidden>
            <span>Motivo (o organizador vai vê-lo)</span>
            <textarea id="adminEventActionReason" rows="3" maxlength="300" placeholder="Ex.: a descrição não corresponde ao evento."></textarea>
          </label>
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-admin-event-close>Cancelar</button>
            <button class="admin-modal-primary danger" type="button" id="adminEventActionConfirmBtn">Confirmar</button>
          </div>
        </section>
      `;

      const adminDeleteModal = document.createElement('div');
      adminDeleteModal.className = 'admin-modal';
      adminDeleteModal.hidden = true;
      adminDeleteModal.innerHTML = `
        <div class="admin-modal-backdrop" data-admin-delete-close></div>
        <section class="admin-modal-card confirm" role="dialog" aria-modal="true" aria-labelledby="adminDeleteModalTitle">
          <button class="admin-modal-x" type="button" data-admin-delete-close aria-label="Fechar">×</button>
          <h2 id="adminDeleteModalTitle">Eliminar?</h2>
          <p id="adminDeleteModalText"></p>
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-admin-delete-close>Cancelar</button>
            <button class="admin-modal-primary danger" type="button" id="adminDeleteConfirmBtn">Sim, eliminar</button>
          </div>
        </section>
      `;

      profileRoot.innerHTML = `
        <div class="page admin-page">
          <div class="admin-hero">
            <div>
              <h1>Painel de Administração</h1>
              <p>Gestão completa da plataforma Cultur'All</p>
            </div>
          </div>

          <div class="admin-tabs-shell">
            <label class="admin-tab-select-wrap" for="adminTabSelect">
              <span>Secção</span>
              <select id="adminTabSelect" class="admin-tab-select" aria-label="Selecionar secção da administração">
                <option value="dashboard">Dashboard</option>
                <option value="users">Utilizadores</option>
                <option value="moderation">Moderação de Eventos</option>
                <option value="organizers">Organizadores</option>
              </select>
            </label>

            <div class="admin-tabs" role="tablist" aria-label="Separadores da administração">
              <button class="admin-tab-btn active" type="button" data-admin-tab="dashboard">Dashboard</button>
              <button class="admin-tab-btn" type="button" data-admin-tab="users">Utilizadores</button>
              <button class="admin-tab-btn" type="button" data-admin-tab="moderation">Moderação de Eventos</button>
              <button class="admin-tab-btn" type="button" data-admin-tab="organizers">Organizadores</button>
            </div>
          </div>

          <div class="admin-panels">
            <section class="admin-panel active" data-admin-pane="dashboard">
              <div data-analytics></div>
              <h2 class="analytics-subhead">Oferta cultural na plataforma</h2>
              <div data-observatory>${buildObservatoryMarkup()}</div>
            </section>

            <section class="admin-panel" data-admin-pane="users">
              <div class="admin-section-card">
                <h2>Todos os Utilizadores</h2>
                <div class="admin-table-wrap">
                  <table class="admin-table">
                    <thead>
                      <tr><th>Nome</th><th>Email</th><th>Data de Registo</th><th>Eventos</th><th>Estado</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                      ${adminUsers.map((user) => `
                        <tr>
                          <td>${user.name}</td>
                          <td>${user.email}</td>
                          <td>${user.registered}</td>
                          <td>${user.events}</td>
                          <td><span class="admin-pill ${user.status === 'Ativo' ? 'success' : 'danger'}">${user.status}</span></td>
                          <td>
                            <div class="admin-actions-group">
                              <button type="button" class="admin-icon-btn" aria-label="Ver utilizador" data-admin-user-view="${user.email}">
                                <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                              </button>
                              <button type="button" class="admin-icon-btn" aria-label="Inativar utilizador" data-admin-user-deactivate="${user.email}">
                                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section class="admin-panel" data-admin-pane="moderation">
              <div class="admin-section-card">
                <h2>Eventos Pendentes de Aprovação</h2>
                <div class="admin-review-list" data-admin-pending-events></div>
              </div>

              <div class="admin-section-card" data-admin-changes-card hidden>
                <h2>Pedidos de Alteração</h2>
                <div class="admin-review-list" data-admin-change-requests></div>
              </div>

              <div class="admin-section-card">
                <h2>Eventos Publicados</h2>
                <div class="admin-table-wrap">
                  <table class="admin-table">
                    <thead>
                      <tr><th>Título</th><th>Categoria</th><th>Data</th><th>Organizador</th><th>Estado</th><th>Ações</th></tr>
                    </thead>
                    <tbody data-admin-published-events></tbody>
                  </table>
                </div>
              </div>
            </section>

            <section class="admin-panel" data-admin-pane="organizers">
              <div class="admin-section-card">
                <h2>Organizadores Registados</h2>
                <div class="admin-table-wrap">
                  <table class="admin-table">
                    <thead>
                      <tr><th>Nome</th><th>Email</th><th>Data de Registo</th><th>Eventos Criados</th><th>Estado</th><th>Ações</th></tr>
                    </thead>
                    <tbody data-admin-organizers></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>
      `;

      profileRoot.appendChild(adminUserProfileModal);
      profileRoot.appendChild(adminOrganizerProfileModal);
      profileRoot.appendChild(adminOrganizerActionModal);
      profileRoot.appendChild(adminDeactivateModal);
      profileRoot.appendChild(adminEventActionModal);
      profileRoot.appendChild(adminDeleteModal);
      mountObservatory(profileRoot.querySelector('[data-observatory]'));
      mountAnalytics(profileRoot.querySelector('[data-analytics]'), 'admin');

      profileMobileNav.innerHTML = `
        <a href="index.html">
          <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
          Início
        </a>
        <a class="active" href="profile.html">
          <svg viewBox="0 0 24 24"><path d="M4 20c1.8-4 4.9-6 8-6s6.2 2 8 6"></path><circle cx="12" cy="8" r="4"></circle></svg>
          Perfil
        </a>
      `;

      const tabButtons = Array.from(document.querySelectorAll('[data-admin-tab]'));
      const panes = Array.from(document.querySelectorAll('[data-admin-pane]'));
      const adminTabSelect = document.getElementById('adminTabSelect');
      const adminUserAvatar = document.getElementById('adminUserAvatar');
      const adminUserName = document.getElementById('adminUserName');
      const adminUserEmail = document.getElementById('adminUserEmail');
      const adminUserRegistered = document.getElementById('adminUserRegistered');
      const adminUserEvents = document.getElementById('adminUserEvents');
      const adminUserStatus = document.getElementById('adminUserStatus');
      const adminDeactivateModalTitle = document.getElementById('adminDeactivateModalTitle');
      const adminDeactivateModalText = document.getElementById('adminDeactivateModalText');
      const adminDeactivateConfirmBtn = document.getElementById('adminDeactivateConfirmBtn');
      let selectedAdminUserEmail = '';
      let selectedAdminUserAction = 'deactivate';

      const getAdminUserByEmail = (email) => adminUsers.find((user) => user.email === email) ?? null;

      const closeAdminModal = (modalElement) => {
        if (!modalElement) {
          return;
        }

        modalElement.hidden = true;
        document.body.style.overflow = '';
      };

      const openAdminModal = (modalElement) => {
        if (!modalElement) {
          return;
        }

        modalElement.hidden = false;
        document.body.style.overflow = 'hidden';
      };

      // Contas de administrador (e a própria conta) não podem ser eliminadas a partir daqui.
      const canDeleteAdminUser = (user) => user.type !== 'administrador'
        && String(user.email ?? '').toLowerCase() !== String(session.email ?? '').toLowerCase();

      const renderAdminUsersTable = () => {
        const tableBody = profileRoot.querySelector('[data-admin-pane="users"] tbody');
        if (!tableBody) {
          return;
        }

        tableBody.innerHTML = adminUsers.map((user) => {
          const isActive = isAdminUserActive(user);
          const userAction = isActive
            ? {
                action: 'deactivate',
                ariaLabel: 'Inativar utilizador',
                icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></svg>',
              }
            : {
                action: 'activate',
                ariaLabel: 'Ativar utilizador',
                icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path></svg>',
              };

          return `
          <tr>
            <td>${esc(user.name)}</td>
            <td>${esc(user.email)}</td>
            <td>${esc(user.registered)}</td>
            <td>${esc(user.events)}</td>
            <td><span class="admin-pill ${isActive ? 'success' : 'danger'}">${getUserStatusLabel(isActive)}</span></td>
            <td>
              <div class="admin-actions-group">
                <button type="button" class="admin-icon-btn" aria-label="Ver utilizador" data-admin-user-view="${esc(user.email)}">
                  <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button type="button" class="admin-icon-btn" aria-label="${userAction.ariaLabel}" data-admin-user-action="${userAction.action}" data-admin-user-email="${esc(user.email)}">
                  ${userAction.icon}
                </button>
                ${canDeleteAdminUser(user) ? `<button type="button" class="admin-icon-btn danger" aria-label="Eliminar utilizador" data-admin-delete-kind="user" data-admin-delete-email="${esc(user.email)}">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                </button>` : ''}
              </div>
            </td>
          </tr>
        `;
        }).join('');
      };

      const adminEventActionModalTitle = adminEventActionModal.querySelector('#adminEventActionModalTitle');
      const adminEventActionModalText = adminEventActionModal.querySelector('#adminEventActionModalText');
      const adminEventActionConfirmBtn = adminEventActionModal.querySelector('#adminEventActionConfirmBtn');
      const adminEventActionReasonWrap = adminEventActionModal.querySelector('#adminEventActionReasonWrap');
      const adminEventActionReason = adminEventActionModal.querySelector('#adminEventActionReason');
      const adminPendingEventsContainer = profileRoot.querySelector('[data-admin-pending-events]');
      const adminPublishedEventsTableBody = profileRoot.querySelector('[data-admin-published-events]');
      const adminOrganizerAvatar = adminOrganizerProfileModal.querySelector('#adminOrganizerAvatar');
      const adminOrganizerName = adminOrganizerProfileModal.querySelector('#adminOrganizerName');
      const adminOrganizerEmail = adminOrganizerProfileModal.querySelector('#adminOrganizerEmail');
      const adminOrganizerRegistered = adminOrganizerProfileModal.querySelector('#adminOrganizerRegistered');
      const adminOrganizerCreated = adminOrganizerProfileModal.querySelector('#adminOrganizerCreated');
      const adminOrganizerType = adminOrganizerProfileModal.querySelector('#adminOrganizerType');
      const adminOrganizerCouncil = adminOrganizerProfileModal.querySelector('#adminOrganizerCouncil');
      const adminOrganizerTicketing = adminOrganizerProfileModal.querySelector('#adminOrganizerTicketing');
      const adminOrganizerInterest = adminOrganizerProfileModal.querySelector('#adminOrganizerInterest');
      const adminOrganizerStatus = adminOrganizerProfileModal.querySelector('#adminOrganizerStatus');
      const adminOrganizerActionModalTitle = adminOrganizerActionModal.querySelector('#adminOrganizerActionModalTitle');
      const adminOrganizerActionModalText = adminOrganizerActionModal.querySelector('#adminOrganizerActionModalText');
      const adminOrganizerActionConfirmBtn = adminOrganizerActionModal.querySelector('#adminOrganizerActionConfirmBtn');
      const adminOrganizersTableBody = profileRoot.querySelector('[data-admin-organizers]');
      let selectedAdminOrganizerEmail = '';
      let selectedAdminOrganizerAction = 'suspend';
      let selectedAdminEventId = '';
      let selectedAdminEventAction = 'approve';

      const getAdminEventById = (eventId) => adminEventsState.items.find((event) => String(event.id) === String(eventId)) ?? null;
      const getAdminOrganizerByEmail = (email) => adminOrganizers.find((organizer) => organizer.email === email) ?? null;

      // Eventos terminados saem das listas de revisão; na lista de eventos aparecem como "Inativo" (sem reativação).
      const getAdminPendingEvents = () => adminEventsState.items.filter((event) => normalizeAdminEventStatus(event.status) === 'pending' && !isPastEvent(event));

      const getAdminPublishedEvents = () => adminEventsState.items.filter((event) => {
        const status = normalizeAdminEventStatus(event.status);
        return isPastEvent(event) ? ['active', 'hidden', 'pending'].includes(status) : ['active', 'hidden'].includes(status);
      });

      const renderAdminModerationLists = () => {
        const eventDataAttrs = (event) => `data-title="${esc(event.title)}" data-category="${esc(event.category)}" data-organizer="${esc(event.organizerName ?? event.organizerEmail ?? '')}" data-date="${esc(String(new Date(event.startDate ?? event.eventDate ?? 0).getTime() || ''))}" data-submitted="${esc(String(new Date(event.submittedAt || 0).getTime() || ''))}"`;

        if (adminPendingEventsContainer) {
          const pendingEvents = getAdminPendingEvents();
          adminPendingEventsContainer.innerHTML = pendingEvents.length > 0
            ? pendingEvents.map((event) => `
                <article class="admin-review-item" ${eventDataAttrs(event)}>
                  <div>
                    <strong>${esc(event.title)}</strong>
                    <p>Categoria: ${esc(event.category)}</p>
                    <p>Data do evento: ${esc(event.dateLabel ?? event.date ?? 'A definir')}${event.endDateLabel ? ' — ' + esc(event.endDateLabel) : ''}</p>
                    <p>Organizador: ${esc(event.organizerName ?? event.organizerEmail ?? 'Organizador')}</p>
                    <p>Submetido em: ${esc(event.submittedAt && !Number.isNaN(new Date(event.submittedAt).getTime()) ? new Date(event.submittedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : 'Pendente')}</p>
                  </div>
                  <div class="admin-review-actions">
                    <a class="admin-view-btn" href="event.html?id=${encodeURIComponent(event.id)}&src=admin">Ver página</a>
                    <button type="button" class="admin-approve-btn" data-admin-event-action="approve" data-admin-event-id="${event.id}">✓ Aprovar</button>
                    <button type="button" class="admin-reject-btn" data-admin-event-action="reject" data-admin-event-id="${event.id}">✕ Recusar</button>
                  </div>
                </article>
              `).join('')
            : '<div class="admin-empty-state">Não existem eventos pendentes de aprovação.</div>';
        }

        const changeRequests = adminEventsState.items.filter((event) => event.hasPendingChange && !isPastEvent(event));
        const changesCard = profileRoot.querySelector('[data-admin-changes-card]');
        const changesContainer = profileRoot.querySelector('[data-admin-change-requests]');
        if (changesCard && changesContainer) {
          changesCard.hidden = changeRequests.length === 0;
          changesContainer.innerHTML = changeRequests.map((event) => `
            <article class="admin-review-item" ${eventDataAttrs(event)}>
              <div>
                <strong>${esc(event.title)}</strong>
                <p>Evento já publicado: o organizador pediu alterações. A versão atual mantém-se até decidires.</p>
                <p>Categoria: ${esc(event.category)}</p>
                <p>Organizador: ${esc(event.organizerName ?? event.organizerEmail ?? 'Organizador')}</p>
              </div>
              <div class="admin-review-actions">
                <a class="admin-view-btn" href="event.html?id=${encodeURIComponent(event.id)}&src=admin">Ver alterações</a>
                <button type="button" class="admin-approve-btn" data-admin-event-action="approve_change" data-admin-event-id="${event.id}">✓ Aprovar</button>
                <button type="button" class="admin-reject-btn" data-admin-event-action="reject_change" data-admin-event-id="${event.id}">✕ Recusar</button>
              </div>
            </article>
          `).join('');
        }


        if (adminPublishedEventsTableBody) {
          const publishedEvents = getAdminPublishedEvents();
          adminPublishedEventsTableBody.innerHTML = publishedEvents.length > 0
            ? publishedEvents.map((event) => {
                const ended = isPastEvent(event);
                const status = ended ? 'inactive' : normalizeAdminEventStatus(event.status);
                const toggleAction = status === 'hidden' ? 'show' : 'hide';
                const toggleLabel = status === 'hidden' ? 'Mostrar evento' : 'Ocultar evento';
                const toggleIcon = status === 'hidden'
                  ? '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
                  : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M8.2 8.2C5.1 9.8 3 12 3 12s4 7 9 7c1.7 0 3.2-.4 4.6-1.1"></path><path d="M14.1 5.1C15.2 5 16 5 16 5c5 0 9 7 9 7a17.2 17.2 0 0 1-3.5 4.1"></path></svg>';

                return `
                  <tr>
                    <td>${esc(event.title)}</td>
                    <td>${esc(event.category)}</td>
                    <td>${esc(event.dateLabel ?? event.date ?? 'A definir')}${event.endDateLabel ? ' — ' + esc(event.endDateLabel) : ''}</td>
                    <td>${esc(event.organizerName ?? event.organizerEmail ?? 'Organizador')}</td>
                    <td><span class="admin-pill ${status === 'active' ? 'success' : status === 'inactive' ? 'danger' : 'warning'}">${normalizeAdminEventStatusLabel(status)}</span></td>
                    <td>
                      <div class="admin-actions-group">
                        <a class="admin-icon-btn" aria-label="Ver página do evento" href="event.html?id=${encodeURIComponent(event.id)}&src=admin"><svg viewBox="0 0 24 24"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path></svg></a>
                        ${ended ? '' : `<button type="button" class="admin-icon-btn" aria-label="${toggleLabel}" data-admin-event-action="${toggleAction}" data-admin-event-id="${event.id}">${toggleIcon}</button>`}
                        <button type="button" class="admin-icon-btn danger" aria-label="Eliminar evento" data-admin-event-action="delete" data-admin-event-id="${event.id}"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')
            : '<tr><td colspan="6"><div class="admin-empty-state">Não existem eventos publicados para gerir.</div></td></tr>';
        }
      };

      const renderAdminOrganizersTable = () => {
        if (!adminOrganizersTableBody) {
          return;
        }

        adminOrganizersTableBody.innerHTML = adminOrganizers.map((organizer) => {
          const isActive = organizer.statusCode === 'aprovado';
          const organizerAction = isActive
            ? {
                action: 'suspend',
                ariaLabel: 'Suspender organizador',
                icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></svg>',
              }
            : {
                action: 'activate',
                ariaLabel: 'Ativar organizador',
                icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path></svg>',
              };

          return `
            <tr>
              <td>${esc(organizer.name)}</td>
              <td>${esc(organizer.email)}</td>
              <td>${esc(organizer.registered)}</td>
              <td>${esc(organizer.created)}</td>
              <td><span class="admin-pill ${isActive ? 'success' : organizer.statusCode === 'pendente' ? 'warning' : 'danger'}">${esc(organizer.status)}</span></td>
              <td>
                <div class="admin-actions-group">
                  <button type="button" class="admin-icon-btn" aria-label="Ver organizador" data-admin-organizer-view="${esc(organizer.email)}">
                    <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                  <button type="button" class="admin-icon-btn" aria-label="${organizerAction.ariaLabel}" data-admin-organizer-action="${organizerAction.action}" data-admin-organizer-email="${esc(organizer.email)}">${organizerAction.icon}</button>
                  <button type="button" class="admin-icon-btn danger" aria-label="Eliminar organizador" data-admin-delete-kind="organizer" data-admin-delete-email="${esc(organizer.email)}"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      };

      const openAdminEventAction = (eventId, action) => {
        const event = getAdminEventById(eventId);
        if (!event || !adminEventActionModalTitle || !adminEventActionModalText || !adminEventActionConfirmBtn) {
          return;
        }

        selectedAdminEventId = eventId;
        selectedAdminEventAction = action;
        if (adminEventActionReasonWrap) {
          adminEventActionReasonWrap.hidden = !['reject', 'reject_change'].includes(action);
          if (adminEventActionReason) {
            adminEventActionReason.value = '';
          }
        }

        if (action === 'approve_change') {
          adminEventActionModalTitle.textContent = 'Aprovar alteração?';
          adminEventActionModalText.textContent = `As alterações pedidas ao evento ${event.title} passam a ser públicas.`;
          adminEventActionConfirmBtn.textContent = 'Sim, aprovar alteração';
        } else if (action === 'reject_change') {
          adminEventActionModalTitle.textContent = 'Recusar alteração?';
          adminEventActionModalText.textContent = `O evento ${event.title} mantém a versão atual e o organizador é informado do motivo.`;
          adminEventActionConfirmBtn.textContent = 'Sim, recusar alteração';
        } else if (action === 'approve') {
          adminEventActionModalTitle.textContent = 'Aprovar evento?';
          adminEventActionModalText.textContent = `Pretendes aprovar o evento ${event.title} para que fique visível na home?`;
          adminEventActionConfirmBtn.textContent = 'Sim, aprovar';
        } else if (action === 'reject') {
          adminEventActionModalTitle.textContent = 'Recusar evento?';
          adminEventActionModalText.textContent = `Pretendes recusar o evento ${event.title}? O organizador vê o motivo e pode corrigi-lo e voltar a submeter.`;
          adminEventActionConfirmBtn.textContent = 'Sim, recusar';
        } else if (action === 'hide') {
          adminEventActionModalTitle.textContent = 'Ocultar evento?';
          adminEventActionModalText.textContent = `Pretendes ocultar o evento ${event.title} da plataforma?`;
          adminEventActionConfirmBtn.textContent = 'Sim, ocultar';
        } else if (action === 'show') {
          adminEventActionModalTitle.textContent = 'Mostrar evento?';
          adminEventActionModalText.textContent = `Pretendes voltar a mostrar o evento ${event.title} na plataforma?`;
          adminEventActionConfirmBtn.textContent = 'Sim, mostrar';
        } else {
          adminEventActionModalTitle.textContent = 'Eliminar evento?';
          adminEventActionModalText.textContent = `Pretendes eliminar definitivamente o evento ${event.title} da plataforma?`;
          adminEventActionConfirmBtn.textContent = 'Sim, eliminar';
        }

        openAdminModal(adminEventActionModal);
      };

      const openAdminOrganizerProfile = (organizerEmail) => {
        const organizer = getAdminOrganizerByEmail(organizerEmail);
        if (!organizer || !adminOrganizerAvatar || !adminOrganizerName || !adminOrganizerEmail || !adminOrganizerRegistered || !adminOrganizerCreated || !adminOrganizerStatus) {
          return;
        }

        adminOrganizerAvatar.textContent = organizer.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
        adminOrganizerName.textContent = organizer.name;
        adminOrganizerEmail.textContent = organizer.email;
        adminOrganizerRegistered.textContent = organizer.registered;
        adminOrganizerCreated.textContent = String(organizer.created);
        adminOrganizerStatus.textContent = organizer.status;
        const notProvided = 'Não indicado';
        if (adminOrganizerType) adminOrganizerType.textContent = organizerTypeLabels[organizer.type] ?? notProvided;
        if (adminOrganizerCouncil) adminOrganizerCouncil.textContent = organizer.council || notProvided;
        if (adminOrganizerTicketing) adminOrganizerTicketing.textContent = yesNoLabels[organizer.hasTicketing] ?? notProvided;
        if (adminOrganizerInterest) adminOrganizerInterest.textContent = interestLabels[organizer.interest] ?? notProvided;
        openAdminModal(adminOrganizerProfileModal);
      };

      const openAdminOrganizerAction = (organizerEmail) => {
        const organizer = getAdminOrganizerByEmail(organizerEmail);
        if (!organizer || !adminOrganizerActionModalTitle || !adminOrganizerActionModalText || !adminOrganizerActionConfirmBtn) {
          return;
        }

        selectedAdminOrganizerEmail = organizerEmail;
        if (organizer.statusCode === 'aprovado') {
          selectedAdminOrganizerAction = 'suspend';
          adminOrganizerActionModalTitle.textContent = 'Suspender organizador?';
          adminOrganizerActionModalText.textContent = `Pretendes suspender o organizador ${organizer.name}?`;
          adminOrganizerActionConfirmBtn.textContent = 'Sim, suspender';
        } else {
          selectedAdminOrganizerAction = 'activate';
          adminOrganizerActionModalTitle.textContent = 'Ativar organizador?';
          adminOrganizerActionModalText.textContent = `Pretendes reativar o organizador ${organizer.name}?`;
          adminOrganizerActionConfirmBtn.textContent = 'Sim, ativar';
        }

        openAdminModal(adminOrganizerActionModal);
      };

      const applyAdminOrganizerAction = () => {
        const organizer = getAdminOrganizerByEmail(selectedAdminOrganizerEmail);
        if (!organizer) {
          closeAdminModal(adminOrganizerActionModal);
          return;
        }

        const nextStatusCode = selectedAdminOrganizerAction === 'activate' ? 'aprovado' : 'suspenso';

        void (async () => {
          try {
            await requestJson('/api/admin/organizers', {
              method: 'PATCH',
              body: JSON.stringify({
                email: selectedAdminOrganizerEmail,
                status: nextStatusCode
              })
            });
          } catch {
            // Mantém a interface funcional mesmo se a API não responder.
          }

          organizer.statusCode = nextStatusCode;
          organizer.status = getOrganizerStatusLabel(nextStatusCode);
          organizer.action = organizer.statusCode === 'aprovado' ? 'Suspender' : 'Aprovar';
          renderAdminOrganizersTable();
          closeAdminModal(adminOrganizerActionModal);
        })();
      };

      const applyAdminEventAction = () => {
        const event = getAdminEventById(selectedAdminEventId);
        if (!event) {
          closeAdminModal(adminEventActionModal);
          return;
        }

        void (async () => {
          try {
            const response = await requestJson('/api/admin/events', {
              method: 'PATCH',
              body: JSON.stringify({
                eventId: Number(selectedAdminEventId),
                action: selectedAdminEventAction,
                reason: adminEventActionReason?.value.trim() ?? ''
              })
            });

            if (response?.ok) {
              await loadAdminEvents();
              renderAdminModerationLists();
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro desconhecido ao processar o pedido.';
            if (adminEventActionModalText) {
              adminEventActionModalText.textContent = message;
            } else {
              alert(message);
            }
            return;
          }

          // Fechar modal apenas após sucesso
          closeAdminModal(adminEventActionModal);
        })();
      };

      const openAdminUserProfile = (userEmail) => {
        const user = getAdminUserByEmail(userEmail);
        if (!user || !adminUserAvatar || !adminUserName || !adminUserEmail || !adminUserRegistered || !adminUserEvents || !adminUserStatus) {
          return;
        }

        adminUserAvatar.textContent = user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
        adminUserName.textContent = user.name;
        adminUserEmail.textContent = user.email;
        adminUserRegistered.textContent = user.registered;
        adminUserEvents.textContent = String(user.events);
        adminUserStatus.textContent = getUserStatusLabel(isAdminUserActive(user));
        openAdminModal(adminUserProfileModal);
      };

      const openDeactivateConfirm = (userEmail) => {
        const user = getAdminUserByEmail(userEmail);
        if (!user || !adminDeactivateModalTitle || !adminDeactivateModalText || !adminDeactivateConfirmBtn) {
          return;
        }

        selectedAdminUserEmail = userEmail;
        if (isAdminUserActive(user)) {
          selectedAdminUserAction = 'deactivate';
          adminDeactivateModalTitle.textContent = 'Inativar conta?';
          adminDeactivateModalText.textContent = `Pretendes colocar a conta de ${user.name} como inativa?`;
          adminDeactivateConfirmBtn.textContent = 'Sim, inativar';
        } else {
          selectedAdminUserAction = 'activate';
          adminDeactivateModalTitle.textContent = 'Ativar conta?';
          adminDeactivateModalText.textContent = `Pretendes reativar a conta de ${user.name}?`;
          adminDeactivateConfirmBtn.textContent = 'Sim, ativar';
        }

        openAdminModal(adminDeactivateModal);
      };

      [adminUserProfileModal, adminOrganizerProfileModal, adminDeactivateModal, adminEventActionModal, adminOrganizerActionModal, adminDeleteModal].forEach((modalElement) => {
        modalElement?.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          if (target.closest('[data-admin-modal-close], [data-admin-confirm-close], [data-admin-event-close], [data-admin-organizer-close], [data-admin-organizer-action-close], [data-admin-delete-close]')) {
            closeAdminModal(modalElement);
          }
        });
      });

      adminDeactivateConfirmBtn?.addEventListener('click', () => {
        const user = getAdminUserByEmail(selectedAdminUserEmail);
        if (!user) {
          closeAdminModal(adminDeactivateModal);
          return;
        }

        const nextIsActive = selectedAdminUserAction === 'activate';

        void (async () => {
          try {
            await requestJson('/api/admin/users', {
              method: 'PATCH',
              body: JSON.stringify({
                email: selectedAdminUserEmail,
                estado: nextIsActive
              })
            });
          } catch {
            // Mantém o fluxo funcional no frontend mesmo se a API não responder.
          }

          user.isActive = nextIsActive;
          user.status = getUserStatusLabel(nextIsActive);
          renderAdminUsersTable();
          closeAdminModal(adminDeactivateModal);
        })();
      });

      // Eliminar utilizador / organizador (apaga mesmo da base de dados).
      const adminDeleteModalTitle = adminDeleteModal.querySelector('#adminDeleteModalTitle');
      const adminDeleteModalText = adminDeleteModal.querySelector('#adminDeleteModalText');
      const adminDeleteConfirmBtn = adminDeleteModal.querySelector('#adminDeleteConfirmBtn');
      let selectedAdminDelete = null;

      const openAdminDelete = (kind, email) => {
        const target = kind === 'organizer' ? getAdminOrganizerByEmail(email) : getAdminUserByEmail(email);
        if (!target || !adminDeleteModalTitle || !adminDeleteModalText) {
          return;
        }

        selectedAdminDelete = { kind, email };
        if (adminDeleteConfirmBtn) {
          adminDeleteConfirmBtn.disabled = false;
        }

        if (kind === 'organizer') {
          adminDeleteModalTitle.textContent = 'Eliminar organizador?';
          adminDeleteModalText.textContent = `Pretendes eliminar definitivamente ${target.name} (${target.email})? Todos os eventos criados por este organizador também serão apagados da base de dados. Esta ação não pode ser anulada.`;
        } else {
          adminDeleteModalTitle.textContent = 'Eliminar utilizador?';
          adminDeleteModalText.textContent = `Pretendes eliminar definitivamente ${target.name} (${target.email})? A conta e os dados associados (como os favoritos) serão apagados da base de dados. Esta ação não pode ser anulada.`;
        }

        openAdminModal(adminDeleteModal);
      };

      adminDeleteConfirmBtn?.addEventListener('click', () => {
        if (!selectedAdminDelete) {
          closeAdminModal(adminDeleteModal);
          return;
        }

        const { kind, email } = selectedAdminDelete;
        adminDeleteConfirmBtn.disabled = true;

        void (async () => {
          try {
            await requestJson(kind === 'organizer' ? '/api/admin/organizers' : '/api/admin/users', {
              method: 'DELETE',
              body: JSON.stringify({ email })
            });
          } catch (error) {
            adminDeleteConfirmBtn.disabled = false;
            if (adminDeleteModalText) {
              adminDeleteModalText.textContent = error instanceof Error && error.message
                ? error.message
                : 'Não foi possível eliminar neste momento.';
            }
            return;
          }

          selectedAdminDelete = null;
          closeAdminModal(adminDeleteModal);
          await Promise.all([loadAdminUsers(), loadAdminOrganizers(), loadAdminEvents()]);
          renderAdminModerationLists();
          await loadServerEvents();
          showToast(kind === 'organizer' ? 'Organizador eliminado' : 'Utilizador eliminado');
        })();
      });

      adminEventActionConfirmBtn?.addEventListener('click', applyAdminEventAction);
      adminOrganizerActionConfirmBtn?.addEventListener('click', applyAdminOrganizerAction);

      renderAdminModerationLists();
      renderAdminOrganizersTable();
      void loadAdminEvents().then(renderAdminModerationLists);
      void loadAdminOrganizers();
      void loadAdminUsers();

      profileRoot.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const deleteButton = target.closest('[data-admin-delete-kind]');
        if (deleteButton) {
          openAdminDelete(
            deleteButton.getAttribute('data-admin-delete-kind') ?? '',
            deleteButton.getAttribute('data-admin-delete-email') ?? ''
          );
          return;
        }

        const viewButton = target.closest('[data-admin-user-view]');
        if (viewButton) {
          openAdminUserProfile(viewButton.getAttribute('data-admin-user-view') ?? '');
          return;
        }

        const actionButton = target.closest('[data-admin-user-action]');
        if (actionButton) {
          openDeactivateConfirm(actionButton.getAttribute('data-admin-user-email') ?? '');
          return;
        }

        const eventActionButton = target.closest('[data-admin-event-action][data-admin-event-id]');
        if (eventActionButton) {
          openAdminEventAction(
            eventActionButton.getAttribute('data-admin-event-id') ?? '',
            eventActionButton.getAttribute('data-admin-event-action') ?? ''
          );
          return;
        }

        const organizerViewButton = target.closest('[data-admin-organizer-view]');
        if (organizerViewButton) {
          openAdminOrganizerProfile(organizerViewButton.getAttribute('data-admin-organizer-view') ?? '');
          return;
        }

        const organizerActionButton = target.closest('[data-admin-organizer-action]');
        if (organizerActionButton) {
          openAdminOrganizerAction(organizerActionButton.getAttribute('data-admin-organizer-email') ?? '');
        }
      });

      renderAdminUsersTable();

      const setAdminTab = (tabName) => {
        const nextTab = tabButtons.find((button) => button.dataset.adminTab === tabName) ?? tabButtons[0];
        if (!nextTab) {
          return;
        }

        tabButtons.forEach((button) => button.classList.toggle('active', button === nextTab));
        panes.forEach((pane) => pane.classList.toggle('active', pane.dataset.adminPane === nextTab.dataset.adminTab));

        if (adminTabSelect && adminTabSelect.value !== nextTab.dataset.adminTab) {
          adminTabSelect.value = nextTab.dataset.adminTab;
        }
      };

      if (adminTabSelect) {
        adminTabSelect.value = 'dashboard';
        adminTabSelect.addEventListener('change', () => {
          setAdminTab(adminTabSelect.value);
        });
      }

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setAdminTab(button.dataset.adminTab ?? 'dashboard');
        });
      });

      // Ordenar e filtrar as listas da administração.
      const dateSorts = (key, label) => [
        { value: `${key}-desc`, label: `${label} (mais recente)`, key, type: 'date', dir: -1 },
        { value: `${key}-asc`, label: `${label} (mais antigo)`, key, type: 'date', dir: 1 }
      ];
      const textSorts = (key, label) => [
        { value: `${key}-asc`, label: `${label} (A–Z)`, key, type: 'text', dir: 1 },
        { value: `${key}-desc`, label: `${label} (Z–A)`, key, type: 'text', dir: -1 }
      ];
      tableListControls(profileRoot.querySelector('[data-admin-pane="users"] table'),
        { name: 0, email: 1, registered: 2, events: 3, status: 4 },
        [...textSorts('name', 'Nome'), ...textSorts('email', 'Email'), ...dateSorts('registered', 'Registo'),
          { value: 'events-desc', label: 'Eventos (mais)', key: 'events', type: 'number', dir: -1 },
          { value: 'events-asc', label: 'Eventos (menos)', key: 'events', type: 'number', dir: 1 }],
        [{ id: 'status', label: 'Estado', key: 'status' }], 'utilizadores');
      tableListControls(profileRoot.querySelector('[data-admin-pane="organizers"] table'),
        { name: 0, email: 1, registered: 2, events: 3, status: 4 },
        [...textSorts('name', 'Nome'), ...textSorts('email', 'Email'), ...dateSorts('registered', 'Registo'),
          { value: 'events-desc', label: 'Eventos (mais)', key: 'events', type: 'number', dir: -1 },
          { value: 'events-asc', label: 'Eventos (menos)', key: 'events', type: 'number', dir: 1 }],
        [{ id: 'status', label: 'Estado', key: 'status' }], 'organizadores');
      tableListControls(profileRoot.querySelector('[data-admin-published-events]')?.closest('table'),
        { title: 0, category: 1, date: 2, organizer: 3, status: 4 },
        [...textSorts('title', 'Título'), ...dateSorts('date', 'Data do evento'), ...textSorts('organizer', 'Organizador')],
        [{ id: 'category', label: 'Categoria', key: 'category' }, { id: 'organizer', label: 'Organizador', key: 'organizer' }, { id: 'status', label: 'Estado', key: 'status' }], 'eventos', 'pages');
      const reviewFields = {
        title: (item) => item.dataset.title ?? '', category: (item) => item.dataset.category ?? '', organizer: (item) => item.dataset.organizer ?? '',
        date: (item) => item.dataset.date ?? '', submitted: (item) => item.dataset.submitted ?? ''
      };
      [adminPendingEventsContainer, profileRoot.querySelector('[data-admin-change-requests]')].forEach((container) => {
        attachListControls({
          container,
          anchor: container,
          getItems: () => Array.from(container.querySelectorAll(':scope > .admin-review-item')),
          fields: reviewFields,
          sorts: [...textSorts('title', 'Título'), ...dateSorts('date', 'Data do evento'), ...dateSorts('submitted', 'Submetido'), ...textSorts('organizer', 'Organizador')],
          filters: [{ id: 'category', label: 'Categoria', key: 'category' }, { id: 'organizer', label: 'Organizador', key: 'organizer' }],
          noun: 'eventos'
        });
      });

      // Vindo do sino de notificações: abre logo a secção com o que está pendente.
      const requestedAdminTab = new URL(window.location.href).searchParams.get('tab');
      if (requestedAdminTab && tabButtons.some((button) => button.dataset.adminTab === requestedAdminTab)) {
        setAdminTab(requestedAdminTab);
      }

      return;
    }

    if (session.accountType === 'organizador') {
      const getOrganizerCreatedEvents = () => organizerEventsState.items.filter((event) => String(event.organizerEmail ?? '').toLowerCase() === String(session.email ?? '').toLowerCase());

      const formatOrganizerDateLabel = (dateValue, timeValue) => {
        const parsedDate = new Date(`${dateValue}T${timeValue || '20:00'}:00`);
        return new Intl.DateTimeFormat('pt-PT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).format(parsedDate) + (timeValue ? ` às ${timeValue}` : '');
      };

      const renderOrganizerTable = () => {
        const tableBody = document.getElementById('organizerTableBody');
        if (!tableBody) {
          return;
        }

        const allCreatedEvents = getOrganizerCreatedEvents();
        // Eventos terminados saem desta lista e ficam em "Arquivados".
        const createdEvents = allCreatedEvents.filter((event) => !isPastEvent(event));
        const archivedEvents = allCreatedEvents.filter((event) => isPastEvent(event));
        const organizerTable = tableBody.closest('table');
        const organizerEmptyState = document.getElementById('organizerEmptyState');
        if (organizerTable) {
          organizerTable.style.display = createdEvents.length > 0 ? '' : 'none';
        }
        if (organizerEmptyState) {
          organizerEmptyState.hidden = createdEvents.length > 0;
        }

        const buildOrganizerRow = (event, archived = false) => `
          <tr>
            <td class="organizer-event-title">${esc(event.title)}</td>
            <td>${esc(event.category)}</td>
            <td>${esc(event.date ?? event.dateLabel ?? '')}</td>
            <td>${esc(event.location)}</td>
            <td>
              <span class="organizer-badge ${event.scheduledFor && event.status === 'oculto' ? 'scheduled' : esc(event.status ?? 'published')}">${esc(event.statusLabel ?? 'Publicado')}</span>
              ${event.hasPendingChange ? '<span class="organizer-badge pendente" title="A versão atual mantém-se até à aprovação">Alteração pendente</span>' : ''}
              ${event.changeRejectReason ? `<span class="organizer-badge recusado" title="${esc(event.changeRejectReason)}">Alteração recusada</span>` : ''}
            </td>
            <td><span class="organizer-metric"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path></svg>${Number(event.views ?? 0)}</span></td>
            <td>
              <div class="organizer-actions-cell" aria-label="Ações do evento">
                <button type="button" class="icon-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="view" aria-label="Ver evento">
                  <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                ${archived ? '' : `<button type="button" class="icon-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="edit" aria-label="Editar evento">
                  <svg viewBox="0 0 24 24"><path d="M4 20h4l10-10a2.5 2.5 0 0 0-4-4L4 16v4Z"></path></svg>
                </button>`}
                ${event.status === 'pendente' ? `<button type="button" class="text-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="cancel-request">Cancelar pedido de aprovação</button>` : ''}
                ${event.hasPendingChange ? `<button type="button" class="text-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="cancel-change">Cancelar pedido de alteração</button>` : ''}
                ${event.changeRejectReason ? `<button type="button" class="text-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="cancel-change">Dispensar aviso</button>` : ''}
                <button type="button" class="icon-btn" data-organizer-event-id="${esc(event.id)}" data-organizer-event-action="manage" aria-label="Gerir evento">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                </button>
              </div>
            </td>
          </tr>
        `;

        tableBody.innerHTML = createdEvents.map((event) => buildOrganizerRow(event)).join('');

        const archivedPanel = document.getElementById('eventos-arquivados');
        const archivedBody = document.getElementById('organizerArchivedBody');
        if (archivedPanel && archivedBody) {
          archivedPanel.hidden = archivedEvents.length === 0;
          archivedBody.innerHTML = archivedEvents.map((event) => buildOrganizerRow(event, true)).join('');
        }
      };

      const refreshOrganizerEvents = async () => {
        await loadOrganizerEvents();
        renderOrganizerTable();
      };

      // Organizer event action modal (inativar / eliminar)
      // Preenchido mais abaixo, quando o formulário de criação/edição é inicializado.
      let openOrganizerEdit = null;

      const organizerEventActionModal = document.createElement('div');
      organizerEventActionModal.className = 'admin-modal';
      organizerEventActionModal.hidden = true;
      organizerEventActionModal.innerHTML = `
        <div class="admin-modal-backdrop" data-organizer-event-close></div>
        <section class="admin-modal-card confirm" role="dialog" aria-modal="true" aria-labelledby="organizerEventActionModalTitle">
          <button class="admin-modal-x" type="button" data-organizer-event-close aria-label="Fechar">×</button>
          <h2 id="organizerEventActionModalTitle">Gerir evento</h2>
          <p id="organizerEventActionModalText"></p>
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-organizer-event-close>Cancelar</button>
            <button class="admin-modal-primary" type="button" id="organizerEventInactivateBtn">Inativar</button>
            <button class="admin-modal-primary danger" type="button" id="organizerEventDeleteBtn">Eliminar</button>
          </div>
        </section>
      `;
      profileRoot.appendChild(organizerEventActionModal);

      let selectedOrganizerEventId = '';

      const openOrganizerEventAction = (eventId) => {
        selectedOrganizerEventId = String(eventId);
        const text = `Escolhe uma ação para o evento (ID ${selectedOrganizerEventId}): inativar ou eliminar definitivamente.`;
        organizerEventActionModal.querySelector('#organizerEventActionModalText').textContent = text;
        organizerEventActionModal.hidden = false;
        document.body.style.overflow = 'hidden';
      };

      const closeOrganizerEventAction = () => {
        organizerEventActionModal.hidden = true;
        document.body.style.overflow = '';
        selectedOrganizerEventId = '';
      };

      organizerEventActionModal.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest('[data-organizer-event-close]')) closeOrganizerEventAction();
      });

      const organizerEventInactivateBtn = organizerEventActionModal.querySelector('#organizerEventInactivateBtn');
      const organizerEventDeleteBtn = organizerEventActionModal.querySelector('#organizerEventDeleteBtn');

      organizerEventInactivateBtn?.addEventListener('click', async () => {
        if (!selectedOrganizerEventId) return closeOrganizerEventAction();
        try {
          await requestJson('/api/events', {
            method: 'PATCH',
            body: JSON.stringify({ eventId: Number(selectedOrganizerEventId), action: 'inactivate' })
          });
        } catch {
          // ignore
        }
        await refreshOrganizerEvents();
        closeOrganizerEventAction();
      });

      organizerEventDeleteBtn?.addEventListener('click', async () => {
        if (!selectedOrganizerEventId) return closeOrganizerEventAction();
        try {
          await requestJson('/api/events', {
            method: 'PATCH',
            body: JSON.stringify({ eventId: Number(selectedOrganizerEventId), action: 'delete' })
          });
        } catch {
          // ignore
        }
        await refreshOrganizerEvents();
        closeOrganizerEventAction();
      });

      // Organizer actions (view/edit/manage)
      profileRoot.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('[data-organizer-event-action][data-organizer-event-id]');
        if (!btn) return;
        const action = btn.getAttribute('data-organizer-event-action') ?? '';
        const eventId = btn.getAttribute('data-organizer-event-id') ?? '';
        if (!eventId) return;

        if (action === 'view') {
          window.location.href = getEventDetailUrl(eventId);
          return;
        }

        if (action === 'edit') {
          const eventObj = organizerEventsState.items.find((e) => String(e.id) === String(eventId));
          if (eventObj) {
            openOrganizerEdit?.(eventObj);
          }
          return;
        }

        if (action === 'manage') {
          openOrganizerEventAction(eventId);
          return;
        }

        if (action === 'cancel-request' || action === 'cancel-change') {
          void cancelOrganizerRequest(eventId, action === 'cancel-request' ? 'cancel_request' : 'cancel_change', refreshOrganizerEvents);
        }
      });

      profileRoot.innerHTML = `
        <div class="page">
          <div class="organizer-hero">
            <div>
              <h1>Painel do Organizador</h1>
              <p>Gerir os seus eventos culturais</p>
            </div>

            <div class="organizer-actions">
              <button class="organizer-primary-btn" id="organizerNewEventBtn" type="button" aria-expanded="false" aria-controls="organizerCreatePanel">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                Novo Evento
              </button>
            </div>
          </div>

          <div class="section-switch" role="tablist" aria-label="Secção do painel do organizador">
            <button type="button" role="tab" aria-selected="false" data-organizer-tab="dashboard">
              <svg viewBox="0 0 24 24"><path d="M4 20V10"></path><path d="M10 20V4"></path><path d="M16 20v-7"></path><path d="M22 20H2"></path></svg>
              Dashboard
            </button>
            <button type="button" role="tab" aria-selected="true" class="active" data-organizer-tab="management">
              <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path></svg>
              Gestão
            </button>
          </div>

          <section class="organizer-pane" data-organizer-pane="dashboard" hidden>
            <div data-analytics></div>
              <h2 class="analytics-subhead">Oferta cultural na plataforma</h2>
              <div data-observatory>${buildObservatoryMarkup()}</div>
          </section>

          <section class="organizer-pane" data-organizer-pane="management">
          <details class="organizer-profile-card" id="organizerProfileCard">
            <summary>
              <span><strong>Perfil da entidade</strong><small id="organizerProfileSummary">Ajuda-nos a perceber como vendes bilhetes (2 minutos).</small></span>
            </summary>
            <form class="organizer-profile-form" id="organizerProfileForm">
              <label>
                Tipo de entidade
                <select id="organizerProfileType">
                  <option value="">Prefiro não indicar</option>
                  ${Object.entries(organizerTypeLabels).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
                </select>
              </label>
              <label>
                Concelho
                <input id="organizerProfileCouncil" type="text" maxlength="100" placeholder="Ex.: Vila Nova de Gaia" />
              </label>
              <label>
                Já tens bilheteira própria?
                <select id="organizerProfileTicketing">
                  <option value="">Prefiro não indicar</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Terias interesse em vender bilhetes diretamente na Cultur'All?
                <select id="organizerProfileInterest">
                  <option value="">Prefiro não indicar</option>
                  <option value="sim">Sim</option>
                  <option value="talvez">Talvez</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <div class="organizer-create-actions">
                <button class="organizer-create-submit" type="submit">Guardar perfil</button>
              </div>
              <p class="organizer-create-message" id="organizerProfileMessage" role="status" aria-live="polite"></p>
            </form>
          </details>
          <section class="organizer-create-panel" id="organizerCreatePanel" hidden>
            <div class="organizer-create-head">
              <div>
                <h2>Criação de Evento</h2>
                <p>Adiciona os dados principais do evento e publica-o na plataforma.</p>
              </div>
            </div>

            <form class="organizer-create-form" id="organizerCreateForm">
              <label>
                Título do evento
                <input id="organizerEventTitle" type="text" placeholder="Ex.: Noite de Jazz em Lisboa" required />
              </label>

              <label>
                Categoria
                <select id="organizerEventCategory" required>
                  <option value="Arte e Exposições">Arte e Exposições</option>
                  <option value="Bem Estar">Bem Estar</option>
                  <option value="Cinema">Cinema</option>
                  <option value="Comédia">Comédia</option>
                  <option value="Concertos" selected>Concertos</option>
                  <option value="Dança">Dança</option>
                  <option value="Festivais">Festivais</option>
                  <option value="Gastronomia">Gastronomia</option>
                  <option value="Literatura">Literatura</option>
                  <option value="Mercados e Feiras">Mercados e Feiras</option>
                  <option value="Moda">Moda</option>
                  <option value="Família">Família</option>
                  <option value="Outros">Outros</option>
                  <option value="Teatro">Teatro</option>
                </select>
              </label>

              <label>
                Tipo de data
                <select id="organizerEventDateType" required>
                  <option value="fixed" selected>Fixa</option>
                  <option value="recurring">Periódico</option>
                </select>
              </label>

              <label class="organizer-date-field" id="organizerFixedDateField">
                Data
                <input id="organizerEventDate" type="date" required />
              </label>

              <label class="organizer-date-field" id="organizerFixedTimeField">
                Hora
                <input id="organizerEventTime" type="time" value="20:00" required />
              </label>

              <label class="organizer-date-field" id="organizerEndDateField">
                Data fim
                <input id="organizerEventEndDate" type="date" />
              </label>

              <label class="organizer-date-field" id="organizerEndTimeField">
                Hora fim
                <input id="organizerEventEndTime" type="time" value="22:00" />
              </label>

              <fieldset class="organizer-recurring-field" id="organizerRecurringField" hidden>
                <legend>Periodicidade</legend>
                <div class="organizer-weekdays" id="organizerWeekdays">
                  ${weekdayOptions.map((day) => `
                    <label class="organizer-weekday-chip">
                      <input type="checkbox" name="organizerRecurringDays" value="${day.value}" />
                      <span>${day.label}</span>
                    </label>
                  `).join('')}
                </div>
                <div class="organizer-recurring-time" id="organizerRecurringTimeField">
                  <span class="organizer-recurring-time-label">Hora</span>
                  <input id="organizerEventRecurringTime" type="time" value="20:00" />
                </div>
              </fieldset>

              <fieldset class="organizer-location-field">
                <legend>Localização</legend>
                <label>
                  Local / morada
                  <input id="organizerEventLocation" type="text" maxlength="150" placeholder="Ex.: Casa da Música, Av. da Boavista" />
                </label>
                <label>
                  Cidade
                  <input id="organizerEventCity" type="text" maxlength="100" placeholder="Ex.: Porto" required />
                </label>
                <label>
                  Distrito
                  <select id="organizerEventDistrict" required>
                    <option value="">Escolhe o distrito</option>
                    ${districtOptionList.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join('')}
                  </select>
                </label>
              </fieldset>

              <label>
                Preço
                <select id="organizerEventPriceType" required>
                  <option value="Gratuito">Gratuito</option>
                  <option value="Pago" selected>Pago</option>
                </select>
              </label>

              <label class="organizer-price-field" id="organizerPriceValueField">
                Valor do bilhete
                <input id="organizerEventPriceValue" type="number" min="0" step="0.5" placeholder="Ex.: 18" />
              </label>

              <div class="organizer-image-field organizer-gallery-field">
                <span class="organizer-field-label">Imagens do evento</span>
                <input id="organizerEventImages" class="organizer-file-input" type="file" accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.svg" multiple />
                <label class="organizer-image-drop" for="organizerEventImages">
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-8 9"></path></svg>
                  <strong>Adicionar imagens</strong>
                  <small>Podes escolher várias. Depois define qual é a imagem principal (a miniatura do evento).</small>
                </label>
                <div class="organizer-image-grid" id="organizerImageGrid" hidden></div>
                <span class="organizer-image-hint" id="organizerImageHint">Ainda sem imagens. Recomendamos imagens na horizontal (16:9).</span>
              </div>

              <label>
                Link para bilhetes
                <input id="organizerEventTicketUrl" type="url" maxlength="2048" placeholder="https://..." required />
              </label>

              <fieldset class="organizer-visibility-field">
                <legend>Visibilidade</legend>
                <div class="organizer-visibility-options" role="radiogroup" aria-label="Visibilidade do evento">
                  <label class="organizer-visibility-option">
                    <input type="radio" name="organizerVisibility" value="publish" checked />
                    <span><strong>Publicar</strong><small>Vai para aprovação da equipa e fica visível para todos depois de aprovado.</small></span>
                  </label>
                  <label class="organizer-visibility-option">
                    <input type="radio" name="organizerVisibility" value="schedule" />
                    <span><strong>Agendar</strong><small>Depois de aprovado, fica oculto e é publicado automaticamente na data escolhida.</small></span>
                  </label>
                  <label class="organizer-visibility-option">
                    <input type="radio" name="organizerVisibility" value="hide" />
                    <span><strong>Ocultar</strong><small>Guardado só para ti. Podes publicá-lo mais tarde.</small></span>
                  </label>
                </div>
                <label class="organizer-schedule-field" id="organizerScheduleField" hidden>
                  Publicar em
                  <input id="organizerPublishAt" type="datetime-local" />
                </label>
              </fieldset>

              <label>
                Descrição do evento
                <textarea id="organizerEventDescription" rows="5" placeholder="Escreve uma descrição curta do evento (programa, artistas, público-alvo, etc.)"></textarea>
              </label>

              <p class="organizer-approval-notice" id="organizerApprovalNotice" role="note">
                <strong>Aprovação necessária.</strong> Todos os eventos são revistos pela equipa Cultur'All antes de aparecerem na plataforma. A aprovação pode demorar de 1 a 3 dias.
              </p>

              <div class="organizer-create-actions">
                <button class="organizer-create-submit" id="organizerCreateSubmitBtn" type="submit">Enviar para aprovação</button>
                <button class="organizer-create-cancel" type="button" id="organizerCreateCancelBtn">Cancelar</button>
              </div>

              <p class="organizer-create-message" id="organizerCreateMessage" role="status" aria-live="polite"></p>
            </form>
          </section>

          <div class="organizer-panel" id="eventos-organizador">
            <table class="organizer-table" aria-label="Lista de eventos do organizador" style="display:none">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Localização</th>
                  <th>Estado</th>
                  <th>Visualizações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="organizerTableBody"></tbody>
            </table>
            <div class="empty-state organizer-empty-state" id="organizerEmptyState" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path><path d="m10 13 4 4"></path><path d="m14 13-4 4"></path></svg>
              <strong>Não há eventos publicados.</strong>
              <button class="empty-state-btn" type="button" id="organizerEmptyAddBtn">Adicionar Evento</button>
            </div>
          </div>

          <div class="organizer-panel organizer-archive" id="eventos-arquivados" hidden>
            <h2>Arquivados</h2>
            <p class="admin-section-hint">Eventos teus que já terminaram. Deixam de aparecer na plataforma e de somar visualizações, mas os dados que já tinham continuam nos gráficos.</p>
            <table class="organizer-table" aria-label="Eventos arquivados do organizador">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Localização</th>
                  <th>Estado</th>
                  <th>Visualizações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="organizerArchivedBody"></tbody>
            </table>
          </div>
          </section>
        </div>
      `;

      profileMobileNav.innerHTML = `
        <a href="index.html">
          <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
          Início
        </a>
        <a class="active" href="profile.html">
          <svg viewBox="0 0 24 24"><path d="M4 20c1.8-4 4.9-6 8-6s6.2 2 8 6"></path><circle cx="12" cy="8" r="4"></circle></svg>
          Perfil
        </a>
      `;

      const organizerNewEventBtn = document.getElementById('organizerNewEventBtn');
      const organizerCreatePanel = document.getElementById('organizerCreatePanel');
      const organizerCreateForm = document.getElementById('organizerCreateForm');
      const organizerCreateCancelBtn = document.getElementById('organizerCreateCancelBtn');
      const organizerCreateMessage = document.getElementById('organizerCreateMessage');
      const organizerEventDateType = document.getElementById('organizerEventDateType');
      const organizerFixedDateField = document.getElementById('organizerFixedDateField');
      const organizerFixedTimeField = document.getElementById('organizerFixedTimeField');
      const organizerRecurringField = document.getElementById('organizerRecurringField');
      const organizerPriceValueField = document.getElementById('organizerPriceValueField');
      const organizerEventPriceType = document.getElementById('organizerEventPriceType');

      const organizerEventTitle = document.getElementById('organizerEventTitle');
      const organizerEventCategory = document.getElementById('organizerEventCategory');
      const organizerEventDate = document.getElementById('organizerEventDate');
      const organizerEventTime = document.getElementById('organizerEventTime');
      const organizerEventRecurringTime = document.getElementById('organizerEventRecurringTime');
      const organizerRecurringTimeField = document.getElementById('organizerRecurringTimeField');
      const organizerEventLocation = document.getElementById('organizerEventLocation');
      const organizerEventCity = document.getElementById('organizerEventCity');
      const organizerEventDistrict = document.getElementById('organizerEventDistrict');
      const organizerEventPriceValue = document.getElementById('organizerEventPriceValue');
      const organizerEventImages = document.getElementById('organizerEventImages');
      const organizerEventTicketUrl = document.getElementById('organizerEventTicketUrl');
      const organizerEventDescription = document.getElementById('organizerEventDescription');
      const organizerEventEndDate = document.getElementById('organizerEventEndDate');
      const organizerEventEndTime = document.getElementById('organizerEventEndTime');

      // ---- Galeria de imagens do evento (várias imagens, uma principal) ----
      const maxOrganizerImages = 10;
      const maxOrganizerImagesPayload = 4000000; // limite seguro para o pedido (o Vercel aceita ~4,5 MB)
      let organizerImages = [];
      let organizerMainImageId = '';
      let organizerImagesBusy = false;
      let organizerExistingImagesLoaded = false;
      const organizerImageGrid = document.getElementById('organizerImageGrid');
      const organizerImageHint = document.getElementById('organizerImageHint');

      const loadImageElement = (source) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('formato de imagem não suportado'));
        image.src = source;
      });

      // Redimensiona/comprime para caberem várias imagens no pedido sem perder qualidade visível.
      const prepareOrganizerImage = async (file) => {
        const original = (await readFilesAsDataUrls([file]))[0];
        if (/^data:image\/(svg|gif)/i.test(original)) {
          if (original.length > 700000) {
            throw new Error('está demasiado pesada (máx. ~500 KB para SVG/GIF)');
          }
          return original;
        }

        const image = await loadImageElement(original);
        let output = original;
        for (const [maxSide, quality] of [[1600, 0.82], [1280, 0.72], [1024, 0.65]]) {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          output = canvas.toDataURL('image/jpeg', quality);
          if (output.length <= 450000) {
            break;
          }
        }

        return output;
      };

      const getOrganizerImagesTotal = () => organizerImages.reduce((total, image) => total + image.dataUrl.length, 0);

      const renderOrganizerImages = () => {
        if (!organizerImageGrid) {
          return;
        }

        organizerImageGrid.hidden = organizerImages.length === 0;
        organizerImageGrid.innerHTML = organizerImages.map((image) => {
          const isMain = image.id === organizerMainImageId;
          return `
            <figure class="organizer-image-card${isMain ? ' is-main' : ''}">
              <img src="${esc(image.dataUrl)}" alt="${esc(image.name)}" />
              ${isMain ? '<span class="organizer-image-badge">Principal</span>' : ''}
              <div class="organizer-image-actions">
                <button type="button" data-organizer-image-main="${esc(image.id)}" ${isMain ? 'disabled' : ''}>${isMain ? 'Imagem principal' : 'Definir como principal'}</button>
                <button type="button" class="remove" data-organizer-image-remove="${esc(image.id)}" aria-label="Remover imagem ${esc(image.name)}">×</button>
              </div>
            </figure>
          `;
        }).join('');

        if (organizerImageHint) {
          organizerImageHint.textContent = organizerImages.length === 0
            ? 'Ainda sem imagens. Recomendamos imagens na horizontal (16:9).'
            : `${organizerImages.length} ${organizerImages.length === 1 ? 'imagem' : 'imagens'} (máx. ${maxOrganizerImages}). A imagem principal é a miniatura do evento; todas aparecem no carrossel da página do evento.`;
        }
      };

      const resetOrganizerImages = () => {
        organizerExistingImagesLoaded = false;
        organizerImages = [];
        organizerMainImageId = '';
        renderOrganizerImages();
      };

      const addOrganizerImageFiles = async (files) => {
        if (organizerImagesBusy) {
          return;
        }

        const candidates = files.filter(isLikelyImageFile);
        const rejectedCount = files.length - candidates.length;
        const room = maxOrganizerImages - organizerImages.length;
        const accepted = candidates.slice(0, Math.max(0, room));
        const problems = [];
        if (rejectedCount > 0) {
          problems.push(`${rejectedCount} ficheiro(s) ignorado(s) por não serem imagens`);
        }
        if (candidates.length > accepted.length) {
          problems.push(`só podes ter ${maxOrganizerImages} imagens por evento`);
        }

        organizerImagesBusy = true;
        if (organizerImageHint) {
          organizerImageHint.textContent = 'A preparar imagens…';
        }

        for (const file of accepted) {
          try {
            const dataUrl = await prepareOrganizerImage(file);
            organizerImages.push({ id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl });
            if (!organizerMainImageId) {
              organizerMainImageId = organizerImages[organizerImages.length - 1].id;
            }
          } catch (error) {
            problems.push(`"${file.name}" ${error instanceof Error ? error.message : 'não pôde ser lida'}`);
          }
        }

        organizerImagesBusy = false;
        renderOrganizerImages();

        if (getOrganizerImagesTotal() > maxOrganizerImagesPayload) {
          problems.push('o total das imagens é demasiado pesado: remove algumas para conseguir guardar');
        }

        if (problems.length > 0 && organizerCreateMessage) {
          organizerCreateMessage.textContent = `Atenção: ${problems.join('; ')}.`;
        }
      };

      organizerEventImages?.addEventListener('change', () => {
        const files = Array.from(organizerEventImages.files ?? []);
        organizerEventImages.value = '';
        if (files.length > 0) {
          void addOrganizerImageFiles(files);
        }
      });

      organizerImageGrid?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const mainButton = target?.closest('[data-organizer-image-main]');
        if (mainButton) {
          organizerMainImageId = mainButton.getAttribute('data-organizer-image-main') ?? '';
          renderOrganizerImages();
          return;
        }

        const removeButton = target?.closest('[data-organizer-image-remove]');
        if (removeButton) {
          const removedId = removeButton.getAttribute('data-organizer-image-remove');
          organizerImages = organizerImages.filter((image) => image.id !== removedId);
          if (organizerMainImageId === removedId) {
            organizerMainImageId = organizerImages[0]?.id ?? '';
          }
          renderOrganizerImages();
        }
      });

      organizerCreateForm?.addEventListener('reset', resetOrganizerImages);

      // ---- Switch Dashboard / Gestão ----
      let organizerDashboardMounted = false;
      const organizerTabButtons = Array.from(profileRoot.querySelectorAll('[data-organizer-tab]'));
      const organizerPanes = Array.from(profileRoot.querySelectorAll('[data-organizer-pane]'));

      const setOrganizerTab = (tabName) => {
        organizerTabButtons.forEach((button) => {
          const isActive = button.dataset.organizerTab === tabName;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
        organizerPanes.forEach((pane) => {
          pane.hidden = pane.dataset.organizerPane !== tabName;
        });

        if (tabName === 'dashboard' && !organizerDashboardMounted) {
          organizerDashboardMounted = true;
          mountObservatory(profileRoot.querySelector('[data-organizer-pane="dashboard"] [data-observatory]'));
          mountAnalytics(profileRoot.querySelector('[data-organizer-pane="dashboard"] [data-analytics]'), 'organizador');
        }
      };

      organizerTabButtons.forEach((button) => {
        button.addEventListener('click', () => setOrganizerTab(button.dataset.organizerTab ?? 'management'));
      });

      document.getElementById('organizerEmptyAddBtn')?.addEventListener('click', () => {
        setOrganizerTab('management');
        toggleOrganizerCreatePanel(true);
        updateOrganizerCreateVisibility();
        organizerCreatePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      const updateOrganizerCreateVisibility = () => {
        const isRecurring = organizerEventDateType?.value === 'recurring';
        if (organizerFixedDateField) {
          organizerFixedDateField.hidden = isRecurring;
        }
        if (organizerFixedTimeField) {
          organizerFixedTimeField.hidden = isRecurring;
        }
        if (organizerRecurringField) {
          organizerRecurringField.hidden = !isRecurring;
          organizerRecurringField.classList.toggle('is-hidden', !isRecurring);
        }

        if (organizerEventDate) {
          organizerEventDate.required = !isRecurring;
        }

        if (organizerEventTime) {
          organizerEventTime.required = !isRecurring;
        }

        if (organizerEventRecurringTime) {
          organizerEventRecurringTime.required = isRecurring;
        }

        if (organizerEventEndDate) {
          organizerEventEndDate.required = !isRecurring;
          organizerEventEndDate.closest('label')?.classList.toggle('hidden', isRecurring);
        }

        if (organizerEventEndTime) {
          organizerEventEndTime.required = !isRecurring;
          organizerEventEndTime.closest('label')?.classList.toggle('hidden', isRecurring);
        }

        const isPaid = organizerEventPriceType?.value === 'Pago';
        if (organizerPriceValueField) {
          organizerPriceValueField.hidden = !isPaid;
        }

        if (organizerEventPriceValue) {
          organizerEventPriceValue.required = isPaid;
        }
        // Mostrar/ocultar campo de link para bilhetes conforme tipo de preço
        // Identificar o elemento <label> que contém o input de ticket de forma robusta
        if (organizerEventTicketUrl && organizerCreateForm) {
          const labels = Array.from(organizerCreateForm.querySelectorAll('label'));
          const ticketLabel = labels.find((lbl) => lbl.contains(organizerEventTicketUrl));
          if (ticketLabel) {
            ticketLabel.style.display = isPaid ? '' : 'none';
            ticketLabel.hidden = !isPaid;
          }
          organizerEventTicketUrl.required = isPaid;
        }
      };

      const toggleOrganizerCreatePanel = (shouldOpen = true) => {
        if (!organizerCreatePanel || !organizerNewEventBtn) {
          return;
        }

        organizerCreatePanel.hidden = !shouldOpen;
        organizerNewEventBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

        if (shouldOpen && organizerEventTitle) {
          organizerEventTitle.focus();
        }
      };

      if (organizerNewEventBtn) {
        organizerNewEventBtn.addEventListener('click', () => {
          setOrganizerTab('management');
          toggleOrganizerCreatePanel(Boolean(organizerCreatePanel?.hidden));
          updateOrganizerCreateVisibility();
        });
      }

      if (organizerCreateCancelBtn) {
        organizerCreateCancelBtn.addEventListener('click', () => {
          if (organizerCreateForm) {
            organizerCreateForm.reset();
          }

          if (organizerCreateMessage) {
            organizerCreateMessage.textContent = '';
          }

          updateOrganizerCreateVisibility();
          toggleOrganizerCreatePanel(false);
        });
      }

      organizerEventDateType?.addEventListener('change', updateOrganizerCreateVisibility);
      organizerEventPriceType?.addEventListener('change', updateOrganizerCreateVisibility);

      if (organizerEventRecurringTime) {
        organizerEventRecurringTime.addEventListener('click', () => {
          if (typeof organizerEventRecurringTime.showPicker === 'function') {
            organizerEventRecurringTime.showPicker();
            return;
          }

          organizerEventRecurringTime.focus();
        });
      }

      // Visibilidade do evento (Publicar / Agendar / Ocultar), à semelhança do YouTube.
      const organizerScheduleField = document.getElementById('organizerScheduleField');
      const organizerPublishAt = document.getElementById('organizerPublishAt');
      const organizerCreateSubmitBtn = document.getElementById('organizerCreateSubmitBtn');
      const getOrganizerVisibility = () => organizerCreateForm?.querySelector('input[name="organizerVisibility"]:checked')?.value ?? 'publish';
      const toLocalInputValue = (date) => {
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };
      const setOrganizerVisibility = (value, scheduledFor = '') => {
        const input = organizerCreateForm?.querySelector(`input[name="organizerVisibility"][value="${value}"]`);
        if (input) {
          input.checked = true;
        }
        if (organizerPublishAt) {
          organizerPublishAt.value = scheduledFor ? toLocalInputValue(new Date(scheduledFor)) : '';
        }
        updateOrganizerVisibilityUi();
      };
      function updateOrganizerVisibilityUi() {
        const visibility = getOrganizerVisibility();
        if (organizerScheduleField) {
          organizerScheduleField.hidden = visibility !== 'schedule';
        }
        if (organizerPublishAt) {
          organizerPublishAt.required = visibility === 'schedule';
          organizerPublishAt.min = toLocalInputValue(new Date(Date.now() + 60000));
        }
        if (organizerCreateSubmitBtn) {
          const editing = Boolean(editingOrganizerEventIdRef.value);
          // Eventos já aprovados continuam a poder ser publicados/agendados diretamente; os restantes vão para aprovação.
          const editingApproved = Boolean(editing && editingOrganizerEventIdRef.approved);
          const needsApproval = !editingApproved;
          organizerCreateSubmitBtn.textContent = editingApproved
            ? 'Enviar alterações para aprovação'
            : visibility === 'hide'
              ? (editing ? 'Guardar alterações (oculto)' : 'Guardar como oculto')
              : (visibility === 'schedule' ? 'Enviar para aprovação (agendado)' : 'Enviar para aprovação');
          const approvalNotice = document.getElementById('organizerApprovalNotice');
          if (approvalNotice) {
            approvalNotice.hidden = !editingApproved && (visibility === 'hide' || !needsApproval);
            approvalNotice.innerHTML = editingApproved
              ? "<strong>Alterações sujeitas a aprovação.</strong> A versão atual do evento continua visível até a equipa Cultur'All aprovar as mudanças (1 a 3 dias). Podes cancelar o pedido quando quiseres."
              : "<strong>Aprovação necessária.</strong> Todos os eventos são revistos pela equipa Cultur'All antes de aparecerem na plataforma. A aprovação pode demorar de 1 a 3 dias.";
          }
        }
      }
      const editingOrganizerEventIdRef = { value: null };
      organizerCreateForm?.querySelectorAll('input[name="organizerVisibility"]').forEach((input) => {
        input.addEventListener('change', updateOrganizerVisibilityUi);
      });
      organizerCreateForm?.addEventListener('reset', () => {
        setTimeout(() => {
          editingOrganizerEventIdRef.value = null;
          editingOrganizerEventIdRef.approved = false;
          updateOrganizerVisibilityUi();
        }, 0);
      });

      if (organizerCreateForm) {
        let editingOrganizerEventId = null;

        openOrganizerEdit = (eventObj) => {
          editingOrganizerEventId = String(eventObj.id ?? '');
          editingOrganizerEventIdRef.value = editingOrganizerEventId;
          editingOrganizerEventIdRef.approved = Boolean(eventObj.approvedAt);
          organizerEventTitle.value = eventObj.title ?? '';
          organizerEventCategory.value = eventObj.category ?? 'Outros';
          if (eventObj.isRecurring) {
            organizerEventDateType.value = 'recurring';
            organizerRecurringField.hidden = false;
            organizerRecurringField.classList.remove('is-hidden');
            organizerEventRecurringTime.value = (new Date(eventObj.eventDate)).toTimeString().slice(0, 5) || '20:00';
            organizerCreateForm.querySelectorAll('input[name="organizerRecurringDays"]')?.forEach((input) => {
              input.checked = (eventObj.recurringDays ?? '').split(',').includes(input.value);
            });
          } else {
            organizerEventDateType.value = 'fixed';
            organizerEventDate.value = (eventObj.eventDate ?? '').slice(0,10);
            organizerEventTime.value = (new Date(eventObj.eventDate)).toTimeString().slice(0,5) || '20:00';
            if (eventObj.endDate) {
              try {
                organizerEventEndDate.value = (eventObj.endDate ?? '').slice(0,10);
                organizerEventEndTime.value = (new Date(eventObj.endDate)).toTimeString().slice(0,5) || '22:00';
              } catch (e) {
                // silenciar se formato inesperado
              }
            }
          }
          organizerEventLocation.value = eventObj.street ?? '';
          organizerEventCity.value = eventObj.city ?? '';
          organizerEventDistrict.value = districtOptionList.includes(eventObj.district) ? eventObj.district : '';
          organizerEventDescription.value = eventObj.description ?? '';
          organizerEventPriceType.value = eventObj.priceType ?? 'Pago';
          organizerEventPriceValue.value = eventObj.price ?? '';
          organizerEventTicketUrl.value = eventObj.ticketUrl ?? '';
          if (eventObj.scheduledFor) {
            setOrganizerVisibility('schedule', eventObj.scheduledFor);
          } else if (['oculto', 'hidden'].includes(String(eventObj.status ?? '').toLowerCase())) {
            setOrganizerVisibility('hide');
          } else {
            setOrganizerVisibility('publish');
          }
          toggleOrganizerCreatePanel(true);
          updateOrganizerCreateVisibility();
          // As imagens já enviadas aparecem na edição: podem ser mantidas, removidas, reordenadas ou complementadas.
          resetOrganizerImages();
          organizerExistingImagesLoaded = false;
          if (organizerImageHint) {
            organizerImageHint.textContent = 'A carregar as imagens atuais…';
          }
          const loadingForId = editingOrganizerEventId;
          void requestJson(`/api/event-images?eventId=${encodeURIComponent(loadingForId)}&ids=1`)
            .then((response) => {
              if (editingOrganizerEventId !== loadingForId || !Array.isArray(response.ids)) {
                return;
              }

              organizerImages = response.ids.map((imageId, index) => ({
                id: `existing:${imageId}`,
                name: `Imagem ${index + 1}`,
                dataUrl: `/api/event-cover?img=${encodeURIComponent(imageId)}`
              }));
              organizerMainImageId = organizerImages[0]?.id ?? '';
              organizerExistingImagesLoaded = true;
              renderOrganizerImages();
            })
            .catch(() => {
              if (organizerImageHint) {
                organizerImageHint.textContent = 'Não foi possível carregar as imagens atuais. Se não mexeres nas imagens, mantêm-se como estão.';
              }
            });
        };

        organizerCreateForm.addEventListener('submit', async (event) => {
          event.preventDefault();

          const title = organizerEventTitle?.value.trim() ?? '';
          const description = organizerEventDescription?.value.trim() ?? '';
          const category = organizerEventCategory?.value ?? 'Outros';
          const dateType = organizerEventDateType?.value ?? 'fixed';
          const visibility = getOrganizerVisibility();
          if (visibility === 'schedule' && (!organizerPublishAt?.value || new Date(organizerPublishAt.value).getTime() <= Date.now())) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'Escolhe uma data e hora de publicação no futuro.';
            }
            return;
          }
          const street = organizerEventLocation?.value.trim() ?? '';
          const city = organizerEventCity?.value.trim() ?? '';
          const district = organizerEventDistrict?.value ?? '';
          const priceType = organizerEventPriceType?.value ?? 'Gratuito';
          const ticketUrl = priceType === 'Pago' ? (organizerEventTicketUrl?.value.trim() ?? '') : '';
          const selectedRecurringDays = Array.from(document.querySelectorAll('input[name="organizerRecurringDays"]'))
            .filter((input) => input.checked)
            .map((input) => input.value);

          const isPaid = priceType === 'Pago';
          if (organizerImagesBusy) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'Aguarda que as imagens terminem de ser preparadas.';
            }
            return;
          }

          if (getOrganizerImagesTotal() > maxOrganizerImagesPayload) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'As imagens são demasiado pesadas no total. Remove algumas e tenta novamente.';
            }
            return;
          }

          if (!title || !city || !district || (isPaid && !ticketUrl)) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = isPaid
                ? 'Preenche o título, a cidade, o distrito e o link de bilhetes.'
                : 'Preenche o título, a cidade e o distrito.';
            }
            return;
          }

          if (isPaid && !(Number(organizerEventPriceValue?.value) > 0)) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'Indica o valor do bilhete (maior que 0) ou escolhe "Gratuito".';
            }
            return;
          }

          if (isPaid && !/^https?:\/\//i.test(ticketUrl)) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'O link de bilhetes tem de começar por http:// ou https://.';
            }
            return;
          }

          let eventDate = new Date();
          let dateLabel = '';
          let dateBucket = 'Este ano';
          let isRecurring = false;
          let recurringDays = [];

          if (dateType === 'recurring') {
            isRecurring = true;
            const recurringTime = organizerEventRecurringTime?.value || '20:00';
            recurringDays = selectedRecurringDays;
            if (recurringDays.length === 0) {
              if (organizerCreateMessage) {
                organizerCreateMessage.textContent = 'Escolhe pelo menos um dia da semana para a periodicidade.';
              }
              return;
            }

            dateLabel = formatRecurringLabel(recurringDays, recurringTime);
            dateBucket = 'Periódicos';
            const recurringReference = new Date();
            eventDate = new Date(`${getDateKey(recurringReference)}T${recurringTime}:00`);
          } else {
            const dateValue = organizerEventDate?.value;
            const timeValue = organizerEventTime?.value || '20:00';
            const endDateValue = organizerEventEndDate?.value;
            const endTimeValue = organizerEventEndTime?.value || '22:00';
            if (!dateValue) {
              if (organizerCreateMessage) {
                organizerCreateMessage.textContent = 'Seleciona uma data válida para o evento.';
              }
              return;
            }

            if (!endDateValue) {
              if (organizerCreateMessage) {
                organizerCreateMessage.textContent = 'Seleciona a data de fim do evento.';
              }
              return;
            }

            const startDt = new Date(`${dateValue}T${timeValue}:00`);
            const endDt = new Date(`${endDateValue}T${endTimeValue}:00`);
            if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) {
              if (organizerCreateMessage) {
                organizerCreateMessage.textContent = 'Datas inválidas.';
              }
              return;
            }

            if (endDt.getTime() < startDt.getTime()) {
              if (organizerCreateMessage) {
                organizerCreateMessage.textContent = 'A data de fim não pode ser anterior à data de início.';
              }
              return;
            }

            eventDate = startDt;
            dateLabel = formatOrganizerDateLabel(dateValue, timeValue);
            dateBucket = getDateBucketForDateTime(eventDate.getTime());
          }

          // montar endDate para envio
          let endDatePayload = '';
          if (dateType !== 'recurring') {
            const endDateVal = organizerEventEndDate?.value;
            const endTimeVal = organizerEventEndTime?.value || '22:00';
            if (endDateVal) {
              const endDtForPayload = new Date(`${endDateVal}T${endTimeVal}:00`);
              if (!Number.isNaN(endDtForPayload.getTime())) {
                endDatePayload = formatApiDateTime(endDtForPayload);
              }
            }
          }

          let saveResponse = null;

          // A imagem principal vai primeiro (a API guarda a primeira como capa e as restantes como galeria).
          const imagePayload = [
            ...organizerImages.filter((image) => image.id === organizerMainImageId),
            ...organizerImages.filter((image) => image.id !== organizerMainImageId)
          ].map((image) => image.dataUrl);
          // Na edição envia-se a ordem completa ("existing:<id>" para as já guardadas); só se as atuais foram carregadas,
          // para nunca apagar imagens por engano.
          const imageOrderPayload = organizerImages
            .slice()
            .sort((a, b) => Number(b.id === organizerMainImageId) - Number(a.id === organizerMainImageId))
            .map((image) => (String(image.id).startsWith('existing:') ? image.id : image.dataUrl));

          try {
            if (editingOrganizerEventId) {
              saveResponse = await requestJson('/api/events', {
                method: 'PATCH',
                body: JSON.stringify({
                  action: 'update',
                  eventId: Number(editingOrganizerEventId),
                  title,
                  description,
                  startDate: formatApiDateTime(eventDate),
                  endDate: endDatePayload,
                  price: priceType === 'Pago' ? Number(organizerEventPriceValue?.value || 0) : 0,
                  ticketUrl,
                  category,
                  locationStreet: street,
                  locationCity: city,
                  locationDistrict: district,
                  isRecurring,
                  recurringPattern: isRecurring ? 'semanal' : '',
                  recurringDays: isRecurring ? recurringDays.join(',') : '',
                  ...(organizerExistingImagesLoaded ? { imageOrder: imageOrderPayload } : { images: imagePayload }),
                  visibility,
                  publishAt: visibility === 'schedule' ? new Date(organizerPublishAt.value).toISOString() : ''
                })
              });
            } else {
              saveResponse = await requestJson('/api/events', {
                method: 'POST',
                body: JSON.stringify({
                  title,
                  description,
                  startDate: formatApiDateTime(eventDate),
                  endDate: endDatePayload,
                  price: priceType === 'Pago' ? Number(organizerEventPriceValue?.value || 0) : 0,
                  ticketUrl,
                  category,
                  locationStreet: street,
                  locationCity: city,
                  locationDistrict: district,
                  isRecurring,
                  recurringPattern: isRecurring ? 'semanal' : '',
                  recurringDays: isRecurring ? recurringDays.join(',') : '',
                  images: imagePayload,
                  visibility,
                  publishAt: visibility === 'schedule' ? new Date(organizerPublishAt.value).toISOString() : ''
                })
              });
            }
          } catch (error) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = error instanceof Error && error.message
                ? error.message
                : 'Não foi possível criar o evento neste momento.';
            }
            return;
          }

          if (organizerCreateMessage) {
            organizerCreateMessage.textContent = saveResponse?.changeRequested
              ? saveResponse.message
              : saveResponse?.status === 'pendente'
              ? `Evento enviado para aprovação. A aprovação pode demorar de 1 a 3 dias; só depois fica visível na plataforma${visibility === 'schedule' ? ' (na data agendada)' : ''}.`
              : visibility === 'schedule'
              ? `Evento agendado para ${new Date(organizerPublishAt.value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}.`
              : visibility === 'hide'
                ? 'Evento guardado como oculto. Podes publicá-lo quando quiseres.'
                : 'Evento publicado com sucesso.';
          }

          organizerCreateForm.reset();
          editingOrganizerEventId = null;
          editingOrganizerEventIdRef.value = null;
          editingOrganizerEventIdRef.approved = false;
          if (organizerEventPriceType) {
            organizerEventPriceType.value = 'Pago';
          }
          if (organizerEventDateType) {
            organizerEventDateType.value = 'fixed';
          }
          if (organizerEventTime) {
            organizerEventTime.value = '20:00';
          }
          if (organizerEventRecurringTime) {
            organizerEventRecurringTime.value = '20:00';
          }
          organizerCreateForm.querySelectorAll('input[name="organizerRecurringDays"]')?.forEach((input) => {
            input.checked = false;
          });

          updateOrganizerCreateVisibility();
          await refreshOrganizerEvents();
        });
      }

      // ---- Perfil da entidade (apoia a análise de viabilidade da bilheteira integrada) ----
      const organizerProfileForm = document.getElementById('organizerProfileForm');
      const organizerProfileType = document.getElementById('organizerProfileType');
      const organizerProfileCouncil = document.getElementById('organizerProfileCouncil');
      const organizerProfileTicketing = document.getElementById('organizerProfileTicketing');
      const organizerProfileInterest = document.getElementById('organizerProfileInterest');
      const organizerProfileMessage = document.getElementById('organizerProfileMessage');
      const organizerProfileCard = document.getElementById('organizerProfileCard');
      const organizerProfileSummary = document.getElementById('organizerProfileSummary');

      const fillOrganizerProfile = (profile) => {
        organizerProfileType.value = profile.type ?? '';
        organizerProfileCouncil.value = profile.council ?? '';
        organizerProfileTicketing.value = profile.hasTicketing ?? '';
        organizerProfileInterest.value = profile.interest ?? '';
        const complete = Boolean(profile.type && profile.hasTicketing && profile.interest);
        if (organizerProfileSummary) {
          organizerProfileSummary.textContent = complete ? 'Perfil preenchido. Obrigado!' : 'Ajuda-nos a perceber como vendes bilhetes (2 minutos).';
        }
        organizerProfileCard?.classList.toggle('is-complete', complete);
      };

      void requestJson('/api/organizer/profile').then((response) => {
        if (response?.profile) {
          fillOrganizerProfile(response.profile);
        }
      }).catch(() => {
        // Sem perfil carregado, o formulário fica em branco e pode ser preenchido na mesma.
      });

      organizerProfileForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const response = await requestJson('/api/organizer/profile', {
            method: 'PATCH',
            body: JSON.stringify({
              type: organizerProfileType.value,
              council: organizerProfileCouncil.value.trim(),
              hasTicketing: organizerProfileTicketing.value,
              interest: organizerProfileInterest.value
            })
          });
          if (response?.profile) {
            fillOrganizerProfile(response.profile);
          }
          organizerProfileMessage.textContent = 'Perfil guardado.';
        } catch (error) {
          organizerProfileMessage.textContent = error instanceof Error && error.message ? error.message : 'Não foi possível guardar o perfil.';
        }
      });

      updateOrganizerCreateVisibility();

      // Ordenar e filtrar a lista de eventos do organizador.
      tableListControls(document.getElementById('organizerTableBody')?.closest('table'),
        { title: 0, category: 1, date: 2, location: 3, status: 4, views: 5 },
        [
          { value: 'title-asc', label: 'Título (A–Z)', key: 'title', type: 'text', dir: 1 },
          { value: 'title-desc', label: 'Título (Z–A)', key: 'title', type: 'text', dir: -1 },
          { value: 'date-desc', label: 'Data (mais recente)', key: 'date', type: 'date', dir: -1 },
          { value: 'date-asc', label: 'Data (mais antiga)', key: 'date', type: 'date', dir: 1 },
          { value: 'views-desc', label: 'Visualizações (mais)', key: 'views', type: 'number', dir: -1 },
          { value: 'views-asc', label: 'Visualizações (menos)', key: 'views', type: 'number', dir: 1 }
        ],
        [{ id: 'category', label: 'Categoria', key: 'category' }, { id: 'status', label: 'Estado', key: 'status' }], 'eventos');
      tableListControls(document.getElementById('organizerArchivedBody')?.closest('table'),
        { title: 0, category: 1, date: 2, location: 3, status: 4, views: 5 },
        [
          { value: 'title-asc', label: 'Título (A–Z)', key: 'title', type: 'text', dir: 1 },
          { value: 'title-desc', label: 'Título (Z–A)', key: 'title', type: 'text', dir: -1 },
          { value: 'date-desc', label: 'Data (mais recente)', key: 'date', type: 'date', dir: -1 },
          { value: 'date-asc', label: 'Data (mais antiga)', key: 'date', type: 'date', dir: 1 },
          { value: 'views-desc', label: 'Visualizações (mais)', key: 'views', type: 'number', dir: -1 },
          { value: 'views-asc', label: 'Visualizações (menos)', key: 'views', type: 'number', dir: 1 }
        ],
        [{ id: 'category', label: 'Categoria', key: 'category' }, { id: 'status', label: 'Estado', key: 'status' }], 'eventos');

      // Vindo da página do evento ("Editar evento"): abre logo o formulário de edição desse evento.
      const editRequestId = new URL(window.location.href).searchParams.get('edit');
      if (editRequestId) {
        const editTarget = organizerEventsState.items.find((item) => String(item.id) === String(editRequestId));
        if (editTarget) {
          setOrganizerTab('management');
          openOrganizerEdit?.(editTarget);
          organizerCreatePanel?.scrollIntoView({ block: 'start' });
        }
      }

      void refreshOrganizerEvents();

      return;
    }

    window.location.href = 'index.html';
  };

  void (async () => {
    // Mostra já o utilizador (a partir da sessão em cache) para o cabeçalho não aparecer vazio entre páginas.
    if (getSession()) {
      syncLoginHeaderState();
      applyFavoritesVisibility();
      const cachedChip = document.getElementById('profileAccountChip');
      if (cachedChip) {
        cachedChip.textContent = getSession().name;
        cachedChip.hidden = false;
        cachedChip.style.display = 'inline-flex';
      }
    }

    await loadSessionFromApi();

    if (pageType === 'event' || pageType === 'home' || pageType === 'events' || pageType === 'favorites' || pageType === 'stats') {
      await loadServerEvents();
    }

    const session = getSession();
    if (session?.accountType === 'lambda') {
      await loadServerFavorites();
    }

    if (session?.accountType === 'admin') {
      await loadAdminEvents();
    }

    if (session?.accountType === 'organizador') {
      await loadOrganizerEvents();
    }

    if (pageType === 'event') {
      const reviewId = new URL(window.location.href).searchParams.get('id');
      if (reviewId && ['admin', 'organizador'].includes(session?.accountType)) {
        try {
          eventReviewState = await requestJson(`/api/event-review?id=${encodeURIComponent(reviewId)}`);
        } catch {
          eventReviewState = null;
        }
      }

      renderEventDetailPage();
      renderLoginPage();
      return;
    }

    renderListingPage();
    renderLoginPage();
    renderProfilePage();
    syncLoginHeaderState();
    updateFavoritesBadge();
  })();
});
