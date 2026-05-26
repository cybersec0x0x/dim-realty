requireAuth();
renderSidebarUser();
initSidebar();

const pid = new URLSearchParams(location.search).get('id');
const isEdit = !!pid;
let existingImages = [];
let newFiles = [];

if (isEdit) {
  document.getElementById('form-title').textContent = 'Редагування об\'єкта';
  document.getElementById('submit-btn').innerHTML = '<i class="fas fa-save"></i> Зберегти зміни';
  loadProperty();
}

async function loadProperty() {
  try {
    const p = await api.get('/properties/' + pid);
    const form = document.getElementById('property-form');
    form.querySelector('[name=type]').value = p.type;
    form.querySelector('[name=status]').value = p.status;
    form.querySelector('[name=title]').value = p.title || '';
    form.querySelector('[name=price]').value = p.price || '';
    form.querySelector('[name=area]').value = p.area || '';
    form.querySelector('[name=city]').value = p.city || '';
    form.querySelector('[name=district]').value = p.district || '';
    form.querySelector('[name=address]').value = p.address || '';
    form.querySelector('[name=description]').value = p.description || '';
    onTypeChange();
    if (p.rooms) form.querySelector('[name=rooms]') && (form.querySelector('[name=rooms]').value = p.rooms);
    if (p.floors) form.querySelector('[name=floors]') && (form.querySelector('[name=floors]').value = p.floors);
    if (p.floor) form.querySelector('[name=floor]') && (form.querySelector('[name=floor]').value = p.floor);

    existingImages = JSON.parse(p.images || '[]');
    renderExistingImages();
  } catch(e) {
    toast('Помилка завантаження: ' + e.message, 'error');
  }
}

function renderExistingImages() {
  const container = document.getElementById('existing-images');
  if (!existingImages.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div style="margin-top:12px;font-size:12px;color:var(--muted);margin-bottom:8px">Збережені фото:</div>
    <div class="img-previews">${existingImages.map(img => `
      <div class="img-preview-item">
        <img src="/uploads/${img}" alt="">
        <button class="img-remove" onclick="removeExisting('${img}')" type="button">×</button>
      </div>`).join('')}</div>`;
}

function removeExisting(img) {
  existingImages = existingImages.filter(i => i !== img);
  renderExistingImages();
}

function onTypeChange() {
  const type = document.getElementById('prop-type').value;
  const block = document.getElementById('details-block');
  const fields = document.getElementById('details-fields');
  if (!type || type === 'land') { block.style.display = 'none'; return; }
  block.style.display = 'block';
  if (type === 'apartment') {
    fields.innerHTML = `
      <div class="form-group">
        <label class="form-label">Кількість кімнат</label>
        <input class="form-control" name="rooms" type="number" min="1" max="20" placeholder="3">
      </div>
      <div class="form-group">
        <label class="form-label">Поверх</label>
        <input class="form-control" name="floor" type="number" min="1" placeholder="5">
      </div>
      <div class="form-group">
        <label class="form-label">Поверховість будинку</label>
        <input class="form-control" name="floors" type="number" min="1" placeholder="12">
      </div>`;
  } else if (type === 'house') {
    fields.innerHTML = `
      <div class="form-group">
        <label class="form-label">Кількість кімнат</label>
        <input class="form-control" name="rooms" type="number" min="1" max="50" placeholder="5">
      </div>
      <div class="form-group">
        <label class="form-label">Кількість поверхів</label>
        <input class="form-control" name="floors" type="number" min="1" max="10" placeholder="2">
      </div>`;
  }
  // Re-populate if editing
  if (isEdit && pid) {
    const form = document.getElementById('property-form');
    ['rooms','floors','floor'].forEach(n => {
      const el = form.querySelector(`[name=${n}]`);
      if (el && el._savedVal) el.value = el._savedVal;
    });
  }
}

function handleImages(input) {
  newFiles = Array.from(input.files);
  const preview = document.getElementById('img-previews');
  preview.innerHTML = newFiles.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div class="img-preview-item">
      <img src="${url}" alt="">
      <button class="img-remove" type="button" onclick="removeNew(${i})">×</button>
    </div>`;
  }).join('');
}

function removeNew(idx) {
  newFiles.splice(idx, 1);
  const dt = new DataTransfer();
  newFiles.forEach(f => dt.items.add(f));
  document.getElementById('img-input').files = dt.files;
  handleImages(document.getElementById('img-input'));
}

// Drag & drop
const area = document.getElementById('upload-area');
area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
area.addEventListener('drop', e => {
  e.preventDefault();
  area.style.borderColor = '';
  document.getElementById('img-input').files = e.dataTransfer.files;
  handleImages(document.getElementById('img-input'));
});

async function submitForm(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Збереження...';

  const form = e.target;
  const fd = new FormData();
  const fields = ['type','status','title','price','area','city','district','address','description','rooms','floors','floor'];
  fields.forEach(f => { const el = form.querySelector(`[name=${f}]`); if (el && el.value) fd.append(f, el.value); });

  // Existing images to keep
  existingImages.forEach(img => fd.append('keepImages', img));
  // New files
  newFiles.forEach(f => fd.append('images', f));

  try {
    if (isEdit) {
      await api.upd('/properties/' + pid, fd);
      toast("Об'єкт успішно оновлено", 'success');
    } else {
      await api.upload('/properties', fd);
      toast("Об'єкт успішно створено", 'success');
    }
    setTimeout(() => location.href = 'properties.html', 1000);
  } catch(ex) {
    toast(ex.message, 'error');
    btn.disabled = false;
    btn.innerHTML = isEdit ? '<i class="fas fa-save"></i> Зберегти зміни' : '<i class="fas fa-save"></i> Зберегти об\'єкт';
  }
}
