/*
 * Cultur'All — Eventos de teste (TEMPORÁRIO)
 * ------------------------------------------------------------
 * Eventos reais de 2026 usados apenas enquanto a base de dados
 * não tem eventos. O script.js só usa esta lista quando a API
 * /api/events não devolve nenhum evento.
 *
 * Para remover: apagar este ficheiro e a linha
 *   <script defer src="demo-events.js"></script>
 * em index.html, event.html, favorites.html e stats.html.
 */
(function () {
  var palettes = {
    'Festivais': ['#dd5a2d', '#f2a03d', '#7f2a14'],
    'Concertos': ['#7f5cff', '#dd5a2d', '#2b1a63'],
    'Gastronomia': ['#c9822b', '#f4c96b', '#5e3410'],
    'Outros': ['#1f3a5f', '#4fa3c7', '#0d1b2c'],
    'default': ['#2a2623', '#dd5a2d', '#111111']
  };

  // Gera uma capa abstrata (SVG) para cada evento de teste, com as cores da categoria.
  var buildCover = function (category, seed) {
    var colors = palettes[category] || palettes['default'];
    var r1 = 200 + (seed * 37) % 200;
    var r2 = 120 + (seed * 53) % 140;
    var waveY = 560 + (seed * 23) % 160;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">'
      + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + colors[0] + '"/><stop offset="1" stop-color="' + colors[2] + '"/></linearGradient></defs>'
      + '<rect width="1200" height="900" fill="url(#g)"/>'
      + '<circle cx="' + (820 + (seed * 29) % 260) + '" cy="' + (160 + (seed * 17) % 200) + '" r="' + r1 + '" fill="' + colors[1] + '" opacity="0.6"/>'
      + '<circle cx="' + (180 + (seed * 41) % 360) + '" cy="' + (260 + (seed * 13) % 200) + '" r="' + r2 + '" fill="#fff" opacity="0.10"/>'
      + '<path d="M0 ' + waveY + ' C 300 ' + (waveY - 140) + ', 600 ' + (waveY + 140) + ', 1200 ' + (waveY - 60) + ' L1200 900 L0 900 Z" fill="' + colors[2] + '" opacity="0.55"/>'
      + '<path d="M0 ' + (waveY + 90) + ' C 360 ' + (waveY - 10) + ', 760 ' + (waveY + 200) + ', 1200 ' + (waveY + 40) + '" fill="none" stroke="#fff" stroke-width="6" opacity="0.25"/>'
      + '</svg>';

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  };

  var events = [
    {
      id: 'demo-1', title: 'Rock in Rio Lisboa', category: 'Festivais',
      startDate: '2026-06-20T16:00:00', endDate: '2026-06-28T23:59:00',
      location: 'Parque Tejo, Lisboa', city: 'Lisboa', district: 'Lisboa',
      latitude: 38.7745, longitude: -9.0975,
      price: 84, priceType: 'Pago', priceLabel: 'Desde 84€', views: 1840,
      ticketUrl: 'https://rockinrio.com/lisboa/',
      description: 'O maior festival de música do país regressa ao Parque Tejo com vários dias de concertos de artistas nacionais e internacionais. Bilhete diário (Lawn) a 84€, passe de fim de semana a 147€ e VIP diário a 360€.'
    },
    {
      id: 'demo-2', title: 'Primavera Sound Porto', category: 'Festivais',
      startDate: '2026-06-11T17:00:00', endDate: '2026-06-14T23:59:00',
      location: 'Parque da Cidade, Porto', city: 'Porto', district: 'Porto',
      latitude: 41.1685, longitude: -8.6770,
      price: 180, priceType: 'Pago', priceLabel: 'Passe 180€', views: 1320,
      ticketUrl: 'https://www.primaverasound.com/',
      description: 'Quatro dias de música alternativa, indie e eletrónica no Parque da Cidade do Porto. Passe geral de 4 dias a 180€ e passe VIP a 275€; bilhetes diários entre 70€ e 90€.'
    },
    {
      id: 'demo-3', title: 'NOS Alive', category: 'Festivais',
      startDate: '2026-07-09T16:00:00', endDate: '2026-07-11T23:59:00',
      location: 'Passeio Marítimo de Algés, Oeiras', city: 'Oeiras', district: 'Lisboa',
      latitude: 38.6995, longitude: -9.2345,
      price: 84, priceType: 'Pago', priceLabel: 'Desde 84€', views: 2110,
      ticketUrl: 'https://nosalive.com/',
      description: 'Um dos maiores festivais de música de Portugal e referência no circuito europeu. Desde 2007 reúne grandes nomes do rock, pop, indie e eletrónica num recinto à beira-rio, com fácil acesso a partir de Lisboa.'
    },
    {
      id: 'demo-4', title: 'Afro Nation Portugal', category: 'Festivais',
      startDate: '2026-07-03T16:00:00', endDate: '2026-07-05T23:59:00',
      location: 'Praia da Rocha, Portimão', city: 'Portimão', district: 'Faro',
      latitude: 37.1185, longitude: -8.5365,
      price: 1, priceType: 'Pago', priceLabel: 'Ver site oficial', views: 760,
      ticketUrl: 'https://www.afronation.com/',
      description: 'Festival de afrobeats, R&B e música urbana na Praia da Rocha, no Algarve. Os preços variam por fase de venda e estão disponíveis no site oficial.'
    },
    {
      id: 'demo-5', title: 'MEO Kalorama', category: 'Festivais',
      startDate: '2026-08-28T16:00:00', endDate: '2026-08-30T23:59:00',
      location: 'Parque da Bela Vista, Lisboa', city: 'Lisboa', district: 'Lisboa',
      latitude: 38.7600, longitude: -9.1160,
      price: 95, priceType: 'Pago', priceLabel: 'Passe 95€', views: 980,
      ticketUrl: '',
      description: 'Festival de fim de verão no Parque da Bela Vista. Passe geral a 95€ na fase inicial; descontos para titulares do cartão Navegante e do Cartão Jovem Europeu.'
    },
    {
      id: 'demo-6', title: 'Festas de Santo António', category: 'Festivais',
      startDate: '2026-06-12T18:00:00', endDate: '2026-06-13T23:59:00',
      location: 'Alfama e bairros históricos, Lisboa', city: 'Lisboa', district: 'Lisboa',
      latitude: 38.7115, longitude: -9.1300,
      price: 0, priceType: 'Gratuito', priceLabel: 'Entrada Gratuita', views: 1560,
      ticketUrl: '',
      description: 'A maior festa popular de Lisboa, em honra do santo padroeiro da cidade. Alfama e os bairros históricos enchem-se de arraiais, sardinhas assadas e marchas populares.'
    },
    {
      id: 'demo-7', title: 'Festa de São João do Porto', category: 'Festivais',
      startDate: '2026-06-23T18:00:00', endDate: '2026-06-24T06:00:00',
      location: 'Ribeira e centro histórico, Porto', city: 'Porto', district: 'Porto',
      latitude: 41.1405, longitude: -8.6130,
      price: 0, priceType: 'Gratuito', priceLabel: 'Entrada Gratuita', views: 1430,
      ticketUrl: '',
      description: 'A festa mais emblemática do Porto, na noite de 23 para 24 de junho: martelos de plástico, alhos-porros, sardinhas e fogo de artifício sobre o rio Douro.'
    },
    {
      id: 'demo-8', title: 'Festa do Avante', category: 'Festivais',
      startDate: '2026-09-04T15:00:00', endDate: '2026-09-06T23:59:00',
      location: 'Quinta da Atalaia, Seixal', city: 'Seixal', district: 'Setúbal',
      latitude: 38.6270, longitude: -9.1150,
      price: 15, priceType: 'Pago', priceLabel: '≈ 15–20€/dia', views: 640,
      ticketUrl: '',
      description: 'Três dias de concertos, gastronomia regional, teatro, exposições e debates na Quinta da Atalaia.'
    },
    {
      id: 'demo-9', title: 'Festival Internacional de Vinhos do Douro', category: 'Gastronomia',
      startDate: '2026-07-03T15:00:00', endDate: '2026-07-04T23:00:00',
      location: 'Margens do Douro, Peso da Régua', city: 'Peso da Régua', district: 'Vila Real',
      latitude: 41.1630, longitude: -7.7870,
      price: 5, priceType: 'Pago', priceLabel: 'Entrada simbólica', views: 410,
      ticketUrl: '',
      description: 'Considerado o maior festival de vinhos da Península Ibérica, nas margens do rio Douro.'
    },
    {
      id: 'demo-10', title: 'Feira Nacional de Gastronomia', category: 'Gastronomia',
      startDate: '2026-10-22T12:00:00', endDate: '2026-11-01T23:00:00',
      location: 'Casa do Campino, Santarém', city: 'Santarém', district: 'Santarém',
      latitude: 39.2365, longitude: -8.6830,
      price: 0, priceType: 'Gratuito', priceLabel: 'Entrada Gratuita', views: 520,
      ticketUrl: '',
      description: '45.ª edição da feira que celebra a cozinha portuguesa, com tasquinhas de todo o país. Entrada gratuita no recinto; consumos pagos no local.'
    },
    {
      id: 'demo-11', title: 'Portugal Smart Cities Summit', category: 'Outros',
      startDate: '2026-05-12T09:30:00', endDate: '2026-05-14T18:00:00',
      location: 'FIL, Parque das Nações, Lisboa', city: 'Lisboa', district: 'Lisboa',
      latitude: 38.7660, longitude: -9.0935,
      price: 150, priceType: 'Pago', priceLabel: 'Desde ~150€', views: 290,
      ticketUrl: 'https://portugalsmartcities.fil.pt/',
      description: 'O principal evento nacional dedicado ao futuro urbano e à inovação das cidades e territórios.'
    },
    {
      id: 'demo-12', title: 'Web Summit 2026', category: 'Outros',
      startDate: '2026-11-09T09:00:00', endDate: '2026-11-12T19:00:00',
      location: 'MEO Arena e FIL, Parque das Nações, Lisboa', city: 'Lisboa', district: 'Lisboa',
      latitude: 38.7685, longitude: -9.0940,
      price: 895, priceType: 'Pago', priceLabel: 'Desde 895€', views: 2380,
      ticketUrl: 'https://websummit.com/',
      description: 'A maior conferência de tecnologia da Europa: mais de 70.000 participantes de 160+ países, 900+ oradores e 2.300+ startups. Inclui o Night Summit, com networking em espaços culturais de Lisboa.'
    }
  ];

  window.CULTURALL_DEMO_EVENTS = events.map(function (event, index) {
    var copy = Object.assign({}, event);
    copy.status = 'published';
    copy.organizer = 'Dados de teste';
    copy.isDemo = true;
    copy.image = buildCover(event.category, index + 3);
    return copy;
  });
})();
