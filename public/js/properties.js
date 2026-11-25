requireAuth();
renderSidebarUser();
initSidebar();

const $ = id => document.getElementById(id);
const ICONS = { apartment: 'fa-building', house: 'fa-home', land: 'fa-tree' };
const HOUSE_TYPE_LABELS = { private: 'Приватний будинок', duplex: 'Дюплекс', townhouse: 'Таунхаус', part: 'Частина будинку' };
const PAGE_TITLES = { apartment: 'Квартири', house: 'Будинки', land: 'Ділянки' };
const PAGE_SIZE = 12;

let currentPage   = 1;
let currentView   = localStorage.getItem('prop_view') || 'grid';
let currentStatus = '';
let lastData      = [];     // objects on the current page
let lastTotal     = 0;
let deleteId      = null;
let detailProp    = null;
let debounceTimer;
let loadSeq       = 0;      // ignore answers of outdated requests
let galImgs = [], galIdx = 0;

// ── Filters ⇄ URL ────────────────────────────────────────────────────────────
function readUrl() {
  const p = new URLSearchParams(location.search);
  $('f-type').value       = p.get('type') || '';
  $('f-house-type').value = p.get('house_type') || '';
  $('f-city').value       = p.get('city') || '';
  $('f-search').value     = p.get('search') || '';
  $('f-sort').value       = p.get('sort') || 'date_desc';
  currentStatus           = p.get('status') || '';
  currentPage             = Math.max(1, parseInt(p.get('page')) || 1);
  syncFilterUi();
}

function filterParams() {
  const p = new URLSearchParams();
  const v = id => $(id).value.trim();
  if (v('f-type'))       p.set('type', v('f-type'));
  if (v('f-house-type') && v('f-type') === 'house') p.set('house_type', v('f-house-type'));
  if (currentStatus)     p.set('status', currentStatus);
  if (v('f-city'))       p.set('city', v('f-city'));
  if (v('f-search'))     p.set('search', v('f-search'));
  if (v('f-sort') && v('f-sort') !== 'date_desc') p.set('sort', v('f-sort'));
  return p;
}

function hasFilters() {
  const p = filterParams(); p.delete('sort');
  return [...p.keys()].length > 0;
}

function syncFilterUi() {
  const type = $('f-type').value;
  $('f-house-type').style.display = type === 'house' ? '' : 'none';
  $('page-title').textContent = PAGE_TITLES[type] || "Всі об'єкти";
  document.title = `Dim Realty — ${PAGE_TITLES[type] || "Об'єкти"}`;
  document.querySelectorAll('#f-status-seg button').forEach(b => b.classList.toggle('active', b.dataset.status === currentStatus));
  $('reset-btn').style.display = hasFilters() ? '' : 'none';
}

function writeUrl() {
  const p = filterParams();
  if (currentPage > 1) p.set('page', currentPage);
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function applyFilters() { currentPage = 1; syncFilterUi(); loadProperties(); }
function debounceFilter() { clearTimeout(debounceTimer); debounceTimer = setTimeout(applyFilters, 350); }

function onTypeFilterChange() {
  if ($('f-type').value !== 'house') $('f-house-type').value = '';
  applyFilters();
}

function resetFilters() {
  ['f-type', 'f-house-type', 'f-city', 'f-search'].forEach(id => $(id).value = '');
  $('f-sort').value = 'date_desc';
  currentStatus = '';
  applyFilters();
}

$('f-status-seg').addEventListener('click', e => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  currentStatus = b.dataset.status;
  applyFilters();
});

// ── View toggle ──────────────────────────────────────────────────────────────
function setView(v, rerender = true) {
  currentView = v;
  localStorage.setItem('prop_view', v);
  $('view-grid').classList.toggle('active', v === 'grid');
  $('view-list').classList.toggle('active', v === 'list');
  if (rerender && lastData.length) renderCurrent();
}

// ── Render ───────────────────────────────────────────────────────────────────
function fmtAreaShort(p) {
  if (!p.area) return '';
  if (p.type === 'land') return `${p.area} м² · ${Math.round(p.area / 100)} сот.`;
  return `${p.area} м²`;
}

