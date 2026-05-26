requireAuth();
renderSidebarUser();
initSidebar();

const params      = new URLSearchParams(location.search);
let currentPage   = 1;
let currentView   = localStorage.getItem('prop_view') || 'grid';
let lastData      = [];   // cache for CSV export
let deleteId      = null;
let detailPropId  = null;
let debounceTimer;

// Pre-fill filters from URL
const typeParam = params.get('type') || '';
if (typeParam) {
  document.getElementById('f-type').value = typeParam;
  const titles = { apartment: 'Квартири', house: 'Будинки', land: 'Ділянки' };
  document.getElementById('page-title').textContent = titles[typeParam] || "Всі об'єкти";
}

setView(currentView, false);
loadProperties();

// ── View toggle ─────────────────────────────────────────────────────────────
function setView(v, save = true) {
  currentView = v;
  if (save) localStorage.setItem('prop_view', v);
  const gBtn = document.getElementById('view-grid');
  const lBtn = document.getElementById('view-list');
  gBtn.style.cssText = v === 'grid' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : '';
  lBtn.style.cssText = v === 'list' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : '';
}

// ── Filters ──────────────────────────────────────────────────────────────────
function applyFilters() { currentPage = 1; loadProperties(); }
function debounceFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyFilters, 400);
}

function buildQuery() {
  const p = new URLSearchParams();
  const type   = document.getElementById('f-type').value;
  const status = document.getElementById('f-status').value;
  const city   = document.getElementById('f-city').value.trim();
  const search = document.getElementById('f-search').value.trim();
  const sort   = document.getElementById('f-sort').value;
  if (type)   p.set('type', type);
  if (status) p.set('status', status);
  if (city)   p.set('city', city);
  if (search) p.set('search', search);
  if (sort)   p.set('sort', sort);
  p.set('page', currentPage);
  p.set('limit', 12);
  return p.toString();
}

// ── Render ────────────────────────────────────────────────────────────────────
const ICONS = { apartment: 'fa-building', house: 'fa-home', land: 'fa-tree' };

function propImg(p, size = 190) {
  const imgs = JSON.parse(p.images || '[]');
  if (imgs.length) return `<img src="/uploads/${imgs[0]}" alt="${p.title}" style="width:100%;height:${size}px;object-fit:cover">`;
  return `<div style="height:${size}px;display:flex;align-items:center;justify-content:center">
    <i class="fas ${ICONS[p.type] || 'fa-home'}" style="font-size:52px;color:rgba(255,255,255,.2)"></i>
  </div>`;
}

