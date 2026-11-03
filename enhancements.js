/*
 * Cultur'All — Interatividade da página inicial e do Observatório
 * ------------------------------------------------------------
 * Destaques em carrossel, chips de filtro rápido, vista de mapa
 * (Leaflet + OpenStreetMap), sugestões de pesquisa, animações de
 * entrada dos cartões e gráficos do Observatório (Chart.js).
 * Usa a ponte window.CulturAll publicada pelo script.js.
 */
document.addEventListener('DOMContentLoaded', () => {
  const pageType = document.body.dataset.page ?? 'home';
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

  if (pageType === 'favorites' || pageType === 'event') {
    document.addEventListener('culturall:cards-rendered', () => observeCards());
    whenBridgeReady(() => setTimeout(() => observeCards(), 60));
  }

  if (pageType === 'stats') {
    whenBridgeReady(initStats);
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
    let lastRendered = { events: [], archived: [] };
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
      { label: 'Gratuitos', type: 'price', value: 'Gratuito' },
      { label: 'Já aconteceram', type: 'date', value: 'Passados' }
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
      const upcoming = events
        .filter((event) => !bridge.isPastEvent(event))
        .sort((a, b) => b.views - a.views);
      const past = events
        .filter((event) => bridge.isPastEvent(event))
        .sort((a, b) => b.views - a.views);
      return [...upcoming, ...past].slice(0, 5);
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
        const isPast = bridge.isPastEvent(event);
        const isFav = bridge.isFavorite(event.id);
        return `
          <article class="featured-slide${isPast ? ' is-past' : ''}" role="group" aria-roledescription="destaque" aria-label="${index + 1} de ${featured.length}: ${escapeHtml(event.title)}">
            <img src="${event.image}" alt="" ${index === 0 ? '' : 'loading="lazy"'} />
            <div class="featured-overlay"></div>
            <div class="featured-content">
              <div class="featured-tags">
                <span class="featured-tag">${categoryIcons[event.category] ?? ''} ${escapeHtml(event.category)}</span>
                ${timing.label ? `<span class="event-timing ${timing.tone}">${timing.tone === 'live' ? '<i></i>' : ''}${timing.label}</span>` : ''}
                ${index === 0 && !isPast ? '<span class="featured-tag hot">🔥 Mais procurado</span>' : ''}
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
                <a class="featured-cta" href="${bridge.getEventDetailUrl(event.id)}">
                  Ver evento
                  <svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>
                </a>
                <button class="featured-fav favorite-btn${isFav ? ' active' : ''}" type="button" data-featured-fav="${event.id}" aria-pressed="${isFav}" aria-label="${isFav ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}">
                  <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"></path></svg>
                </button>
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
      const base = districtCoordinates[district];
      if (!base) {
        return null;
      }

      // Pequeno desvio determinístico para eventos no mesmo distrito não ficarem sobrepostos.
      const seed = String(event.id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return [base[0] + ((seed % 7) - 3) * 0.004, base[1] + ((seed % 5) - 2) * 0.005];
    };

    const renderMap = () => {
      if (!mapWrap) {
        return;
      }

      const mapElement = document.getElementById('eventsMap');
      const legend = document.getElementById('mapLegend');
      if (typeof window.L === 'undefined') {
        mapElement.innerHTML = '<p class="map-fallback">Não foi possível carregar o mapa. Verifica a ligação à internet.</p>';
        return;
      }

      if (!map) {
        map = window.L.map(mapElement, { scrollWheelZoom: false, zoomControl: true }).setView([39.6, -8.1], 7);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; contribuidores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        markersLayer = window.L.layerGroup().addTo(map);
      }

      setTimeout(() => map.invalidateSize(), 60);
      markersLayer.clearLayers();

      const bridge = window.CulturAll;
      const events = [...lastRendered.events, ...lastRendered.archived];
      const bounds = [];
      const categoriesShown = new Set();

      events.forEach((event) => {
        const coordinates = getEventCoordinates(event);
        if (!coordinates) {
          return;
        }

        const isPast = bridge.isPastEvent(event);
        const color = getCategoryColor(event.category);
        categoriesShown.add(event.category);
        bounds.push(coordinates);

        const icon = window.L.divIcon({
          className: '',
          html: `<span class="map-pin${isPast ? ' past' : ''}" style="--pin:${color}"><b>${categoryIcons[event.category] ?? '•'}</b></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 34],
          popupAnchor: [0, -30]
        });

        window.L.marker(coordinates, { icon, title: event.title, riseOnHover: true })
          .bindPopup(`
            <a class="map-popup" href="${bridge.getEventDetailUrl(event.id)}">
              <img src="${event.image}" alt="" />
              <span class="map-popup-body">
                <small style="--pin:${color}">${escapeHtml(event.category)}${isPast ? ' · terminado' : ''}</small>
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
            + '<span class="legend-past"><i></i>Já aconteceu</span>'
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
      const events = bridge.getEvents();
      let matches;
      let heading;

      if (!query) {
        matches = events.filter((event) => !bridge.isPastEvent(event)).sort((a, b) => b.views - a.views).slice(0, 4);
        heading = 'Em alta';
      } else {
        matches = events
          .filter((event) => [event.title, event.category, event.city, event.location].join(' ').toLowerCase().includes(query))
          .sort((a, b) => Number(bridge.isPastEvent(a)) - Number(bridge.isPastEvent(b)) || b.views - a.views)
          .slice(0, 5);
        heading = matches.length ? 'Sugestões' : '';
      }

      if (matches.length === 0) {
        suggestions.innerHTML = query ? `<p class="suggestion-empty">Sem resultados para “${escapeHtml(query)}”</p>` : '';
        suggestions.hidden = !query;
        return;
      }

      suggestions.innerHTML = `<p class="suggestion-heading">${heading}</p>` + matches.map((event, index) => `
        <a class="suggestion" role="option" id="suggestion-${index}" href="${bridge.getEventDetailUrl(event.id)}">
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
      const events = bridge.getEvents();
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
  function initStats(bridge) {
    const events = bridge.getEvents();
    const upcoming = events.filter((event) => !bridge.isPastEvent(event));
    const free = events.filter((event) => event.priceType === 'Gratuito');
    const districts = new Set(events.map((event) => bridge.getEventDistrict(event)).filter((district) => district !== 'Outros'));
    const totalViews = events.reduce((sum, event) => sum + (event.views || 0), 0);

    const setText = (id, value) => {
      const element = document.getElementById(id);
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
      const table = document.getElementById(id);
      if (table) {
        table.querySelector('tbody').innerHTML = rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`).join('');
      }
    };

    fillTable('tableDistrict', byDistrict);
    fillTable('tableCategory', byCategory);
    fillTable('tableMonth', monthLabels.map((label, index) => [label, byMonth[index]]));
    fillTable('tableViews', topViewed.map((event) => [event.title, event.views.toLocaleString('pt-PT')]));

    document.querySelectorAll('[data-toggle-table]').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.closest('.stats-card');
        const showTable = !card.classList.contains('show-table');
        card.classList.toggle('show-table', showTable);
        button.textContent = showTable ? 'Ver gráfico' : 'Ver tabela';
        button.setAttribute('aria-pressed', String(showTable));
      });
    });

    if (typeof window.Chart === 'undefined') {
      document.querySelectorAll('.stats-card').forEach((card) => card.classList.add('show-table'));
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
      const canvas = document.getElementById(id);
      if (canvas) {
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
});
