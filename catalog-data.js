(function () {
  const defaultImage = 'images/hero.jpg';

  const companies = [
    {
      id: 'msc',
      name: 'MSC Cruises',
      formValue: 'MSC',
      featuredShips: [
        'msc-bellissima',
        'msc-world-europa',
        'msc-virtuosa',
        'msc-magnifica'
      ],
      ships: [
        { slug: 'msc-armonia', name: 'MSC Armonia' },
        { slug: 'msc-bellissima', name: 'MSC Bellissima' },
        { slug: 'msc-divina', name: 'MSC Divina' },
        { slug: 'msc-euribia', name: 'MSC Euribia' },
        { slug: 'msc-fantasia', name: 'MSC Fantasia' },
        { slug: 'msc-grandiosa', name: 'MSC Grandiosa' },
        { slug: 'msc-lirica', name: 'MSC Lirica' },
        { slug: 'msc-magnifica', name: 'MSC Magnifica' },
        { slug: 'msc-meraviglia', name: 'MSC Meraviglia' },
        { slug: 'msc-musica', name: 'MSC Musica' },
        { slug: 'msc-opera', name: 'MSC Opera' },
        { slug: 'msc-orchestra', name: 'MSC Orchestra' },
        { slug: 'msc-poesia', name: 'MSC Poesia' },
        { slug: 'msc-preziosa', name: 'MSC Preziosa' },
        { slug: 'msc-seascape', name: 'MSC Seascape' },
        { slug: 'msc-seashore', name: 'MSC Seashore' },
        { slug: 'msc-seaside', name: 'MSC Seaside' },
        { slug: 'msc-seaview', name: 'MSC Seaview' },
        { slug: 'msc-sinfonia', name: 'MSC Sinfonia' },
        { slug: 'msc-splendida', name: 'MSC Splendida' },
        { slug: 'msc-virtuosa', name: 'MSC Virtuosa' },
        { slug: 'msc-world-america', name: 'MSC World America' },
        { slug: 'msc-world-asia', name: 'MSC World Asia' },
        { slug: 'msc-world-atlantic', name: 'MSC World Atlantic', upcoming: true },
        { slug: 'msc-world-europa', name: 'MSC World Europa' }
      ]
    },
    {
      id: 'costa',
      name: 'Costa Cruises',
      formValue: 'Costa',
      featuredShips: ['costa-toscana', 'costa-smeralda', 'costa-deliziosa'],
      ships: [
        { slug: 'costa-deliziosa', name: 'Costa Deliziosa' },
        { slug: 'costa-smeralda', name: 'Costa Smeralda' },
        { slug: 'costa-toscana', name: 'Costa Toscana' }
      ]
    },
    {
      id: 'disney',
      name: 'Disney Cruise Line',
      formValue: 'Disney',
      featuredShips: ['disney-dream', 'disney-fantasy', 'disney-wish'],
      ships: [
        { slug: 'disney-dream', name: 'Disney Dream' },
        { slug: 'disney-fantasy', name: 'Disney Fantasy' },
        { slug: 'disney-wish', name: 'Disney Wish' }
      ]
    },
    {
      id: 'river',
      name: '河輪',
      formValue: '河輪',
      featuredShips: [],
      ships: []
    }
  ];

  companies.forEach(company => {
    company.ships.forEach(ship => {
      ship.companyId = company.id;
      ship.companyName = company.name;
      ship.line = company.formValue;
      ship.image = ship.image || defaultImage;
    });
  });

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('en');
  }

  function getCompany(idOrValue) {
    const wanted = normalize(idOrValue);
    return companies.find(company =>
      normalize(company.id) === wanted ||
      normalize(company.formValue) === wanted ||
      normalize(company.name) === wanted
    );
  }

  function getShip(slugOrName) {
    const wanted = normalize(slugOrName);

    for (const company of companies) {
      const ship = company.ships.find(item =>
        normalize(item.slug) === wanted || normalize(item.name) === wanted
      );

      if (ship) {
        return ship;
      }
    }

    return undefined;
  }

  function isKnownShip(line, shipName) {
    const company = getCompany(line);
    return Boolean(company?.ships.some(ship => normalize(ship.name) === normalize(shipName)));
  }

  window.CRUISE_CATALOG = {
    companies,
    defaultImage,
    getCompany,
    getShip,
    isKnownShip,
    normalize
  };
})();
