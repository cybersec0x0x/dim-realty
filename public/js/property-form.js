requireAuth();
renderSidebarUser();
initSidebar();

const $ = id => document.getElementById(id);
const pid = new URLSearchParams(location.search).get('id');
const isEdit = !!pid;
const MAX_PHOTOS = 20;
const MAX_FILE_MB = 15;

// All photos of the object in display order. The first one is the main photo.
//   { kind: 'old', name }            — already stored on the server
//   { kind: 'new', file, url }       — chosen now, uploaded on save (url = local preview)
let photos = [];
let dirty = false;
let saving = false;

if (isEdit) {
  $('form-title').textContent = "Редагування об'єкта";
  $('submit-btn').innerHTML = '<i class="fas fa-save"></i> Зберегти зміни';
  loadProperty();
}

function markDirty() {
  dirty = true;
  $('dirty-hint').textContent = 'Є незбережені зміни';
}
$('property-form').addEventListener('input', markDirty);
window.addEventListener('beforeunload', e => { if (dirty && !saving) { e.preventDefault(); e.returnValue = ''; } });

async function loadProperty() {
  try {
    const p = await api.get('/properties/' + pid);
    const form = $('property-form');
    const set = (name, val) => { const el = form.querySelector(`[name=${name}]`); if (el && val !== null && val !== undefined) el.value = val; };
    set('type', p.type); set('status', p.status); set('title', p.title); set('price', p.price);
    set('area', p.area); set('city', p.city); set('district', p.district); set('address', p.address);
    set('description', p.description); set('owner_phone', p.owner_phone);
    document.title = `Dim Realty — ${p.title}`;
    onTypeChange();
    if (p.rooms) setRooms(p.rooms);
    set('floors', p.floors); set('floor', p.floor); set('house_type', p.house_type);
    photos = parseImages(p.images).map(name => ({ kind: 'old', name }));
    renderPhotos();
    dirty = false; $('dirty-hint').textContent = '';
  } catch (e) {
    toast('Помилка завантаження: ' + e.message, 'error');
  }
}

// ── Type-specific fields ─────────────────────────────────────────────────────
function roomButtons(max) {
  return Array.from({ length: max }, (_, i) => i + 1)
    .map(n => `<button type="button" class="room-btn" data-val="${n}" onclick="setRooms(${n})">${n === max ? n + '+' : n}</button>`).join('');
}

function onTypeChange() {
  const type = $('prop-type').value;
  const block = $('details-block');
  const fields = $('details-fields');
  updateAreaHint();
  if (!type || type === 'land') { block.style.display = 'none'; fields.innerHTML = ''; return; }
  block.style.display = 'block';

  if (type === 'apartment') {
    fields.innerHTML = `
      <div class="form-group full">
        <label class="form-label">Кількість кімнат</label>
        <div class="rooms-selector" id="rooms-selector">${roomButtons(5)}</div>
        <input type="hidden" name="rooms" id="rooms-val">
      </div>
      <div class="form-group">
        <label class="form-label">Поверх</label>
        <input class="form-control" name="floor" type="number" min="1" inputmode="numeric" placeholder="5">
      </div>
      <div class="form-group">
        <label class="form-label">Поверховість будинку</label>
        <input class="form-control" name="floors" type="number" min="1" inputmode="numeric" placeholder="12">
      </div>`;
  } else if (type === 'house') {
    fields.innerHTML = `
      <div class="form-group full">
        <label class="form-label">Вид будинку</label>
        <select class="form-control" name="house_type">
          <option value="">— Оберіть вид —</option>
          <option value="private">🏠 Приватний будинок</option>
          <option value="duplex">🏘 Дюплекс</option>
          <option value="townhouse">🏙 Таунхаус</option>
          <option value="part">🏠 Частина будинку</option>
        </select>
      </div>
      <div class="form-group full">
        <label class="form-label">Кількість кімнат</label>
        <div class="rooms-selector" id="rooms-selector">${roomButtons(6)}</div>
        <input type="hidden" name="rooms" id="rooms-val">
      </div>
      <div class="form-group">
        <label class="form-label">Кількість поверхів</label>
        <input class="form-control" name="floors" type="number" min="1" max="10" inputmode="numeric" placeholder="2">
      </div>`;
  }
}

