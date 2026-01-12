(function () {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function initTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      applyTheme(stored);
      return;
    }
    if (prefersDark && prefersDark.matches) {
      applyTheme('dark');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  }

  let currentView = 'collection';
  let collectionData = null;
  let wantlistData = null;
  let currentSort = { key: 'artist', direction: 'asc' };
  let collectionMeta = null;
  let wantlistMeta = null;

  function renderTable(data) {
    const tbody = document.querySelector('#collection-table tbody');
    const countEl = document.getElementById('count');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No records found';
      td.className = 'loading';
      tr.appendChild(td);
      tbody.appendChild(tr);
      if (countEl) countEl.textContent = '0 records';
      return;
    }

    data.forEach((item) => {
      const tr = document.createElement('tr');

      const artistTd = document.createElement('td');
      artistTd.textContent = item.artist || '';
      tr.appendChild(artistTd);

      const albumTd = document.createElement('td');
      albumTd.textContent = item.album || '';
      tr.appendChild(albumTd);

      const genreTd = document.createElement('td');
      genreTd.textContent = item.genre || '';
      tr.appendChild(genreTd);

      const yearTd = document.createElement('td');
      yearTd.textContent = item.year || '';
      tr.appendChild(yearTd);

      tbody.appendChild(tr);
    });

    if (countEl) {
      const n = data.length;
      const label = currentView === 'wantlist' ? 'want' : 'record';
      countEl.textContent = `${n} ${label}${n === 1 ? '' : 's'}`;
    }
  }

  function applySearchAndSort() {
    const input = document.getElementById('search');
    const q = (input ? input.value : '').trim().toLowerCase();

    const baseData = currentView === 'wantlist' ? wantlistData : collectionData;
    if (!baseData) {
      renderTable([]);
      return;
    }

    let filtered = baseData;
    if (q) {
      filtered = baseData.filter((item) => {
        const artist = (item.artist || '').toLowerCase();
        const album = (item.album || '').toLowerCase();
        const genre = (item.genre || '').toLowerCase();
        return (
          artist.includes(q) ||
          album.includes(q) ||
          genre.includes(q)
        );
      });
    }

    const { key, direction } = currentSort;
    const sorted = [...filtered].sort((a, b) => {
      const av = (a[key] ?? '').toString().toLowerCase();
      const bv = (b[key] ?? '').toString().toLowerCase();
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    renderTable(sorted);
  }

  function setupSearch() {
    const input = document.getElementById('search');
    if (!input) return;

    input.addEventListener('input', () => {
      applySearchAndSort();
    });
  }

  function setupSorting() {
    const headers = document.querySelectorAll('#collection-table thead th[data-key]');
    if (!headers.length) return;

    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (!key) return;

        if (currentSort.key === key) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.key = key;
          currentSort.direction = 'asc';
        }

        headers.forEach((h) => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

        applySearchAndSort();
      });
    });
  }

  function updateLastUpdated(meta) {
    const el = document.getElementById('last-updated');
    if (!el || !meta || !meta.updated_at) return;

    try {
      const date = new Date(meta.updated_at);
      if (Number.isNaN(date.getTime())) return;

      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      el.textContent = `Last updated: ${formatter.format(date)}`;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to format last updated', e);
    }
  }

  async function loadData() {
    const tbody = document.querySelector('#collection-table tbody');
    const countEl = document.getElementById('count');

    try {
      const [collectionRes, wantlistRes] = await Promise.all([
        fetch('collection.json', { cache: 'no-store' }),
        fetch('wantlist.json', { cache: 'no-store' }),
      ]);

      if (!collectionRes.ok) {
        throw new Error(`collection.json HTTP ${collectionRes.status}`);
      }

      const collectionJson = await collectionRes.json();
      collectionMeta = collectionJson;
      collectionData = collectionJson.items || [];

      // Ensure genre field exists for all items
      collectionData = collectionData.map((item) => ({
        ...item,
        genre: item.genre || '',
      }));

      if (wantlistRes.ok) {
        const wantlistJson = await wantlistRes.json();
        wantlistMeta = wantlistJson;
        wantlistData = (wantlistJson.items || []).map((item) => ({
          ...item,
          genre: item.genre || '',
        }));
      } else {
        wantlistData = [];
        wantlistMeta = null;
      }

      updateLastUpdated(currentView === 'wantlist' ? wantlistMeta : collectionMeta);

      applySearchAndSort();
      setupSearch();
      setupSorting();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'Failed to load data.';
        td.className = 'loading';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
      if (countEl) countEl.textContent = '';
      // eslint-disable-next-line no-console
      console.error('Error loading data', err);
    }
  }

  function setupViewSwitch() {
    const select = document.getElementById('view-select');
    if (!select) return;

    select.addEventListener('change', () => {
      currentView = select.value === 'wantlist' ? 'wantlist' : 'collection';

      const meta = currentView === 'wantlist' ? wantlistMeta : collectionMeta;
      updateLastUpdated(meta);
      applySearchAndSort();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    setupViewSwitch();
    loadData();
  });
})();
