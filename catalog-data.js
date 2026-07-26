(function () {
  const defaultImage = 'images/hero.jpg';

  function slugify(value) {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function company(id, name, formValue, menuGroup, shipNames, featuredShipNames = []) {
    return {
      id,
      name,
      formValue,
      menuGroup,
      featuredShipNames,
      ships: shipNames.map(name => {
        const nameSlug = slugify(name);
        return {
          slug: nameSlug.startsWith(`${id}-`) ? nameSlug : `${id}-${nameSlug}`,
          name
        };
      })
    };
  }

  const companies = [
    company('costa', 'Costa Cruises', 'Costa', 'primary', [
      'Costa Deliziosa', 'Costa Diadema', 'Costa Fascinosa', 'Costa Favolosa',
      'Costa Fortuna', 'Costa Pacifica', 'Costa Serena', 'Costa Smeralda',
      'Costa Toscana'
    ], ['Costa Serena']),

    company('msc', 'MSC Cruises', 'MSC', 'primary', [
      'MSC Armonia', 'MSC Bellissima', 'MSC Divina', 'MSC Euribia',
      'MSC Fantasia', 'MSC Grandiosa', 'MSC Lirica', 'MSC Magnifica',
      'MSC Meraviglia', 'MSC Musica', 'MSC Opera', 'MSC Orchestra',
      'MSC Poesia', 'MSC Preziosa', 'MSC Seascape', 'MSC Seashore',
      'MSC Seaside', 'MSC Seaview', 'MSC Sinfonia', 'MSC Splendida',
      'MSC Virtuosa', 'MSC World America', 'MSC World Asia',
      'MSC World Atlantic', 'MSC World Europa'
    ], ['MSC Bellissima']),

    company('starcruises', '麗星郵輪 StarCruises', 'StarCruises', 'primary', [
      'Star Navigator', 'Star Voyager'
    ], ['Star Navigator', 'Star Voyager']),

    company('dream-cruises', '星夢郵輪 Dream Cruises', 'Dream Cruises', 'primary', [
      'Genting Dream'
    ], ['Genting Dream']),

    company('disney', 'Disney Cruise Line', 'Disney', 'primary', [
      'Disney Adventure', 'Disney Destiny', 'Disney Dream', 'Disney Fantasy',
      'Disney Magic', 'Disney Treasure', 'Disney Wish', 'Disney Wonder'
    ], ['Disney Adventure']),

    company('royal-caribbean', 'Royal Caribbean', 'Royal Caribbean', 'primary', [
      'Adventure of the Seas', 'Allure of the Seas', 'Anthem of the Seas',
      'Brilliance of the Seas', 'Enchantment of the Seas', 'Explorer of the Seas',
      'Freedom of the Seas', 'Grandeur of the Seas', 'Harmony of the Seas',
      'Icon of the Seas', 'Independence of the Seas', 'Jewel of the Seas',
      'Liberty of the Seas', 'Mariner of the Seas', 'Navigator of the Seas',
      'Oasis of the Seas', 'Odyssey of the Seas', 'Ovation of the Seas',
      'Quantum of the Seas', 'Radiance of the Seas', 'Rhapsody of the Seas',
      'Serenade of the Seas', 'Spectrum of the Seas', 'Star of the Seas',
      'Symphony of the Seas', 'Utopia of the Seas', 'Vision of the Seas',
      'Voyager of the Seas', 'Wonder of the Seas'
    ], ['Ovation of the Seas']),

    company('princess', 'Princess Cruises', 'Princess', 'primary', [
      'Caribbean Princess', 'Coral Princess', 'Crown Princess',
      'Diamond Princess', 'Discovery Princess', 'Emerald Princess',
      'Enchanted Princess', 'Grand Princess', 'Island Princess',
      'Majestic Princess', 'Regal Princess', 'Royal Princess', 'Ruby Princess',
      'Sapphire Princess', 'Sky Princess', 'Star Princess', 'Sun Princess'
    ], ['Diamond Princess', 'Sapphire Princess']),

    company('carnival', 'Carnival Cruise Line', 'Carnival', 'other', [
      'Carnival Adventure', 'Carnival Breeze', 'Carnival Celebration',
      'Carnival Conquest', 'Carnival Dream', 'Carnival Elation',
      'Carnival Encounter', 'Carnival Firenze', 'Carnival Freedom',
      'Carnival Glory', 'Carnival Horizon', 'Carnival Jubilee',
      'Carnival Legend', 'Carnival Liberty', 'Carnival Luminosa',
      'Carnival Magic', 'Mardi Gras', 'Carnival Miracle', 'Carnival Panorama',
      'Carnival Paradise', 'Carnival Pride', 'Carnival Radiance',
      'Carnival Spirit', 'Carnival Splendor', 'Carnival Sunrise',
      'Carnival Sunshine', 'Carnival Valor', 'Carnival Venezia', 'Carnival Vista'
    ]),

    company('holland-america', 'Holland America Line', 'Holland America', 'other', [
      'Eurodam', 'Koningsdam', 'Nieuw Amsterdam', 'Nieuw Statendam', 'Noordam',
      'Oosterdam', 'Rotterdam', 'Volendam', 'Westerdam', 'Zaandam', 'Zuiderdam'
    ]),

    company('cunard', 'Cunard', 'Cunard', 'other', [
      'Queen Anne', 'Queen Elizabeth', 'Queen Mary 2', 'Queen Victoria'
    ]),

    company('celebrity', 'Celebrity Cruises', 'Celebrity', 'other', [
      'Celebrity Apex', 'Celebrity Ascent', 'Celebrity Beyond',
      'Celebrity Constellation', 'Celebrity Eclipse', 'Celebrity Edge',
      'Celebrity Equinox', 'Celebrity Flora', 'Celebrity Infinity',
      'Celebrity Millennium', 'Celebrity Reflection', 'Celebrity Silhouette',
      'Celebrity Solstice', 'Celebrity Summit', 'Celebrity Xcel'
    ]),

    company('norwegian', 'Norwegian Cruise Line', 'Norwegian', 'other', [
      'Norwegian Aqua', 'Norwegian Bliss', 'Norwegian Breakaway',
      'Norwegian Dawn', 'Norwegian Encore', 'Norwegian Epic', 'Norwegian Escape',
      'Norwegian Gem', 'Norwegian Getaway', 'Norwegian Jade', 'Norwegian Jewel',
      'Norwegian Joy', 'Norwegian Luna', 'Norwegian Pearl', 'Norwegian Prima',
      'Norwegian Sky', 'Norwegian Spirit', 'Norwegian Star', 'Norwegian Sun',
      'Norwegian Viva', 'Pride of America'
    ]),

    company('virgin', 'Virgin Voyages', 'Virgin Voyages', 'other', [
      'Brilliant Lady', 'Resilient Lady', 'Scarlet Lady', 'Valiant Lady'
    ]),

    company('oceania', 'Oceania Cruises', 'Oceania', 'other', [
      'Oceania Allura', 'Oceania Insignia', 'Oceania Marina', 'Oceania Nautica',
      'Oceania Regatta', 'Oceania Riviera', 'Oceania Sirena', 'Oceania Vista'
    ]),

    company('silversea', 'Silversea', 'Silversea', 'other', [
      'Silver Cloud', 'Silver Dawn', 'Silver Endeavour', 'Silver Moon',
      'Silver Muse', 'Silver Nova', 'Silver Origin', 'Silver Ray',
      'Silver Shadow', 'Silver Spirit', 'Silver Whisper', 'Silver Wind'
    ]),

    company('seabourn', 'Seabourn', 'Seabourn', 'other', [
      'Seabourn Encore', 'Seabourn Ovation', 'Seabourn Pursuit',
      'Seabourn Quest', 'Seabourn Sojourn', 'Seabourn Venture'
    ]),

    company('azamara', 'Azamara', 'Azamara', 'other', [
      'Azamara Journey', 'Azamara Onward', 'Azamara Pursuit', 'Azamara Quest'
    ]),

    company('regent', 'Regent Seven Seas Cruises', 'Regent Seven Seas', 'other', [
      'Seven Seas Explorer', 'Seven Seas Grandeur', 'Seven Seas Mariner',
      'Seven Seas Navigator', 'Seven Seas Prestige', 'Seven Seas Splendor',
      'Seven Seas Voyager'
    ]),

    company('windstar', 'Windstar Cruises', 'Windstar', 'other', [
      'Star Breeze', 'Star Explorer', 'Star Legend', 'Star Pride',
      'Star Seeker', 'Wind Spirit', 'Wind Surf'
    ]),

    company('arosa', 'A-ROSA', 'A-ROSA', 'river', [
      'A-ROSA AQUA', 'A-ROSA BELLA', 'A-ROSA BRAVA', 'A-ROSA DONNA',
      'A-ROSA FLORA', 'A-ROSA LUNA', 'A-ROSA MIA', 'A-ROSA RIVA',
      'A-ROSA SENA', 'A-ROSA SILVA', 'A-ROSA STELLA', 'A-ROSA VIVA'
    ]),

    company('tui-river', 'TUI River Cruises', 'TUI River Cruises', 'river', [
      'TUI Al Horeya', 'TUI Aria', 'TUI Bahareya', 'TUI Isla',
      'TUI Maya', 'TUI Skyla'
    ]),

    company('croisieurope', 'CroisiEurope', 'CroisiEurope', 'river', [
      'Elbe Princesse', 'Elbe Princesse II', 'Gil Eanes', 'La Belle de Cadix',
      'La Belle de l’Adriatique', 'La Belle des Océans', 'Loire Princesse',
      'MS Amalia Rodrigues', 'MS Anne-Marie', 'MS Beethoven', 'MS Botticelli',
      'MS Camargue', 'MS Cyrano de Bergerac', 'MS Douce France',
      'MS Elbe Princesse', 'MS Gérard Schmitter', 'MS Lafayette',
      'MS Léonard de Vinci', 'MS Loire Princesse', 'MS Mistral',
      'MS Modigliani', 'MS Mona Lisa', 'MS Renoir', 'MS Rhône Princess',
      'MS Seine Princess', 'MS Symphonie', 'MS Victor Hugo'
    ]),

    company('viking-river', 'Viking River Cruises', 'Viking River Cruises', 'river', [
      'Viking Aegir', 'Viking Alruna', 'Viking Atla', 'Viking Baldur',
      'Viking Bragi', 'Viking Delling', 'Viking Einar', 'Viking Egdir',
      'Viking Forseti', 'Viking Freya', 'Viking Gefjon', 'Viking Gullveig',
      'Viking Heimdal', 'Viking Herja', 'Viking Hild', 'Viking Idi',
      'Viking Ingvi', 'Viking Jarl', 'Viking Kadlin', 'Viking Kara',
      'Viking Kvasir', 'Viking Lif', 'Viking Lofn', 'Viking Magni',
      'Viking Mani', 'Viking Mimir', 'Viking Modi', 'Viking Njord',
      'Viking Odin', 'Viking Rinda', 'Viking Rolf', 'Viking Skaga',
      'Viking Skirnir', 'Viking Tialfi', 'Viking Tor', 'Viking Ullur',
      'Viking Vali', 'Viking Var', 'Viking Ve', 'Viking Vidar'
    ]),

    company('amawaterways', 'AmaWaterways', 'AmaWaterways', 'river', [
      'AmaBella', 'AmaCello', 'AmaCerto', 'AmaDahlia', 'AmaDante',
      'AmaDolce', 'AmaDouro', 'AmaKristina', 'AmaLea', 'AmaLucia',
      'AmaMagna', 'AmaMora', 'AmaPrima', 'AmaReina', 'AmaSerena',
      'AmaSiena', 'AmaSonata', 'AmaStella', 'AmaVerde', 'AmaVenita',
      'AmaVida', 'AmaViola'
    ]),

    company('avalon', 'Avalon Waterways', 'Avalon Waterways', 'river', [
      'Avalon Alegria', 'Avalon Artistry II', 'Avalon Envision',
      'Avalon Expression', 'Avalon Illumination', 'Avalon Imagery II',
      'Avalon Impression', 'Avalon Panorama', 'Avalon Passion',
      'Avalon Poetry II', 'Avalon Saigon', 'Avalon Tranquility II',
      'Avalon View', 'Avalon Vista'
    ]),

    company('uniworld', 'Uniworld', 'Uniworld', 'river', [
      'Beatrice', 'Bon Voyage', 'Joie de Vivre', 'Mekong Jewel',
      'River Duchess', 'River Princess', 'S.S. Antoinette', 'S.S. Beatrice',
      'S.S. Bon Voyage', 'S.S. Catherine', 'S.S. Elisabeth',
      'S.S. Emilie', 'S.S. Joie de Vivre', 'S.S. La Venezia',
      'S.S. Maria Theresa', 'S.S. São Gabriel', 'S.S. Sphinx',
      'S.S. Victoria'
    ]),

    company('scenic-river', 'Scenic River Cruises', 'Scenic River Cruises', 'river', [
      'Scenic Amber', 'Scenic Azure', 'Scenic Crystal', 'Scenic Diamond',
      'Scenic Gem', 'Scenic Jade', 'Scenic Jasper', 'Scenic Jewel',
      'Scenic Opal', 'Scenic Ruby', 'Scenic Sapphire', 'Scenic Spirit'
    ])
  ];

<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> a07de8dfb51877b5c7a59293b84ce1a729716829
  // Aby dodać film do kolejnego statku, wklej tutaj:
  // 'slug-statku': 'ID_FILMU_Z_YOUTUBE',
  const youtubeVideoIds = {
    'msc-bellissima': 'CNnpxih-GRY'
  };

<<<<<<< HEAD
=======
=======
>>>>>>> 63cffdaebbdea878e1e30f80b0a5b6d181c68aa3
>>>>>>> a07de8dfb51877b5c7a59293b84ce1a729716829
  companies.forEach(item => {
    item.ships.forEach(ship => {
      ship.companyId = item.id;
      ship.companyName = item.name;
      ship.line = item.formValue;
      ship.image = ship.image || defaultImage;
      ship.featured = item.featuredShipNames.includes(ship.name);
<<<<<<< HEAD
      ship.youtubeVideoId = youtubeVideoIds[ship.slug] || '';
=======
<<<<<<< HEAD
      ship.youtubeVideoId = youtubeVideoIds[ship.slug] || '';
=======
>>>>>>> 63cffdaebbdea878e1e30f80b0a5b6d181c68aa3
>>>>>>> a07de8dfb51877b5c7a59293b84ce1a729716829
    });
  });

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('en');
  }

  function getCompany(idOrValue) {
    const wanted = normalize(idOrValue);
    return companies.find(item =>
      normalize(item.id) === wanted ||
      normalize(item.formValue) === wanted ||
      normalize(item.name) === wanted
    );
  }

  function getShip(slugOrName) {
    const wanted = normalize(slugOrName);

    for (const item of companies) {
      const ship = item.ships.find(candidate =>
        normalize(candidate.slug) === wanted || normalize(candidate.name) === wanted
      );

      if (ship) {
        return ship;
      }
    }

    return undefined;
  }

  function getCompaniesByGroup(group) {
    return companies.filter(item => item.menuGroup === group);
  }

  function getGroupForLine(line) {
    return getCompany(line)?.menuGroup || 'other';
  }

  function isKnownShip(line, shipName) {
    const item = getCompany(line);
    return Boolean(item?.ships.some(ship => normalize(ship.name) === normalize(shipName)));
  }

  window.CRUISE_CATALOG = {
    companies,
    defaultImage,
    getCompany,
    getShip,
    getCompaniesByGroup,
    getGroupForLine,
    isKnownShip,
    normalize
  };
})();