function metaChips(p) {
  const chips = [];
  if (p.area)       chips.push(['fa-ruler-combined', fmtAreaShort(p)]);
  if (p.rooms)      chips.push(['fa-door-open', `${p.rooms} кімн.`]);
  if (p.floor)      chips.push(['fa-layer-group', `${p.floor}/${p.floors || '?'} пов.`]);
  else if (p.floors) chips.push(['fa-layer-group', `${p.floors} пов.`]);
  if (p.house_type) chips.push(['fa-tag', HOUSE_TYPE_LABELS[p.house_type] || p.house_type]);
  return chips.map(([i, t]) => `<span class="prop-meta-item"><i class="fas ${i}"></i>${esc(t)}</span>`).join('');
}

function cardHTML(p) {
  const imgs = parseImages(p.images);
  const place = [p.city, p.address].filter(Boolean).join(', ');
  const cover = imgs.length
    ? `<img src="${photoUrl(imgs[0])}" alt="" loading="lazy" onerror="this.remove()">`
    : `<i class="fas ${ICONS[p.type] || 'fa-home'} prop-img-placeholder"></i>`;
  return `<article class="prop-card">
    <div class="prop-img" onclick="openDetail(${p.id})">
      ${cover}
      <div class="prop-badges">${typeBadge(p.type)} ${statusBadge(p.status)}</div>
      <div class="prop-price-on-img">${esc(fmtPrice(p.price))}</div>
      ${imgs.length > 1 ? `<span class="prop-photo-count"><i class="fas fa-images"></i>${imgs.length}</span>` : ''}
    </div>
    <div class="prop-body">
      <div class="prop-title" title="${esc(p.title)}" style="cursor:pointer" onclick="openDetail(${p.id})">${esc(p.title)}</div>
      <div class="prop-meta">${metaChips(p)}</div>
      ${place ? `<div class="prop-address"><i class="fas fa-map-marker-alt"></i><span>${esc(place)}</span></div>` : ''}
      <div class="prop-actions">
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="openDetail(${p.id})"><i class="fas fa-eye"></i> Деталі</button>
        <a href="property-form.html?id=${p.id}" class="btn btn-outline btn-sm btn-icon" title="Редагувати"><i class="fas fa-edit"></i></a>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${p.id})" title="Видалити"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  </article>`;
}

function renderGrid(props) {
  return `<div class="properties-grid">${props.map(cardHTML).join('')}</div>`;
}

function renderList(props) {
  return `<div class="table-card"><div class="table-wrap"><table>
    <thead><tr><th>Об'єкт</th><th>Тип</th><th>Ціна</th><th>Площа</th><th>Місто</th><th>Статус</th><th>Агент</th><th>Дата</th><th></th></tr></thead>
    <tbody>${props.map(p => {
      const imgs = parseImages(p.images);
      const thumb = imgs.length
        ? `<img class="row-thumb" src="${photoUrl(imgs[0])}" alt="" loading="lazy">`
        : `<div class="row-thumb-ph"><i class="fas ${ICONS[p.type] || 'fa-home'}"></i></div>`;
      return `<tr>
      <td><div class="row-title" onclick="openDetail(${p.id})">${thumb}<span>${esc(p.title)}</span></div></td>
      <td>${typeBadge(p.type)}</td>
      <td style="font-weight:700;color:var(--primary);white-space:nowrap">${esc(fmtPrice(p.price))}</td>
      <td style="white-space:nowrap">${esc(fmtAreaShort(p)) || '—'}</td>
      <td>${esc(p.city) || '—'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${esc(p.agent_name) || '—'}</td>
      <td style="white-space:nowrap;font-size:12px;color:var(--muted)">${fmtDate(p.created_at)}</td>
      <td><div class="actions-cell">
        <button class="btn btn-outline btn-sm btn-icon" onclick="openDetail(${p.id})" title="Деталі"><i class="fas fa-eye"></i></button>
        <a href="property-form.html?id=${p.id}" class="btn btn-outline btn-sm btn-icon" title="Редагувати"><i class="fas fa-edit"></i></a>
        <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${p.id})" title="Видалити"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
}

