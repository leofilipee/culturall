/* Distritos, cidades (concelhos) e coordenadas aproximadas do centro de cada uma.
   Usado no formulário de eventos (distrito → cidade) e no mapa, para a localização ficar certa. */
(function () {
  'use strict';

  const raw = {
    Aveiro: { Aveiro: [40.6405, -8.6538], 'Águeda': [40.574, -8.445], 'Albergaria-a-Velha': [40.692, -8.479], Anadia: [40.439, -8.433], Arouca: [40.93, -8.245], Espinho: [41.007, -8.641], Estarreja: [40.754, -8.576], 'Ílhavo': [40.599, -8.67], Mealhada: [40.379, -8.447], 'Oliveira de Azeméis': [40.84, -8.477], Ovar: [40.859, -8.626], 'Santa Maria da Feira': [40.927, -8.548], 'São João da Madeira': [40.9, -8.49], Vagos: [40.552, -8.698], 'Vale de Cambra': [40.842, -8.396] },
    Beja: { Beja: [38.015, -7.863], Aljustrel: [37.88, -8.16], 'Almodôvar': [37.51, -8.06], Cuba: [38.173, -7.888], 'Ferreira do Alentejo': [38.056, -8.119], Moura: [38.14, -7.45], Odemira: [37.597, -8.638], Serpa: [37.944, -7.599], Vidigueira: [38.21, -7.795] },
    Braga: { Braga: [41.5454, -8.4265], Amares: [41.631, -8.35], Barcelos: [41.5388, -8.6151], 'Cabeceiras de Basto': [41.514, -7.989], 'Celorico de Basto': [41.397, -8.002], Esposende: [41.533, -8.782], Fafe: [41.45, -8.173], 'Guimarães': [41.4416, -8.2918], 'Póvoa de Lanhoso': [41.577, -8.27], 'Terras de Bouro': [41.717, -8.3], 'Vieira do Minho': [41.633, -8.133], 'Vila Nova de Famalicão': [41.409, -8.519], 'Vila Verde': [41.647, -8.437], Vizela: [41.379, -8.299] },
    'Bragança': { 'Bragança': [41.806, -6.757], 'Alfândega da Fé': [41.343, -6.968], 'Macedo de Cavaleiros': [41.539, -6.964], Mirandela: [41.485, -7.183], 'Miranda do Douro': [41.497, -6.272], Mogadouro: [41.34, -6.717], 'Torre de Moncorvo': [41.172, -7.048], 'Vila Flor': [41.304, -7.15], Vinhais: [41.83, -7.0] },
    'Castelo Branco': { 'Castelo Branco': [39.8222, -7.4909], Belmonte: [40.36, -7.35], 'Covilhã': [40.281, -7.504], 'Fundão': [40.138, -7.5], 'Idanha-a-Nova': [39.92, -7.237], Oleiros: [39.92, -7.91], 'Sertã': [39.803, -8.096], 'Vila Velha de Ródão': [39.667, -7.683] },
    Coimbra: { Coimbra: [40.2033, -8.4103], Arganil: [40.217, -8.053], Cantanhede: [40.347, -8.593], 'Condeixa-a-Nova': [40.113, -8.498], 'Figueira da Foz': [40.1508, -8.8618], 'Lousã': [40.11, -8.247], Mira: [40.426, -8.733], 'Miranda do Corvo': [40.093, -8.331], 'Montemor-o-Velho': [40.17, -8.683], 'Oliveira do Hospital': [40.358, -7.865], Penacova: [40.269, -8.283], Soure: [40.055, -8.628], 'Tábua': [40.363, -8.026] },
    'Évora': { 'Évora': [38.571, -7.909], Arraiolos: [38.724, -7.985], Borba: [38.803, -7.458], Estremoz: [38.843, -7.589], 'Montemor-o-Novo': [38.647, -8.217], Mora: [38.939, -8.165], Redondo: [38.646, -7.545], 'Reguengos de Monsaraz': [38.425, -7.533], 'Vendas Novas': [38.68, -8.456], 'Vila Viçosa': [38.777, -7.422] },
    Faro: { Faro: [37.0194, -7.9304], Albufeira: [37.089, -8.25], Alcoutim: [37.472, -7.473], Aljezur: [37.319, -8.803], 'Castro Marim': [37.219, -7.444], Lagoa: [37.136, -8.453], Lagos: [37.102, -8.674], 'Loulé': [37.138, -8.023], Monchique: [37.317, -8.555], 'Olhão': [37.026, -7.841], 'Portimão': [37.139, -8.538], 'São Brás de Alportel': [37.153, -7.887], Silves: [37.189, -8.439], Tavira: [37.127, -7.65], 'Vila do Bispo': [37.083, -8.91], 'Vila Real de Santo António': [37.194, -7.416] },
    Guarda: { Guarda: [40.5373, -7.2678], 'Aguiar da Beira': [40.81, -7.537], Almeida: [40.726, -6.906], 'Celorico da Beira': [40.637, -7.393], 'Figueira de Castelo Rodrigo': [40.892, -6.957], 'Fornos de Algodres': [40.619, -7.54], Gouveia: [40.489, -7.593], Manteigas: [40.4, -7.537], Meda: [40.97, -7.267], Pinhel: [40.776, -7.064], Sabugal: [40.351, -7.089], Seia: [40.417, -7.7], Trancoso: [40.775, -7.351] },
    Leiria: { Leiria: [39.7437, -8.807], Alcobaça: [39.548, -8.977], Alvaiázere: [39.821, -8.386], 'Ansião': [39.914, -8.435], Batalha: [39.659, -8.824], Bombarral: [39.268, -9.156], 'Caldas da Rainha': [39.403, -9.138], 'Castanheira de Pera': [40.0, -8.213], 'Figueiró dos Vinhos': [39.904, -8.273], 'Marinha Grande': [39.75, -8.933], 'Nazaré': [39.601, -9.071], 'Óbidos': [39.36, -9.157], 'Pedrógão Grande': [39.923, -8.119], Peniche: [39.356, -9.381], Pombal: [39.916, -8.628], 'Porto de Mós': [39.602, -8.817] },
    Lisboa: { Lisboa: [38.7223, -9.1393], Alenquer: [39.054, -9.01], Amadora: [38.754, -9.23], 'Arruda dos Vinhos': [38.986, -9.082], Azambuja: [39.068, -8.865], Cadaval: [39.243, -9.103], Cascais: [38.697, -9.421], Loures: [38.831, -9.169], 'Lourinhã': [39.242, -9.313], Mafra: [38.937, -9.328], Odivelas: [38.793, -9.183], Oeiras: [38.697, -9.309], Sintra: [38.8029, -9.3817], 'Sobral de Monte Agraço': [38.999, -9.151], 'Torres Vedras': [39.091, -9.259], 'Vila Franca de Xira': [38.955, -8.989] },
    Portalegre: { Portalegre: [39.2967, -7.4286], 'Alter do Chão': [39.197, -7.658], Arronches: [39.122, -7.284], Avis: [39.055, -7.893], 'Campo Maior': [39.011, -7.068], 'Castelo de Vide': [39.417, -7.457], Crato: [39.286, -7.645], Elvas: [38.881, -7.163], Fronteira: [39.056, -7.648], 'Gavião': [39.465, -7.944], Marvão: [39.393, -7.377], Monforte: [39.046, -7.44], Nisa: [39.517, -7.647], 'Ponte de Sor': [39.25, -8.01], Sousel: [38.957, -7.676] },
    Porto: { Porto: [41.1579, -8.6291], Amarante: [41.27, -8.076], 'Baião': [41.163, -8.035], Felgueiras: [41.364, -8.196], Gondomar: [41.144, -8.532], Lousada: [41.279, -8.282], Maia: [41.231, -8.62], 'Marco de Canaveses': [41.183, -8.148], Matosinhos: [41.182, -8.689], 'Paços de Ferreira': [41.276, -8.375], Paredes: [41.205, -8.333], Penafiel: [41.208, -8.282], 'Póvoa de Varzim': [41.383, -8.762], 'Santo Tirso': [41.343, -8.474], Trofa: [41.338, -8.56], Valongo: [41.19, -8.498], 'Vila do Conde': [41.353, -8.744], 'Vila Nova de Gaia': [41.124, -8.613] },
    'Santarém': { 'Santarém': [39.2369, -8.686], Abrantes: [39.463, -8.197], Almeirim: [39.208, -8.627], Alpiarça: [39.248, -8.59], Benavente: [38.979, -8.804], Cartaxo: [39.158, -8.787], 'Constância': [39.477, -8.333], Coruche: [38.957, -8.526], Entroncamento: [39.465, -8.463], 'Ferreira do Zêzere': [39.692, -8.297], 'Golegã': [39.4, -8.48], 'Mação': [39.556, -8.007], 'Ourém': [39.66, -8.584], 'Rio Maior': [39.339, -8.938], 'Salvaterra de Magos': [39.021, -8.791], Sardoal: [39.532, -8.155], Tomar: [39.603, -8.409], 'Torres Novas': [39.479, -8.541] },
    'Setúbal': { 'Setúbal': [38.5244, -8.8882], 'Alcácer do Sal': [38.373, -8.512], Alcochete: [38.756, -8.961], Almada: [38.679, -9.157], Barreiro: [38.663, -9.072], 'Grândola': [38.174, -8.567], Moita: [38.65, -8.99], Montijo: [38.706, -8.974], Palmela: [38.57, -8.901], 'Santiago do Cacém': [38.02, -8.693], Seixal: [38.64, -9.103], Sesimbra: [38.444, -9.101], Sines: [37.956, -8.869] },
    'Viana do Castelo': { 'Viana do Castelo': [41.6918, -8.8345], 'Arcos de Valdevez': [41.847, -8.422], Caminha: [41.874, -8.844], Melgaço: [42.115, -8.258], 'Monção': [42.078, -8.481], 'Paredes de Coura': [41.914, -8.56], 'Ponte da Barca': [41.807, -8.419], 'Ponte de Lima': [41.767, -8.583], 'Valença': [42.027, -8.643], 'Vila Nova de Cerveira': [41.94, -8.74] },
    'Vila Real': { 'Vila Real': [41.3006, -7.7441], 'Alijó': [41.278, -7.477], Boticas: [41.686, -7.665], Chaves: [41.74, -7.469], 'Mesão Frio': [41.159, -7.883], Montalegre: [41.823, -7.79], 'Mondim de Basto': [41.417, -7.956], 'Murça': [41.402, -7.456], 'Peso da Régua': [41.165, -7.788], Sabrosa: [41.275, -7.589], 'Santa Marta de Penaguião': [41.208, -7.789], 'Valpaços': [41.607, -7.31], 'Vila Pouca de Aguiar': [41.494, -7.645] },
    Viseu: { Viseu: [40.6566, -7.9139], 'Carregal do Sal': [40.43, -8.02], 'Castro Daire': [40.903, -7.934], 'Cinfães': [41.073, -8.11], Lamego: [41.097, -7.809], Mangualde: [40.604, -7.759], 'Moimenta da Beira': [40.983, -7.612], Nelas: [40.53, -7.852], 'Oliveira de Frades': [40.73, -8.179], 'Penalva do Castelo': [40.674, -7.684], Resende: [41.078, -7.964], 'Santa Comba Dão': [40.391, -8.133], 'São Pedro do Sul': [40.758, -8.067], 'Sátão': [40.729, -7.739], Tarouca: [41.02, -7.762], Tondela: [40.518, -8.082], Vouzela: [40.721, -8.11] },
    Outros: { Funchal: [32.6669, -16.9241], Machico: [32.717, -16.774], 'Ponta Delgada': [37.7412, -25.6756], 'Angra do Heroísmo': [38.655, -27.221], Horta: [38.537, -28.631], 'Outra localidade': null }
  };

  const collator = new Intl.Collator('pt', { sensitivity: 'base' });
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  const districts = Object.keys(raw);
  const citiesByDistrict = {};
  const cityIndex = new Map();
  districts.forEach((district) => {
    // "Outra localidade" fica sempre no fim da lista.
    citiesByDistrict[district] = Object.keys(raw[district]).sort((a, b) => {
      if (a === 'Outra localidade') return 1;
      if (b === 'Outra localidade') return -1;
      return collator.compare(a, b);
    });
    citiesByDistrict[district].forEach((city) => {
      if (raw[district][city] && !cityIndex.has(normalize(city))) {
        cityIndex.set(normalize(city), raw[district][city]);
      }
    });
  });

  window.CulturAllPlaces = {
    districts,
    cities: (district) => citiesByDistrict[district] ?? [],
    // Coordenadas de uma cidade (dentro do distrito indicado, ou em qualquer distrito).
    coordinates: (city, district) => {
      const inDistrict = district ? raw[district]?.[city] : null;
      return inDistrict ?? cityIndex.get(normalize(city)) ?? null;
    }
  };
}());
