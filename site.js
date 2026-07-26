(function () {
  async function initMenu() {
    const host = document.getElementById('menu');

    if (!host) {
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
      const search = host.querySelector('#shipSearch');
      const currentPage = window.location.pathname.split('/').pop() || 'home.html';

      const setMenuOpen = isOpen => {
        body.classList.toggle('menu-open', isOpen);
        toggle?.setAttribute('aria-expanded', String(isOpen));
      };

      toggle?.addEventListener('click', () => setMenuOpen(true));
      close?.addEventListener('click', () => setMenuOpen(false));
      overlay?.addEventListener('click', () => setMenuOpen(false));

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          setMenuOpen(false);
        }
      });

      host.querySelectorAll('.menu-button').forEach(button => {
        button.addEventListener('click', () => {
          const submenu = button.nextElementSibling;
          const willOpen = !submenu.classList.contains('open');
          submenu.classList.toggle('open', willOpen);
          button.setAttribute('aria-expanded', String(willOpen));
        });
      });

      host.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');

        if (href === currentPage || (currentPage === '' && href === 'home.html')) {
          link.classList.add('active');
          const submenu = link.closest('.submenu');

          if (submenu) {
            submenu.classList.add('open');
            submenu.previousElementSibling?.setAttribute('aria-expanded', 'true');
          }
        }

        if (href === '#') {
          link.addEventListener('click', event => event.preventDefault());
        } else {
          link.addEventListener('click', () => setMenuOpen(false));
        }
      });

      search?.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase('zh-Hant');

        host.querySelectorAll('[data-search-group]').forEach(group => {
          const button = group.querySelector('.menu-button');
          const submenu = group.querySelector('.submenu');
          const links = [...submenu.querySelectorAll('a')];
          const groupMatches = button.textContent.toLocaleLowerCase('zh-Hant').includes(query);
          let visibleLinks = 0;

          links.forEach(link => {
            const matches = !query ||
              groupMatches ||
              link.textContent.toLocaleLowerCase('zh-Hant').includes(query);
            link.hidden = !matches;
            visibleLinks += Number(matches);
          });

          group.hidden = Boolean(query) && !groupMatches && visibleLinks === 0;

          if (query && !group.hidden) {
            submenu.classList.add('open');
            button.setAttribute('aria-expanded', 'true');
          }
        });
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