function renderCurrent() {
  $('properties-container').innerHTML = currentView === 'grid' ? renderGrid(lastData) : renderList(lastData);
}

function skeleton() {
  if (currentView === 'list') return `<div class="table-card"><div class="skeleton" style="height:320px;border-radius:16px"></div></div>`;
  return `<div class="properties-grid">${Array.from({ length: 6 }, () =>
    `<div class="prop-card"><div class="skeleton" style="aspect-ratio:16/10;border-radius:0"></div><div class="prop-body"><div class="skeleton" style="height:18px;width:70%;margin-bottom:12px"></div><div class="skeleton" style="height:14px;width:45%;margin-bottom:12px"></div><div class="skeleton" style="height:34px"></div></div></div>`).join('')}</div>`;
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function loadProperties() {
  const seq = ++loadSeq;
  const container = $('properties-container');
  $('pagination').innerHTML = '';
  container.innerHTML = skeleton();
  const q = filterParams();
  q.set('page', currentPage);
  q.set('limit', PAGE_SIZE);
  try {
    const data = await api.get('/properties?' + q.toString());
    if (seq !== loadSeq) return;
    const { properties, total, page, limit } = data;
    const pages = Math.max(1, Math.ceil(total / limit));
    if (total > 0 && page > pages) { currentPage = pages; return loadProperties(); }   // e.g. deleted the last item of the last page
    lastData = properties; lastTotal = total;
    writeUrl();
    $('total-count').innerHTML = `Знайдено: <b>${total}</b>`;
    if (!properties.length) {
      container.innerHTML = hasFilters()
        ? `<div class="empty-state"><i class="fas fa-search"></i><h3>Нічого не знайдено</h3><p>Спробуйте змінити або скинути фільтри</p><button class="btn btn-outline" onclick="resetFilters()"><i class="fas fa-times"></i> Скинути фільтри</button></div>`
        : `<div class="empty-state"><i class="fas fa-home"></i><h3>Ще немає жодного об'єкта</h3><p>Додайте перший об'єкт нерухомості</p><a href="property-form.html" class="btn btn-gold"><i class="fas fa-plus"></i> Додати об'єкт</a></div>`;
      return;
    }
    renderCurrent();
    renderPagination(total, page, limit);
  } catch (e) {
    if (seq !== loadSeq) return;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Помилка завантаження</h3><p>${esc(e.message)}</p><button class="btn btn-outline" onclick="loadProperties()"><i class="fas fa-redo"></i> Спробувати ще раз</button></div>`;
  }
}

function renderPagination(total, page, limit) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return;
  let html = `<button class="page-btn" onclick="goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} aria-label="Назад"><i class="fas fa-chevron-left"></i></button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${page + 1})" ${page >= pages ? 'disabled' : ''} aria-label="Далі"><i class="fas fa-chevron-right"></i></button>`;
  $('pagination').innerHTML = html;
}

function goPage(p) { currentPage = p; loadProperties(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

// ── Detail modal ─────────────────────────────────────────────────────────────
function closeDetail() { $('detail-modal').classList.remove('open'); }

async function openDetail(id) {
  $('detail-modal').classList.add('open');
  detailProp = null;
  $('detail-gallery').innerHTML = `<div class="gallery-stage"><div class="spinner" style="margin:auto"></div></div>`;
  ['detail-badges', 'detail-specs', 'detail-price', 'detail-ppm', 'detail-name', 'detail-desc', 'detail-meta'].forEach(k => $(k).innerHTML = '');
  $('detail-address').style.display = 'none';
  $('detail-title').textContent = 'Завантаження…';

  try {
    const p = await api.get('/properties/' + id);
    detailProp = p;
    const imgs = parseImages(p.images);
    renderGallery(p, imgs);

    $('detail-title').textContent = p.title;
    $('detail-badges').innerHTML = typeBadge(p.type) + ' ' + statusBadge(p.status);
    $('detail-price').textContent = fmtPrice(p.price);
    $('detail-ppm').textContent = p.area && p.price && p.type !== 'land' ? `≈ ${fmtPrice(p.price / p.area)} за м²` : '';
    $('detail-name').textContent = p.title;

    const specs = [];
    if (p.house_type)  specs.push(['Вид', HOUSE_TYPE_LABELS[p.house_type] || p.house_type, 'fa-tag']);
    if (p.area)        specs.push(['Площа', fmtArea(p.area, p.type), 'fa-ruler-combined']);
    if (p.rooms)       specs.push(['Кімнат', p.rooms, 'fa-door-open']);
    if (p.floor)       specs.push(['Поверх', `${p.floor}/${p.floors || '?'}`, 'fa-layer-group']);
    else if (p.floors) specs.push(['Поверховість', p.floors, 'fa-layer-group']);
    if (p.city)        specs.push(['Місто', p.city, 'fa-city']);
    if (p.district)    specs.push(['Район', p.district, 'fa-map']);
    if (p.owner_phone) {
      const tel = String(p.owner_phone).replace(/[^\d+]/g, '');
      specs.push(['Власник', `<a href="tel:${esc(tel)}">${esc(p.owner_phone)}</a>`, 'fa-phone', true]);
    }
    $('detail-specs').innerHTML = specs.map(([k, v, icon, raw]) =>
      `<div class="spec"><i class="fas ${icon}"></i><div><div class="k">${k}</div><div class="v">${raw ? v : esc(v)}</div></div></div>`).join('');

    const place = [p.address, p.city, p.district].filter(Boolean).join(', ');
    if (place) {
      $('detail-address').style.display = '';
      $('detail-address').innerHTML = `<i class="fas fa-map-marker-alt"></i><span>${esc(place)} <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> На карті</a></span>`;
    }

    $('detail-desc').textContent = p.description || '';
    $('detail-meta').innerHTML = `Агент: <strong>${esc(p.agent_name) || '—'}</strong> · Додано: <strong>${fmtDate(p.created_at)}</strong>`;

    $('detail-status-sel').innerHTML = [['available', '✅ Доступний'], ['reserved', '⏳ Зарезервовано'], ['sold', '🔴 Продано']]
      .map(([v, t]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${t}</option>`).join('');
    $('detail-edit-btn').href = `property-form.html?id=${p.id}`;
  } catch (e) {
    $('detail-title').textContent = 'Помилка';
    $('detail-gallery').innerHTML = `<div class="gallery-stage" style="cursor:default"><div style="color:rgba(255,255,255,.6);padding:24px;text-align:center">${esc(e.message)}</div></div>`;
  }
}

