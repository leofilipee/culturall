/*
 * Cultur'All — Interatividade da página inicial e do Observatório
 * ------------------------------------------------------------
 * Destaques em carrossel, chips de filtro rápido, vista de mapa
 * (Leaflet + OpenStreetMap), sugestões de pesquisa, animações de
 * entrada dos cartões e gráficos do Observatório (Chart.js).
 * Usa a ponte window.CulturAll publicada pelo script.js.
 */
document.addEventListener('DOMContentLoaded', () => {
  const pageType = document.body.dataset.page ?? (document.body.classList.contains('profile-page') ? 'profile' : 'home');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cores por categoria (ordem categórica fixa, validada para daltonismo).
  // As categorias para além das 8 principais partilham o cinzento neutro.
  const categoryColors = {
    'Festivais': '#eb6834',
    'Concertos': '#2a78d6',
    'Gastronomia': '#1baf7a',
    'Teatro': '#eda100',
    'Arte e Exposições': '#e87ba4',
    'Família': '#008300',
    'Cinema': '#6250d6',
    'Dança': '#e34948'
  };
  const neutralColor = '#8a8178';
  const getCategoryColor = (category) => categoryColors[category] ?? neutralColor;

  const categoryIcons = {
    'Todos': '✨',
    'Arte e Exposições': '🎨',
    'Bem Estar': '🧘',
    'Cinema': '🎬',
    'Comédia': '😂',
    'Concertos': '🎵',
    'Dança': '💃',
    'Festivais': '🎪',
    'Gastronomia': '🍷',
    'Literatura': '📚',
    'Mercados e Feiras': '🛍️',
    'Moda': '👗',
    'Outros': '🌀',
    'Família': '👨‍👩‍👧',
    'Teatro': '🎭'
  };

  // Coordenadas aproximadas por distrito, usadas quando o evento não tem latitude/longitude.
  const districtCoordinates = {
    Aveiro: [40.6405, -8.6538], Beja: [38.0151, -7.8632], Braga: [41.5454, -8.4265],
    Bragança: [41.8061, -6.7567], 'Castelo Branco': [39.8222, -7.4909], Coimbra: [40.2033, -8.4103],
    Évora: [38.5714, -7.9135], Faro: [37.0194, -7.9304], Guarda: [40.5373, -7.2676],
    Leiria: [39.7436, -8.8071], Lisboa: [38.7223, -9.1393], Portalegre: [39.2967, -7.4285],
    Porto: [41.1579, -8.6291], Santarém: [39.2362, -8.6859], Setúbal: [38.5244, -8.8882],
    'Viana do Castelo': [41.6932, -8.8329], 'Vila Real': [41.3006, -7.7441], Viseu: [40.6566, -7.9125]
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const formatShortDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
  };

  const formatRange = (event) => {
    const start = formatShortDate(event.eventDate);
    const end = event.endDate ? formatShortDate(event.endDate) : '';
    return end && end !== start ? `${start} – ${end}` : start;
  };

  const whenBridgeReady = (callback) => {
    if (window.CulturAll) {
      callback(window.CulturAll);
      return;
    }

    document.addEventListener('culturall:events-ready', () => callback(window.CulturAll), { once: true });
  };

  const dispatchChange = (element) => {
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /* ---------- Animação de entrada dos cartões ---------- */
  const revealObserver = 'IntersectionObserver' in window && !prefersReducedMotion
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 })
    : null;

  // Cartões já animados não voltam a animar quando a lista é redesenhada (ex.: ao marcar favorito).
  const revealedIds = new Set();

  const observeCards = (root = document) => {
    root.querySelectorAll('.event-card:not(.skeleton-card):not(.revealed)').forEach((card) => {
      const cardId = card.dataset.eventId;
      if (cardId && revealedIds.has(cardId)) {
        card.classList.add('revealed');
        return;
      }

      if (cardId) {
        revealedIds.add(cardId);
      }

      if (revealObserver) {
        card.classList.add('will-reveal');
        revealObserver.observe(card);
      } else {
        card.classList.add('revealed');
      }
    });
  };

  // Pequena animação no coração ao marcar favorito.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.favorite-btn') : null;
    if (!button) {
      return;
    }

    button.classList.remove('pop');
    void button.offsetWidth;
    button.classList.add('pop');
  });

  if (pageType === 'home') {
    initHome();
  }

  if (pageType === 'event' || pageType === 'profile') {
    initGlobalSearch();
  }

  // Células cortadas com "…" mostram o texto completo ao passar o rato.
  document.addEventListener('mouseover', (event) => {
    const cell = event.target instanceof Element ? event.target.closest('.admin-table td, .organizer-table td') : null;
    if (cell && !cell.title && cell.scrollWidth > cell.clientWidth) {
      cell.title = cell.textContent.trim();
    }
  });

  if (pageType === 'favorites' || pageType === 'event') {
    document.addEventListener('culturall:cards-rendered', () => observeCards());
    whenBridgeReady(() => setTimeout(() => observeCards(), 60));
  }

  if (pageType === 'stats') {
    whenBridgeReady(initStats);
  }

  // O Observatório vive agora no Dashboard do perfil (administrador e organizador).
  window.CulturAllObservatory = {
    mount: (root) => whenBridgeReady((bridge) => initStats(bridge, root))
  };
  window.CulturAllAnalytics = {
    mount: (root, options) => initAnalytics(root, options)
  };
  document.dispatchEvent(new CustomEvent('culturall:enhancements-ready'));

  /* =========================================================
   * Pesquisa da barra de navegação fora da página inicial:
   * Enter (ou clicar na sugestão) leva à lista com a pesquisa aplicada
   * ========================================================= */
  function initGlobalSearch() {
    const searchUrl = (query) => `index.html?q=${encodeURIComponent(query)}#eventos`;
    const isSearchInput = (element) => element instanceof HTMLInputElement && element.matches('.search-wrap input');

    const boxFor = (input) => {
      const wrap = input.closest('.search-wrap');
      let box = wrap.querySelector('.search-suggestions');
      if (!box) {
        box = document.createElement('div');
        box.className = 'search-suggestions';
        box.hidden = true;
        wrap.appendChild(box);
      }

      return box;
    };

    // Sugestões pedidas ao servidor (leve: no máximo 5 eventos), com um pequeno atraso para não pedir a cada letra.
    const cache = new Map();
    const fetchMatches = (query, signal) => {
      const key = query.toLowerCase();
      if (cache.has(key)) {
        return Promise.resolve(cache.get(key));
      }

      return fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: 'same-origin', signal })
        .then((response) => (response.ok ? response.json() : { events: [] }))
        .then((data) => {
          const list = Array.isArray(data.events) ? data.events : [];
          cache.set(key, list);
          return list;
        });
    };

    let timer = null;
    let controller = null;

    document.addEventListener('input', (event) => {
      if (!isSearchInput(event.target)) {
        return;
      }

      const input = event.target;
      const box = boxFor(input);
      const query = input.value.trim();
      clearTimeout(timer);
      controller?.abort();
      if (!query) {
        box.hidden = true;
        return;
      }

      const searchRow = (matches) => `<a class="suggestion suggestion-search" href="${searchUrl(query)}"><span><strong>Ver todos os resultados para “${escapeHtml(query)}”</strong><small>${matches ? 'Abrir a lista completa' : 'Procurar na página inicial'}</small></span></a>`;
      if (!cache.has(query.toLowerCase())) {
        box.innerHTML = `<p class="suggestion-heading">A procurar…</p>${searchRow(false)}`;
        box.hidden = false;
      }

      timer = setTimeout(async () => {
        controller = new AbortController();
        let matches = [];
        try {
          matches = await fetchMatches(query, controller.signal);
        } catch (error) {
          if (error?.name === 'AbortError') {
            return;
          }
        }

        if (input.value.trim() !== query) {
          return; // a pesquisa mudou entretanto
        }

        box.innerHTML = (matches.length ? '<p class="suggestion-heading">Sugestões</p>' : '')
          + matches.map((item) => `
          <a class="suggestion" role="option" href="event.html?id=${encodeURIComponent(item.id)}&src=pesquisa">
            ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ''}
            <span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${categoryIcons[item.category] ?? ''} ${escapeHtml(item.category)} · ${escapeHtml(item.dateLabel || '')} · ${escapeHtml(item.city || '')}</small>
            </span>
          </a>`).join('')
          + searchRow(matches.length > 0);
        box.hidden = false;
      }, 120);
    });

    document.addEventListener('keydown', (event) => {
      if (!isSearchInput(event.target)) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        window.location.href = searchUrl(event.target.value.trim());
      } else if (event.key === 'Escape') {
        boxFor(event.target).hidden = true;
      }
    });

    document.addEventListener('focusout', (event) => {
      if (isSearchInput(event.target)) {
        setTimeout(() => { boxFor(event.target).hidden = true; }, 150);
      }
    });
  }

  /* =========================================================
   * Página inicial
   * ========================================================= */
  function initHome() {
    const categoryFilter = document.getElementById('categoryFilter');
    const dateFilter = document.getElementById('dateFilter');
    const priceFilter = document.getElementById('priceFilter');
    const locationFilter = document.getElementById('locationFilter');
    const searchInput = document.getElementById('searchInput');
    const cardsGrid = document.getElementById('cardsGrid');
    const mapWrap = document.getElementById('eventsMapWrap');
    let lastRendered = { events: [] };
    let currentView = 'list';

    /* ---------- Chips de categoria e de data ---------- */
    const categoryChips = document.getElementById('categoryChips');
    const dateChips = document.getElementById('dateChips');

    const buildCategoryChips = (events) => {
      if (!categoryChips || !categoryFilter) {
        return;
      }

      const counts = events.reduce((acc, event) => {
        acc[event.category] = (acc[event.category] ?? 0) + 1;
        return acc;
      }, {});
      const upcomingTotal = events.length;

      // Categorias com eventos primeiro; as restantes mantêm a ordem do filtro.
      const options = [...categoryFilter.options].map((option) => option.value);
      const ordered = ['Todos', ...options.filter((value) => value !== 'Todos').sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))];

      categoryChips.innerHTML = ordered.map((value) => {
        const count = value === 'Todos' ? upcomingTotal : (counts[value] ?? 0);
        const isActive = categoryFilter.value === value;
        return `
          <button type="button" class="chip${isActive ? ' active' : ''}${count === 0 && value !== 'Todos' ? ' muted' : ''}" data-category="${escapeHtml(value)}" aria-pressed="${isActive}">
            <span class="chip-icon" aria-hidden="true">${categoryIcons[value] ?? '•'}</span>
            ${escapeHtml(value)}
            ${count > 0 ? `<span class="chip-count">${count}</span>` : ''}
          </button>`;
      }).join('');
    };

    const dateChipOptions = [
      { label: 'Qualquer data', type: 'date', value: 'Todos' },
      { label: 'Hoje', type: 'date', value: 'Hoje' },
      { label: 'Esta semana', type: 'date', value: 'Esta semana' },
      { label: 'Este mês', type: 'date', value: 'Este mês' },
      { label: 'Gratuitos', type: 'price', value: 'Gratuito' }
    ];

    const buildDateChips = () => {
      if (!dateChips) {
        return;
      }

      dateChips.innerHTML = dateChipOptions.map((option) => {
        const isActive = option.type === 'price'
          ? priceFilter?.value === option.value
          : dateFilter?.value === option.value;
        return `<button type="button" class="chip chip-small${isActive ? ' active' : ''}" data-chip-type="${option.type}" data-value="${option.value}" aria-pressed="${isActive}">${option.label}</button>`;
      }).join('');
    };

    categoryChips?.addEventListener('click', (event) => {
      const chip = event.target instanceof Element ? event.target.closest('.chip') : null;
      if (!chip || !categoryFilter) {
        return;
      }

      categoryFilter.value = chip.dataset.category;
      dispatchChange(categoryFilter);
      chip.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    });

    dateChips?.addEventListener('click', (event) => {
      const chip = event.target instanceof Element ? event.target.closest('.chip') : null;
      if (!chip) {
        return;
      }

      if (chip.dataset.chipType === 'price' && priceFilter) {
        priceFilter.value = priceFilter.value === chip.dataset.value ? 'Todos' : chip.dataset.value;
        dispatchChange(priceFilter);
      } else if (dateFilter) {
        dateFilter.value = chip.dataset.value;
        dispatchChange(dateFilter);
      }
    });

    /* ---------- Limpar filtros ---------- */
    document.addEventListener('click', (event) => {
      const resetButton = event.target instanceof Element ? event.target.closest('[data-reset-filters]') : null;
      if (!resetButton) {
        return;
      }

      [categoryFilter, dateFilter, priceFilter, locationFilter].forEach((select) => {
        if (select) {
          select.value = 'Todos';
          dispatchChange(select);
        }
      });

      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    /* ---------- Destaques (carrossel) ---------- */
    const featuredTrack = document.getElementById('featuredTrack');
    const featuredDots = document.getElementById('featuredDots');
    const featuredControls = document.getElementById('featuredControls');
    const featuredSection = document.getElementById('featured');
    let featuredIndex = 0;
    let featuredTimer = null;
    let featuredCount = 0;

    const pickFeatured = (events) => {
      const bridge = window.CulturAll;
      return events
        .filter((event) => !bridge.isPastEvent(event))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);
    };

    const goToSlide = (index) => {
      if (!featuredTrack || featuredCount === 0) {
        return;
      }

      featuredIndex = (index + featuredCount) % featuredCount;
      featuredTrack.style.transform = `translateX(-${featuredIndex * 100}%)`;
      featuredTrack.querySelectorAll('.featured-slide').forEach((slide, slideIndex) => {
        const isCurrent = slideIndex === featuredIndex;
        slide.classList.toggle('current', isCurrent);
        slide.setAttribute('aria-hidden', String(!isCurrent));
        slide.querySelectorAll('a, button').forEach((element) => {
          element.tabIndex = isCurrent ? 0 : -1;
        });
      });
      featuredDots?.querySelectorAll('button').forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === featuredIndex);
        dot.setAttribute('aria-current', String(dotIndex === featuredIndex));
      });
    };

    const stopAutoplay = () => {
      clearInterval(featuredTimer);
      featuredTimer = null;
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (featuredCount > 1 && !prefersReducedMotion) {
        featuredTimer = setInterval(() => goToSlide(featuredIndex + 1), 6000);
      }
    };

    const buildFeatured = (events) => {
      if (!featuredTrack || !featuredSection) {
        return;
      }

      const featured = pickFeatured(events);
      featuredCount = featured.length;
      if (featuredCount === 0) {
        featuredSection.hidden = true;
        return;
      }

      const bridge = window.CulturAll;
      featuredTrack.innerHTML = featured.map((event, index) => {
        const timing = bridge.getEventTiming(event);
        const isFav = bridge.isFavorite(event.id);
        return `
          <article class="featured-slide" role="group" aria-roledescription="destaque" aria-label="${index + 1} de ${featured.length}: ${escapeHtml(event.title)}">
            <img src="${event.image}" alt="" ${index === 0 ? '' : 'loading="lazy"'} />
            <div class="featured-overlay"></div>
            <div class="featured-content">
              <div class="featured-tags">
                <span class="featured-tag">${categoryIcons[event.category] ?? ''} ${escapeHtml(event.category)}</span>
                ${timing.label ? `<span class="event-timing ${timing.tone}">${timing.tone === 'live' ? '<i></i>' : ''}${timing.label}</span>` : ''}
                ${index === 0 ? '<span class="featured-tag hot">🔥 Mais procurado</span>' : ''}
              </div>
              <h2>${escapeHtml(event.title)}</h2>
              <p class="featured-meta">
                <span>${formatRange(event)}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(event.city || event.location)}</span>
                <span aria-hidden="true">·</span>
                <span>${event.priceType === 'Gratuito' ? 'Gratuito' : escapeHtml(event.priceLabel)}</span>
              </p>
              <div class="featured-actions">
                <a class="featured-cta" href="${bridge.getEventDetailUrl(event.id, 'destaques')}">
                  Ver evento
                  <svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>
                </a>
                ${bridge.canFavorite() ? `<button class="featured-fav favorite-btn${isFav ? ' active' : ''}" type="button" data-featured-fav="${event.id}" aria-pressed="${isFav}" aria-label="${isFav ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}">
                  <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
                </button>` : ''}
              </div>
            </div>
          </article>`;
      }).join('');

      if (featuredDots) {
        featuredDots.innerHTML = featured.map((event, index) => `<button type="button" aria-label="Ir para ${escapeHtml(event.title)}" data-slide="${index}"><span></span></button>`).join('');
      }

      if (featuredControls) {
        featuredControls.hidden = featuredCount < 2;
      }

      goToSlide(Math.min(featuredIndex, featuredCount - 1));
      startAutoplay();
    };

    featuredSection?.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      if (target.closest('[data-featured-prev]')) {
        goToSlide(featuredIndex - 1);
        startAutoplay();
        return;
      }

      if (target.closest('[data-featured-next]')) {
        goToSlide(featuredIndex + 1);
        startAutoplay();
        return;
      }

      const dot = target.closest('[data-slide]');
      if (dot) {
        goToSlide(Number(dot.dataset.slide));
        startAutoplay();
        return;
      }

      const favButton = target.closest('[data-featured-fav]');
      if (favButton) {
        const eventId = favButton.dataset.featuredFav;
        void (async () => {
          await window.CulturAll.toggleFavorite(eventId);
          const isFav = window.CulturAll.isFavorite(eventId);
          favButton.classList.toggle('active', isFav);
          favButton.setAttribute('aria-pressed', String(isFav));
          favButton.setAttribute('aria-label', isFav ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos');
          // Mantém os cartões da lista sincronizados com o destaque.
          document.querySelectorAll(`.cards-grid .favorite-btn[data-event-id="${CSS.escape(eventId)}"]`).forEach((button) => {
            button.classList.toggle('active', isFav);
            button.setAttribute('aria-pressed', String(isFav));
          });
        })();
      }
    });

    featuredSection?.addEventListener('mouseenter', stopAutoplay);
    featuredSection?.addEventListener('mouseleave', startAutoplay);
    featuredSection?.addEventListener('focusin', stopAutoplay);
    featuredSection?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        goToSlide(featuredIndex - 1);
      } else if (event.key === 'ArrowRight') {
        goToSlide(featuredIndex + 1);
      }
    });

    // Deslizar com o dedo no telemóvel.
    let touchStartX = null;
    featuredSection?.addEventListener('touchstart', (event) => {
      touchStartX = event.touches[0].clientX;
      stopAutoplay();
    }, { passive: true });
    featuredSection?.addEventListener('touchend', (event) => {
      if (touchStartX === null) {
        return;
      }

      const deltaX = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(deltaX) > 40) {
        goToSlide(featuredIndex + (deltaX < 0 ? 1 : -1));
      }
      touchStartX = null;
      startAutoplay();
    });

    /* ---------- Vista de mapa ---------- */
    let map = null;
    let markersLayer = null;

    const getEventCoordinates = (event) => {
      const lat = Number(event.latitude ?? event.lat);
      const lng = Number(event.longitude ?? event.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return [lat, lng];
      }

      const district = window.CulturAll.getEventDistrict(event);
      // Sem coordenadas guardadas: usa o centro da cidade (lista de places.js) antes de recorrer ao distrito.
      const cityBase = window.CulturAllPlaces?.coordinates(event.city, district);
      if (cityBase) {
        return [cityBase[0], cityBase[1]];
      }

      const base = districtCoordinates[district];
      if (!base) {
        return null;
      }

      // Pequeno desvio determinístico para eventos no mesmo distrito não ficarem sobrepostos.
      const seed = String(event.id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return [base[0] + ((seed % 7) - 3) * 0.004, base[1] + ((seed % 5) - 2) * 0.005];
    };

    let leafletPromise = null;
    const loadLeaflet = () => {
      if (window.L?.markerClusterGroup) {
        return Promise.resolve();
      }

      if (!leafletPromise) {
        const base = 'https://unpkg.com';
        const addStyle = (href) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.crossOrigin = '';
          document.head.appendChild(link);
        };
        const addScript = (src) => new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.crossOrigin = '';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(src));
          document.head.appendChild(script);
        });

        addStyle(`${base}/leaflet@1.9.4/dist/leaflet.css`);
        addStyle(`${base}/leaflet.markercluster@1.5.3/dist/MarkerCluster.css`);
        addStyle(`${base}/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css`);
        // O markercluster precisa do Leaflet já carregado.
        leafletPromise = addScript(`${base}/leaflet@1.9.4/dist/leaflet.js`)
          .then(() => addScript(`${base}/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js`))
          .catch((error) => {
            leafletPromise = null;
            throw error;
          });
      }

      return leafletPromise;
    };

    const renderMap = () => {
      if (!mapWrap) {
        return;
      }

      const mapElement = document.getElementById('eventsMap');
      const legend = document.getElementById('mapLegend');
      if (typeof window.L === 'undefined') {
        // O Leaflet só é descarregado quando o mapa é aberto pela primeira vez.
        mapElement.innerHTML = '<p class="map-fallback">A carregar o mapa…</p>';
        loadLeaflet().then(() => {
          mapElement.innerHTML = '';
          renderMap();
        }).catch(() => {
          mapElement.innerHTML = '<p class="map-fallback">Não foi possível carregar o mapa. Verifica a ligação à internet.</p>';
        });
        return;
      }

      if (!map) {
        map = window.L.map(mapElement, { scrollWheelZoom: true, zoomControl: true }).setView([39.6, -8.1], 7);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; contribuidores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        // Marcadores agrupados (markercluster) para o mapa continuar fluido com muitos eventos.
        markersLayer = (window.L.markerClusterGroup ? window.L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, showCoverageOnHover: false }) : window.L.layerGroup()).addTo(map);
      }

      setTimeout(() => map.invalidateSize(), 60);
      markersLayer.clearLayers();

      const bridge = window.CulturAll;
      const events = lastRendered.events;
      const bounds = [];
      const categoriesShown = new Set();

      events.forEach((event) => {
        const coordinates = getEventCoordinates(event);
        if (!coordinates) {
          return;
        }

        const color = getCategoryColor(event.category);
        categoriesShown.add(event.category);
        bounds.push(coordinates);

        const icon = window.L.divIcon({
          className: '',
          html: `<span class="map-pin" style="--pin:${color}"><b>${categoryIcons[event.category] ?? '•'}</b></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 34],
          popupAnchor: [0, -30]
        });

        window.L.marker(coordinates, { icon, title: event.title, riseOnHover: true })
          .bindPopup(`
            <a class="map-popup" href="${bridge.getEventDetailUrl(event.id, 'mapa')}">
              <img src="${event.image}" alt="" />
              <span class="map-popup-body">
                <small style="--pin:${color}">${escapeHtml(event.category)}</small>
                <strong>${escapeHtml(event.title)}</strong>
                <span>${formatRange(event)} · ${escapeHtml(event.city || event.location)}</span>
                <em>${event.priceType === 'Gratuito' ? 'Gratuito' : escapeHtml(event.priceLabel)}</em>
              </span>
            </a>`, { maxWidth: 260, minWidth: 220 })
          .addTo(markersLayer);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
      }

      if (legend) {
        legend.innerHTML = categoriesShown.size > 0
          ? [...categoriesShown].map((category) => `<span><i style="--pin:${getCategoryColor(category)}"></i>${escapeHtml(category)}</span>`).join('')
          : '<span>Nenhum evento para mostrar no mapa com estes filtros.</span>';
      }
    };

    const setView = (view) => {
      currentView = view;
      document.querySelectorAll('.view-toggle [data-view]').forEach((button) => {
        const isActive = button.dataset.view === view;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });

      if (mapWrap) {
        mapWrap.hidden = view !== 'map';
      }

      if (cardsGrid) {
        cardsGrid.hidden = view === 'map';
      }

      // O mapa não é uma lista: o botão "Ver mais" só existe na vista de lista.
      document.documentElement.dataset.listingView = view;

      if (view === 'map') {
        renderMap();
      }
    };

    document.querySelector('.view-toggle')?.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-view]') : null;
      if (button) {
        setView(button.dataset.view);
      }
    });

    /* ---------- Sugestões de pesquisa ---------- */
    const suggestions = document.getElementById('searchSuggestions');
    let activeSuggestion = -1;

    const closeSuggestions = () => {
      if (suggestions) {
        suggestions.hidden = true;
        activeSuggestion = -1;
      }
    };

    const renderSuggestions = () => {
      if (!suggestions || !searchInput || !window.CulturAll) {
        return;
      }

      const query = searchInput.value.trim().toLowerCase();
      const bridge = window.CulturAll;
      const events = bridge.getUpcomingEvents();
      let matches;
      let heading;

      if (!query) {
        matches = events.slice().sort((a, b) => b.views - a.views).slice(0, 4);
        heading = 'Em alta';
      } else {
        matches = events
          .filter((event) => [event.title, event.category, event.city, event.location].join(' ').toLowerCase().includes(query))
          .sort((a, b) => b.views - a.views)
          .slice(0, 5);
        heading = matches.length ? 'Sugestões' : '';
      }

      if (matches.length === 0) {
        suggestions.innerHTML = query ? `<p class="suggestion-empty">Sem resultados para “${escapeHtml(query)}”</p>` : '';
        suggestions.hidden = !query;
        return;
      }

      suggestions.innerHTML = `<p class="suggestion-heading">${heading}</p>` + matches.map((event, index) => `
        <a class="suggestion" role="option" id="suggestion-${index}" href="${bridge.getEventDetailUrl(event.id, 'pesquisa')}">
          <img src="${event.image}" alt="" />
          <span>
            <strong>${escapeHtml(event.title)}</strong>
            <small>${categoryIcons[event.category] ?? ''} ${escapeHtml(event.category)} · ${formatRange(event)} · ${escapeHtml(event.city || event.location)}</small>
          </span>
        </a>`).join('');
      suggestions.hidden = false;
      activeSuggestion = -1;
    };

    searchInput?.addEventListener('input', renderSuggestions);
    searchInput?.addEventListener('focus', renderSuggestions);
    searchInput?.addEventListener('blur', () => setTimeout(closeSuggestions, 150));
    searchInput?.addEventListener('keydown', (event) => {
      if (!suggestions || suggestions.hidden) {
        return;
      }

      const items = [...suggestions.querySelectorAll('.suggestion')];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        activeSuggestion = (activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((item, index) => item.classList.toggle('active', index === activeSuggestion));
        searchInput.setAttribute('aria-activedescendant', items[activeSuggestion]?.id ?? '');
      } else if (event.key === 'Enter') {
        if (activeSuggestion >= 0 && items[activeSuggestion]) {
          event.preventDefault();
          window.location.href = items[activeSuggestion].href;
        } else {
          closeSuggestions();
          document.getElementById('eventos')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
      } else if (event.key === 'Escape') {
        closeSuggestions();
      }
    });

    /* ---------- Ligações com o script principal ---------- */
    [categoryFilter, dateFilter, priceFilter].forEach((select) => {
      select?.addEventListener('change', () => {
        buildDateChips();
        categoryChips?.querySelectorAll('.chip').forEach((chip) => {
          const isActive = chip.dataset.category === categoryFilter?.value;
          chip.classList.toggle('active', isActive);
          chip.setAttribute('aria-pressed', String(isActive));
        });
      });
    });

    document.addEventListener('culturall:cards-rendered', (event) => {
      lastRendered = event.detail ?? lastRendered;
      observeCards(cardsGrid ?? document);
      document.querySelectorAll('[data-featured-fav]').forEach((button) => {
        const isFav = window.CulturAll?.isFavorite(button.dataset.featuredFav) ?? false;
        button.classList.toggle('active', isFav);
        button.setAttribute('aria-pressed', String(isFav));
      });
      if (currentView === 'map') {
        renderMap();
      }
    });

    whenBridgeReady((bridge) => {
      const events = bridge.getUpcomingEvents();
      buildCategoryChips(events);
      buildDateChips();
      buildFeatured(events);
      observeCards(cardsGrid ?? document);
    });

    buildDateChips();
  }

  /* =========================================================
   * Observatório (stats.html)
   * ========================================================= */
  function initStats(bridge, root = document) {
    const events = bridge.getEvents();
    const upcoming = events.filter((event) => !bridge.isPastEvent(event));
    const free = events.filter((event) => event.priceType === 'Gratuito');
    const districts = new Set(events.map((event) => bridge.getEventDistrict(event)).filter((district) => district !== 'Outros'));
    const totalViews = events.reduce((sum, event) => sum + (event.views || 0), 0);

    const setText = (id, value) => {
      const element = root.querySelector(`#${id}`);
      if (element) {
        element.textContent = value;
      }
    };

    setText('kpiTotal', events.length.toLocaleString('pt-PT'));
    setText('kpiUpcoming', upcoming.length.toLocaleString('pt-PT'));
    setText('kpiDistricts', `${districts.size}/18`);
    setText('kpiFree', events.length ? `${Math.round((free.length / events.length) * 100)}%` : '—');
    setText('kpiViews', totalViews.toLocaleString('pt-PT'));
    setText('statsNote', events.some((event) => event.isDemo)
      ? 'A mostrar eventos de teste enquanto a base de dados não tem eventos.'
      : 'Dados em tempo real da base de dados Cultur\'All.');

    const countBy = (getKey) => events.reduce((acc, event) => {
      const key = getKey(event);
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map());

    const sortedEntries = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);

    const byDistrict = sortedEntries(countBy((event) => bridge.getEventDistrict(event)));
    const byCategory = sortedEntries(countBy((event) => event.category));
    const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const year = new Date().getFullYear();
    const byMonth = monthLabels.map((_, monthIndex) => events.filter((event) => {
      const date = new Date(event.eventDate);
      return date.getFullYear() === year && date.getMonth() === monthIndex;
    }).length);
    const topViewed = [...events].sort((a, b) => b.views - a.views).slice(0, 6);

    // Tabelas acessíveis (alternativa aos gráficos).
    const fillTable = (id, rows) => {
      const table = root.querySelector(`#${id}`);
      if (table) {
        table.querySelector('tbody').innerHTML = rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`).join('');
      }
    };

    fillTable('tableDistrict', byDistrict);
    fillTable('tableCategory', byCategory);
    fillTable('tableMonth', monthLabels.map((label, index) => [label, byMonth[index]]));
    fillTable('tableViews', topViewed.map((event) => [event.title, event.views.toLocaleString('pt-PT')]));

    root.querySelectorAll('[data-toggle-table]').forEach((button) => {
      if (button.dataset.bound === 'true') {
        return;
      }

      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const card = button.closest('.stats-card');
        const showTable = !card.classList.contains('show-table');
        card.classList.toggle('show-table', showTable);
        button.textContent = showTable ? 'Ver gráfico' : 'Ver tabela';
        button.setAttribute('aria-pressed', String(showTable));
      });
    });

    if (typeof window.Chart === 'undefined') {
      root.querySelectorAll('.stats-card').forEach((card) => card.classList.add('show-table'));
      return;
    }

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const brand = isDark ? '#d95926' : '#dd5a2d';
    const ink = isDark ? '#d8cfc6' : '#5b4d42';
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(114,90,67,0.10)';

    window.Chart.defaults.font.family = '"Manrope", system-ui, sans-serif';
    window.Chart.defaults.font.size = 12;
    window.Chart.defaults.color = ink;

    const tooltip = {
      backgroundColor: isDark ? '#2a2623' : '#fffaf2',
      titleColor: isDark ? '#fff' : '#2a2623',
      bodyColor: ink,
      borderColor: grid,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 10,
      displayColors: false
    };

    const barOptions = (horizontal) => ({
      indexAxis: horizontal ? 'y' : 'x',
      locale: 'pt-PT',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip },
      scales: {
        x: { grid: { display: !horizontal ? false : true, color: grid }, border: { display: false }, ticks: { precision: 0 } },
        y: { grid: { display: horizontal ? false : true, color: grid }, border: { display: false }, ticks: { precision: 0 } }
      }
    });

    const barDataset = (data) => ({
      data,
      backgroundColor: brand,
      hoverBackgroundColor: isDark ? '#ef7a4b' : '#c34621',
      borderRadius: 4,
      borderSkipped: 'start',
      maxBarThickness: 26
    });

    const makeChart = (id, config) => {
      const canvas = root.querySelector(`#${id}`);
      if (canvas) {
        window.Chart.getChart(canvas)?.destroy();
        new window.Chart(canvas, config);
      }
    };

    makeChart('chartDistrict', {
      type: 'bar',
      data: { labels: byDistrict.map(([label]) => label), datasets: [barDataset(byDistrict.map(([, value]) => value))] },
      options: barOptions(true)
    });

    makeChart('chartCategory', {
      type: 'bar',
      data: { labels: byCategory.map(([label]) => label), datasets: [barDataset(byCategory.map(([, value]) => value))] },
      options: barOptions(true)
    });

    makeChart('chartMonth', {
      type: 'bar',
      data: { labels: monthLabels, datasets: [barDataset(byMonth)] },
      options: barOptions(false)
    });

    makeChart('chartViews', {
      type: 'bar',
      data: { labels: topViewed.map((event) => event.title), datasets: [barDataset(topViewed.map((event) => event.views))] },
      options: barOptions(true)
    });
  }

  /* =========================================================
   * Estatísticas de interação (Dashboard do administrador e do organizador)
   * ---------------------------------------------------------
   * Lê /api/analytics. Definições:
   *  - CTR = cliques em "Ver Bilhetes" / visualizações de eventos pagos (gratuitos não têm bilheteira).
   *  - Não há conversão em compra: a compra acontece fora da plataforma.
   * ========================================================= */
  function initAnalytics(root, options = {}) {
    if (!root || root.dataset.analyticsMounted === 'true') {
      return;
    }

    root.dataset.analyticsMounted = 'true';
    const isAdmin = options.scope === 'admin';
    const fmtInt = (value) => Number(value || 0).toLocaleString('pt-PT');
    const fmtPct = (value) => (value === null || value === undefined ? '—' : `${(value * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
    const palette = { views: '#2a78d6', clicks: '#dd5a2d', fav: '#e87ba4', share: '#1baf7a', cal: '#eda100' };
    const granularityLabels = { day: 'Dia', week: 'Semana', month: 'Mês', quarter: 'Trimestre', semester: 'Semestre', year: 'Ano' };
    const dataLabels = { real: 'Dados reais', todos: 'Reais + simulados', simulado: 'Só simulados' };
    const deviceLabels = { desktop: 'Computador', mobile: 'Telemóvel', tablet: 'Tablet' };
    const sourceLabels = { lista: 'Lista de eventos', mapa: 'Mapa', destaques: 'Destaques', pesquisa: 'Pesquisa', relacionados: 'Eventos relacionados', perfil: 'Favoritos / perfil', partilha: 'Link partilhado', calendario: 'Link do calendário', direto: 'Acesso direto', legado: 'Histórico anterior' };
    const typeLabels = { empresa: 'Empresa / promotora', associacao: 'Associação / coletivo', municipio: 'Município / entidade pública', espaco_cultural: 'Espaço cultural', independente: 'Independente', nr: 'Não indicado' };
    const yesNoLabels = { sim: 'Sim', nao: 'Não', talvez: 'Talvez', nr: 'Não indicado' };

    const state = { granularity: 'month', from: '', to: '', eventId: '', organizerId: '', category: '', district: '', data: 'real' };
    let lastPayload = null;
    let requestCounter = 0;
    const charts = [];

    root.innerHTML = `
      <section class="analytics" aria-label="Estatísticas de interação com os eventos">
        <header class="analytics-head">
          <div>
            <h2>${isAdmin ? 'Interações na plataforma' : 'Os teus eventos em números'}</h2>
            <p>Visualizações, cliques em “Ver Bilhetes”, favoritos, partilhas e calendário. O CTR usa só eventos pagos (os gratuitos não têm bilheteira).</p>
          </div>
          <button class="table-toggle" type="button" data-analytics-export>Exportar CSV</button>
        </header>

        <form class="analytics-controls" aria-label="Filtros das estatísticas">
          <label>Agrupar por
            <select data-ctl="granularity">${Object.entries(granularityLabels).map(([value, label]) => `<option value="${value}"${value === state.granularity ? ' selected' : ''}>${label}</option>`).join('')}</select>
          </label>
          <label>De <input type="date" data-ctl="from" /></label>
          <label>Até <input type="date" data-ctl="to" /></label>
          ${isAdmin ? `
            <label>Categoria <select data-ctl="category"><option value="">Todas</option></select></label>
            <label>Distrito <select data-ctl="district"><option value="">Todos</option></select></label>
            <label>Dados <select data-ctl="data">${Object.entries(dataLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
          ` : `
            <label>Evento <select data-ctl="eventId"><option value="">Todos os meus eventos</option></select></label>
          `}
        </form>

        <div class="analytics-chips" data-chips></div>
        <p class="analytics-note" data-note role="status" aria-live="polite">A carregar estatísticas…</p>
        <div class="kpi-grid analytics-kpis" data-kpis></div>

        <div class="stats-grid">
          <article class="stats-card analytics-wide">
            <header><div><h2>Visualizações e cliques em bilhetes</h2><p data-sub-volume></p></div><button class="table-toggle" type="button" data-analytics-toggle aria-pressed="false">Ver tabela</button></header>
            <div class="chart-box"><canvas data-chart="volume" role="img" aria-label="Gráfico de barras: visualizações e cliques em bilhetes por período"></canvas></div>
            <div class="stats-table-wrap" data-table="series"></div>
          </article>
          <article class="stats-card">
            <header><div><h2>Taxa de cliques (CTR)</h2><p>Cliques ÷ visualizações de eventos pagos</p></div><button class="table-toggle" type="button" data-analytics-toggle aria-pressed="false">Ver tabela</button></header>
            <div class="chart-box"><canvas data-chart="ctr" role="img" aria-label="Gráfico de linha: CTR por período"></canvas></div>
            <div class="stats-table-wrap" data-table="ctr"></div>
          </article>
          <article class="stats-card">
            <header><div><h2>Envolvimento</h2><p>Favoritos (líquidos), partilhas e calendário</p></div><button class="table-toggle" type="button" data-analytics-toggle aria-pressed="false">Ver tabela</button></header>
            <div class="chart-box"><canvas data-chart="engagement" role="img" aria-label="Gráfico de barras: favoritos, partilhas e calendário por período"></canvas></div>
            <div class="stats-table-wrap" data-table="engagement"></div>
          </article>
        </div>

        <div class="analytics-tables" data-extra></div>
      </section>
    `;

    const form = root.querySelector('.analytics-controls');
    const noteEl = root.querySelector('[data-note]');
    const kpisEl = root.querySelector('[data-kpis]');
    const chipsEl = root.querySelector('[data-chips]');
    const extraEl = root.querySelector('[data-extra]');
    const control = (name) => form.querySelector(`[data-ctl="${name}"]`);

    const delta = (current, previous) => {
      if (!previous) {
        return current ? '<small class="delta up">novo</small>' : '<small class="delta flat">—</small>';
      }

      const change = ((current - previous) / previous) * 100;
      const rounded = Math.round(change);
      const tone = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
      return `<small class="delta ${tone}">${rounded > 0 ? '▲' : rounded < 0 ? '▼' : '='} ${Math.abs(rounded)}%</small>`;
    };

    const deltaPoints = (current, previous) => {
      if (current === null || previous === null) {
        return '<small class="delta flat">—</small>';
      }

      const points = (current - previous) * 100;
      const tone = points > 0.05 ? 'up' : points < -0.05 ? 'down' : 'flat';
      return `<small class="delta ${tone}">${points > 0.05 ? '▲' : points < -0.05 ? '▼' : '='} ${Math.abs(points).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} p.p.</small>`;
    };

    const tableHtml = (headers, rows) => `
      <table class="stats-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Sem dados neste período.</td></tr>`}</tbody>
      </table>`;

    const metricRow = (item, label) => [label, fmtInt(item.views), fmtInt(item.clicks), fmtPct(item.ctr), fmtInt(item.favoritesNet), fmtInt(item.shares), fmtInt(item.calendar)];
    const metricHeaders = (first) => [first, 'Visualizações', 'Cliques bilhetes', 'CTR', 'Favoritos (líq.)', 'Partilhas', 'Calendário'];

    const destroyCharts = () => {
      while (charts.length) {
        charts.pop().destroy();
      }
    };

    const buildCharts = (series) => {
      destroyCharts();
      if (typeof window.Chart === 'undefined') {
        root.querySelectorAll('.analytics .stats-card').forEach((card) => card.classList.add('show-table'));
        return;
      }

      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const ink = isDark ? '#d8cfc6' : '#5b4d42';
      const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(114,90,67,0.10)';
      window.Chart.defaults.font.family = '"Manrope", system-ui, sans-serif';
      window.Chart.defaults.font.size = 12;
      window.Chart.defaults.color = ink;
      const labels = series.map((item) => item.label);
      const tooltip = { backgroundColor: isDark ? '#2a2623' : '#fffaf2', titleColor: isDark ? '#fff' : '#2a2623', bodyColor: ink, borderColor: grid, borderWidth: 1, padding: 10, cornerRadius: 10 };
      const baseOptions = (extra = {}) => ({
        locale: 'pt-PT', responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } } },
        ...extra
      });
      const make = (name, config) => {
        const canvas = root.querySelector(`[data-chart="${name}"]`);
        if (canvas) {
          window.Chart.getChart(canvas)?.destroy();
          charts.push(new window.Chart(canvas, config));
        }
      };
      const bar = (label, key, color) => ({ label, data: series.map((item) => item[key]), backgroundColor: color, borderRadius: 4, maxBarThickness: 28 });

      make('volume', { type: 'bar', data: { labels, datasets: [bar('Visualizações', 'views', palette.views), bar('Cliques em “Ver Bilhetes”', 'clicks', palette.clicks)] }, options: baseOptions() });
      make('ctr', {
        type: 'line',
        data: { labels, datasets: [{ label: 'CTR (%)', data: series.map((item) => (item.ctr === null ? null : Number((item.ctr * 100).toFixed(2)))), borderColor: palette.clicks, backgroundColor: palette.clicks, pointRadius: 3, tension: 0.25, spanGaps: false }] },
        options: baseOptions({ plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (ctx) => (ctx.parsed.y === null ? 'Sem eventos pagos vistos' : `CTR: ${ctx.parsed.y.toLocaleString('pt-PT')}%`) } } } })
      });
      make('engagement', { type: 'bar', data: { labels, datasets: [bar('Favoritos (líquidos)', 'favoritesNet', palette.fav), bar('Partilhas', 'shares', palette.share), bar('Calendário', 'calendar', palette.cal)] }, options: baseOptions() });
    };

    let eventsFilled = false;

    const render = (payload) => {
      lastPayload = payload;

      // Organizador: lista os seus eventos no filtro (vem na primeira resposta).
      if (!isAdmin && !eventsFilled && Array.isArray(payload.events)) {
        eventsFilled = true;
        fillSelect(control('eventId'), payload.events.map((item) => ({ value: String(item.id), label: `${item.title}${item.paid ? '' : ' (gratuito)'}` })));
        control('eventId').value = state.eventId;
      }

      const { totals, previousTotals, series, range } = payload;

      // Reflete no formulário o período realmente aplicado (alinhado aos limites do agrupamento).
      control('from').value = range.from;
      control('to').value = range.to;

      const notes = [];
      if (totals.views === 0 && totals.clicks === 0) {
        notes.push('Ainda sem interações registadas neste período. A recolha começa quando a nova versão entra em produção.');
      }
      if (totals.paidViews < 30) {
        notes.push(`Poucos dados: só ${fmtInt(totals.paidViews)} visualizações de eventos pagos. O CTR ainda não é fiável (mínimo recomendado: 30).`);
      }
      if (range.incomplete) {
        notes.push('O último período ainda não terminou; a comparação com o período anterior é indicativa.');
      }
      noteEl.textContent = notes.join(' ');
      noteEl.hidden = notes.length === 0;

      const kpi = (label, value, deltaHtml, hint) => `<article class="kpi" title="${escapeHtml(hint)}"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${deltaHtml} <span class="kpi-vs">vs. período anterior</span></small></article>`;
      kpisEl.innerHTML = [
        kpi('Visualizações', fmtInt(totals.views), delta(totals.views, previousTotals.views), 'Visitas únicas por sessão a páginas de evento (30 min entre contagens)'),
        kpi('Visualizações (pagos)', fmtInt(totals.paidViews), delta(totals.paidViews, previousTotals.paidViews), 'Base do CTR: visualizações de eventos com preço'),
        kpi('Cliques em bilhetes', fmtInt(totals.clicks), delta(totals.clicks, previousTotals.clicks), 'Cliques no botão “Ver Bilhetes” (redireciona para a bilheteira externa)'),
        kpi('CTR', fmtPct(totals.ctr), deltaPoints(totals.ctr, previousTotals.ctr), 'Cliques ÷ visualizações de eventos pagos'),
        kpi('Favoritos (líquidos)', fmtInt(totals.favoritesNet), delta(totals.favoritesNet, previousTotals.favoritesNet), 'Adicionados menos removidos'),
        kpi('Partilhas', fmtInt(totals.shares), delta(totals.shares, previousTotals.shares), 'Partilhas concluídas ou links copiados'),
        kpi('Calendário', fmtInt(totals.calendar), delta(totals.calendar, previousTotals.calendar), 'Cliques em “Calendário”'),
        kpi('Sessões que clicaram', fmtPct(totals.sessionsViewed ? totals.sessionsClicked / totals.sessionsViewed : null), '<small class="delta flat">—</small>', 'Sessões com clique em bilhetes ÷ sessões com visualização')
      ].join('');

      const sub = root.querySelector('[data-sub-volume]');
      if (sub) {
        sub.textContent = `${granularityLabels[range.granularity]} · ${range.from} a ${range.to} · ${dataLabels[payload.dataMode]?.toLowerCase() ?? ''}`;
      }

      root.querySelector('[data-table="series"]').innerHTML = tableHtml(metricHeaders('Período'), series.map((item) => metricRow(item, escapeHtml(item.label))));
      root.querySelector('[data-table="ctr"]').innerHTML = tableHtml(['Período', 'Visualizações (pagos)', 'Cliques', 'CTR'], series.map((item) => [escapeHtml(item.label), fmtInt(item.paidViews), fmtInt(item.clicks), fmtPct(item.ctr)]));
      root.querySelector('[data-table="engagement"]').innerHTML = tableHtml(['Período', 'Favoritos (líq.)', 'Partilhas', 'Calendário'], series.map((item) => [escapeHtml(item.label), fmtInt(item.favoritesNet), fmtInt(item.shares), fmtInt(item.calendar)]));
      buildCharts(series);

      // Filtros ativos (clicar num evento/organizador filtra; o "×" remove).
      const chips = [];
      if (state.eventId) {
        const found = payload.topEvents.find((item) => String(item.id) === String(state.eventId)) ?? payload.events?.find((item) => String(item.id) === String(state.eventId));
        chips.push(`<button type="button" class="analytics-chip" data-clear="eventId">Evento: ${escapeHtml(found?.title ?? `#${state.eventId}`)} ×</button>`);
      }
      if (state.organizerId && isAdmin) {
        const found = payload.byOrganizer?.find((item) => String(item.id) === String(state.organizerId));
        chips.push(`<button type="button" class="analytics-chip" data-clear="organizerId">Organizador: ${escapeHtml(found?.name ?? `#${state.organizerId}`)} ×</button>`);
      }
      chipsEl.innerHTML = chips.join('');

      const filterLink = (kind, id, text) => `<button type="button" class="analytics-link" data-filter="${kind}" data-value="${escapeHtml(id)}">${escapeHtml(text)}</button>`;
      const breakdown = (title, rows, labelFor) => `
        <article class="stats-card">
          <header><div><h2>${escapeHtml(title)}</h2></div></header>
          ${tableHtml([title.replace('Por ', ''), 'Visualizações', 'Cliques', 'CTR'], rows.map((row) => [escapeHtml(labelFor(row.label)), fmtInt(row.views), fmtInt(row.clicks), fmtPct(row.ctr)]))}
        </article>`;

      const extra = [];
      extra.push(`
        <article class="stats-card analytics-wide">
          <header><div><h2>Eventos com mais interação</h2><p>Clica num evento para ver só esse evento.</p></div></header>
          ${tableHtml(['Evento', 'Tipo', ...metricHeaders('x').slice(1)], payload.topEvents.map((item) => [filterLink('eventId', item.id, item.title), item.paid ? 'Pago' : 'Gratuito', fmtInt(item.views), fmtInt(item.clicks), item.paid ? fmtPct(item.ctr) : '—', fmtInt(item.favoritesNet), fmtInt(item.shares), fmtInt(item.calendar)]))}
        </article>`);

      if (isAdmin) {
        extra.push(`
          <article class="stats-card analytics-wide">
            <header><div><h2>Por organizador</h2><p>Clica num organizador para filtrar.</p></div></header>
            ${tableHtml(metricHeaders('Organizador'), (payload.byOrganizer ?? []).map((item) => metricRow(item, filterLink('organizerId', item.id, item.name))))}
          </article>`);
      } else {
        const benchmark = payload.benchmark?.eligible
          ? `<p>CTR dos restantes organizadores: <strong>${fmtPct(payload.benchmark.platformCtr)}</strong> · o teu: <strong>${fmtPct(totals.ctr)}</strong>. Visualizações médias por evento nos restantes: <strong>${(payload.benchmark.platformViewsPerEvent ?? 0).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}</strong>.</p>`
          : '<p>Ainda não há dados suficientes de outros organizadores para comparar (mínimo: 3 eventos e 30 visualizações de eventos pagos). Isto protege a privacidade de cada organizador.</p>';
        extra.push(`<article class="stats-card analytics-wide"><header><div><h2>Comparação com a plataforma</h2></div></header>${benchmark}</article>`);
      }

      extra.push(breakdown('Por categoria', payload.breakdown.category, (label) => label));
      extra.push(breakdown('Por distrito', payload.breakdown.district, (label) => label));
      extra.push(breakdown('Por dispositivo', payload.breakdown.device, (label) => deviceLabels[label] ?? label));
      extra.push(breakdown('Por origem da visita', payload.breakdown.source, (label) => sourceLabels[label] ?? label));

      const catalog = payload.catalog;
      extra.push(`
        <article class="stats-card">
          <header><div><h2>Catálogo atual</h2><p>Estado de hoje, independente do período</p></div></header>
          ${tableHtml(['Indicador', 'Valor'], [
            ['Eventos publicados', fmtInt(catalog.published)],
            ['Gratuitos (sem bilheteira)', fmtInt(catalog.free)],
            ['Pagos', fmtInt(catalog.paid)],
            ['Pagos com link de bilhetes', fmtInt(catalog.paidWithLink)]
          ])}
        </article>`);

      if (isAdmin && payload.organizerSurvey) {
        const survey = payload.organizerSurvey;
        const surveyRows = (map, labels) => Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => [escapeHtml(labels[key] ?? key), `${fmtInt(count)} (${survey.organizers ? Math.round((count / survey.organizers) * 100) : 0}%)`]);
        extra.push(`
          <article class="stats-card">
            <header><div><h2>Perfil dos organizadores</h2><p>${fmtInt(survey.organizers)} organizadores aprovados · respostas voluntárias</p></div></header>
            ${tableHtml(['Tipo de entidade', 'Organizadores'], surveyRows(survey.type, typeLabels))}
            ${tableHtml(['Têm bilheteira própria?', 'Organizadores'], surveyRows(survey.hasTicketing, yesNoLabels))}
            ${tableHtml(['Interesse em bilheteira integrada', 'Organizadores'], surveyRows(survey.interest, yesNoLabels))}
          </article>`);
      }

      extraEl.innerHTML = extra.join('');
    };

    const buildQuery = () => {
      const params = new URLSearchParams({ granularity: state.granularity });
      ['from', 'to', 'eventId', 'organizerId', 'category', 'district'].forEach((key) => {
        if (state[key]) {
          params.set(key, state[key]);
        }
      });
      if (isAdmin && state.data !== 'real') {
        params.set('data', state.data);
      }
      return params.toString();
    };

    const load = async () => {
      const ticket = ++requestCounter;
      noteEl.hidden = false;
      noteEl.textContent = 'A carregar estatísticas…';
      try {
        const response = await fetch(`/api/analytics?${buildQuery()}`, { credentials: 'same-origin' });
        const payload = await response.json().catch(() => null);
        if (ticket !== requestCounter) {
          return;
        }

        if (!response.ok || !payload?.ok) {
          noteEl.textContent = payload?.message ?? 'Não foi possível carregar as estatísticas.';
          return;
        }

        render(payload);
      } catch {
        if (ticket === requestCounter) {
          noteEl.textContent = 'Não foi possível carregar as estatísticas. Verifica a ligação e tenta novamente.';
        }
      }
    };

    // Listas de filtros (categorias, distritos, eventos do organizador).
    const fillSelect = (select, values, labelFor = (value) => value) => {
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value.value ?? value;
        option.textContent = value.label ?? labelFor(value);
        select.append(option);
      });
    };

    if (isAdmin) {
      fillSelect(control('category'), ['Arte e Exposições', 'Bem Estar', 'Cinema', 'Comédia', 'Concertos', 'Dança', 'Família', 'Festivais', 'Gastronomia', 'Literatura', 'Mercados e Feiras', 'Moda', 'Outros', 'Teatro']);
      fillSelect(control('district'), ['Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra', 'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre', 'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo', 'Vila Real', 'Viseu', 'Outros']);
    }

    form.addEventListener('submit', (event) => event.preventDefault());
    form.addEventListener('change', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-ctl]') : null;
      if (!target) {
        return;
      }

      const name = target.dataset.ctl;
      state[name] = target.value;
      if (name === 'granularity') {
        // Muda o agrupamento: volta ao período por omissão desse agrupamento.
        state.from = '';
        state.to = '';
      }
      void load();
    });

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      const toggle = target.closest('[data-analytics-toggle]');
      if (toggle) {
        const card = toggle.closest('.stats-card');
        const showTable = !card.classList.contains('show-table');
        card.classList.toggle('show-table', showTable);
        toggle.textContent = showTable ? 'Ver gráfico' : 'Ver tabela';
        toggle.setAttribute('aria-pressed', String(showTable));
        return;
      }

      const filter = target.closest('[data-filter]');
      if (filter) {
        state[filter.dataset.filter] = filter.dataset.value;
        if (filter.dataset.filter === 'organizerId') {
          state.eventId = '';
        }
        void load();
        return;
      }

      const clear = target.closest('[data-clear]');
      if (clear) {
        state[clear.dataset.clear] = '';
        if (!isAdmin && clear.dataset.clear === 'eventId') {
          control('eventId').value = '';
        }
        void load();
        return;
      }

      if (target.closest('[data-analytics-export]')) {
        exportCsv();
      }
    });

    const exportCsv = () => {
      if (!lastPayload) {
        return;
      }

      const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const ctr = (value) => (value === null ? '' : (value * 100).toFixed(2).replace('.', ','));
      const rows = [
        ['Periodo', 'Inicio', 'Visualizacoes', 'Visualizacoes_pagos', 'Cliques_bilhete', 'CTR_%', 'Favoritos_adicionados', 'Favoritos_removidos', 'Partilhas', 'Calendario'],
        ...lastPayload.series.map((item) => [item.key, item.start, item.views, item.paidViews, item.clicks, ctr(item.ctr), item.favoritesAdded, item.favoritesRemoved, item.shares, item.calendar])
      ];
      const csv = `﻿${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `culturall-estatisticas-${lastPayload.range.granularity}-${lastPayload.range.from}-${lastPayload.range.to}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };

    void load();
  }
});
