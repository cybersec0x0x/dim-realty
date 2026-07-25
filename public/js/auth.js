function requireAuth() {
  if (!localStorage.getItem('dr_token')) { location.href = '/'; return null; }
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('dr_user')); } catch { return null; }
}

function logout() {
  localStorage.removeItem('dr_token');
  localStorage.removeItem('dr_user');
  location.href = '/';
}

function renderSidebarUser() {
  const user = getUser();
  if (!user) return;
  const el = document.getElementById('sidebar-user-name');
  const rl = document.getElementById('sidebar-user-role');
  const av = document.getElementById('sidebar-avatar');
  if (el) el.textContent = user.name;
  if (rl) rl.textContent = user.role === 'admin' ? 'Адміністратор' : 'Агент';
  if (av) {
    if (user.avatar) {
      av.innerHTML = `<img src="/uploads/${user.avatar}" alt="">`;
    } else {
      av.textContent = user.name.charAt(0).toUpperCase();
    }
  }
  // Hide admin-only elements if not admin
  if (user.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  // Make sidebar user block clickable → profile edit
  const sidebarUser = document.querySelector('.sidebar-user');
  if (sidebarUser) {
    sidebarUser.style.cursor = 'pointer';
    sidebarUser.title = 'Редагувати профіль';
    sidebarUser.addEventListener('click', e => {
      if (e.target.closest('.sidebar-logout')) return; // don't open on logout click
      openProfileModal();
    });
  }
  // Inject profile modal once
  if (!document.getElementById('profile-modal')) {
    const m = document.createElement('div');
    m.id = 'profile-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <span class="modal-title"><i class="fas fa-user-edit" style="color:var(--gold);margin-right:8px"></i>Мій профіль</span>
          <button class="modal-close" onclick="document.getElementById('profile-modal').classList.remove('open')">×</button>
        </div>
        <div class="modal-body">
          <form id="profile-form" onsubmit="saveProfile(event)">
            <div class="form-grid" style="gap:16px">
              <div class="form-group full">
                <label class="form-label">Повне ім'я *</label>
                <input class="form-control" id="prof-name" required placeholder="Іван Іваненко">
              </div>
              <div class="form-group full">
                <label class="form-label">Телефон</label>
                <input class="form-control" id="prof-phone" type="tel" placeholder="+380 XX XXX XX XX">
              </div>
              <div class="form-group full" style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
                <label class="form-label">Новий пароль</label>
                <input class="form-control" id="prof-password" type="password" placeholder="Залиште порожнім — не зміниться">
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('profile-modal').classList.remove('open')">Скасувати</button>
          <button class="btn btn-primary" id="prof-save-btn" onclick="document.getElementById('profile-form').requestSubmit()">
            <i class="fas fa-save"></i> Зберегти
          </button>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
}

function openProfileModal() {
  const user = getUser();
  if (!user) return;
  document.getElementById('prof-name').value     = user.name  || '';
  document.getElementById('prof-phone').value    = user.phone || '';
  document.getElementById('prof-password').value = '';
  document.getElementById('profile-modal').classList.add('open');
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('prof-save-btn');
  btn.disabled = true;
  const body = {
    name:     document.getElementById('prof-name').value,
    phone:    document.getElementById('prof-phone').value,
    password: document.getElementById('prof-password').value || undefined,
  };
  try {
    await api.put('/auth/me', body);
    // Update local user cache
    const user = getUser();
    if (user) {
      user.name  = body.name;
      user.phone = body.phone;
      localStorage.setItem('dr_user', JSON.stringify(user));
    }
    document.getElementById('profile-modal').classList.remove('open');
    // Refresh sidebar name
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = body.name;
    const avEl = document.getElementById('sidebar-avatar');
    if (avEl && !user?.avatar) avEl.textContent = body.name.charAt(0).toUpperCase();
    toast('Профіль оновлено', 'success');
  } catch(ex) {
    toast(ex.message || 'Помилка збереження', 'error');
  } finally {
    btn.disabled = false;
  }
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// Formatted price
function fmtPrice(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtArea(n, type) {
  if (!n) return '—';
  if (type === 'land') {
    const hectares = (n / 10000).toFixed(2);
    const sotky = Math.round(n / 100);
    return `${n} м² (${sotky} соток) / ${hectares} га`;
  }
  return `${n} м²`;
}

// Property type labels
const TYPE_LABELS = { apartment: 'Квартира', house: 'Будинок', land: 'Ділянка' };
const STATUS_LABELS = { available: 'Доступний', sold: 'Продано', reserved: 'Зарезервовано' };
const ROLE_LABELS = { admin: 'Адміністратор', agent: 'Агент' };

function typeBadge(type) {
  return `<span class="badge badge-${type}">${TYPE_LABELS[type] || type}</span>`;
}
function statusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

// Toast system
const toastContainer = (() => {
  const d = document.createElement('div');
  d.className = 'toast-container';
  document.body.appendChild(d);
  return d;
})();

function toast(msg, type = 'success') {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Confirm modal
function confirm(msg, title = 'Підтвердження') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); resolve(false)">×</button>
        </div>
        <div class="modal-body"><p style="color:var(--text-2)">${msg}</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="conf-no">Скасувати</button>
          <button class="btn btn-danger" id="conf-yes">Видалити</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#conf-no').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#conf-yes').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// Format date
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Sidebar mobile toggle
function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}