// Photo gallery inside the detail window: big photo, thumbnails, arrows, swipe. Click opens the full-screen viewer.
function renderGallery(p, imgs) {
  const g = $('detail-gallery');
  galImgs = imgs; galIdx = 0;
  if (!imgs.length) {
    g.innerHTML = `<div class="gallery-stage" style="cursor:default"><i class="fas ${ICONS[p.type] || 'fa-home'} ph"></i></div>`;
    return;
  }
  const multi = imgs.length > 1;
  g.innerHTML = `
    <div class="gallery-stage" id="gal-stage">
      <img id="gal-img" alt="">
      ${multi ? `<button class="gal-btn prev" type="button" aria-label="Попереднє"><i class="fas fa-chevron-left"></i></button>
                 <button class="gal-btn next" type="button" aria-label="Наступне"><i class="fas fa-chevron-right"></i></button>` : ''}
      <span class="gal-counter" id="gal-counter"></span>
      <button class="gal-expand" type="button"><i class="fas fa-expand"></i> На весь екран</button>
    </div>
    ${multi ? `<div class="gallery-thumbs" id="gal-thumbs">${imgs.map((n, k) =>
      `<button type="button" data-k="${k}" aria-label="Фото ${k + 1}"><img src="${photoUrl(n)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;

  const stage = $('gal-stage');
  const openViewer = () => Lightbox.open(galImgs.map(photoUrl), galIdx, p.title);
  stage.addEventListener('click', e => {
    if (e.target.closest('.gal-btn')) return;
    openViewer();
  });
  stage.querySelector('.prev')?.addEventListener('click', () => setGal(galIdx - 1));
  stage.querySelector('.next')?.addEventListener('click', () => setGal(galIdx + 1));
  $('gal-thumbs')?.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) setGal(+b.dataset.k); });

  let tx = null;
  stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) setGal(galIdx + (dx < 0 ? 1 : -1));
  }, { passive: true });

  setGal(0);
}

function setGal(i) {
  if (!galImgs.length) return;
  galIdx = (i + galImgs.length) % galImgs.length;
  const img = $('gal-img');
  if (img) img.src = photoUrl(galImgs[galIdx]);
  const c = $('gal-counter');
  if (c) c.textContent = `${galIdx + 1} / ${galImgs.length}`;
  document.querySelectorAll('#gal-thumbs button').forEach((b, k) => b.classList.toggle('active', k === galIdx));
  $('gal-thumbs')?.querySelector('button.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ← → switch photos while the detail window is open (but not while typing or while the full-screen viewer is open)
document.addEventListener('keydown', e => {
  if (!$('detail-modal').classList.contains('open') || Lightbox.isOpen()) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')  setGal(galIdx - 1);
  if (e.key === 'ArrowRight') setGal(galIdx + 1);
});

async function quickStatus() {
  if (!detailProp) return;
  const status = $('detail-status-sel').value;
  try {
    await api.patch('/properties/' + detailProp.id + '/status', { status });
    detailProp.status = status;
    $('detail-badges').innerHTML = typeBadge(detailProp.type) + ' ' + statusBadge(status);
    toast('Статус оновлено', 'success');
    loadProperties();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Delete ───────────────────────────────────────────────────────────────────
function openDelete(id) {
  deleteId = id;
  const item = lastData.find(p => p.id === id) || (detailProp && detailProp.id === id ? detailProp : null);
  $('delete-name').textContent = item ? `«${item.title}»` : 'цей об\'єкт';
  $('delete-modal').classList.add('open');
}
function closeDeleteModal() {
  $('delete-modal').classList.remove('open');
  deleteId = null;
}

$('confirm-delete-btn').onclick = async () => {
  if (!deleteId) return;
  const btn = $('confirm-delete-btn');
  btn.disabled = true;
  try {
    await api.del('/properties/' + deleteId);
    closeDeleteModal();
    closeDetail();
    toast("Об'єкт видалено", 'success');
    loadProperties();
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
};

// ── CSV export (all objects that match the current filters, not just this page) ──
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                 // keep spreadsheets from running text as formulas
  return `"${s.replace(/"/g, '""')}"`;
}