function renderGrid(props) {
  return `<div class="properties-grid">${props.map(p => {
    const rooms  = p.rooms  ? `<div class="prop-meta-item"><i class="fas fa-door-open"></i> ${p.rooms} кімн.</div>` : '';
    const floor  = p.floor  ? `<div class="prop-meta-item"><i class="fas fa-layer-group"></i> ${p.floor}/${p.floors||'?'} пов.</div>` : '';
    const floors = (!p.floor && p.floors) ? `<div class="prop-meta-item"><i class="fas fa-layer-group"></i> ${p.floors} пов.</div>` : '';
    return `<div class="prop-card">
      <div class="prop-img" style="cursor:pointer" onclick="openDetail(${p.id})">
        ${propImg(p)}
        <div class="prop-badges">${typeBadge(p.type)} ${statusBadge(p.status)}</div>
        <div style="position:absolute;bottom:8px;right:8px">
          <button class="btn btn-outline btn-sm" style="background:rgba(0,0,0,.45);color:#fff;border-color:rgba(255,255,255,.3);font-size:11px" onclick="event.stopPropagation();openDetail(${p.id})">
            <i class="fas fa-eye"></i> Деталі
          </button>
        </div>
      </div>
      <div class="prop-body">
        <div class="prop-price">${fmtPrice(p.price)}</div>
        <div class="prop-title" title="${p.title}">${p.title}</div>
        <div class="prop-meta">
          ${p.area ? `<div class="prop-meta-item"><i class="fas fa-ruler-combined"></i> ${fmtArea(p.area)}</div>` : ''}
          ${rooms}${floor}${floors}
        </div>
        ${p.city || p.address ? `<div class="prop-address"><i class="fas fa-map-marker-alt"></i> ${[p.city, p.address].filter(Boolean).join(', ')}</div>` : ''}
        <div class="prop-actions">
          <a href="property-form.html?id=${p.id}" class="btn btn-outline btn-sm" style="flex:1;justify-content:center"><i class="fas fa-edit"></i> Редагувати</a>
          <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${p.id})" title="Видалити"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderList(props) {
  return `<div class="table-card"><div class="table-wrap"><table>
    <thead><tr><th>Назва</th><th>Тип</th><th>Ціна</th><th>Площа</th><th>Місто</th><th>Статус</th><th>Агент</th><th>Дата</th><th>Дії</th></tr></thead>
    <tbody>${props.map(p => `<tr>
      <td style="cursor:pointer;font-weight:600;color:var(--primary)" onclick="openDetail(${p.id})">${p.title}</td>
      <td>${typeBadge(p.type)}</td>
      <td style="font-weight:700;color:var(--primary);white-space:nowrap">${fmtPrice(p.price)}</td>
      <td>${fmtArea(p.area)}</td>
      <td>${p.city || '—'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.agent_name || '—'}</td>
      <td style="white-space:nowrap;font-size:12px;color:var(--muted)">${fmtDate(p.created_at)}</td>
      <td><div class="actions-cell">
        <button class="btn btn-outline btn-sm btn-icon" onclick="openDetail(${p.id})" title="Деталі"><i class="fas fa-eye"></i></button>
        <a href="property-form.html?id=${p.id}" class="btn btn-outline btn-sm btn-icon" title="Редагувати"><i class="fas fa-edit"></i></a>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${p.id})" title="Видалити"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table></div></div>`;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadProperties() {
  const container  = document.getElementById('properties-container');
  const pagination = document.getElementById('pagination');
  container.innerHTML  = '<div class="loading-wrap"><div class="spinner"></div></div>';
  pagination.innerHTML = '';
  try {
    const data = await api.get('/properties?' + buildQuery());
    const { properties, total, page, limit } = data;
    lastData = properties;
    document.getElementById('total-count').textContent = `Знайдено: ${total}`;
    if (!properties.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h3>Об'єктів не знайдено</h3><p>Спробуйте змінити фільтри пошуку</p></div>`;
      return;
    }
    container.innerHTML = currentView === 'grid' ? renderGrid(properties) : renderList(properties);
    renderPagination(total, page, limit);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Помилка завантаження</h3><p>${e.message}</p></div>`;
  }
}

function renderPagination(total, page, limit) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return;
  const el = document.getElementById('pagination');
  let html = `<button class="page-btn" onclick="goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${page + 1})" ${page >= pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
  el.innerHTML = html;
}

function goPage(p) { currentPage = p; loadProperties(); window.scrollTo(0, 0); }

// ── Detail modal ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  detailPropId = id;
  document.getElementById('detail-modal').classList.add('open');
  document.getElementById('detail-gallery').innerHTML = '<div class="spinner" style="margin:auto"></div>';
  document.getElementById('detail-badges').innerHTML  = '';
  document.getElementById('detail-specs').innerHTML   = '';
  document.getElementById('detail-price').textContent = '';
  document.getElementById('detail-name').textContent  = '';
  document.getElementById('detail-desc').textContent  = '';

  try {
    const p = await api.get('/properties/' + id);
    const imgs = JSON.parse(p.images || '[]');

    // Gallery
    const gallery = document.getElementById('detail-gallery');
    if (imgs.length) {
      let current = 0;
      const render = () => {
        gallery.innerHTML = `
          <img src="/uploads/${imgs[current]}" style="width:100%;height:220px;object-fit:cover;display:block" alt="">
          ${imgs.length > 1 ? `
            <button onclick="event.stopPropagation();gal(${id},-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer">‹</button>
            <button onclick="event.stopPropagation();gal(${id},1)"  style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer">›</button>
            <div style="position:absolute;bottom:8px;right:12px;background:rgba(0,0,0,.5);color:#fff;font-size:11px;padding:3px 8px;border-radius:20px">${current+1}/${imgs.length}</div>
          ` : ''}`;
      };
      gallery._imgs    = imgs;
      gallery._current = 0;
      window._galCurrent = 0;
      window.gal = (pid, dir) => {
        if (pid !== id) return;
        window._galCurrent = (window._galCurrent + dir + imgs.length) % imgs.length;
        gallery.innerHTML = `
          <img src="/uploads/${imgs[window._galCurrent]}" style="width:100%;height:220px;object-fit:cover;display:block" alt="">
          ${imgs.length > 1 ? `
            <button onclick="event.stopPropagation();gal(${id},-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer">‹</button>
            <button onclick="event.stopPropagation();gal(${id},1)"  style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer">›</button>
            <div style="position:absolute;bottom:8px;right:12px;background:rgba(0,0,0,.5);color:#fff;font-size:11px;padding:3px 8px;border-radius:20px">${window._galCurrent+1}/${imgs.length}</div>
          ` : ''}`;
      };
      render();
    } else {
      const icon = { apartment: 'fa-building', house: 'fa-home', land: 'fa-tree' }[p.type] || 'fa-home';
      gallery.innerHTML = `<i class="fas ${icon}" style="font-size:64px;color:rgba(255,255,255,.2)"></i>`;
    }

    // Badges & info
    document.getElementById('detail-badges').innerHTML = typeBadge(p.type) + ' ' + statusBadge(p.status);
    document.getElementById('detail-price').textContent = fmtPrice(p.price);
    document.getElementById('detail-name').textContent  = p.title;
    document.getElementById('detail-title').textContent = p.title;

    // Specs grid
    const specs = [];
    if (p.area)   specs.push(['Площа',      fmtArea(p.area),        'fa-ruler-combined']);
    if (p.rooms)  specs.push(['Кімнат',      p.rooms,                'fa-door-open']);
    if (p.floor)  specs.push(['Поверх',      `${p.floor}/${p.floors||'?'}`, 'fa-layer-group']);
    else if (p.floors) specs.push(['Поверховість', p.floors,         'fa-layer-group']);
    if (p.city)   specs.push(['Місто',        p.city,               'fa-city']);
    if (p.district) specs.push(['Район',      p.district,           'fa-map']);

    document.getElementById('detail-specs').innerHTML = specs.map(([label, val, icon]) => `
      <div style="background:var(--bg);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px">
        <i class="fas ${icon}" style="color:var(--gold);font-size:16px;width:18px;text-align:center"></i>
        <div><div style="font-size:11px;color:var(--muted)">${label}</div><div style="font-weight:600;font-size:14px">${val}</div></div>
      </div>`).join('');

    if (p.address || p.city) {
      document.getElementById('detail-address').innerHTML =
        `<i class="fas fa-map-marker-alt" style="color:var(--gold)"></i> ${[p.address, p.city, p.district].filter(Boolean).join(', ')}`;
    }

    document.getElementById('detail-desc').textContent = p.description || '';

    document.getElementById('detail-meta').innerHTML =
      `Агент: <strong>${p.agent_name || '—'}</strong> &nbsp;·&nbsp; Додано: <strong>${fmtDate(p.created_at)}</strong>`;

    // Status selector
    const sel = document.getElementById('detail-status-sel');
    sel.innerHTML = `
      <option value="available" ${p.status==='available'?'selected':''}>✅ Доступний</option>
      <option value="reserved"  ${p.status==='reserved' ?'selected':''}>⏳ Зарезервовано</option>
      <option value="sold"      ${p.status==='sold'     ?'selected':''}>🔴 Продано</option>`;

    document.getElementById('detail-edit-btn').href = `property-form.html?id=${p.id}`;
  } catch (e) {
    document.getElementById('detail-gallery').innerHTML =
      `<div style="color:rgba(255,255,255,.5);padding:20px">${e.message}</div>`;
  }
}

