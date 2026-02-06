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
    const stored = localStorage.getItem('records.theme');
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
    localStorage.setItem('records.theme', next);
  }

  let currentView = 'collection'; // 'collection' | 'wantlist' | 'stats'
  let collectionData = null;
  let wantlistData = null;
  let currentSort = { key: 'artist', direction: 'asc' };
  let collectionMeta = null;
  let wantlistMeta = null;
  let collectionIds = new Set();
  let statsSource = 'collection'; // 'collection' | 'wantlist' | 'all'

  function setView(view) {
    if (view === 'stats') {
      currentView = 'stats';
    } else if (view === 'wantlist') {
      currentView = 'wantlist';
    } else {
      currentView = 'collection';
    }

    const select = document.getElementById('view-select');
    if (select) {
      select.value = currentView;
    }

    const desktopToggle = document.querySelectorAll('.view-toggle-button');
    if (desktopToggle && desktopToggle.length) {
      desktopToggle.forEach((btn) => {
        const btnView = btn.getAttribute('data-view');
        if (btnView === currentView) {
          btn.classList.add('is-active');
        } else {
          btn.classList.remove('is-active');
        }
      });
    }

    try {
      localStorage.setItem('records.view', currentView);
    } catch (e) {
      // ignore storage errors
    }

    const tableWrapper = document.querySelector('.table-wrapper');
    const controlsSection = document.querySelector('.controls');
    const statsViewEl = document.getElementById('stats-view');

    if (currentView === 'stats') {
      if (tableWrapper) {
        tableWrapper.hidden = true;
      }
      if (controlsSection) {
        controlsSection.hidden = true;
      }
      if (statsViewEl) {
        statsViewEl.hidden = false;
        renderStats();
      }
      updateLastUpdated(collectionMeta);
    } else {
      if (tableWrapper) {
        tableWrapper.hidden = false;
      }
      if (controlsSection) {
        controlsSection.hidden = false;
      }
      if (statsViewEl) {
        statsViewEl.hidden = true;
      }

      const meta = currentView === 'wantlist' ? wantlistMeta : collectionMeta;
      updateLastUpdated(meta);
      applySearchAndSort();
    }
  }

  function initView() {
    let initial = 'collection';
    try {
      const stored = localStorage.getItem('records.view');
      if (stored === 'wantlist' || stored === 'collection' || stored === 'stats') {
        initial = stored;
      }
    } catch (e) {
      // ignore storage errors
    }

    currentView = initial;

    const select = document.getElementById('view-select');
    if (select) {
      select.value = initial;
    }
  }

   // ---------- Stats helpers ----------

  function normalizeGenre(name) {
    if (!name) return 'Unknown';
    return name.trim() || 'Unknown';
  }

  function buildStatsData(source) {
    let items;
    if (source === 'wantlist') {
      items = Array.isArray(wantlistData) ? wantlistData : [];
    } else if (source === 'all') {
      const c = Array.isArray(collectionData) ? collectionData : [];
      const w = Array.isArray(wantlistData) ? wantlistData : [];
      items = [...c, ...w];
    } else {
      items = Array.isArray(collectionData) ? collectionData : [];
    }

    const genreCounts = new Map();
    const yearCounts = new Map();
    const decadeCounts = new Map();
    const genreByDecade = new Map();

    items.forEach((item) => {
      const genreField = (item.genre || '').split(',');
      const genres = genreField
        .map((g) => normalizeGenre(g))
        .filter((g) => g && g !== 'Unknown');

      const yearValue = Number.parseInt(item.year, 10);
      const hasYear = !Number.isNaN(yearValue) && yearValue > 0;
      let yearKey = hasYear ? String(yearValue) : 'Unknown';
      let decadeLabel;

      if (hasYear) {
        const decadeStart = Math.floor(yearValue / 10) * 10;
        const shortLabel = `${String(decadeStart).slice(-2)}s`;
        decadeLabel = shortLabel;
      } else {
        decadeLabel = 'Unknown';
      }

      yearCounts.set(yearKey, (yearCounts.get(yearKey) || 0) + 1);
      decadeCounts.set(decadeLabel, (decadeCounts.get(decadeLabel) || 0) + 1);

      if (!genres.length) {
        const g = 'Unknown';
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
        let byDecade = genreByDecade.get(g);
        if (!byDecade) {
          byDecade = new Map();
          genreByDecade.set(g, byDecade);
        }
        byDecade.set(decadeLabel, (byDecade.get(decadeLabel) || 0) + 1);
        return;
      }

      genres.forEach((g) => {
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
        let byDecade = genreByDecade.get(g);
        if (!byDecade) {
          byDecade = new Map();
          genreByDecade.set(g, byDecade);
        }
        byDecade.set(decadeLabel, (byDecade.get(decadeLabel) || 0) + 1);
      });
    });

    const totalGenresCount = Array.from(genreCounts.values()).reduce((acc, v) => acc + v, 0);

    const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1]);
    const maxGenresToShow = 10;
    const mainGenres = sortedGenres.slice(0, maxGenresToShow);
    const otherGenres = sortedGenres.slice(maxGenresToShow);

    let otherTotal = 0;
    otherGenres.forEach(([, count]) => {
      otherTotal += count;
    });

    const displayGenres = [...mainGenres];
    if (otherTotal > 0) {
      displayGenres.push(['Other', otherTotal]);
    }

    const maxGenreCount = displayGenres.reduce((max, [, count]) => (count > max ? count : max), 0) || 1;

    const sortedDecades = Array.from(decadeCounts.entries()).sort((a, b) => {
      const aLabel = a[0];
      const bLabel = b[0];

      if (aLabel === 'Unknown') return 1;
      if (bLabel === 'Unknown') return -1;

      const aNum = Number.parseInt(aLabel, 10);
      const bNum = Number.parseInt(bLabel, 10);

      if (Number.isNaN(aNum) || Number.isNaN(bNum)) return 0;

      // Treat 50s–90s as 1950s–1990s and anything below 50
      // (00s, 10s, 20s, and future 30s, 40s) as 2000s+, so
      // the order is: 50s, 60s, 70s, 80s, 90s, 00s, 10s, 20s, 30s, 40s, ...
      const score = (num) => (num < 50 ? 100 + num : num);

      return score(aNum) - score(bNum);
    });

    const maxDecadeCount = sortedDecades.reduce((max, [, count]) => (count > max ? count : max), 0) || 1;

    const heatmapGenres = displayGenres.map(([name]) => name);
    const heatmapDecades = sortedDecades.map(([label]) => label);

    const maxCellCount = (() => {
      let max = 0;
      heatmapGenres.forEach((g) => {
        const byDecade = genreByDecade.get(g) || new Map();
        heatmapDecades.forEach((d) => {
          const v = byDecade.get(d) || 0;
          if (v > max) max = v;
        });
      });
      return max || 1;
    })();

    return {
      displayGenres,
      maxGenreCount,
      totalGenresCount,
      decades: sortedDecades,
      maxDecadeCount,
      heatmapGenres,
      heatmapDecades,
      genreByDecade,
      maxCellCount,
    };
  }

  function renderStats() {
    const statsRoot = document.getElementById('stats-view');
    if (!statsRoot) return;

    const hasCollection = Array.isArray(collectionData) && collectionData.length > 0;
    const hasWantlist = Array.isArray(wantlistData) && wantlistData.length > 0;

    if (!hasCollection && !hasWantlist) {
      statsRoot.innerHTML = '<p class="loading">No data loaded yet.</p>';
      return;
    }

    if (statsSource === 'wantlist' && !hasWantlist) {
      statsSource = 'collection';
    }

    const stats = buildStatsData(statsSource);

    const sourceLabel =
      statsSource === 'wantlist' ? 'Wantlist' : statsSource === 'all' ? 'All records' : 'Collection';

    statsRoot.innerHTML = `
      <div class="stats-header">
        <h2 class="stats-title">${sourceLabel} stats</h2>
        <div class="stats-source-toggle">
          <button type="button" class="stats-source-button" data-source="collection">Collection</button>
          <button type="button" class="stats-source-button" data-source="wantlist">Wantlist</button>
          <button type="button" class="stats-source-button" data-source="all">All</button>
        </div>
      </div>
      <div class="stats-grid">
        <article class="stats-card">
          <h3 class="stats-card-title">By genre</h3>
          <div class="stats-genre-list">
            ${stats.displayGenres
              .map(([name, count]) => {
                const pct = stats.totalGenresCount ? Math.round((count / stats.totalGenresCount) * 100) : 0;
                const scale = stats.maxGenreCount ? count / stats.maxGenreCount : 0;
                const safeName = name;
                return `
                  <div class="stats-genre-row">
                    <div class="stats-genre-labels">
                      <span class="stats-genre-name">${safeName}</span>
                      <span class="stats-genre-meta">${count} · ${pct}%</span>
                    </div>
                    <div class="stats-genre-bar-track">
                      <div class="stats-genre-bar-fill" style="transform: scaleX(${scale.toFixed(3)})"></div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </article>
        <article class="stats-card">
          <h3 class="stats-card-title">By decade</h3>
          <div class="stats-decade-bars">
            ${stats.decades
              .map(([label, count]) => {
                const scale = stats.maxDecadeCount ? count / stats.maxDecadeCount : 0;
                return `
                  <div class="stats-decade-bar">
                    <div class="stats-decade-column" style="transform: scaleY(${scale.toFixed(3)})"></div>
                    <div class="stats-decade-label">${label}</div>
                    <div class="stats-decade-count">${count}</div>
                  </div>
                `;
              })
              .join('')}
          </div>
          <div class="stats-heatmap">
            <h4 class="stats-card-title">Genre × decade</h4>
            <div class="stats-heatmap-grid" style="grid-template-columns: minmax(0, 5.5rem) repeat(${stats.heatmapDecades.length}, minmax(0, 1fr));">
              <div></div>
              ${stats.heatmapDecades
                .map((d) => `<div class="stats-decade-label">${d}</div>`)
                .join('')}
              ${stats.heatmapGenres
                .map((g) => {
                  const byDecade = stats.genreByDecade.get(g) || new Map();
                  const rowCells = stats.heatmapDecades
                    .map((d) => {
                      const v = byDecade.get(d) || 0;
                      if (!v) {
                        return '<div class="stats-heatmap-cell is-empty"></div>';
                      }
                      const intensity = stats.maxCellCount ? v / stats.maxCellCount : 0;
                      const colorPct = 30 + intensity * 70; // 30%–100% accent
                      const alpha = 0.35 + intensity * 0.65; // 0.35–1.0 opacity
                      return `<div class="stats-heatmap-cell" style="background-color: color-mix(in srgb, var(--accent) ${Math.round(
                        colorPct,
                      )}%, transparent); opacity: ${alpha.toFixed(2)};"></div>`;
                    })
                    .join('');
                  return `
                    <div class="stats-heatmap-row-label">${g}</div>
                    ${rowCells}
                  `;
                })
                .join('')}
            </div>
          </div>
        </article>
      </div>
    `;

    const sourceButtons = statsRoot.querySelectorAll('.stats-source-button');
    sourceButtons.forEach((btn) => {
      const src = btn.getAttribute('data-source');
      if (src === statsSource) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }

      btn.addEventListener('click', () => {
        const nextSrc = btn.getAttribute('data-source') || 'collection';
        statsSource = nextSrc === 'wantlist' || nextSrc === 'all' ? nextSrc : 'collection';
        renderStats();
      });
    });

    const genreFills = statsRoot.querySelectorAll('.stats-genre-bar-fill');
    genreFills.forEach((el) => {
      requestAnimationFrame(() => {
        el.classList.add('is-visible');
      });
    });

    const decadeColumns = statsRoot.querySelectorAll('.stats-decade-column');
    decadeColumns.forEach((el) => {
      requestAnimationFrame(() => {
        el.classList.add('is-visible');
      });
    });
  }

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
      const isPurchasingRow =
        currentView === 'wantlist' &&
        item.purchasing &&
        item.id != null &&
        !collectionIds.has(item.id);

      if (isPurchasingRow) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'purchase-status';
        statusSpan.textContent = 'Purchase ongoing...';

        yearTd.appendChild(document.createTextNode(' '));
        yearTd.appendChild(statusSpan);

        tr.classList.add('is-purchasing');
      }

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

      collectionIds = new Set(
        (collectionData || [])
          .map((item) => item.id)
          .filter((id) => id != null),
      );

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

      setView(currentView);
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
      const next = select.value || 'collection';
      setView(next);
    });

    const desktopButtons = document.querySelectorAll('.view-toggle-button');
    desktopButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        setView(view || 'collection');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initView();

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    setupViewSwitch();
    loadData();
  });
})();