async function exportCSV() {
  if (!lastTotal) { toast('Немає даних для експорту', 'warning'); return; }
  try {
    const q = filterParams();
    q.set('page', 1); q.set('limit', 2000);
    const { properties } = await api.get('/properties?' + q.toString());
    const headers = ['ID', 'Тип', 'Назва', 'Ціна (USD)', 'Площа (м²)', 'Місто', 'Район', 'Адреса', 'Статус', 'Кімнат', 'Поверх', 'Поверховість', 'Агент', 'Дата'];
    const rows = properties.map(p => [
      p.id, TYPE_LABELS[p.type] || p.type, p.title, p.price, p.area || '', p.city || '', p.district || '',
      p.address || '', STATUS_LABELS[p.status] || p.status, p.rooms || '', p.floor || '', p.floors || '',
      p.agent_name || '', fmtDate(p.created_at),
    ].map(csvCell).join(';'));
    const csv  = '﻿' + [headers.map(csvCell).join(';'), ...rows].join('\r\n');   // ; separator + BOM: opens correctly in Excel (UA/RU locale)
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a    = Object.assign(document.createElement('a'), { href: url, download: `dim-realty-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`CSV завантажено (${properties.length} об'єктів)`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── Start ────────────────────────────────────────────────────────────────────
// Deep link from the dashboard: properties.html?open=ID (read before the URL gets rewritten)
const openId = parseInt(new URLSearchParams(location.search).get('open')) || 0;
readUrl();
setView(currentView, false);
loadProperties();
if (openId) openDetail(openId);
