requireAuth();
renderSidebarUser();
initSidebar();

let typeChart = null;
let statusChart = null;

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 16, usePointStyle: true } } },
};

async function loadStats() {
  try {
    const s = await api.get('/properties/stats');

    document.getElementById('s-total').textContent     = s.total;
    document.getElementById('s-available').textContent  = s.available;
    document.getElementById('s-sold').textContent       = s.sold;
    document.getElementById('s-reserved').textContent   = s.reserved;
    document.getElementById('s-employees').textContent  = s.employees;
    document.getElementById('s-apt').textContent        = s.apartments;
    document.getElementById('s-house').textContent      = s.houses;
    document.getElementById('s-land').textContent       = s.land;

    const val = s.totalValue >= 1_000_000
      ? `$${(s.totalValue / 1_000_000).toFixed(1)}M`
      : s.totalValue >= 1000 ? `$${Math.round(s.totalValue / 1000)}K` : `$${Math.round(s.totalValue)}`;
    document.getElementById('s-value').textContent = val;

    renderCharts(s);
  } catch (e) { console.error(e); toast('Не вдалося завантажити статистику: ' + e.message, 'error'); }
}

function renderCharts(s) {
  const gold    = '#C8A951';
  const navy    = '#1A3A5C';
  const blue    = '#3182CE';
  const green   = '#38A169';
  const orange  = '#D69E2E';
  const red     = '#E53E3E';
  const yellow  = '#F6AD55';

  // Donut — types
  if (typeChart) typeChart.destroy();
  typeChart = new Chart(document.getElementById('chart-types'), {
    type: 'doughnut',
    data: {
      labels: ['Квартири', 'Будинки', 'Ділянки'],
      datasets: [{
        data: [s.apartments, s.houses, s.land],
        backgroundColor: [blue, green, orange],
        borderColor: '#fff',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '62%',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} шт.` } },
      },
    },
  });

  // Bar — statuses
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('chart-status'), {
    type: 'bar',
    data: {
      labels: ['Доступні', 'Продані', 'Зарезервовані'],
      datasets: [{
        label: "Кількість об'єктів",
        data: [s.available, s.sold, s.reserved],
        backgroundColor: [
          'rgba(56,161,105,0.85)',
          'rgba(229,62,62,0.85)',
          'rgba(214,158,46,0.85)',
        ],
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} шт.` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        x: { ticks: { font: { family: 'Inter', size: 12 } }, grid: { display: false } },
      },
    },
  });
}

async function loadRecentProperties() {
  const el = document.getElementById('recent-properties');
  try {
    const { properties } = await api.get('/properties?limit=5&page=1');
    if (!properties.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-home"></i><p>Немає об'єктів</p></div>`;
      return;
    }
    el.innerHTML = properties.map(p => {
      const imgs = parseImages(p.images);
      const img = imgs.length
        ? `<img src="${photoUrl(imgs[0])}" style="width:52px;height:42px;border-radius:9px;object-fit:cover;flex-shrink:0" alt="" loading="lazy">`
        : `<div style="width:52px;height:42px;border-radius:9px;background:linear-gradient(135deg,#17395D,#0B1F36);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-home" style="color:var(--gold);font-size:16px"></i></div>`;
      return `<a class="list-item" href="properties.html?open=${p.id}">
        ${img}
        <div class="list-item-info">
          <div class="list-item-title">${esc(p.title)}</div>
          <div class="list-item-sub" style="display:flex;gap:6px;margin-top:3px">${typeBadge(p.type)} ${statusBadge(p.status)}</div>
        </div>
        <div class="list-item-price">${esc(fmtPrice(p.price))}</div>
      </a>`;
    }).join('');
  } catch { el.innerHTML = '<div class="no-results">Помилка завантаження</div>'; }
}

async function loadRecentEmployees() {
  const el = document.getElementById('recent-employees');
  try {
    const emps = await api.get('/employees');
    if (!emps.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><h3>Немає співробітників</h3><p>Додайте першого агента</p></div>`;
      return;
    }
    el.innerHTML = emps.slice(0, 5).map(u => `
      <div class="list-item">
        <div class="avatar">${esc(u.name.charAt(0).toUpperCase())}</div>
        <div class="list-item-info">
          <div class="list-item-title">${esc(u.name)}</div>
          <div class="list-item-sub">${esc(u.email)}</div>
        </div>
        <span class="badge badge-${esc(u.role)}">${esc(ROLE_LABELS[u.role] || u.role)}</span>
      </div>`).join('');
  } catch { el.innerHTML = '<div class="no-results">Помилка завантаження</div>'; }
}

// Greeting by time of day
(function greet() {
  const u = getUser();
  const h = new Date().getHours();
  const hello = h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Доброго дня' : 'Доброго вечора';
  const first = u && u.name ? String(u.name).split(' ')[0] : '';
  const el = document.getElementById('greeting');
  if (el) el.textContent = first ? `${hello}, ${first}!` : `${hello}!`;
})();

loadStats();
loadRecentProperties();
if (getUser()?.role === 'admin') loadRecentEmployees();