function setRooms(val) {
  const hidden = $('rooms-val');
  if (hidden) hidden.value = val;
  document.querySelectorAll('.room-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.val === +val));
  markDirty();
}

// For land: show the area in sotky and hectares while typing
function updateAreaHint() {
  const type = $('prop-type').value;
  const hint = $('area-hint');
  const a = +$('prop-area').value;
  if (type === 'land' && a > 0) {
    hint.style.display = '';
    hint.textContent = `= ${Math.round(a / 100 * 10) / 10} соток = ${(a / 10000).toFixed(2)} га`;
  } else {
    hint.style.display = 'none';
  }
}
$('prop-area').addEventListener('input', updateAreaHint);

// ── Photos ───────────────────────────────────────────────────────────────────
const grid = $('photo-grid');
const area = $('upload-area');
const input = $('img-input');

function srcOf(p) { return p.kind === 'old' ? photoUrl(p.name) : p.url; }

function renderPhotos() {
  const n = photos.length;
  $('photo-toolbar').style.display = n ? 'flex' : 'none';
  $('photo-hint').style.display = n ? '' : 'none';
  $('photo-count').innerHTML = `<b>${n}</b> з ${MAX_PHOTOS} фото`;
  grid.innerHTML = photos.map((p, i) => `
    <div class="photo-tile${i === 0 ? ' main' : ''}" draggable="true" data-i="${i}" title="Переглянути на весь екран">
      <img src="${esc(srcOf(p))}" alt="Фото ${i + 1}">
      ${p.kind === 'new' ? '<span class="tile-new">нове</span>' : ''}
      ${i === 0 ? '<span class="tile-ribbon"><i class="fas fa-star"></i> Головне</span>' : ''}
      <div class="tile-actions">
        ${i !== 0 ? '<button type="button" class="tile-btn" data-act="main" title="Зробити головним"><i class="fas fa-star"></i></button>' : ''}
        <button type="button" class="tile-btn del" data-act="del" title="Видалити фото"><i class="fas fa-times"></i></button>
      </div>
    </div>`).join('');
}

function setMain(i) {
  const [p] = photos.splice(i, 1);
  photos.unshift(p);
  markDirty(); renderPhotos();
}

function removePhoto(i) {
  const [p] = photos.splice(i, 1);
  if (p.kind === 'new') URL.revokeObjectURL(p.url);
  markDirty(); renderPhotos();
}

grid.addEventListener('click', e => {
  const tile = e.target.closest('.photo-tile');
  if (!tile) return;
  const i = +tile.dataset.i;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'main') return setMain(i);
  if (act === 'del')  return removePhoto(i);
  Lightbox.open(photos.map(srcOf), i, $('prop-title').value || '');
});

$('photo-clear').onclick = () => {
  if (!photos.length) return;
  photos.forEach(p => { if (p.kind === 'new') URL.revokeObjectURL(p.url); });
  photos = [];
  markDirty(); renderPhotos();
};

// Drag to reorder
let dragFrom = null;
grid.addEventListener('dragstart', e => {
  const t = e.target.closest('.photo-tile'); if (!t) return;
  dragFrom = +t.dataset.i;
  t.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));      // required by Firefox
});
grid.addEventListener('dragover', e => {
  if (dragFrom === null) return;                                // a file drag from the desktop is handled by the upload area
  e.preventDefault();
  grid.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  e.target.closest('.photo-tile')?.classList.add('over');
});
grid.addEventListener('drop', e => {
  if (dragFrom === null) return;
  e.preventDefault();
  const to = e.target.closest('.photo-tile');
  const from = dragFrom; dragFrom = null;
  if (!to) return renderPhotos();
  const toI = +to.dataset.i;
  if (toI !== from) {
    const [p] = photos.splice(from, 1);
    photos.splice(toI, 0, p);
    markDirty();
  }
  renderPhotos();
});
grid.addEventListener('dragend', () => { dragFrom = null; renderPhotos(); });

