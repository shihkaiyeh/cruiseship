(function () {
  function createLink(label, href, className = '') {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.className = className;
    return link;
  }

  function shipUrl(ship) {
    return `ship.html?ship=${encodeURIComponent(ship.slug)}`;
  }

  function lineUrl(company) {
    return `line.html?line=${encodeURIComponent(company.id)}`;
  }

  function currentLocationKey() {
    const file = window.location.pathname.split('/').pop() || 'home.html';
    return `${file}${window.location.search}`;
  }

  function markActiveLink(host) {
    const current = currentLocationKey();

    host.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');

      if (href === current || (current === 'home.html' && href === 'home.html')) {
        link.classList.add('active');
        const submenu = link.closest('.submenu');

        if (submenu) {
          submenu.classList.add('open');
          submenu.previousElementSibling?.setAttribute('aria-expanded', 'true');
        }
      }
    });
  }

  function buildCatalogMenu(container) {
    const catalog = window.CRUISE_CATALOG;
    container.replaceChildren();

    catalog.companies.forEach((company, index) => {
      const item = document.createElement('div');
      item.className = 'menu-item';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-button';
      button.textContent = company.name;
      button.setAttribute('aria-expanded', String(index === 0));

      const submenu = document.createElement('div');
      submenu.className = `submenu${index === 0 ? ' open' : ''}`;
      submenu.appendChild(createLink(`${company.name} 所有評價`, lineUrl(company)));

      const featuredShips = company.featuredShips
        .map(slug => catalog.getShip(slug))
        .filter(Boolean);

      featuredShips.forEach(ship => {
        submenu.appendChild(createLink(ship.name, shipUrl(ship)));
      });

      if (company.ships.length > featuredShips.length) {
        submenu.appendChild(
          createLink(`查看全部 ${company.ships.length} 艘郵輪 →`, lineUrl(company), 'submenu-all-link')
        );
      } else if (company.ships.length === 0) {
        const note = document.createElement('span');
        note.className = 'submenu-note';
        note.textContent = '船隻目錄即將推出';
        submenu.appendChild(note);
      }

      button.addEventListener('click', () => {
        const willOpen = !submenu.classList.contains('open');
        submenu.classList.toggle('open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
      });

      item.append(button, submenu);
      container.appendChild(item);
    });
  }

  function setupSearch(host, closeMenu) {
    const search = host.querySelector('#shipSearch');
    const results = host.querySelector('#shipSearchResults');
    const catalog = window.CRUISE_CATALOG;

    search?.addEventListener('input', () => {
      const query = catalog.normalize(search.value);
      results.replaceChildren();

      if (!query) {
        results.hidden = true;
        return;
      }

      const matches = catalog.companies.flatMap(company => {
        const companyMatch = catalog.normalize(company.name).includes(query);
        return company.ships
          .filter(ship => companyMatch || catalog.normalize(ship.name).includes(query))
          .map(ship => ({ company, ship }));
      }).slice(0, 12);

      if (matches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'search-empty';
        empty.textContent = '找不到這艘郵輪';
        results.appendChild(empty);

        const addMissing = createLink('手動新增評價 →', 'add-review.html?missing=1', 'search-add-missing');
        addMissing.addEventListener('click', closeMenu);
        results.appendChild(addMissing);
      } else {
        matches.forEach(({ company, ship }) => {
          const link = createLink(ship.name, shipUrl(ship), 'search-result-link');
          const companyName = document.createElement('small');
          companyName.textContent = company.name;
          link.appendChild(companyName);
          link.addEventListener('click', closeMenu);
          results.appendChild(link);
        });
      }

      results.hidden = false;
    });
  }

  async function initMenu() {
    const host = document.getElementById('menu');

    if (!host || !window.CRUISE_CATALOG) {
      return;
    }

    try {
      const response = await fetch('./menu.html');

      if (!response.ok) {
        throw new Error('Menu could not be loaded');
      }

      host.innerHTML = await response.text();

      const body = document.body;
      const toggle = host.querySelector('.menu-toggle');
      const close = host.querySelector('.menu-close');
      const overlay = host.querySelector('.menu-overlay');
      const catalogContainer = host.querySelector('#cruiseCatalog');

      const setMenuOpen = isOpen => {
        body.classList.toggle('menu-open', isOpen);
        toggle?.setAttribute('aria-expanded', String(isOpen));
      };

      const closeMenu = () => setMenuOpen(false);

      toggle?.addEventListener('click', () => setMenuOpen(true));
      close?.addEventListener('click', closeMenu);
      overlay?.addEventListener('click', closeMenu);

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          closeMenu();
        }
      });

      buildCatalogMenu(catalogContainer);
      markActiveLink(host);
      setupSearch(host, closeMenu);

      host.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', closeMenu);
      });
    } catch (error) {
      host.innerHTML = '<a class="menu-toggle" href="home.html" aria-label="回到首頁">⌂</a>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenu);
  } else {
    initMenu();
  }
})();
