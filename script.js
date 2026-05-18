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

  let currentSession = null;
  let sessionLoaded = false;

  const getSession = () => currentSession;

  const setSession = (session) => {
    currentSession = session;
  };

  const clearSession = () => {
    currentSession = null;
  };

  const loadSessionFromApi = async () => {
    try {
      const response = await requestJson('api/me.php');
      currentSession = response?.user ?? null;
    } catch {
      currentSession = null;
    } finally {
      sessionLoaded = true;
    }
  };

  const syncLogoutRequest = () => {
    void fetch('api/logout.php', {
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

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      throw new Error('Resposta inválida do servidor.');
    }

    if (!response.ok) {
      const error = new Error(payload?.message ?? 'Pedido inválido.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
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
      const response = await requestJson(`api/events.php?status=${encodeURIComponent(status)}`);
      if (Array.isArray(response.events)) {
        serverEventsState.items = response.events.map(normalizeServerEvent);
      }
    } catch {
      serverEventsState.items = [];
    } finally {
      serverEventsState.loaded = true;
      rerenderListingPage?.();
    }
  };

  const loadServerFavorites = async () => {
    try {
      const response = await requestJson('api/favorites.php');
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
      const response = await requestJson('api/admin/events.php?status=all');
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

  const loadOrganizerEvents = async () => {
    try {
      const response = await requestJson('api/events.php?scope=own&status=all');
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

  const getFavoriteIds = () => {
    const session = getSession();
    if (session && serverFavoritesState.loaded) {
      return [...serverFavoritesState.ids];
    }

    return [];
  };

  const setFavoriteIds = (favoriteIds) => {
    serverFavoritesState.ids = favoriteIds.map(normalizeEventId);
  };

  const isFavorite = (eventId) => getFavoriteIds().includes(normalizeEventId(eventId));

  const toggleFavorite = async (eventId) => {
    const session = getSession();
    const normalizedEventId = normalizeEventId(eventId);
    const favoriteIds = getFavoriteIds();
    const updatedFavoriteIds = favoriteIds.includes(normalizedEventId)
      ? favoriteIds.filter((favoriteId) => favoriteId !== normalizedEventId)
      : [...favoriteIds, normalizedEventId];

    setFavoriteIds(updatedFavoriteIds);

    if (session) {
      try {
        const response = await requestJson('api/favorites.php', {
          method: 'POST',
          body: JSON.stringify({ eventId: Number(eventId) })
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

  const isPastEvent = (event) => !event.isRecurring && getEventDateTime(event) < Date.now();

  const getDateBucketForDateTime = (dateTime, isRecurring = false) => {
    if (isRecurring) {
      return 'Periódicos';
    }

    const eventDateKey = getDateKey(new Date(dateTime));
    const todayKey = getDateKey(new Date());

    if (eventDateKey < todayKey) {
      return 'Passados';
    }

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

  const getFavoriteAriaLabel = (eventId) => (isFavorite(eventId) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos');

  const getFavoriteDetailLabel = (eventId) => (isFavorite(eventId) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos');

  const syncLoginHeaderState = (rootDocument = document) => {
    const session = getSession();
    const loginToggleBtn = rootDocument.getElementById('loginToggleBtn');
    const accountChip = rootDocument.getElementById('accountChip');

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
      if (session.accountType === 'admin') {
        const favoritesBtn = rootDocument.querySelector('.favorites-btn');
        if (favoritesBtn) {
          favoritesBtn.style.display = 'none';
        }
      }
      loginToggleBtn.href = '#';
      loginToggleBtn.setAttribute('aria-label', 'Terminar sessão');
      loginToggleBtn.dataset.logged = 'true';
      return;
    }

    accountChip.hidden = true;
    accountChip.style.display = 'none';
    accountChip.textContent = '';
    const favoritesBtn = rootDocument.querySelector('.favorites-btn');
    if (favoritesBtn) {
      favoritesBtn.style.display = '';
    }
    loginToggleBtn.href = 'login.html';
    loginToggleBtn.setAttribute('aria-label', 'Entrar');
    loginToggleBtn.dataset.logged = 'false';
  };

  const getListingEvents = () => {
    if (pageType === 'favorites') {
      return getFavoriteIds()
        .map((favoriteId) => getVisibleEvents().find((event) => event.id === favoriteId))
        .filter(Boolean);
    }

    return getVisibleEvents();
  };

  const getEventById = (eventId) => getAllEvents().find((event) => normalizeEventId(event.id) === normalizeEventId(eventId)) ?? null;

  const getEventDetailUrl = (eventId) => `event.html?id=${encodeURIComponent(eventId)}`;

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

  const buildRelatedEventCard = (event) => `
    <article class="event-card${isPastEvent(event) ? ' is-past' : ''}" tabindex="0" role="link" aria-label="Abrir evento ${event.title}" data-event-id="${event.id}" data-event-link="${getEventDetailUrl(event.id)}" data-category="${event.category}" data-date="${event.dateBucket}" data-location="${getEventDistrict(event)}" data-price="${event.priceType}" data-title="${event.title.toLowerCase()}">
      <div class="event-media">
        <span class="event-pill">${event.category}</span>
        <button class="favorite-btn${isFavorite(event.id) ? ' active' : ''}" type="button" aria-label="${getFavoriteAriaLabel(event.id)}" aria-pressed="${isFavorite(event.id) ? 'true' : 'false'}" data-event-id="${event.id}">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
        </button>
        <img src="${event.image}" alt="${event.title}" loading="lazy" />
      </div>
      <div class="event-body">
        <h2 class="event-title">${event.title}</h2>
        <div class="meta-list">
          <div class="meta-item">${iconCalendar}<span>${event.dateLabel}${event.endDateLabel ? ' — ' + event.endDateLabel : ''}</span></div>
          <div class="meta-item">${iconLocation}<span>${event.location}</span></div>
        </div>
        <div class="price-row">
          <span class="price ${event.priceType === 'Gratuito' ? 'free' : ''}">${event.priceLabel}</span>
          <span class="tagline">${event.views} visualizações</span>
        </div>
      </div>
    </article>
  `;

  const buildEventCard = (event) => `
    <article class="event-card${isPastEvent(event) ? ' is-past' : ''}" tabindex="0" role="link" aria-label="Abrir evento ${event.title}" data-event-id="${event.id}" data-event-link="${getEventDetailUrl(event.id)}" data-category="${event.category}" data-date="${event.dateBucket}" data-location="${getEventDistrict(event)}" data-price="${event.priceType}" data-title="${event.title.toLowerCase()}">
      <div class="event-media">
        <span class="event-pill">${event.category}</span>
        <button class="share-btn" type="button" aria-label="Partilhar evento" data-event-id="${event.id}">
          <svg viewBox="0 0 24 24"><path d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 3 4Zm-8 4a3 3 0 1 0-2.83-4H5a3 3 0 0 0 3 4Zm8 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 3 4Z"></path><path d="m7.5 9.5 8 4m-8 1 8-4"></path></svg>
        </button>
        <button class="favorite-btn${isFavorite(event.id) ? ' active' : ''}" type="button" aria-label="${getFavoriteAriaLabel(event.id)}" aria-pressed="${isFavorite(event.id) ? 'true' : 'false'}" data-event-id="${event.id}">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
        </button>
        <img src="${event.image}" alt="${event.title}" loading="lazy" />
      </div>
      <div class="event-body">
        <h2 class="event-title">${event.title}</h2>
        <div class="meta-list">
          <div class="meta-item">${iconCalendar}<span>${event.dateLabel}${event.endDateLabel ? ' — ' + event.endDateLabel : ''}</span></div>
          <div class="meta-item">${iconLocation}<span>${event.location}</span></div>
        </div>
        <div class="price-row">
          <span class="price ${event.priceType === 'Gratuito' ? 'free' : ''}">${event.priceLabel}</span>
          <span class="tagline">${event.views} visualizações</span>
        </div>
      </div>
    </article>
  `;

  const renderEventDetailPage = () => {
    const detailRoot = document.getElementById('eventDetailRoot');
    if (!detailRoot) {
      return;
    }

    const url = new URL(window.location.href);
    const eventId = url.searchParams.get('id');
    const event = eventId ? getEventById(eventId) : null;

    if (!event) {
      window.location.href = 'index.html';
      return;
    }

    void requestJson('api/event-views.php', {
      method: 'POST',
      body: JSON.stringify({ eventId: Number(event.id) })
    }).catch(() => {
      // Mantém a página funcional mesmo se o tracking de visualizações falhar.
    });

    const session = getSession();
    const relatedEvents = getVisibleEvents()
      .filter((item) => item.id !== event.id)
      .filter((item) => item.category === event.category || getEventDistrict(item) === getEventDistrict(event))
      .slice(0, 3);

    detailRoot.innerHTML = `
      <div class="event-detail-page">
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

          <section class="event-detail-hero">
            <img src="${event.image}" alt="${event.title}" />
            <div class="event-detail-hero-overlay"></div>
            <div class="event-detail-hero-inner">
              <h1>${event.title}</h1>
            </div>
          </section>

          <section class="event-detail-content">
            <article class="event-detail-card event-detail-about">
              <h2>Sobre o Evento</h2>
              <p>${event.description ?? 'Descrição indisponível no momento. Este evento faz parte da seleção cultural da plataforma.'}</p>
            </article>

            <aside class="event-detail-card event-detail-info">
              <h2>Informações</h2>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Data e Hora</span>
                <strong>${formatEventDetailDate(event)}${event.endDate ? ' — ' + formatApiDateLabel(event.endDate) : ''}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Localização</span>
                <strong>${event.location}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Organizador</span>
                <strong>${event.organizer ?? 'Organização do evento'}</strong>
              </div>

              <div class="event-detail-info-row">
                <span class="event-detail-info-label">Preço</span>
                <strong class="event-detail-price ${event.priceType === 'Gratuito' ? 'free' : ''}">${event.priceLabel}</strong>
              </div>

              <a class="event-detail-action primary" href="${event.ticketUrl ?? '#'}" ${event.ticketUrl ? 'target="_blank" rel="noopener noreferrer"' : ''}>Ver Bilhetes</a>
              <button class="event-detail-action secondary" id="eventDetailFavoriteBtn" type="button" data-event-id="${event.id}">${getFavoriteDetailLabel(event.id)}</button>
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
          ${session?.accountType === 'admin' ? '' : `
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

    const eventDetailFavoriteBtn = document.getElementById('eventDetailFavoriteBtn');
    if (eventDetailFavoriteBtn) {
      const updateDetailFavoriteLabel = () => {
        const isEventFavorite = isFavorite(event.id);
        eventDetailFavoriteBtn.textContent = isEventFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos';
        eventDetailFavoriteBtn.setAttribute('aria-pressed', String(isEventFavorite));
      };

      updateDetailFavoriteLabel();

      eventDetailFavoriteBtn.addEventListener('click', async () => {
        if (!getSession()) {
          window.location.href = 'login.html';
          return;
        }

        await toggleFavorite(event.id);
        updateDetailFavoriteLabel();
      });
    }

    syncLoginHeaderState(detailRoot.ownerDocument);
    bindEventCardActions(document.getElementById('relatedEventsGrid'));
  };

  const bindEventCardActions = (container, options = {}) => {
    if (!container) {
      return;
    }

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

        if (!getSession()) {
          window.location.href = 'login.html';
          return;
        }

        void (async () => {
          await toggleFavorite(eventId);
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

      const shareButton = target.closest('.share-btn');
      if (shareButton) {
        const eventId = shareButton.dataset.eventId;
        if (eventId) {
          void shareEvent(eventId);
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

      window.location.href = link;
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
      window.location.href = link;
    });
  };

  const renderListingPage = () => {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) {
      return;
    }

    const session = getSession();
    if (pageType === 'favorites' && !session) {
      window.location.href = 'login.html';
      return;
    }

    if (pageType === 'favorites' && session && !serverFavoritesState.loaded) {
      void loadServerFavorites();
    }

    bindEventCardActions(cardsGrid);

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

    const getUserDistrict = () => getDistrictKey(getSession()?.location ?? '') ?? 'Outros';

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
        if (session.accountType === 'admin') {
          const favoritesBtn = document.querySelector('.favorites-btn');
          if (favoritesBtn) {
            favoritesBtn.style.display = 'none';
          }
        }
        loginToggleBtn.href = '#';
        loginToggleBtn.setAttribute('aria-label', 'Terminar sessão');
        loginToggleBtn.dataset.logged = 'true';
        return;
      }

      accountChip.hidden = true;
      accountChip.style.display = 'none';
      accountChip.textContent = '';
      const favoritesBtn = document.querySelector('.favorites-btn');
      if (favoritesBtn) {
        favoritesBtn.style.display = '';
      }
      loginToggleBtn.href = 'login.html';
      loginToggleBtn.setAttribute('aria-label', 'Entrar');
      loginToggleBtn.dataset.logged = 'false';
    };

    const buildEventShareText = (event) => [
      event.title,
      event.dateLabel,
      event.location,
      `Ver mais: ${window.location.href}`
    ].join('\n');

    const shareEvent = async (eventId) => {
      const eventToShare = getAllEvents().find((item) => item.id === eventId);
      if (!eventToShare) {
        return;
      }

      const shareData = {
        title: eventToShare.title,
        text: buildEventShareText(eventToShare),
        url: window.location.href
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch {
          return;
        }
      }

      const shareText = `${shareData.title}\n${shareData.text}`;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
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

      if (selectedDate === 'Passados') {
        return !event.isRecurring && eventDateKey < todayKey;
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

    const renderCards = () => {
      const query = searchInput.value.trim().toLowerCase();
      const selectedCategory = categoryFilter?.value ?? 'Todos';
      const selectedDate = activeDateFilter;
      const selectedLocation = locationFilter?.value ?? 'Todos';
      const selectedPrice = priceFilter?.value ?? 'Todos';
      const currentSort = getCurrentSort();
      const userLocation = getUserLocation();

      const sourceEvents = getListingEvents();
      const filtered = sourceEvents.filter((event) => {
        if (pageType !== 'favorites' && selectedDate !== 'Passados' && isPastEvent(event)) {
          return false;
        }

        const matchesQuery = !query || [event.title, event.category, event.location, event.dateLabel, event.priceLabel].join(' ').toLowerCase().includes(query);
        const matchesCategory = selectedCategory === 'Todos' || event.category === selectedCategory;
        const matchesDate = matchesDateFilter(event, selectedDate);
        const matchesLocation = selectedLocation === 'Todos' || getEventDistrict(event) === selectedLocation;
        const matchesPrice = selectedPrice === 'Todos' || event.priceType === selectedPrice;
        return matchesQuery && matchesCategory && matchesDate && matchesLocation && matchesPrice;
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

      resultsCount.textContent = filtered.length;
      cardsGrid.innerHTML = filtered.map(buildEventCard).join('');

      if (emptyState) {
        emptyState.hidden = filtered.length > 0;
        emptyState.textContent = page.empty;
      }
    };

    rerenderListingPage = renderCards;

    [searchInput, categoryFilter, dateFilter, locationFilter, priceFilter].forEach((element) => {
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

    cardsGrid.addEventListener('click', (event) => {
      const shareButton = event.target.closest('.share-btn');
      if (shareButton) {
        const eventId = shareButton.dataset.eventId;
        if (eventId) {
          void shareEvent(eventId);
        }
        return;
      }

      const favoriteButton = event.target.closest('.favorite-btn');
      if (!favoriteButton) {
        return;
      }

      const eventId = favoriteButton.dataset.eventId;
      if (!eventId) {
        return;
      }

      if (!getSession()) {
        window.location.href = 'login.html';
        return;
      }

      void (async () => {
        await toggleFavorite(eventId);
        renderCards();
      })();
    });

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
    const loginTitle = document.getElementById('loginTitle');
    const authSubtitle = document.getElementById('authSubtitle');
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

    const setAuthMode = (mode) => {
      const isRegisterMode = mode === 'register';

      if (loginPanel) {
        loginPanel.hidden = isRegisterMode;
      }

      if (registerPanel) {
        registerPanel.hidden = !isRegisterMode;
      }

      if (showLoginBtn) {
        showLoginBtn.classList.toggle('active', !isRegisterMode);
        showLoginBtn.setAttribute('aria-selected', String(!isRegisterMode));
      }

      if (showRegisterBtn) {
        showRegisterBtn.classList.toggle('active', isRegisterMode);
        showRegisterBtn.setAttribute('aria-selected', String(isRegisterMode));
      }

      if (loginTitle) {
        loginTitle.textContent = isRegisterMode ? 'Criar conta' : 'Bem-vindo';
      }

      if (authSubtitle) {
        authSubtitle.textContent = isRegisterMode
          ? 'Preenche os teus dados para começar'
          : 'Inicie sessão na sua conta';
      }

      updateAuthMessage('');
      updateRegisterMessage('');

      if (!isRegisterMode) {
        emailInput?.focus();
        return;
      }

      registerNameInput?.focus();
    };

    const setRegisterPanelVisible = (isVisible) => {
      if (!registerPanel) {
        return;
      }

      setAuthMode(isVisible ? 'register' : 'login');
    };

    const getSelectedRegisterAccountType = () => registerAccountTypeInputs.find((input) => input.checked)?.value ?? 'lambda';

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      try {
        const response = await requestJson('api/login.php', {
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
          const response = await requestJson('api/register.php', {
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
                    <div class="profile-avatar" id="profileAvatar">${initials}</div>
                    <div>
                      <strong id="profileName">${session.name}</strong>
                      <p id="profileRole">${session.roleLabel}</p>
                      <p id="profileEmail">${session.email}</p>
                    </div>
                  </div>

                  <div class="profile-location-box">
                    <label for="profileLocationInput">Localização para proximidade</label>
                    <div class="profile-location-row">
                      <input id="profileLocationInput" type="text" placeholder="Ex.: Lisboa" value="${session.location ?? ''}" />
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
        ${session.accountType === 'admin' ? '' : `
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
              const response = await requestJson('api/me.php', {
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
      const popularCategories = Array.from(
        getVisibleEvents().reduce((categoryMap, event) => {
          const categoryName = event.category ?? 'Outros';
          categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + 1);
          return categoryMap;
        }, new Map()).entries()
      )
        .map(([name, count]) => ({ name, count }))
        .sort((firstCategory, secondCategory) => {
          if (secondCategory.count !== firstCategory.count) {
            return secondCategory.count - firstCategory.count;
          }

          return firstCategory.name.localeCompare(secondCategory.name, 'pt-PT');
        })
        .slice(0, 5);

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
          const response = await requestJson('api/admin/users.php');
          if (Array.isArray(response.users)) {
            adminUsers = response.users.map(mapAdminUser);
            renderAdminUsersTable();
          }
        } catch {
          // Mantém os dados de fallback se a API não responder.
        }
      };

      const loadAdminOrganizers = async () => {
        try {
          const response = await requestJson('api/admin/organizers.php');
          if (Array.isArray(response.organizers)) {
            adminOrganizers = response.organizers.map((organizer) => mapAdminOrganizer({
              name: organizer.name,
              email: organizer.email,
              registeredAt: organizer.registeredAt,
              eventCount: organizer.eventCount,
              status: organizer.status
            }));
            renderAdminOrganizersTable();
          }
        } catch {
          // Mantém os dados de fallback se a API não responder.
        }
      };

      const adminKpiIcons = {
        users: '<svg viewBox="0 0 24 24"><path d="M4 20c1.8-4 4.9-6 8-6s6.2 2 8 6"></path><circle cx="12" cy="8" r="4"></circle><circle cx="6.5" cy="10" r="2.5"></circle><circle cx="17.5" cy="10" r="2.5"></circle></svg>',
        calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 9h16"></path></svg>',
        pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v5l3 2"></path></svg>',
        trend: '<svg viewBox="0 0 24 24"><path d="m4 16 6-6 4 4 6-6"></path><path d="M20 8h-6"></path></svg>'
      };

      const adminStatsMarkup = adminDashboard.stats.map((item) => `
        <article class="admin-kpi-card">
          <div class="admin-kpi-icon ${item.icon}">${adminKpiIcons[item.icon] ?? ''}</div>
          <strong>${item.value}</strong>
          <span>${item.label}</span>
        </article>
      `).join('');

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
          <div class="admin-modal-actions">
            <button class="admin-modal-secondary" type="button" data-admin-event-close>Cancelar</button>
            <button class="admin-modal-primary danger" type="button" id="adminEventActionConfirmBtn">Confirmar</button>
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
              <div class="admin-kpi-grid">${adminStatsMarkup}</div>

              <div class="admin-section-card">
                <h2>Categorias Mais Populares</h2>
                <div class="admin-category-list">
                  ${popularCategories.map((item, index) => `
                    <div class="admin-category-row">
                      <div class="admin-category-rank">${index + 1}</div>
                      <strong>${item.name}</strong>
                      <span>${item.count} evento${item.count > 1 ? 's' : ''}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
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

      profileMobileNav.innerHTML = `
        <a href="index.html">
          <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
          Início
        </a>
        <a href="favorites.html">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
          Favoritos
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
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.registered}</td>
            <td>${user.events}</td>
            <td><span class="admin-pill ${isActive ? 'success' : 'danger'}">${getUserStatusLabel(isActive)}</span></td>
            <td>
              <div class="admin-actions-group">
                <button type="button" class="admin-icon-btn" aria-label="Ver utilizador" data-admin-user-view="${user.email}">
                  <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button type="button" class="admin-icon-btn" aria-label="${userAction.ariaLabel}" data-admin-user-action="${userAction.action}" data-admin-user-email="${user.email}">
                  ${userAction.icon}
                </button>
              </div>
            </td>
          </tr>
        `;
        }).join('');
      };

      const adminEventActionModalTitle = adminEventActionModal.querySelector('#adminEventActionModalTitle');
      const adminEventActionModalText = adminEventActionModal.querySelector('#adminEventActionModalText');
      const adminEventActionConfirmBtn = adminEventActionModal.querySelector('#adminEventActionConfirmBtn');
      const adminPendingEventsContainer = profileRoot.querySelector('[data-admin-pending-events]');
      const adminPublishedEventsTableBody = profileRoot.querySelector('[data-admin-published-events]');
      const adminOrganizerAvatar = adminOrganizerProfileModal.querySelector('#adminOrganizerAvatar');
      const adminOrganizerName = adminOrganizerProfileModal.querySelector('#adminOrganizerName');
      const adminOrganizerEmail = adminOrganizerProfileModal.querySelector('#adminOrganizerEmail');
      const adminOrganizerRegistered = adminOrganizerProfileModal.querySelector('#adminOrganizerRegistered');
      const adminOrganizerCreated = adminOrganizerProfileModal.querySelector('#adminOrganizerCreated');
      const adminOrganizerStatus = adminOrganizerProfileModal.querySelector('#adminOrganizerStatus');
      const adminOrganizerActionModalTitle = adminOrganizerActionModal.querySelector('#adminOrganizerActionModalTitle');
      const adminOrganizerActionModalText = adminOrganizerActionModal.querySelector('#adminOrganizerActionModalText');
      const adminOrganizerActionConfirmBtn = adminOrganizerActionModal.querySelector('#adminOrganizerActionConfirmBtn');
      const adminOrganizersTableBody = profileRoot.querySelector('[data-admin-organizers]');
      let selectedAdminOrganizerEmail = '';
      let selectedAdminOrganizerAction = 'suspend';

      const getAdminEventById = (eventId) => adminEventsState.items.find((event) => String(event.id) === String(eventId)) ?? null;
      const getAdminOrganizerByEmail = (email) => adminOrganizers.find((organizer) => organizer.email === email) ?? null;

      const getAdminPendingEvents = () => adminEventsState.items.filter((event) => normalizeAdminEventStatus(event.status) === 'pending');

      const getAdminPublishedEvents = () => adminEventsState.items.filter((event) => ['active', 'hidden'].includes(normalizeAdminEventStatus(event.status)));

      const renderAdminModerationLists = () => {
        if (adminPendingEventsContainer) {
          const pendingEvents = getAdminPendingEvents();
          adminPendingEventsContainer.innerHTML = pendingEvents.length > 0
            ? pendingEvents.map((event) => `
                <article class="admin-review-item">
                  <div>
                    <strong>${event.title}</strong>
                    <p>Categoria: ${event.category}</p>
                    <p>Data do evento: ${event.dateLabel ?? event.date ?? 'A definir'}${event.endDateLabel ? ' — ' + event.endDateLabel : ''}</p>
                    <p>Organizador: ${event.organizerName ?? event.organizerEmail ?? 'Organizador'}</p>
                    <p>Submetido em: ${event.submittedAt ?? 'Pendente'}</p>
                  </div>
                  <div class="admin-review-actions">
                    <button type="button" class="admin-approve-btn" data-admin-event-action="approve" data-admin-event-id="${event.id}">✓ Aprovar</button>
                    <button type="button" class="admin-reject-btn" data-admin-event-action="reject" data-admin-event-id="${event.id}">✕ Recusar</button>
                  </div>
                </article>
              `).join('')
            : '<div class="admin-empty-state">Não existem eventos pendentes de aprovação.</div>';
        }

        if (adminPublishedEventsTableBody) {
          const publishedEvents = getAdminPublishedEvents();
          adminPublishedEventsTableBody.innerHTML = publishedEvents.length > 0
            ? publishedEvents.map((event) => {
                const status = normalizeAdminEventStatus(event.status);
                const toggleAction = status === 'hidden' ? 'show' : 'hide';
                const toggleLabel = status === 'hidden' ? 'Mostrar evento' : 'Ocultar evento';
                const toggleIcon = status === 'hidden'
                  ? '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
                  : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M8.2 8.2C5.1 9.8 3 12 3 12s4 7 9 7c1.7 0 3.2-.4 4.6-1.1"></path><path d="M14.1 5.1C15.2 5 16 5 16 5c5 0 9 7 9 7a17.2 17.2 0 0 1-3.5 4.1"></path></svg>';

                return `
                  <tr>
                    <td>${event.title}</td>
                    <td>${event.category}</td>
                    <td>${event.dateLabel ?? event.date ?? 'A definir'}${event.endDateLabel ? ' — ' + event.endDateLabel : ''}</td>
                    <td>${event.organizerName ?? event.organizerEmail ?? 'Organizador'}</td>
                    <td><span class="admin-pill ${status === 'hidden' || status === 'pending' ? 'warning' : 'success'}">${normalizeAdminEventStatusLabel(status)}</span></td>
                    <td>
                      <div class="admin-actions-group">
                        <button type="button" class="admin-icon-btn" aria-label="${toggleLabel}" data-admin-event-action="${toggleAction}" data-admin-event-id="${event.id}">${toggleIcon}</button>
                        <button type="button" class="admin-icon-btn danger" aria-label="Eliminar evento" data-admin-event-action="delete" data-admin-event-id="${event.id}">✕</button>
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
              <td>${organizer.name}</td>
              <td>${organizer.email}</td>
              <td>${organizer.registered}</td>
              <td>${organizer.created}</td>
              <td><span class="admin-pill ${isActive ? 'success' : organizer.statusCode === 'pendente' ? 'warning' : 'danger'}">${organizer.status}</span></td>
              <td>
                <div class="admin-actions-group">
                  <button type="button" class="admin-icon-btn" aria-label="Ver organizador" data-admin-organizer-view="${organizer.email}">
                    <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                  <button type="button" class="admin-icon-btn" aria-label="${organizerAction.ariaLabel}" data-admin-organizer-action="${organizerAction.action}" data-admin-organizer-email="${organizer.email}">${organizerAction.icon}</button>
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

        if (action === 'approve') {
          adminEventActionModalTitle.textContent = 'Aprovar evento?';
          adminEventActionModalText.textContent = `Pretendes aprovar o evento ${event.title} para que fique visível na home?`;
          adminEventActionConfirmBtn.textContent = 'Sim, aprovar';
        } else if (action === 'reject') {
          adminEventActionModalTitle.textContent = 'Recusar evento?';
          adminEventActionModalText.textContent = `Pretendes recusar o evento ${event.title}? Ele será removido da moderação.`;
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
            await requestJson('api/admin/organizers.php', {
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
            const response = await requestJson('api/admin/events.php', {
              method: 'PATCH',
              body: JSON.stringify({
                eventId: Number(selectedAdminEventId),
                action: selectedAdminEventAction
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

      [adminUserProfileModal, adminOrganizerProfileModal, adminDeactivateModal, adminEventActionModal, adminOrganizerActionModal].forEach((modalElement) => {
        modalElement?.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          if (target.closest('[data-admin-modal-close], [data-admin-confirm-close], [data-admin-event-close], [data-admin-organizer-close], [data-admin-organizer-action-close]')) {
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
            await requestJson('api/admin/users.php', {
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

        const createdEvents = getOrganizerCreatedEvents();

        tableBody.innerHTML = createdEvents.map((event) => `
          <tr>
            <td class="organizer-event-title">${event.title}</td>
            <td>${event.category}</td>
            <td>${event.date ?? event.dateLabel ?? ''}</td>
            <td>${event.location}</td>
            <td><span class="organizer-badge ${event.status ?? 'published'}">${event.statusLabel ?? 'Publicado'}</span></td>
            <td><span class="organizer-metric"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path></svg>${event.views ?? 0}</span></td>
            <td>
              <div class="organizer-actions-cell" aria-label="Ações do evento">
                <button type="button" class="icon-btn" data-organizer-event-id="${event.id}" data-organizer-event-action="view" aria-label="Ver evento">
                  <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button type="button" class="icon-btn" data-organizer-event-id="${event.id}" data-organizer-event-action="edit" aria-label="Editar evento">
                  <svg viewBox="0 0 24 24"><path d="M4 20h4l10-10a2.5 2.5 0 0 0-4-4L4 16v4Z"></path></svg>
                </button>
                <button type="button" class="icon-btn" data-organizer-event-id="${event.id}" data-organizer-event-action="manage" aria-label="Gerir evento">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      };

      const refreshOrganizerEvents = async () => {
        await loadOrganizerEvents();
        renderOrganizerTable();
      };

      // Organizer event action modal (inativar / eliminar)
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
          await requestJson('api/events.php', {
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
          await requestJson('api/events.php', {
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
            openOrganizerEdit(eventObj);
          }
          return;
        }

        if (action === 'manage') {
          openOrganizerEventAction(eventId);
          return;
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

              <label>
                Localização
                <input id="organizerEventLocation" type="text" placeholder="Ex.: Casa da Música, Porto" required />
              </label>

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

              <label class="organizer-image-field">
                Imagens do evento
                <input id="organizerEventImages" type="file" accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.svg,.tif,.tiff,.heic,.heif" multiple />
                <span class="organizer-image-hint">A primeira imagem selecionada será usada como vitrine do evento.</span>
              </label>

              <label>
                Link para bilhetes
                <input id="organizerEventTicketUrl" type="url" placeholder="https://..." required />
              </label>

              <label>
                Descrição do evento
                <textarea id="organizerEventDescription" rows="5" placeholder="Escreve uma descrição curta do evento (programa, artistas, público-alvo, etc.)"></textarea>
              </label>

              <div class="organizer-create-actions">
                <button class="organizer-create-submit" type="submit">Criar Evento</button>
                <button class="organizer-create-cancel" type="button" id="organizerCreateCancelBtn">Cancelar</button>
              </div>

              <p class="organizer-create-message" id="organizerCreateMessage" role="status" aria-live="polite"></p>
            </form>
          </section>

          <div class="organizer-panel" id="eventos-organizador">
            <table class="organizer-table" aria-label="Lista de eventos do organizador">
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
          </div>
        </div>
      `;

      profileMobileNav.innerHTML = `
        <a href="index.html">
          <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10.5V20h12v-9.5"></path></svg>
          Início
        </a>
        <a href="favorites.html">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
          Favoritos
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
      const organizerEventPriceValue = document.getElementById('organizerEventPriceValue');
      const organizerEventImages = document.getElementById('organizerEventImages');
      const organizerEventTicketUrl = document.getElementById('organizerEventTicketUrl');
      const organizerEventDescription = document.getElementById('organizerEventDescription');
      const organizerEventEndDate = document.getElementById('organizerEventEndDate');
      const organizerEventEndTime = document.getElementById('organizerEventEndTime');

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

      if (organizerCreateForm) {
        let editingOrganizerEventId = null;

        const openOrganizerEdit = (eventObj) => {
          editingOrganizerEventId = String(eventObj.id ?? '');
          organizerEventTitle.value = eventObj.title ?? '';
          organizerEventCategory.value = eventObj.category ?? 'Outros';
          if (eventObj.isRecurring) {
            organizerEventDateType.value = 'recurring';
            organizerRecurringField.hidden = false;
            organizerRecurringField.classList.remove('is-hidden');
            organizerEventRecurringTime.value = eventObj.recurringPattern || '20:00';
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
          organizerEventLocation.value = eventObj.location ?? '';
          organizerEventPriceType.value = eventObj.priceType ?? 'Pago';
          organizerEventPriceValue.value = eventObj.price ?? '';
          organizerEventTicketUrl.value = eventObj.ticketUrl ?? '';
          // Não preencher descrição ao editar — descrição apenas ao criar um novo evento
          toggleOrganizerCreatePanel(true);
          updateOrganizerCreateVisibility();
        };

        organizerCreateForm.addEventListener('submit', async (event) => {
          event.preventDefault();

          const title = organizerEventTitle?.value.trim() ?? '';
          const description = organizerEventDescription?.value.trim() ?? '';
          const category = organizerEventCategory?.value ?? 'Outros';
          const dateType = organizerEventDateType?.value ?? 'fixed';
          const location = organizerEventLocation?.value.trim() ?? '';
          const priceType = organizerEventPriceType?.value ?? 'Gratuito';
          const ticketUrl = organizerEventTicketUrl?.value.trim() ?? '';
          const selectedImageFiles = Array.from(organizerEventImages?.files ?? []);
          const invalidImageFiles = selectedImageFiles.filter((file) => !isLikelyImageFile(file));
          const selectedRecurringDays = Array.from(document.querySelectorAll('input[name="organizerRecurringDays"]'))
            .filter((input) => input.checked)
            .map((input) => input.value);

          const isPaid = priceType === 'Pago';
          if (invalidImageFiles.length > 0) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = 'Seleciona apenas ficheiros de imagem válidos.';
            }
            return;
          }

          if (!title || !location || (isPaid && !ticketUrl)) {
            if (organizerCreateMessage) {
              organizerCreateMessage.textContent = isPaid
                ? 'Preenche o título, a localização e o link de bilhetes.'
                : 'Preenche o título e a localização.';
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

          const imagePayload = selectedImageFiles.length > 0
            ? await readFilesAsDataUrls(selectedImageFiles)
            : [];

          try {
            if (editingOrganizerEventId) {
              await requestJson('api/events.php', {
                method: 'PATCH',
                body: JSON.stringify({
                  action: 'update',
                  eventId: Number(editingOrganizerEventId),
                  title,
                  startDate: formatApiDateTime(eventDate),
                  endDate: endDatePayload,
                  price: priceType === 'Pago' ? Number(organizerEventPriceValue?.value || 0) : 0,
                  ticketUrl,
                  category,
                  locationStreet: location,
                  locationCity: getDistrictKey(location) ?? 'Lisboa',
                  locationDistrict: getDistrictKey(location) ?? 'Lisboa',
                  isRecurring,
                  recurringPattern: isRecurring ? 'semanal' : '',
                  recurringDays: isRecurring ? recurringDays.join(',') : '',
                  images: imagePayload
                })
              });
            } else {
              await requestJson('api/events.php', {
                method: 'POST',
                body: JSON.stringify({
                  title,
                  description,
                  startDate: formatApiDateTime(eventDate),
                  endDate: endDatePayload,
                  price: priceType === 'Pago' ? Number(organizerEventPriceValue?.value || 0) : 0,
                  ticketUrl,
                  category,
                  locationStreet: location,
                  locationCity: getDistrictKey(location) ?? 'Lisboa',
                  locationDistrict: getDistrictKey(location) ?? 'Lisboa',
                  isRecurring,
                  recurringPattern: isRecurring ? 'semanal' : '',
                  recurringDays: isRecurring ? recurringDays.join(',') : '',
                  images: imagePayload
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
            organizerCreateMessage.textContent = 'Evento criado com sucesso e pendente de aprovação.';
          }

          organizerCreateForm.reset();
          editingOrganizerEventId = null;
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

      updateOrganizerCreateVisibility();
      void refreshOrganizerEvents();

      return;
    }

    window.location.href = 'index.html';
  };

  void (async () => {
    await loadSessionFromApi();

    if (pageType === 'event' || pageType === 'home' || pageType === 'events' || pageType === 'favorites') {
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
      renderEventDetailPage();
      renderLoginPage();
      return;
    }

    renderListingPage();
    renderLoginPage();
    renderProfilePage();
  })();
});