// Adding files: can be done several times, files are appended
function addFiles(fileList) {
  let skipped = 0, tooBig = 0, notImg = 0;
  for (const f of Array.from(fileList)) {
    if (!f.type.startsWith('image/')) { notImg++; continue; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) { tooBig++; continue; }
    if (photos.some(p => p.kind === 'new' && p.file.name === f.name && p.file.size === f.size && p.file.lastModified === f.lastModified)) continue;   // same file twice
    if (photos.length >= MAX_PHOTOS) { skipped++; continue; }
    photos.push({ kind: 'new', file: f, url: URL.createObjectURL(f) });
  }
  if (notImg)  toast(`${notImg} файл(ів) пропущено: це не зображення`, 'warning');
  if (tooBig)  toast(`${tooBig} фото пропущено: більше ${MAX_FILE_MB} МБ`, 'warning');
  if (skipped) toast(`Максимум ${MAX_PHOTOS} фото на об'єкт — ${skipped} не додано`, 'warning');
  markDirty(); renderPhotos();
}

area.addEventListener('click', () => input.click());
area.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });          // reset so the same file can be picked again
area.addEventListener('dragover', e => { if (dragFrom !== null) return; e.preventDefault(); area.classList.add('drag'); });
area.addEventListener('dragleave', () => area.classList.remove('drag'));
area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('drag'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
// Dropping a file next to the zone must not make the browser navigate to it
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }));

// ── Save (XHR so a progress % can be shown for big uploads) ──────────────────
function sendForm(method, url, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, '/api' + url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('dr_token'));
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error('Немає звʼязку з сервером. Перевірте інтернет і спробуйте ще раз.'));
    xhr.onload = () => {
      if (xhr.status === 401) { localStorage.clear(); location.href = '/'; return; }
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Помилка збереження'));
    };
    xhr.send(fd);
  });
}

async function submitForm(e) {
  e.preventDefault();
  if (saving) return;
  const btn = $('submit-btn');
  const form = e.target;
  const label = isEdit ? '<i class="fas fa-save"></i> Зберегти зміни' : '<i class="fas fa-save"></i> Зберегти об\'єкт';

  if (!$('prop-type').value) { toast('Оберіть тип об\'єкта', 'warning'); $('prop-type').focus(); return; }

  saving = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Збереження...';

  const fd = new FormData();
  ['type', 'status', 'title', 'price', 'area', 'city', 'district', 'address', 'description', 'rooms', 'floors', 'floor', 'owner_phone', 'house_type']
    .forEach(f => { const el = form.querySelector(`[name=${f}]`); if (el && el.value) fd.append(f, el.value); });

  // Photos in the chosen order: stored ones by name, new ones as "#<n>" (n-th uploaded file)
  const order = []; let n = 0, uploads = 0;
  photos.forEach(p => {
    if (p.kind === 'old') order.push(p.name);
    else { fd.append('images', p.file); order.push('#' + n++); uploads++; }
  });
  fd.append('imageOrder', JSON.stringify(order));

  try {
    const res = await sendForm(isEdit ? 'PUT' : 'POST', isEdit ? '/properties/' + pid : '/properties', fd, pct => {
      if (uploads) btn.innerHTML = pct < 100
        ? `<i class="fas fa-spinner fa-spin"></i> Завантаження фото… ${pct}%`
        : '<i class="fas fa-spinner fa-spin"></i> Обробка фото…';
    });
    dirty = false;
    toast(isEdit ? "Об'єкт оновлено" : "Об'єкт створено", 'success');
    const id = isEdit ? pid : res.id;
    setTimeout(() => location.href = id ? `properties.html?open=${id}` : 'properties.html', 700);   // open the saved object so the photos can be checked right away
  } catch (ex) {
    saving = false;
    toast(ex.message, 'error');
    btn.disabled = false;
    btn.innerHTML = label;
  }
}