async function quickStatus() {
  const status = document.getElementById('detail-status-sel').value;
  try {
    await api.patch('/properties/' + detailPropId + '/status', { status });
    toast('Статус оновлено', 'success');
    loadProperties();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Delete ────────────────────────────────────────────────────────────────────
function openDelete(id) {
  deleteId = id;
  document.getElementById('delete-modal').classList.add('open');
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
  deleteId = null;
}

document.getElementById('confirm-delete-btn').onclick = async () => {
  if (!deleteId) return;
  try {
    await api.del('/properties/' + deleteId);
    closeDeleteModal();
    document.getElementById('detail-modal').classList.remove('open');
    toast("Об'єкт успішно видалено", 'success');
    loadProperties();
  } catch (e) { toast(e.message, 'error'); }
};

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV() {
  if (!lastData.length) { toast('Немає даних для експорту', 'warning'); return; }
  const headers = ['ID','Тип','Назва','Ціна','Площа','Місто','Район','Адреса','Статус','Кімнат','Поверх','Поверховість','Агент','Дата'];
  const rows = lastData.map(p => [
    p.id,
    TYPE_LABELS[p.type]   || p.type,
    `"${(p.title||'').replace(/"/g,'""')}"`,
    p.price,
    p.area || '',
    p.city || '',
    p.district || '',
    `"${(p.address||'').replace(/"/g,'""')}"`,
    STATUS_LABELS[p.status] || p.status,
    p.rooms || '',
    p.floor || '',
    p.floors || '',
    p.agent_name || '',
    fmtDate(p.created_at),
  ].join(','));

  const csv  = '﻿' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `dim-realty-${Date.now()}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV-файл завантажено', 'success');
}
