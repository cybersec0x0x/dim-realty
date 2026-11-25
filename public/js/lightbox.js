// Full-screen photo viewer.
//   Lightbox.open(urls, startIndex, 'optional title')
// ← → / swipe / thumbnails to browse, click the photo to zoom, Esc or click outside to close.
const Lightbox = (() => {
  let root, stage, img, counter, titleEl, thumbs, dl, hint;
  let items = [], idx = 0, lastFocus = null, touchX = null;

  function build() {
    root = document.createElement('div');
    root.className = 'lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Перегляд фото');
    root.innerHTML = `
      <div class="lb-top">
        <div class="lb-counter"></div>
        <div class="lb-title"></div>
        <div class="lb-tools">
          <a class="lb-btn lb-dl" title="Завантажити фото" download><i class="fas fa-download"></i></a>
          <button class="lb-btn lb-close" type="button" title="Закрити (Esc)"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="lb-stage">
        <button class="lb-btn lb-nav prev" type="button" title="Попереднє (←)"><i class="fas fa-chevron-left"></i></button>
        <img alt="">
        <button class="lb-btn lb-nav next" type="button" title="Наступне (→)"><i class="fas fa-chevron-right"></i></button>
        <div class="lb-hint">Клік по фото — збільшити · ← → — гортати</div>
      </div>
      <div class="lb-thumbs"></div>`;
    document.body.appendChild(root);

    stage   = root.querySelector('.lb-stage');
    img     = root.querySelector('.lb-stage img');
    counter = root.querySelector('.lb-counter');
    titleEl = root.querySelector('.lb-title');
    thumbs  = root.querySelector('.lb-thumbs');
    dl      = root.querySelector('.lb-dl');
    hint    = root.querySelector('.lb-hint');

    root.querySelector('.lb-close').onclick = close;
    root.querySelector('.prev').onclick = e => { e.stopPropagation(); go(-1); };
    root.querySelector('.next').onclick = e => { e.stopPropagation(); go(1); };
    img.onclick = e => { e.stopPropagation(); toggleZoom(); };
    stage.addEventListener('click', e => { if (e.target === stage) close(); });   // click on the dark area
    img.addEventListener('error', () => { img.alt = 'Не вдалося завантажити фото'; });

    // Swipe on touch screens
    stage.addEventListener('touchstart', e => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (touchX === null || stage.classList.contains('zoomed')) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (!root || !root.classList.contains('open')) return;
    if (e.key === 'Escape')      { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Home')   { e.preventDefault(); show(0); }
    else if (e.key === 'End')    { e.preventDefault(); show(items.length - 1); }
    else if (e.key === ' ' || e.key === 'Enter') { if (e.target === img || e.target === document.body) { e.preventDefault(); toggleZoom(); } }
  }

  function toggleZoom(force) {
    const on = force === undefined ? !stage.classList.contains('zoomed') : force;
    stage.classList.toggle('zoomed', on);
    if (on) {
      requestAnimationFrame(() => {
        stage.scrollLeft = Math.max(0, (img.offsetWidth  - stage.clientWidth)  / 2);
        stage.scrollTop  = Math.max(0, (img.offsetHeight - stage.clientHeight) / 2);
      });
    }
  }

  function go(d) { if (items.length > 1) show((idx + d + items.length) % items.length); }

  function show(i) {
    idx = Math.max(0, Math.min(items.length - 1, i));
    toggleZoom(false);
    img.alt = '';
    img.src = items[idx];
    dl.href = items[idx];
    counter.textContent = `${idx + 1} / ${items.length}`;
    const multi = items.length > 1;
    root.querySelectorAll('.lb-nav').forEach(b => b.style.display = multi ? '' : 'none');
    thumbs.style.display = multi ? '' : 'none';
    thumbs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('active', k === idx));
    thumbs.querySelector('button.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    // Preload neighbours so browsing feels instant
    [idx + 1, idx - 1].forEach(k => { if (items[k]) new Image().src = items[k]; });
  }

  function open(urls, start = 0, title = '') {
    if (!urls || !urls.length) return;
    if (!root) build();
    items = urls.slice();
    titleEl.textContent = title || '';
    thumbs.innerHTML = items.map((u, k) =>
      `<button type="button" data-k="${k}" aria-label="Фото ${k + 1}"><img src="${u.replace(/"/g, '&quot;')}" alt="" loading="lazy"></button>`).join('');
    thumbs.onclick = e => { const b = e.target.closest('button[data-k]'); if (b) show(+b.dataset.k); };
    lastFocus = document.activeElement;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    hint.style.display = '';
    setTimeout(() => { hint.style.display = 'none'; }, 3500);
    show(start);
  }

  function close() {
    if (!root) return;
    root.classList.remove('open');
    stage.classList.remove('zoomed');
    img.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch {} }
  }

  return { open, close, isOpen: () => !!root && root.classList.contains('open') };
})();
