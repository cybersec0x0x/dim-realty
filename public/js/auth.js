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

function fmtArea(n) { return n ? `${n} м²` : '—'; }

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
